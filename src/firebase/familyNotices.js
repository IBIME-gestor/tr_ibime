import {
  collection, doc, addDoc, setDoc, deleteDoc, getDocs, query, where, orderBy, limit,
  serverTimestamp, getCountFromServer,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Avisos a familias (padres/tutores y alumnos que entran al seguimiento).
 *
 * familyNotices/{id}: un aviso con la lista de correos que lo reciben
 *   (recipientEmails = correo del tutor y del alumno de cada alumno elegido).
 * familyNoticeReads/{noticeId__correo}: marca de «leído» de cada correo.
 *
 * El aviso es una foto del momento en que se envía: si después registras un
 * correo nuevo, no recibe avisos anteriores.
 */
export const NOTICE_TYPES = {
  aviso: { label: 'Aviso', icon: '📢' },
  pago: { label: 'Recordatorio de pago', icon: '💳' },
  recordatorio: { label: 'Recordatorio', icon: '🔔' },
  urgente: { label: 'Urgente', icon: '⚠️' },
};

export async function sendFamilyNotice({ title, body, type, audienceLabel, recipientEmails, studentCount, createdByName, createdByUid, publishAt = null }) {
  const ref = await addDoc(collection(db, 'familyNotices'), {
    title: String(title).trim(),
    body: String(body).trim(),
    type: NOTICE_TYPES[type] ? type : 'aviso',
    audienceLabel: audienceLabel || '',
    recipientEmails,
    recipientCount: recipientEmails.length,
    studentCount: studentCount || 0,
    createdByName: createdByName || '',
    createdByUid: createdByUid || '',
    createdAt: serverTimestamp(),
    publishAt: publishAt || null, // programado: las familias lo ven desde ese día y hora
  });
  return ref.id;
}

/** Avisos dirigidos a un correo (sin orderBy: se ordenan en el cliente, así no pide índice). */
export async function listNoticesForEmail(email) {
  const snap = await getDocs(query(collection(db, 'familyNotices'), where('recipientEmails', 'array-contains', email)));
  return snap.docs
    .map((d) => {
      const { recipientEmails, ...rest } = d.data(); // la lista de correos no se necesita en pantalla
      return { id: d.id, ...rest };
    });
}

export async function listReadIdsForEmail(email) {
  const snap = await getDocs(query(collection(db, 'familyNoticeReads'), where('email', '==', email)));
  return new Set(snap.docs.map((d) => d.data().noticeId));
}

export async function markNoticeRead(noticeId, email) {
  await setDoc(doc(db, 'familyNoticeReads', `${noticeId}__${email}`), { noticeId, email, readAt: serverTimestamp() });
}

/* ---- Solo administración ---- */
export async function listSentNotices(max = 60) {
  const snap = await getDocs(query(collection(db, 'familyNotices'), orderBy('createdAt', 'desc'), limit(max)));
  return snap.docs.map((d) => {
    const { recipientEmails, ...rest } = d.data();
    return { id: d.id, ...rest };
  });
}

export async function countNoticeReads(noticeId) {
  const snap = await getCountFromServer(query(collection(db, 'familyNoticeReads'), where('noticeId', '==', noticeId)));
  return snap.data().count;
}

export async function deleteFamilyNotice(noticeId) {
  await deleteDoc(doc(db, 'familyNotices', noticeId));
}
