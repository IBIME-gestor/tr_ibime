/**
 * Programación de avisos: «ahora» o para un día y hora.
 * schedule = { mode: 'now' | 'later', date: 'YYYY-MM-DD', time: 'HH:MM' }
 */
const pad = (n) => String(n).padStart(2, '0');
const toDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const emptySchedule = () => {
  const t = new Date(Date.now() + 86400000);
  return { mode: 'now', date: toDate(t), time: '08:00' };
};
export const todayInput = () => toDate(new Date());

/** Date de la programación, o null si es «ahora» o no es válida. */
export function scheduleDate(sch) {
  if (!sch || sch.mode !== 'later' || !sch.date || !sch.time) return null;
  const d = new Date(`${sch.date}T${sch.time}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Texto de error si la programación no sirve; '' si está bien. */
export function scheduleError(sch) {
  if (!sch || sch.mode !== 'later') return '';
  const d = scheduleDate(sch);
  if (!d) return 'Elige el día y la hora en que debe aparecer el aviso.';
  if (d.getTime() <= Date.now()) return 'La fecha y hora programadas ya pasaron; elige un momento futuro o envíalo ahora.';
  return '';
}

export const msOf = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : typeof ts === 'number' ? ts : null);

/** ¿Ya llegó el momento de mostrarlo? (sin programación = ya) */
export const isPublished = (item, nowMs = Date.now()) => {
  const at = msOf(item?.publishAt);
  return at == null || at <= nowMs;
};

export const fmtWhen = (ms) => (ms ? new Date(ms).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
