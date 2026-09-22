import { useEffect, useState } from 'react';
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
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const links = [
  { to: '/admin', label: 'Resumen', end: true, icon: LayoutDashboard, roles: ['admin'] },
  { to: '/admin/planteles', label: 'Planteles', icon: School, roles: ['admin'] },
  { to: '/admin/alumnos', label: 'Alumnos', icon: Users, roles: ['admin'] },
  { to: '/admin/formar-ruta', label: 'Formar lista de ruta', icon: ListOrdered, roles: ['admin'] },
  { to: '/admin/choferes', label: 'Operadores y nannies', icon: Contact, roles: ['admin'] },
  { to: '/admin/unidades', label: 'Unidades', icon: Truck, roles: ['admin'] },
  { to: '/admin/rutas', label: 'Rutas', icon: RouteIcon, roles: ['admin'] },
  { to: '/admin/reportes', label: 'Reportes', icon: FileBarChart, roles: ['admin'] },
  { to: '/admin/en-vivo', label: 'Flota en vivo', icon: Radio, roles: ['admin'] },
  { to: '/admin/recorridos-activos', label: 'Recorridos en curso', icon: LifeBuoy, roles: ['admin'] },
  { to: '/admin/caja', label: 'Caja', icon: Wallet, roles: ['admin', 'cashier'] },
  { to: '/admin/nomina', label: 'Nómina de personal', icon: ClipboardList, roles: ['admin'] },
  { to: '/admin/acceso', label: 'Personas con acceso', icon: UserCog, roles: ['admin'] },
];

export default function AdminLayout() {
  const { logout, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const visibleLinks = links.filter((l) => l.roles.includes(profile?.role));

  // El rol "cajero" solo tiene acceso a Caja — si intenta entrar a otra
  // ruta admin por URL (o queda en /admin, que es solo para admin),
  // lo mandamos derechito a lo único que le corresponde.
  useEffect(() => {
    if (profile?.role === 'cashier' && location.pathname !== '/admin/caja') {
      navigate('/admin/caja', { replace: true });
    }
  }, [profile?.role, location.pathname, navigate]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-navy-50 overflow-x-hidden">
      {/* Barra superior solo en móvil/tablet */}
      <div className="md:hidden bg-navy-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <img src="/ibime-shield.png" alt="" className="w-7 h-7" />
          <span className="font-display font-semibold">Ruta Segura</span>
        </div>
        <button onClick={() => setOpen(!open)} aria-label="Menú">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <aside
        className={`bg-navy-800 text-white w-full md:w-60 md:min-h-screen px-4 py-5 flex-col gap-6 ${
          open ? 'flex' : 'hidden'
        } md:flex`}
      >
        <div className="hidden md:flex items-center gap-3">
          <img src="/ibime-shield.png" alt="IBIME" className="w-8 h-8" />
          <div>
            <p className="font-display text-base font-semibold leading-tight">Ruta Segura</p>
            <p className="text-navy-400 text-xs">
              {profile?.role === 'cashier' ? 'Caja' : 'Panel administrativo'}
            </p>
          </div>
        </div>

        <nav className="relative flex flex-col gap-0.5">
          {/* La línea de la ruta: corre detrás de todas las paradas (secciones) */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-navy-600" aria-hidden="true" />
          {visibleLinks.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 pr-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'text-white' : 'text-navy-100 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative z-10 flex items-center justify-center w-[30px] shrink-0">
                      <span
                        className={
                          isActive
                            ? 'w-2.5 h-2.5 rounded-full bg-signal-yellow ring-4 ring-signal-yellow/25'
                            : 'w-1.5 h-1.5 rounded-full bg-navy-400 group-hover:bg-navy-100 transition-colors'
                        }
                      />
                    </span>
                    <Icon size={16} strokeWidth={2} className="shrink-0" />
                    {l.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-navy-700 text-sm">
          <p className="mb-2 truncate text-navy-200">{profile?.name || 'Administrador'}</p>
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-navy-700 text-navy-100"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-8 min-h-screen ibime-watermark">
        <Outlet />
      </main>
    </div>
  );
}
