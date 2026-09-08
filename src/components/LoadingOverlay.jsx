/**
 * Overlay de carga con el escudo de IBIME "rellenándose" de color.
 * Se usa en toda la app (admin, chofer/nanny, y la pantalla del padre)
 * para cualquier carga que bloquee la pantalla un momento.
 *
 * Uso:
 *   <LoadingOverlay show={loading} label="Consultando…" />
 */
export default function LoadingOverlay({ show, label = 'Cargando…' }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-navy-900/70 backdrop-blur-sm">
      <div className="ibime-loader" />
      <p className="text-white text-sm font-medium tracking-wide">{label}</p>
    </div>
  );
}
