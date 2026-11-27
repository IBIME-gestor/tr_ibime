import { doc, getDoc, setDoc, deleteDoc, collection, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * Cobertura de UN viaje: otro operador toma una ruta solo ese día (y turno).
 * tripCoverages/{rutaId}_{fecha}_{morning|afternoon|both}
 * El recorrido que inicie el sustituto queda a su nombre (sus KPIs, sus km); el
 * operador que faltó no recibe nada. La ruta NO cambia de operador de forma fija.
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
  await setDoc(doc(db, COL, coverageId(routeId, date, shift)), {
    routeId, routeName: routeName || '', date, shift, driverId, driverName: driverName || '',
    originalDriverId: originalDriverId || '', reason: (reason || '').trim(), by, updatedAt: serverTimestamp(),
  });
}

export const removeCoverage = (id) => deleteDoc(doc(db, COL, id));
