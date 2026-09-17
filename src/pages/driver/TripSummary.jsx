import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Printer } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTrip, getTripStopsOnce, todayString } from '../../firebase/trips';
import { Students } from '../../firebase/services';
import { getFirstName, getFarewellMessage } from '../../utils/greetings';
import { fmtCoords } from '../../utils/dates';
import { numberedIcon } from '../../utils/mapIcons';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

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

export default function TripSummary() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [phones, setPhones] = useState({});
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    setNotFound(false);
    async function load() {
      try {
        const t = await getTrip(tripId);
        if (cancelled) return;
        if (!t) {
          // El recorrido no existe (id incorrecto, o se borró). Sin este
          // control, la pantalla se quedaba en "Cargando resumen…" para
          // siempre, porque `trip` nunca dejaba de ser null.
          setNotFound(true);
          return;
        }
        const s = await getTripStopsOnce(tripId);
        if (cancelled) return;
        setTrip(t);
        setStops(s);

        // Una sola consulta adicional (no un listener) para tener el
        // teléfono del padre a la mano y poder llamar directo desde aquí,
        // igual que durante el recorrido en vivo.
        if (t?.routeId) {
          const routeStudents = await Students.listByRoute(t.routeId);
          if (cancelled) return;
          const phoneById = {};
          routeStudents.forEach((st) => {
            if (st.parentContact) phoneById[st.id] = st.parentContact;
          });
          setPhones(phoneById);
        }
      } catch (err) {
        // Igual que en TripRunner/RouteHome/AuthContext: sin try/catch,
        // cualquier error (permisos, sin conexión) dejaba esta pantalla
        // pegada en "Cargando resumen…" para siempre.
        console.error('TripSummary load error:', err);
        if (!cancelled) {
          setLoadError(err.message || 'No se pudo cargar el resumen. Revisa tu conexión e intenta de nuevo.');
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tripId]);

  if (loadError) {
    return (
      <div className="card text-center mt-10 cascade-item">
        <p className="text-3xl mb-2">⚠️</p>
        <p className="font-display font-semibold text-lg mb-1">No se pudo abrir el resumen</p>
        <p className="text-navy-400 text-sm mb-4">{loadError}</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => window.location.reload()} className="btn-admin-primary">Reintentar</button>
          <button onClick={() => navigate('/chofer')} className="btn-admin-ghost">Volver al inicio</button>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="card text-center mt-10 cascade-item">
        <p className="text-3xl mb-2">🤔</p>
        <p className="font-display font-semibold text-lg mb-1">Ese recorrido ya no existe</p>
        <button onClick={() => navigate('/chofer')} className="btn-primary mt-3">Volver al inicio</button>
      </div>
    );
  }

  if (!trip) return <LoadingOverlay show label="Cargando resumen…" />;

  const timeKey = trip.shift === 'morning' ? 'boardedAt' : 'deliveredAt';
  const locKey = trip.shift === 'morning' ? 'boardedLocation' : 'deliveredLocation';
  const timeLabel = trip.shift === 'morning' ? 'Hora de recogida' : 'Hora de bajada';
  const isToday = trip.date === todayString();
  const withLocation = stops
    .filter((s) => s.status !== 'absent' && s[locKey]?.lat)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const mapCenter = withLocation[0]
    ? [withLocation[0][locKey].lat, withLocation[0][locKey].lng]
    : [19.4326, -99.1332];

  return (
    <div className="space-y-4 pb-10">
      <div className="bg-navy-800 text-white rounded-2xl px-5 py-6 text-center cascade-item print:hidden">
        <p className="text-3xl mb-2">{trip.shift === 'afternoon' ? '🏡' : '🎉'}</p>
        <h1 className="text-lg font-display font-bold">
          {isToday
            ? `Gracias, ${getFirstName(profile?.name)}. Recorrido guardado.`
            : `Recorrido de ${trip.shift === 'morning' ? 'ida' : 'vuelta'}`}
        </h1>
        <p className="text-navy-200 text-sm mt-1">
          {isToday ? getFarewellMessage(trip.shift) : 'Consulta de un recorrido anterior'}
        </p>
        <p className="text-navy-400 text-xs mt-2">{trip.date}</p>
      </div>

      <div className="card flex justify-around text-center text-sm cascade-item print:hidden" style={cascadeStyle(1, 60)}>
        <div>
          <p className="text-navy-400">Km inicial</p>
          <p className="font-display font-semibold text-lg">{trip.kmInicial ?? '—'}</p>
        </div>
        <div>
          <p className="text-navy-400">Km final</p>
          <p className="font-display font-semibold text-lg">{trip.kmFinal ?? '—'}</p>
        </div>
        <div>
          <p className="text-navy-400">Recorridos</p>
          <p className="font-display font-semibold text-lg">
            {trip.kmInicial != null && trip.kmFinal != null
              ? (trip.kmFinal - trip.kmInicial).toFixed(1)
              : '—'}
          </p>
        </div>
      </div>

      {withLocation.length > 0 && (
        <div className="summary-print">
          <div className="flex items-center justify-between mb-2 print:hidden">
            <p className="text-sm font-medium text-navy-600">
              Mapa de {trip.shift === 'morning' ? 'recolección' : 'entrega'} ({withLocation.length} puntos)
            </p>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm font-medium text-navy-600 underline shrink-0">
              <Printer size={14} /> Imprimir mapa
            </button>
          </div>
          <p className="hidden print:block text-sm text-navy-600 mb-2">
            {trip.shift === 'morning' ? 'Recolección' : 'Entrega'} · {trip.date}
          </p>
          <div className="card p-0 overflow-hidden print:shadow-none print:border print:border-navy-200" style={{ height: 300 }}>
            <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {withLocation.map((s, i) => (
                <Marker key={s.id} position={[s[locKey].lat, s[locKey].lng]} icon={numberedIcon(i + 1)}>
                  <Popup>
                    <div className="text-xs leading-relaxed">
                      <p className="font-semibold">{i + 1}. {s.name}</p>
                      <p>Matrícula: {s.matricula}</p>
                      <p>{timeLabel}: {fmtTime(s[timeKey])}</p>
                      <p className="text-navy-400">{fmtCoords(s[locKey].lat, s[locKey].lng)}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
          <div className="hidden print:block mt-3">
            <p className="text-xs font-semibold text-navy-600 mb-1">Nomenclatura</p>
            {withLocation.map((s, i) => (
              <p key={s.id} className="text-xs text-navy-700">
                {i + 1}. {s.name} — matrícula {s.matricula} · {timeLabel.toLowerCase()}: {fmtTime(s[timeKey])}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="card divide-y divide-navy-100 cascade-item print:hidden" style={cascadeStyle(2, 60)}>
        {stops.map((s, i) => (
          <div key={s.id} className="py-2 flex items-center justify-between gap-2 cascade-item" style={cascadeStyle(i, 20, 260)}>
            <div className="min-w-0">
              <p className="font-medium truncate">{s.name}</p>
              <p className="text-xs text-navy-400">Matrícula {s.matricula}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {phones[s.studentId] && (
                <a
                  href={`tel:${phones[s.studentId]}`}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-navy-100 text-navy-600 whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  📞 Llamar
                </a>
              )}
              <div className="text-right text-sm">
                {s.status === 'absent' ? (
                  <span className="text-wait">No asistió</span>
                ) : (
                  <span className="text-navy-600 whitespace-nowrap">{timeLabel}: {fmtTime(s[timeKey])}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => navigate('/chofer')} className="btn-primary print:hidden">
        Volver al inicio
      </button>
    </div>
  );
}
