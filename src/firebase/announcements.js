import {
  collection, doc, getDocs, onSnapshot, query, where, orderBy, limit, updateDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Avisos del administrador a operadores y nannies (dentro de la app).
 *
 * announcements/{id}                 (solo admin) el aviso y a quién se envió
 * announcementRecipients/{id}_{staff} una fila por destinatario: contenido + estado
 *     status: 'pendiente' | 'visto' | 'cancelado', ackedAt
 *
 * El destinatario solo puede marcar SU fila como «visto». El aviso se le sigue
 * mostrando en ventana emergente hasta que lo confirme.
 */
const ANN = 'announcements';
const REC = 'announcementRecipients';
const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export async function sendAnnouncement({ title, body, priority, audience, recipients, createdByName, createdByUid }) {
  if (!recipients?.length) throw new Error('Elige al menos un destinatario.');
  const annRef = doc(collection(db, ANN));
  const batch = writeBatch(db);
  batch.set(annRef, {
    title, body, priority, audience,
    recipientIds: recipients.map((r) => r.id),
    recipientNames: recipients.map((r) => r.name),
    createdByName: createdByName || '', createdByUid: createdByUid || '',
    cancelled: false, createdAt: serverTimestamp(),
  });
  recipients.forEach((r) => {
    batch.set(doc(db, REC, `${annRef.id}_${r.id}`), {
      announcementId: annRef.id, staffId: r.id, staffName: r.name,
      title, body, priority, status: 'pendiente', ackedAt: null, createdAt: serverTimestamp(),
    });
  });
  await batch.commit();
  return annRef.id;
}

export async function listAnnouncements(max = 50) {
  return withId(await getDocs(query(collection(db, ANN), orderBy('createdAt', 'desc'), limit(max))));
}
export async function listRecipients(announcementId) {
  return withId(await getDocs(query(collection(db, REC), where('announcementId', '==', announcementId))));
}
/** Todas las confirmaciones de los avisos recientes, para el tablero del admin. */
export async function listRecipientsFor(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 10) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDocs(query(collection(db, REC), where('announcementId', 'in', ids.slice(i, i + 10))));
    out.push(...withId(snap));
  }
  return out;
}
/** Cancela el aviso: a quien no lo ha visto ya no le aparece. */
export async function cancelAnnouncement(announcementId) {
  const rows = await listRecipients(announcementId);
  const batch = writeBatch(db);
  batch.update(doc(db, ANN, announcementId), { cancelled: true });
  rows.filter((r) => r.status === 'pendiente').forEach((r) => batch.update(doc(db, REC, r.id), { status: 'cancelado' }));
  await batch.commit();
}

/** Operador: avisos pendientes en vivo (solo los pendientes: consulta pequeña y acotada). */
export function subscribeMyPending(staffId, cb, onError) {
  const q = query(collection(db, REC), where('staffId', '==', staffId), where('status', '==', 'pendiente'));
  return onSnapshot(q, (snap) => cb(withId(snap)), (e) => { console.error(e); if (onError) onError(e); });
}
/** Operador: historial de sus avisos (bajo demanda). */
export async function listMyNotices(staffId) {
  const rows = withId(await getDocs(query(collection(db, REC), where('staffId', '==', staffId))));
  return rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
export async function ackNotice(id) {
  await updateDoc(doc(db, REC, id), { status: 'visto', ackedAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
