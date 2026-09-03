import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Routes } from '../../firebase/services';

export default function RouteHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [routes, setRoutesState] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!profile?.staffId) {
        setLoading(false);
        return;
      }
      const mine =
        profile.role === 'nanny'
          ? await Routes.listByNanny(profile.staffId)
          : await Routes.listByDriver(profile.staffId);
      setRoutesState(mine);
      setLoading(false);
    }
    load();
  }, [profile]);

  if (loading) return <p className="text-center text-navy-400 mt-10">Cargando tu ruta…</p>;

  if (routes.length === 0) {
    return (
      <div className="card text-center mt-10">
        <p className="font-display font-semibold text-lg mb-1">Sin ruta asignada</p>
        <p className="text-navy-400 text-sm">
          Pide al administrador que te asigne una ruta, plantel y unidad.
        </p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-navy-400 text-sm capitalize">{today}</p>
        <h1 className="text-2xl font-display font-bold text-navy-900">¿Qué recorrido vas a hacer?</h1>
      </div>

      {routes.map((route) => (
        <div key={route.id} className="card">
          <p className="font-display font-semibold text-lg mb-3">{route.name}</p>
          <div className="grid grid-cols-1 gap-3">
            <button
              className="btn-go"
              onClick={() => navigate(`/chofer/recorrido/${route.id}/morning`)}
            >
              ☀️ Recorrido de ida (mañana)
            </button>
            <button
              className="btn-signal"
              onClick={() => navigate(`/chofer/recorrido/${route.id}/afternoon`)}
            >
              🌇 Recorrido de vuelta (tarde)
            </button>
          </div>
          <p className="text-xs text-navy-400 mt-3">
            ¿Ruta nueva para ti? Consulta cómo se hizo antes:{' '}
            <button
              onClick={() => navigate(`/chofer/referencia/${route.id}/morning`)}
              className="underline"
            >
              ver ida
            </button>{' '}
            ·{' '}
            <button
              onClick={() => navigate(`/chofer/referencia/${route.id}/afternoon`)}
              className="underline"
            >
              ver vuelta
            </button>
          </p>
        </div>
      ))}

      <button
        onClick={() => navigate('/chofer/historial')}
        className="w-full text-center text-navy-400 text-sm underline py-2"
      >
        Ver recorridos anteriores
      </button>
    </div>
  );
}
