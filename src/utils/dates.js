const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** 'miércoles' a partir de una fecha 'YYYY-MM-DD'. */
export function weekdayName(dateStr) {
  if (!dateStr) return '';
  return DIAS_SEMANA[new Date(`${dateStr}T00:00:00`).getDay()];
}

/** '19.43260, -99.13320' — 5 decimales alcanza para ubicar una casa. */
export function fmtCoords(lat, lng) {
  if (lat == null || lng == null) return '';
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

/** '14/09/2026 08:05:32' — dd/mm/aaaa, 24 hrs, con segundos. */
export function fmtDateTime24(date) {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}

/** Igual que fmtDateTime24 pero a partir de un Timestamp de Firestore. */
export function fmtTimestamp24(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  if (!ms) return '';
  return fmtDateTime24(new Date(ms));
}

/** 'dd/mm/aaaa' a partir de una fecha 'YYYY-MM-DD' (sin líos de zona horaria). */
export function fmtDateOnly(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Días de diferencia entre 'YYYY-MM-DD' y ahora (positivo = ya pasó / vencido). */
export function daysOverdue(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const due = new Date(`${dateStr}T23:59:59`);
  return Math.floor((now - due) / 86400000);
}

/** Lista de fechas 'YYYY-MM-DD' entre dos fechas (inclusive), para exportar un rango. */
export function dateRange(startStr, endStr) {
  const out = [];
  let cur = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
  }
  return out;
}

/** Primer y último instante del mes de `date` (para "ingresos de este mes"). */
export function monthBounds(date = new Date()) {
  const since = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
  const until = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  return { since, until };
}
