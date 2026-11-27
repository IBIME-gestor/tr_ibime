import { useEffect, useMemo, useState } from 'react';
import { Repeat, Trash2 } from 'lucide-react';
import { Routes, Drivers } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';
import { listCoveragesFrom, saveCoverage, removeCoverage, SHIFT_LABEL } from '../../firebase/coverages';
import { todayString } from '../../firebase/trips';

/**
 * Cobertura de rutas · solo admin
 * Cuando un operador va a faltar y otro toma su ruta, se reasigna SOLO ese viaje
 * (un día y un turno, o todo el día): la ruta sigue siendo del operador de siempre.
 *  · El sustituto ve la ruta en su pantalla ese día y la inicia con su cuenta:
 *    el recorrido, los km y los KPIs quedan a su nombre.
 *  · El operador que faltó no ve esa ruta ese día y no recibe nada en sus KPIs.
 */
const fmt = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

export default function CoberturaRutas() {
  const { profile } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayString());
  const [routeId, setRouteId] = useState('');
  const [shift, setShift] = useState('both');
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [ro, dr, cov] = await Promise.all([Routes.list(), Drivers.list(), listCoveragesFrom(todayString())]);
      setRoutes((ro || []).filter((r) => r.kind !== 'taller').sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')));
      setDrivers((dr || []).filter((d) => d.role !== 'nanny' && d.role !== 'cashier').sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')));
      setRows(cov || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo cargar. ¿Ya publicaste las reglas de Firestore nuevas?');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const driverById = useMemo(() => Object.fromEntries(drivers.map((d) => [d.id, d])), [drivers]);
  const route = routes.find((r) => r.id === routeId);
  const original = route ? driverById[route.driverId] : null;

  async function save() {
    setMsg('');
    if (!routeId || !driverId) { setMsg('Elige la ruta y el operador que la cubre.'); return; }
    if (route?.driverId === driverId) { setMsg('Ese operador ya es el de la ruta. Elige a otra persona.'); return; }
    setSaving(true);
    try {
      await saveCoverage({
        routeId, routeName: route?.name, date, shift, driverId, driverName: driverById[driverId]?.name,
        originalDriverId: route?.driverId, reason,
      }, profile?.name || '');
      setMsg(`Listo: ${driverById[driverId]?.name} cubre ${route?.name} el ${fmt(date)} (${SHIFT_LABEL[shift].toLowerCase()}).`);
      setReason('');
      await load();
    } catch (e) { setMsg(e?.message || 'No se pudo guardar.'); }
    setSaving(false);
  }
  async function remove(c) {
    if (!window.confirm(`¿Quitar la cobertura de ${c.routeName} del ${fmt(c.date)}? La ruta vuelve a su operador.`)) return;
    try { await removeCoverage(c.id); await load(); } catch (e) { setMsg(e?.message || 'No se pudo quitar.'); }
  }

  return (
    <div className="page-fit flex flex-col gap-4">
      <div className="shrink-0">
        <h1 className="admin-h1 mb-1 flex items-center gap-2"><Repeat size={22} /> Cobertura de rutas</h1>
        <p className="text-sm text-navy-400 max-w-3xl">
          Cuando un operador falta y otro toma su ruta, reasigna solo ese viaje. El recorrido, los km y los KPIs quedan a nombre de quien lo maneja.
        </p>
      </div>
      {error && <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] gap-4">
        <div className="admin-card space-y-3 lg:overflow-y-auto lg:min-h-0 self-start lg:self-stretch">
          <p className="font-display font-semibold text-sm text-navy-800">Nueva cobertura</p>
          <div><label className="admin-label">Fecha</label><input type="date" className="admin-input" value={date} min={todayString()} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <label className="admin-label">Ruta</label>
            <select className="admin-select" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">Selecciona…</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {route && <p className="text-[11px] text-navy-400 mt-1">Operador de la ruta: <b>{original?.name || 'sin asignar'}</b></p>}
          </div>
          <div>
            <label className="admin-label">Turno</label>
            <div className="flex rounded-lg border border-navy-200 overflow-hidden">
              {Object.entries(SHIFT_LABEL).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setShift(key)} className={`flex-1 h-10 text-xs font-bold ${shift === key ? 'bg-navy-700 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="admin-label">Operador que la cubre</label>
            <select className="admin-select" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Selecciona…</option>
              {drivers.filter((d) => d.id !== route?.driverId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><label className="admin-label">Motivo (opcional)</label><input className="admin-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Falta por enfermedad, permiso…" /></div>
          <p className="rounded-lg bg-navy-50 text-[11px] text-navy-600 px-3 py-2">
            El sustituto necesita su acceso a la app de operadores. Si cubre dos rutas, el sistema le muestra ambas ese día.
          </p>
          <button type="button" className="btn-admin-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cobertura'}</button>
          {msg && <p className="text-xs text-navy-600">{msg}</p>}
        </div>

        <div className="admin-card !p-0 flex flex-col min-h-0 min-w-0">
          <div className="shrink-0 p-4 border-b border-navy-100"><p className="font-display font-semibold text-sm text-navy-800">Coberturas de hoy en adelante ({rows.length})</p></div>
          <div className="flex-1 min-h-0 overflow-auto divide-y divide-navy-100">
            {loading && <p className="p-4 text-sm text-navy-400">Cargando…</p>}
            {!loading && !rows.length && <p className="p-6 text-center text-sm text-navy-400">No hay coberturas programadas.</p>}
            {rows.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-24 shrink-0"><p className="text-sm font-semibold first-letter:uppercase">{fmt(c.date)}</p><p className="text-[10px] text-navy-400">{SHIFT_LABEL[c.shift]}</p></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{c.routeName}</p>
                  <p className="text-xs text-navy-600">Cubre: <b>{c.driverName}</b>{driverById[c.originalDriverId] ? ` · en lugar de ${driverById[c.originalDriverId].name}` : ''}</p>
                  {c.reason && <p className="text-[11px] text-navy-400">{c.reason}</p>}
                </div>
                <button type="button" className="link-danger shrink-0" onClick={() => remove(c)} aria-label="Quitar"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
