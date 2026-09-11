import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Routes, Drivers } from '../../firebase/services';
import { subscribeActiveTripsLive } from '../../firebase/trips';
import { cascadeStyle } from '../../utils/cascade';

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
 * actualización de posición (cada ~15s por camión), sería molesto estar
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
 * Mapa en vivo de todos los recorridos activos, para el admin. A
 * diferencia del resto de pantallas de admin (que consultan solo bajo
 * demanda para cuidar lecturas), esta SÍ se actualiza sola en tiempo
 * real — es justo el punto: ver moverse los camiones sin refrescar.
 *
 * Un marcador por operador en curso: la consulta ya filtra por
 * status === 'in_progress', así que un recorrido aparece solo en cuanto
 * el chofer arranca (kilometraje inicial) y desaparece solo en cuanto se
 * cierra (kilometraje final) — sea el chofer o el admin quien lo cierre.
 */
export default function FleetLive() {
  const [trips, setTrips] = useState([]);
  const [routesById, setRoutesById] = useState({});
  const [staffById, setStaffById] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  // Nombres de ruta y operador: catálogos chicos, se cargan una vez.
  useEffect(() => {
    Routes.list().then((rs) => setRoutesById(Object.fromEntries(rs.map((r) => [r.id, r]))));
    Drivers.list().then((ds) => setStaffById(Object.fromEntries(ds.map((d) => [d.id, d]))));
  }, []);

  useEffect(() => subscribeActiveTripsLive(setTrips), []);

  const withLocation = useMemo(
    () => trips.filter((t) => t.liveLocation?.lat != null),
    [trips]
  );

  const points = useMemo(
    () => withLocation.map((t) => ({ id: t.id, lat: t.liveLocation.lat, lng: t.liveLocation.lng })),
    [withLocation]
  );

  const selectedPoint = points.find((p) => p.id === selectedId) || null;

  return (
    <div>
      <h1 className="admin-h1 mb-1">Flota en vivo</h1>
      <p className="text-sm text-navy-400 mb-5">
        Ubicación en tiempo real de todos los recorridos activos ahora mismo — se actualiza sola,
        no hace falta refrescar.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
        <div className="space-y-2 order-2 lg:order-1 max-h-[520px] overflow-y-auto">
          {trips.length === 0 && (
            <div className="admin-card text-center text-sm text-navy-400 cascade-item">
              No hay ningún recorrido en curso ahora mismo.
            </div>
          )}
          {trips.map((trip, i) => {
            const stale =
              trip.liveLocation?.updatedAt?.toMillis &&
              Date.now() - trip.liveLocation.updatedAt.toMillis() > 3 * 60 * 1000;
            const operatorName =
              staffById[trip.driverId]?.name ||
              (trip.nannyId && staffById[trip.nannyId]?.name) ||
              'Operador';
            return (
              <button
                key={trip.id}
                onClick={() => setSelectedId(trip.id)}
                className={`admin-card w-full text-left cascade-item transition-shadow ${
                  selectedId === trip.id ? 'ring-2 ring-signal-yellow' : ''
                }`}
                style={cascadeStyle(i, 60)}
              >
                <p className="font-medium truncate">
                  {routesById[trip.routeId]?.name || 'Ruta'} ·{' '}
                  {trip.shift === 'morning' ? 'Ida' : 'Vuelta'}
                </p>
                <p className="text-xs text-navy-400 mt-0.5">{operatorName}</p>
                {trip.liveLocation ? (
                  <p className={`text-xs mt-1 ${stale ? 'text-stop' : 'text-go'}`}>
                    {stale ? '⚠️ Sin señal reciente' : '🟢 En vivo'} · última actualización{' '}
                    {fmtTime(trip.liveLocation.updatedAt)}
                  </p>
                ) : (
                  <p className="text-xs text-navy-400 mt-1">Aún sin transmitir ubicación</p>
                )}
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl overflow-hidden border border-navy-100 order-1 lg:order-2 w-full min-w-0" style={{ height: 520 }}>
          <MapContainer center={MEXICO_CITY} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            <FlyToSelected point={selectedPoint} />
            {withLocation.map((trip) => {
              const operatorName =
                staffById[trip.driverId]?.name ||
                (trip.nannyId && staffById[trip.nannyId]?.name) ||
                'Operador';
              return (
                <Marker
                  key={trip.id}
                  position={[trip.liveLocation.lat, trip.liveLocation.lng]}
                  eventHandlers={{ click: () => setSelectedId(trip.id) }}
                >
                  <Popup>
                    <p className="font-medium">{routesById[trip.routeId]?.name || 'Ruta'}</p>
                    <p>{trip.shift === 'morning' ? 'Ida' : 'Vuelta'} · {operatorName}</p>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
