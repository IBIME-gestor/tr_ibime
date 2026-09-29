import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Download,
  FileSpreadsheet, Search, ChevronRight, RotateCcw, Mail, Users,
} from 'lucide-react';
import { Cometa, FinanceRecords, RouteLists, Schools, Students } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';

const PAYMENT_SHEET = 'Pagos de Transporte';
const PENDING_SHEET = 'Pendientes de Pago';

function norm(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function money(n) {
  return `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function cleanHeader(v) { return norm(v).replace(/\s+/g, ' '); }
function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const h = row.map(cleanHeader);
    return h.includes('plantel') && h.includes('alumno') && h.includes('matricula');
  });
}
function toIso(v) {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : s;
}
function parseSheet(workbook, sheetName, type) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((h) => String(h || '').trim());
  return rows.slice(headerIndex + 1).map((row, i) => {
    const raw = Object.fromEntries(headers.map((h, j) => [h, row[j] ?? '']));
    const record = {
      rowNumber: headerIndex + i + 2,
      sheet: sheetName,
      sheetType: type,
      plantel: String(raw.Plantel || '').trim(),
      concepto: String(raw.Concepto || '').trim(),
      ciclo: String(raw.Ciclo || '').trim(),
      alumno: String(raw.Alumno || '').trim(),
      matricula: String(raw.Matrícula || '').trim(),
      fechaVencimiento: toIso(raw['Fecha vencimiento']),
      monto: Number(raw['Monto total'] || 0),
      fechaPago: toIso(raw['Fecha de pago']),
      fechaInicioAsignacion: toIso(raw['Fecha inicio asignación']),
      asignacionAutomatica: String(raw['Asignación automática'] || '').trim(),
    };
    return record.alumno || record.matricula ? record : null;
  }).filter(Boolean);
}
function plantelMatch(cometaName, schoolName) {
  const a = norm(cometaName), b = norm(schoolName);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}
function nameScore(a, b) {
  const aa = norm(a).split(' ').filter(Boolean); const bb = norm(b).split(' ').filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  const common = aa.filter((x) => bb.includes(x)).length;
  return common / Math.max(aa.length, bb.length);
}
function statusLabel(r) {
  if (r.match?.type === 'exact') return 'Coincidencia exacta';
  if (r.match?.type === 'name') return 'Coincidencia por nombre';
  if (r.match?.type === 'none') return 'No encontrado';
  return 'Revisar';
}

export default function CometaPage() {
  const { profile } = useAuth();
  const [importInfo, setImportInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [finance, setFinance] = useState([]);
  const [routeLists, setRouteLists] = useState([]);
  const [plantel, setPlantel] = useState('');
  const [tab, setTab] = useState('pagados');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState('');

  async function loadReferenceData() {
    const [s, sch, f, rl] = await Promise.all([
      Students.list(), Schools.list(), FinanceRecords.list(), RouteLists.list(),
    ]);
    setStudents(s || []); setSchools(sch || []); setFinance(f || []); setRouteLists(rl || []);
    return { students: s || [], schools: sch || [], finance: f || [], routeLists: rl || [] };
  }

  function buildMatches(sourceRows, refs) {
    const { students: ss, schools: sch, finance: fr, routeLists: lists } = refs;
    const financeByStudent = new Map();
    fr.forEach((x) => { if (x.studentId && !financeByStudent.has(x.studentId)) financeByStudent.set(x.studentId, x); });
    const routeByStudent = new Map();
    lists.forEach((list) => (list.rows || []).forEach((r) => { if (r.studentId && !routeByStudent.has(r.studentId)) routeByStudent.set(r.studentId, { ...r, listId: list.id }); }));
    return sourceRows.map((r, index) => {
      const matricula = String(r.matricula || '').trim();
      let student = matricula ? ss.find((s) => String(s.matricula || '').trim() === matricula) : null;
      let type = student ? 'exact' : 'none';
      if (!student) {
        const candidates = ss.filter((s) => plantelMatch(r.plantel, sch.find((x) => x.id === s.schoolId)?.name || '') && nameScore(r.alumno, s.name) >= 0.8);
        if (candidates.length === 1) { student = candidates[0]; type = 'name'; }
      }
      const financeRecord = student ? (fr.find((f) => f.studentId === student.id && (!r.concepto || norm(f.conceptName).includes(norm(r.concepto)) || norm(r.concepto).includes(norm(f.conceptName)))) || financeByStudent.get(student.id)) : null;
      const routeRow = student ? routeByStudent.get(student.id) : null;
      const school = student ? sch.find((x) => x.id === student.schoolId) : null;
      const blankInRuta = !student || (!financeRecord && !Number(student.billingAmount) && !routeRow);
      const alreadyPaid = !!(financeRecord?.cobrado === true && financeRecord?.pagoId || routeRow?.paid === true && routeRow?.paymentId || (student?.paymentStatus === 'al_corriente' && financeRecord?.cobrado === true && financeRecord?.pagoId));
      return { ...r, _key: `${r.sheetType}_${r.rowNumber}_${index}`, student, school, financeRecord, routeRow, blankInRuta, alreadyPaid, match: { type } };
    });
  }

  async function handleFile(file) {
    if (!file) return;
    setLoading(true); setNotice('Leyendo archivo de Cometa…');
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const paid = parseSheet(wb, PAYMENT_SHEET, 'paid');
      const pending = parseSheet(wb, PENDING_SHEET, 'pending');
      const refs = await loadReferenceData();
      const parsed = buildMatches([...paid, ...pending], refs);
      const importId = await Cometa.createImport({ fileName: file.name, importedBy: profile?.name || '', importedAt: new Date().toISOString(), paidCount: paid.length, pendingCount: pending.length });
      await Cometa.bulkCreateRecords(importId, parsed);
      setImportInfo({ id: importId, fileName: file.name, paidCount: paid.length, pendingCount: pending.length });
      setRows(parsed); setPlantel(''); setTab('pagados');
      setNotice(`Archivo procesado: ${paid.length} pagos y ${pending.length} registros pendientes de Cometa.`);
    } catch (e) {
      console.error(e); setNotice(`No se pudo procesar el archivo: ${e.message}`);
    } finally { setLoading(false); }
  }

  async function refresh() {
    if (!importInfo) return;
    setLoading(true); setNotice('Actualizando coincidencias…');
    try {
      const refs = await loadReferenceData();
      const next = buildMatches(rows, refs); setRows(next); setNotice('Coincidencias actualizadas.');
    } catch (e) { setNotice(`No se pudo actualizar: ${e.message}`); }
    finally { setLoading(false); }
  }

  async function confirmRow(row) {
    if (!row.student) return;
    setConfirming(row._key); setNotice('Aplicando confirmación…');
    try {
      const result = await Cometa.confirmRecord({ importId: importInfo.id, row, byName: profile?.name || '' });
      setRows((prev) => prev.map((x) => x._key === row._key ? { ...x, confirmed: true, confirmResult: result, alreadyPaid: row.sheetType === 'paid' ? true : row.alreadyPaid } : x));
      setNotice(result.message);
      await refresh();
    } catch (e) { console.error(e); setNotice(`No se pudo confirmar: ${e.message}`); }
    finally { setConfirming(''); }
  }

  const planteles = useMemo(() => [...new Set(rows.map((r) => r.plantel).filter(Boolean))].sort((a,b)=>a.localeCompare(b)), [rows]);
  const filtered = useMemo(() => rows.filter((r) => {
    if (plantel && r.plantel !== plantel) return false;
    if (tab === 'pagados' && r.sheetType !== 'paid') return false;
    if (tab === 'pendientes' && r.sheetType !== 'pending') return false;
    if (tab === 'diferencias' && !(r.student && (r.blankInRuta || r.match.type !== 'exact'))) return false;
    if (tab === 'no_encontrados' && r.student) return false;
    if (tab === 'en_ruta_blanco' && !r.blankInRuta) return false;
    if (search) {
      const q = norm(search); return norm(r.alumno).includes(q) || norm(r.matricula).includes(q) || norm(r.concepto).includes(q);
    }
    return true;
  }), [rows, plantel, tab, search]);

  const counts = useMemo(() => ({
    paid: rows.filter((r) => r.sheetType === 'paid').length,
    pending: rows.filter((r) => r.sheetType === 'pending').length,
    exact: rows.filter((r) => r.match.type === 'exact').length,
    noMatch: rows.filter((r) => !r.student).length,
    blank: rows.filter((r) => r.blankInRuta).length,
    confirmed: rows.filter((r) => r.confirmed).length,
  }), [rows]);

  function exportByPlantel(mode) {
    const source = rows.filter((r) => {
      if (mode === 'blank') return r.blankInRuta;
      if (mode === 'pending') return r.sheetType === 'pending';
      if (mode === 'unmatched') return !r.student;
      return true;
    });
    const groups = [...new Set(source.map((r) => r.plantel || 'Sin plantel'))].sort((a,b)=>a.localeCompare(b));
    const wb = XLSX.utils.book_new();
    groups.forEach((name) => {
      const safe = String(name).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Plantel';
      const data = source.filter((r) => (r.plantel || 'Sin plantel') === name).map((r) => ({
        Plantel: r.plantel, Alumno: r.alumno, Matrícula: r.matricula, Concepto: r.concepto, Ciclo: r.ciclo,
        'Monto Cometa': r.monto || '', 'Fecha de pago': r.fechaPago || '', 'Fecha vencimiento': r.fechaVencimiento || '',
        'Ruta Segura': r.student ? 'Encontrado' : 'No encontrado', 'Estado': r.alreadyPaid ? 'Ya aplicado' : statusLabel(r),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), safe);
    });
    XLSX.writeFile(wb, `cometa_${mode}_por_plantel.xlsx`);
  }

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div><h1 className="admin-h1">Cometa · Conciliación de pagos</h1><p className="text-sm text-navy-400 mt-1">Importa el reporte, separa por plantel, revisa coincidencias y confirma solo lo que corresponda.</p></div>
      <label className="btn-admin-primary cursor-pointer"><Upload size={15}/> Subir Excel<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e)=>{handleFile(e.target.files?.[0]);e.target.value='';}}/></label>
    </div>
    {notice && <div className="admin-card mb-4 text-sm">{notice}</div>}
    {importInfo && <>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-5">
        <div className="admin-card p-3"><b>{counts.paid}</b><div className="text-xs text-navy-400">Pagados Cometa</div></div>
        <div className="admin-card p-3"><b>{counts.pending}</b><div className="text-xs text-navy-400">Conceptos pendientes</div></div>
        <div className="admin-card p-3"><b>{counts.exact}</b><div className="text-xs text-go">Coincidencia exacta</div></div>
        <div className="admin-card p-3"><b>{counts.noMatch}</b><div className="text-xs text-stop">No encontrados</div></div>
        <div className="admin-card p-3"><b>{counts.blank}</b><div className="text-xs text-signal-amber">En blanco en Ruta Segura</div></div>
        <div className="admin-card p-3"><b>{counts.confirmed}</b><div className="text-xs text-navy-400">Confirmados</div></div>
      </div>
      <div className="admin-card mb-5">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[220px] flex-1"><label className="admin-label">Plantel</label><select value={plantel} onChange={(e)=>setPlantel(e.target.value)} className="admin-select"><option value="">Todos los planteles</option>{planteles.map(p=><option key={p}>{p}</option>)}</select></div>
          <div className="min-w-[220px] flex-1"><label className="admin-label">Buscar alumno / matrícula / concepto</label><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300"/><input value={search} onChange={e=>setSearch(e.target.value)} className="admin-input pl-9" placeholder="Buscar…"/></div></div>
          <button onClick={refresh} disabled={loading} className="btn-admin-ghost"><RefreshCw size={14}/> Actualizar coincidencias</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 border-t border-navy-100 pt-3">
          {[['pagados','Pagados'],['pendientes','Conceptos pendientes'],['diferencias','Revisar'],['no_encontrados','No encontrados'],['en_ruta_blanco','En blanco en Ruta Segura']].map(([k,l])=><button key={k} onClick={()=>setTab(k)} className={`px-3 py-2 rounded-md text-sm ${tab===k?'bg-navy-800 text-white':'bg-navy-50 text-navy-600'}`}>{l}</button>)}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={()=>exportByPlantel('blank')} className="btn-admin-ghost"><Download size={14}/> Descargar blancos por plantel</button>
        <button onClick={()=>exportByPlantel('pending')} className="btn-admin-ghost"><FileSpreadsheet size={14}/> Descargar pendientes por plantel</button>
        <button onClick={()=>exportByPlantel('unmatched')} className="btn-admin-ghost"><Download size={14}/> Descargar no encontrados</button>
      </div>
      <div className="admin-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-100 flex items-center justify-between"><div><h2 className="font-semibold">{plantel || 'Todos los planteles'}</h2><p className="text-xs text-navy-400">{filtered.length} registros visibles · archivo {importInfo.fileName}</p></div></div>
        <div className="overflow-x-auto"><table className="table-admin text-xs min-w-[1100px]"><thead><tr><th>Alumno</th><th>Matrícula</th><th>Concepto</th><th>Plantel</th><th>Cometa</th><th>Ruta Segura</th><th>Coincidencia</th><th></th></tr></thead><tbody>
          {filtered.map((r)=><tr key={r._key}><td className="font-medium">{r.alumno}</td><td>{r.matricula}</td><td>{r.concepto}</td><td>{r.plantel}</td><td>{r.sheetType==='paid'?<span className="text-go">Pagado {money(r.monto)}</span>:<span className="text-signal-amber">Concepto asignado</span>}</td><td>{r.student?<>{r.student.name}<div className="text-[10px] text-navy-300">{r.school?.name || 'Sin plantel'}</div></>:<span className="text-stop">No encontrado</span>}</td><td>{r.match.type==='exact'?<span className="text-go"><CheckCircle2 size={13} className="inline mr-1"/>Exacta</span>:r.match.type==='name'?<span className="text-signal-amber"><AlertTriangle size={13} className="inline mr-1"/>Por nombre</span>:<span className="text-stop"><XCircle size={13} className="inline mr-1"/>Sin coincidencia</span>}</td><td>{r.student && !r.confirmed && !r.alreadyPaid ? <button disabled={confirming===r._key} onClick={()=>confirmRow(r)} className="btn-admin-primary h-8 text-xs px-2.5">{confirming===r._key?'Aplicando…':r.sheetType==='paid'?'Confirmar pago':'Confirmar concepto'}</button> : r.confirmed ? <span className="text-go">✓ Confirmado</span> : r.alreadyPaid ? <span className="text-navy-400">Ya aplicado</span> : null}</td></tr>)}
          {!filtered.length && <tr><td colSpan="8" className="p-8 text-center text-navy-400">No hay registros con estos filtros.</td></tr>}
        </tbody></table></div>
      </div>
      <div className="admin-card mt-5"><div className="flex items-center gap-2 font-semibold"><Mail size={15}/> Flujo recomendado</div><p className="text-sm text-navy-500 mt-2">Los registros de <b>Conceptos pendientes</b> quedan disponibles para Notificaciones. Los alumnos que estén en Cometa pero sigan en blanco en Ruta Segura pueden descargarse separados por plantel para que cada cajera los revise.</p></div>
    </>}
    {!importInfo && <div className="admin-card text-center py-14"><FileSpreadsheet size={34} className="mx-auto text-navy-300 mb-3"/><h2 className="font-semibold">Sube el reporte de Cometa</h2><p className="text-sm text-navy-400 mt-1">Se leerán las hojas “Pagos de Transporte” y “Pendientes de Pago” y se organizarán automáticamente por plantel.</p></div>}
    {loading && <div className="fixed inset-0 bg-white/50 z-40 flex items-center justify-center"><div className="admin-card">Procesando…</div></div>}
  </div>;
}
