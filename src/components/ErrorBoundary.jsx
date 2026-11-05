import { Component } from 'react';
import { reportError } from '../utils/errorLog';

/**
 * Atrapa los fallos de pantalla de React: en vez de dejar la página en
 * blanco, muestra un aviso amable con opción de reintentar, y registra el
 * error para que aparezca en Admin → Soporte → Errores.
 * Se reinicia solo al cambiar de pantalla (`resetKey`).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError({
      message: error?.message || String(error),
      stack: `${error?.stack || ''}\n${String(info?.componentStack || '').slice(0, 400)}`,
      source: 'react',
    });
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-50 p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-navy-100 shadow-panel p-6 text-center">
          <div className="text-4xl mb-2" aria-hidden="true">🚌</div>
          <h1 className="font-display text-xl font-bold text-navy-900">Algo no salió como esperábamos</h1>
          <p className="text-sm text-navy-500 mt-2">
            Ya quedó registrado el problema para que lo revisemos. Intenta de nuevo; si sigue igual,
            avisa a la escuela.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-semibold"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2.5 rounded-xl border border-navy-200 text-navy-700 text-sm font-semibold"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
