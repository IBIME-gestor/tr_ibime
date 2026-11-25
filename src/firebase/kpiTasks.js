import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Indicadores personalizados con evidencia (p. ej. limpieza de unidad).
 *
 *  kpiIndicators/{id}   name, description, appliesTo ('operador'|'nanny'|'ambos'),
 *                       kind ('foto'|'check'), photosRequired, askUnit,
 *                       scheduleType ('weekly'|'dates'), days[], dates[], startDate,
 *                       deadline ('HH:MM'|''), weight, active
 *  kpiEvidence/{id}     id = `${indicatorId}_${date}_${personId}` (una por persona y día)
 *                       photos[{fileId,url}], note, unitId, status ('revision'|'aprobada'|'rechazada'),
 *                       onTime, submittedAt, reviewedAt, reviewedBy, reviewNote,
 *                       manual (true = la capturó Dirección a mano, p. ej. el operador no tuvo red)
 *  kpiSettings/drive    url (Apps Script /exec), token
 *
 * Las fotos NO se guardan aquí: se suben a Google Drive con el script y solo se
 * guarda su fileId.
 */

const snapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export const KpiIndicators = {
  subscribe(cb, onError) {
    return onSnapshot(
      query(collection(db, 'kpiIndicators'), orderBy('name')),
      (snap) => cb(snapDocs(snap)),
      (err) => { console.error('kpiIndicators:', err); cb([]); if (onError) onError(err); },
    );
  },
  create: (data) => addDoc(collection(db, 'kpiIndicators'), { ...data, createdAt: serverTimestamp() }),
  update: (id, data) => updateDoc(doc(db, 'kpiIndicators', id), { ...data, updatedAt: serverTimestamp() }),
  remove: (id) => deleteDoc(doc(db, 'kpiIndicators', id)),
};

export const evidenceId = (indicatorId, date, personId) => `${indicatorId}_${date}_${personId}`;

export function subscribeMyEvidence(personId, cb) {
  return onSnapshot(
    query(collection(db, 'kpiEvidence'), where('personId', '==', personId)),
    (snap) => cb(snapDocs(snap)),
    (err) => { console.error('kpiEvidence:', err); cb([]); },
  );
}

export async function listEvidenceBetween(from, to) {
  const snap = await getDocs(query(collection(db, 'kpiEvidence'), where('date', '>=', from), where('date', '<=', to)));
  return snapDocs(snap);
}

export async function submitEvidence({ indicator, date, person, unitId, photos, note, onTime }) {
  const id = evidenceId(indicator.id, date, person.id);
  await setDoc(doc(db, 'kpiEvidence', id), {
    indicatorId: indicator.id,
    indicatorName: indicator.name,
    date,
    personId: person.id,
    personName: person.name || '',
    personRole: person.role === 'nanny' ? 'nanny' : 'operador',
    unitId: unitId || '',
    photos: photos || [],
    note: note || '',
    onTime: !!onTime,
    status: 'revision',
    submittedAt: serverTimestamp(),
  });
  return id;
}

export function reviewEvidence(id, status, reviewNote, byName) {
  return updateDoc(doc(db, 'kpiEvidence', id), {
    status,
    reviewNote: reviewNote || '',
    reviewedBy: byName || '',
    reviewedAt: serverTimestamp(),
  });
}

/**
 * Captura manual de Dirección: marca como cumplida una tarea para varias personas y varios días
 * (p. ej. el operador no tuvo red). Queda aprobada y cuenta en su calificación.
 * Si ya existía evidencia de ese día se conservan sus fotos.
 * people: [{ id, name, role }], dates: ['YYYY-MM-DD'], existing: Map(evidenceId -> evidencia)
 */
export async function markManualEvidence({ indicator, people, dates, onTime = true, note = '', byName = '', existing = new Map() }) {
  const writes = [];
  people.forEach((person) => {
    dates.forEach((date) => {
      const id = evidenceId(indicator.id, date, person.id);
      const prev = existing.get(id);
      // Ya está aprobada igual que como se quiere dejar: no hay nada que cambiar
      if (prev && prev.status === 'aprobada' && (prev.onTime !== false) === !!onTime) return;
      writes.push({ id, person, date, prev });
    });
  });
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes.slice(i, i + 400).forEach(({ id, person, date, prev }) => {
      batch.set(doc(db, 'kpiEvidence', id), {
        indicatorId: indicator.id,
        indicatorName: indicator.name,
        date,
        personId: person.id,
        personName: person.name || '',
        personRole: person.role === 'nanny' ? 'nanny' : 'operador',
        unitId: prev?.unitId || '',
        photos: prev?.photos || [],
        note: note || prev?.note || '',
        onTime: !!onTime,
        status: 'aprobada',
        manual: true,
        reviewNote: 'Captura manual de Dirección',
        reviewedBy: byName || '',
        reviewedAt: serverTimestamp(),
        submittedAt: prev?.submittedAt || serverTimestamp(),
      });
    });
    await batch.commit();
  }
  return writes.length;
}

/** Quita SOLO las marcas manuales (nunca borra evidencias que envió la persona). */
export async function removeManualEvidence(ids) {
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'kpiEvidence', id)));
    await batch.commit();
  }
  return ids.length;
}

export const removeEvidence = (id) => deleteDoc(doc(db, 'kpiEvidence', id));

/* ------------------------------------------------------------------ */
/*  Conexión con Google Drive (Apps Script)                             */
/* ------------------------------------------------------------------ */
export async function getDriveConfig() {
  const snap = await getDoc(doc(db, 'kpiSettings', 'drive'));
  return snap.exists() ? snap.data() : null;
}
export const saveDriveConfig = ({ url, token }) =>
  setDoc(doc(db, 'kpiSettings', 'drive'), { url: url.trim(), token: token.trim(), updatedAt: serverTimestamp() });

async function callScript(cfg, payload) {
  const res = await fetch(cfg.url, {
    method: 'POST',
    // text/plain evita la verificación previa (CORS preflight) que Apps Script no contesta
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: cfg.token, ...payload }),
  });
  let data;
  try { data = await res.json(); } catch { throw new Error('El script no respondió como se esperaba. Revisa que la implementación sea «Cualquier persona» y que uses la URL /exec.'); }
  if (!data.ok) throw new Error(data.error || 'El script rechazó la solicitud.');
  return data;
}

export const pingDrive = (cfg) => callScript(cfg, { action: 'ping' });

/** Reduce la foto (lado mayor 1280 px, JPEG) para que suba rápido con datos móviles. */
export async function compressImage(file, maxSide = 1280, quality = 0.72) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    bmp = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bmp.width || bmp.naturalWidth;
  const h = bmp.height || bmp.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.split(',')[1];
}

/** Sube UNA foto a Drive y regresa { fileId, url }. */
export async function uploadEvidencePhoto(file, { indicatorName, date, personName, index }, cfg) {
  const base64 = await compressImage(file);
  const safe = String(personName || 'persona').replace(/\s+/g, '_');
  const data = await callScript(cfg, {
    action: 'upload',
    base64,
    mimeType: 'image/jpeg',
    fileName: `${date}_${safe}_${index + 1}.jpg`,
    indicator: indicatorName,
    date,
  });
  return { fileId: data.fileId, url: data.url };
}
