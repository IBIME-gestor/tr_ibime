/**
 * KPIs de operadores y nannies — cálculo puro (sin Firebase), para poder
 * revisar y ajustar las reglas en un solo lugar.
 *
 * Todo sale de lo que el sistema YA guarda en cada recorrido (trips) y sus
 * paradas (trips/{id}/stops), más la bitácora diaria de Nómina (staffLogs).
 */

/* ------------------------------------------------------------------ */
/*  Pesos de la calificación general (suman 100 por rol) — AJUSTABLES   */
/* ------------------------------------------------------------------ */
export const WEIGHTS = {
  operador: [
    { key: 'cumplimiento', label: 'Recorridos cerrados', weight: 25 },
    { key: 'cierrePropio', label: 'Cerrados por el propio operador', weight: 20 },
    { key: 'duracion', label: 'Duración vs. el promedio de su ruta', weight: 20 },
    { key: 'km', label: 'Odómetro sin incidencias', weight: 20 },
    { key: 'sinCorrecciones', label: 'Sin correcciones de Dirección', weight: 15 },
  ],
  nanny: [
    { key: 'resueltos', label: 'Alumnos atendidos', weight: 45 },
    { key: 'sinCorrecciones', label: 'Sin correcciones de Dirección', weight: 30 },
    { key: 'cumplimiento', label: 'Recorridos cerrados', weight: 25 },
  ],
};

/** Semáforo: verde ≥ 85, ámbar ≥ 70, rojo por debajo. */
export const SEMAFORO = { green: 85, amber: 70 };
export const LEVEL_COLORS = { green: '#16a34a', amber: '#f59e0b', red: '#dc2626', none: '#94a3b8' };
export const LEVEL_LABELS = { green: 'Muy bien', amber: 'Atención', red: 'Crítico', none: 'Sin datos' };

export function levelOf(score) {
  if (score == null || Number.isNaN(score)) return 'none';
  if (score >= SEMAFORO.green) return 'green';
  if (score >= SEMAFORO.amber) return 'amber';
  return 'red';
}

/** Reglas de duración: dentro de 5 % del promedio de la ruta = 100 pts; 50 % más lento = 0 pts. */
const DUR_OK = 1.05;
const DUR_BAD = 1.5;
/** Duraciones fuera de este rango (minutos) no se consideran (cierres tardíos, pruebas). */
const DUR_MIN = 3;
const DUR_MAX = 360;

/* ------------------------------------------------------------------ */
/*  Utilidades                                                          */
/* ------------------------------------------------------------------ */
export const toMs = (ts) => {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') { const n = Date.parse(ts); return Number.isNaN(n) ? null : n; }
  return null;
};

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const pct = (a, b) => (b > 0 ? a / b : null);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekStart(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return ymd(d);
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);
}

export function eachDate(from, to, cap = 62) {
  const out = [];
  const d = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (d <= end && out.length < cap) { out.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return out;
}

const shortDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

/* ------------------------------------------------------------------ */
/*  1) Preparar recorridos (campos derivados + huecos de odómetro)       */
/* ------------------------------------------------------------------ */
export function prepareTrips(trips, { kmGap = 100 } = {}) {
  const rows = trips.map((t) => {
    const start = toMs(t.startedAt);
    const end = toMs(t.completedAt);
    const kmI = num(t.kmInicial);
    const kmF = num(t.kmFinal);
    const completed = t.status === 'completed';
    let dur = null;
    if (completed && !t.closedByAdmin && start && end) {
      const m = (end - start) / 60000;
      if (m >= DUR_MIN && m <= DUR_MAX) dur = m;
    }
    const kmBadOrder = completed && kmI != null && kmF != null && kmF < kmI;
    const km = completed && kmI != null && kmF != null && kmF >= kmI ? kmF - kmI : null;
    return { ...t, _start: start, _end: end, _dur: dur, _kmI: kmI, _kmF: kmF, _km: km, _kmBadOrder: kmBadOrder, _gap: false, _completed: completed, _nannyLed: t.startedByRole === 'nanny' };
  });

  // Huecos: km inicial muy por encima del km final del recorrido anterior de la MISMA unidad.
  const byUnit = new Map();
  rows.forEach((r) => { if (r.unitId) { if (!byUnit.has(r.unitId)) byUnit.set(r.unitId, []); byUnit.get(r.unitId).push(r); } });
  byUnit.forEach((list) => {
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a._start || 0) - (b._start || 0));
    let prevFinal = null;
    list.forEach((r) => {
      if (prevFinal != null && r._kmI != null && r._kmI - prevFinal > kmGap) r._gap = true;
      if (r._kmF != null) prevFinal = r._kmF;
    });
  });

  // Promedio de duración por ruta + turno entre TODOS los recorridos válidos del periodo.
  const sums = new Map();
  rows.forEach((r) => {
    if (r._dur == null) return;
    const k = `${r.routeId}|${r.shift}`;
    const s = sums.get(k) || { sum: 0, n: 0 };
    s.sum += r._dur; s.n += 1; sums.set(k, s);
  });
  const peerAvg = new Map();
  sums.forEach((s, k) => peerAvg.set(k, s.sum / s.n));

  return { rows, peerAvg };
}

/* ------------------------------------------------------------------ */
/*  2) KPIs de una persona                                              */
/* ------------------------------------------------------------------ */
export function computeKpis(tripsOfPerson, role, peerAvg, { bucket = 'day', extras = [] } = {}) {
  const trips = tripsOfPerson;
  const total = trips.length;
  const completed = trips.filter((t) => t._completed);
  const closedOwn = completed.filter((t) => !t.closedByAdmin);
  const closedAdmin = completed.filter((t) => t.closedByAdmin);
  const open = total - completed.length;

  // Duración contra el promedio de la misma ruta y turno
  const durTrips = trips.filter((t) => t._dur != null);
  const sumDur = durTrips.reduce((n, t) => n + t._dur, 0);
  const sumPeer = durTrips.reduce((n, t) => n + (peerAvg.get(`${t.routeId}|${t.shift}`) || t._dur), 0);
  const durRatio = sumPeer > 0 ? sumDur / sumPeer : null;
  const avgDur = durTrips.length ? sumDur / durTrips.length : null;
  const avgPeerDur = durTrips.length ? sumPeer / durTrips.length : null;

  // Kilómetros
  const kmTrips = trips.filter((t) => t._km != null);
  const kmTotal = kmTrips.reduce((n, t) => n + t._km, 0);
  const kmWithData = trips.filter((t) => t._kmI != null).length;
  const kmOrderBad = trips.filter((t) => t._kmBadOrder).length;
  const kmGaps = trips.filter((t) => t._gap).length;
  const kmBad = trips.filter((t) => t._kmBadOrder || t._gap).length;

  // Correcciones de Dirección
  const corrected = trips.filter((t) => t.correctedByAdmin).length;
  const corrEntries = trips.reduce((n, t) => n + (Array.isArray(t.correctionLog) ? t.correctionLog.length : 0), 0);

  // Alumnos (solo recorridos cerrados guardan estos conteos)
  const stTotal = completed.reduce((n, t) => n + (num(t.studentsTotal) || 0), 0);
  const stAbsent = completed.reduce((n, t) => n + (num(t.studentsAbsent) || 0), 0);
  const stResolved = completed.reduce((n, t) => n + (num(t.studentsResolved) || 0), 0);
  const stDen = Math.max(0, stTotal - stAbsent);
  const stPending = Math.max(0, stDen - stResolved);

  // Avisos en ruta (los que se limpiaron al resolverse ya no quedan en el recorrido)
  const alerts = {};
  trips.forEach((t) => { if (t.alert?.type) alerts[t.alert.type] = (alerts[t.alert.type] || 0) + 1; });
  const alertsTotal = Object.values(alerts).reduce((n, v) => n + v, 0);

  // Series por día o semana
  const keyOf = (t) => (bucket === 'week' ? weekStart(t.date) : t.date);
  const labelOf = (k) => (bucket === 'week' ? `sem ${shortDate(k)}` : shortDate(k));
  const series = new Map();
  trips.forEach((t) => {
    const k = keyOf(t);
    if (!series.has(k)) series.set(k, { k, dur: [], km: 0, resolved: 0, den: 0, trips: 0 });
    const s = series.get(k);
    s.trips += 1;
    if (t._dur != null) s.dur.push(t._dur);
    if (t._km != null) s.km += t._km;
    if (t._completed) {
      const den = Math.max(0, (num(t.studentsTotal) || 0) - (num(t.studentsAbsent) || 0));
      s.den += den; s.resolved += num(t.studentsResolved) || 0;
    }
  });
  const ordered = [...series.values()].sort((a, b) => a.k.localeCompare(b.k));
  const seriesOut = {
    duration: ordered.map((s) => ({ label: labelOf(s.k), value: s.dur.length ? s.dur.reduce((a, b) => a + b, 0) / s.dur.length : 0 })),
    km: ordered.map((s) => ({ label: labelOf(s.k), value: Math.round(s.km) })),
    resolved: ordered.map((s) => ({ label: labelOf(s.k), value: s.den ? Math.round((s.resolved / s.den) * 100) : 0 })),
    trips: ordered.map((s) => ({ label: labelOf(s.k), value: s.trips })),
  };

  // Componentes de la calificación (0..1 o null si no hay datos)
  const values = {
    cumplimiento: pct(completed.length, total),
    cierrePropio: completed.length ? closedOwn.length / completed.length : null,
    duracion: durRatio == null ? null : clamp01(1 - (durRatio - DUR_OK) / (DUR_BAD - DUR_OK)),
    km: kmWithData ? clamp01(1 - kmBad / kmWithData) : null,
    sinCorrecciones: total ? 1 - corrected / total : null,
    resueltos: stDen ? stResolved / stDen : null,
  };
  // Indicadores personalizados (tareas con evidencia): [{ key, label, weight, value 0..1 | null }]
  extras.forEach((x) => { values[x.key] = x.value; });
  const spec = [...WEIGHTS[role === 'nanny' ? 'nanny' : 'operador'], ...extras.map((x) => ({ key: x.key, label: x.label, weight: x.weight }))];
  const available = spec.filter((c) => values[c.key] != null);
  const wSum = available.reduce((n, c) => n + c.weight, 0);
  const components = spec.map((c) => {
    const v = values[c.key];
    return {
      ...c,
      value: v,
      // Peso efectivo: si falta un dato, el resto se reparte para sumar 100
      effectiveWeight: v == null || !wSum ? 0 : (c.weight / wSum) * 100,
      points: v == null || !wSum ? null : v * (c.weight / wSum) * 100,
    };
  });
  const score = available.length && wSum ? components.reduce((n, c) => n + (c.points || 0), 0) : null;

  return {
    total, completed: completed.length, open, closedOwn: closedOwn.length, closedAdmin: closedAdmin.length,
    avgDur, avgPeerDur, durRatio, durCount: durTrips.length,
    kmTotal, kmWithData, kmOrderBad, kmGaps, kmBad,
    corrected, corrEntries,
    stTotal, stAbsent, stResolved, stPending, stDen,
    alerts, alertsTotal,
    series: seriesOut, values, components, score, level: levelOf(score),
  };
}

/* ------------------------------------------------------------------ */
/*  3) Detalle por paradas (se carga solo al abrir una persona)          */
/* ------------------------------------------------------------------ */
export function analyzeStops(tripsWithStops) {
  const capture = { manual: 0, bulk: 0, admin: 0, otro: 0 };
  const wait = { fast: 0, mid: 0, slow: 0, n: 0, sumSec: 0 };
  let correctedStops = 0;
  let stopsTotal = 0;

  tripsWithStops.forEach(({ trip, stops }) => {
    const isMorning = trip.shift === 'morning';
    const timeKey = isMorning ? 'boardedAt' : 'deliveredAt';
    const methodKey = isMorning ? 'boardedMethod' : 'deliveredMethod';
    stops.forEach((s) => {
      stopsTotal += 1;
      if (s.correctedByAdmin) correctedStops += 1;
      if (s.status === 'absent' || s.status === 'pending') return;
      const m = s[methodKey];
      if (m === 'manual') capture.manual += 1;
      else if (m === 'bulk') capture.bulk += 1;
      else if (m === 'admin') capture.admin += 1;
      else capture.otro += 1;

      const a = toMs(s.arrivedAt);
      const t = toMs(s[timeKey]);
      if (a && t && m === 'manual') {
        const sec = (t - a) / 1000;
        if (sec > 0 && sec <= 3600) {
          wait.n += 1; wait.sumSec += sec;
          if (sec <= 120) wait.fast += 1; else if (sec <= 300) wait.mid += 1; else wait.slow += 1;
        }
      }
    });
  });

  return { capture, wait, avgWaitSec: wait.n ? wait.sumSec / wait.n : null, correctedStops, stopsTotal };
}

/* ------------------------------------------------------------------ */
/*  4) Bitácora de Nómina (staffLogs)                                    */
/* ------------------------------------------------------------------ */
/** entries: [{ date, category, staffName, sustituto, nannyPresente }] */
export function staffSummary(entries, personName, role) {
  const me = norm(personName);
  if (!me) return { days: 0, substitutions: 0, withoutNanny: 0 };
  const mine = entries.filter((e) => norm(e.staffName) === me);
  const days = new Set(mine.map((e) => e.date)).size;
  const substitutions = mine.filter((e) => e.sustituto).length;
  const withoutNanny = role === 'nanny' ? 0 : mine.filter((e) => e.category === 'operador' && e.nannyPresente === false).length;
  return { days, substitutions, withoutNanny };
}
