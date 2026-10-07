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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Menú agrupado por categorías. Cada grupo es un botón en la barra
 * superior que despliega sus módulos en cascada ligera.
 *
 *  - Inicio:         Resumen
 *  - Operación:      lo que se mueve día a día (rutas, listas, recorridos)
 *  - Catálogos:      datos maestros (alumnos, planteles, operadores, unidades)
 *  - Finanzas:       cobranza, tarifas y estado financiero
 *  - Administración: reportes, nómina y accesos
 */
const groups = [
  {
    key: 'inicio',
    label: 'Inicio',
    icon: LayoutDashboard,
    items: [
      { to: '/admin', label: 'Resumen', end: true, icon: LayoutDashboard, roles: ['admin'] },
    ],
  },
  {
    key: 'operacion',
    label: 'Operación',
    icon: Compass,
    items: [
      { to: '/admin/rutas', label: 'Rutas', icon: RouteIcon, roles: ['admin'] },
      { to: '/admin/formar-ruta', label: 'Formar lista de ruta', icon: ListOrdered, roles: ['admin'] },
      { to: '/admin/solicitudes-operadores', label: 'Enlaces y solicitudes', icon: Link2, roles: ['admin'] },
      { to: '/admin/recorridos-activos', label: 'Recorridos en curso', icon: LifeBuoy, roles: ['admin'] },
      { to: '/admin/en-vivo', label: 'Flota en vivo', icon: Radio, roles: ['admin'] },
    ],
  },
  {
    key: 'catalogos',
    label: 'Catálogos',
    icon: Database,
    items: [
      { to: '/admin/alumnos', label: 'Alumnos', icon: Users, roles: ['admin'] },
      { to: '/admin/planteles', label: 'Planteles', icon: School, roles: ['admin'] },
      { to: '/admin/choferes', label: 'Operadores y nannies', icon: Contact, roles: ['admin'] },
      { to: '/admin/unidades', label: 'Unidades', icon: Truck, roles: ['admin'] },
    ],
  },
  {
    key: 'finanzas',
    label: 'Finanzas',
    icon: Landmark,
    items: [
      { to: '/admin/caja', label: 'Caja', icon: Wallet, roles: ['admin', 'cashier'] },
      { to: '/admin/finanzas', label: 'Finanzas', icon: Landmark, roles: ['admin'] },
      { to: '/admin/tarifas', label: 'Tarifas y conceptos', icon: CircleDollarSign, roles: ['admin'] },
    ],
  },
  {
    key: 'administracion',
    label: 'Administración',
    icon: Settings2,
    items: [
      { to: '/admin/reportes', label: 'Reportes', icon: FileBarChart, roles: ['admin'] },
      { to: '/admin/nomina', label: 'Nómina de personal', icon: ClipboardList, roles: ['admin'] },
      { to: '/admin/acceso', label: 'Personas con acceso', icon: UserCog, roles: ['admin'] },
    ],
  },
];

function isItemActive(item, pathname) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export default function AdminLayout() {
  const { logout, profile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null); // desktop: grupo con el menú desplegado
  const [expanded, setExpanded] = useState(null); // móvil: grupo expandido (acordeón)
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef(null);
  const mainRef = useRef(null);

  const role = profile?.role;

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
        .filter((g) => g.items.length > 0),
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
  const flat = visibleGroups.length === 1 && visibleGroups[0].items.length === 1;

  return (
    <div className="h-screen flex flex-col bg-navy-50 overflow-hidden">
      <header className="shrink-0 bg-navy-800 text-white relative z-40 shadow-panel">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-5 h-14 flex items-center gap-3">
          {/* Marca */}
          <NavLink to={role === 'cashier' ? '/admin/caja' : '/admin'} className="flex items-center gap-2.5 shrink-0">
            <img src="/ibime-shield.png" alt="IBIME" className="w-8 h-8" />
            <div className="leading-tight">
              <p className="font-display text-sm sm:text-base font-semibold">Ruta Segura</p>
              <p className="hidden sm:block text-navy-400 text-[0.65rem]">
                {role === 'cashier' ? 'Caja' : 'Gestión de transporte escolar'}
              </p>
            </div>
          </NavLink>

          {/* Navegación de escritorio */}
          <nav ref={navRef} className="hidden lg:flex items-center gap-1 ml-4 flex-1 min-w-0" aria-label="Módulos">
            {visibleGroups.map((g) => {
              const GroupIcon = g.icon;
              const active = g.items.some((i) => isItemActive(i, location.pathname));
              const isOpen = openGroup === g.key;

              // Grupo de un solo módulo (Inicio, o Caja para el cajero): enlace directo.
              if (g.items.length === 1) {
                const item = g.items[0];
                return (
                  <NavLink
                    key={g.key}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive ? 'text-white bg-navy-700' : 'text-navy-100 hover:text-white hover:bg-navy-700/60'
                      }`
                    }
                  >
                    <GroupIcon size={16} /> {flat ? item.label : g.label}
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
                    className={`relative flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      active || isOpen ? 'text-white bg-navy-700' : 'text-navy-100 hover:text-white hover:bg-navy-700/60'
                    }`}
                  >
                    <GroupIcon size={16} />
                    {g.label}
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    {active && (
                      <span className="absolute left-3 right-3 -bottom-[7px] h-[3px] rounded-full bg-signal-yellow" aria-hidden="true" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="absolute left-0 top-full pt-2 min-w-[240px] z-50">
                      <ul className="bg-white text-navy-800 rounded-lg border border-navy-100 shadow-panel py-1.5 overflow-hidden">
                        {g.items.map((item, idx) => (
                          <li key={item.to} className="nav-cascade" style={{ animationDelay: `${idx * 28}ms` }}>
                            <NavLink
                              to={item.to}
                              end={item.end}
                              className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors border-l-[3px] pl-[13px] ${
                                  isActive
                                    ? 'bg-navy-50 text-navy-900 border-signal-yellow'
                                    : 'text-navy-600 hover:bg-navy-50 border-transparent'
                                }`
                              }
                            >
                              <item.icon size={16} className="text-navy-400 shrink-0" />
                              {item.label}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="flex-1 lg:hidden" />

          {/* Usuario (escritorio) */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <p className="text-xs text-navy-100 max-w-[160px] truncate">{profile?.name || 'Administrador'}</p>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-navy-100 hover:text-white hover:bg-navy-700"
            >
              <LogOut size={14} /> Salir
            </button>
          </div>

          {/* Botón de menú (móvil / tablet) */}
          <button
            type="button"
            className="lg:hidden p-2 -mr-2 rounded-md hover:bg-navy-700"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menú"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Panel móvil / tablet */}
        {mobileOpen && (
          <div className="lg:hidden absolute left-0 right-0 top-full bg-navy-800 border-t border-navy-700 shadow-panel max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <nav className="px-3 py-3 flex flex-col gap-1" aria-label="Módulos">
              {visibleGroups.map((g, gi) => {
                const GroupIcon = g.icon;
                const active = g.items.some((i) => isItemActive(i, location.pathname));
                const isOpen = expanded === g.key || (expanded === null && active);

                if (g.items.length === 1) {
                  const item = g.items[0];
                  return (
                    <NavLink
                      key={g.key}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `nav-cascade flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                          isActive ? 'bg-navy-700 text-white' : 'text-navy-100 hover:bg-navy-700/60'
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
                        active ? 'text-white bg-navy-700/70' : 'text-navy-100 hover:bg-navy-700/60'
                      }`}
                    >
                      <GroupIcon size={18} />
                      <span className="flex-1 text-left">{g.label}</span>
                      <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && (
                      <ul className="ml-5 mt-1 mb-1 pl-3 border-l border-navy-600 flex flex-col gap-0.5">
                        {g.items.map((item, idx) => (
                          <li key={item.to} className="nav-cascade" style={{ animationDelay: `${idx * 24}ms` }}>
                            <NavLink
                              to={item.to}
                              end={item.end}
                              className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm ${
                                  isActive
                                    ? 'text-white bg-navy-700 font-semibold'
                                    : 'text-navy-100 hover:text-white hover:bg-navy-700/60'
                                }`
                              }
                            >
                              <item.icon size={16} className="shrink-0" />
                              {item.label}
                            </NavLink>
                          </li>
                        ))}
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
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-navy-100 hover:bg-navy-700"
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
          className="lg:hidden fixed inset-0 top-14 z-30 bg-navy-900/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main
        ref={mainRef}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5 sm:py-6 lg:px-8 ibime-watermark"
      >
        <div className="max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
