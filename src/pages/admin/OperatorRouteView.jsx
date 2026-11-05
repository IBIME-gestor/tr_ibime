import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Sun, Moon, MapPin, User, Users, Bus, School, ExternalLink } from 'lucide-react';
import { Routes, Drivers, Units, Schools } from '../../firebase/services';
import { getReferenceTrip, getTrip, getTripStopsOnce, todayString } from '../../firebase/trips';
import { tsMs } from '../../utils/tripOrder';
import { dayLabel, fmtShortDay } from '../../utils/tripStatus';

const fmtClock = (ts) => {
  const ms = tsMs(ts);
  return ms == null ? '—' : new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

const STATUS_CLS = {
  pending: 'bg-slate-100 text-slate-700',
  boarded: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  absent: 'bg-red-100 text-red-800',
};
const STATUS_LABEL = { pending: 'Sin marcar', boarded: 'Abordó', delivered: 'Bajó', absent: 'No asistió' };

/**
 * Vista del operador (consulta administrativa, no modifica nada).
 * Primero lo de HOY para la ruta elegida —si ya salió, cómo va— y después,
 * como apoyo, el último recorrido completado con su fecha bien visible
 * (antes se mostraba solo ese, y parecía "información de hace días").
 */
export default function OperatorRouteView() {
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [units, setUnits] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [shift, setShift] = useState('morning');
  const [reference, setReference] = useState(null);
  const [todayTrip, setTodayTrip] = useState(null);
  const [todayStops, setTodayStops] = useState([]);
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
  const today = todayString();

  async function load() {
    if (!routeId) return;
    setLoading(true); setError('');
    try {
      const [ref, trip] = await Promise.all([
        getReferenceTrip(routeId, shift),
        getTrip(`${routeId}_${today}_${shift}`),
      ]);
      setReference(ref);
      setTodayTrip(trip);
      setTodayStops(trip ? await getTripStopsOnce(trip.id) : []);
    } catch (e) {
      setError(e.message || 'No se pudo cargar el recorrido.');
      setReference(null); setTodayTrip(null); setTodayStops([]);
    } finally { setLoading(false); }
  }
  useEffect(() => { setReference(null); setTodayTrip(null); setTodayStops([]); if (routeId) load(); /* eslint-disable-next-line */ }, [routeId, shift]);

  const done = todayStops.filter((s) => s.status !== 'pending').length;
  const absent = todayStops.filter((s) => s.status === 'absent').length;
  const isMorning = shift === 'morning';

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="admin-h1">Vista del operador</h1>
        <p className="text-sm text-navy-500 mt-1 max-w-3xl">
          Lo que ve el operador de una ruta: quién la lleva, cómo va <b>hoy</b> y los puntos del último recorrido completado. Es solo consulta, no modifica la asistencia.
        </p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-sm">{error}</p>}

      {/* Selector */}
      <section className="admin-card space-y-4">
        <div className="grid md:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-end">
          <div>
            <label className="admin-label">Ruta</label>
            <select className="admin-select w-full" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">Selecciona una ruta…</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="admin-label">Recorrido</label>
            <div className="inline-flex rounded-xl border border-navy-200 overflow-hidden">
              {[['morning', 'Ida', Sun], ['afternoon', 'Vuelta', Moon]].map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setShift(k)}
                  className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 ${shift === k ? 'bg-navy-900 text-white' : 'bg-white text-navy-700 hover:bg-navy-50'}`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={load} disabled={!routeId || loading} className="btn-admin-ghost">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>

        {route && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Info icon={User} label="Operador" value={operator?.name || 'Sin operador predeterminado'} />
            <Info icon={Users} label="Nanny" value={nanny?.name || 'Sin asignar'} />
            <Info icon={Bus} label="Unidad" value={[unit?.plate, unit?.model].filter(Boolean).join(' · ') || 'Sin unidad'} />
            <Info icon={School} label="Plantel" value={school?.name || 'Sin plantel'} />
          </div>
        )}
      </section>

      {!routeId && <p className="text-sm text-navy-400">Selecciona una ruta para ver su información.</p>}

      {routeId && (
        <>
          {/* HOY */}
          <section className="admin-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-semibold text-navy-900">
                Hoy · {isMorning ? 'Ida' : 'Vuelta'}
                <span className="ml-2 text-xs font-normal text-navy-400">{fmtShortDay(today)}</span>
              </h2>
              <TodayBadge trip={todayTrip} loading={loading} />
            </div>

            {!loading && !todayTrip && (
              <p className="text-sm text-navy-500 mt-3">
                El operador todavía no inicia este recorrido hoy.
              </p>
            )}

            {todayTrip && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <Mini label="Salió" value={fmtClock(todayTrip.startedAt)} />
                  <Mini label="Marcados" value={`${done} de ${todayStops.length}`} />
                  <Mini label="No asistieron" value={absent} />
                  <Mini label="Km inicial" value={todayTrip.kmInicial ?? '—'} />
                </div>
                {todayStops.length > 0 && (
                  <div className="mt-3 h-2 rounded-full bg-navy-100 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.round((done / todayStops.length) * 100)}%` }} />
                  </div>
                )}
                <div className="divide-y divide-navy-100 mt-3 max-h-[360px] overflow-y-auto rounded-xl border border-navy-100">
                  {todayStops.map((s) => (
                    <div key={s.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS_CLS[s.status] || STATUS_CLS.pending}`}>
                        {STATUS_LABEL[s.status] || s.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* ÚLTIMO COMPLETADO */}
          <section className="admin-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-semibold text-navy-900">Puntos del último recorrido completado</h2>
              {reference?.trip?.date && (
                <span className="text-xs font-semibold rounded-full bg-navy-100 text-navy-700 px-2.5 py-1">
                  {dayLabel(reference.trip.date, today)} · {fmtShortDay(reference.trip.date)}
                </span>
              )}
            </div>
            {!loading && reference === null && (
              <p className="text-sm text-navy-500 mt-3">
                Aún no hay un recorrido completado de {isMorning ? 'ida' : 'vuelta'} para esta ruta. Los puntos aparecerán después de cerrar el primero.
              </p>
            )}
            {reference && (
              <>
                <p className="text-xs text-navy-400 mt-2">
                  {reference.stops?.length || 0} alumnos, en el orden real en que se atendieron.
                </p>
                <div className="divide-y divide-navy-100 mt-3">
                  {(reference.stops || []).map((stop, i) => {
                    const loc = stop.referenceLocation;
                    const address = stop.address || stop.locationText || (loc?.lat != null ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'Sin ubicación guardada');
                    const mapUrl = loc?.lat != null
                      ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
                      : null;
                    return (
                      <div key={stop.studentId || stop.id || i} className="py-2.5 flex items-center gap-3">
                        <span className="rounded-full bg-signal-yellow text-navy-900 w-7 h-7 flex items-center justify-center text-xs font-bold shrink-0">
                          {stop.seq ?? i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{stop.name || 'Alumno'}</p>
                          <p className="text-xs text-navy-400 break-words flex items-center gap-1">
                            <MapPin size={11} className="shrink-0" /> {address}
                          </p>
                        </div>
                        {mapUrl && (
                          <a className="text-xs text-navy-600 hover:text-navy-900 flex items-center gap-1 shrink-0" href={mapUrl} target="_blank" rel="noreferrer">
                            Ver punto <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function TodayBadge({ trip, loading }) {
  if (loading) return <span className="text-xs text-navy-400">Consultando…</span>;
  if (!trip) return <span className="text-xs font-semibold rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">No iniciado</span>;
  if (trip.status === 'in_progress') return <span className="text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1">● En curso</span>;
  return <span className="text-xs font-semibold rounded-full bg-sky-100 text-sky-800 px-2.5 py-1">Completado</span>;
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-navy-50 p-3 flex gap-3 items-start">
      <span className="rounded-lg bg-white p-1.5 text-navy-500 shrink-0"><Icon size={15} /></span>
      <div className="min-w-0">
        <p className="text-xs text-navy-400">{label}</p>
        <p className="text-sm font-medium text-navy-800 mt-0.5 break-words">{value}</p>
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-xl border border-navy-100 p-3">
      <p className="text-[11px] uppercase tracking-wide text-navy-400 font-semibold">{label}</p>
      <p className="text-lg font-display font-bold text-navy-900 mt-0.5">{value}</p>
    </div>
  );
}
