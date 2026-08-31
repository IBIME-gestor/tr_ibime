import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Routes } from '../../firebase/services';
import { listTripsByRoute, getTripStopsOnce } from '../../firebase/trips';

// Ícono por defecto de Leaflet no carga bien con bundlers; se reconfigura aquí.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function fmtTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function Reports() {
  const [routes, setRoutesState] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [trips, setTrips] = useState([]);
  const [tripId, setTripId] = useState('');
  const [stops, setStops] = useState([]);

  useEffect(() => Routes.subscribe(setRoutesState), []);

  useEffect(() => {
    async function load() {
      if (!routeId) { setTrips([]); return; }
      const data = await listTripsByRoute(routeId);
      setTrips(data);
      setTripId(data[0]?.id || '');
    }
    load();
  }, [routeId]);

  useEffect(() => {
    async function load() {
      if (!tripId) { setStops([]); return; }
      const data = await getTripStopsOnce(tripId);
      setStops(data);
    }
    load();
  }, [tripId]);

  const trip = trips.find((t) => t.id === tripId);
  const timeKey = trip?.shift === 'morning' ? 'boardedAt' : 'deliveredAt';
  const locKey = trip?.shift === 'morning' ? 'boardedLocation' : 'deliveredLocation';

  const markers = useMemo(
    () => stops.filter((s) => s[locKey]?.lat).map((s) => ({ ...s, loc: s[locKey] })),
    [stops, locKey]
  );
  const center = markers[0]?.loc
    ? [markers[0].loc.lat, markers[0].loc.lng]
    : [19.4326, -99.1332]; // CDMX como centro por defecto si aún no hay puntos

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-navy-900 mb-6">Reportes de recorrido</h1>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          <option value="">Selecciona una ruta…</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          disabled={!routeId}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.date} · {t.shift === 'morning' ? 'Ida' : 'Vuelta'} · {t.status === 'completed' ? 'Completado' : 'En curso'}
            </option>
          ))}
        </select>
      </div>

      {!trip && <p className="text-navy-400 text-sm">Elige una ruta para ver sus recorridos.</p>}

      {trip && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-navy-400 border-b border-navy-100">
                  <th className="py-2 pr-2">Alumno</th>
                  <th className="py-2 pr-2">Hora</th>
                  <th className="py-2 pr-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {stops.map((s) => (
                  <tr key={s.id} className="border-b border-navy-50">
                    <td className="py-2 pr-2">{s.name}</td>
                    <td className="py-2 pr-2">{fmtTime(s[timeKey])}</td>
                    <td className="py-2 pr-2 capitalize">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-0 overflow-hidden" style={{ height: 420 }}>
            <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {markers.map((m) => (
                <Marker key={m.id} position={[m.loc.lat, m.loc.lng]}>
                  <Popup>
                    {m.name} · {fmtTime(m[timeKey])}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}
