import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { getPublicStudentIndex, subscribePublicTracking, TRIP_ALERT_TYPES } from '../firebase/trips';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Si no hay todavía suficiente historial de esta ruta/turno para calcular
// un promedio real, usamos este valor genérico solo para no dejar al padre
// sin ningún estimado el primer par de días.
const FALLBACK_MINUTES_PER_STOP = 3;

const STATUS_LABEL = {
  pending: 'Aún no pasa el camión',
  boarded: 'A bordo del camión',
  delivered: 'Ya llegó',
  absent: 'No asistió hoy',
};

function fmtEta(minutesFromNow) {
  const d = new Date(Date.now() + minutesFromNow * 60000);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function PublicTrack() {
  const [matricula, setMatricula] = useState('');
  const [shift, setShift] = useState('afternoon');
  const [studentIndex, setStudentIndex] = useState(null); // {studentId, name, routeId}
  const [tracking, setTracking] = useState(null); // doc de publicTracking
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const unsubRef = useRef(null);

  useEffect(() => () => unsubRef.current?.(), []);

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setTracking(null);
    unsubRef.current?.();
    if (!matricula.trim()) return;

    setSearching(true);
    const idx = await getPublicStudentIndex(matricula);
    setSearching(false);

    if (!idx) {
      setError('No encontramos ningún alumno con esa matrícula.');
      setStudentIndex(null);
      return;
    }
    setStudentIndex(idx);
    unsubRef.current = subscribePublicTracking(idx.routeId, shift, setTracking);
  }

  const myStop = useMemo(
    () => tracking?.stops?.find((s) => s.matricula === matricula.trim()),
    [tracking, matricula]
  );

  const eta = useMemo(() => {
    if (!tracking?.stops || !myStop) return null;
    if (myStop.status === 'delivered') return { done: true };
    if (myStop.status === 'absent') return { absent: true };

    const sorted = [...tracking.stops].sort((a, b) => a.order - b.order);
    const doneUpTo = sorted.reduce(
      (max, s) => (s.resolvedAt ? Math.max(max, s.order) : max),
      -1
    );
    if (myStop.order <= doneUpTo) return { done: true };

    const avg = tracking.avgStopMinutes || [];
    let minutes = 0;
    let usedFallback = false;
    for (let i = doneUpTo + 1; i <= myStop.order; i++) {
      if (avg[i] != null) {
        minutes += avg[i];
      } else {
        minutes += FALLBACK_MINUTES_PER_STOP;
        usedFallback = true;
      }
    }
    return { minutes, usedFallback };
  }, [tracking, myStop]);

  const liveLoc = tracking?.liveLocation;
  const liveIsStale =
    liveLoc?.updatedAt?.toMillis &&
    Date.now() - liveLoc.updatedAt.toMillis() > 3 * 60 * 1000;

  return (
    <div className="min-h-screen bg-navy-50 flex justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-display font-bold text-navy-900">Seguimiento del transporte</h1>
          <p className="text-navy-400 text-sm">Consulta con la matrícula de tu hijo(a)</p>
        </div>

        <form onSubmit={handleSearch} className="card space-y-3">
          <input
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            inputMode="numeric"
            placeholder="Matrícula"
            className="w-full rounded-xl border border-navy-100 px-3 py-3 text-lg"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShift('morning')}
              className={`py-2 rounded-xl border-2 text-sm font-medium ${
                shift === 'morning' ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-100'
              }`}
            >
              ☀️ Recorrido de ida
            </button>
            <button
              type="button"
              onClick={() => setShift('afternoon')}
              className={`py-2 rounded-xl border-2 text-sm font-medium ${
                shift === 'afternoon' ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-100'
              }`}
            >
              🌇 Recorrido de vuelta
            </button>
          </div>
          <button
            type="submit"
            disabled={searching}
            className="w-full py-3 rounded-xl bg-go text-white font-display font-semibold"
          >
            {searching ? 'Buscando…' : 'Ver seguimiento'}
          </button>
          {error && <p className="text-stop text-sm">{error}</p>}
        </form>

        {studentIndex && !tracking && (
          <div className="card text-center text-sm text-navy-400">
            Aún no ha iniciado el recorrido de {shift === 'morning' ? 'ida' : 'vuelta'} de hoy para{' '}
            {studentIndex.name}.
          </div>
        )}

        {tracking?.alert && (
          <div className="rounded-xl border-2 border-signal-yellow bg-signal-yellow/15 p-3">
            <p className="font-display font-semibold text-sm text-navy-800">
              {TRIP_ALERT_TYPES[tracking.alert.type]?.icon} {TRIP_ALERT_TYPES[tracking.alert.type]?.label}{' '}
              reportado por el transporte
            </p>
            {tracking.alert.message && (
              <p className="text-sm text-navy-600 mt-0.5">{tracking.alert.message}</p>
            )}
          </div>
        )}

        {tracking && myStop && (
          <div className="card space-y-3">
            <div>
              <p className="font-display font-semibold text-lg">{studentIndex.name}</p>
              <p className="text-sm text-navy-400">
                Parada {myStop.order + 1} · {STATUS_LABEL[myStop.status] || 'Pendiente'}
              </p>
            </div>

            {eta?.done && (
              <p className="text-go font-semibold">✅ Ya llegó a este punto del recorrido.</p>
            )}
            {eta?.absent && <p className="text-navy-400">No asistió hoy al recorrido.</p>}
            {eta && !eta.done && !eta.absent && (
              <div className="bg-signal-yellow/20 border-2 border-signal-yellow rounded-xl p-3">
                <p className="text-sm text-navy-600">Llegada aproximada</p>
                <p className="text-2xl font-display font-bold text-navy-900">
                  {fmtEta(eta.minutes)}
                </p>
                <p className="text-xs text-navy-400 mt-1">
                  Estimado con base en el promedio histórico de esta ruta
                  {eta.usedFallback ? ' (recorrido nuevo, aún con poco historial)' : ''}. Puede variar
                  por tráfico o imprevistos.
                </p>
              </div>
            )}

            {liveLoc?.lat && (
              <>
                <div className="rounded-xl overflow-hidden" style={{ height: 260 }}>
                  <MapContainer
                    center={[liveLoc.lat, liveLoc.lng]}
                    zoom={13}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={[liveLoc.lat, liveLoc.lng]}>
                      <Popup>Ubicación del camión</Popup>
                    </Marker>
                  </MapContainer>
                </div>
                {liveIsStale && (
                  <p className="text-xs text-stop">
                    ⚠️ La última ubicación reportada tiene más de 3 minutos; puede que el camión no
                    esté transmitiendo en este momento.
                  </p>
                )}
              </>
            )}
            {!liveLoc?.lat && (
              <p className="text-xs text-navy-400">
                El camión todavía no ha compartido su ubicación en este recorrido.
              </p>
            )}
          </div>
        )}

        {tracking && !myStop && (
          <div className="card text-center text-sm text-stop">
            Tu hijo(a) no aparece en el recorrido de hoy en este turno. Verifica la matrícula o el
            turno seleccionado.
          </div>
        )}
      </div>
    </div>
  );
}
