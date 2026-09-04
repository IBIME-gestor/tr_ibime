import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Sunset, History } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Routes } from '../../firebase/services';
import { getTimeGreeting, getFirstName } from '../../utils/greetings';

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
    <div className="space-y-5">
      <div className="bg-navy-800 text-white rounded-2xl px-5 py-4">
        <p className="text-navy-300 text-xs capitalize">{today}</p>
        <h1 className="text-xl font-display font-bold">
          {getTimeGreeting()}, {getFirstName(profile?.name)} 👋
        </h1>
        <p className="text-navy-200 text-sm mt-0.5">¿Qué recorrido vas a hacer?</p>
      </div>

      {routes.map((route) => (
        <div key={route.id} className="card">
          <p className="font-display font-semibold text-lg mb-3">{route.name}</p>
          <div className="grid grid-cols-1 gap-2.5">
            <button
              className="btn-go flex items-center justify-center gap-2"
              onClick={() => navigate(`/chofer/recorrido/${route.id}/morning`)}
            >
              <Sun size={20} /> Recorrido de ida (mañana)
            </button>
            <button
              className="btn-signal flex items-center justify-center gap-2"
              onClick={() => navigate(`/chofer/recorrido/${route.id}/afternoon`)}
            >
              <Sunset size={20} /> Recorrido de vuelta (tarde)
            </button>
          </div>
          <p className="text-xs text-navy-400 mt-3">
            ¿Ruta nueva para ti? Consulta cómo se hizo antes:{' '}
            <button
              onClick={() => navigate(`/chofer/referencia/${route.id}/morning`)}
              className="underline font-medium text-navy-600"
            >
              ver ida
            </button>{' '}
            ·{' '}
            <button
              onClick={() => navigate(`/chofer/referencia/${route.id}/afternoon`)}
              className="underline font-medium text-navy-600"
            >
              ver vuelta
            </button>
          </p>
        </div>
      ))}

      <button
        onClick={() => navigate('/chofer/historial')}
        className="w-full flex items-center justify-center gap-2 text-navy-400 text-sm py-2"
      >
        <History size={15} /> Ver recorridos anteriores
      </button>
    </div>
  );
}
