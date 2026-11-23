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
  X,
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
      { to: '/admin/kpis-personal', label: 'KPIs operadores y nannies', icon: TrendingUp, roles: A },
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

export default function AdminLayout() {
  const { logout, profile } = useAuth();
  const agenda = useAgendaAlerts();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null); // desktop: grupo con el menú desplegado
  const [expanded, setExpanded] = useState(null); // móvil: grupo expandido (acordeón)
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);
  const mainRef = useRef(null);

  const role = profile?.role;
  // Las pantallas de listas conservan el diseño original de la app (ver .legacy-lists en index.css)
  const classicLists = /^\/admin\/(formar-ruta|listas\/|alumnos-quitados)/.test(location.pathname);

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

  // Al navegar: cierra menús y regresa el contenido al inicio.
  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
    setExpanded(null);
    if (mainRef.current) mainRef.current.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Click fuera / Escape cierran el menú desplegado (desktop).
  useEffect(() => {
    function onDown(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenGroup(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // En móvil, bloquea el scroll del fondo mientras el menú está abierto.
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Si solo hay un grupo con un solo módulo (cajero), se muestra como enlace directo.
  const flat = visibleGroups.length === 1 && realItems(visibleGroups[0]).length === 1;

  return (
    <div className="h-screen flex flex-col bg-paper overflow-hidden">
      <header className="shrink-0 bg-navy-900 text-white relative z-40 shadow-panel">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-5 h-14 flex items-center gap-2 2xl:gap-3">
          {/* Marca */}
          <NavLink to={role === 'cashier' ? '/admin/caja' : '/admin'} className="flex items-center gap-2.5 shrink-0">
            <img src="/ibime-shield.png" alt="IBIME" className="w-8 h-8" />
            <div className="leading-tight">
              <p className="font-display text-sm sm:text-base font-semibold">Ruta Segura</p>
              <p className="hidden 2xl:block text-navy-300 text-[0.65rem]">
                {role === 'cashier' ? 'Caja' : 'Gestión de transporte escolar'}
              </p>
            </div>
          </NavLink>

          {/* Navegación de escritorio */}
          <nav ref={navRef} className="hidden xl:flex items-center gap-0 2xl:gap-0.5 ml-1 2xl:ml-4 flex-1 min-w-0 flex-nowrap" aria-label="Módulos">
            {visibleGroups.map((g, gIdx) => {
              const GroupIcon = g.icon;
              const active = g.items.some((i) => isItemActive(i, location.pathname));
              const isOpen = openGroup === g.key;

              // Grupo de un solo módulo (Inicio, o Caja para el cajero): enlace directo.
              if (realItems(g).length === 1) {
                const item = realItems(g)[0];
                return (
                  <NavLink
                    key={g.key}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2 px-2 2xl:px-2.5 py-2 rounded-md text-[13px] 2xl:text-sm font-medium whitespace-nowrap transition-colors ${
                        isActive ? 'text-navy-900 bg-signal-yellow shadow-[0_4px_12px_rgba(216,154,43,0.2)]' : 'text-navy-100 hover:text-white hover:bg-white/10'
                      }`
                    }
                  >
                    <GroupIcon size={16} className="hidden 2xl:block" /> {flat ? item.label : g.label}
                  </NavLink>
                );
              }

              return (
                <div
                  key={g.key}
                  className="relative"
                  onMouseEnter={() => setOpenGroup(g.key)}
                  onMouseLeave={() => setOpenGroup((cur) => (cur === g.key ? null : cur))}
                >
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    onClick={() => setOpenGroup(isOpen ? null : g.key)}
                    className={`relative flex items-center gap-1 2xl:gap-2 px-2 2xl:px-2.5 py-2 rounded-md text-[13px] 2xl:text-sm font-medium whitespace-nowrap transition-colors ${
                      active ? 'text-navy-900 bg-signal-yellow shadow-[0_4px_12px_rgba(216,154,43,0.2)]' : isOpen ? 'text-white bg-white/10' : 'text-navy-100 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <GroupIcon size={16} className="hidden 2xl:block" />
                    {g.label}
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className={`absolute top-full pt-2 min-w-[240px] max-w-[calc(100vw-1.5rem)] z-50 ${gIdx >= visibleGroups.length - 3 ? 'right-0' : 'left-0'}`}>
                      <ul className="bg-white text-navy-800 rounded-xl border border-navy-100 shadow-panel py-1.5 overflow-hidden">
                        {g.items.map((item, idx) => (item.heading ? (
                          <li key={`h-${item.heading}`} className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-navy-400 select-none">
                            {item.heading}
                          </li>
                        ) : (
                          <li key={item.to} className="nav-cascade" style={{ animationDelay: `${idx * 28}ms` }}>
                            <NavLink
                              to={item.to}
                              end={item.end}
                              className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors border-l-[3px] pl-[13px] ${
                                  isActive
                                    ? 'bg-signal-light text-navy-900 border-signal-yellow'
                                    : 'text-navy-600 hover:bg-signal-light border-transparent'
                                }`
                              }
                            >
                              <item.icon size={16} className="text-navy-400 shrink-0" />
                              {item.label}
                            </NavLink>
                          </li>
                        )))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="flex-1 xl:hidden" />

          {/* Campana de la agenda (24 / 12 / 6 / 1 h antes) */}
          {role === 'admin' && (
            <NavLink
              to="/admin/agenda"
              title={agenda.count ? `${agenda.count} pendiente(s) por atender` : 'Mi agenda'}
              className="relative shrink-0 p-2 rounded-md text-navy-100 hover:text-white hover:bg-white/10"
            >
              <Bell size={18} />
              {agenda.count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {agenda.count}
                </span>
              )}
            </NavLink>
          )}

          {/* Usuario (escritorio) */}
          <div className="hidden xl:flex items-center gap-2 2xl:gap-3 shrink-0">
            <p className="hidden 2xl:block text-xs text-navy-100 max-w-[160px] truncate">{profile?.name || 'Administrador'}</p>
            <span className="hidden 2xl:inline-block text-[0.65rem] font-extrabold uppercase tracking-wide text-navy-100 bg-white/10 border border-white/15 px-2 py-0.5 rounded-full">
              {role === 'cashier' ? 'Caja' : 'Administrador'}
            </span>
            <button
              onClick={logout}
              title="Cerrar sesión" className="flex items-center gap-1.5 px-2 2xl:px-3 py-1.5 rounded-lg text-xs font-bold text-navy-100 border border-white/15 bg-white/5 hover:text-white hover:bg-white/10"
            >
              <LogOut size={14} /> <span className="hidden 2xl:inline">Salir</span>
            </button>
          </div>

          {/* Botón de menú (móvil / tablet) */}
          <button
            type="button"
            className="xl:hidden p-2 -mr-2 rounded-md hover:bg-white/10"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menú"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Panel móvil / tablet */}
        {mobileOpen && (
          <div className="xl:hidden absolute left-0 right-0 top-full bg-navy-900 border-t border-navy-700 shadow-panel max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <nav className="px-3 py-3 flex flex-col gap-1" aria-label="Módulos">
              {visibleGroups.map((g, gi) => {
                const GroupIcon = g.icon;
                const active = g.items.some((i) => isItemActive(i, location.pathname));
                const isOpen = expanded === g.key || (expanded === null && active);

                if (realItems(g).length === 1) {
                  const item = realItems(g)[0];
                  return (
                    <NavLink
                      key={g.key}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `nav-cascade flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                          isActive ? 'text-navy-900 bg-signal-yellow shadow-[0_4px_12px_rgba(216,154,43,0.2)]' : 'text-navy-100 hover:bg-white/10'
                        }`
                      }
                      style={{ animationDelay: `${gi * 28}ms` }}
                    >
                      <GroupIcon size={18} /> {flat ? item.label : g.label}
                    </NavLink>
                  );
                }

                return (
                  <div key={g.key} className="nav-cascade" style={{ animationDelay: `${gi * 28}ms` }}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? '' : g.key)}
                      aria-expanded={isOpen}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold ${
                        active ? 'text-white bg-white/10' : 'text-navy-100 hover:bg-white/10'
                      }`}
                    >
                      <GroupIcon size={18} />
                      <span className="flex-1 text-left">{g.label}</span>
                      <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <ul className="ml-5 mt-1 mb-1 pl-3 border-l border-navy-600 flex flex-col gap-0.5">
                        {g.items.map((item, idx) => (item.heading ? (
                          <li key={`h-${item.heading}`} className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy-300 select-none">
                            {item.heading}
                          </li>
                        ) : (
                          <li key={item.to} className="nav-cascade" style={{ animationDelay: `${idx * 24}ms` }}>
                            <NavLink
                              to={item.to}
                              end={item.end}
                              className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm ${
                                  isActive
                                    ? 'text-navy-900 bg-signal-yellow font-bold'
                                    : 'text-navy-100 hover:text-white hover:bg-white/10'
                                }`
                              }
                            >
                              <item.icon size={16} className="shrink-0" />
                              {item.label}
                            </NavLink>
                          </li>
                        )))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </nav>
            <div className="px-4 py-3 border-t border-navy-700 flex items-center justify-between gap-3">
              <p className="text-sm text-navy-200 truncate">{profile?.name || 'Administrador'}</p>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-navy-100 border border-white/15 hover:bg-white/10"
              >
                <LogOut size={15} /> Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Velo para cerrar el menú móvil tocando fuera */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="xl:hidden fixed inset-0 top-14 z-30 bg-navy-900/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main
        ref={mainRef}
        className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5 sm:py-6 lg:px-8 ibime-watermark${classicLists ? ' legacy-lists' : ''}`}
      >
        <div className="max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
