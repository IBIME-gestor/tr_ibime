import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Routes, Students } from './services';

/**
 * COLECCIONES PÚBLICAS (sin login) — solo lo mínimo para que un padre de
 * familia pueda dar seguimiento sin exponer el resto de la base de datos.
 *
 * publicStudentIndex/{matricula}
 *    studentId, name, routeId          // se escribe/actualiza al crear o
 *                                       // editar un alumno (ver services.js)
 *
 * publicTracking/{tripId}
 *    routeId, shift, date, status
 *    liveLocation { lat, lng, updatedAt }   // posición actual del camión
 *    avgStopMinutes: [ ... ]                // minutos promedio históricos
 *                                            // entre parada y parada (misma
 *                                            // ruta/turno), copiados de
 *                                            // routes/{routeId} al vuelo
 *    stops: [ { matricula, name, order, status, resolvedAt } ]
 */

/**
 * MODELO DE DATOS
 * ----------------
 * trips/{tripId}
 *    routeId, schoolId, driverId, unitId, date ('YYYY-MM-DD'), shift ('morning'|'afternoon')
 *    status: 'in_progress' | 'completed'
 *    startedAt, completedAt
 *    bulkEventAt, bulkEventLocation   // el clic de "Llegamos al colegio" / "Todos abordaron"
 *
 * trips/{tripId}/stops/{studentId}
 *    studentId, matricula, name, order, addedManually
 *    status: 'pending' | 'boarded' | 'delivered' | 'absent'
 *    boardedAt, boardedLocation, boardedMethod   ('manual' | 'bulk')
 *    deliveredAt, deliveredLocation, deliveredMethod ('manual' | 'bulk')
 *
 * En el turno de la MAÑANA:  boarded = se sube en su domicilio (manual, uno por uno)
 *                             delivered = llega al plantel (bulk, un botón para todos)
 * En el turno de la TARDE:   boarded = sube al camión en el plantel (bulk, un botón para todos)
 *                             delivered = baja en su domicilio (manual, uno por uno)
 */

const todayId = (date) => date; // 'YYYY-MM-DD'

function tripDocId(routeId, date, shift) {
  return `${routeId}_${date}_${shift}`;
}

export function todayString() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/**
 * Obtiene el recorrido de hoy para una ruta/turno, o lo crea si no existe,
 * poblando las paradas en el orden guardado del día anterior (o alfabético
 * si es la primera vez).
 */
export async function getOrCreateTodayTrip(route, shift, driverUid) {
  const date = todayString();
  const id = tripDocId(route.id, date, shift);
  const tripRef = doc(db, 'trips', id);
  const existing = await getDoc(tripRef);

  if (existing.exists()) {
    return { id: tripRef.id, ...existing.data() };
  }

  const students = await Students.listByRoute(route.id);
  const savedOrder =
    shift === 'morning' ? route.studentOrderMorning : route.studentOrderAfternoon;

  const ordered = orderStudents(students, savedOrder);

  const tripData = {
    routeId: route.id,
    schoolId: route.schoolId,
    driverId: driverUid,
    unitId: route.unitId,
    date,
    shift,
    status: 'in_progress',
    startedAt: serverTimestamp(),
  };
  await setDoc(tripRef, tripData);

  const batch = writeBatch(db);
  ordered.forEach((student, index) => {
    const stopRef = doc(db, 'trips', id, 'stops', student.id);
    batch.set(stopRef, {
      studentId: student.id,
      matricula: student.matricula,
      name: student.name,
      order: index,
      addedManually: false,
      status: 'pending',
    });
  });
  await batch.commit();

  return { id: tripRef.id, ...tripData };
}

function orderStudents(students, savedOrder = []) {
  if (!savedOrder || savedOrder.length === 0) {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }
  const byId = new Map(students.map((s) => [s.id, s]));
  const ordered = [];
  savedOrder.forEach((id) => {
    if (byId.has(id)) {
      ordered.push(byId.get(id));
      byId.delete(id);
    }
  });
  // alumnos nuevos que no estaban en el orden guardado van al final
  const rest = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return [...ordered, ...rest];
}

export function subscribeTripStops(tripId, callback) {
  const stopsRef = collection(db, 'trips', tripId, 'stops');
  const q = query(stopsRef, orderBy('order'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getTrip(tripId) {
  const snap = await getDoc(doc(db, 'trips', tripId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Marca a UN alumno como abordado (mañana: lo recogieron en su domicilio)
 * o como entregado (tarde: bajó del camión), guardando hora + ubicación.
 */
export async function markStopManual(tripId, studentId, field, location) {
  const stopRef = doc(db, 'trips', tripId, 'stops', studentId);
  const timeField = field === 'boarded' ? 'boardedAt' : 'deliveredAt';
  const locField = field === 'boarded' ? 'boardedLocation' : 'deliveredLocation';
  const methodField = field === 'boarded' ? 'boardedMethod' : 'deliveredMethod';
  await updateDoc(stopRef, {
    status: field === 'boarded' ? 'boarded' : 'delivered',
    [timeField]: serverTimestamp(),
    [locField]: location || null,
    [methodField]: 'manual',
  });
}

export async function markStopAbsent(tripId, studentId) {
  const stopRef = doc(db, 'trips', tripId, 'stops', studentId);
  await updateDoc(stopRef, { status: 'absent' });
}

/**
 * Acción masiva: "Llegamos al colegio" (mañana) o "Todos abordaron" (tarde).
 * Aplica hora + ubicación a TODOS los alumnos que siguen activos en la ruta.
 */
export async function markAllBulk(tripId, field, location, stops) {
  const batch = writeBatch(db);
  const timeField = field === 'boarded' ? 'boardedAt' : 'deliveredAt';
  const locField = field === 'boarded' ? 'boardedLocation' : 'deliveredLocation';
  const methodField = field === 'boarded' ? 'boardedMethod' : 'deliveredMethod';
  const eligible = stops.filter((s) => s.status !== 'absent');

  eligible.forEach((stop) => {
    const stopRef = doc(db, 'trips', tripId, 'stops', stop.id);
    batch.update(stopRef, {
      status: field === 'boarded' ? 'boarded' : 'delivered',
      [timeField]: serverTimestamp(),
      [locField]: location || null,
      [methodField]: 'bulk',
    });
  });

  const tripRef = doc(db, 'trips', tripId);
  batch.update(tripRef, {
    bulkEventAt: serverTimestamp(),
    bulkEventLocation: location || null,
  });

  await batch.commit();
}

/** Agrega manualmente a un alumno que no estaba en la lista de la ruta. */
export async function addStudentToTrip(tripId, student, order) {
  const stopRef = doc(db, 'trips', tripId, 'stops', student.id);
  await setDoc(stopRef, {
    studentId: student.id,
    matricula: student.matricula,
    name: student.name,
    order,
    addedManually: true,
    status: 'pending',
  });
}

/* ------------------------------------------------------------------ */
/*  Ubicación en vivo + espejo público (para seguimiento del padre)    */
/* ------------------------------------------------------------------ */

/**
 * Se llama periódicamente (throttleado) mientras el recorrido está activo.
 * Guarda la posición actual tanto en el trip privado como en su espejo
 * público, para que la vista del padre de familia la pueda leer sin login.
 */
export async function updateLiveLocation(tripId, location) {
  if (!location) return;
  const liveLocation = { ...location, updatedAt: serverTimestamp() };
  await updateDoc(doc(db, 'trips', tripId), { liveLocation });
  await setDoc(
    doc(db, 'publicTracking', tripId),
    { liveLocation },
    { merge: true }
  );
}

/**
 * Reescribe el resumen público de paradas (matrícula, nombre, orden,
 * estado) cada vez que el chofer marca a un alumno. Se manda solo lo
 * indispensable para el mapa del padre — nunca el documento completo
 * del alumno ni datos de otras rutas.
 */
export async function syncPublicTracking(trip, stops) {
  const timeKey = trip.shift === 'morning' ? 'boardedAt' : 'deliveredAt';
  const publicStops = stops.map((s) => ({
    matricula: s.matricula,
    name: s.name,
    order: s.order,
    status: s.status,
    resolvedAt: s[timeKey] || null,
  }));

  const route = await Routes.get(trip.routeId);
  const avgStopMinutes =
    (trip.shift === 'morning'
      ? route?.avgStopMinutesMorning
      : route?.avgStopMinutesAfternoon) || [];

  await setDoc(
    doc(db, 'publicTracking', trip.id || trip.tripId),
    {
      routeId: trip.routeId,
      shift: trip.shift,
      date: trip.date,
      status: trip.status,
      avgStopMinutes,
      stops: publicStops,
    },
    { merge: true }
  );
}

/* ------------------------------------------------------------------ */
/*  Promedio histórico de minutos entre parada y parada                */
/* ------------------------------------------------------------------ */

/**
 * Actualiza (con un promedio móvil simple) los minutos típicos que pasan
 * entre que se resuelve una parada y la siguiente, en el orden real del
 * día. Esto es lo que le permite a la vista del padre calcular un ETA
 * aproximado sin necesitar tráfico en vivo ni una API de pago.
 */
async function updateAvgStopMinutes(trip, stops) {
  const timeKey = trip.shift === 'morning' ? 'boardedAt' : 'deliveredAt';
  const finished = stops
    .filter((s) => s.status !== 'absent' && s[timeKey]?.toMillis)
    .sort((a, b) => a.order - b.order);

  if (finished.length < 2) return;

  const deltasByOrder = {};
  for (let i = 1; i < finished.length; i++) {
    const prevMs = finished[i - 1][timeKey].toMillis();
    const curMs = finished[i][timeKey].toMillis();
    const minutes = (curMs - prevMs) / 60000;
    if (minutes > 0 && minutes < 60) {
      // ignora saltos absurdos (ej. chofer corrigió una hora a mano)
      deltasByOrder[finished[i].order] = minutes;
    }
  }

  const route = await Routes.get(trip.routeId);
  const field = trip.shift === 'morning' ? 'avgStopMinutesMorning' : 'avgStopMinutesAfternoon';
  const prevAvg = route?.[field] || [];
  const nextAvg = [...prevAvg];

  Object.entries(deltasByOrder).forEach(([orderStr, minutes]) => {
    const order = Number(orderStr);
    const prev = nextAvg[order];
    // promedio móvil ponderado 70/30: se adapta con el tiempo sin que
    // un solo día atípico (tráfico, imprevisto) distorsione el ETA.
    nextAvg[order] = prev != null ? prev * 0.7 + minutes * 0.3 : minutes;
  });

  await Routes.update(trip.routeId, { [field]: nextAvg });
}

/**
 * Cierra el recorrido y guarda el orden real en la ruta para que
 * mañana la lista del chofer ya venga pre-ordenada.
 */
export async function completeTrip(tripId, trip) {
  const stopsSnap = await getDocs(
    query(collection(db, 'trips', tripId, 'stops'), orderBy('order'))
  );
  const stops = stopsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const timeKey = trip.shift === 'morning' ? 'boardedAt' : 'deliveredAt';
  const finished = stops.filter((s) => s.status !== 'absent' && s[timeKey]);
  finished.sort((a, b) => {
    const ta = a[timeKey]?.toMillis ? a[timeKey].toMillis() : 0;
    const tb = b[timeKey]?.toMillis ? b[timeKey].toMillis() : 0;
    return ta - tb;
  });
  const newOrder = finished.map((s) => s.studentId);

  await Routes.saveOrderFromTrip(trip.routeId, trip.shift, newOrder);
  await updateAvgStopMinutes(trip, stops);
  await updateDoc(doc(db, 'trips', tripId), {
    status: 'completed',
    completedAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'publicTracking', tripId),
    { status: 'completed' },
    { merge: true }
  );
}

/* ------------------------------------------------------------------ */
/*  Recorrido de referencia (chofer asignado a una ruta que no conoce) */
/* ------------------------------------------------------------------ */

/**
 * Trae el recorrido COMPLETADO más reciente de una ruta/turno junto con
 * sus paradas, incluyendo la última ubicación real capturada por alumno
 * (boardedLocation/deliveredLocation) para poder navegar parada por
 * parada en Maps sin haber corrido nunca antes esa ruta.
 */
export async function getReferenceTrip(routeId, shift) {
  const q = query(
    collection(db, 'trips'),
    where('routeId', '==', routeId),
    where('shift', '==', shift),
    where('status', '==', 'completed'),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  const tripDoc = snap.docs[0];
  if (!tripDoc) return null;

  const trip = { id: tripDoc.id, ...tripDoc.data() };
  const stops = await getTripStopsOnce(trip.id);
  const locKey = shift === 'morning' ? 'boardedLocation' : 'deliveredLocation';

  return {
    trip,
    stops: stops
      .filter((s) => s.status !== 'absent')
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s, referenceLocation: s[locKey] || null })),
  };
}

/* ------------------------------------------------------------------ */
/*  Reportes                                                           */
/* ------------------------------------------------------------------ */
export async function listTripsByRoute(routeId) {
  const q = query(
    collection(db, 'trips'),
    where('routeId', '==', routeId),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listTripsByDriver(driverId) {
  const q = query(
    collection(db, 'trips'),
    where('driverId', '==', driverId),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTripStopsOnce(tripId) {
  const snap = await getDocs(
    query(collection(db, 'trips', tripId, 'stops'), orderBy('order'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ------------------------------------------------------------------ */
/*  Lectura pública (sin login) — vista del padre de familia            */
/* ------------------------------------------------------------------ */

/** Ubica en qué ruta va un alumno a partir de su matrícula, sin exponer
 * el resto de su expediente. */
export async function getPublicStudentIndex(matricula) {
  const snap = await getDoc(doc(db, 'publicStudentIndex', matricula.trim()));
  return snap.exists() ? snap.data() : null;
}

/** Se suscribe al espejo público del recorrido de hoy para una ruta/turno. */
export function subscribePublicTracking(routeId, shift, callback) {
  const tripId = tripDocId(routeId, todayString(), shift);
  const ref = doc(db, 'publicTracking', tripId);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}
