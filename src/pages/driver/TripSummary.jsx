import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getTrip, getTripStopsOnce, todayString } from '../../firebase/trips';
import { Students } from '../../firebase/services';
import { getFirstName, getFarewellMessage } from '../../utils/greetings';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

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

  useEffect(() => {
    async function load() {
      const t = await getTrip(tripId);
      const s = await getTripStopsOnce(tripId);
      setTrip(t);
      setStops(s);

      // Una sola consulta adicional (no un listener) para tener el
      // teléfono del padre a la mano y poder llamar directo desde aquí,
      // igual que durante el recorrido en vivo.
      if (t?.routeId) {
        const routeStudents = await Students.listByRoute(t.routeId);
        const phoneById = {};
        routeStudents.forEach((st) => {
          if (st.parentContact) phoneById[st.id] = st.parentContact;
        });
        setPhones(phoneById);
      }
    }
    load();
  }, [tripId]);

  if (!trip) return <LoadingOverlay show label="Cargando resumen…" />;

  const timeKey = trip.shift === 'morning' ? 'boardedAt' : 'deliveredAt';
  const timeLabel = trip.shift === 'morning' ? 'Hora de recogida' : 'Hora de bajada';
  const isToday = trip.date === todayString();

  return (
    <div className="space-y-4 pb-10">
      <div className="bg-navy-800 text-white rounded-2xl px-5 py-6 text-center cascade-item">
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

      <div className="card flex justify-around text-center text-sm cascade-item" style={cascadeStyle(1, 60)}>
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

      <div className="card divide-y divide-navy-100 cascade-item" style={cascadeStyle(2, 60)}>
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

      <button onClick={() => navigate('/chofer')} className="btn-primary">
        Volver al inicio
      </button>
    </div>
  );
}
