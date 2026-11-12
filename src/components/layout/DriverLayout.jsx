import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, History, ListChecks, Bus, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useNotices from '../../hooks/useNotices';
import NoticeGate from '../NoticeGate';
import OperatorPending from '../OperatorPending';
import OperatorNav from '../OperatorNav';

export default function DriverLayout() {
  const { logout, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pending, ack } = useNotices();

  return (
    <div className="min-h-screen bg-navy-50 flex flex-col">
      <NoticeGate pending={pending} ack={ack} />
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
        {/* Menú del operador: solo íconos; el módulo activo muestra su nombre.
            Solo consulta bajo demanda, sin listeners en vivo. */}
        <OperatorNav
          items={[
            { to: '/chofer', label: 'Inicio', icon: Home, end: true },
            { to: '/chofer/lista', label: 'Mi lista', icon: ListChecks },
            { to: '/chofer/viajes-especiales', label: 'Viajes especiales', icon: Bus },
            { to: '/chofer/avisos', label: 'Avisos', icon: Bell, badge: pending.length },
            { to: '/chofer/historial', label: 'Mis recorridos', icon: History },
          ]}
        />
      </header>
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        {location.pathname === '/chofer' && <OperatorPending pendingNotices={pending.length} />}
        <Outlet />
      </main>
    </div>
  );
}
