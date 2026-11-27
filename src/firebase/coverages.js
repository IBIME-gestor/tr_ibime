import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * Cobertura de UN viaje: otro operador toma una ruta solo ese día (y turno).
 * tripCoverages/{rutaId}_{fecha}_{morning|afternoon|both}
 * El recorrido que inicie el sustituto queda a su nombre (sus KPIs, sus km); el
 * operador que faltó no recibe nada. La ruta NO cambia de operador de forma fija.
 *
 * Detalle de alumnos: el admin puede marcar quién NO irá ese día en la ida y/o la vuelta:
 *   excluded: { morning: [studentId…], afternoon: [studentId…] }
 * Sin cambios (excluded vacío) la lista queda exactamente como la arma la ruta.
 */
const COL = 'tripCoverages';
export const SHIFT_LABEL = { both: 'Todo el día', morning: 'Solo mañana', afternoon: 'Solo tarde' };
export const coverageId = (routeId, date, shift) => `${routeId}_${date}_${shift}`;

/** Cobertura vigente para una ruta/fecha/turno (la del turno o la de todo el día). */
export async function getCoverageFor(routeId, date, shift) {
  try {
    const [one, both] = await Promise.all([
      getDoc(doc(db, COL, coverageId(routeId, date, shift))),
      getDoc(doc(db, COL, coverageId(routeId, date, 'both'))),
    ]);
    if (one.exists()) return { id: one.id, ...one.data() };
    if (both.exists()) return { id: both.id, ...both.data() };
    return null;
  } catch (err) {
    console.error('getCoverageFor:', err);
    return null;
  }
}

export async function listCoveragesByDate(date) {
  try {
    const snap = await getDocs(query(collection(db, COL), where('date', '==', date)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('listCoveragesByDate:', err);
    return [];
  }
}

export async function listCoveragesFrom(date) {
  const snap = await getDocs(query(collection(db, COL), where('date', '>=', date), orderBy('date', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveCoverage({ routeId, routeName, date, shift, driverId, driverName, originalDriverId, reason }, by = '') {
  // merge: si se vuelve a guardar la misma cobertura NO se pierden los alumnos marcados como «no irá».
  await setDoc(doc(db, COL, coverageId(routeId, date, shift)), {
    routeId, routeName: routeName || '', date, shift, driverId, driverName: driverName || '',
    originalDriverId: originalDriverId || '', reason: (reason || '').trim(), by, updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Guarda quién NO irá (ida/vuelta) en una cobertura ya creada. */
export async function saveCoverageExclusions(id, { morning = [], afternoon = [] }, by = '') {
  await updateDoc(doc(db, COL, id), {
    excluded: { morning: [...new Set(morning)], afternoon: [...new Set(afternoon)] },
    excludedBy: by, updatedAt: serverTimestamp(),
  });
}

const emptyExcluded = () => ({ morning: new Set(), afternoon: new Set() });

/** Junta los «no irá» de una lista de coberturas (una cobertura de un turno solo cuenta en ese turno). */
export function excludedFromCoverages(covers = []) {
  const out = emptyExcluded();
  (covers || []).forEach((c) => {
    ['morning', 'afternoon'].forEach((sh) => {
      if (c.shift !== 'both' && c.shift !== sh) return;
      (c.excluded?.[sh] || []).forEach((id) => out[sh].add(id));
    });
  });
  return out;
}

/** «No irá» vigentes para una ruta y fecha (de las coberturas de ese día). */
export async function getCoverageExclusions(routeId, date) {
  try {
    const snaps = await Promise.all(['morning', 'afternoon', 'both'].map((sh) => getDoc(doc(db, COL, coverageId(routeId, date, sh)))));
    return excludedFromCoverages(snaps.filter((d) => d.exists()).map((d) => d.data()));
  } catch (err) {
    console.error('getCoverageExclusions:', err);
    return emptyExcluded();
  }
}

export const removeCoverage = (id) => deleteDoc(doc(db, COL, id));
