/**
 * Utilidades de lectura rápida para los paneles de administración de
 * recorridos (Recorridos en curso, Flota en vivo, Vista del operador).
 */

const toUtcDay = (dateStr) => {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d) / 86400000;
};

/** Días de diferencia entre 'YYYY-MM-DD' y hoy (0 = hoy, 1 = ayer…). */
export function daysAgo(dateStr, todayStr) {
  const a = toUtcDay(dateStr);
  const b = toUtcDay(todayStr);
  if (a == null || b == null) return null;
  return b - a;
}

/** 'Hoy' · 'Ayer' · 'Hace 3 días' */
export function dayLabel(dateStr, todayStr) {
  const n = daysAgo(dateStr, todayStr);
  if (n == null) return dateStr || '—';
  if (n <= 0) return 'Hoy';
  if (n === 1) return 'Ayer';
  return `Hace ${n} días`;
}

/** 'hace 8 s' · 'hace 3 min' · 'hace 2 h' */
export function fmtAgo(ms, now = Date.now()) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

/** 'martes 3 de noviembre' corto: 'mar 3 nov' */
export function fmtShortDay(dateStr) {
  if (!dateStr) return '—';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Estado de la señal del GPS de un recorrido en curso:
 *   live  → llegó posición hace menos de 90 s
 *   weak  → entre 90 s y 3 min
 *   lost  → más de 3 min sin posición
 *   none  → todavía no ha transmitido
 * (Con el filtro de movimiento, parado se manda una señal cada 30 s.)
 */
export function signalState(updatedMs, now = Date.now()) {
  if (updatedMs == null) return 'none';
  const age = now - updatedMs;
  if (age <= 90 * 1000) return 'live';
  if (age <= 3 * 60 * 1000) return 'weak';
  return 'lost';
}

export const SIGNAL_META = {
  live: { label: 'En vivo', dot: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  weak: { label: 'Señal débil', dot: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  lost: { label: 'Sin señal', dot: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-50 text-red-800 border-red-200' },
  none: { label: 'Sin ubicación aún', dot: 'bg-slate-400', text: 'text-slate-600', chip: 'bg-slate-50 text-slate-700 border-slate-200' },
};

/** Hook-friendly: reloj que se actualiza cada `everyMs`. */
export function nowTick() {
  return Date.now();
}
