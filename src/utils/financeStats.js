import { recordMonth } from './dates';

/**
 * Estadísticas financieras para el módulo «Indicadores gráficos» (Dirección).
 * Mismas reglas que Cobranza: un cargo cuenta cuando su periodo ya inició y tiene monto;
 * un pago aplicado «solo al mes» no se duplica si el alumno ya tiene lista ese mes.
 */

export const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const ymLabel = (ym) => { const [y, m] = String(ym).split('-'); return `${MONTHS_ES[Number(m) - 1] || m} ${String(y).slice(2)}`; };

export const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
export function moneyShort(v) {
  const n = Number(v || 0);
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 2 })} M`;
  if (a >= 1e3) return `$${(n / 1e3).toLocaleString('es-MX', { maximumFractionDigits: 1 })} k`;
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);
const isPaidRec = (r) => r.cobrado === true && !!r.pagoId;

export function monthsBetween(fromYm, toYm) {
  const out = [];
  let [y, m] = fromYm.split('-').map(Number);
  const [ey, em] = toYm.split('-').map(Number);
  while ((y < ey || (y === ey && m <= em)) && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
export const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
export const monthStart = (ym) => `${ym}-01`;
export const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };

/** Registros financieros → filas normalizadas (todas las fechas; el filtro de meses se hace después). */
export function normalizeRecords(records, today) {
  const listedByStudent = new Set(
    records.filter((r) => r.listId && r.periodoInicio).map((r) => `${r.studentId}|${recordMonth(r)}`),
  );
  const out = [];
  records.forEach((r) => {
    const amount = Number(r.montoEstimado || 0);
    if (!(amount > 0) || !r.periodoInicio || r.periodoInicio > today) return;
    const ym = recordMonth(r);
    if (r.sinLista && listedByStudent.has(`${r.studentId}|${ym}`)) return;
    const isPaid = isPaidRec(r);
    const partial = Number(r.montoPagado || 0);
    const paid = isPaid ? (partial || amount) : Math.min(partial, amount);
    const pending = isPaid ? 0 : Math.max(0, amount - partial);
    const due = (r.paymentStatus === 'acuerdo' && r.agreementDueDate)
      ? r.agreementDueDate
      : (r.fechaVencimiento || addDays(r.periodoFin || r.periodoInicio, r.paymentDays || 0));
    const overdue = !isPaid && due && due < today ? diffDays(today, due) : 0;
    out.push({
      id: r.id, studentId: r.studentId, studentName: r.studentName || '', ym,
      schoolId: r.schoolId || '', schoolName: r.schoolName || '', nivel: r.nivel || '',
      routeId: r.routeId || '', routeName: r.routeName || '', unitId: r.unitId || '',
      amount, paid, pending, isPaid, due, overdue,
      status: isPaid ? 'corriente' : overdue > 0 ? 'mora' : 'vigente',
    });
  });
  return out;
}

const blank = () => ({ billed: 0, paid: 0, pending: 0, count: 0, mora: 0, students: new Set() });
function add(acc, r) {
  acc.billed += r.amount; acc.paid += r.paid; acc.pending += r.pending; acc.count += 1;
  if (r.status === 'mora') acc.mora += r.pending;
  acc.students.add(r.studentId);
}

/** Agrupa por una clave (función) y regresa [{ key, billed, paid, pending, rate, students }] */
export function groupBy(rows, keyFn, labelFn = (k) => k) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, blank());
    add(map.get(k), r);
  });
  return [...map.entries()].map(([key, a]) => ({
    key, label: labelFn(key), billed: a.billed, paid: a.paid, pending: a.pending, mora: a.mora, count: a.count,
    students: a.students.size, rate: a.billed ? a.paid / a.billed : null,
  }));
}

export function monthlySeries(rows, months) {
  const g = new Map(groupBy(rows, (r) => r.ym).map((x) => [x.key, x]));
  return months.map((ym) => {
    const x = g.get(ym);
    return { ym, label: ymLabel(ym), billed: x?.billed || 0, paid: x?.paid || 0, pending: x?.pending || 0, rate: x?.rate ?? null, students: x?.students || 0 };
  });
}

export const AGING = [
  { key: 'vigente', label: 'Vigente (sin vencer)', color: '#2E86D6' },
  { key: 'd30', label: '1–30 días', color: '#f59e0b' },
  { key: 'd60', label: '31–60 días', color: '#E0714A' },
  { key: 'd90', label: '61–90 días', color: '#dc2626' },
  { key: 'd90p', label: 'Más de 90 días', color: '#7f1d1d' },
];
export function agingBuckets(rows) {
  const sums = { vigente: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  rows.forEach((r) => {
    if (r.pending <= 0) return;
    if (r.overdue <= 0) sums.vigente += r.pending;
    else if (r.overdue <= 30) sums.d30 += r.pending;
    else if (r.overdue <= 60) sums.d60 += r.pending;
    else if (r.overdue <= 90) sums.d90 += r.pending;
    else sums.d90p += r.pending;
  });
  return AGING.map((a) => ({ ...a, value: sums[a.key] }));
}

export function topDebtors(rows, n = 10) {
  const map = new Map();
  rows.forEach((r) => {
    if (r.pending <= 0) return;
    const cur = map.get(r.studentId) || { studentId: r.studentId, name: r.studentName, school: r.schoolName, pending: 0, months: 0, maxOverdue: 0 };
    cur.pending += r.pending; cur.months += 1; cur.maxOverdue = Math.max(cur.maxOverdue, r.overdue);
    map.set(r.studentId, cur);
  });
  return [...map.values()].sort((a, b) => b.pending - a.pending).slice(0, n);
}

/** Cambio porcentual entre dos valores (null si no hay base). */
export const delta = (cur, prev) => (prev ? (cur - prev) / Math.abs(prev) : null);
