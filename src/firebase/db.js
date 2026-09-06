import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Helpers genéricos para no repetir boilerplate de Firestore
 * en cada pantalla. Cada colección real (students, drivers, etc.)
 * se apoya en estas funciones desde src/firebase/services.js
 */

export const colRef = (name) => collection(db, name);

/**
 * Firestore rechaza cualquier valor "undefined" (en el documento o
 * dentro de un arreglo) — truena updateDoc/setDoc con un error poco
 * claro. Limpiamos antes de escribir, por si algún cálculo dejó un
 * campo o una posición de arreglo sin llenar.
 */
function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : stripUndefined(v)));
  }
  // Ojo: NO tocar instancias especiales de Firestore (serverTimestamp(),
  // arrayUnion(), Timestamp, GeoPoint, etc.) — solo objetos "planos" tipo
  // literal ({ ... }), para no romper esos sentinels internos.
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      if (v !== undefined) out[k] = stripUndefined(v);
    });
    return out;
  }
  return value;
}

export async function listAll(name, constraints = []) {
  const q = query(colRef(name), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function subscribeAll(name, constraints, callback) {
  const q = query(colRef(name), ...constraints);
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function getOne(name, id) {
  const ref = doc(db, name, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createDoc(name, data) {
  const ref = await addDoc(colRef(name), {
    ...stripUndefined(data),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function createDocWithId(name, id, data) {
  await setDoc(doc(db, name, id), {
    ...stripUndefined(data),
    createdAt: serverTimestamp(),
  });
  return id;
}

export async function updateDocById(name, id, data) {
  await updateDoc(doc(db, name, id), {
    ...stripUndefined(data),
    updatedAt: serverTimestamp(),
  });
}

export async function removeDoc(name, id) {
  await deleteDoc(doc(db, name, id));
}

export { where, orderBy, serverTimestamp };
