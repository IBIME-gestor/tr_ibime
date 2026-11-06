import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shuffle, RefreshCw, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { CometaBank, RouteLists, Routes } from '../../firebase/services';

/**
 * Operación / Alumnos en varias rutas
 * ---------------------------------------------------------------------
 * Un alumno que en el mismo mes está en listas de RUTAS distintas (otra
 * ruta algunos días, o una para entrada y otra para salida) no se concilia
 * bien de forma automática: Cometa cobra un solo monto por alumno, pero las
 * listas son una por ruta. Esta pestaña los separa y junta en una sola
 * tarjeta todo lo necesario para conciliar A MANO: cada lista donde está,
 * su servicio y días, lo estimado, lo pagado y los pagos de Cometa.
 * Solo lectura: no cambia ninguna lista ni ningún pago.
 */

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const listInMonth = (list, month) => {
  const start = String(list.startDate || '');
  const end = String(list.endDate || list.startDate || '');
  return !!start && start <= `${month}-31` && end >= `${month}-01`;
};
const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—');
const matKey = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const dayUnits = (d) => (d?.entrada ? 1 : 0) + (d?.salida ? 1 : 0);
const serviceDates = (row) => Object.keys(row.days || {}).filter((d) => dayUnits(row.days[d]) > 0).sort();
const paidDatesOf = (row) => (row.paidDates || []).filter((d) => dayUnits(row.days?.[d]) > 0);
const dateAmount = (row, d) => dayUnits(row.days?.[d]) * Number(row.baseAmount || 0);
const paidAmountOf = (row) => (row.tipoServicio === 'diario'
  ? paidDatesOf(row).reduce((n, d) => n + dateAmount(row, d), 0)
  : (row.paid ? Number(row.estimatedAmount || 0) : Number(row.paidAmount || 0)));
const serviceLabel = (row) => (
  row.tipoServicio === 'medio' ? `Medio (${row.medioServicio || 'entrada'})`
    : row.tipoServicio === 'diario' ? 'Diario' : 'Completo'
);
const sum = (arr, f) => arr.reduce((n, x) => n + Number(f(x) || 0), 0);

export default function AlumnosCompartidos() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [lists, setLists] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [cometa, setCometa] = useState([]);
  const [cometaError, setCometaError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true); setError(''); setCometaError('');
    try {
      const [l, r] = await Promise.all([RouteLists.list(), Routes.list()]);
      setLists(l || []); setRoutes(r || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudieron cargar las listas.');
    }
    try {
      setCometa((await CometaBank.list()) || []);
    } catch (e) {
      console.error(e);
      setCometaError(e?.message || 'sin permiso para leer el banco de Cometa');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const routeName = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r.name])), [routes]);

  const shared = useMemo(() => {
    const byStudent = new Map();
    lists
      .filter((l) => l.status !== 'eliminada' && listInMonth(l, month))
      .forEach((l) => (l.rows || []).forEach((row) => {
        if (!row.studentId) return;
        const cur = byStudent.get(row.studentId) || [];
        cur.push({ list: l, row });
        byStudent.set(row.studentId, cur);
      }));
    const out = [];
    byStudent.forEach((entries, studentId) => {
      const distinctRoutes = new Set(entries.map((e) => e.list.routeId));
      if (distinctRoutes.size < 2) return; // misma ruta en 2 listas = duplicado, no ruta compartida
      const first = entries[0].row;
      const mk = matKey(first.matricula);
      const listIds = new Set(entries.map((e) => e.list.id));
      const mine = cometa.filter((p) => p.studentId === studentId || p.linkedStudentId === studentId
        || (mk && p.matriculaKey === mk));
      const applied = mine.filter((p) => p.status === 'asignado' && (listIds.has(p.listId) || p.appliedMonth === month));
      const pending = mine.filter((p) => (p.status || 'por_asignar') === 'por_asignar');
      out.push({
        studentId, name: first.name, matricula: first.matricula, entries,
        estimated: sum(entries, (e) => e.row.estimatedAmount),
        paidInLists: sum(entries, (e) => paidAmountOf(e.row)),
        applied, pending,
        appliedSum: sum(applied, (p) => p.monto),
        pendingSum: sum(pending, (p) => p.monto),
      });
    });
    return out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  }, [lists, cometa, month]);

  const view = useMemo(() => {
    const q = norm(search).trim();
    return q ? shared.filter((s) => norm(`${s.name} ${s.matricula}`).includes(q)) : shared;
  }, [shared, search]);

  const th = 'p-1.5 text-left font-semibold';
  const td = 'p-1.5 align-top';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 flex items-center gap-2"><Shuffle size={22} /> Alumnos en varias rutas</h1>
          <p className="text-sm text-navy-500 mt-1 max-w-3xl">
            Alumnos que este mes aparecen en listas de rutas distintas (otra ruta algunos días, o una para entrada y otra para salida).
            Aquí ves todo junto para conciliar su pago a mano. Esta pantalla solo consulta: no cambia listas ni pagos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" className="admin-input" value={month} onChange={(e) => setMonth(e.target.value)} />
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
            <input className="admin-input pl-8" placeholder="Buscar alumno o matrícula" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className="btn-admin-ghost" onClick={load} disabled={loading}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}
      {cometaError && <p className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm px-3 py-2">No se pudo leer el banco de Cometa ({cometaError}); se muestran solo las listas.</p>}

      {loading ? <p className="text-sm text-navy-500">Cargando…</p> : !view.length ? (
        <div className="admin-card p-8 text-center">
          <CheckCircle2 size={28} className="mx-auto text-navy-300 mb-2" />
          <p className="font-semibold text-navy-700">No hay alumnos en varias rutas en {month}</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-navy-500">{view.length} alumno(s) en varias rutas en {month}.</p>
          {view.map((s) => {
            const diff = s.estimated - s.paidInLists;
            return (
              <section key={s.studentId} className="admin-card p-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-navy-100 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-navy-800">{s.name || '—'} <span className="font-normal text-navy-500">({s.matricula || 'sin matrícula'})</span></p>
                    <p className="text-xs text-navy-500">{s.entries.length} listas · {new Set(s.entries.map((e) => e.list.routeId)).size} rutas</p>
                  </div>
                  <p className="text-xs text-navy-600 text-right">
                    Estimado total <b>{money(s.estimated)}</b> · Pagado en listas <b>{money(s.paidInLists)}</b> · Falta <b>{money(diff)}</b>
                    <br />Cometa aplicado <b>{money(s.appliedSum)}</b> · Cometa por aplicar <b>{money(s.pendingSum)}</b>
                  </p>
                </div>

                <div className="p-3 space-y-3 text-xs">
                  {s.pending.length > 0 && (
                    <p className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 flex gap-2">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      Tiene pagos de Cometa sin aplicar. Como está en varias rutas, reparte el monto entre sus listas a mano
                      (en «Consultar listas», botón de pago de cada lista) y no lo apliques todo a una sola.
                    </p>
                  )}

                  <div className="overflow-x-auto">
                    <table className="table-admin min-w-[780px]">
                      <thead><tr>
                        <th className={th}>Lista</th><th className={th}>Ruta</th><th className={th}>Operador</th><th className={th}>Periodo</th>
                        <th className={th}>Servicio</th><th className={th}>Días</th>
                        <th className={`${th} text-right`}>Estimado</th><th className={`${th} text-right`}>Pagado</th>
                      </tr></thead>
                      <tbody>
                        {s.entries.map(({ list, row }) => (
                          <tr key={list.id}>
                            <td className={td}>{list.listName || 'Lista'}</td>
                            <td className={td}><b>{routeName[list.routeId] || 'Ruta'}</b></td>
                            <td className={td}>{list.operatorName || '—'}</td>
                            <td className={td}>{fmtDay(list.startDate)} – {fmtDay(list.endDate)}</td>
                            <td className={td}>{serviceLabel(row)}</td>
                            <td className={td}>{row.daysCount ?? serviceDates(row).length}</td>
                            <td className={`${td} text-right`}>{money(row.estimatedAmount)}</td>
                            <td className={`${td} text-right`}>{money(paidAmountOf(row))}{row.paid ? ' ✓' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <p className="font-semibold text-navy-700 mb-1">Pagos de Cometa de este alumno ({s.applied.length + s.pending.length})</p>
                    {s.applied.length + s.pending.length === 0 ? <p className="text-navy-400">Sin pagos de Cometa en el banco.</p> : (
                      <div className="overflow-x-auto">
                        <table className="table-admin min-w-[640px]">
                          <thead><tr>
                            <th className={th}>Fecha de pago</th><th className={th}>Folio orden</th><th className={`${th} text-right`}>Monto</th>
                            <th className={th}>Estado</th><th className={th}>Aplicado a</th><th className={th}>Lo aplicó</th>
                          </tr></thead>
                          <tbody>
                            {[...s.applied, ...s.pending].map((p) => (
                              <tr key={p.id}>
                                <td className={td}>{fmtDay(p.fechaPago)}</td><td className={td}>{p.folioOrden || '—'}</td>
                                <td className={`${td} text-right`}>{money(p.monto)}</td>
                                <td className={td}>{p.status === 'asignado' ? 'Aplicado' : 'Por aplicar'}</td>
                                <td className={td}>{p.status !== 'asignado' ? '—' : p.noList ? 'Solo al mes (sin lista)' : `${p.listName || 'Lista'}${routeName[(lists.find((l) => l.id === p.listId) || {}).routeId] ? ` · ${routeName[lists.find((l) => l.id === p.listId).routeId]}` : ''}`}</td>
                                <td className={td}>{p.appliedBy || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button type="button" className="btn-admin-ghost" onClick={() => navigate('/admin/listas/consultar')}>Ir a Consultar listas</button>
                  </div>
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
