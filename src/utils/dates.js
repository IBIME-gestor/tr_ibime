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
