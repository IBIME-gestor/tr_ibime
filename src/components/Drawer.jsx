import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Panel lateral derecho (cajón) para crear / editar sin sacar a la persona de la lista.
 *
 *  - Se abre sobre la pantalla con un fondo difuminado; se cierra con Esc, con la X
 *    o al tocar fuera.
 *  - En celular ocupa todo el ancho; en escritorio mide `size` (md 440px, lg 560px, xl 720px).
 *  - Se pinta en <body> (portal), así nunca lo recorta ni lo tapa el menú o la tabla.
 *  - Los botones Guardar/Cancelar de un formulario pueden ir en un contenedor con la
 *    clase `drawer-actions`: se quedan pegados abajo mientras el formulario se desplaza.
 *  - `classic` conserva el diseño original (paleta de las listas).
 */
export default function Drawer({ open, onClose, title, subtitle, size = 'md', classic = false, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.(); };
    window.addEventListener('keydown', onKey);
    // Foco al primer campo, solo al abrir (no en cada cambio del formulario)
    const t = setTimeout(() => {
      panelRef.current?.querySelector('input:not([type=hidden]):not([type=checkbox]):not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
    }, 90);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="drawer-root" role="presentation">
      <div className="drawer-backdrop" onMouseDown={() => closeRef.current?.()} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`drawer-panel drawer-${size}${classic ? ' legacy-lists' : ''}`}
      >
        <header className="drawer-head">
          <div className="min-w-0">
            <h2 className="drawer-title">{title}</h2>
            {subtitle && <p className="drawer-subtitle">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => closeRef.current?.()} className="drawer-close" aria-label="Cerrar panel">
            <X size={18} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
