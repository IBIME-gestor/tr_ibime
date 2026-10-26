import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Search, Users, Route as RouteIcon, FileText, ChevronDown, ChevronUp,
  RefreshCw, CheckCircle2, AlertTriangle, Wallet, Settings2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FinanceRecords, RouteLists, Routes, Students } from '../../firebase/services';

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const money = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
});

const listAmount = (item) => (item.rows || []).reduce((n, row) => n + Number(row.estimatedAmount || 0), 0);
const listPaidAmount = (item) => (item.rows || []).reduce((n, row) => n + (row.paid ? Number(row.estimatedAmount || 0) : 0), 0);
const listPaidCount = (item) => (item.rows || []).filter((row) => row.paid).length;
const serviceLabel = (row) => (
  row.tipoServicio === 'medio' ? `Medio (${row.medioServicio || 'entrada'})`
    : row.tipoServicio === 'diario' ? 'Diario' : 'Completo'
);

/**
 * Operación / Consultar listas
 * Lectura de las listas por mes + marca de pagos y de revisión.
 * La edición de datos y la eliminación viven en "Modificar listas".
 */
export default function ListasConsulta() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [lists, setLists] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('todos');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true); setError('');
    try {
      const [listRows, routeRows] = await Promise.all([RouteLists.list(), Routes.list()]);
      setLists(listRows || []); setRoutes(routeRows || []);
    } catch (e) {
      console.error('Error consultando listas de alumnos:', e);
      setError(e?.message || 'No fue posible cargar las listas.');
    } finally { setLoading(false); }
  }
  useEffect(() => { loadData(); }, []);

  const routeNames = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r.name])), [routes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es-MX');
    return lists.filter((list) => {
      if (String(list.startDate || '').slice(0, 7) !== month) return false;
      if (payFilter === 'pendientes' && !(list.rows || []).some((r) => !r.paid)) return false;
      if (payFilter === 'pagadas' && !((list.rows || []).length && (list.rows || []).every((r) => r.paid))) return false;
      const haystack = [list.listName, list.operatorName, routeNames[list.routeId], list.startDate, list.endDate]
        .join(' ').toLocaleLowerCase('es-MX');
      return !q || haystack.includes(q);
    }).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  }, [lists, month, search, payFilter, routeNames]);

  const totalStudents = filtered.reduce((sum, item) => sum + (item.rows || []).length, 0);
  const totalAmount = filtered.reduce((sum, item) => sum + listAmount(item), 0);
  const totalPaid = filtered.reduce((sum, item) => sum + listPaidAmount(item), 0);

  function replaceList(updated) {
    setLists((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }

  // Marca / desmarca el pago de un alumno (misma lógica que usa la pantalla de generación).
  async function togglePaid(list, row) {
    setError(''); setNotice('');
    const key = `${list.id}_${row.studentId}`;
    setBusyKey(key);
    try {
      const financeId = `${list.id}_${row.studentId}`;
      if (row.paid) {
        if (!window.confirm(`¿Quitar la marca de pago de ${row.name}?`)) return;
        const rows = (list.rows || []).map((x) => (x.studentId === row.studentId ? { ...x, paid: false } : x));
        await RouteLists.update(list.id, { rows });
        await FinanceRecords.update(financeId, { cobrado: false, cobradoAt: '', cobradoBy: '' });
        replaceList({ ...list, rows });
        return;
      }
      const amount = Number(row.estimatedAmount || 0);
      if (!(amount > 0)) {
        setError('Este alumno no tiene un monto calculado. Revisa el concepto de la ruta.');
        return;
      }
      if (!window.confirm(`¿Registrar pago de ${money(amount)} para ${row.name}?`)) return;
      let paymentId = row.paymentId || '';
      if (!paymentId) {
        const route = routes.find((r) => r.id === list.routeId);
        paymentId = await Students.registerPayment(row.studentId, {
          amount,
          method: 'lista',
          note: `${row.concept || 'Servicio'} · lista ${list.startDate} al ${list.endDate}`,
          nextDueDate: list.endDate,
          byName: profile?.name,
          byUid: user?.uid,
          routeId: list.routeId,
          unitId: route?.unitId,
          listId: list.id,
        });
      }
      const rows = (list.rows || []).map((x) => (x.studentId === row.studentId ? { ...x, paid: true, paymentId } : x));
      await RouteLists.update(list.id, { rows });
      await FinanceRecords.update(financeId, {
        cobrado: true, pagoId: paymentId, cobradoAt: new Date().toISOString(), cobradoBy: profile?.name || '',
      });
      replaceList({ ...list, rows });
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo actualizar el pago.');
    } finally { setBusyKey(''); }
  }

  // Marca de revisión administrativa (alumnos / pagos) de la lista.
  async function saveReview(list, field, checked) {
    setError(''); setNotice('');
    setBusyKey(`review_${list.id}`);
    try {
      const next = {
        reviewedStudents: field === 'students' ? checked : !!list.reviewedStudents,
        reviewedPayments: field === 'payments' ? checked : !!list.reviewedPayments,
      };
      const full = next.reviewedStudents && next.reviewedPayments;
      const patch = {
        ...next,
        reviewed: full,
        reviewedAt: full ? new Date().toISOString() : '',
        reviewedByUid: full ? (user?.uid || '') : '',
        reviewedByName: full ? (profile?.name || user?.email || '') : '',
      };
      await RouteLists.update(list.id, patch);
      replaceList({ ...list, ...patch });
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo guardar la revisión.');
    } finally { setBusyKey(''); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-navy-400">Operación / Listas alumnos</p>
          <h1 className="font-display text-2xl font-bold text-navy-900 mt-1">Consultar listas</h1>
          <p className="text-sm text-navy-500 mt-1">Lee las listas del mes, marca los pagos y la revisión. Para corregir o eliminar una lista usa «Modificar listas».</p>
        </div>
        <button onClick={loadData} disabled={loading} className="btn-admin-ghost"><RefreshCw size={14} className="inline mr-2"/>Actualizar</button>
      </div>

      <section className="admin-card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="admin-label" htmlFor="month-lists">Mes de consulta</label>
            <input id="month-lists" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setSelectedId(''); }} className="admin-input w-full" />
          </div>
          <div>
            <label className="admin-label" htmlFor="pay-filter">Pagos</label>
            <select id="pay-filter" value={payFilter} onChange={(e) => setPayFilter(e.target.value)} className="admin-select w-full">
              <option value="todos">Todas las listas</option>
              <option value="pendientes">Con pagos pendientes</option>
              <option value="pagadas">Totalmente pagadas</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="admin-label" htmlFor="search-lists">Buscar dentro del mes</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
              <input id="search-lists" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre de lista, ruta u operador…" className="admin-input w-full pl-9" />
            </div>
          </div>
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2"><AlertTriangle size={18} className="shrink-0"/>{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 size={18} className="shrink-0"/>{notice}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="admin-card flex items-center gap-3"><div className="rounded-lg bg-navy-50 p-2"><FileText size={19}/></div><div><p className="text-xs text-navy-400">Listas</p><p className="text-xl font-bold">{filtered.length}</p></div></div>
        <div className="admin-card flex items-center gap-3"><div className="rounded-lg bg-navy-50 p-2"><Users size={19}/></div><div><p className="text-xs text-navy-400">Registros de alumnos</p><p className="text-xl font-bold">{totalStudents}</p></div></div>
        <div className="admin-card flex items-center gap-3"><div className="rounded-lg bg-navy-50 p-2"><CalendarDays size={19}/></div><div><p className="text-xs text-navy-400">Monto estimado</p><p className="text-xl font-bold">{money(totalAmount)}</p></div></div>
        <div className="admin-card flex items-center gap-3"><div className="rounded-lg bg-green-50 p-2"><Wallet size={19}/></div><div><p className="text-xs text-navy-400">Marcado como pagado</p><p className="text-xl font-bold">{money(totalPaid)}</p></div></div>
      </div>

      <section className="admin-card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-navy-100 flex justify-between items-center gap-2">
          <h2 className="font-semibold text-navy-800">Listas de {month || '—'}</h2>
          <span className="text-xs text-navy-400">{filtered.length} resultado(s)</span>
        </div>
        {loading ? <p className="p-5 text-sm text-navy-500">Cargando listas…</p> : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <FileText size={28} className="mx-auto text-navy-300 mb-2"/>
            <p className="font-semibold text-navy-700">No hay listas para este mes</p>
            <p className="text-sm text-navy-400 mt-1">Prueba con otro mes o genera una lista nueva.</p>
            <button className="btn-admin-primary mt-4" onClick={() => navigate('/admin/formar-ruta')}>Generar lista</button>
          </div>
        ) : (
          <div className="divide-y divide-navy-100">
            {filtered.map((item) => {
              const isOpen = selectedId === item.id;
              const rows = item.rows || [];
              const paidCount = listPaidCount(item);
              const reviewBusy = busyKey === `review_${item.id}`;
              return <div key={item.id}>
                <button type="button" onClick={() => setSelectedId(isOpen ? '' : item.id)} className="w-full text-left px-4 py-3 hover:bg-navy-50 flex items-center gap-3">
                  <div className="hidden sm:flex rounded-lg bg-navy-50 p-2"><RouteIcon size={18}/></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-navy-800 truncate">{item.listName || routeNames[item.routeId] || 'Lista sin nombre'}</p>
                    <p className="text-xs text-navy-500 mt-1">{routeNames[item.routeId] || 'Ruta sin nombre'} · Operador: {item.operatorName || 'Sin asignar'}</p>
                    <p className="text-xs text-navy-400 mt-1">{item.startDate || '—'} al {item.endDate || '—'} · {rows.length} alumno(s) · {money(listAmount(item))} · Pagados {paidCount}/{rows.length}</p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-1 whitespace-nowrap ${item.reviewed ? 'bg-green-100 text-green-800' : 'bg-amber-50 text-amber-800'}`}>{item.reviewed ? 'Revisada' : 'Pendiente de revisión'}</span>
                  {isOpen ? <ChevronUp size={17}/> : <ChevronDown size={17}/>}
                </button>
                {isOpen && <div className="px-4 pb-4 space-y-3">
                  <div className="flex flex-wrap justify-between items-center gap-3 rounded-xl bg-navy-50 p-3">
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4" checked={!!item.reviewedStudents} disabled={reviewBusy} onChange={(e) => saveReview(item, 'students', e.target.checked)} />
                        Alumnos revisados
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4" checked={!!item.reviewedPayments} disabled={reviewBusy} onChange={(e) => saveReview(item, 'payments', e.target.checked)} />
                        Pagos revisados
                      </label>
                      {item.reviewed && <span className="text-green-800">✓ Revisada por {item.reviewedByName || '—'}{item.reviewedAt ? ` · ${new Date(item.reviewedAt).toLocaleString('es-MX')}` : ''}</span>}
                    </div>
                    <button type="button" className="btn-admin-ghost" onClick={() => navigate('/admin/listas/modificar')}><Settings2 size={14} className="inline mr-2"/>Modificar listas</button>
                  </div>
                  <p className="text-xs text-navy-500">Estado: {item.status || 'Sin estado'} · Cobrado: <b>{money(listPaidAmount(item))}</b> de {money(listAmount(item))}</p>
                  {rows.length ? <div className="overflow-x-auto"><table className="table-admin text-xs min-w-[720px]"><thead><tr><th>#</th><th>Alumno</th><th>Matrícula</th><th>Servicio</th><th>Días con servicio</th><th className="text-right">Monto estimado</th><th className="text-center">Pagado</th></tr></thead><tbody>
                    {rows.map((row, index) => {
                      const key = `${item.id}_${row.studentId}`;
                      return <tr key={key} className={row.paid ? 'bg-green-50/60' : ''}>
                        <td>{index + 1}</td><td>{row.name || '—'}</td><td>{row.matricula || '—'}</td><td>{serviceLabel(row)}</td>
                        <td>{row.daysCount ?? Object.values(row.days || {}).filter((d) => d.entrada || d.salida).length}</td>
                        <td className="text-right">{money(row.estimatedAmount)}</td>
                        <td className="text-center"><input type="checkbox" className="w-4 h-4" checked={!!row.paid} disabled={busyKey === key} onChange={() => togglePaid(item, row)} title={row.paid ? 'Quitar marca de pago' : 'Registrar pago'} /></td>
                      </tr>;
                    })}
                  </tbody></table></div> : <p className="text-sm text-navy-400">Esta lista no contiene alumnos.</p>}
                </div>}
              </div>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
