import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, RefreshCw, Save, Search, UserRoundCog, Route as RouteIcon, AlertTriangle } from 'lucide-react';
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

  const visibleLists = useMemo(() => lists.filter((item) => !month || monthKey(item.startDate) === month), [lists, month]);
  const selected = lists.find((item) => item.id === selectedId) || null;
  const selectedRoute = routes.find((item) => item.id === routeId) || null;
  const selectedSchool = schools.find((item) => item.id === selectedRoute?.schoolId) || null;
  const selectedDriver = drivers.find((item) => item.id === operatorId) || null;

  function chooseList(id) {
    const item = lists.find((row) => row.id === id);
    setSelectedId(id); setNotice(''); setError('');
    if (!item) { setRouteId(''); setOperatorId(''); setStartDate(''); setEndDate(''); setListName(''); return; }
    setRouteId(item.routeId || ''); setOperatorId(item.operatorId || '');
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
        reviewedStudents: false, reviewedPayments: false,
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

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-widest text-navy-400 font-semibold">Operación / Listas alumnos</p><h1 className="text-2xl font-display font-bold text-navy-900 mt-1">Modificar datos de listas</h1><p className="text-sm text-navy-500 mt-1">Corrige los datos operativos de una lista existente sin volver a generarla ni editar directamente el expediente de los alumnos.</p></div>
        <button onClick={loadData} disabled={loading || saving} className="btn-admin-ghost"><RefreshCw size={14} className="inline mr-2"/>Actualizar</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-sm flex gap-2"><AlertTriangle size={18} className="shrink-0"/>{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-sm flex gap-2"><CheckCircle2 size={18} className="shrink-0"/>{notice}</div>}

      <section className="admin-card p-4 space-y-4">
        <div className="flex items-center gap-2 font-semibold text-navy-800"><Search size={17}/> 1. Selecciona la lista que necesitas corregir</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div><label className="admin-label">Mes de la lista</label><input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setSelectedId(''); }} className="admin-input w-full"/></div>
          <div><label className="admin-label">Lista existente ({visibleLists.length})</label><select value={selectedId} onChange={(e) => chooseList(e.target.value)} className="admin-select w-full"><option value="">Selecciona una lista…</option>{visibleLists.map((item) => { const route = routes.find((r) => r.id === item.routeId); return <option key={item.id} value={item.id}>{item.listName || `${item.startDate} al ${item.endDate} · ${route?.name || 'Ruta'}`} · {item.operatorName || 'Sin operador'}</option>; })}</select></div>
        </div>
        {loading && <p className="text-sm text-navy-500">Cargando listas…</p>}
        {!loading && visibleLists.length === 0 && <p className="text-sm text-navy-500">No hay listas con fecha de inicio en el mes seleccionado.</p>}
      </section>

      {selected && <section className="admin-card p-4 md:p-5 space-y-5">
        <div className="flex items-center gap-2 font-semibold text-navy-800"><UserRoundCog size={18}/> 2. Corrige los datos operativos</div>
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
