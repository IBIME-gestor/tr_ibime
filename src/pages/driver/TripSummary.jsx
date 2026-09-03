import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTrip, getTripStopsOnce } from '../../firebase/trips';

function fmtTime(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function TripSummary() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);

  useEffect(() => {
    async function load() {
      const t = await getTrip(tripId);
      const s = await getTripStopsOnce(tripId);
      setTrip(t);
      setStops(s);
    }
    load();
  }, [tripId]);

  if (!trip) return <p className="text-center text-navy-400 mt-10">Cargando resumen…</p>;

  const timeKey = trip.shift === 'morning' ? 'boardedAt' : 'deliveredAt';
  const timeLabel = trip.shift === 'morning' ? 'Hora de recogida' : 'Hora de bajada';

  return (
    <div className="space-y-4 pb-10">
      <div className="text-center">
        <p className="text-4xl mb-1">🎉</p>
        <h1 className="text-xl font-display font-bold">Recorrido guardado</h1>
        <p className="text-navy-400 text-sm">{trip.date}</p>
      </div>

      <div className="card flex justify-around text-center text-sm">
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

      <div className="card divide-y divide-navy-100">
        {stops.map((s) => (
          <div key={s.id} className="py-2 flex items-center justify-between">
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-navy-400">Matrícula {s.matricula}</p>
            </div>
            <div className="text-right text-sm">
              {s.status === 'absent' ? (
                <span className="text-wait">No asistió</span>
              ) : (
                <span className="text-navy-600">{timeLabel}: {fmtTime(s[timeKey])}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => navigate('/chofer')} className="btn-primary">
        Volver al inicio
      </button>
    </div>
  );
}
