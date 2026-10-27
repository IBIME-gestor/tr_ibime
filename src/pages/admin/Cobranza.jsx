import { Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  PhoneCall, Search, Download, Printer, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Users,
} from 'lucide-react';
import { FinanceRecords, Routes, Schools, Students } from '../../firebase/services';
import { fmtDateOnly } from '../../utils/dates';

/* ------------------------------------------------------------------ */
/*  Cobranza (Contraloría)                                             */
/*  Alumnos por plantel (según su padrón) con estatus de pago vs los   */
/*  meses de servicio. Lo que se ve en pantalla es lo que se descarga. */
/* ------------------------------------------------------------------ */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (ym) => { const [y, m] = String(ym).split('-'); return `${MONTHS[Number(m) - 1] || m} ${y}`; };
const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const addDays = (date, n) => { if (!date) return ''; const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);
const tsDate = (ts) => {
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  if (!ms) return '';
  const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const isPaidRec = (r) => r.cobrado === true && !!r.pagoId;

const STATUS = {
  mora:      { label: 'En mora',            cls: 'badge-stop',  order: 0 },
  pendiente: { label: 'Pendiente vigente',  cls: 'badge-amber', order: 1 },
  acuerdo:   { label: 'Acuerdo de pago',    cls: 'badge-amber', order: 2 },
  sinreg:    { label: 'Sin cargos',         cls: 'badge',       order: 3 },
  corriente: { label: 'Al corriente',       cls: 'badge-go',    order: 4 },
};

function serviceText(s) {
  if (s.tipoServicio === 'medio') return `Medio (${s.medioServicio || 'entrada'})`;
  if (s.tipoServicio === 'diario') return 'Diario';
  return 'Completo';
}

/** Arma la fila de cobranza de un alumno a partir de sus registros financieros. */
function buildRow(student, records, ctx) {
  const { today, schoolName, routeName } = ctx;
  const all = records.filter((r) => r.studentId === student.id);
  const startFromRecords = all.map((r) => r.periodoInicio).filter(Boolean).sort()[0] || '';
  const serviceStart = startFromRecords || tsDate(student.createdAt) || '';

  // Un mes cuenta cuando ya inició y tiene monto a cobrar.
  const billed = all.filter((r) => Number(r.montoEstimado || 0) > 0 && r.periodoInicio && r.periodoInicio <= today);
  const byMonth = new Map();
  billed.forEach((r) => {
    const ym = r.periodoInicio.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(r);
  });

  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ym, recs]) => {
    const amount = recs.reduce((n, r) => n + Number(r.montoEstimado || 0), 0);
    const pending = recs.reduce((n, r) => n + (isPaidRec(r) ? 0 : Math.max(0, Number(r.montoEstimado || 0) - Number(r.montoPagado || 0))), 0);
    const paid = recs.every(isPaidRec);
    const unpaid = recs.filter((r) => !isPaidRec(r));
    const dues = unpaid.map((r) => (r.paymentStatus === 'acuerdo' && r.agreementDueDate)
      ? r.agreementDueDate
      : (r.fechaVencimiento || addDays(r.periodoFin, r.paymentDays || 0))).filter(Boolean).sort();
    const due = dues[0] || '';
    const overdue = !paid && due && due < today ? diffDays(today, due) : 0;
    const agreement = !paid && unpaid.every((r) => r.paymentStatus === 'acuerdo');
    return {
      ym, concept: [...new Set(recs.map((r) => r.conceptName).filter(Boolean))].join(' / '),
      amount, pending: paid ? 0 : pending, paid, due, overdue, agreement,
      partial: !paid && unpaid.some((r) => Number(r.montoPagado || 0) > 0),
    };
  });

  const unpaidMonths = months.filter((m) => !m.paid);
  const overdueMonths = unpaidMonths.filter((m) => m.overdue > 0);
  const lastPaid = all.filter(isPaidRec).map((r) => (r.cobradoAt || '').slice(0, 10)).filter(Boolean).sort().pop()
    || tsDate(student.lastPaymentAt) || '';
  const oldestDue = unpaidMonths.map((m) => m.due).filter(Boolean).sort()[0] || '';

  let status = 'corriente';
  if (!months.length) status = 'sinreg';
  else if (overdueMonths.length) status = 'mora';
  else if (unpaidMonths.length && unpaidMonths.every((m) => m.agreement)) status = 'acuerdo';
  else if (unpaidMonths.length) status = 'pendiente';

  return {
    id: student.id,
    plantel: schoolName(student.schoolId),
    matricula: student.matricula || '',
    alumno: student.name || '',
    nivelGrado: [student.nivel, student.grado, student.grupoEsp || student.grupo].filter(Boolean).join(' · '),
    nivel: student.nivel || '',
    responsable: student.familiarResponsable || '',
    telefono: [student.telefono, student.parentContact].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / '),
    ruta: routeName(student.routeId),
    servicio: serviceText(student),
    inicio: serviceStart,
    mesesServicio: months.length,
    mesesPagados: months.length - unpaidMonths.length,
    mesesAdeudo: unpaidMonths.length,
    mesesMora: overdueMonths.length,
    adeudo: unpaidMonths.reduce((n, m) => n + m.pending, 0),
    ultimoPago: lastPaid,
    vencimiento: oldestDue,
    diasAtraso: overdueMonths.length ? Math.max(...overdueMonths.map((m) => m.overdue)) : 0,
    status,
    months,
  };
}

// Columnas: lo mismo se pinta en pantalla, en Excel y en PDF.
const COLUMNS = [
  { key: 'plantel',     label: 'Plantel',            get: (r) => r.plantel, w: 22 },
  { key: 'matricula',   label: 'Matrícula',          get: (r) => r.matricula, w: 12 },
  { key: 'alumno',      label: 'Alumno',             get: (r) => r.alumno, w: 30 },
  { key: 'nivelGrado',  label: 'Nivel / grado',      get: (r) => r.nivelGrado, w: 20 },
  { key: 'responsable', label: 'Responsable',        get: (r) => r.responsable, w: 26 },
  { key: 'telefono',    label: 'Teléfono',           get: (r) => r.telefono, w: 20 },
  { key: 'ruta',        label: 'Ruta',               get: (r) => r.ruta, w: 20 },
  { key: 'servicio',    label: 'Servicio',           get: (r) => r.servicio, w: 14 },
  { key: 'inicio',      label: 'Inicio del servicio', get: (r) => r.inicio, show: (r) => fmtDateOnly(r.inicio) || '—', w: 14 },
  { key: 'mesesServicio', label: 'Meses de servicio', get: (r) => r.mesesServicio, align: 'right', w: 10 },
  { key: 'mesesPagados',  label: 'Meses pagados',     get: (r) => r.mesesPagados, align: 'right', w: 10 },
  { key: 'mesesAdeudo',   label: 'Meses adeudados',   get: (r) => r.mesesAdeudo, align: 'right', w: 10 },
  { key: 'adeudo',      label: 'Monto adeudado',     get: (r) => r.adeudo, show: (r) => money(r.adeudo), money: true, align: 'right', w: 15 },
  { key: 'ultimoPago',  label: 'Último pago',        get: (r) => r.ultimoPago, show: (r) => fmtDateOnly(r.ultimoPago) || 'Sin pagos', w: 13 },
  { key: 'vencimiento', label: 'Vencimiento más antiguo', get: (r) => r.vencimiento, show: (r) => fmtDateOnly(r.vencimiento) || '—', w: 15 },
  { key: 'diasAtraso',  label: 'Días de atraso',     get: (r) => r.diasAtraso, align: 'right', w: 10 },
  { key: 'status',      label: 'Estatus',            get: (r) => STATUS[r.status].label, w: 18 },
];
const cellText = (col, r) => (col.show ? col.show(r) : String(col.get(r) ?? ''));
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function Cobranza() {
  const [schools, setSchools] = useState([]);
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [filterSchool, setFilterSchool] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonths, setFilterMonths] = useState('0');
  const [search, setSearch] = useState('');
  const [cutoff, setCutoff] = useState(localToday());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadedSchool, setLoadedSchool] = useState('');
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');
  const [routeRows, setRouteRows] = useState([]);

  // Catálogo de planteles.
  useEffect(() => { Schools.list().then(setSchools).catch((e) => console.error(e)); }, []);

  async function consult() {
    if (!filterSchool) return;
    setLoading(true); setError(''); setOpenId('');
    try {
      const [studentRows, financeRows, routes] = await Promise.all([
        filterSchool === '__ALL__' ? Students.list() : Students.listBySchool(filterSchool),
        FinanceRecords.list(),
        Routes.list(),
      ]);
      setStudents(studentRows || []); setRecords(financeRows || []); setRouteRows(routes || []);
      setLoaded(true); setLoadedSchool(filterSchool);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo consultar la información.');
    } finally { setLoading(false); }
  }

  const schoolName = (id) => schools.find((s) => s.id === id)?.name || 'Sin plantel';
  const routeName = (id) => routeRows.find((r) => r.id === id)?.name || '—';

  const allRows = useMemo(() => {
    if (!loaded) return [];
    const byStudent = new Map();
    records.forEach((r) => { if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []); byStudent.get(r.studentId).push(r); });
    return students.map((s) => buildRow(s, byStudent.get(s.id) || [], { today: cutoff, schoolName, routeName }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, students, records, cutoff, schools, routeRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es-MX');
    const minMonths = Number(filterMonths);
    return allRows
      .filter((r) => !filterStatus || r.status === filterStatus)
      .filter((r) => r.mesesAdeudo >= minMonths)
      .filter((r) => !q || [r.alumno, r.matricula, r.responsable, r.telefono].join(' ').toLocaleLowerCase('es-MX').includes(q))
      .sort((a, b) => a.plantel.localeCompare(b.plantel, 'es')
        || STATUS[a.status].order - STATUS[b.status].order
        || b.diasAtraso - a.diasAtraso
        || a.alumno.localeCompare(b.alumno, 'es'));
  }, [allRows, filterStatus, filterMonths, search]);

  const totals = useMemo(() => ({
    alumnos: rows.length,
    mora: rows.filter((r) => r.status === 'mora').length,
    pendiente: rows.filter((r) => r.status === 'pendiente' || r.status === 'acuerdo').length,
    corriente: rows.filter((r) => r.status === 'corriente').length,
    adeudo: rows.reduce((n, r) => n + r.adeudo, 0),
    mesesAdeudo: rows.reduce((n, r) => n + r.mesesAdeudo, 0),
  }), [rows]);

  const schoolTitle = loadedSchool === '__ALL__' ? 'Todos los planteles' : schoolName(loadedSchool);
  const filterSummary = [
    `Plantel: ${schoolTitle}`,
    `Estatus: ${filterStatus ? STATUS[filterStatus].label : 'Todos'}`,
    Number(filterMonths) > 0 ? `Mínimo ${filterMonths} mes(es) adeudado(s)` : '',
    search.trim() ? `Búsqueda: "${search.trim()}"` : '',
    `Fecha de corte: ${fmtDateOnly(cutoff)}`,
  ].filter(Boolean).join(' · ');
  const fileBase = `cobranza_${(loadedSchool === '__ALL__' ? 'todos_los_planteles' : schoolName(loadedSchool)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}_${cutoff}`;

  function exportExcel() {
    const header = COLUMNS.map((c) => c.label);
    const body = rows.map((r) => COLUMNS.map((c) => (c.money || typeof c.get(r) === 'number' ? c.get(r) : cellText(c, r))));
    const totalRow = COLUMNS.map((c) => (c.key === 'alumno' ? `TOTAL · ${rows.length} alumno(s)` : c.key === 'mesesAdeudo' ? totals.mesesAdeudo : c.key === 'adeudo' ? totals.adeudo : ''));
    const aoa = [['Reporte de cobranza — Contraloría'], [filterSummary], [`Generado: ${new Date().toLocaleString('es-MX')}`], [], header, ...body, totalRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COLUMNS.map((c) => ({ wch: c.w }));
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + body.length, c: COLUMNS.length - 1 } }) };
    const moneyCol = COLUMNS.findIndex((c) => c.money);
    for (let i = 0; i <= body.length; i += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: 5 + i, c: moneyCol })];
      if (cell && typeof cell.v === 'number') cell.z = '"$"#,##0.00';
    }

    const detail = [['Plantel', 'Matrícula', 'Alumno', 'Mes', 'Concepto', 'Monto del mes', 'Pendiente', 'Estado del mes', 'Vencimiento', 'Días de atraso']];
    rows.forEach((r) => r.months.forEach((m) => detail.push([
      r.plantel, r.matricula, r.alumno, monthLabel(m.ym), m.concept, m.amount, m.pending,
      m.paid ? 'Pagado' : m.partial ? 'Pago parcial' : m.overdue > 0 ? 'En mora' : m.agreement ? 'Acuerdo' : 'Pendiente',
      fmtDateOnly(m.due) || '', m.overdue || 0,
    ])));
    const ws2 = XLSX.utils.aoa_to_sheet(detail);
    ws2['!cols'] = [22, 12, 30, 12, 24, 14, 14, 16, 14, 12].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cobranza');
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle por mes');
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  }

  function exportPdf() {
    const w = window.open('', '_blank');
    if (!w) { setError('El navegador bloqueó la ventana. Permite ventanas emergentes para generar el PDF.'); return; }
    const head = COLUMNS.map((c) => `<th>${esc(c.label)}</th>`).join('');
    const body = rows.map((r) => `<tr>${COLUMNS.map((c) => `<td class="${c.align === 'right' ? 'r' : ''}">${esc(cellText(c, r))}</td>`).join('')}</tr>`).join('');
    const foot = `<tr class="t">${COLUMNS.map((c) => `<td class="${c.align === 'right' ? 'r' : ''}">${c.key === 'alumno' ? esc(`TOTAL · ${rows.length} alumno(s)`) : c.key === 'mesesAdeudo' ? totals.mesesAdeudo : c.key === 'adeudo' ? esc(money(totals.adeudo)) : ''}</td>`).join('')}</tr>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase)}</title><style>
      @page{size:landscape;margin:10mm} body{font-family:Arial,sans-serif;font-size:8px;color:#111}
      h1{font-size:14px;margin:0 0 4px} p{margin:0 0 3px;font-size:9px;color:#444}
      table{border-collapse:collapse;width:100%;margin-top:8px} th,td{border:1px solid #bbb;padding:2px 4px;vertical-align:top}
      th{background:#e8edf3;text-align:left} td.r{text-align:right} tr.t td{font-weight:bold;background:#f3f4f6} thead{display:table-header-group}
    </style></head><body><h1>Reporte de cobranza — Contraloría</h1><p>${esc(filterSummary)}</p><p>Generado: ${esc(new Date().toLocaleString('es-MX'))}</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table>
    <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wider font-semibold text-navy-400">Finanzas / Contraloría</p>
        <h1 className="font-display text-2xl font-bold text-navy-900 mt-1 flex items-center gap-2"><PhoneCall size={22}/> Cobranza por plantel</h1>
        <p className="text-sm text-navy-500 mt-1">Estatus de pago de cada alumno contra los meses que lleva el servicio. El plantel es el del padrón del alumno. Lo que ves en pantalla es lo que se descarga.</p>
      </div>

      <section className="admin-card">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="cb-school">Plantel</label>
            <select id="cb-school" className="admin-select w-full" value={filterSchool} onChange={(e) => { setFilterSchool(e.target.value); setLoaded(false); }}>
              <option value="">Selecciona un plantel…</option>
              <option value="__ALL__">Todos los planteles</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="admin-label" htmlFor="cb-cutoff">Fecha de corte</label>
            <input id="cb-cutoff" type="date" className="admin-input w-full" value={cutoff} onChange={(e) => setCutoff(e.target.value || localToday())} />
          </div>
          <div className="md:col-span-3 flex gap-2">
            <button type="button" className="btn-admin-primary" disabled={!filterSchool || loading} onClick={consult}>
              <RefreshCw size={14} className={`inline mr-2 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Consultando…' : loaded && loadedSchool === filterSchool ? 'Actualizar' : 'Consultar'}
            </button>
          </div>
        </div>
        {loaded && <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
          <div>
            <label className="admin-label" htmlFor="cb-status">Estatus</label>
            <select id="cb-status" className="admin-select w-full" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="admin-label" htmlFor="cb-months">Meses adeudados</label>
            <select id="cb-months" className="admin-select w-full" value={filterMonths} onChange={(e) => setFilterMonths(e.target.value)}>
              <option value="0">Cualquiera</option><option value="1">1 o más</option><option value="2">2 o más</option><option value="3">3 o más</option><option value="4">4 o más</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="cb-search">Buscar alumno, matrícula o responsable</label>
            <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
              <input id="cb-search" className="admin-input w-full pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" /></div>
          </div>
        </div>}
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2"><AlertTriangle size={18} className="shrink-0"/>{error}</div>}

      {!loaded ? (
        <div className="admin-card text-center py-10">
          <Users size={28} className="mx-auto text-navy-300 mb-2" />
          <p className="font-semibold text-navy-700">Selecciona un plantel y da clic en Consultar</p>
          <p className="text-sm text-navy-400 mt-1">Se calcula con las listas y cobros registrados al día de la fecha de corte.</p>
        </div>
      ) : (<>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="admin-card"><p className="text-xs text-navy-400">Alumnos</p><p className="text-xl font-bold">{totals.alumnos}</p></div>
          <div className="admin-card"><p className="text-xs text-navy-400">En mora</p><p className="text-xl font-bold text-red-700">{totals.mora}</p></div>
          <div className="admin-card"><p className="text-xs text-navy-400">Pendientes / acuerdo</p><p className="text-xl font-bold text-amber-700">{totals.pendiente}</p></div>
          <div className="admin-card"><p className="text-xs text-navy-400">Al corriente</p><p className="text-xl font-bold text-green-700">{totals.corriente}</p></div>
          <div className="admin-card"><p className="text-xs text-navy-400">Monto adeudado</p><p className="text-xl font-bold">{money(totals.adeudo)}</p></div>
        </div>

        <section className="admin-card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-navy-100 flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-semibold text-navy-800">{schoolTitle}</h2><p className="text-xs text-navy-400">{filterSummary}</p></div>
            <div className="flex gap-2">
              <button type="button" className="btn-admin-primary" disabled={!rows.length} onClick={exportExcel}><Download size={14} className="inline mr-2"/>Descargar Excel</button>
              <button type="button" className="btn-admin-ghost" disabled={!rows.length} onClick={exportPdf}><Printer size={14} className="inline mr-2"/>PDF / Imprimir</button>
            </div>
          </div>
          {rows.length === 0 ? <p className="p-6 text-sm text-navy-500 text-center">No hay alumnos con esos filtros.</p> : (
            <div className="overflow-auto max-h-[70vh]">
              <table className="table-admin text-xs min-w-[1500px]">
                <thead className="sticky top-0 bg-white z-10"><tr>
                  <th>#</th>
                  {COLUMNS.map((c) => <th key={c.key} className={c.align === 'right' ? 'text-right' : ''}>{c.label}</th>)}
                  <th></th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <Fragment key={r.id}>
                      <tr className={r.status === 'mora' ? 'bg-red-50/50' : ''}>
                        <td>{i + 1}</td>
                        {COLUMNS.map((c) => (
                          <td key={c.key} className={c.align === 'right' ? 'text-right' : ''}>
                            {c.key === 'status' ? <span className={`badge ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                              : c.key === 'mesesPagados' ? <span>{r.mesesPagados}<span className="text-navy-400"> de {r.mesesServicio}</span></span>
                              : cellText(c, r)}
                          </td>
                        ))}
                        <td><button type="button" title="Ver detalle por mes" onClick={() => setOpenId(openId === r.id ? '' : r.id)} className="p-1 rounded hover:bg-navy-50">{openId === r.id ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button></td>
                      </tr>
                      {openId === r.id && <tr><td colSpan={COLUMNS.length + 2} className="bg-navy-50/60">
                        <div className="p-3">
                          {r.months.length === 0 ? <p className="text-navy-500">Este alumno aún no tiene meses con cargo.</p> : (
                            <table className="table-admin text-xs w-auto"><thead><tr><th>Mes</th><th>Concepto</th><th className="text-right">Monto</th><th className="text-right">Pendiente</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody>
                              {r.months.map((m) => <tr key={m.ym}>
                                <td>{monthLabel(m.ym)}</td><td>{m.concept || '—'}</td><td className="text-right">{money(m.amount)}</td><td className="text-right">{money(m.pending)}</td>
                                <td>{fmtDateOnly(m.due) || '—'}</td>
                                <td>{m.paid ? <span className="badge badge-go">Pagado</span> : m.partial ? <span className="badge badge-amber">Pago parcial</span> : m.overdue > 0 ? <span className="badge badge-stop">En mora · {m.overdue} d</span> : m.agreement ? <span className="badge badge-amber">Acuerdo</span> : <span className="badge badge-amber">Pendiente</span>}</td>
                              </tr>)}
                            </tbody></table>
                          )}
                        </div>
                      </td></tr>}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p className="text-xs text-navy-400">«Meses de servicio» son los meses con cargo generado en listas hasta la fecha de corte. Un mes se considera pagado solo con folio de pago. El Excel incluye una segunda hoja con el detalle por mes.</p>
      </>)}
    </div>
  );
}
