import { doc, getDoc, setDoc, deleteDoc, collection, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * Calendario escolar: días SIN labores (o con labores solo para algunos niveles).
 * Un documento por fecha: schoolCalendar/{AAAA-MM-DD}
 *   mode:    'all'         → no hay labores para nadie
 *            'levels-off'  → no hay labores SOLO para los niveles de `levels`
 *            'levels-only' → solo asisten los niveles de `levels` (los demás no)
 *   levels:  niveles tal como están en el campo «Nivel» del alumno
 *   reason:  motivo (puente, consejo técnico, evento…)
 *
 * Efectos: la lista del operador ya sale filtrada con quienes sí asisten, y los
 * días 'all' no cuentan en los KPIs de operadores y nannies.
 */
const COL = 'schoolCalendar';

export const normLevel = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const MODE_LABEL = {
  all: 'Sin labores para todos',
  'levels-off': 'Sin labores para algunos niveles',
  'levels-only': 'Solo asisten algunos niveles',
};

export async function getCalendarDay(date) {
  try {
    const snap = await getDoc(doc(db, COL, date));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    // Si las reglas nuevas aún no se publican, la app sigue funcionando como siempre.
    console.error('getCalendarDay:', err);
    return null;
  }
}

export async function listCalendar(from, to) {
  const q = query(collection(db, COL), where('date', '>=', from), where('date', '<=', to), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveCalendarDay(date, { mode, levels = [], reason = '' }, by = '') {
  await setDoc(doc(db, COL, date), {
    date, mode, levels: mode === 'all' ? [] : levels, reason: reason.trim(), by, updatedAt: serverTimestamp(),
  });
}

export const removeCalendarDay = (date) => deleteDoc(doc(db, COL, date));

/** ¿Este alumno tiene labores ese día? (day = documento del calendario o null) */
export function studentAttends(student, day) {
  if (!day) return true;
  if (day.mode === 'all') return false;
  const levels = (day.levels || []).map(normLevel);
  const own = normLevel(student?.nivel);
  if (day.mode === 'levels-off') return !(own && levels.includes(own));
  if (day.mode === 'levels-only') return Boolean(own) && levels.includes(own);
  return true;
}

/** Fechas con cero labores para todos (no cuentan en los KPIs). */
export const closedDates = (days) => new Set((days || []).filter((d) => d.mode === 'all').map((d) => d.date));
