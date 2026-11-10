import {
  collection, doc, addDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { getOne } from './db';
import { KM_GAP_ALERT } from './trips';

/**
 * Viajes especiales: traslados solicitados por dirección, coordinación u otro
 * personal fuera del horario de las rutas (p. ej. alumnos al centro cultural).
 * No se registra alumno por alumno, solo CUÁNTOS fueron.
 *
 * specialTrips/{id}
 *   date 'YYYY-MM-DD', scheduledStart 'HH:MM', scheduledEnd 'HH:MM',
 *   schoolId, schoolName, requestedByName, requestedByArea,
 *   motivo, descripcion, destino, studentsPlanned,
 *   operatorId, operatorName, unitId, unitName (sugerida o usada),
 *   status: 'solicitado' | 'asignado' | 'en_curso' | 'completado' | 'cancelado',
 *   startedAt, endedAt (Timestamp), kmInicial, kmFinal,
 *   studentsStart (suben), studentsEnd (regresan), operatorNotes, kmAlert
 */

const COL = 'specialTrips';
const clean = (obj) => {
  const out = {};
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined) out[k] = v; });
  return out;
};
const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export const SPECIAL_STATUS = {
  solicitado: 'Solicitado',
  asignado: 'Asignado',
  en_curso: 'En curso',
  completado: 'Completado',
  cancelado: 'Cancelado',
};
export const REQUEST_AREAS = ['Dirección', 'Coordinación', 'Administración', 'Otro'];

export const SpecialTrips = {
  async list() {
    return withId(await getDocs(query(collection(db, COL), orderBy('date', 'desc'))));
  },
  async listByOperator(operatorId) {
    const rows = withId(await getDocs(query(collection(db, COL), where('operatorId', '==', operatorId))));
    return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  },
  async listByUnit(unitId) {
    return withId(await getDocs(query(collection(db, COL), where('unitId', '==', unitId))));
  },
  async create(data) {
    const ref = await addDoc(collection(db, COL), { ...clean(data), createdAt: serverTimestamp() });
    return ref.id;
  },
  async update(id, data) {
    await updateDoc(doc(db, COL, id), { ...clean(data), updatedAt: serverTimestamp() });
  },
  async remove(id) {
    await deleteDoc(doc(db, COL, id));
  },
};

/** Compara el km inicial con el último km registrado de la unidad. */
export async function checkUnitOdometer(unitId, kmInicial, ignoreKmAlert = false) {
  const unit = await getOne('units', unitId);
  const lastKm = unit?.lastKm === '' || unit?.lastKm == null ? null : Number(unit.lastKm);
  let kmAlert = null;
  if (lastKm != null && Number.isFinite(lastKm)) {
    if (Number(kmInicial) < lastKm) {
      if (!ignoreKmAlert) {
        const err = new Error(`El kilometraje inicial (${kmInicial}) es menor al último registrado de esta unidad (${lastKm}). Revisa el odómetro; si es correcto, confirma para continuar.`);
        err.code = 'KM_LOWER';
        throw err;
      }
      kmAlert = { type: 'menor', lastKm };
    } else if (Number(kmInicial) - lastKm > KM_GAP_ALERT) {
      kmAlert = { type: 'salto', lastKm, gap: Number(kmInicial) - lastKm };
    }
  }
  return { unit, kmAlert };
}

/** El operador inicia el viaje: elige unidad, registra km inicial y cuántos alumnos suben. */
export async function startSpecialTrip(trip, { unitId, kmInicial, studentsStart, ignoreKmAlert = false }) {
  if (!unitId) throw new Error('Elige la unidad que vas a usar.');
  if (kmInicial === '' || kmInicial == null || Number.isNaN(Number(kmInicial))) {
    throw new Error('Se requiere el kilometraje inicial.');
  }
  const n = Number(studentsStart);
  if (!Number.isFinite(n) || n < 0) throw new Error('Indica cuántos alumnos suben.');
  const { unit, kmAlert } = await checkUnitOdometer(unitId, kmInicial, ignoreKmAlert);
  const capacity = Number(unit?.capacity || 0);
  if (capacity > 0 && n > capacity) {
    throw new Error(`La unidad ${unit?.plate || ''} tiene ${capacity} lugares y registraste ${n} alumnos.`);
  }
  await SpecialTrips.update(trip.id, {
    status: 'en_curso',
    startedAt: serverTimestamp(),
    unitId,
    unitName: unit?.plate || '',
    kmInicial: Number(kmInicial),
    studentsStart: n,
    kmAlert,
  });
}

/** El operador cierra el viaje: km final, alumnos que regresan y notas. */
export async function finishSpecialTrip(trip, { kmFinal, studentsEnd, notes }) {
  if (kmFinal === '' || kmFinal == null || Number.isNaN(Number(kmFinal))) {
    throw new Error('Se requiere el kilometraje final.');
  }
  if (Number(kmFinal) < Number(trip.kmInicial || 0)) {
    throw new Error('El kilometraje final no puede ser menor al inicial.');
  }
  const n = studentsEnd === '' || studentsEnd == null ? Number(trip.studentsStart || 0) : Number(studentsEnd);
  if (!Number.isFinite(n) || n < 0) throw new Error('Indica cuántos alumnos regresan.');
  await SpecialTrips.update(trip.id, {
    status: 'completado',
    endedAt: serverTimestamp(),
    kmFinal: Number(kmFinal),
    studentsEnd: n,
    operatorNotes: (notes || '').trim(),
  });
  if (trip.unitId) {
    try {
      await updateDoc(doc(db, 'units', trip.unitId), {
        lastKm: Number(kmFinal), lastKmAt: serverTimestamp(), lastKmTripId: `special_${trip.id}`,
      });
    } catch (e) { console.error('No se pudo actualizar el último km de la unidad:', e); }
  }
}
