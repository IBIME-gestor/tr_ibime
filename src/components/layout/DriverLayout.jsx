import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function DriverLayout() {
  const { logout, profile } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-navy-50 flex flex-col">
      <header className="bg-navy-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => navigate('/chofer')}
          className="flex items-center gap-2 font-display font-semibold text-lg"
        >
          <img src="/ibime-shield.png" alt="" className="w-7 h-7" />
          Ruta Segura
        </button>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-navy-100">
            {profile?.name}
            {profile?.role === 'nanny' && <span className="text-navy-400"> · Nanny</span>}
          </span>
          <button
            onClick={logout}
            className="bg-navy-700 px-3 py-1.5 rounded-lg"
          >
            Salir
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}
