import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Agenda personal del administrador (agenda/{id}), visible solo para su dueño.
 *   ownerUid, title, notes, category, dueAt (Timestamp), done, doneAt, createdAt
 */
const COL = 'agenda';

export const AGENDA_CATEGORIES = ['Servicio solicitado', 'Pendiente por mover', 'Llamada o seguimiento', 'Otro'];

/** Avisos antes de la fecha: 24 h, 12 h, 6 h y 1 h. */
export const REMINDER_STEPS = [24, 12, 6, 1];

export const Agenda = {
  subscribeMine(uid, cb, onError) {
    const q = query(collection(db, COL), where('ownerUid', '==', uid));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => { console.error(err); if (onError) onError(err); }
    );
  },
  async create(data) {
    const ref = await addDoc(collection(db, COL), { ...data, done: false, createdAt: serverTimestamp() });
    return ref.id;
  },
  async update(id, data) {
    await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
  },
  async remove(id) {
    await deleteDoc(doc(db, COL, id));
  },
};

export const dueMs = (item) => (item?.dueAt?.toMillis ? item.dueAt.toMillis() : item?.dueAt?.seconds ? item.dueAt.seconds * 1000 : null);

/**
 * Etapa de aviso de un pendiente:
 *   null = aún falta más de 24 h · 24 | 12 | 6 | 1 = faltan menos de esas horas · 0 = vencido
 */
export function reminderStage(item, nowMs = Date.now()) {
  const due = dueMs(item);
  if (!due || item.done) return null;
  const hours = (due - nowMs) / 3600000;
  if (hours <= 0) return 0;
  const hit = [...REMINDER_STEPS].sort((a, b) => a - b).find((h) => hours <= h);
  return hit ?? null;
}

export const stageLabel = (stage) => (stage === 0 ? 'Vencido' : stage != null ? `Faltan menos de ${stage} h` : '');
