import { addDoc, collection, getDocs, limit, orderBy, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * Bitácora de cambios (auditLog): quién, cuándo, qué cambió (antes → después).
 * Es de solo escritura/lectura: no se edita ni se borra desde la app.
 * Hoy registra altas, ediciones y bajas de alumnos (se engancha en
 * Students.create/update/remove de services.js, así que cualquier pantalla
 * que modifique alumnos queda registrada sin hacer nada más).
 */

const actor = { uid: '', name: '', role: '' };

/** La llama AuthContext al iniciar/cerrar sesión. */
export function setAuditActor(next) {
  actor.uid = next?.uid || '';
  actor.name = next?.name || '';
  actor.role = next?.role || '';
}

const SKIP_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);
const MAX_FIELDS = 40;

/** Deja un valor en una forma simple y comparable (texto) para guardarlo. */
function plain(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try { return value.toDate().toISOString(); } catch { return ''; }
    }
    if (value._methodName) return null; // serverTimestamp() u otro sentinel: no se registra
    try { return JSON.stringify(value).slice(0, 600); } catch { return '[objeto]'; }
  }
  return String(value).slice(0, 300);
}

/** Campos que realmente cambian entre `before` y el parche `patch`. */
export function diffFields(before, patch) {
  const changes = {};
  Object.keys(patch || {}).forEach((key) => {
    if (SKIP_FIELDS.has(key)) return;
    const to = plain(patch[key]);
    if (to === null) return;
    const from = plain(before?.[key]);
    if (from === null || from === to) return;
    if (Object.keys(changes).length < MAX_FIELDS) changes[key] = { from, to };
  });
  return changes;
}

/** Guarda un registro. Nunca lanza: la bitácora no debe impedir el cambio real. */
export async function logAudit({ entity = 'student', entityId = '', entityName = '', matricula = '', action, changes = {}, source = '', note = '' }) {
  try {
    if (action === 'update' && Object.keys(changes).length === 0) return; // nada cambió
    await addDoc(collection(db, 'auditLog'), {
      entity,
      entityId,
      entityName: String(entityName || '').slice(0, 120),
      matricula: String(matricula || '').slice(0, 40),
      action,
      changes,
      source: String(source || '').slice(0, 60),
      note: String(note || '').slice(0, 300),
      actorUid: actor.uid,
      actorName: String(actor.name || '').slice(0, 80),
      actorRole: actor.role,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('No se pudo guardar en la bitácora:', err?.message || err);
  }
}

/** Últimos movimientos de la bitácora (consulta puntual, no en tiempo real). */
export async function listAudit({ max = 200, entityId = '' } = {}) {
  // Con filtro por alumno se ordena en memoria para no exigir un índice compuesto.
  const constraints = entityId
    ? [where('entityId', '==', entityId), limit(max)]
    : [orderBy('createdAt', 'desc'), limit(max)];
  const snap = await getDocs(query(collection(db, 'auditLog'), ...constraints));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (entityId) rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return rows;
}
