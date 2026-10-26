import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, RefreshCw, Save, Search, Trash2, UserRoundCog, Route as RouteIcon, AlertTriangle, FolderOpen } from 'lucide-react';
import { Drivers, FinanceRecords, RouteLists, Routes, Schools } from '../../firebase/services';

function dateString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function datesBetween(start, end) {
  if (!start || !end || start > end) return [];
  const out = [];
  const d = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (d <= last) {
    const day = d.getDay();
    if (day >= 1 && day <= 5) out.push(dateString(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
function monthKey(value) { return String(value || '').slice(0, 7); }

export default function ListasModificar() {
  const [lists, setLists] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedId, setSelectedId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [listName, setListName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function loadData() {
    setLoading(true); setError('');
    try {
      const [listRows, routeRows, driverRows, schoolRows] = await Promise.all([
        RouteLists.list(), Routes.list(), Drivers.list(), Schools.list(),
      ]);
      setLists(listRows || []); setRoutes(routeRows || []); setDrivers(driverRows || []); setSchools(schoolRows || []);
    } catch (e) { setError(e?.message || 'No se pudieron cargar las listas.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadData(); }, []);

  const visibleLists = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('es-MX');
    return lists
      .filter((item) => !month || monthKey(item.startDate) === month)
      .filter((item) => {
        if (!q) return true;
        const routeName = routes.find((r) => r.id === item.routeId)?.name || '';
        return [item.listName, item.operatorName, routeName, item.startDate, item.endDate].join(' ').toLocaleLowerCase('es-MX').includes(q);
      })
      .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  }, [lists, month, search, routes]);
  const selected = lists.find((item) => item.id === selectedId) || null;
  const selectedRoute = routes.find((item) => item.id === routeId) || null;
  const selectedSchool = schools.find((item) => item.id === selectedRoute?.schoolId) || null;
  const selectedDriver = drivers.find((item) => item.id === operatorId) || null;

  function chooseList(id) {
    const item = lists.find((row) => row.id === id);
    setSelectedId(id); setNotice(''); setError('');
    if (!item) { setRouteId(''); setOperatorId(''); setStartDate(''); setEndDate(''); setListName(''); return; }
    setRouteId(item.routeId || ''); setOperatorId(item.operatorId || routes.find((r) => r.id === item.routeId)?.driverId || '');
    setStartDate(item.startDate || ''); setEndDate(item.endDate || ''); setListName(item.listName || '');
  }

  async function saveChanges() {
    if (!selected) return;
    if (!routeId || !startDate || !endDate || startDate > endDate) {
      setError('Selecciona una ruta y un periodo válido. La fecha inicial no puede ser posterior a la final.'); return;
    }
    const route = routes.find((item) => item.id === routeId);
    const driver = drivers.find((item) => item.id === operatorId);
    if (!route) { setError('La ruta seleccionada ya no está disponible.'); return; }
    const confirmed = window.confirm('¿Guardar los cambios operativos de esta lista? Se actualizarán los datos relacionados en Finanzas. Los alumnos no se agregarán ni eliminarán.');
    if (!confirmed) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const nextDates = datesBetween(startDate, endDate);
      const oldDates = selected.dates || [];
      const rows = (selected.rows || []).map((row) => {
        // Mantiene los servicios por día de la semana al cambiar el periodo.
        const oldDayByWeekday = {};
        oldDates.forEach((date) => {
          const weekday = new Date(`${date}T12:00:00`).getDay();
          oldDayByWeekday[weekday] = row.days?.[date] || { entrada: false, salida: false, confirmado: false };
        });
        const days = {};
        nextDates.forEach((date) => {
          const weekday = new Date(`${date}T12:00:00`).getDay();
          days[date] = { ...(oldDayByWeekday[weekday] || { entrada: false, salida: false, confirmado: false }) };
        });
        const daysCount = Object.values(days).filter((day) => day.entrada || day.salida).length;
        let estimatedAmount = Number(row.estimatedAmount || 0);
        if (row.tipoServicio === 'diario') {
          const perDay = Number(row.baseAmount || 0);
          estimatedAmount = Object.values(days).reduce((sum, day) => sum + (day.entrada ? 1 : 0) + (day.salida ? 1 : 0), 0) * perDay;
        }
        return { ...row, days, daysCount, estimatedAmount: Number(estimatedAmount.toFixed(2)) };
      });
      const nextName = listName.trim() || `${startDate} ${endDate} | ${route.name || 'Ruta'} | ${driver?.name || 'SIN-OPERADOR'}`;
      const patch = {
        routeId, operatorId: operatorId || '', operatorName: driver?.name || '',
        startDate, endDate, dates: nextDates, rows, listName: nextName,
        updatedAt: new Date().toISOString(),
        reviewedStudents: false, reviewedPayments: false, reviewed: false,
        reviewedAt: '', reviewedByUid: '', reviewedByName: '',
      };
      await RouteLists.update(selected.id, patch);
      // Actualiza los registros ya existentes sin reiniciar banderas de cobranza/atención.
      await Promise.all(rows.map(async (row) => {
        const financeId = `${selected.id}_${row.studentId}`;
        const existing = await FinanceRecords.get(financeId);
        await FinanceRecords.upsert(financeId, {
          listId: selected.id,
          studentId: row.studentId,
          studentName: row.name || '', matricula: row.matricula || '',
          schoolId: row.schoolId || route.schoolId || '', schoolName: selectedSchool?.name || '',
          nivel: row.nivel || '', grado: row.grado || '',
          routeId, routeName: route.name || '', operatorId: operatorId || '', operatorName: driver?.name || '',
          listName: nextName, unitId: route.unitId || '', periodoInicio: startDate, periodoFin: endDate,
          tipoServicio: row.tipoServicio || '', medioServicio: row.medioServicio || '',
          diasSemana: row.diasSemana || [], fechasDiarias: row.fechasDiarias || [],
          conceptId: row.pricingConceptId || '', conceptName: row.concept || '',
          montoEstimado: Number(row.estimatedAmount || 0),
          solicitudAtendida: existing?.solicitudAtendida ?? false,
          servicioConfirmado: existing?.servicioConfirmado ?? false,
          conceptoCargado: existing?.conceptoCargado ?? false,
          cobrado: existing?.cobrado === true && !!existing?.pagoId,
          pagoId: existing?.pagoId || '',
        });
      }));
      const updated = { ...selected, ...patch };
      setLists((prev) => prev.map((item) => item.id === selected.id ? updated : item));
      setNotice('Cambios guardados. La lista y sus registros de Finanzas fueron actualizados.');
    } catch (e) {
      console.error('Error al modificar lista:', e);
      setError(e?.message || 'No se pudieron guardar los cambios. Revisa la conexión y los permisos de Firestore.');
    } finally { setSaving(false); }
  }

  async function deleteList(item) {
    const rows = item.rows || [];
    const paid = rows.filter((r) => r.paid).length;
    const label = item.listName || `${item.startDate} al ${item.endDate}`;
    let msg = `¿Eliminar la lista «${label}»?\n\nSe eliminarán la lista y sus registros de Finanzas. Los alumnos NO se eliminan.`;
    if (paid > 0) msg += `\n\nATENCIÓN: ${paid} alumno(s) están marcados como pagados. Los pagos ya registrados en el expediente de cada alumno se conservan; solo desaparece esta lista y sus registros de Finanzas.`;
    if (!window.confirm(msg)) return;
    setDeletingId(item.id); setError(''); setNotice('');
    try {
      await FinanceRecords.removeByList(item.id);
      await RouteLists.remove(item.id);
      setLists((prev) => prev.filter((x) => x.id !== item.id));
      if (selectedId === item.id) chooseList('');
      setNotice(`Lista «${label}» eliminada.`);
    } catch (e) {
      console.error('Error al eliminar lista:', e);
      setError(e?.message || 'No se pudo eliminar la lista. Revisa la conexión y los permisos de Firestore.');
    } finally { setDeletingId(''); }
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-widest text-navy-400 font-semibold">Operación / Listas alumnos</p><h1 className="text-2xl font-display font-bold text-navy-900 mt-1">Modificar datos de listas</h1><p className="text-sm text-navy-500 mt-1">Elimina las listas hechas por error o duplicadas, o abre el detalle de una lista para corregir su ruta, operador y periodo.</p></div>
        <button onClick={loadData} disabled={loading || saving} className="btn-admin-ghost"><RefreshCw size={14} className="inline mr-2"/>Actualizar</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-sm flex gap-2"><AlertTriangle size={18} className="shrink-0"/>{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-sm flex gap-2"><CheckCircle2 size={18} className="shrink-0"/>{notice}</div>}

      {!selected && <section className="admin-card p-0 overflow-hidden">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-navy-800"><Search size={17}/> Listas del mes</div>
          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="admin-label">Mes de la lista</label><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="admin-input w-full"/></div>
            <div className="md:col-span-2"><label className="admin-label">Buscar dentro del mes</label><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre de lista, ruta u operador…" className="admin-input w-full"/></div>
          </div>
        </div>
        {loading ? <p className="px-4 pb-4 text-sm text-navy-500">Cargando listas…</p> : visibleLists.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-navy-500">No hay listas con fecha de inicio en el mes seleccionado.</p>
        ) : (
          <div className="overflow-x-auto border-t border-navy-100"><table className="table-admin text-xs min-w-[760px]"><thead><tr><th>Lista</th><th>Ruta</th><th>Operador</th><th>Periodo</th><th className="text-right">Alumnos</th><th className="text-right">Acciones</th></tr></thead><tbody>
            {visibleLists.map((item) => {
              const route = routes.find((r) => r.id === item.routeId);
              const driver = drivers.find((d) => d.id === (item.operatorId || route?.driverId));
              return <tr key={item.id}>
                <td className="font-medium">{item.listName || 'Lista sin nombre'}<span className="block text-[10px] text-navy-400">ID {item.id.slice(-6)}</span></td>
                <td>{route?.name || '—'}</td>
                <td>{item.operatorName || driver?.name || 'Sin operador'}</td>
                <td className="whitespace-nowrap">{item.startDate || '—'} al {item.endDate || '—'}</td>
                <td className="text-right">{(item.rows || []).length}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="btn-admin-ghost mr-2" onClick={() => chooseList(item.id)} disabled={!!deletingId}><FolderOpen size={13} className="inline mr-1"/>Abrir detalle</button>
                  <button className="btn-admin-ghost text-red-700 border-red-200" onClick={() => deleteList(item)} disabled={!!deletingId} title="Eliminar lista (por error o duplicada)"><Trash2 size={13} className="inline mr-1"/>{deletingId === item.id ? 'Eliminando…' : 'Eliminar'}</button>
                </td>
              </tr>;
            })}
          </tbody></table></div>
        )}
      </section>}

      {selected && <section className="admin-card p-4 md:p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold text-navy-800"><UserRoundCog size={18}/> Detalle de la lista · corrige los datos operativos</div><div className="flex gap-2"><button className="btn-admin-ghost" onClick={() => chooseList('')} disabled={saving}><ArrowLeft size={14} className="inline mr-1"/>Volver al listado</button><button className="btn-admin-ghost text-red-700 border-red-200" onClick={() => deleteList(selected)} disabled={saving || !!deletingId}><Trash2 size={14} className="inline mr-1"/>Eliminar lista</button></div></div>
        <div className="grid md:grid-cols-2 gap-4">
          <div><label className="admin-label">Nombre o referencia de la lista</label><input value={listName} onChange={(e) => setListName(e.target.value)} className="admin-input w-full" placeholder="Ej. Ruta norte · octubre"/></div>
          <div><label className="admin-label">Ruta</label><select value={routeId} onChange={(e) => setRouteId(e.target.value)} className="admin-select w-full"><option value="">Selecciona ruta…</option>{routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></div>
          <div><label className="admin-label">Operador / chofer</label><select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="admin-select w-full"><option value="">Sin operador asignado</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="admin-label">Fecha inicial</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="admin-input w-full"/></div><div><label className="admin-label">Fecha final</label><input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="admin-input w-full"/></div></div>
        </div>
        <div className="rounded-xl bg-navy-50 p-3 text-sm text-navy-700 space-y-1"><p className="font-semibold flex items-center gap-2"><CalendarDays size={16}/> Vista previa de cambios</p><p>Periodo: {startDate || '—'} al {endDate || '—'} · Días hábiles: {datesBetween(startDate, endDate).length}</p><p>Ruta: {selectedRoute?.name || 'Sin seleccionar'} · Operador: {selectedDriver?.name || 'Sin operador'}</p><p>Alumnos en esta lista: {(selected.rows || []).length}. No se agregan ni eliminan alumnos con este formulario.</p></div>
        <div className="flex flex-wrap justify-end gap-2"><button className="btn-admin-ghost" onClick={() => chooseList(selected.id)} disabled={saving}>Descartar cambios</button><button className="btn-admin-primary" onClick={saveChanges} disabled={saving || loading}><Save size={15} className="inline mr-2"/>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
      </section>}
      <p className="text-xs text-navy-400 flex items-start gap-2"><RouteIcon size={14} className="shrink-0 mt-0.5"/> Al cambiar el periodo, los servicios se redistribuyen según el día de la semana dentro del nuevo periodo. Revisa el periodo antes de guardar. La modificación reinicia las marcas de revisión administrativa de la lista.</p>
    </div>
  );
}
