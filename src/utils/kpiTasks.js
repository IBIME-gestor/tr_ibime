import { eachDate } from './staffKpis';

/** Días de la semana (0 = domingo, igual que Date.getDay()). */
export const WEEKDAYS = [
  { n: 1, label: 'Lun' }, { n: 2, label: 'Mar' }, { n: 3, label: 'Mié' }, { n: 4, label: 'Jue' },
  { n: 5, label: 'Vie' }, { n: 6, label: 'Sáb' }, { n: 0, label: 'Dom' },
];

export function todayStr() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function nowHHMM(now = new Date()) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** ¿El indicador aplica a este rol? role: 'operador' | 'nanny' */
export function appliesToRole(ind, role) {
  if (ind.active === false) return false;
  const r = role === 'nanny' ? 'nanny' : 'operador';
  return ind.appliesTo === 'ambos' || ind.appliesTo === r;
}

/** ¿La tarea está programada en esa fecha (YYYY-MM-DD)? */
export function isScheduled(ind, date) {
  if (ind.startDate && date < ind.startDate) return false;
  if (ind.scheduleType === 'dates') return (ind.dates || []).includes(date);
  const dow = new Date(`${date}T12:00:00`).getDay();
  return (ind.days || []).includes(dow);
}

export function scheduledDates(ind, from, to) {
  return eachDate(from, to, 400).filter((d) => isScheduled(ind, d));
}

export function scheduleText(ind) {
  if (ind.scheduleType === 'dates') {
    const n = (ind.dates || []).length;
    return n ? `${n} fecha${n === 1 ? '' : 's'} específica${n === 1 ? '' : 's'}` : 'Sin fechas';
  }
  const names = WEEKDAYS.filter((d) => (ind.days || []).includes(d.n)).map((d) => d.label);
  return names.length ? names.join(', ') : 'Sin días';
}

export const EVIDENCE_STATES = {
  aprobada: { label: 'Aprobada a tiempo', color: '#16a34a', value: 1 },
  tarde: { label: 'Aprobada tarde', color: '#84cc16', value: 0.5 },
  revision: { label: 'En revisión', color: '#2E86D6', value: 1 },
  rechazada: { label: 'Rechazada', color: '#dc2626', value: 0 },
  faltante: { label: 'No entregada', color: '#94a3b8', value: 0 },
};

/** Estado de una evidencia para efectos de calificación y gráficas. */
export function stateOfEvidence(ev) {
  if (!ev) return 'faltante';
  if (ev.status === 'rechazada') return 'rechazada';
  if (ev.status === 'aprobada') return ev.onTime === false ? 'tarde' : 'aprobada';
  return 'revision';
}

/**
 * Cumplimiento de UN indicador para UNA persona en el periodo.
 * - Solo cuentan los días programados ya vencidos (hoy cuenta si ya se entregó o ya pasó la hora límite).
 * - Aprobada a tiempo = 100 %, aprobada tarde = 50 %, en revisión = cuenta como entregada,
 *   rechazada o no entregada = 0 %.
 */
export function complianceFor(ind, evidenceByDate, from, to, now = new Date()) {
  const today = todayStr();
  const hhmm = nowHHMM(now);
  const items = [];
  scheduledDates(ind, from, to).forEach((date) => {
    if (date > today) return;
    const ev = evidenceByDate.get(date) || null;
    if (!ev && date === today && !(ind.deadline && hhmm > ind.deadline)) return; // aún está a tiempo
    items.push({ date, ev, state: stateOfEvidence(ev) });
  });
  const counts = { aprobada: 0, tarde: 0, revision: 0, rechazada: 0, faltante: 0 };
  items.forEach((i) => { counts[i.state] += 1; });
  const expected = items.length;
  // En revisión cuenta como entregada, pero si se entregó tarde vale 50 % igual que una aprobada tarde
  const pts = (i) => (i.state === 'revision' && i.ev?.onTime === false ? 0.5 : EVIDENCE_STATES[i.state].value);
  const value = expected ? items.reduce((n, i) => n + pts(i), 0) / expected : null;
  return { items, expected, counts, value };
}

/** Todas las tareas de una persona: [{ ind, comp }] */
export function personTasks(indicators, role, personEvidence, from, to) {
  return indicators
    .filter((ind) => appliesToRole(ind, role))
    .map((ind) => {
      const byDate = new Map();
      personEvidence.filter((e) => e.indicatorId === ind.id).forEach((e) => byDate.set(e.date, e));
      return { ind, comp: complianceFor(ind, byDate, from, to) };
    });
}

/* ------------------------------------------------------------------ */
/*  Fotos                                                               */
/* ------------------------------------------------------------------ */
export const driveThumb = (fileId, w = 600) => `https://drive.google.com/thumbnail?id=${fileId}&sz=w${w}`;
export const driveView = (photo) => photo.url || `https://drive.google.com/file/d/${photo.fileId}/view`;
