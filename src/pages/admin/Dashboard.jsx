import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  School,
  Users,
  Contact,
  Truck,
  Route as RouteIcon,
  ListOrdered,
  Link2,
  LifeBuoy,
  Radio,
  Wallet,
  Landmark,
  CircleDollarSign,
  FileBarChart,
  ClipboardList,
  UserCog,
  Inbox,
  ArrowRight,
  Bus,
} from 'lucide-react';
import { Schools, Students, Drivers, Units, Routes } from '../../firebase/services';
import { Submissions } from '../../firebase/operatorPortal';
import { useAuth } from '../../context/AuthContext';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';
import { getTimeGreeting, getFirstName } from '../../utils/greetings';

export default function Dashboard() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState(null);
  const [pending, setPending] = useState(0);
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
          capacity: units.reduce((sum, u) => sum + Number(u.capacity || 0), 0),
          assigned: students.filter((s) => s.routeId).length,
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

  // Solicitudes pendientes de operadores (en vivo). Si las reglas nuevas aún
  // no están publicadas, simplemente no se muestra el aviso.
  useEffect(
    () =>
      Submissions.subscribeAll(
        (rows) => setPending(rows.filter((r) => r.status === 'pending').length),
        () => setPending(0)
      ),
    []
  );

  const kpis = useMemo(
    () => [
      { label: 'Alumnos', value: counts?.students, to: '/admin/alumnos', icon: Users, tone: 'bg-route-sky/15 text-route-sky' },
      { label: 'Rutas', value: counts?.routes, to: '/admin/rutas', icon: RouteIcon, tone: 'bg-route-teal/15 text-route-teal' },
      { label: 'Unidades', value: counts?.units, to: '/admin/unidades', icon: Truck, tone: 'bg-route-coral/15 text-route-coral' },
      { label: 'Operadores y nannies', value: counts?.drivers, to: '/admin/choferes', icon: Contact, tone: 'bg-route-violet/15 text-route-violet' },
      { label: 'Planteles', value: counts?.schools, to: '/admin/planteles', icon: School, tone: 'bg-route-olive/15 text-route-olive' },
    ],
    [counts]
  );

  const sections = [
    {
      title: 'Operación',
      subtitle: 'Lo que se mueve día a día',
      items: [
        { label: 'Rutas', to: '/admin/rutas', icon: RouteIcon },
        { label: 'Formar lista de ruta', to: '/admin/formar-ruta', icon: ListOrdered },
        { label: 'Enlaces y solicitudes', to: '/admin/solicitudes-operadores', icon: Link2, badge: pending },
        { label: 'Recorridos en curso', to: '/admin/recorridos-activos', icon: LifeBuoy },
        { label: 'Flota en vivo', to: '/admin/en-vivo', icon: Radio },
      ],
    },
    {
      title: 'Finanzas',
      subtitle: 'Cobranza y control',
      items: [
        { label: 'Caja', to: '/admin/caja', icon: Wallet },
        { label: 'Finanzas', to: '/admin/finanzas', icon: Landmark },
        { label: 'Tarifas y conceptos', to: '/admin/tarifas', icon: CircleDollarSign },
      ],
    },
    {
      title: 'Administración',
      subtitle: 'Análisis y accesos',
      items: [
        { label: 'Reportes', to: '/admin/reportes', icon: FileBarChart },
        { label: 'Nómina de personal', to: '/admin/nomina', icon: ClipboardList },
        { label: 'Personas con acceso', to: '/admin/acceso', icon: UserCog },
      ],
    },
  ];

  const finance = [
    { label: 'Esperado', to: '/admin/finanzas?modulo=esperado' },
    { label: 'Cargado', to: '/admin/finanzas?modulo=cargado' },
    { label: 'Pagado', to: '/admin/finanzas?modulo=pagado' },
    { label: 'Pendiente', to: '/admin/finanzas?modulo=pendiente' },
  ];

  const occupancy = counts?.capacity ? Math.min(100, Math.round((counts.assigned / counts.capacity) * 100)) : null;
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-5">
      <LoadingOverlay show={!counts && !loadError} label="Cargando resumen…" />

      {/* Encabezado */}
      <section className="hero-panel cascade-item">
        <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-navy-100 text-xs capitalize">{today}</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold mt-1">
              {getTimeGreeting()}{profile?.name ? `, ${getFirstName(profile.name)}` : ''}
            </h1>
            <p className="text-navy-100 text-sm mt-1 max-w-xl">
              Panel de gestión del transporte escolar: rutas, alumnos, unidades, cobranza y seguimiento en un solo lugar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/formar-ruta" className="btn-admin bg-signal-yellow text-navy-900 hover:bg-signal-amber">
              <ListOrdered size={16} /> Formar lista de ruta
            </Link>
            <Link to="/admin/en-vivo" className="btn-admin border border-white/25 text-white hover:bg-white/10">
              <Bus size={16} /> Flota en vivo
            </Link>
          </div>
        </div>
        <Bus size={170} className="absolute -right-8 -bottom-10 text-white/5 hidden sm:block" aria-hidden="true" />
      </section>

      {loadError && (
        <div className="admin-card text-center py-8 cascade-item">
          <p className="text-3xl mb-2">⚠️</p>
          <p className="font-display font-semibold text-base mb-1">No se pudo cargar el resumen</p>
          <p className="text-navy-400 text-sm mb-4">{loadError}</p>
          <button onClick={() => window.location.reload()} className="btn-admin-primary mx-auto">
            Reintentar
          </button>
        </div>
      )}

      {/* Aviso de solicitudes de operadores */}
      {pending > 0 && (
        <Link
          to="/admin/solicitudes-operadores"
          className="admin-card flex items-center gap-3 !border-signal-amber/50 bg-signal-amber/10 hover:shadow-panel transition-all cascade-item"
        >
          <div className="stat-icon bg-signal-amber/25 text-signal-amber"><Inbox size={20} /></div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-navy-900">
              {pending} solicitud{pending === 1 ? '' : 'es'} de operadores por revisar
            </p>
            <p className="text-xs text-navy-600">Aprueba o rechaza los alumnos que cargaron desde su enlace.</p>
          </div>
          <ArrowRight size={18} className="text-navy-600 shrink-0" />
        </Link>
      )}

      {/* Indicadores */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpis.map((c, i) => (
          <Link key={c.label} to={c.to} className="stat-tile cascade-item" style={cascadeStyle(i, 60)}>
            <div className={`stat-icon ${c.tone}`}><c.icon size={20} /></div>
            <div className="min-w-0">
              <p className="text-2xl font-display font-bold text-navy-800 leading-none">{c.value ?? '—'}</p>
              <p className="text-navy-400 text-xs mt-1 truncate">{c.label}</p>
            </div>
          </Link>
        ))}
      </section>

      {/* Ocupación de flota */}
      {occupancy !== null && (
        <section className="admin-card cascade-item" style={cascadeStyle(5, 60)}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <p className="font-display font-bold text-navy-900">Alumnos con ruta vs. capacidad de la flota</p>
              <p className="text-xs text-navy-400">
                {counts.assigned} alumnos asignados · {counts.capacity} lugares en {counts.units} unidades
              </p>
            </div>
            <p className="font-display text-2xl font-bold text-navy-800">{occupancy}%</p>
          </div>
          <div className="h-2.5 rounded-full bg-navy-50 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${occupancy > 90 ? 'bg-stop' : 'bg-go'}`}
              style={{ width: `${occupancy}%` }}
            />
          </div>
        </section>
      )}

      {/* Accesos por categoría */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {sections.map((sec, si) => (
          <div key={sec.title} className="admin-card cascade-item" style={cascadeStyle(si + 6, 60)}>
            <p className="font-display font-bold text-navy-900">{sec.title}</p>
            <p className="text-xs text-navy-400 mb-3">{sec.subtitle}</p>
            <ul className="space-y-0.5">
              {sec.items.map((it) => (
                <li key={it.to}>
                  <Link
                    to={it.to}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-md text-sm text-navy-600 hover:bg-navy-50 hover:text-navy-900 transition-colors"
                  >
                    <it.icon size={16} className="text-navy-400 shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{it.label}</span>
                    {it.badge > 0 && <span className="badge-amber">{it.badge}</span>}
                    <ArrowRight size={14} className="text-navy-100 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Finanzas */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {finance.map((item, i) => (
          <Link
            key={item.label}
            to={item.to}
            className="admin-card hover:border-navy-400 hover:shadow-panel transition-all cascade-item"
            style={cascadeStyle(i + 9, 60)}
          >
            <p className="text-xs text-navy-400">Finanzas</p>
            <p className="font-display font-bold text-lg mt-1 text-navy-800">{item.label}</p>
            <p className="text-navy-400 text-xs mt-0.5">Consultar módulo</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
