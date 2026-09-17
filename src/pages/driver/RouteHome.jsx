import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Sunset, History, Users, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Routes, Students } from '../../firebase/services';
import { studentAppliesToday, todayString } from '../../firebase/trips';
import { getTimeGreeting, getFirstName } from '../../utils/greetings';
import { fmtDateTime24 } from '../../utils/dates';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

export default function RouteHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [routes, setRoutesState] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rosterFor, setRosterFor] = useState(null); // `${routeId}-${shift}`
  const [rosterStudents, setRosterStudents] = useState([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError('');
      if (!profile?.staffId) {
        setLoading(false);
        return;
      }
      try {
        const mine =
          profile.role === 'nanny'
            ? await Routes.listByNanny(profile.staffId)
            : await Routes.listByDriver(profile.staffId);
        if (cancelled) return;
        setRoutesState(mine);
        setLoading(false);
      } catch (err) {
        // Igual que en AuthContext: sin try/catch, un error aquí dejaba
        // esta pantalla pegada en "Cargando tu ruta…" para siempre.
        console.error('RouteHome load error:', err);
        if (!cancelled) {
          setLoadError(err.message || 'No se pudo cargar tu ruta. Revisa tu conexión e intenta de nuevo.');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile]);

  async function toggleRoster(routeId, shift) {
    const key = `${routeId}-${shift}`;
    if (rosterFor === key) { setRosterFor(null); return; }
    setRosterFor(key);
    const all = await Students.listByRoute(routeId);
    const today = todayString();
    const applicable = all
      .filter((s) => studentAppliesToday(s, today, shift))
      .sort((a, b) => a.name.localeCompare(b.name));
    setRosterStudents(applicable);
  }

  if (loading) return <LoadingOverlay show label="Cargando tu ruta…" />;

  if (loadError) {
    return (
      <div className="card text-center mt-10 cascade-item">
        <p className="text-3xl mb-2">⚠️</p>
        <p className="font-display font-semibold text-lg mb-1">No se pudo cargar tu ruta</p>
        <p className="text-navy-400 text-sm mb-4">{loadError}</p>
        <button onClick={() => window.location.reload()} className="btn-admin-primary mx-auto">
          Reintentar
        </button>
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="card text-center mt-10 cascade-item">
        <p className="font-display font-semibold text-lg mb-1">Sin ruta asignada</p>
        <p className="text-navy-400 text-sm">
          Pide al administrador que te asigne una ruta, plantel y unidad.
        </p>
      </div>
    );
  }

  const today = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-5">
      <div className="bg-navy-800 text-white rounded-2xl px-5 py-4 cascade-item">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-navy-300 text-xs capitalize">{today}</p>
            <h1 className="text-xl font-display font-bold">
              {getTimeGreeting()}, {getFirstName(profile?.name)} 👋
            </h1>
          </div>
          <p className="text-navy-300 text-xs font-display tabular-nums text-right shrink-0 pt-0.5">
            {fmtDateTime24(now)}
          </p>
        </div>
      </div>

      {routes.map((route, i) => (
        <div key={route.id} className="card cascade-item" style={cascadeStyle(i + 1, 60)}>
          <p className="text-xs font-semibold text-navy-400 uppercase tracking-wide mb-1">Iniciar recorrido</p>
          <p className="font-display font-semibold text-lg mb-3">{route.name}</p>

          <div className="grid grid-cols-1 gap-2.5">
            <button
              className="btn-go flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              onClick={() => navigate(`/chofer/recorrido/${route.id}/morning`)}
            >
              <Sun size={20} /> Recorrido de ida (matutino)
            </button>
            <button
              className="btn-signal flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
              onClick={() => navigate(`/chofer/recorrido/${route.id}/afternoon`)}
            >
              <Sunset size={20} /> Recorrido de vuelta (vespertino)
            </button>
          </div>

          {/* Cotejo de alumnos: antes de arrancar, revisar quién toca hoy */}
          <div className="mt-3 pt-3 border-t border-navy-100 grid grid-cols-2 gap-2">
            <button
              onClick={() => toggleRoster(route.id, 'morning')}
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-navy-600 py-2 rounded-xl border border-navy-100 active:scale-[0.98] transition-transform"
            >
              <Users size={14} /> Lista matutino
              <ChevronDown size={13} className={`transition-transform ${rosterFor === `${route.id}-morning` ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => toggleRoster(route.id, 'afternoon')}
              className="flex items-center justify-center gap-1.5 text-sm font-medium text-navy-600 py-2 rounded-xl border border-navy-100 active:scale-[0.98] transition-transform"
            >
              <Users size={14} /> Lista vespertino
              <ChevronDown size={13} className={`transition-transform ${rosterFor === `${route.id}-afternoon` ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {rosterFor?.startsWith(route.id) && (
            <div className="mt-2 rounded-xl border border-navy-100 divide-y divide-navy-50 cascade-item max-h-72 overflow-y-auto">
              {rosterStudents.length === 0 && (
                <p className="text-sm text-navy-400 p-3">Nadie tiene servicio en este turno hoy.</p>
              )}
              {rosterStudents.map((s, idx) => (
                <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="text-navy-400 w-5 shrink-0">{idx + 1}.</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-navy-400 shrink-0">{s.matricula}</span>
                </div>
              ))}
              <p className="text-xs text-navy-400 px-3 py-2">
                {rosterStudents.length} alumno(s) programado(s) hoy — cotéjalo contra tu lista
                física antes de salir.
              </p>
            </div>
          )}

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
