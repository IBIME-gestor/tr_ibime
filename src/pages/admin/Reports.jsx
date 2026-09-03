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
      <h1 className="admin-h1 mb-5">Reportes de recorrido</h1>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
          className="admin-select w-auto"
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
          className="admin-select w-auto"
        >
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.date} · {t.shift === 'morning' ? 'Ida' : 'Vuelta'} · {t.status === 'completed' ? 'Completado' : 'En curso'}
            </option>
          ))}
        </select>
      </div>

      {!trip && (
        <p className="text-navy-400 text-sm py-6 text-center admin-card">
          Elige una ruta para ver sus recorridos.
        </p>
      )}

      {trip && (
        <>
          <div className="admin-card mb-4 flex flex-wrap gap-8 text-sm">
            <div>
              <p className="text-navy-400 text-xs mb-0.5">Kilometraje inicial</p>
              <p className="font-display font-semibold text-lg text-navy-800">{trip.kmInicial ?? '—'}</p>
            </div>
            <div>
              <p className="text-navy-400 text-xs mb-0.5">Kilometraje final</p>
              <p className="font-display font-semibold text-lg text-navy-800">{trip.kmFinal ?? '—'}</p>
            </div>
            <div>
              <p className="text-navy-400 text-xs mb-0.5">Kilómetros recorridos</p>
              <p className="font-display font-semibold text-lg text-navy-800">
                {trip.kmInicial != null && trip.kmFinal != null
                  ? (trip.kmFinal - trip.kmInicial).toFixed(1)
                  : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="admin-card p-0 overflow-x-auto">
              <table className="table-admin">
                <thead>
                  <tr>
                    <th className="pl-5">Alumno</th>
                    <th>Hora</th>
                    <th className="pr-5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stops.map((s) => (
                    <tr key={s.id}>
                      <td className="pl-5">{s.name}</td>
                      <td className="text-navy-500">{fmtTime(s[timeKey])}</td>
                      <td className="pr-5 capitalize text-navy-500">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-card p-0 overflow-hidden" style={{ height: 420 }}>
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
        </>
      )}
    </div>
  );
}
