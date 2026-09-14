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
