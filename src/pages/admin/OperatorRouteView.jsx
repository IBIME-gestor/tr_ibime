import { useEffect, useMemo, useState } from 'react';
import { Routes, Drivers, Units, Schools } from '../../firebase/services';
import { getReferenceTrip } from '../../firebase/trips';

export default function OperatorRouteView() {
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [units, setUnits] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [shift, setShift] = useState('morning');
  const [reference, setReference] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([Routes.list(), Drivers.list(), Units.list(), Schools.list()])
      .then(([r, d, u, s]) => { setRoutes(r || []); setDrivers(d || []); setUnits(u || []); setSchools(s || []); })
      .catch((e) => setError(e.message || 'No se pudieron cargar las rutas.'));
  }, []);

  const route = useMemo(() => routes.find((r) => r.id === routeId) || null, [routes, routeId]);
  const operator = drivers.find((d) => d.id === route?.driverId);
  const nanny = drivers.find((d) => d.id === route?.nannyId);
  const unit = units.find((u) => u.id === route?.unitId);
  const school = schools.find((s) => s.id === route?.schoolId);

  async function loadReference() {
    if (!routeId) return;
    setLoading(true); setError('');
    try { setReference(await getReferenceTrip(routeId, shift)); }
    catch (e) { setError(e.message || 'No se pudo cargar el recorrido de referencia.'); setReference(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { setReference(null); if (routeId) loadReference(); }, [routeId, shift]);

  return <div className="max-w-5xl space-y-5">
    <div><h1 className="admin-h1">Vista del operador</h1><p className="text-sm text-navy-400 mt-1">Consulta administrativa de ruta, personal, unidad y puntos del último recorrido completado. Esta vista no modifica la asistencia.</p></div>
    {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    <section className="admin-card space-y-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className="admin-label">Ruta</label><select className="admin-select w-full" value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">Selecciona una ruta…</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        <div><label className="admin-label">Recorrido</label><select className="admin-select w-full" value={shift} onChange={(e) => setShift(e.target.value)}><option value="morning">Ida / entrada</option><option value="afternoon">Vuelta / salida</option></select></div>
      </div>
      {route && <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
        <Info label="Operador" value={operator?.name || 'Sin operador predeterminado'} />
        <Info label="Nanny" value={nanny?.name || 'Sin asignar'} />
        <Info label="Unidad" value={[unit?.plate, unit?.model].filter(Boolean).join(' · ') || 'Sin unidad'} />
        <Info label="Plantel" value={school?.name || 'Sin plantel'} />
      </div>}
    </section>
    <section className="admin-card">
      <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-navy-800">Puntos de referencia</h2><button onClick={loadReference} disabled={!routeId || loading} className="btn-admin-ghost">{loading ? 'Cargando…' : 'Actualizar'}</button></div>
      {!routeId && <p className="text-sm text-navy-400 mt-3">Selecciona una ruta para consultar sus puntos.</p>}
      {routeId && !loading && reference === null && <p className="text-sm text-navy-400 mt-3">No hay recorrido completado de referencia para este turno. Los puntos aparecerán después de completar el primer recorrido.</p>}
      {reference && <>
        <p className="text-xs text-navy-400 mt-2">Fecha de referencia: {reference.date || '—'} · {reference.stops?.length || 0} alumnos</p>
        <div className="divide-y divide-navy-100 mt-3">{(reference.stops || []).map((stop, i) => {
          const loc = stop.referenceLocation;
          const address = stop.address || stop.locationText || (loc?.lat != null ? `${loc.lat}, ${loc.lng}` : 'Sin dirección guardada');
          const mapUrl = loc?.lat != null ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
          return <div key={stop.studentId || stop.id || i} className="py-3 flex items-start gap-3"><span className="rounded-full bg-navy-100 text-navy-700 w-7 h-7 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span><div className="min-w-0 flex-1"><p className="font-medium text-sm">{stop.name || 'Alumno'}</p><p className="text-xs text-navy-400 break-words">{address}</p></div><a className="text-xs underline text-navy-600 shrink-0" href={mapUrl} target="_blank" rel="noreferrer">Ver punto</a></div>;
        })}</div>
      </>}
    </section>
  </div>;
}
function Info({ label, value }) { return <div className="rounded-lg bg-navy-50 p-3"><p className="text-xs text-navy-400">{label}</p><p className="text-sm font-medium text-navy-800 mt-1">{value}</p></div>; }
