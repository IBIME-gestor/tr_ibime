import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, RefreshCw, Download, Search, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
  Landmark, Link2, Unlink, RotateCcw, Check, Undo2,
} from 'lucide-react';
import { CometaBank, FinanceRecords, RouteLists, Schools, Students } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';
import { fmtDateOnly } from '../../utils/dates';

/* ------------------------------------------------------------------ */
/*  Banco de pagos Cometa — fase 1                                     */
/*  Importa el reporte de Metabase sin duplicar (folio de orden), ubica */
/*  al alumno por matrícula alfanumérica y conserva TODOS los pagos.   */
/*  Fase 2: aplica cada pago en Ruta Segura (lista, mes, días) y se    */
/*  puede deshacer. Cometa = banco; Ruta Segura = donde se marca.      */
/* ------------------------------------------------------------------ */

const money = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const headerKey = (v) => norm(v).replace(/\s+/g, '_');
const docId = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 140);

// ---- Matrícula alfanumérica -------------------------------------------------
const matKey = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const numKey = (k) => (/^\d+$/.test(k) ? k.replace(/^0+(?=\d)/, '') : '');
const tailKey = (k) => { const m = k.match(/(\d{3,})$/); return m ? m[1].replace(/^0+(?=\d)/, '') : ''; };

// ---- Plantel: "Coacalco SB - Instituto Bilingüe Ibime" → "coacalco sb" -------
const schoolKey = (name) => norm(name).replace(/\binstituto bilingue ibime\b/g, '').replace(/\bibime\b/g, '').trim();

function nameScore(a, b) {
  const aa = norm(a).split(' ').filter(Boolean); const bb = norm(b).split(' ').filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  const common = aa.filter((x) => bb.includes(x)).length;
  return common / Math.max(aa.length, bb.length);
}

// ---- Concepto de Cometa → zona y tipo (hay ~33 formas de escribirlo) ---------
function parseConcept(concepto) {
  const u = String(concepto || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const zona = /AMERICAS|AMAERICAS|AME\//.test(u) ? 'Américas / Jardines de Morelos'
    : /5\s*KM/.test(u) ? '5 km'
      : /OJO/.test(u) ? 'Ojo de Agua'
        : /TECAMAC/.test(u) ? 'Héroes Tecámac' : 'Sin zona';
  const tipo = /POR\s*D/.test(u) ? 'dia' : /^\s*MEDIO/.test(u) ? 'medio' : 'completo';
  return { zona, tipo };
}
const TIPO_LABEL = { dia: 'Por día', medio: 'Medio', completo: 'Completo' };

function toIso(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : s;
}

/** Lee el reporte de Metabase (una hoja, una fila por orden pagada). */
function parseWorkbook(buffer, fileName) {
  const wb = XLSX.read(buffer, { type: 'array' }); // fechas como número de serie: sin desfase de zona horaria
  const rows = [];
  wb.SheetNames.forEach((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });
    const hi = matrix.findIndex((r) => { const h = r.map(headerKey); return h.includes('matricula') && (h.includes('folio_orden') || h.includes('folio_pago')); });
    if (hi < 0) return;
    const headers = matrix[hi].map(headerKey);
    matrix.slice(hi + 1).forEach((r, i) => {
      const o = Object.fromEntries(headers.map((h, j) => [h, r[j] ?? '']));
      const matricula = String(o.matricula || '').trim();
      const nombre = String(o.nombre_alumno || '').trim();
      const apellido = String(o.apellido_alumno || '').trim();
      if (!matricula && !nombre && !apellido) return;
      const fechaPago = toIso(o.fecha_pago);
      const folioOrden = String(o.folio_orden || '').trim();
      const folioPago = String(o.folio_pago || '').trim();
      const monto = Number(o.monto_cobrado || 0);
      const concepto = String(o.concepto || o.orden || '').trim();
      const { zona, tipo } = parseConcept(concepto);
      rows.push({
        id: docId(folioOrden ? `${folioOrden}__${folioPago || 'x'}` : `${folioPago}_${matricula}_${fechaPago}_${monto}_${i}`),
        folioOrden, folioPago, fechaPago, monto,
        colegio: String(o.colegio || '').trim(),
        matricula, matriculaKey: matKey(matricula),
        nombre, apellido, alumno: `${nombre} ${apellido}`.trim(),
        concepto, zona, tipo,
        ciclo: String(o.ciclo_pagado || '').trim(),
        fechaVencimiento: toIso(o.fecha_vencimiento),
        lugarPago: String(o.lugar_pago || '').trim(),
        medioPago: String(o.medio_pago || '').trim(),
        tipoPago: String(o.tipo_pago || '').trim(),
        comentarios: String(o.comentarios || '').trim(),
        archivo: fileName,
      });
    });
  });
  return rows;
}


// ---- Helpers de listas (mismos que «Consultar listas») ----------------------
const dayUnits = (d) => (d?.entrada ? 1 : 0) + (d?.salida ? 1 : 0);
const serviceDates = (row) => Object.keys(row.days || {}).filter((d) => dayUnits(row.days[d]) > 0).sort();
const perDay = (row) => Number(row.baseAmount || 0);
const dateAmount = (row, d) => dayUnits(row.days?.[d]) * perDay(row);
const paidDatesOf = (row) => (row.paidDates || []).filter((d) => dayUnits(row.days?.[d]) > 0);
const r2 = (n) => Number(Number(n || 0).toFixed(2));
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const shortDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
/** Mes sugerido: el que diga el comentario («MES SEPTIEMBRE») o, si no, el de la fecha de pago. */
function suggestMonth(p) {
  const c = norm(p.comentarios);
  const i = MONTH_NAMES.findIndex((m) => c.includes(m) || (m === 'septiembre' && c.includes('setiembre')));
  const year = (p.fechaPago || '').slice(0, 4);
  if (i >= 0 && year) return `${year}-${String(i + 1).padStart(2, '0')}`;
  return (p.fechaPago || '').slice(0, 7);
}
const isDia = (p) => p.tipo === 'dia';

const UBI = {
  exacta:    { label: 'Ubicado por matrícula', cls: 'badge-go' },
  vinculada: { label: 'Vinculado manualmente', cls: 'badge-go' },
  probable:  { label: 'Probable · confirmar', cls: 'badge-amber' },
  revisar:   { label: 'Revisar', cls: 'badge-amber' },
  ninguna:   { label: 'Sin alumno en Ruta Segura', cls: 'badge-stop' },
};

export default function CometaBanco() {
  const { profile, user } = useAuth();
  const fileRef = useRef(null);
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fUbi, setFUbi] = useState('');
  const [fEstado, setFEstado] = useState('por_asignar');
  const [fColegio, setFColegio] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fLugar, setFLugar] = useState('');
  const [search, setSearch] = useState('');
  const [openKey, setOpenKey] = useState('');
  const [linkQuery, setLinkQuery] = useState('');
  const [apply, setApply] = useState(null); // { key, listId, picked: [paymentIds], dates: [] }

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const [pay, stu, sch, lst] = await Promise.all([CometaBank.list(), Students.list(), Schools.list(), RouteLists.list()]);
      setPayments(pay || []); setStudents(stu || []); setSchools(sch || []); setLists(lst || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo cargar el banco de pagos. Si es la primera vez, publica las reglas de Firestore (colección cometaPayments).');
    } finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);

  // ---- Ubicación del alumno (se recalcula con el padrón vigente) ------------
  const ctx = useMemo(() => {
    const schoolNameById = Object.fromEntries(schools.map((s) => [s.id, s.name]));
    const info = students.map((s) => {
      const k = matKey(s.matricula);
      return { s, k, n: numKey(k), t: tailKey(k) || numKey(k), school: schoolKey(schoolNameById[s.schoolId] || '') };
    });
    const add = (m, key, v) => { if (!key) return; if (!m.has(key)) m.set(key, []); m.get(key).push(v); };
    const byKey = new Map(); const byNum = new Map(); const byTail = new Map();
    info.forEach((x) => { add(byKey, x.k, x); add(byNum, x.n, x); add(byTail, x.t, x); });
    const listsByStudent = new Map();
    lists.forEach((l) => (l.rows || []).forEach((r) => add(listsByStudent, r.studentId, l)));
    return { info, byKey, byNum, byTail, listsByStudent, schoolNameById, byId: new Map(students.map((s) => [s.id, s])) };
  }, [students, schools, lists]);

  function locate(p) {
    const pk = schoolKey(p.colegio);
    const studentInfo = (s) => ({ s, school: schoolKey(ctx.schoolNameById[s.schoolId] || '') });
    if (p.linkedStudentId && ctx.byId.get(p.linkedStudentId)) {
      return { kind: 'vinculada', student: ctx.byId.get(p.linkedStudentId), flags: [] };
    }
    let cands = ctx.byKey.get(p.matriculaKey) || [];
    if (!cands.length && numKey(p.matriculaKey)) cands = ctx.byNum.get(numKey(p.matriculaKey)) || [];
    if (cands.length > 1) { const inSchool = cands.filter((x) => x.school === pk); if (inSchool.length === 1) cands = inSchool; }
    if (cands.length === 1) {
      const { s, school } = cands[0];
      const score = nameScore(p.alumno, s.name);
      const flags = [];
      if (score < 0.5) flags.push(`El nombre no coincide (${Math.round(score * 100)}%)`);
      if (school !== pk) flags.push('El plantel es distinto');
      return { kind: score < 0.5 ? 'revisar' : 'exacta', student: s, flags };
    }
    if (cands.length > 1) return { kind: 'revisar', student: null, flags: [`La matrícula está repetida en ${cands.length} alumnos`] };
    const tail = tailKey(p.matriculaKey) || numKey(p.matriculaKey);
    if (tail && tail.length >= 3) {
      const c = (ctx.byTail.get(tail) || []).filter((x) => x.school === pk && nameScore(p.alumno, x.s.name) >= 0.6);
      if (c.length === 1) return { kind: 'probable', student: c[0].s, flags: ['Misma terminación numérica y nombre similar'] };
    }
    const byName = ctx.info.filter((x) => x.school === pk && nameScore(p.alumno, x.s.name) >= 0.85);
    if (byName.length === 1) return { kind: 'probable', student: byName[0].s, flags: ['Coincide por nombre y plantel'] };
    return { kind: 'ninguna', student: null, flags: [] };
  }

  // Agrupa por alumno de Cometa (matrícula + colegio): así los pagos por día quedan acumulados.
  const groups = useMemo(() => {
    const map = new Map();
    payments.forEach((p) => {
      const key = `${p.matriculaKey || docId(p.alumno)}|${schoolKey(p.colegio)}`;
      if (!map.has(key)) map.set(key, { key, items: [] });
      map.get(key).items.push(p);
    });
    return [...map.values()].map((g) => {
      const first = g.items.find((p) => p.linkedStudentId) || g.items[0];
      return { ...g, matricula: first.matricula, alumno: first.alumno, colegio: first.colegio, loc: locate(first) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, ctx]);

  const colegios = useMemo(() => [...new Set(payments.map((p) => p.colegio).filter(Boolean))].sort(), [payments]);

  const view = useMemo(() => {
    const q = norm(search);
    return groups.map((g) => {
      const items = g.items.filter((p) => {
        if (fEstado && (p.status || 'por_asignar') !== fEstado) return false;
        if (fColegio && p.colegio !== fColegio) return false;
        if (fTipo && p.tipo !== fTipo) return false;
        if (fLugar && p.lugarPago !== fLugar) return false;
        return true;
      }).sort((a, b) => String(a.fechaPago).localeCompare(String(b.fechaPago)));
      return { ...g, shown: items };
    }).filter((g) => g.shown.length)
      .filter((g) => !fUbi || (fUbi === 'ubicado' ? ['exacta', 'vinculada'].includes(g.loc.kind) : fUbi === 'confirmar' ? ['probable', 'revisar'].includes(g.loc.kind) : g.loc.kind === 'ninguna'))
      .filter((g) => !q || norm([g.matricula, g.alumno, g.loc.student?.name, ...g.shown.map((p) => `${p.folioOrden} ${p.folioPago}`)].join(' ')).includes(q))
      .sort((a, b) => a.colegio.localeCompare(b.colegio, 'es') || a.alumno.localeCompare(b.alumno, 'es'));
  }, [groups, fUbi, fEstado, fColegio, fTipo, fLugar, search]);

  const shownPayments = view.flatMap((g) => g.shown.map((p) => ({ p, g })));
  const sum = (arr) => arr.reduce((n, x) => n + Number(x.monto || 0), 0);
  const stats = useMemo(() => {
    const all = groups.flatMap((g) => g.items.map((p) => ({ p, g })));
    const by = (fn) => all.filter(fn);
    return {
      total: all.length, monto: sum(all.map((x) => x.p)),
      porAsignar: by((x) => (x.p.status || 'por_asignar') === 'por_asignar'),
      ubicados: by((x) => ['exacta', 'vinculada'].includes(x.g.loc.kind) && (x.p.status || 'por_asignar') === 'por_asignar'),
      confirmar: by((x) => ['probable', 'revisar'].includes(x.g.loc.kind) && (x.p.status || 'por_asignar') === 'por_asignar'),
      sinAlumno: by((x) => x.g.loc.kind === 'ninguna' && (x.p.status || 'por_asignar') === 'por_asignar'),
      conciliados: by((x) => x.p.status === 'conciliado'),
    };
  }, [groups]);

  // ---- Importar --------------------------------------------------------------
  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setBusy('import'); setError(''); setNotice('');
    try {
      const rows = parseWorkbook(await file.arrayBuffer(), file.name);
      if (!rows.length) throw new Error('No se encontraron pagos. El archivo debe traer columnas como matricula, folio_orden, monto_cobrado y fecha_pago.');
      const known = new Set(payments.map((p) => p.id));
      const seen = new Set();
      const fresh = rows.filter((r) => { if (known.has(r.id) || seen.has(r.id)) return false; seen.add(r.id); return true; })
        .map((r) => ({ ...r, status: 'por_asignar', importedBy: profile?.name || user?.email || '', importedAt: new Date().toISOString() }));
      if (fresh.length) await CometaBank.createMany(fresh);
      await loadAll();
      setNotice(`Archivo leído: ${rows.length} pago(s). Nuevos: ${fresh.length} (${money(sum(fresh))}). Ya estaban en el banco: ${rows.length - fresh.length} (no se duplicaron).`);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudo leer el archivo.');
    } finally { setBusy(''); }
  }

  // ---- Acciones (todas reversibles; nada se borra) -----------------------------
  async function patchPayments(ids, patch, okMsg) {
    setBusy('patch'); setError(''); setNotice('');
    try {
      await CometaBank.updateMany(ids, patch);
      const set = new Set(ids);
      setPayments((prev) => prev.map((p) => (set.has(p.id) ? { ...p, ...patch } : p)));
      if (okMsg) setNotice(okMsg);
    } catch (e) {
      console.error(e); setError(e?.message || 'No se pudo guardar el cambio.');
    } finally { setBusy(''); }
  }
  const actor = () => profile?.name || user?.email || '';

  function link(group, student) {
    patchPayments(group.items.map((p) => p.id),
      { linkedStudentId: student.id, linkedStudentName: student.name, linkedBy: actor(), linkedAt: new Date().toISOString() },
      `${group.alumno} quedó vinculado a ${student.name}. Aplica a los ${group.items.length} pago(s) de esa matrícula.`);
    setLinkQuery('');
  }
  function unlink(group) {
    patchPayments(group.items.map((p) => p.id), { linkedStudentId: '', linkedStudentName: '', linkedBy: '', linkedAt: '' }, 'Vínculo quitado.');
  }
  function reconcile(items) {
    const note = window.prompt('Se marcará como CONCILIADO: ya estaba registrado en Ruta Segura (no se mueve dinero). Nota opcional:', 'Ya registrado en Caja');
    if (note === null) return;
    patchPayments(items.map((p) => p.id), { status: 'conciliado', reconciledNote: note, reconciledBy: actor(), reconciledAt: new Date().toISOString() },
      `${items.length} pago(s) marcados como conciliados.`);
  }
  function revert(items) {
    patchPayments(items.map((p) => p.id), { status: 'por_asignar', reconciledNote: '', reconciledBy: '', reconciledAt: '' }, `${items.length} pago(s) regresaron a «Por asignar».`);
  }


  // ---- Aplicar en Ruta Segura --------------------------------------------------
  const listsOf = (student) => (ctx.listsByStudent.get(student.id) || []).slice().sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const rowOf = (list, student) => (list?.rows || []).find((r) => r.studentId === student.id);
  const pendingOf = (group) => group.items.filter((p) => (p.status || 'por_asignar') === 'por_asignar')
    .sort((a, b) => String(a.fechaPago).localeCompare(String(b.fechaPago)));

  function defaultsFor(group, student, listId) {
    const list = lists.find((l) => l.id === listId);
    const row = rowOf(list, student);
    const month = String(list?.startDate || '').slice(0, 7);
    const pend = pendingOf(group);
    const diario = row?.tipoServicio === 'diario';
    let picked;
    if (diario) {
      const days = pend.filter(isDia);
      const inMonth = days.filter((p) => suggestMonth(p) === month);
      picked = (inMonth.length ? inMonth : days).map((p) => p.id);
    } else {
      const fixed = pend.filter((p) => !isDia(p));
      picked = (fixed.find((p) => suggestMonth(p) === month) || fixed[0]) ? [(fixed.find((p) => suggestMonth(p) === month) || fixed[0]).id] : [];
    }
    let dates = [];
    if (diario && row) {
      const free = serviceDates(row).filter((d) => !paidDatesOf(row).includes(d));
      dates = free.slice(0, picked.length);
    }
    return { listId, picked, dates };
  }

  function openApply(group, student) {
    if (apply?.key === group.key) { setApply(null); return; }
    const sl = listsOf(student);
    const pend = pendingOf(group);
    const sug = pend[0] ? suggestMonth(pend[0]) : '';
    const list = sl.find((l) => String(l.startDate).slice(0, 7) === sug) || sl[0];
    setApply({ key: group.key, ...defaultsFor(group, student, list?.id) });
  }

  function togglePick(id) {
    setApply((a) => a && ({ ...a, picked: a.picked.includes(id) ? a.picked.filter((x) => x !== id) : [...a.picked, id] }));
  }
  function toggleDate(d) {
    setApply((a) => a && ({ ...a, dates: a.dates.includes(d) ? a.dates.filter((x) => x !== d) : [...a.dates, d].sort() }));
  }

  async function applyPayments(group, student) {
    const list = lists.find((l) => l.id === apply.listId);
    const row = rowOf(list, student);
    const pays = pendingOf(group).filter((p) => apply.picked.includes(p.id));
    if (!list || !row || !pays.length) return;
    const diario = row.tipoServicio === 'diario';
    const cometaSum = pays.reduce((n, p) => n + Number(p.monto || 0), 0);
    const dates = [...apply.dates].sort();
    if (diario && dates.length !== pays.length) { setError(`Elige exactamente ${pays.length} día(s) de servicio, uno por cada pago.`); return; }
    if (!diario && row.paid) { setError('Este alumno ya aparece como PAGADO en esa lista. Si el pago ya estaba, márcalo como conciliado en lugar de aplicarlo otra vez.'); return; }

    let total; let complete; let nextRow;
    if (diario) {
      const nextPaid = [...new Set([...paidDatesOf(row), ...dates])].sort();
      const sd = serviceDates(row);
      complete = sd.length > 0 && sd.every((d) => nextPaid.includes(d));
      total = nextPaid.reduce((n, d) => n + dateAmount(row, d), 0);
      nextRow = { ...row, paidDates: nextPaid, paidAmount: r2(total), paid: complete };
    } else {
      total = Number(row.paidAmount || 0) + cometaSum;
      complete = total >= Number(row.estimatedAmount || 0) - 0.009;
      nextRow = { ...row, paidAmount: r2(total), paid: complete };
    }
    const expected = diario ? perDay(row) * pays.length : Number(row.estimatedAmount || 0) - Number(row.paidAmount || 0);
    const diff = r2(cometaSum - expected);
    const msg = `¿Aplicar ${pays.length} pago(s) de Cometa por ${money(cometaSum)} a ${student.name}?\n`
      + `Lista: ${list.listName || list.startDate} (${String(list.startDate).slice(0, 7)})\n`
      + (diario ? `Días: ${dates.map(shortDay).join(', ')}\n` : '')
      + (Math.abs(diff) > 0.009 ? `\nOJO: Cometa cobró ${money(cometaSum)} y Ruta Segura espera ${money(expected)} (diferencia ${money(diff)}).\n` : '')
      + (complete ? '\nQuedará PAGADO completo.' : '\nQuedará con saldo pendiente.');
    if (!window.confirm(msg)) return;

    setBusy('apply'); setError(''); setNotice('');
    try {
      const sameBucket = payments.filter((p) => p.status === 'asignado' && row.paymentId && p.paymentId === row.paymentId);
      const folios = [...new Set([...sameBucket, ...pays].map((p) => p.folioOrden).filter(Boolean))];
      const paymentId = await Students.recordPartialPayment(student.id, {
        paymentId: row.paymentId || '', totalPaid: r2(total), complete,
        nextDueDate: list.endDate, method: 'cometa',
        note: `Cometa · ${folios.join(', ')} · lista ${list.startDate} al ${list.endDate}`,
        byName: profile?.name, byUid: user?.uid, routeId: list.routeId, unitId: '', listId: list.id,
        extra: { cometaFolios: folios, source: 'cometa' },
      });
      nextRow.paymentId = paymentId;
      const rows = (list.rows || []).map((r) => (r.studentId === student.id ? nextRow : r));
      await RouteLists.update(list.id, { rows });
      await FinanceRecords.upsert(`${list.id}_${student.id}`, complete
        ? { cobrado: true, pagoId: paymentId, cobradoAt: new Date().toISOString(), cobradoBy: profile?.name || '', montoPagado: r2(total), fuentePago: 'cometa' }
        : { cobrado: false, montoPagado: r2(total), fuentePago: 'cometa' });
      const now = new Date().toISOString();
      const entries = pays.map((p, i) => ({ id: p.id, patch: {
        status: 'asignado', studentId: student.id, studentName: student.name, listId: list.id, listName: list.listName || '',
        appliedMonth: String(list.startDate).slice(0, 7), appliedDate: diario ? dates[i] : '', paymentId, appliedBy: actor(), appliedAt: now,
      } }));
      try { await CometaBank.updateEach(entries); } catch (be) {
        console.error(be);
        setError('El pago SÍ se aplicó en Ruta Segura, pero no se pudo actualizar el banco. No lo repitas: presiona Actualizar y revisa.');
      }
      setPayments((prev) => prev.map((p) => { const e = entries.find((x) => x.id === p.id); return e ? { ...p, ...e.patch } : p; }));
      setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, rows } : l)));
      setApply(null);
      setNotice(`${student.name}: ${pays.length} pago(s) aplicados (${money(cometaSum)}). ${complete ? 'Quedó pagado completo.' : `Pagado ${money(total)}; pendiente ${money(Math.max(0, Number(row.estimatedAmount || 0) - total))}.`}`);
    } catch (e) {
      console.error(e); setError(e?.message || 'No se pudo aplicar el pago.');
    } finally { setBusy(''); }
  }

  async function undoApply(p) {
    const list = lists.find((l) => l.id === p.listId);
    const student = ctx.byId.get(p.studentId);
    const row = list?.rows?.find((r) => r.studentId === p.studentId);
    if (!window.confirm(`¿Deshacer la aplicación del pago ${p.folioOrden} (${money(p.monto)})? Se quitará de la lista y el pago volverá a «Por asignar».`)) return;
    setBusy('undo'); setError(''); setNotice('');
    try {
      const others = payments.filter((x) => x.id !== p.id && x.status === 'asignado' && x.paymentId && x.paymentId === p.paymentId);
      if (list && row && student) {
        let total; let nextRow;
        if (row.tipoServicio === 'diario') {
          const nextPaid = paidDatesOf(row).filter((d) => d !== p.appliedDate);
          total = nextPaid.reduce((n, d) => n + dateAmount(row, d), 0);
          nextRow = { ...row, paidDates: nextPaid, paidAmount: r2(total), paid: false };
        } else {
          total = Math.max(0, Number(row.paidAmount || 0) - Number(p.monto || 0));
          nextRow = { ...row, paidAmount: r2(total), paid: false };
        }
        if (!others.length) {
          if (p.paymentId) await Students.cancelPayment(student.id, p.paymentId, `Cometa ${p.folioOrden} deshecho desde el banco`, profile?.name);
          nextRow = { ...nextRow, paymentId: '', paidDates: row.tipoServicio === 'diario' ? [] : row.paidDates, paidAmount: 0 };
          total = 0;
        } else {
          await Students.recordPartialPayment(student.id, {
            paymentId: p.paymentId, totalPaid: r2(total), complete: false, nextDueDate: list.endDate, method: 'cometa',
            note: `Cometa · ${others.map((x) => x.folioOrden).join(', ')} · lista ${list.startDate} al ${list.endDate}`,
            byName: profile?.name, byUid: user?.uid, routeId: list.routeId, listId: list.id,
            extra: { cometaFolios: others.map((x) => x.folioOrden), source: 'cometa' },
          });
        }
        const rows = (list.rows || []).map((r) => (r.studentId === student.id ? nextRow : r));
        await RouteLists.update(list.id, { rows });
        await FinanceRecords.upsert(`${list.id}_${student.id}`, { cobrado: false, ...(others.length ? {} : { pagoId: '' }), montoPagado: r2(total) });
        setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, rows } : l)));
      } else if (!others.length && p.paymentId && student) {
        await Students.cancelPayment(student.id, p.paymentId, `Cometa ${p.folioOrden} deshecho (la lista ya no existe)`, profile?.name);
      }
      const clear = { status: 'por_asignar', studentId: '', studentName: '', listId: '', listName: '', appliedMonth: '', appliedDate: '', paymentId: '', appliedBy: '', appliedAt: '' };
      await CometaBank.updateMany([p.id], clear);
      setPayments((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...clear } : x)));
      setNotice(`Pago ${p.folioOrden} regresó a «Por asignar».`);
    } catch (e) {
      console.error(e); setError(e?.message || 'No se pudo deshacer.');
    } finally { setBusy(''); }
  }

  // ---- Exportar lo que se ve ---------------------------------------------------
  function exportExcel() {
    const header = ['Colegio (Cometa)', 'Matrícula Cometa', 'Alumno Cometa', 'Ubicación', 'Alumno en Ruta Segura', 'Matrícula Ruta Segura', 'Plantel Ruta Segura',
      'En listas', 'Fecha de pago', 'Folio orden', 'Folio pago', 'Zona', 'Tipo', 'Concepto', 'Monto', 'Lugar de pago', 'Medio', 'Estado', 'Comentarios'];
    const body = shownPayments.map(({ p, g }) => {
      const s = g.loc.student;
      return [p.colegio, p.matricula, p.alumno, UBI[g.loc.kind].label, s?.name || '', s?.matricula || '', s ? (ctx.schoolNameById[s.schoolId] || '') : '',
        s ? (ctx.listsByStudent.get(s.id) || []).length : '', p.fechaPago, p.folioOrden, p.folioPago, p.zona, TIPO_LABEL[p.tipo], p.concepto, Number(p.monto || 0),
        p.lugarPago, p.medioPago, p.status === 'conciliado' ? 'Conciliado' : p.status === 'asignado' ? 'Asignado' : 'Por asignar', p.comentarios];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = [30, 14, 30, 24, 30, 14, 22, 8, 12, 14, 14, 24, 10, 44, 12, 12, 16, 12, 40].map((wch) => ({ wch }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: body.length, c: header.length - 1 } }) };
    for (let i = 1; i <= body.length; i += 1) { const c = ws[XLSX.utils.encode_cell({ r: i, c: 14 })]; if (c) c.z = '"$"#,##0.00'; }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Banco Cometa');
    XLSX.writeFile(wb, `banco_pagos_cometa_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const candidates = (group) => {
    const q = norm(linkQuery);
    if (q.length < 2) return [];
    return ctx.info.map((x) => ({ ...x, sc: Math.max(nameScore(group.alumno, x.s.name), norm(x.s.name).includes(q) ? 0.9 : 0, matKey(x.s.matricula).includes(matKey(linkQuery)) && matKey(linkQuery) ? 1 : 0) }))
      .filter((x) => norm([x.s.name, x.s.matricula].join(' ')).includes(q) || x.sc >= 0.6).sort((a, b) => b.sc - a.sc).slice(0, 8);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-navy-400">Finanzas / Cometa</p>
          <h1 className="font-display text-2xl font-bold text-navy-900 mt-1 flex items-center gap-2"><Landmark size={22}/> Banco de pagos Cometa</h1>
          <p className="text-sm text-navy-500 mt-1 max-w-3xl">Aquí llegan todos los pagos de Cometa y se quedan hasta que se apliquen. Nada se borra: cada pago conserva su folio y solo cambia de estado. Los pagos de alumnos que aún no están en Ruta Segura esperan aquí a que los des de alta y los ubiques en una lista.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-admin-ghost" onClick={loadAll} disabled={loading || !!busy}><RefreshCw size={14} className={`inline mr-2 ${loading ? 'animate-spin' : ''}`}/>Actualizar</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
          <button className="btn-admin-primary" onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload size={14} className="inline mr-2"/>{busy === 'import' ? 'Importando…' : 'Subir reporte'}</button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2"><AlertTriangle size={18} className="shrink-0"/>{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 size={18} className="shrink-0"/>{notice}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="admin-card"><p className="text-xs text-navy-400">Pagos en el banco</p><p className="text-xl font-bold">{stats.total}</p><p className="text-[11px] text-navy-400">{money(stats.monto)}</p></div>
        <div className="admin-card"><p className="text-xs text-navy-400">Alumno ubicado</p><p className="text-xl font-bold text-green-700">{stats.ubicados.length}</p><p className="text-[11px] text-navy-400">{money(sum(stats.ubicados.map((x) => x.p)))} por asignar</p></div>
        <div className="admin-card"><p className="text-xs text-navy-400">Por confirmar</p><p className="text-xl font-bold text-amber-700">{stats.confirmar.length}</p><p className="text-[11px] text-navy-400">{money(sum(stats.confirmar.map((x) => x.p)))}</p></div>
        <div className="admin-card"><p className="text-xs text-navy-400">Sin alumno en Ruta Segura</p><p className="text-xl font-bold text-red-700">{stats.sinAlumno.length}</p><p className="text-[11px] text-navy-400">{money(sum(stats.sinAlumno.map((x) => x.p)))}</p></div>
        <div className="admin-card"><p className="text-xs text-navy-400">Conciliados</p><p className="text-xl font-bold">{stats.conciliados.length}</p><p className="text-[11px] text-navy-400">{money(sum(stats.conciliados.map((x) => x.p)))}</p></div>
      </div>

      <section className="admin-card">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div><label className="admin-label">Estado</label><select className="admin-select w-full" value={fEstado} onChange={(e) => setFEstado(e.target.value)}><option value="por_asignar">Por asignar</option><option value="conciliado">Conciliados</option><option value="asignado">Asignados</option><option value="">Todos</option></select></div>
          <div><label className="admin-label">Ubicación</label><select className="admin-select w-full" value={fUbi} onChange={(e) => setFUbi(e.target.value)}><option value="">Todas</option><option value="ubicado">Alumno ubicado</option><option value="confirmar">Por confirmar</option><option value="sin">Sin alumno en Ruta Segura</option></select></div>
          <div><label className="admin-label">Colegio</label><select className="admin-select w-full" value={fColegio} onChange={(e) => setFColegio(e.target.value)}><option value="">Todos</option>{colegios.map((c) => <option key={c} value={c}>{c.replace(' - Instituto Bilingüe Ibime', '')}</option>)}</select></div>
          <div><label className="admin-label">Tipo</label><select className="admin-select w-full" value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="">Todos</option><option value="dia">Por día</option><option value="medio">Medio</option><option value="completo">Completo</option></select></div>
          <div><label className="admin-label">Se pagó en</label><select className="admin-select w-full" value={fLugar} onChange={(e) => setFLugar(e.target.value)}><option value="">Todos</option><option value="Colegio">Colegio</option><option value="Cometa">Cometa (en línea)</option></select></div>
          <div><label className="admin-label">Buscar</label><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"/><input className="admin-input w-full pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Matrícula, alumno, folio…"/></div></div>
        </div>
      </section>

      <section className="admin-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-100 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-navy-600"><b>{view.length}</b> alumno(s) · <b>{shownPayments.length}</b> pago(s) · <b>{money(sum(shownPayments.map((x) => x.p)))}</b></p>
          <button className="btn-admin-ghost" onClick={exportExcel} disabled={!shownPayments.length}><Download size={14} className="inline mr-2"/>Descargar lo que veo</button>
        </div>
        {loading ? <p className="p-5 text-sm text-navy-500">Cargando banco…</p> : !payments.length ? (
          <div className="p-10 text-center"><Landmark size={28} className="mx-auto text-navy-300 mb-2"/><p className="font-semibold text-navy-700">El banco está vacío</p><p className="text-sm text-navy-400 mt-1">Sube el reporte de Metabase («Resultado de la consulta») con el botón «Subir reporte».</p></div>
        ) : !view.length ? <p className="p-6 text-sm text-navy-500 text-center">No hay pagos con esos filtros.</p> : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="table-admin text-xs min-w-[1100px]">
              <thead className="sticky top-0 bg-white z-10"><tr><th></th><th>Matrícula Cometa</th><th>Alumno (Cometa)</th><th>Colegio</th><th className="text-right">Pagos</th><th>Detalle</th><th className="text-right">Monto</th><th>Ubicación</th><th>Alumno en Ruta Segura</th><th>Listas</th></tr></thead>
              <tbody>
                {view.map((g) => {
                  const s = g.loc.student;
                  const nLists = s ? (ctx.listsByStudent.get(s.id) || []).length : 0;
                  const byTipo = ['dia', 'medio', 'completo'].map((t) => [t, g.shown.filter((p) => p.tipo === t).length]).filter(([, n]) => n);
                  const isOpen = openKey === g.key;
                  const ids = g.shown.map((p) => p.id);
                  const allReconciled = g.shown.every((p) => p.status === 'conciliado');
                  return (
                    <Fragment key={g.key}>
                      <tr className="cursor-pointer hover:bg-navy-50" onClick={() => { setOpenKey(isOpen ? '' : g.key); setLinkQuery(''); }}>
                        <td>{isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</td>
                        <td className="font-mono">{g.matricula || '—'}</td>
                        <td className="font-medium">{g.alumno}</td>
                        <td>{g.colegio.replace(' - Instituto Bilingüe Ibime', '')}</td>
                        <td className="text-right">{g.shown.length}</td>
                        <td>{byTipo.map(([t, n]) => `${TIPO_LABEL[t]} ×${n}`).join(' · ')}</td>
                        <td className="text-right">{money(sum(g.shown))}</td>
                        <td><span className={`badge ${UBI[g.loc.kind].cls}`}>{UBI[g.loc.kind].label}</span></td>
                        <td>{s ? <>{s.name}<span className="block text-[10px] text-navy-400 font-mono">{s.matricula || 'sin matrícula'}</span></> : '—'}</td>
                        <td>{s ? (nLists ? `${nLists} lista(s)` : <span className="text-amber-700">Sin lista aún</span>) : '—'}</td>
                      </tr>
                      {isOpen && <tr><td colSpan={10} className="bg-navy-50/60"><div className="p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                        {g.loc.flags.length > 0 && <p className="text-amber-800 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5"/>{g.loc.flags.join(' · ')}</p>}
                        <div className="flex flex-wrap gap-2">
                          {s && ['probable', 'revisar'].includes(g.loc.kind) && <button className="btn-admin-primary" disabled={!!busy} onClick={() => link(g, s)}><Check size={13} className="inline mr-1"/>Confirmar que es {s.name}</button>}
                          {g.loc.kind === 'vinculada' && <button className="btn-admin-ghost" disabled={!!busy} onClick={() => unlink(g)}><Unlink size={13} className="inline mr-1"/>Quitar vínculo</button>}
                          {!allReconciled && <button className="btn-admin-ghost" disabled={!!busy} onClick={() => reconcile(g.shown.filter((p) => p.status !== 'conciliado'))}><Check size={13} className="inline mr-1"/>Marcar como conciliado (ya estaba en Caja)</button>}
                          {g.shown.some((p) => p.status === 'conciliado') && <button className="btn-admin-ghost" disabled={!!busy} onClick={() => revert(g.shown.filter((p) => p.status === 'conciliado'))}><RotateCcw size={13} className="inline mr-1"/>Regresar a por asignar</button>}
                        </div>
                        {g.loc.kind !== 'vinculada' && <div>
                          <label className="admin-label flex items-center gap-1"><Link2 size={12}/> {s ? 'Vincular a otro alumno' : 'Vincular a un alumno del padrón'} (nombre o matrícula)</label>
                          <input className="admin-input w-full md:w-96" value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder="Escribe al menos 2 letras o la matrícula…"/>
                          {candidates(g).length > 0 && <div className="mt-2 grid gap-1 md:w-[36rem]">{candidates(g).map((c) => (
                            <button key={c.s.id} type="button" disabled={!!busy} onClick={() => link(g, c.s)} className="text-left rounded-lg border border-navy-200 bg-white px-3 py-1.5 hover:bg-navy-50">
                              <span className="font-medium">{c.s.name}</span> <span className="font-mono text-navy-500">{c.s.matricula || 'sin matrícula'}</span> <span className="text-navy-400">· {ctx.schoolNameById[c.s.schoolId] || 'Sin plantel'}</span>
                            </button>))}</div>}
                        </div>}
                        {['exacta', 'vinculada'].includes(g.loc.kind) && s && (() => {
                          const pend = pendingOf(g);
                          const sl = listsOf(s);
                          if (!pend.length) return null;
                          if (!sl.length) return <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">{s.name} todavía no está en ninguna lista. Los {pend.length} pago(s) esperan aquí: ubícalo en una lista (Operación → Generar listas) y regresa a aplicar.</p>;
                          const open = apply?.key === g.key;
                          const list = open ? lists.find((l) => l.id === apply.listId) : null;
                          const row = list ? rowOf(list, s) : null;
                          const diario = row?.tipoServicio === 'diario';
                          const picked = open ? pend.filter((x) => apply.picked.includes(x.id)) : [];
                          const sumPicked = picked.reduce((n, x) => n + Number(x.monto || 0), 0);
                          const free = diario ? serviceDates(row).filter((d) => !paidDatesOf(row).includes(d)) : [];
                          const warns = [];
                          if (row) {
                            if (!diario && row.paid) warns.push('Ya está marcado como PAGADO en esta lista (¿ya se había registrado?). Si es así, concílialo en vez de aplicarlo.');
                            if (picked.some(isDia) && !diario) warns.push('Hay pagos «por día» pero el alumno en esta lista es de servicio ' + (row.tipoServicio === 'medio' ? 'medio' : 'completo') + '.');
                            if (picked.some((x) => !isDia(x)) && diario) warns.push('Hay pagos mensuales pero el alumno en esta lista es de servicio diario.');
                          }
                          return (
                            <div className="rounded-xl border border-navy-200 bg-white p-3 space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-navy-800">Aplicar en Ruta Segura · {pend.length} pago(s) por asignar</p>
                                <button type="button" className={open ? 'btn-admin-ghost' : 'btn-admin-primary'} disabled={!!busy} onClick={() => openApply(g, s)}>{open ? 'Cerrar' : 'Aplicar pagos…'}</button>
                              </div>
                              {open && <>
                                <div className="grid md:grid-cols-2 gap-3">
                                  <div>
                                    <label className="admin-label">Lista y mes donde se marca</label>
                                    <select className="admin-select w-full" value={apply.listId || ''} onChange={(e) => setApply({ key: g.key, ...defaultsFor(g, s, e.target.value) })}>
                                      {sl.map((l) => { const r = rowOf(l, s); return <option key={l.id} value={l.id}>{String(l.startDate).slice(0, 7)} · {l.listName || 'Lista'} · {l.startDate} al {l.endDate} · {r?.paid ? 'PAGADO' : `${money(r?.estimatedAmount)}`}</option>; })}
                                    </select>
                                  </div>
                                  {row && <div className="text-navy-600 self-end">Servicio: <b>{row.tipoServicio === 'diario' ? 'Diario' : row.tipoServicio === 'medio' ? 'Medio' : 'Completo'}</b> · Monto de la lista: <b>{money(row.estimatedAmount)}</b>{Number(row.paidAmount || 0) > 0 && !row.paid ? <> · Ya pagado: <b>{money(row.paidAmount)}</b></> : null}</div>}
                                </div>
                                <div>
                                  <label className="admin-label">Pagos de Cometa a aplicar</label>
                                  <div className="flex flex-wrap gap-2">
                                    {pend.map((x) => <label key={x.id} className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1 cursor-pointer ${apply.picked.includes(x.id) ? 'border-navy-500 bg-navy-50' : 'border-navy-200'}`}>
                                      <input type="checkbox" className="w-4 h-4" checked={apply.picked.includes(x.id)} onChange={() => togglePick(x.id)} />
                                      <span>{fmtDateOnly(x.fechaPago)} · {TIPO_LABEL[x.tipo]} · {money(x.monto)} · <span className="font-mono">{x.folioOrden}</span></span>
                                    </label>)}
                                  </div>
                                </div>
                                {diario && <div>
                                  <label className="admin-label">Días de servicio que cubren ({apply.dates.length} de {picked.length} elegidos)</label>
                                  <div className="flex flex-wrap gap-2">
                                    {serviceDates(row).map((d) => { const isPaid = paidDatesOf(row).includes(d); const on = apply.dates.includes(d);
                                      return <label key={d} className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${isPaid ? 'border-green-300 bg-green-50 text-green-800' : on ? 'border-navy-500 bg-navy-50 cursor-pointer' : 'border-navy-200 cursor-pointer'}`}>
                                        <input type="checkbox" className="w-4 h-4" checked={isPaid || on} disabled={isPaid} onChange={() => toggleDate(d)} />
                                        <span>{shortDay(d)}{isPaid ? ' · pagado' : ''}</span>
                                      </label>; })}
                                  </div>
                                  <button type="button" className="btn-admin-ghost mt-2" onClick={() => setApply((a) => ({ ...a, dates: free.slice(0, picked.length) }))}>Elegir los primeros {picked.length} pendientes</button>
                                </div>}
                                {warns.map((w) => <p key={w} className="text-amber-800 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5"/>{w}</p>)}
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-navy-600">Cometa: <b>{picked.length}</b> pago(s) · <b>{money(sumPicked)}</b>{diario && row ? <> · Tarifa Ruta Segura: <b>{money(perDay(row) * picked.length)}</b></> : null}</span>
                                  <button type="button" className="btn-admin-primary" disabled={!!busy || !picked.length || !row || (!diario && row.paid) || (diario && apply.dates.length !== picked.length)} onClick={() => applyPayments(g, s)}>{busy === 'apply' ? 'Aplicando…' : 'Aplicar y marcar pagado'}</button>
                                </div>
                              </>}
                            </div>
                          );
                        })()}
                        {s && ['probable', 'revisar'].includes(g.loc.kind) && <p className="text-amber-800">Confirma que el alumno es correcto (botón de arriba) para poder aplicar sus pagos.</p>}
                        <table className="table-admin text-xs w-full bg-white"><thead><tr><th>Fecha de pago</th><th>Folio orden</th><th>Folio pago</th><th>Zona</th><th>Tipo</th><th>Concepto en Cometa</th><th className="text-right">Monto</th><th>Pagó en</th><th>Comentarios</th><th>Estado</th></tr></thead><tbody>
                          {g.shown.map((p) => <tr key={p.id}>
                            <td>{fmtDateOnly(p.fechaPago) || p.fechaPago}</td><td className="font-mono">{p.folioOrden}</td><td className="font-mono">{p.folioPago}</td>
                            <td>{p.zona}</td><td>{TIPO_LABEL[p.tipo]}</td><td className="max-w-[260px] truncate" title={p.concepto}>{p.concepto}</td>
                            <td className="text-right">{money(p.monto)}</td><td>{p.lugarPago}{p.medioPago ? ` · ${p.medioPago}` : ''}</td><td>{p.comentarios || '—'}</td>
                            <td>{p.status === 'conciliado' ? <span className="badge">Conciliado</span> : p.status === 'asignado' ? <span className="badge badge-go">Asignado</span> : <span className="badge badge-amber">Por asignar</span>}{p.reconciledNote ? <span className="block text-[10px] text-navy-400">{p.reconciledNote}</span> : null}
                              {p.status === 'asignado' && <><span className="block text-[10px] text-navy-500">{p.appliedMonth} · {p.listName || 'lista'}{p.appliedDate ? ` · ${fmtDateOnly(p.appliedDate)}` : ''}</span><button type="button" className="text-[11px] text-red-700 underline" disabled={!!busy} onClick={() => undoApply(p)}><Undo2 size={11} className="inline mr-1"/>Deshacer</button></>}</td>
                          </tr>)}
                        </tbody></table>
                        <p className="text-[11px] text-navy-400">{ids.length} pago(s) · {g.items.length !== g.shown.length ? `${g.items.length} en total para esta matrícula (hay otros que no pasan el filtro)` : 'todos los de esta matrícula'}.</p>
                      </div></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
