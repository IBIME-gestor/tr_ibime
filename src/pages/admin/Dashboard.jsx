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
  Bell,
  MapPinned,
  Plus,
} from 'lucide-react';
import { Schools, Students, Drivers, Units, Routes } from '../../firebase/services';
import { Submissions } from '../../firebase/operatorPortal';
import { subscribeActiveTripsLive } from '../../firebase/trips';
import { useAuth } from '../../context/AuthContext';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';
import { getTimeGreeting, getFirstName } from '../../utils/greetings';

/** Anillo de progreso (la "meta" del diseño de referencia): ocupación de la flota. */
function Ring({ value, danger }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg viewBox="0 0 100 100" className="w-[116px] h-[116px] shrink-0 -rotate-90" aria-hidden="true">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={danger ? '#ff8a80' : '#f5c15a'} />
          <stop offset="100%" stopColor={danger ? '#d62d25' : '#d89a2b'} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="ring-track" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        stroke="url(#ringGrad)"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.2,.8,.2,1)' }}
      />
    </svg>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [counts, setCounts] = useState(null);
  const [pending, setPending] = useState(0);
  const [live, setLive] = useState(null);
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

  // Recorridos en curso ahora mismo (el equivalente a "Live store" del diseño).
  // Es el mismo listener que usa Flota en vivo; son pocos documentos.
  useEffect(() => {
    let off = () => {};
    try {
      off = subscribeActiveTripsLive((rows) => setLive(rows));
    } catch (err) {
      console.error('Dashboard live trips error:', err);
    }
    return () => off();
  }, []);

  const kpis = useMemo(
    () => [
      { label: 'Alumnos', value: counts?.students, to: '/admin/alumnos', icon: Users, dot: 'bg-route-sky' },
      { label: 'Rutas', value: counts?.routes, to: '/admin/rutas', icon: RouteIcon, dot: 'bg-route-teal' },
      { label: 'Unidades', value: counts?.units, to: '/admin/unidades', icon: Truck, dot: 'bg-route-coral' },
      { label: 'Operadores y nannies', value: counts?.drivers, to: '/admin/choferes', icon: Contact, dot: 'bg-route-violet' },
      { label: 'Planteles', value: counts?.schools, to: '/admin/planteles', icon: School, dot: 'bg-route-olive' },
    ],
    [counts]
  );

  const quick = [
    { label: 'Flota en vivo', hint: 'Mapa en tiempo real', to: '/admin/en-vivo', icon: Radio, tone: 'bg-route-teal/20 text-route-teal' },
    { label: 'Recorridos en curso', hint: 'Seguimiento y cierre', to: '/admin/recorridos-activos', icon: LifeBuoy, tone: 'bg-route-coral/20 text-route-coral' },
    { label: 'Generar listas', hint: 'Alumnos por ruta', to: '/admin/formar-ruta', icon: ListOrdered, tone: 'bg-signal-yellow/20 text-signal-yellow' },
    { label: 'Caja', hint: 'Cobros del día', to: '/admin/caja', icon: Wallet, tone: 'bg-route-violet/20 text-route-violet' },
  ];

  const sections = [
    {
      title: 'Planeación',
      subtitle: 'Cómo se arma el servicio',
      items: [
        { label: 'Rutas', to: '/admin/rutas', icon: RouteIcon },
        { label: 'Planeación en mapa', to: '/admin/planeacion', icon: MapPinned },
        { label: 'Talleres (17:30)', to: '/admin/talleres', icon: MapPinned },
        { label: 'Viajes especiales', to: '/admin/viajes-especiales', icon: MapPinned },
      ],
    },
    {
      title: 'Listas',
      subtitle: 'Quién viaja en cada ruta',
      items: [
        { label: 'Generar listas de alumnos', to: '/admin/formar-ruta', icon: ListOrdered },
        { label: 'Consultar listas', to: '/admin/listas/consultar', icon: ClipboardList },
        { label: 'Banco por asignar', to: '/admin/listas/banco', icon: Inbox },
        { label: 'Asistencia vs lista', to: '/admin/listas/asistencia', icon: ClipboardList },
      ],
    },
    {
      title: 'Seguimiento',
      subtitle: 'Hoy y revisión',
      items: [
        { label: 'Flota en vivo', to: '/admin/en-vivo', icon: Radio },
        { label: 'Recorridos en curso', to: '/admin/recorridos-activos', icon: LifeBuoy },
        { label: 'Enlaces y solicitudes', to: '/admin/solicitudes-operadores', icon: Link2, badge: pending },
        { label: 'Reportes', to: '/admin/reportes', icon: FileBarChart },
      ],
    },
    {
      title: 'Comunicación',
      subtitle: 'Avisos y agenda',
      items: [
        { label: 'Avisos a operadores', to: '/admin/avisos', icon: Bell },
        { label: 'Avisos a familias', to: '/admin/avisos-familias', icon: Bell },
        { label: 'Mi agenda', to: '/admin/agenda', icon: Bell },
      ],
    },
    {
      title: 'Finanzas',
      subtitle: 'Cobranza y control',
      items: [
        { label: 'Caja', to: '/admin/caja', icon: Wallet },
        { label: 'Finanzas', to: '/admin/finanzas', icon: Landmark },
        { label: 'Tarifas y conceptos', to: '/admin/tarifas', icon: CircleDollarSign },
        { label: 'Nómina de personal', to: '/admin/nomina', icon: ClipboardList },
      ],
    },
    {
      title: 'Sistema',
      subtitle: 'Accesos y soporte',
      items: [
        { label: 'Personas con acceso', to: '/admin/acceso', icon: UserCog },
        { label: 'Bitácora de cambios', to: '/admin/soporte/bitacora', icon: ClipboardList },
        { label: 'Errores de usuarios', to: '/admin/soporte/errores', icon: LifeBuoy },
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
  const liveCount = live ? live.length : null;

  return (
    <div className="space-y-3 lg:space-y-4 pb-2">
      <LoadingOverlay show={!counts && !loadError} label="Cargando resumen…" />

      {/* Encabezado */}
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1 cascade-item">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white leading-tight">
            {getTimeGreeting()}{profile?.name ? `, ${getFirstName(profile.name)}` : ''}
          </h1>
          <p className="text-navy-300 text-sm mt-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-go shrink-0" />
            <span className="inline-block first-letter:uppercase">{today}</span>
            <span className="text-navy-400">·</span>
            <span>Resumen</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/en-vivo" className="btn-glass">
            <Bus size={16} /> Flota en vivo
          </Link>
          <Link to="/admin/formar-ruta" className="btn-glass-primary">
            <Plus size={16} /> Formar lista de ruta
          </Link>
        </div>
      </header>

      {loadError && (
        <div className="glass text-center py-8 cascade-item">
          <p className="text-3xl mb-2">⚠️</p>
          <p className="font-display font-semibold text-base mb-1">No se pudo cargar el resumen</p>
          <p className="text-navy-300 text-sm mb-4">{loadError}</p>
          <button onClick={() => window.location.reload()} className="btn-glass-primary mx-auto">
            Reintentar
          </button>
        </div>
      )}

      {/* Bento principal */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 lg:gap-4">
        {/* Tarjeta grande: indicadores + accesos del día */}
        <section className="glass xl:col-span-8 xl:row-span-2 !p-0 flex flex-col cascade-item" style={cascadeStyle(1, 60)}>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 border-b border-white/10">
            {kpis.map((c) => (
              <Link
                key={c.label}
                to={c.to}
                className="p-4 sm:p-5 hover:bg-white/[0.05] transition-colors border-b border-r border-white/[0.07] xl:border-b-0 first:rounded-tl-3xl last:col-span-2 md:last:col-span-1"
              >
                <p className="text-[11px] text-navy-300 flex items-center gap-1.5 truncate">
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {c.label}
                </p>
                <p className="text-3xl font-display font-bold text-white leading-none mt-2 tabular-nums">{c.value ?? '—'}</p>
              </Link>
            ))}
          </div>

          <div className="p-4 sm:p-5 flex-1 flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <p className="glass-title">Accesos del día</p>
                <p className="glass-sub">Lo que más se usa en la operación</p>
              </div>
              {/* Finanzas: chips estilo selector de rango del diseño de referencia */}
              <div className="flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/10 p-1">
                {finance.map((f) => (
                  <Link key={f.label} to={f.to} className="px-3 py-1 rounded-full text-xs font-semibold text-navy-100 hover:bg-white/10 hover:text-white">
                    {f.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 auto-rows-fr">
              {quick.map((q) => (
                <Link
                  key={q.label}
                  to={q.to}
                  className="group flex items-center gap-3.5 rounded-2xl bg-white/[0.05] border border-white/[0.08] p-3.5 hover:bg-white/10 hover:border-signal-yellow/50 transition-colors"
                >
                  <span className={`grid place-items-center w-11 h-11 rounded-xl shrink-0 ${q.tone}`}><q.icon size={20} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-semibold text-white truncate">{q.label}</span>
                    <span className="block text-xs text-navy-300 truncate">{q.hint}</span>
                  </span>
                  <ArrowRight size={16} className="text-navy-300 group-hover:text-signal-yellow group-hover:translate-x-0.5 transition shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Ocupación de la flota (la "meta" del diseño) */}
        <section className="glass xl:col-span-4 cascade-item" style={cascadeStyle(2, 60)}>
          <p className="glass-title">Ocupación de la flota</p>
          <p className="glass-sub">Alumnos con ruta vs. lugares disponibles</p>
          <div className="flex items-center gap-4 mt-3">
            <div className="relative">
              <Ring value={occupancy ?? 0} danger={occupancy > 90} />
              <div className="absolute inset-0 grid place-items-center">
                <span className="text-center leading-none">
                  <span className="block font-display text-2xl font-bold text-white tabular-nums">{occupancy ?? '—'}{occupancy !== null && '%'}</span>
                  <span className="block text-[10px] text-navy-300 mt-1">ocupado</span>
                </span>
              </div>
            </div>
            <dl className="flex-1 min-w-0 space-y-2 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-navy-300">Con ruta</dt><dd className="font-semibold text-white tabular-nums">{counts?.assigned ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-navy-300">Lugares</dt><dd className="font-semibold text-white tabular-nums">{counts?.capacity ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-navy-300">Sin ruta</dt><dd className="font-semibold text-white tabular-nums">{counts ? Math.max(0, counts.students - counts.assigned) : '—'}</dd></div>
            </dl>
          </div>
        </section>

        {/* En vivo (el "Live store" del diseño) */}
        <section className="glass xl:col-span-4 cascade-item" style={cascadeStyle(3, 60)}>
          <div className="flex items-center justify-between gap-2">
            <p className="glass-title flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${liveCount > 0 ? 'bg-go animate-pulse' : 'bg-navy-400'}`} />
              En vivo ahora
            </p>
            <Link to="/admin/recorridos-activos" className="glass-link">Ver</Link>
          </div>
          <p className="glass-sub">Recorridos en curso</p>
          <p className="mt-3 flex items-end gap-2">
            <span className="font-display text-4xl font-bold text-white leading-none tabular-nums">{liveCount ?? '—'}</span>
            <span className="text-xs text-navy-300 pb-1">{liveCount === 1 ? 'unidad en ruta' : 'unidades en ruta'}</span>
          </p>
          <Link
            to="/admin/solicitudes-operadores"
            className={`mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors ${
              pending > 0
                ? 'bg-signal-yellow/15 border-signal-yellow/40 hover:bg-signal-yellow/20'
                : 'bg-white/[0.05] border-white/[0.08] hover:bg-white/10'
            }`}
          >
            <Inbox size={16} className={pending > 0 ? 'text-signal-yellow' : 'text-navy-300'} />
            <span className="flex-1 min-w-0 text-xs text-navy-100 truncate">
              {pending > 0
                ? `${pending} solicitud${pending === 1 ? '' : 'es'} de operadores por revisar`
                : 'Sin solicitudes de operadores pendientes'}
            </span>
            {pending > 0 ? <span className="glass-pill glass-pill-amber">{pending}</span> : <span className="glass-pill glass-pill-go">Al día</span>}
          </Link>
        </section>
      </div>

      {/* Módulos por categoría */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
        {sections.map((sec, si) => (
          <div key={sec.title} className="glass cascade-item" style={cascadeStyle(si + 4, 60)}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="glass-title">{sec.title}</p>
                <p className="glass-sub">{sec.subtitle}</p>
              </div>
              <Link to={sec.items[0].to} className="glass-link shrink-0">Abrir</Link>
            </div>
            <ul className="space-y-0.5 -mx-1.5">
              {sec.items.map((it) => (
                <li key={it.to}>
                  <Link to={it.to} className="glass-row">
                    <it.icon size={16} className="text-navy-300 shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{it.label}</span>
                    {it.badge > 0 && <span className="glass-pill glass-pill-amber">{it.badge}</span>}
                    <ArrowRight size={14} className="text-navy-400 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
