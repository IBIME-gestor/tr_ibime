import { useEffect, useState } from 'react';
import { RefreshCw, Phone } from 'lucide-react';
import { Routes, Drivers } from '../../firebase/services';
import {
  listActiveTrips,
  getTripStopsOnce,
  markStopManual,
  markStopAbsent,
  completeTrip,
} from '../../firebase/trips';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

const STATUS_LABEL = {
  pending: 'Pendiente',
  boarded: 'Abordó',
  delivered: 'Bajó',
  absent: 'No asistió',
};

function fmtTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function ActiveTrips() {
  const [trips, setTrips] = useState([]);
  const [routesById, setRoutesById] = useState({});
  const [staffById, setStaffById] = useState({});
  const [loading, setLoading] = useState(true);
  const [openTripId, setOpenTripId] = useState(null);

  async function load() {
    setLoading(true);
    const [activeTrips, routes, staff] = await Promise.all([
      listActiveTrips(),
      Routes.list(),
      Drivers.list(),
    ]);
    setTrips(activeTrips);
    setRoutesById(Object.fromEntries(routes.map((r) => [r.id, r])));
    setStaffById(Object.fromEntries(staff.map((s) => [s.id, s])));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-3xl">
      <LoadingOverlay show={loading} label="Consultando…" />
      <div className="flex items-center justify-between gap-2 mb-1">
        <h1 className="admin-h1">Recorridos en curso</h1>
        <button
          onClick={load}
          disabled={loading}
          className="btn-admin-ghost text-xs shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Consultar de nuevo
        </button>
      </div>
      <p className="text-sm text-navy-400 mb-5">
        Recorridos que un operador inició hoy (o algún día anterior) y que nunca se
        cerraron — normalmente porque se quedaron sin datos o se les apagó el celular a media
        ruta. Desde aquí puedes revisar qué alcanzaron a marcar y cerrar el recorrido tú mismo.
      </p>

      {!loading && trips.length === 0 && (
        <div className="card text-center text-sm text-navy-400 cascade-item">
          No hay recorridos atorados en curso ahora mismo. 🎉
        </div>
      )}

      <div className="space-y-3">
        {trips.map((trip, i) => (
          <TripRescueCard
            key={trip.id}
            trip={trip}
            route={routesById[trip.routeId]}
            operatorName={
              staffById[trip.driverId]?.name ||
              (trip.nannyId && staffById[trip.nannyId]?.name) ||
              'Operador'
            }
            isOpen={openTripId === trip.id}
            onToggle={() => setOpenTripId(openTripId === trip.id ? null : trip.id)}
            onClosed={load}
            delay={i}
          />
        ))}
      </div>
    </div>
  );
}

function TripRescueCard({ trip, route, operatorName, isOpen, onToggle, onClosed, delay = 0 }) {
  const [stops, setStops] = useState(null);
  const [loadingStops, setLoadingStops] = useState(false);
  const [kmFinal, setKmFinal] = useState('');
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');

  async function openAndLoad() {
    onToggle();
    if (!isOpen && stops === null) {
      setLoadingStops(true);
      const data = await getTripStopsOnce(trip.id);
      setStops(data);
      setLoadingStops(false);
    }
  }

  async function handleMark(studentId, action) {
    if (action === 'absent') {
      await markStopAbsent(trip.id, studentId);
    } else {
      await markStopManual(trip.id, studentId, action, null);
    }
    const data = await getTripStopsOnce(trip.id);
    setStops(data);
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

  const pendingCount = stops?.filter((s) => s.status === 'pending').length ?? null;

  return (
    <div className="card cascade-item" style={cascadeStyle(delay, 60)}>
      <LoadingOverlay show={closing} label="Cerrando recorrido…" />
      <button onClick={openAndLoad} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="font-medium truncate">
            {route?.name || 'Ruta'} · {trip.shift === 'morning' ? 'Ida' : 'Vuelta'}
          </p>
          <p className="text-xs text-navy-400">
            {trip.date} · {operatorName} · iniciado {fmtTime(trip.startedAt)}
            {pendingCount != null && ` · ${pendingCount} sin marcar`}
          </p>
        </div>
        <span className="shrink-0 text-navy-400 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-navy-100 space-y-4 cascade-item">
          {loadingStops && <p className="text-sm text-navy-400">Cargando alumnos…</p>}

          {stops && (
            <div className="divide-y divide-navy-50 max-h-80 overflow-y-auto">
              {stops.map((s, i) => (
                <div
                  key={s.id}
                  className="py-2 flex flex-wrap items-center justify-between gap-2 cascade-item"
                  style={cascadeStyle(i, 20, 260)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-navy-400">{STATUS_LABEL[s.status] || s.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => handleMark(s.id, trip.shift === 'morning' ? 'boarded' : 'delivered')}
                      className="text-xs px-2 py-1.5 rounded-md border border-go text-go min-h-[32px]"
                    >
                      {trip.shift === 'morning' ? 'Marcar abordó' : 'Marcar bajó'}
                    </button>
                    <button
                      onClick={() => handleMark(s.id, 'absent')}
                      className="text-xs px-2 py-1.5 rounded-md border border-stop text-stop min-h-[32px]"
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
              Los alumnos que queden "Pendiente" se guardan así tal cual — el sistema no inventa
              si subieron o no. Puedes corregirlos arriba antes de cerrar si sabes lo que pasó
              realmente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
