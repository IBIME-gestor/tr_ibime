import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const links = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/planteles', label: 'Planteles' },
  { to: '/admin/alumnos', label: 'Alumnos' },
  { to: '/admin/choferes', label: 'Choferes y nannies' },
  { to: '/admin/unidades', label: 'Unidades' },
  { to: '/admin/rutas', label: 'Rutas' },
  { to: '/admin/reportes', label: 'Reportes' },
];

export default function AdminLayout() {
  const { logout, profile } = useAuth();

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="bg-navy-800 text-white md:w-64 md:min-h-screen p-5 flex flex-col">
        <div className="mb-8 flex items-center gap-3">
          <img src="/ibime-shield.png" alt="IBIME" className="w-9 h-9" />
          <div>
            <p className="font-display text-xl font-semibold">Ruta Segura</p>
            <p className="text-navy-100 text-sm">Panel administrativo</p>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 flex-wrap">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-signal-yellow text-navy-900' : 'text-navy-100 hover:bg-navy-700'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-6 text-sm text-navy-100">
          <p className="mb-2 truncate">{profile?.name || 'Administrador'}</p>
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-navy-700 text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 bg-navy-50 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
