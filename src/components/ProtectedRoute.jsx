import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ role, children }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="relative h-screen flex flex-col items-center justify-center gap-4 bg-navy-800 text-white font-display overflow-hidden">
        <img
          src="/ibime-shield.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute -right-20 -bottom-20 w-96 opacity-10 rotate-[-8deg]"
        />
        <img src="/logo-ibime.png" alt="IBIME" className="relative w-40" />
        <p className="relative text-navy-100">Cargando…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // `role` puede ser un string ('admin') o un arreglo (['driver', 'nanny'])
  // para pantallas compartidas por chofer y nanny.
  const allowedRoles = Array.isArray(role) ? role : [role];
  if (role && !allowedRoles.includes(profile?.role)) {
    return <Navigate to={profile?.role === 'admin' ? '/admin' : '/chofer'} replace />;
  }

  return children;
}
