import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { School, Users, Contact, Truck, Route as RouteIcon } from 'lucide-react';
import { Schools, Students, Drivers, Units, Routes } from '../../firebase/services';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

export default function Dashboard() {
  const [counts, setCounts] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    async function load() {
      try {
        const [schools, students, drivers, units, routes] = await Promise.all([
          Schools.list(),
          Students.list(),
          Drivers.list(),
          Units.list(),
          Routes.list(),
        ]);
        if (cancelled) return;
        setCounts({
          schools: schools.length,
          students: students.length,
          drivers: drivers.length,
          units: units.length,
          routes: routes.length,
        });
      } catch (err) {
        // Sin try/catch, un error aquí dejaba el Resumen pegado en
        // "Cargando resumen…" para siempre, sin decir por qué.
        console.error('Dashboard load error:', err);
        if (!cancelled) setLoadError(err.message || 'No se pudo cargar el resumen. Revisa tu conexión e intenta de nuevo.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const cards = [
    { label: 'Planteles', value: counts?.schools, to: '/admin/planteles', icon: School },
    { label: 'Alumnos', value: counts?.students, to: '/admin/alumnos', icon: Users },
    { label: 'Operadores y nannies', value: counts?.drivers, to: '/admin/choferes', icon: Contact },
    { label: 'Unidades', value: counts?.units, to: '/admin/unidades', icon: Truck },
    { label: 'Rutas', value: counts?.routes, to: '/admin/rutas', icon: RouteIcon },
  ];

  return (
    <div>
      <LoadingOverlay show={!counts && !loadError} label="Cargando resumen…" />
      <h1 className="admin-h1 mb-5">Resumen</h1>
      {loadError && (
        <div className="admin-card text-center py-8 mb-5 cascade-item">
          <p className="text-3xl mb-2">⚠️</p>
          <p className="font-display font-semibold text-base mb-1">No se pudo cargar el resumen</p>
          <p className="text-navy-400 text-sm mb-4">{loadError}</p>
          <button onClick={() => window.location.reload()} className="btn-admin-primary mx-auto">
            Reintentar
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c, i) => (
          <Link
            key={c.label}
            to={c.to}
            className="admin-card hover:border-navy-400 hover:shadow-panel transition-all cascade-item"
            style={cascadeStyle(i, 70)}
          >
            <c.icon size={18} className="text-navy-400 mb-3" />
            <p className="text-2xl font-display font-bold text-navy-800">{c.value ?? '—'}</p>
            <p className="text-navy-400 text-xs mt-0.5">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        {[
          { label: 'Esperado', to: '/admin/finanzas?modulo=esperado' },
          { label: 'Cargado', to: '/admin/finanzas?modulo=cargado' },
          { label: 'Pagado', to: '/admin/finanzas?modulo=pagado' },
          { label: 'Pendiente', to: '/admin/finanzas?modulo=pendiente' },
        ].map((item, i) => (
          <Link key={item.label} to={item.to}
            className="admin-card hover:border-navy-400 hover:shadow-panel transition-all cascade-item"
            style={cascadeStyle(cards.length + i, 70)}>
            <p className="text-xs text-navy-400">Finanzas</p>
            <p className="font-display font-bold text-lg mt-1 text-navy-800">{item.label}</p>
            <p className="text-navy-400 text-xs mt-0.5">Consultar módulo</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
