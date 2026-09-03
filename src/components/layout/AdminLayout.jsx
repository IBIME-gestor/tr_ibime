import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  School,
  Users,
  Contact,
  Truck,
  Route as RouteIcon,
  FileBarChart,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const links = [
  { to: '/admin', label: 'Resumen', end: true, icon: LayoutDashboard },
  { to: '/admin/planteles', label: 'Planteles', icon: School },
  { to: '/admin/alumnos', label: 'Alumnos', icon: Users },
  { to: '/admin/choferes', label: 'Choferes y nannies', icon: Contact },
  { to: '/admin/unidades', label: 'Unidades', icon: Truck },
  { to: '/admin/rutas', label: 'Rutas', icon: RouteIcon },
  { to: '/admin/reportes', label: 'Reportes', icon: FileBarChart },
];

export default function AdminLayout() {
  const { logout, profile } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-navy-50">
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
            <p className="text-navy-400 text-xs">Panel administrativo</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-signal-yellow text-navy-900'
                      : 'text-navy-100 hover:bg-navy-700'
                  }`
                }
              >
                <Icon size={17} strokeWidth={2} />
                {l.label}
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

      <main className="flex-1 p-4 md:p-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
