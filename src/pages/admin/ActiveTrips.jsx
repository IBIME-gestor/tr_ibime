import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ChevronDown, AlertTriangle, CheckCircle2, Sun, Moon, Clock, History } from 'lucide-react';
import { Routes, Drivers } from '../../firebase/services';
import {
  listActiveTrips,
  getTripStopsOnce,
  markStopManual,
  markStopAbsent,
  completeTrip,
  todayString,
} from '../../firebase/trips';
import LoadingOverlay from '../../components/LoadingOverlay';
import { tsMs } from '../../utils/tripOrder';
import { dayLabel, fmtAgo, fmtShortDay, signalState, SIGNAL_META } from '../../utils/tripStatus';

const STATUS_LABEL = {
  pending: 'Sin marcar',
  boarded: 'Abordó',
  delivered: 'Bajó',
  absent: 'No asistió',
};
const STATUS_CLS = {
  pending: 'bg-slate-100 text-slate-700',
  boarded: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  absent: 'bg-red-100 text-red-800',
};

function fmtTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Recorridos en curso
 * ---------------------------------------------------------------
 * Primero lo de HOY (lo que está pasando ahora). Aparte, y plegado, los
 * recorridos de días anteriores que nunca se cerraron (se quedaron sin
 * datos o sin batería): quedan "en curso" para siempre hasta que alguien
 * los cierre, y antes se mezclaban con los de hoy.
 */
export default function ActiveTrips() {
  const [trips, setTrips] = useState([]);
  const [routesById, setRoutesById] = useState({});
  const [staffById, setStaffById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openTripId, setOpenTripId] = useState(null);
  const [showOld, setShowOld] = useState(null); // null = automático
  const [now, setNow] = useState(Date.now());

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [activeTrips, routes, staff] = await Promise.all([
        listActiveTrips(),
        Routes.list(),
        Drivers.list(),
      ]);
      setTrips(activeTrips);
      setRoutesById(Object.fromEntries(routes.map((r) => [r.id, r])));
      setStaffById(Object.fromEntries(staff.map((s) => [s.id, s])));
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudieron consultar los recorridos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const today = todayString();
  const { todayTrips, oldTrips } = useMemo(() => {
    const t = [];
    const o = [];
    trips.forEach((trip) => (trip.date === today ? t : o).push(trip));
    o.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { todayTrips: t, oldTrips: o };
  }, [trips, today]);

  // Si hoy no hay nada, se muestran de entrada los anteriores (es lo único que hay).
  const oldOpen = showOld ?? todayTrips.length === 0;

  const operatorOf = (trip) =>
    staffById[trip.driverId]?.name || (trip.nannyId && staffById[trip.nannyId]?.name) || 'Operador';

  const renderCard = (trip, old) => (
    <TripRescueCard
      key={trip.id}
      trip={trip}
      old={old}
      today={today}
      now={now}
      route={routesById[trip.routeId]}
      operatorName={operatorOf(trip)}
      isOpen={openTripId === trip.id}
      onToggle={() => setOpenTripId(openTripId === trip.id ? null : trip.id)}
      onClosed={load}
    />
  );

  return (
    <div className="max-w-4xl space-y-5">
      <LoadingOverlay show={loading} label="Consultando…" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-h1">Recorridos en curso</h1>
          <p className="text-sm text-navy-500 mt-1 max-w-2xl">
            Lo que está en marcha <b>hoy</b> y, aparte, los recorridos de días pasados que nunca se
            cerraron. Desde aquí puedes revisar qué alcanzaron a marcar y cerrarlos tú.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-admin-ghost shrink-0">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Consultar de nuevo
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-sm flex gap-2">
          <AlertTriangle size={18} className="shrink-0" /> {error}
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">En curso hoy</p>
          <p className="text-3xl font-display font-bold text-emerald-900 mt-1">{todayTrips.length}</p>
        </div>
        <div
          className={`rounded-2xl border p-4 ${
            oldTrips.length ? 'border-amber-300 bg-amber-50' : 'border-navy-100 bg-white'
          }`}
        >
          <p className={`text-xs font-semibold uppercase tracking-wide ${oldTrips.length ? 'text-amber-800' : 'text-navy-400'}`}>
            Sin cerrar de días anteriores
          </p>
          <p className={`text-3xl font-display font-bold mt-1 ${oldTrips.length ? 'text-amber-900' : 'text-navy-300'}`}>
            {oldTrips.length}
          </p>
        </div>
      </div>

      {/* HOY */}
      <section className="space-y-3">
        <h2 className="font-display font-semibold text-navy-800 flex items-center gap-2">
          <Clock size={16} className="text-emerald-600" /> De hoy
          <span className="text-xs font-normal text-navy-400">{fmtShortDay(today)}</span>
        </h2>
        {!loading && todayTrips.length === 0 ? (
          <div className="admin-card text-center text-sm text-navy-500 py-6">
            <CheckCircle2 size={22} className="mx-auto mb-1 text-emerald-500" />
            No hay recorridos en curso hoy ahora mismo.
          </div>
        ) : (
          <div className="space-y-3">{todayTrips.map((t) => renderCard(t, false))}</div>
        )}
      </section>

      {/* ANTERIORES */}
      {oldTrips.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowOld(!oldOpen)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 min-w-0">
              <History size={17} className="text-amber-700 shrink-0" />
              <span className="min-w-0">
                <span className="block font-display font-semibold text-amber-900">
                  Sin cerrar de días anteriores ({oldTrips.length})
                </span>
                <span className="block text-xs text-amber-800/80">
                  Se quedaron abiertos y por eso siguen apareciendo aquí y en Flota en vivo. Ciérralos para limpiar la lista.
                </span>
              </span>
            </span>
            <ChevronDown
              size={18}
              className="text-amber-700 shrink-0 transition-transform"
              style={{ transform: oldOpen ? 'rotate(180deg)' : 'none' }}
            />
          </button>
          {oldOpen && <div className="space-y-3">{oldTrips.map((t) => renderCard(t, true))}</div>}
        </section>
      )}
    </div>
  );
}

function TripRescueCard({ trip, old, today, now, route, operatorName, isOpen, onToggle, onClosed }) {
  const [stops, setStops] = useState(null);
  const [loadingStops, setLoadingStops] = useState(false);
  const [kmFinal, setKmFinal] = useState('');
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');

  async function openAndLoad() {
    onToggle();
    if (!isOpen && stops === null) {
      setLoadingStops(true);
      try {
        setStops(await getTripStopsOnce(trip.id));
      } catch (err) {
        setError(err?.message || 'No se pudieron cargar los alumnos.');
      }
      setLoadingStops(false);
    }
  }

  async function handleMark(studentId, action) {
    if (action === 'absent') {
      await markStopAbsent(trip.id, studentId);
    } else {
      await markStopManual(trip.id, studentId, action, null);
    }
    setStops(await getTripStopsOnce(trip.id));
  }

  async function handleClose() {
    setError('');
    if (kmFinal === '' || Number.isNaN(Number(kmFinal))) {
      setError('Captura el kilometraje final para poder cerrarlo.');
      return;
    }
    setClosing(true);
    try {
      await completeTrip(trip.id, trip, kmFinal, /* closedByAdmin */ true);
      onClosed();
    } catch (err) {
      setError(err.message || 'No se pudo cerrar el recorrido.');
      setClosing(false);
    }
  }

  const total = stops?.length ?? null;
  const pendingCount = stops?.filter((s) => s.status === 'pending').length ?? null;
  const doneCount = total != null ? total - pendingCount : null;
  const isMorning = trip.shift === 'morning';
  const sig = signalState(tsMs(trip.liveLocation?.updatedAt), now);
  const sigMeta = SIGNAL_META[sig];

  return (
    <div
      className={`rounded-2xl border bg-white overflow-hidden shadow-sm ${
        old ? 'border-amber-200' : 'border-emerald-200'
      }`}
    >
      <LoadingOverlay show={closing} label="Cerrando recorrido…" />
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${old ? 'bg-amber-400' : 'bg-emerald-500'}`} />
        <div className="flex-1 min-w-0 p-4">
          <button onClick={openAndLoad} className="w-full flex items-start justify-between gap-3 text-left">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display font-semibold text-navy-900 truncate">{route?.name || 'Ruta'}</p>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                    isMorning ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  {isMorning ? <Sun size={11} /> : <Moon size={11} />} {isMorning ? 'Ida' : 'Vuelta'}
                </span>
                {old && (
                  <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-100 text-amber-900">
                    {dayLabel(trip.date, today)}
                  </span>
                )}
              </div>
              <p className="text-sm text-navy-600">{operatorName}</p>
              <p className="text-xs text-navy-400">
                {old ? `${fmtShortDay(trip.date)} · ` : ''}iniciado {fmtTime(trip.startedAt)}
                {doneCount != null && ` · ${doneCount} de ${total} marcados`}
              </p>
              {!old && (
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium border rounded-full px-2 py-0.5 ${sigMeta.chip}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sigMeta.dot}`} />
                  {sigMeta.label}
                  {trip.liveLocation?.updatedAt ? ` · ${fmtAgo(tsMs(trip.liveLocation.updatedAt), now)}` : ''}
                </span>
              )}
            </div>
            <ChevronDown
              size={18}
              className="text-navy-400 shrink-0 mt-1 transition-transform"
              style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
            />
          </button>

          {total != null && total > 0 && (
            <div className="mt-3 h-1.5 rounded-full bg-navy-100 overflow-hidden">
              <div
                className={`h-full ${old ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${Math.round((doneCount / total) * 100)}%` }}
              />
            </div>
          )}

          {isOpen && (
            <div className="mt-4 pt-4 border-t border-navy-100 space-y-4">
              {loadingStops && <p className="text-sm text-navy-400">Cargando alumnos…</p>}

              {stops && (
                <div className="divide-y divide-navy-50 max-h-80 overflow-y-auto rounded-xl border border-navy-100">
                  {stops.map((s) => (
                    <div key={s.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        <span className={`inline-block mt-0.5 text-[11px] font-semibold rounded-full px-2 py-0.5 ${STATUS_CLS[s.status] || STATUS_CLS.pending}`}>
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleMark(s.id, isMorning ? 'boarded' : 'delivered')}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-go text-go min-h-[34px]"
                        >
                          {isMorning ? 'Marcar abordó' : 'Marcar bajó'}
                        </button>
                        <button
                          onClick={() => handleMark(s.id, 'absent')}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-stop text-stop min-h-[34px]"
                        >
                          No asistió
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-navy-50 rounded-xl p-3 space-y-2">
                <label className="admin-label">
                  Kilometraje final para cerrar
                  <span className="block text-xs font-normal text-navy-400 mt-0.5">
                    Pregúntaselo al operador si puedes contactarlo; si no sabes, pon el mismo
                    kilometraje inicial ({trip.kmInicial ?? '—'}) para no perder el registro.
                  </span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    value={kmFinal}
                    onChange={(e) => setKmFinal(e.target.value)}
                    placeholder={String(trip.kmInicial ?? '')}
                    className="admin-input"
                  />
                  <button
                    onClick={handleClose}
                    disabled={closing}
                    className="btn-admin bg-go text-white hover:bg-go/90 shrink-0"
                  >
                    {closing ? 'Cerrando…' : 'Cerrar recorrido'}
                  </button>
                </div>
                {error && <p className="text-stop text-sm">{error}</p>}
                <p className="text-xs text-navy-400">
                  Los alumnos que queden «Sin marcar» se guardan así tal cual — el sistema no inventa si
                  subieron o no. Puedes corregirlos arriba antes de cerrar si sabes lo que pasó.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
