import { where, orderBy, doc, setDoc, deleteDoc, collection, collectionGroup, writeBatch, addDoc, getDocs, query, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import {
  listAll,
  subscribeAll,
  getOne,
  createDoc,
  updateDocById,
  removeDoc,
} from './db';

// Firestore acepta hasta 500 operaciones por lote; dejamos margen.
const BATCH_CHUNK_SIZE = 400;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Mantiene publicStudentIndex/{matricula} en sincronía con el alumno.
 * Es lo único que la vista pública del padre de familia puede leer sin
 * iniciar sesión: matrícula -> a qué ruta pertenece. No incluye domicilio,
 * escuela, ni ningún otro dato del expediente.
 */
async function syncPublicStudentIndex(student) {
  if (!student?.matricula || !student?.routeId) return;
  await setDoc(doc(db, 'publicStudentIndex', student.matricula.trim()), {
    studentId: student.id,
    name: student.name || '',
    routeId: student.routeId,
  });
}

/* ------------------------------------------------------------------ */
/*  Planteles (schools)                                                */
/* ------------------------------------------------------------------ */
export const Schools = {
  list: () => listAll('schools', [orderBy('name')]),
  subscribe: (cb) => subscribeAll('schools', [orderBy('name')], cb),
  create: (data) => createDoc('schools', data),
  update: (id, data) => updateDocById('schools', id, data),
  remove: (id) => removeDoc('schools', id),
};

/* ------------------------------------------------------------------ */
/*  Unidades (vehicles)                                                */
/* ------------------------------------------------------------------ */
export const Units = {
  list: () => listAll('units', [orderBy('plate')]),
  subscribe: (cb) => subscribeAll('units', [orderBy('plate')], cb),
  create: (data) => createDoc('units', data),
  update: (id, data) => updateDocById('units', id, data),
  remove: (id) => removeDoc('units', id),
};

/* ------------------------------------------------------------------ */
/*  Choferes / nannies (drivers)                                       */
/* ------------------------------------------------------------------ */
export const Drivers = {
  list: () => listAll('drivers', [orderBy('name')]),
  listBySchool: (schoolId) =>
    listAll('drivers', [where('schoolId', '==', schoolId), orderBy('name')]),
  subscribe: (cb) => subscribeAll('drivers', [orderBy('name')], cb),
  get: (id) => getOne('drivers', id),
  create: (data) => createDoc('drivers', data),
  update: (id, data) => updateDocById('drivers', id, data),
  remove: (id) => removeDoc('drivers', id),
};

/* ------------------------------------------------------------------ */
/*  Usuarios / acceso                                                  */
/* ------------------------------------------------------------------ */
export const Users = {
  list: () => listAll('users', [orderBy('name')]),

  subscribe: (cb) =>
    subscribeAll('users', [orderBy('name')], cb),

  get: (id) =>
    getOne('users', id),

  create: (data) =>
    createDoc('users', data),

  update: (id, data) =>
    updateDocById('users', id, data),

  remove: (id) =>
    removeDoc('users', id),
};

/* ------------------------------------------------------------------ */
/*  Alumnos (students)                                                  */
/* ------------------------------------------------------------------ */
export const Students = {
  list: () => listAll('students', [orderBy('name')]),
  listBySchool: (schoolId) =>
    listAll('students', [where('schoolId', '==', schoolId), orderBy('name')]),
  listByRoute: (routeId) =>
    listAll('students', [where('routeId', '==', routeId), orderBy('name')]),
  subscribe: (cb) => subscribeAll('students', [orderBy('name')], cb),
  get: (id) => getOne('students', id),

  async create(data) {
    const id = await createDoc('students', data);
    await syncPublicStudentIndex({ id, ...data });
    return id;
  },

  async update(id, data) {
    await updateDocById('students', id, data);
    const full = await getOne('students', id);
    await syncPublicStudentIndex(full);
  },

  async remove(id) {
    const existing = await getOne('students', id);
    await removeDoc('students', id);
    if (existing?.matricula) {
      await deleteDoc(doc(db, 'publicStudentIndex', existing.matricula.trim()));
    }
  },

  /**
   * Cambia el estatus de pago SIN registrar un cobro (para marcar
   * "Pendiente de pago" o "En mora"). Siempre deja sello de quién y
   * cuándo exactamente se hizo el cambio — es lo que alimenta el
   * "actualizado el dd/mm/aaaa HH:mm:ss" que se ve en Caja y Alumnos.
   */
  async setPaymentStatus(id, paymentStatus, byName) {
    await updateDocById('students', id, {
      paymentStatus,
      paymentStatusUpdatedAt: serverTimestamp(),
      paymentStatusUpdatedBy: byName || '',
    });
  },

  /**
   * Registra un pago con folio propio en students/{id}/payments — el
   * inicio de una bitácora de cobranza real (monto, método, quién lo
   * capturó y a qué hora exacta), no solo un banderazo de "pagado".
   * Además marca al alumno como al corriente, guarda cuándo vence su
   * SIGUIENTE pago (para que la mora se calcule sola contra la fecha de
   * hoy, sin que nadie tenga que ir a marcarla a mano) y deja el último
   * pago a la mano en su propio expediente.
   */
  async registerPayment(id, { amount, method, note, nextDueDate, byName, byUid, routeId, unitId, listId }) {
    const numAmount = amount === '' || amount == null ? null : Number(amount);
    const paymentRef = await addDoc(collection(db, 'students', id, 'payments'), {
      amount: numAmount,
      method: method || 'efectivo',
      note: note || '',
      registeredByName: byName || '',
      registeredByUid: byUid || '',
      routeId: routeId || '',
      unitId: unitId || '',
      listId: listId || '',
      cancelled: false,
      at: serverTimestamp(),
    });
    await updateDocById('students', id, {
      paymentStatus: 'al_corriente',
      nextDueDate: nextDueDate || null,
      lastPaymentAt: serverTimestamp(),
      lastPaymentAmount: numAmount,
      lastPaymentMethod: method || 'efectivo',
      paymentStatusUpdatedAt: serverTimestamp(),
      paymentStatusUpdatedBy: byName || '',
    });
    return paymentRef.id;
  },

  /**
   * Cancela/reembolsa un pago ya registrado. NO se borra (se necesita
   * para la auditoría): se marca como cancelado, con quién y cuándo, y
   * por qué. El alumno regresa a "pendiente de pago" — no se asume que
   * automáticamente está en mora, eso lo decide la fecha de vencimiento.
   */
  async cancelPayment(studentId, paymentId, reason, byName) {
    await setDoc(
      doc(db, 'students', studentId, 'payments', paymentId),
      { cancelled: true, cancelledAt: serverTimestamp(), cancelledBy: byName || '', cancelReason: reason || '' },
      { merge: true }
    );
    await updateDocById('students', studentId, {
      paymentStatus: 'desfase',
      paymentStatusUpdatedAt: serverTimestamp(),
      paymentStatusUpdatedBy: byName || '',
    });
  },

  /** Bitácora completa de pagos de un alumno (folio, monto, método, fecha). */
  listPayments: (id) => listAll(`students/${id}/payments`, [orderBy('at', 'desc')]),

  /**
   * Todos los pagos de TODOS los alumnos entre dos fechas (para la
   * proyección/corte de ingresos y la conciliación). `since`/`until`
   * son objetos Date.
   */
  async listPaymentsBetween(since, until) {
    const q = query(
      collectionGroup(db, 'payments'),
      where('at', '>=', since),
      where('at', '<=', until),
      orderBy('at', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, studentId: d.ref.parent.parent.id, ...d.data() }));
  },

  /**
   * Búsqueda por matrícula exacta. Se usa cuando el chofer digita
   * la matrícula del alumno el primer día (antes de tener orden de ruta).
   */
  async findByMatricula(matricula) {
    const results = await listAll('students', [
      where('matricula', '==', matricula.trim()),
    ]);
    return results[0] || null;
  },

  /**
   * Alta masiva por lotes (CSV de 3500+ alumnos). Muchísimo más rápido
   * que crear uno por uno: agrupa en lotes de hasta 400 escrituras y
   * los manda en paralelo-secuencial. No asigna ruta ni calendario —
   * eso se hace después con bulkAssignRoute o editando cada alumno.
   */
  async bulkImport(rows) {
    let ok = 0;
    for (const group of chunk(rows, BATCH_CHUNK_SIZE)) {
      const batch = writeBatch(db);
      group.forEach((row) => {
        const ref = doc(collection(db, 'students'));
        batch.set(ref, { routeId: '', ...row });
      });
      await batch.commit();
      ok += group.length;
    }
    return ok;
  },

  /**
   * Asignación masiva de ruta por matrícula (para no hacerlo de uno en
   * uno en la pantalla de Rutas). items: [{ id, matricula, name, routeId }].
   * Actualiza el alumno Y su espejo público (publicStudentIndex) en el
   * mismo lote, sin leer cada documento de vuelta.
   */
  async bulkAssignRoute(items) {
    let ok = 0;
    for (const group of chunk(items, BATCH_CHUNK_SIZE)) {
      const batch = writeBatch(db);
      group.forEach(({ id, matricula, name, routeId }) => {
        batch.update(doc(db, 'students', id), { routeId });
        if (routeId && matricula) {
          batch.set(doc(db, 'publicStudentIndex', matricula.trim()), {
            studentId: id,
            name: name || '',
            routeId,
          });
        }
      });
      await batch.commit();
      ok += group.length;
    }
    return ok;
  },
};


/* ------------------------------------------------------------------ */
/*  Conceptos de cobro                                                 */
/*  Los conceptos son independientes de las rutas. Una ruta solamente  */
/*  selecciona qué concepto usa para cada modalidad de servicio.       */
/* ------------------------------------------------------------------ */
export const PricingConcepts = {
  list: () => listAll('pricingConcepts', [orderBy('name')]),
  get: (id) => getOne('pricingConcepts', id),
  create: (data) => createDoc('pricingConcepts', data),
  update: (id, data) => updateDocById('pricingConcepts', id, data),
  remove: (id) => removeDoc('pricingConcepts', id),
};

// Alias de compatibilidad para cualquier pantalla que todavía importe Pricing.
export const Pricing = PricingConcepts;

/* ------------------------------------------------------------------ */
/*  Listas operativas por periodo                                      */
/* ------------------------------------------------------------------ */
export const RouteLists = {
  list: () => listAll('routeLists', [orderBy('startDate', 'desc')]),
  get: (id) => getOne('routeLists', id),
  create: (data) => createDoc('routeLists', data),
  update: (id, data) => updateDocById('routeLists', id, data),
  remove: (id) => removeDoc('routeLists', id),
};

/* ------------------------------------------------------------------ */
/*  Rutas (routes) — asigna chofer + nanny + unidad + plantel + turno   */
/* ------------------------------------------------------------------ */
export const Routes = {
  list: () => listAll('routes', [orderBy('name')]),
  listBySchool: (schoolId) =>
    listAll('routes', [where('schoolId', '==', schoolId), orderBy('name')]),
  listByDriver: (driverId) =>
    listAll('routes', [where('driverId', '==', driverId)]),
  listByNanny: (nannyId) =>
    listAll('routes', [where('nannyId', '==', nannyId)]),
  subscribe: (cb) => subscribeAll('routes', [orderBy('name')], cb),
  get: (id) => getOne('routes', id),
  create: (data) =>
    createDoc('routes', {
      // studentOrderMorning / studentOrderAfternoon guardan el ARREGLO
      // de IDs de alumnos en el orden en que normalmente se recogen/bajan.
      // Se recalculan solos después de cada recorrido real.
      studentOrderMorning: [],
      studentOrderAfternoon: [],
      // Minutos promedio (histórico) entre parada N-1 y parada N, indexado
      // por posición. Se recalcula solo al cerrar cada recorrido y
      // alimenta el ETA aproximado que ve el padre de familia.
      avgStopMinutesMorning: [],
      avgStopMinutesAfternoon: [],
      pricingConcepts: {
        completo: '',
        medio_entrada: '',
        medio_salida: '',
        por_dia: '',
      },
      ...data,
    }),
  update: (id, data) => updateDocById('routes', id, data),
  remove: (id) => removeDoc('routes', id),

  /**
   * Guarda el orden real en que se atendió a los alumnos en un recorrido,
   * para que al día siguiente la lista ya venga pre-ordenada.
   */
  async saveOrderFromTrip(routeId, shift, orderedStudentIds) {
    const field = shift === 'morning' ? 'studentOrderMorning' : 'studentOrderAfternoon';
    await updateDocById('routes', routeId, { [field]: orderedStudentIds });
  },
};

/**
 * "Buzón" para la extensión oficial de Firebase "Trigger Email"
 * (firestore-send-email): esta app solo escribe aquí el correo que hay
 * que mandar; quien REALMENTE lo envía es la extensión, ya configurada
 * en la consola de Firebase con el relay SMTP de Workspace. Sin la
 * extensión instalada, estos documentos se quedan aquí guardados sin
 * enviarse — no truena nada, pero tampoco llega el correo hasta que se
 * instale y configure (ver instrucciones aparte).
 */
export const Mail = {
  queue: ({ to, subject, html }) =>
    createDoc('mail', { to: [to], message: { subject, html } }),
};
