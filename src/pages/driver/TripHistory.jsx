import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listTripsByDriver, listTripsByNanny } from '../../firebase/trips';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

/**
 * Historial del operador. A propósito NO se suscribe en tiempo real
 * (no usa onSnapshot): hace una sola consulta (getDocs) cuando entras a
 * la pantalla o cuando aprietas "Consultar de nuevo", para cuidar las
 * lecturas de Firestore. No se actualiza sola mientras la ves.
 */
export default function TripHistory() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);

  async function load() {
    if (!profile?.staffId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const data =
      profile.role === 'nanny'
        ? await listTripsByNanny(profile.staffId)
        : await listTripsByDriver(profile.staffId);
    setTrips(data);
    setLoading(false);
    setLoadedAt(new Date());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  return (
    <div className="space-y-3">
      <LoadingOverlay show={loading && trips.length === 0} label="Consultando tu historial…" />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-display font-bold">Mis recorridos</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium text-navy-500 shrink-0 px-2 py-1.5 rounded-lg border border-navy-100"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Consultar de nuevo
        </button>
      </div>

      {loadedAt && (
        <p className="text-xs text-navy-400">
          Actualizado a las {loadedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {!loading && trips.length === 0 && (
        <p className="text-navy-400 text-sm">Aún no hay recorridos guardados.</p>
      )}

      {trips.map((t, i) => (
        <Link
          key={t.id}
          to={`/chofer/resumen/${t.id}`}
          className="card flex items-center justify-between gap-3 cascade-item"
          style={cascadeStyle(i, 40)}
        >
          <div className="min-w-0">
            <p className="font-medium truncate">{t.date}</p>
            <p className="text-sm text-navy-400">
              {t.shift === 'morning' ? 'Ida' : 'Vuelta'} ·{' '}
              {t.status === 'completed' ? 'Completado' : 'En curso'}
              {t.studentsTotal != null && (
                <>
                  {' '}
                  · {t.studentsTotal} alumno{t.studentsTotal === 1 ? '' : 's'}
                  {t.studentsAbsent > 0 && ` · ${t.studentsAbsent} no asistió`}
                </>
              )}
            </p>
          </div>
          <span className="shrink-0">›</span>
        </Link>
      ))}
    </div>
  );
}
