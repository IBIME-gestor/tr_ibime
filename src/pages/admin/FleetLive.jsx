import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Routes, Drivers } from '../../firebase/services';
import { Link } from 'react-router-dom';
import { History, PhoneCall, AlertTriangle } from 'lucide-react';
import { subscribeActiveTripsLive, todayString } from '../../firebase/trips';
import { tsMs } from '../../utils/tripOrder';
import { fmtAgo, signalState, SIGNAL_META } from '../../utils/tripStatus';
import { busIcon, startFlagIcon } from '../../utils/mapIcons';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MEXICO_CITY = [19.4326, -99.1332];

function fmtTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/**
 * MapContainer de Leaflet solo lee la prop `center` UNA vez, al montarse
 * — si en ese primer instante todavía no habían llegado ubicaciones
 * (justo lo que pasa aquí, porque el listener de Firestore tarda un
 * pestañeo), se queda fijo en el centro genérico para siempre. Este
 * componente vive DENTRO del mapa y lo reencuadra por su cuenta cuando
 * cambia el conjunto de operadores activos.
 *
 * A propósito solo reacciona cuando ENTRA o SALE un operador (la key es
 * la lista de ids, no las coordenadas) — si reencuadrara en cada
 * actualización de posición (cada ~5 s por transporte), sería molesto estar
 * "regresando" el mapa mientras el admin lo está viendo o moviendo.
 */
function FitBounds({ points }) {
  const map = useMap();
  const key = points.map((p) => p.id).sort().join(',');

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14);
      return;
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lng]),
      { padding: [50, 50], maxZoom: 15 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

/** Al elegir un operador de la lista, centra el mapa en él sin recargar nada. */
function FlyToSelected({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], 15, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.id]);
  return null;
}

/**
 * Flota en vivo — mapa en tiempo real de los recorridos de HOY.
 *
 * Un recorrido que se quedó "en curso" de un día anterior ya no se mezcla
 * con los de hoy: no aparece en el mapa ni en la lista, solo se avisa
 * aparte con un enlace a «Recorridos en curso» para cerrarlo.
 */
export default function FleetLive() {
  const [trips, setTrips] = useState([]);
  const [routesById, setRoutesById] = useState({});
  const [staffById, setStaffById] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    Routes.list().then((rs) => setRoutesById(Object.fromEntries(rs.map((r) => [r.id, r]))));
    Drivers.list().then((ds) => setStaffById(Object.fromEntries(ds.map((d) => [d.id, d]))));
  }, []);
  useEffect(() => subscribeActiveTripsLive(setTrips), []);
  // Reloj para que "hace 12 s" y el estado de la señal se mantengan al día.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  const today = todayString();
  const todayTrips = useMemo(
    () => trips.filter((t) => t.date === today).sort((a, b) => String(routesById[a.routeId]?.name || '').localeCompare(String(routesById[b.routeId]?.name || ''), 'es')),
    [trips, today, routesById]
  );
  const staleOld = trips.length - todayTrips.length;

  const withLocation = useMemo(() => todayTrips.filter((t) => t.liveLocation?.lat != null), [todayTrips]);
  const points = useMemo(
    () => withLocation.map((t) => ({ id: t.id, lat: t.liveLocation.lat, lng: t.liveLocation.lng })),
    [withLocation]
  );
  const selectedPoint = points.find((p) => p.id === selectedId) || null;

  const counts = useMemo(() => {
    const c = { live: 0, weak: 0, lost: 0, none: 0 };
    todayTrips.forEach((t) => { c[signalState(tsMs(t.liveLocation?.updatedAt), now)] += 1; });
    return c;
  }, [todayTrips, now]);

  // Recorridos que necesitan una llamada: llevan más de 3 min sin señal, o
  // salieron hace más de 3 min y nunca han transmitido ubicación.
  const lostTrips = useMemo(() => todayTrips
    .map((t) => {
      const upd = tsMs(t.liveLocation?.updatedAt);
      const started = tsMs(t.startedAt);
      const sig = signalState(upd, now);
      const since = upd ?? started;
      const lost = sig === 'lost' || (sig === 'none' && started != null && now - started > 3 * 60 * 1000);
      return lost && since != null ? { trip: t, since } : null;
    })
    .filter(Boolean), [todayTrips, now]);

  // El número en el título de la pestaña avisa aunque el admin esté en otra.
  useEffect(() => {
    const base = document.title.replace(/^⚠ \(\d+\) sin señal · /, '');
    document.title = lostTrips.length ? `⚠ (${lostTrips.length}) sin señal · ${base}` : base;
    return () => { document.title = base; };
  }, [lostTrips.length]);

  const icon = useMemo(() => busIcon(), []);
  const flag = useMemo(() => startFlagIcon(), []);
  const operatorOf = (trip) =>
    staffById[trip.driverId]?.name || (trip.nannyId && staffById[trip.nannyId]?.name) || 'Operador';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="admin-h1 mb-1">Flota en vivo</h1>
        <p className="text-sm text-navy-500">
          Dónde va cada transporte <b>hoy</b>. Se actualiza sola, no hace falta refrescar.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="En ruta hoy" value={todayTrips.length} cls="border-navy-100 bg-white text-navy-900" />
        <Stat label="En vivo" value={counts.live} cls="border-emerald-200 bg-emerald-50 text-emerald-900" dot="bg-emerald-500" />
        <Stat label="Señal débil / perdida" value={counts.weak + counts.lost} cls={counts.weak + counts.lost ? 'border-red-200 bg-red-50 text-red-900' : 'border-navy-100 bg-white text-navy-300'} dot="bg-red-500" />
        <Stat label="Sin ubicación aún" value={counts.none} cls="border-slate-200 bg-slate-50 text-slate-700" dot="bg-slate-400" />
      </div>

      {lostTrips.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 space-y-2">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} className="shrink-0" />
            {lostTrips.length === 1 ? '1 transporte sin señal' : `${lostTrips.length} transportes sin señal`}: llama al operador para confirmar
          </p>
          <ul className="space-y-1.5">
            {lostTrips.map(({ trip, since }) => {
              const phone = staffById[trip.driverId]?.phone;
              return (
                <li key={trip.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{routesById[trip.routeId]?.name || 'Ruta'}</b> · {trip.shift === 'morning' ? 'Ida' : 'Vuelta'} · {operatorOf(trip)}
                    <span className="text-red-700"> · última señal {fmtAgo(since, now)}</span>
                  </span>
                  {phone && (
                    <a href={`tel:${String(phone).replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold px-3 py-1.5">
                      <PhoneCall size={13} /> Llamar
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {staleOld > 0 && (
        <Link
          to="/admin/recorridos-activos"
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
        >
          <History size={18} className="shrink-0" />
          <span>
            Hay <b>{staleOld}</b> recorrido{staleOld === 1 ? '' : 's'} de días anteriores que nunca se cerraron (no se
            muestran aquí). <u>Revisarlos y cerrarlos</u>
          </span>
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4">
        <div className="space-y-2 order-2 lg:order-1 max-h-[560px] overflow-y-auto pr-1">
          {todayTrips.length === 0 && (
            <div className="admin-card text-center text-sm text-navy-500 py-8">
              No hay ningún recorrido en curso hoy ahora mismo.
            </div>
          )}
          {todayTrips.map((trip) => {
            const upd = tsMs(trip.liveLocation?.updatedAt);
            const sig = signalState(upd, now);
            const meta = SIGNAL_META[sig];
            const isMorning = trip.shift === 'morning';
            const selected = selectedId === trip.id;
            return (
              <button
                key={trip.id}
                onClick={() => setSelectedId(trip.id)}
                className={`w-full text-left rounded-xl border bg-white p-3 transition-all hover:shadow-md ${
                  selected ? 'border-signal-yellow ring-2 ring-signal-yellow shadow-md' : 'border-navy-100'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-semibold text-navy-900 truncate">{routesById[trip.routeId]?.name || 'Ruta'}</p>
                  <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${isMorning ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-800'}`}>
                    {isMorning ? 'Ida' : 'Vuelta'}
                  </span>
                </div>
                <p className="text-sm text-navy-600 mt-0.5 truncate">{operatorOf(trip)}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium border rounded-full px-2 py-0.5 ${meta.chip}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${sig === 'live' ? 'animate-pulse' : ''}`} />
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-navy-400">
                    {upd != null ? `${fmtAgo(upd, now)} · ${fmtTime(trip.liveLocation.updatedAt)}` : `salió ${fmtTime(trip.startedAt)}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl overflow-hidden border border-navy-100 order-1 lg:order-2 w-full min-w-0 relative" style={{ height: 560 }}>
          <MapContainer center={MEXICO_CITY} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            <FlyToSelected point={selectedPoint} />
            {todayTrips.filter((t) => t.startLocation?.lat != null).map((trip) => (
              <Marker key={`start-${trip.id}`} position={[trip.startLocation.lat, trip.startLocation.lng]} icon={flag}>
                <Popup>
                  <p className="font-medium">Salida · {routesById[trip.routeId]?.name || 'Ruta'}</p>
                  <p>{trip.shift === 'morning' ? 'Ida' : 'Vuelta'}</p>
                </Popup>
              </Marker>
            ))}
            {withLocation.map((trip) => (
              <Marker
                key={trip.id}
                position={[trip.liveLocation.lat, trip.liveLocation.lng]}
                icon={icon}
                zIndexOffset={selectedId === trip.id ? 1000 : 0}
                eventHandlers={{ click: () => setSelectedId(trip.id) }}
              >
                <Popup>
                  <p className="font-medium">{routesById[trip.routeId]?.name || 'Ruta'}</p>
                  <p>{trip.shift === 'morning' ? 'Ida' : 'Vuelta'} · {operatorOf(trip)}</p>
                  <p className="text-xs">{fmtAgo(tsMs(trip.liveLocation.updatedAt), now)}</p>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          {todayTrips.length > 0 && withLocation.length === 0 && (
            <div className="absolute inset-x-0 top-3 mx-auto w-fit z-[500] rounded-full bg-white/95 shadow px-4 py-1.5 text-xs text-navy-600">
              Esperando la primera ubicación de los transportes…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, cls, dot }) {
  return (
    <div className={`rounded-2xl border p-3 ${cls}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80 flex items-center gap-1.5">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />} {label}
      </p>
      <p className="text-3xl font-display font-bold mt-0.5">{value}</p>
    </div>
  );
}
