import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, History } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-navy-700 text-white' : 'text-navy-300 hover:text-white'
  }`;

export default function DriverLayout() {
  const { logout, profile } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-navy-50 flex flex-col">
      <header className="bg-navy-800 text-white sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <button
            onClick={() => navigate('/chofer')}
            className="flex items-center gap-2 font-display font-semibold text-lg shrink-0"
          >
            <img src="/ibime-shield.png" alt="" className="w-7 h-7" />
            Ruta Segura
          </button>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-navy-100 truncate max-w-[40vw] sm:max-w-none">
              {profile?.name}
              {profile?.role === 'nanny' && <span className="text-navy-400"> · Nanny</span>}
            </span>
            <button
              onClick={logout}
              className="bg-navy-700 px-3 py-1.5 rounded-lg shrink-0"
            >
              Salir
            </button>
          </div>
        </div>
        {/* Menú del operador: solo consulta bajo demanda, sin listeners en vivo */}
        <nav className="flex gap-1 px-4 pb-2 overflow-x-auto">
          <NavLink to="/chofer" end className={navLinkClass}>
            <Home size={15} /> Inicio
          </NavLink>
          <NavLink to="/chofer/historial" className={navLinkClass}>
            <History size={15} /> Mis recorridos
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
