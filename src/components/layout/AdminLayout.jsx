import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  School,
  Users,
  Contact,
  Truck,
  Route as RouteIcon,
  FileBarChart,
  Radio,
  LifeBuoy,
  Wallet,
  ClipboardList,
  UserCog,
  RefreshCw,
  ListOrdered,
  CircleDollarSign,
  Landmark,
  Link2,
  Menu,
  ChevronDown,
  LogOut,
  Compass,
  Database,
  Settings2,
  Search,
  PhoneCall,
  FileSpreadsheet,
  CheckSquare,
  Inbox,
  Shuffle,
  Map as MapIcon,
  Bug,
  ScrollText,
  Pencil,
  Bell,
  MessageSquare,
  TrendingUp,
  Camera,
  CalendarX2,
  Repeat,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useAgendaAlerts from '../../hooks/useAgendaAlerts';

/**
 * Menú agrupado por etapas del trabajo. Cada grupo es un botón en la barra
 * superior que despliega sus módulos en cascada ligera.
 *
 *  - Inicio:        Resumen
 *  - Planeación:    cómo se arma el servicio (rutas, mapa, talleres, viajes especiales)
 *  - Listas:        quién viaja en cada ruta (generar, consultar, modificar, banco)
 *  - Seguimiento:   HOY (flota, recorridos en curso) y REVISIÓN (asistencia, GPS, historial, reportes)
 *  - Comunicación:  avisos a operadores y familias, y tu agenda
 *  - Catálogos:     datos maestros (alumnos, planteles, operadores, unidades)
 *  - Finanzas:      caja, cobranza, tarifas y nómina
 *  - Sistema:       accesos y herramientas de soporte
 *
 * Un renglón con `heading` es solo un subtítulo dentro del menú desplegado.
 */
const A = ['admin'];
const groups = [
  {
    key: 'inicio',
    label: 'Inicio',
    icon: LayoutDashboard,
    items: [
      { to: '/admin', label: 'Resumen', end: true, icon: LayoutDashboard, roles: A },
    ],
  },
  {
    key: 'planeacion',
    label: 'Planeación',
    icon: Compass,
    items: [
      { to: '/admin/rutas', label: 'Rutas', icon: RouteIcon, roles: A },
      { to: '/admin/planeacion', label: 'Planeación en mapa', icon: MapIcon, roles: A },
      { to: '/admin/talleres', label: 'Talleres (17:30)', icon: MapIcon, roles: A },
      { to: '/admin/viajes-especiales', label: 'Viajes especiales', icon: MapIcon, roles: A },
      { to: '/admin/calendario', label: 'Calendario escolar', icon: CalendarX2, roles: A },
      { to: '/admin/cobertura', label: 'Cobertura de rutas', icon: Repeat, roles: A },
    ],
  },
  {
    key: 'listas',
    label: 'Listas',
    icon: ClipboardList,
    items: [
      { to: '/admin/formar-ruta', label: 'Generar listas de alumnos', icon: ListOrdered, roles: A },
      { to: '/admin/listas/consultar', label: 'Consultar listas', icon: Search, roles: A },
      { to: '/admin/listas/modificar', label: 'Modificar listas', icon: Settings2, roles: A },
      { to: '/admin/listas/compartidos', label: 'Alumnos en varias rutas', icon: Shuffle, roles: A },
      { to: '/admin/listas/banco', label: 'Banco por asignar', icon: Inbox, roles: A },
      { to: '/admin/alumnos-quitados', label: 'Alumnos quitados (revisión)', icon: Pencil, roles: A },
    ],
  },
  {
    key: 'seguimiento',
    label: 'Seguimiento',
    icon: Radio,
    items: [
      { heading: 'Hoy, en vivo', roles: A },
      { to: '/admin/en-vivo', label: 'Flota en vivo', icon: Radio, roles: A },
      { to: '/admin/recorridos-activos', label: 'Recorridos en curso', icon: LifeBuoy, roles: A },
      { to: '/admin/vista-operador', label: 'Vista del operador', icon: RouteIcon, roles: A },
      { to: '/admin/solicitudes-operadores', label: 'Enlaces y solicitudes', icon: Link2, roles: A },
      { heading: 'Revisión', roles: A },
      { to: '/admin/listas/asistencia', label: 'Asistencia vs lista', icon: CheckSquare, roles: A },
      { to: '/admin/recorrido-real', label: 'Recorrido real (GPS)', icon: MapIcon, roles: A },
      { to: '/admin/mapas-ruta', label: 'Mapas de recorridos', icon: MapIcon, roles: A },
      { to: '/admin/historial-unidades', label: 'Historial por unidad', icon: Truck, roles: A },
      { to: '/admin/corregir-recorridos', label: 'Corregir recorridos', icon: Pencil, roles: A },
      { to: '/admin/reportes', label: 'Reportes', icon: FileBarChart, roles: A },
      { to: '/admin/indicadores-graficos', label: 'Indicadores gráficos', icon: CircleDollarSign, roles: A },
      { to: '/admin/kpis-personal', label: 'KPIs operadores y nannies', icon: TrendingUp, roles: A },
      { to: '/admin/kpis-indicadores', label: 'Indicadores y tareas (fotos)', icon: Camera, roles: A },
    ],
  },
  {
    key: 'comunicacion',
    label: 'Comunicación',
    icon: MessageSquare,
    items: [
      { to: '/admin/avisos', label: 'Avisos a operadores', icon: Bell, roles: A },
      { to: '/admin/avisos-familias', label: 'Avisos a familias', icon: Bell, roles: A },
      { to: '/admin/agenda', label: 'Mi agenda', icon: Bell, roles: A },
    ],
  },
  {
    key: 'catalogos',
    label: 'Catálogos',
    icon: Database,
    items: [
      { to: '/admin/alumnos', label: 'Alumnos', icon: Users, roles: A },
      { to: '/admin/planteles', label: 'Planteles', icon: School, roles: A },
      { to: '/admin/choferes', label: 'Operadores y nannies', icon: Contact, roles: A },
      { to: '/admin/unidades', label: 'Unidades', icon: Truck, roles: A },
    ],
  },
  {
    key: 'finanzas',
    label: 'Finanzas',
    icon: Landmark,
    items: [
      { to: '/admin/caja', label: 'Caja', icon: Wallet, roles: ['admin', 'cashier'] },
      { to: '/admin/finanzas', label: 'Finanzas', icon: Landmark, roles: A },
      { to: '/admin/cobranza', label: 'Cobranza por plantel', icon: PhoneCall, roles: A },
      { to: '/admin/cometa', label: 'Banco de pagos Cometa', icon: FileSpreadsheet, roles: A },
      { to: '/admin/tarifas', label: 'Tarifas y conceptos', icon: CircleDollarSign, roles: A },
      { to: '/admin/nomina', label: 'Nómina de personal', icon: ClipboardList, roles: A },
    ],
  },
  {
    key: 'sistema',
    label: 'Sistema',
    icon: Settings2,
    items: [
      { heading: 'Accesos', roles: A },
      { to: '/admin/acceso', label: 'Personas con acceso', icon: UserCog, roles: A },
      { heading: 'Soporte', roles: A },
      { to: '/admin/soporte/errores', label: 'Errores de usuarios', icon: Bug, roles: A },
      { to: '/admin/soporte/bitacora', label: 'Bitácora de cambios', icon: ScrollText, roles: A },
      { to: '/admin/soporte/alumnos', label: 'Editor de alumnos', icon: Pencil, roles: A },
      { to: '/admin/soporte/operador', label: 'Diagnóstico de operador', icon: UserCog, roles: A },
      { to: '/admin/soporte/sincronizar', label: 'Sincronizar operador con lista', icon: RefreshCw, roles: A },
    ],
  },
];

/** Módulos reales de un grupo (sin los subtítulos). */
const realItems = (g) => g.items.filter((i) => !i.heading);

/** Quita los subtítulos que se quedaron sin módulos debajo. */
function dropEmptyHeadings(items) {
  return items.filter((it, idx) => {
    if (!it.heading) return true;
    const next = items[idx + 1];
    return next && !next.heading;
  });
}

function isItemActive(item, pathname) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}


/** Sin acentos y en minúsculas, para que "planeacion" encuentre "Planeación". */
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Contenido de la barra lateral (se usa fija en escritorio y como cajón en
 * móvil/tablet). Lleva: marca, buscador de módulos, grupos desplegables,
 * y la tarjeta del usuario abajo.
 */
function SidebarContent({ groups: visibleGroups, role, profile, agenda, pathname, onLogout, searchRef }) {
  const [expanded, setExpanded] = useState(null); // null = solo el grupo activo abierto; '' = todos cerrados
  const [q, setQ] = useState('');

  // Al cambiar de página se limpia la búsqueda y se vuelve a abrir el grupo activo.
  useEffect(() => {
    setQ('');
    setExpanded(null);
  }, [pathname]);

  const query = norm(q.trim());
  const matches = useMemo(() => {
    if (!query) return [];
    const out = [];
    visibleGroups.forEach((g) => {
      realItems(g).forEach((it) => {
        if (norm(it.label).includes(query) || norm(g.label).includes(query)) out.push({ ...it, group: g.label });
      });
    });
    return out;
  }, [query, visibleGroups]);

  const linkCls = (isActive) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition-colors ${
      isActive
        ? 'bg-signal-yellow text-navy-900 font-semibold shadow-[0_6px_16px_-6px_rgba(216,154,43,0.6)]'
        : 'text-navy-100/90 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <>
      {/* Marca + campana de la agenda */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <NavLink to={role === 'cashier' ? '/admin/caja' : '/admin'} className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/10 border border-white/10 shrink-0">
            <img src="/ibime-shield.png" alt="IBIME" className="w-7 h-7" />
          </span>
          <span className="leading-tight min-w-0">
            <span className="block font-display text-[15px] font-semibold text-white truncate">Ruta Segura</span>
            <span className="block text-navy-300 text-[11px] truncate">
              {role === 'cashier' ? 'Caja' : 'Transporte escolar IBIME'}
            </span>
          </span>
        </NavLink>
        {role === 'admin' && (
          <NavLink
            to="/admin/agenda"
            title={agenda.count ? `${agenda.count} pendiente(s) por atender` : 'Mi agenda'}
            className="relative shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/10 border border-white/10 text-navy-100 hover:text-white hover:bg-white/15"
          >
            <Bell size={16} />
            {agenda.count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-stop text-white text-[10px] font-bold flex items-center justify-center">
                {agenda.count}
              </span>
            )}
          </NavLink>
        )}
      </div>

      {/* Buscador de módulos */}
      {role !== 'cashier' && (
        <div className="px-3 pb-2">
          <label className="relative block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300 pointer-events-none" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar módulo…"
              aria-label="Buscar módulo"
              className="w-full h-10 rounded-xl bg-white/[0.06] border border-white/10 pl-9 pr-10 text-sm text-white placeholder:text-navy-300 focus:outline-none focus:border-signal-yellow/70 focus:bg-white/10"
              style={{ paddingLeft: '2.25rem' }}
            />
            <kbd className="hidden lg:block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-navy-300 bg-white/10 rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          </label>
        </div>
      )}

      {/* Navegación */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 space-y-0.5 side-scroll" aria-label="Módulos">
        {query ? (
          matches.length ? (
            matches.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => linkCls(isActive)}>
                <it.icon size={16} className="shrink-0 opacity-80" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{it.label}</span>
                  <span className="block text-[10.5px] opacity-60 truncate">{it.group}</span>
                </span>
              </NavLink>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-xs text-navy-300">Sin resultados para “{q}”.</p>
          )
        ) : (
          visibleGroups.map((g) => {
            const GroupIcon = g.icon;
            const active = g.items.some((i) => isItemActive(i, pathname));
            const isOpen = expanded === g.key || (expanded === null && active);

            // Un solo módulo (Inicio, o Caja para el cajero): enlace directo.
            if (realItems(g).length === 1) {
              const item = realItems(g)[0];
              return (
                <NavLink key={g.key} to={item.to} end={item.end} className={({ isActive }) => linkCls(isActive)}>
                  <GroupIcon size={17} className="shrink-0" />
                  <span className="truncate">{visibleGroups.length === 1 ? item.label : g.label}</span>
                </NavLink>
              );
            }

            return (
              <div key={g.key}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? '' : g.key)}
                  aria-expanded={isOpen}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors ${
                    active ? 'text-white bg-white/[0.08]' : 'text-navy-100/90 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <GroupIcon size={17} className={`shrink-0 ${active ? 'text-signal-yellow' : ''}`} />
                  <span className="flex-1 text-left truncate">{g.label}</span>
                  <ChevronDown size={14} className={`shrink-0 opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <ul className="ml-[22px] mt-0.5 mb-1.5 pl-2.5 border-l border-white/10 space-y-0.5">
                    {g.items.map((item, idx) =>
                      item.heading ? (
                        <li key={`h-${item.heading}`} className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy-300/80 select-none">
                          {item.heading}
                        </li>
                      ) : (
                        <li key={item.to} className="nav-cascade" style={{ animationDelay: `${idx * 22}ms` }}>
                          <NavLink to={item.to} end={item.end} className={({ isActive }) => linkCls(isActive)}>
                            <item.icon size={15} className="shrink-0 opacity-80" />
                            <span className="truncate">{item.label}</span>
                          </NavLink>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </nav>

      {/* Usuario */}
      <div className="m-3 mt-1 rounded-2xl bg-white/[0.06] border border-white/10 p-2.5 flex items-center gap-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-signal-yellow text-navy-900 text-xs font-bold shrink-0">
          {(profile?.name || 'A').trim().slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[13px] font-medium text-white truncate">{profile?.name || 'Administrador'}</span>
          <span className="block text-[10.5px] text-navy-300">{role === 'cashier' ? 'Caja' : 'Administrador'}</span>
        </span>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className="shrink-0 grid place-items-center w-9 h-9 rounded-lg text-navy-100 hover:text-white hover:bg-white/10"
        >
          <LogOut size={16} />
        </button>
      </div>
    </>
  );
}

export default function AdminLayout() {
  const { logout, profile } = useAuth();
  const agenda = useAgendaAlerts();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef(null);
  const searchRef = useRef(null);

  const role = profile?.role;
  // Las pantallas de listas conservan el diseño original de la app (ver .legacy-lists en index.css)
  const classicLists = /^\/admin\/(formar-ruta|listas\/|alumnos-quitados)/.test(location.pathname);
  // El Resumen va directo sobre el fondo de cristal; los demás módulos van sobre una hoja clara.
  const isHome = location.pathname === '/admin' || location.pathname === '/admin/';

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: dropEmptyHeadings(g.items.filter((i) => i.roles.includes(role))) }))
        .filter((g) => realItems(g).length > 0),
    [role]
  );

  // El rol "cajero" solo tiene acceso a Caja — si intenta entrar a otra
  // ruta admin por URL (o queda en /admin, que es solo para admin),
  // lo mandamos derechito a lo único que le corresponde.
  useEffect(() => {
    if (role === 'cashier' && location.pathname !== '/admin/caja') {
      navigate('/admin/caja', { replace: true });
    }
  }, [role, location.pathname, navigate]);

  // Al navegar: cierra el cajón móvil y regresa el contenido al inicio.
  useEffect(() => {
    setMobileOpen(false);
    if (mainRef.current) mainRef.current.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Escape cierra el cajón; ⌘K / Ctrl+K enfoca el buscador de módulos.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setMobileOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
        searchRef.current.select();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // En móvil, bloquea el scroll del fondo mientras el cajón está abierto.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const sidebarProps = { groups: visibleGroups, role, profile, agenda, pathname: location.pathname, onLogout: logout, searchRef };

  return (
    <div className="admin-shell h-screen flex gap-3 p-2 lg:p-3 overflow-hidden">
      {/* Barra lateral flotante (escritorio) */}
      <aside className="side-panel hidden lg:flex w-[264px] shrink-0 flex-col">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Cajón (móvil / tablet) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="side-panel side-panel-solid absolute left-2 top-2 bottom-2 w-[min(300px,calc(100vw-1rem))] flex flex-col drawer-in">
            <SidebarContent {...sidebarProps} />
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-2 lg:gap-0">
        {/* Barra superior (móvil / tablet) */}
        <header className="lg:hidden shrink-0 side-panel flex items-center gap-2 px-3 h-14">
          <button
            type="button"
            className="grid place-items-center w-10 h-10 -ml-1 rounded-xl text-white hover:bg-white/10"
            onClick={() => setMobileOpen(true)}
            aria-label="Menú"
            aria-expanded={mobileOpen}
          >
            <Menu size={22} />
          </button>
          <NavLink to={role === 'cashier' ? '/admin/caja' : '/admin'} className="flex items-center gap-2 min-w-0 flex-1">
            <img src="/ibime-shield.png" alt="IBIME" className="w-7 h-7" />
            <span className="font-display text-[15px] font-semibold text-white truncate">Ruta Segura</span>
          </NavLink>
          {role === 'admin' && (
            <NavLink to="/admin/agenda" aria-label="Mi agenda" className="relative grid place-items-center w-10 h-10 rounded-xl text-navy-100 hover:bg-white/10">
              <Bell size={18} />
              {agenda.count > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-stop text-white text-[10px] font-bold flex items-center justify-center">
                  {agenda.count}
                </span>
              )}
            </NavLink>
          )}
        </header>

        <main
          ref={mainRef}
          className={
            isHome
              ? 'dash-main flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-0.5 py-0.5 lg:px-2 lg:py-1'
              : `content-sheet flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5 sm:py-6 lg:px-8 ibime-watermark${classicLists ? ' legacy-lists' : ''}`
          }
        >
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
