import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * Bitácora diaria de personal (Nómina): un documento por fecha
 * (staffLogs/YYYY-MM-DD), con una subcolección `entries` para que cada
 * renglón (un operador, una nanny, un sustituto...) se pueda editar o
 * borrar individualmente con su propio botón, sin tocar los demás.
 *
 * Como el documento se identifica por la fecha, cada día "nuevo" nace
 * vacío solo — no hace falta ningún proceso que lo reinicie a medianoche.
 */

export const STAFF_CATEGORIES = {
  operador: 'Operadores',
  nanny: 'Nannies',
  operador_taller: 'Operadores de talleres',
  otro: 'Otros / sustitutos',
};

function entriesRef(date) {
  return collection(db, 'staffLogs', date, 'entries');
}

export function subscribeStaffLogDay(date, callback) {
  const q = query(entriesRef(date), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function listStaffLogDay(date) {
  const snap = await getDocs(query(entriesRef(date), orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addStaffLogEntry(date, entry) {
  const ref = await addDoc(entriesRef(date), { ...entry, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateStaffLogEntry(date, entryId, data) {
  await updateDoc(doc(db, 'staffLogs', date, 'entries', entryId), data);
}

export async function removeStaffLogEntry(date, entryId) {
  await deleteDoc(doc(db, 'staffLogs', date, 'entries', entryId));
}

/** Para el corte de nómina: junta varios días en una sola lista, con su fecha. */
export async function listStaffLogRange(dates) {
  const perDay = await Promise.all(dates.map(async (date) => {
    const entries = await listStaffLogDay(date);
    return entries.map((e) => ({ ...e, date }));
  }));
  return perDay.flat();
}
