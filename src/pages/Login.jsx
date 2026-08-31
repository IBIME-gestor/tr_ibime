import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithGoogle, authError, loading, user, profile } = useAuth();
  const navigate = useNavigate();

  // En cuanto haya sesión + perfil (admin o chofer), redirige solo.
  useEffect(() => {
    if (user && profile) {
      navigate(profile.role === 'admin' ? '/admin' : '/chofer', { replace: true });
    }
  }, [user, profile, navigate]);

  async function handleClick() {
    try {
      await loginWithGoogle();
    } catch (err) {
      // Errores comunes: ventana emergente cerrada, popup bloqueado, etc.
      console.error(err);
    }
  }

  return (
    <div className="relative min-h-screen bg-navy-800 flex items-center justify-center p-6 overflow-hidden">
      {/* Marca de agua de fondo */}
      <img
        src="/ibime-shield.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute -right-24 -bottom-24 w-[26rem] opacity-10 rotate-[-8deg]"
      />
      <img
        src="/ibime-shield.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none select-none absolute -left-28 -top-24 w-80 opacity-[0.07] rotate-12"
      />

      <div className="relative w-full max-w-sm text-center">
        <img
          src="/logo-ibime.png"
          alt="IBIME"
          className="mx-auto mb-6 w-48"
        />
        <h1 className="text-3xl font-display font-bold text-white">Ruta Segura</h1>
        <p className="text-navy-100 mt-1 mb-8">Transporte escolar</p>

        <div className="card">
          <p className="text-navy-600 mb-5">
            Entra con tu cuenta de Google institucional
            <span className="block font-semibold text-navy-800">@ibime.edu.mx</span>
          </p>
          <button
            onClick={handleClick}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-navy-100 px-6 py-4 font-display font-semibold text-navy-800"
          >
            <svg width="22" height="22" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l6-6C34.9 5.5 29.7 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.3-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13.5 24 13.5c3.1 0 5.9 1.2 8 3.1l6-6C34.9 6.5 29.7 4.5 24 4.5c-7.4 0-13.8 4.2-17 10.3z"/>
              <path fill="#4CAF50" d="M24 44.5c5.6 0 10.7-1.9 14.6-5.2l-6.7-5.7c-2 1.5-4.7 2.4-7.9 2.4-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.9 40.3 16.4 44.5 24 44.5z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.7 5.7C41.5 36 44.5 30.6 44.5 24c0-1.2-.1-2.4-.3-3.5z"/>
            </svg>
            Entrar con Google
          </button>
        </div>

        {authError && (
          <div className="mt-4 bg-stop-light border-2 border-stop rounded-xl p-3 text-sm text-navy-800 text-left">
            {authError}
          </div>
        )}

        <p className="text-navy-100 text-xs mt-6">
          El acceso lo autoriza el administrador registrando tu correo
          institucional en la app. Si es tu primera vez y ves un error
          arriba, avísale para que lo registre.
        </p>
      </div>
    </div>
  );
}
