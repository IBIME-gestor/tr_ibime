import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Search, Users, Route as RouteIcon, FileText, ChevronDown, ChevronUp,
  RefreshCw, CheckCircle2, AlertTriangle, Wallet, Settings2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Drivers, FinanceRecords, RouteLists, Routes, Students } from '../../firebase/services';
import { listTripsBetween } from '../../firebase/trips';

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Una lista pertenece al mes si su PERIODO toca ese mes (no solo si empieza en él):
// una lista del 26-oct al 06-nov también se debe ver en noviembre.
const listInMonth = (list, month) => {
  const start = String(list.startDate || '');
  const end = String(list.endDate || list.startDate || '');
  return !!start && start <= `${month}-31` && end >= `${month}-01`;
};
const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—');

const money = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
});

const listAmount = (item) => (item.rows || []).reduce((n, row) => n + Number(row.estimatedAmount || 0), 0);
const listPaidAmount = (item) => (item.rows || []).reduce((n, row) => n + paidAmountOf(row), 0);
const listPaidCount = (item) => (item.rows || []).filter((row) => row.paid).length;
// --- Alumnos "diario": se paga por día de servicio (entrada y/o salida) ---
const dayUnits = (d) => (d?.entrada ? 1 : 0) + (d?.salida ? 1 : 0);
const serviceDates = (row) => Object.keys(row.days || {}).filter((date) => dayUnits(row.days[date]) > 0).sort();
const perDayAmount = (row) => Number(row.baseAmount || 0);
const dateAmount = (row, date) => dayUnits(row.days?.[date]) * perDayAmount(row);
const paidDatesOf = (row) => (row.paidDates || []).filter((d) => dayUnits(row.days?.[d]) > 0);
const paidAmountOf = (row) => (row.tipoServicio === 'diario'
  ? paidDatesOf(row).reduce((n, d) => n + dateAmount(row, d), 0)
  : (row.paid ? Number(row.estimatedAmount || 0) : Number(row.paidAmount || 0)));
const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
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
  const [dayPanel, setDayPanel] = useState(null); // { listId, studentId, picked: [] }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [check, setCheck] = useState(null); // revisión con recorridos { byRoute, drivers }
  const [checking, setChecking] = useState(false);

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
      if (!listInMonth(list, month)) return false;
      if (payFilter === 'pendientes' && !(list.rows || []).some((r) => !r.paid)) return false;
      if (payFilter === 'pagadas' && !((list.rows || []).length && (list.rows || []).every((r) => r.paid))) return false;
      const haystack = [list.listName, list.operatorName, routeNames[list.routeId], list.startDate, list.endDate]
        .join(' ').toLocaleLowerCase('es-MX');
      return !q || haystack.includes(q);
    }).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  }, [lists, month, search, payFilter, routeNames]);

  // Revisión del mes: rutas sin lista y listas duplicadas (sin lecturas extra).
  const coverage = useMemo(() => {
    const monthLists = lists.filter((l) => l.status !== 'eliminada' && listInMonth(l, month));
    const byRoute = new Map();
    monthLists.forEach((l) => byRoute.set(l.routeId, [...(byRoute.get(l.routeId) || []), l]));
    const missing = routes.filter((r) => !byRoute.has(r.id));
    const groups = new Map();
    monthLists.forEach((l) => {
      const k = `${l.routeId}|${l.startDate}|${l.endDate}`;
      groups.set(k, [...(groups.get(k) || []), l]);
    });
    const duplicates = [...groups.values()].filter((g) => g.length > 1);
    const deleted = lists.filter((l) => l.status === 'eliminada' && listInMonth(l, month));
    return { missing, duplicates, deleted, withList: byRoute };
  }, [lists, routes, month]);

  // Revisión con recorridos reales del mes (bajo demanda: lee los recorridos del mes).
  async function runCheck() {
    setChecking(true); setError('');
    try {
      const [trips, staff] = await Promise.all([listTripsBetween(`${month}-01`, `${month}-31`), Drivers.list()]);
      const staffName = Object.fromEntries((staff || []).map((d) => [d.id, d.name]));
      const byRoute = {};
      trips.forEach((t) => {
        const r = (byRoute[t.routeId] = byRoute[t.routeId] || { days: new Set(), drivers: new Set(), trips: 0 });
        r.days.add(t.date); r.drivers.add(t.driverId); r.trips += 1;
      });
      setCheck({ byRoute, staffName });
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudieron consultar los recorridos del mes.');
    } finally { setChecking(false); }
  }
  useEffect(() => { setCheck(null); }, [month]);

  const totalStudents = filtered.reduce((sum, item) => sum + (item.rows || []).length, 0);
  const totalAmount = filtered.reduce((sum, item) => sum + listAmount(item), 0);
  const totalPaid = filtered.reduce((sum, item) => sum + listPaidAmount(item), 0);

  function replaceList(updated) {
    setLists((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }

  // Marca / desmarca el pago de un alumno (misma lógica que usa la pantalla de generación).
  async function togglePaid(list, row) {
    if (row.tipoServicio === 'diario') { openDayPanel(list, row); return; }
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

  function openDayPanel(list, row) {
    setError(''); setNotice('');
    const same = dayPanel?.listId === list.id && dayPanel?.studentId === row.studentId;
    setDayPanel(same ? null : { listId: list.id, studentId: row.studentId, picked: [] });
  }

  function togglePicked(date) {
    setDayPanel((p) => p && ({ ...p, picked: p.picked.includes(date) ? p.picked.filter((d) => d !== date) : [...p.picked, date] }));
  }

  // Registra el pago de los días elegidos (acumula sobre lo que ya había pagado).
  async function savePartialPayment(list, row, picked) {
    if (!picked.length) return;
    const key = `${list.id}_${row.studentId}`;
    const alreadyPaid = paidDatesOf(row);
    const nextPaid = [...new Set([...alreadyPaid, ...picked])].sort();
    const dates = serviceDates(row);
    const complete = dates.length > 0 && dates.every((d) => nextPaid.includes(d));
    const total = nextPaid.reduce((n, d) => n + dateAmount(row, d), 0);
    const added = picked.reduce((n, d) => n + dateAmount(row, d), 0);
    if (!(perDayAmount(row) > 0)) { setError('Este alumno no tiene tarifa por día. Revisa el concepto de la ruta.'); return; }
    if (!window.confirm(`¿Registrar pago de ${picked.length} día(s) por ${money(added)} para ${row.name}?\nPagado acumulado: ${nextPaid.length}/${dates.length} día(s) · ${money(total)}.${complete ? '' : '\nQuedará con saldo pendiente.'}`)) return;
    setBusyKey(key); setError(''); setNotice('');
    try {
      const route = routes.find((r) => r.id === list.routeId);
      const paymentId = await Students.recordPartialPayment(row.studentId, {
        paymentId: row.paymentId || '',
        totalPaid: total,
        complete,
        nextDueDate: list.endDate,
        note: `${row.concept || 'Servicio'} · lista ${list.startDate} al ${list.endDate} · días pagados: ${nextPaid.join(', ')}`,
        byName: profile?.name, byUid: user?.uid,
        routeId: list.routeId, unitId: route?.unitId, listId: list.id,
      });
      const rows = (list.rows || []).map((x) => (x.studentId === row.studentId
        ? { ...x, paidDates: nextPaid, paidAmount: Number(total.toFixed(2)), paymentId, paid: complete } : x));
      await RouteLists.update(list.id, { rows });
      const financeId = `${list.id}_${row.studentId}`;
      await FinanceRecords.upsert(financeId, complete
        ? { cobrado: true, pagoId: paymentId, cobradoAt: new Date().toISOString(), cobradoBy: profile?.name || '', montoPagado: Number(total.toFixed(2)), diasPagados: nextPaid.length }
        : { cobrado: false, montoPagado: Number(total.toFixed(2)), diasPagados: nextPaid.length });
      replaceList({ ...list, rows });
      setDayPanel(null);
      setNotice(complete
        ? `${row.name}: pagó todos los días (${money(total)}).`
        : `${row.name}: pagó ${nextPaid.length} de ${dates.length} días (${money(total)}). Quedan ${money(Number(row.estimatedAmount || 0) - total)} pendientes.`);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo registrar el pago por días.');
    } finally { setBusyKey(''); }
  }

  // Borra todos los pagos por día de un alumno (por captura equivocada).
  async function resetPartialPayments(list, row) {
    if (!window.confirm(`¿Quitar TODOS los pagos por día registrados de ${row.name}? El pago se cancelará en su bitácora.`)) return;
    const key = `${list.id}_${row.studentId}`;
    setBusyKey(key); setError(''); setNotice('');
    try {
      if (row.paymentId) await Students.cancelPayment(row.studentId, row.paymentId, 'Pagos por día reiniciados desde Consultar listas', profile?.name);
      const rows = (list.rows || []).map((x) => (x.studentId === row.studentId ? { ...x, paidDates: [], paidAmount: 0, paymentId: '', paid: false } : x));
      await RouteLists.update(list.id, { rows });
      await FinanceRecords.upsert(key, { cobrado: false, montoPagado: 0, diasPagados: 0 });
      replaceList({ ...list, rows });
      setDayPanel(null);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo reiniciar el pago.');
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

      {/* Revisión del mes: ¿alguna ruta se quedó sin lista o está duplicada? */}
      {!loading && routes.length > 0 && (() => {
        const ranWithoutList = check
          ? coverage.missing.filter((r) => check.byRoute[r.id])
          : [];
        const mismatch = check
          ? [...coverage.withList.entries()].flatMap(([routeId, ls]) => {
              const ran = check.byRoute[routeId];
              if (!ran) return [];
              const listOps = new Set(ls.map((l) => l.operatorId).filter(Boolean));
              const other = [...ran.drivers].filter((d) => d && listOps.size && !listOps.has(d));
              return other.length ? [{ routeId, ls, other }] : [];
            })
          : [];
        const problems = coverage.missing.length + coverage.duplicates.length;
        return (
          <section className={`rounded-2xl border p-4 space-y-3 ${problems ? 'border-amber-300 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={`font-semibold flex items-center gap-2 ${problems ? 'text-amber-900' : 'text-emerald-900'}`}>
                  {problems ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
                  {problems
                    ? `Revisión de ${month}: ${coverage.missing.length} ruta(s) sin lista · ${coverage.duplicates.length} duplicada(s)`
                    : `Revisión de ${month}: todas las rutas tienen su lista y no hay duplicadas`}
                </p>
                <p className="text-xs text-navy-500 mt-1 max-w-3xl">
                  El operador pasa lista aunque la lista del mes no exista: la asistencia se arma con los alumnos de la ruta, no con esta lista. Una ruta sin lista sigue operando, solo que no aparece aquí.
                </p>
              </div>
              <button className="btn-admin-ghost" onClick={runCheck} disabled={checking}>
                <RefreshCw size={14} className={`inline mr-2 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Revisando…' : check ? 'Volver a revisar' : 'Cruzar con recorridos del mes'}
              </button>
            </div>

            {coverage.missing.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-900 mb-1.5">Rutas sin lista en este mes</p>
                <div className="flex flex-wrap gap-2">
                  {coverage.missing.map((r) => {
                    const ran = check?.byRoute[r.id];
                    return (
                      <span key={r.id} className={`text-xs rounded-full border px-2.5 py-1 ${ran ? 'border-red-300 bg-red-50 text-red-800 font-semibold' : 'border-amber-200 bg-white text-navy-700'}`}>
                        {r.name}{ran ? ` · operó ${ran.days.size} día(s) sin lista` : ''}
                      </span>
                    );
                  })}
                </div>
                {check && ranWithoutList.length === 0 && (
                  <p className="text-xs text-navy-500 mt-1.5">Ninguna de ellas tuvo recorridos este mes, así que no hay información oculta.</p>
                )}
                {ranWithoutList.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-red-800">Estas rutas sí operaron y no tienen lista: hay que generarla.</p>
                    <button className="btn-admin-primary" onClick={() => navigate('/admin/formar-ruta')}>Generar lista</button>
                  </div>
                )}
              </div>
            )}

            {coverage.duplicates.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-900 mb-1.5">Listas duplicadas (misma ruta y mismo periodo)</p>
                <ul className="text-xs text-navy-700 space-y-1">
                  {coverage.duplicates.map((g) => (
                    <li key={g[0].id}>
                      <b>{routeNames[g[0].routeId] || 'Ruta'}</b> · {fmtDay(g[0].startDate)} – {fmtDay(g[0].endDate)}: {g.length} listas ({g.map((l) => l.operatorName || 'sin operador').join(' / ')}).
                      {' '}Si es el mismo operador, una sobra; si son distintos, puede ser un suplente.
                    </li>
                  ))}
                </ul>
                <button className="btn-admin-ghost mt-2" onClick={() => navigate('/admin/listas/modificar')}><Settings2 size={14} className="inline mr-2" />Modificar listas</button>
              </div>
            )}

            {mismatch.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-900 mb-1.5">Pasó lista alguien distinto al operador de la lista</p>
                <ul className="text-xs text-navy-700 space-y-1">
                  {mismatch.map((m) => (
                    <li key={m.routeId}>
                      <b>{routeNames[m.routeId] || 'Ruta'}</b>: la lista es de {m.ls.map((l) => l.operatorName || 'sin operador').join(' / ')}, pero también operó {m.other.map((d) => check.staffName[d] || 'otro operador').join(', ')}.
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {coverage.deleted.length > 0 && (
              <p className="text-xs text-navy-500">
                Hay {coverage.deleted.length} lista(s) marcada(s) como eliminada(s) en este periodo; se muestran abajo con su etiqueta.
              </p>
            )}
          </section>
        );
      })()}

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
                  {item.status === 'eliminada' && <span className="text-xs rounded-full px-2 py-1 whitespace-nowrap bg-red-100 text-red-800">Eliminada</span>}
                  {String(item.startDate || '').slice(0, 7) !== month && <span className="text-xs rounded-full px-2 py-1 whitespace-nowrap bg-sky-100 text-sky-800">Periodo {fmtDay(item.startDate)} – {fmtDay(item.endDate)}</span>}
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
                  {rows.length ? <div className="overflow-x-auto"><table className="table-admin text-xs min-w-[720px]"><thead><tr><th>#</th><th>Alumno</th><th>Matrícula</th><th>Servicio</th><th>Días con servicio</th><th className="text-right">Monto estimado</th><th className="text-center">Pago</th></tr></thead><tbody>
                    {rows.map((row, index) => {
                      const key = `${item.id}_${row.studentId}`;
                      const isDiario = row.tipoServicio === 'diario';
                      const dates = isDiario ? serviceDates(row) : [];
                      const paidDates = isDiario ? paidDatesOf(row) : [];
                      const panelOpen = isDiario && dayPanel?.listId === item.id && dayPanel?.studentId === row.studentId;
                      const picked = panelOpen ? dayPanel.picked : [];
                      const pickedAmount = picked.reduce((n, d) => n + dateAmount(row, d), 0);
                      const pending = Number(row.estimatedAmount || 0) - paidAmountOf(row);
                      return <Fragment key={key}>
                        <tr className={row.paid ? 'bg-green-50/60' : paidDates.length ? 'bg-amber-50/60' : ''}>
                          <td>{index + 1}</td><td>{row.name || '—'}</td><td>{row.matricula || '—'}</td><td>{serviceLabel(row)}</td>
                          <td>{row.daysCount ?? Object.values(row.days || {}).filter((d) => d.entrada || d.salida).length}</td>
                          <td className="text-right">{money(row.estimatedAmount)}{isDiario && paidDates.length > 0 && <span className="block text-[10px] text-navy-500">Pagado {money(paidAmountOf(row))} · Falta {money(pending)}</span>}</td>
                          <td className="text-center whitespace-nowrap">
                            {isDiario ? (
                              <button type="button" disabled={busyKey === key} onClick={() => openDayPanel(item, row)} className={`rounded-lg border px-2 py-1 ${row.paid ? 'border-green-300 text-green-800 bg-green-50' : paidDates.length ? 'border-amber-300 text-amber-800 bg-amber-50' : 'border-navy-200 text-navy-700'}`}>
                                {row.paid ? '✓ ' : ''}{paidDates.length}/{dates.length} días
                              </button>
                            ) : (
                              <input type="checkbox" className="w-4 h-4" checked={!!row.paid} disabled={busyKey === key} onChange={() => togglePaid(item, row)} title={row.paid ? 'Quitar marca de pago' : 'Registrar pago'} />
                            )}
                          </td>
                        </tr>
                        {panelOpen && <tr><td colSpan={7} className="bg-navy-50/60">
                          <div className="p-3 space-y-3">
                            <p className="font-semibold text-navy-800">Pago por días · {row.name} <span className="font-normal text-navy-500">({money(perDayAmount(row))} por servicio)</span></p>
                            {dates.length === 0 ? <p className="text-navy-500">Este alumno no tiene días con servicio en la lista.</p> : (
                              <div className="flex flex-wrap gap-2">
                                {dates.map((date) => {
                                  const isPaid = paidDates.includes(date);
                                  const isPicked = picked.includes(date);
                                  return <label key={date} className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1 ${isPaid ? 'border-green-300 bg-green-50 text-green-800' : isPicked ? 'border-navy-500 bg-white' : 'border-navy-200 bg-white cursor-pointer'}`}>
                                    <input type="checkbox" className="w-4 h-4" checked={isPaid || isPicked} disabled={isPaid || busyKey === key} onChange={() => togglePicked(date)} />
                                    <span>{shortDate(date)} · {money(dateAmount(row, date))}</span>
                                    {isPaid && <span className="text-[10px]">pagado</span>}
                                  </label>;
                                })}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex gap-2">
                                <button type="button" className="btn-admin-ghost" onClick={() => setDayPanel((p) => ({ ...p, picked: dates.filter((d) => !paidDates.includes(d)) }))} disabled={busyKey === key}>Seleccionar los pendientes</button>
                                {paidDates.length > 0 && <button type="button" className="btn-admin-ghost text-red-700 border-red-200" onClick={() => resetPartialPayments(item, row)} disabled={busyKey === key}>Quitar todos los pagos</button>}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-navy-600">Nuevo pago: <b>{picked.length}</b> día(s) · <b>{money(pickedAmount)}</b></span>
                                <button type="button" className="btn-admin-primary" disabled={!picked.length || busyKey === key} onClick={() => savePartialPayment(item, row, picked)}>{busyKey === key ? 'Guardando…' : 'Registrar pago'}</button>
                              </div>
                            </div>
                          </div>
                        </td></tr>}
                      </Fragment>;
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
