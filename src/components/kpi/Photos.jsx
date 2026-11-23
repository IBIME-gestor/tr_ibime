import { useEffect, useState } from 'react';
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { driveThumb, driveView } from '../../utils/kpiTasks';

/** Miniatura de una foto guardada en Drive. Si no carga, deja un enlace para abrirla. */
export function DriveImg({ photo, width = 400, className = '', onClick }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a href={driveView(photo)} target="_blank" rel="noreferrer" className={`flex items-center justify-center text-[11px] text-navy-500 bg-navy-50 rounded-lg ${className}`}>
        <ExternalLink size={12} className="mr-1" /> Abrir en Drive
      </a>
    );
  }
  return (
    <img
      src={driveThumb(photo.fileId, width)}
      alt="Evidencia"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onClick={onClick}
      className={`object-cover bg-navy-50 rounded-lg ${onClick ? 'cursor-zoom-in' : ''} ${className}`}
    />
  );
}

/**
 * Visor de fotos a pantalla completa.
 * items: [{ photo, caption }]  ·  index: foto abierta  ·  onClose / onIndex
 */
export function PhotoLightbox({ items, index, onClose, onIndex }) {
  const cur = items[index];
  useEffect(() => {
    if (!cur) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cur, index, items.length, onClose, onIndex]);
  if (!cur) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/85 flex flex-col items-center justify-center p-4 kpi-fade" onClick={onClose} role="dialog" aria-modal="true">
      <div className="absolute top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a href={driveView(cur.photo)} target="_blank" rel="noreferrer" className="btn-admin-ghost !bg-white/90"><ExternalLink size={14} /> Drive</a>
        <button type="button" className="btn-admin-ghost !bg-white/90" onClick={onClose}><X size={14} /> Cerrar</button>
      </div>
      <img
        src={driveThumb(cur.photo.fileId, 1600)}
        alt="Evidencia ampliada"
        referrerPolicy="no-referrer"
        className="max-h-[80vh] max-w-full rounded-lg shadow-panel"
        onClick={(e) => e.stopPropagation()}
      />
      {cur.caption && <p className="text-white text-sm mt-3 text-center" onClick={(e) => e.stopPropagation()}>{cur.caption}</p>}
      {items.length > 1 && (
        <div className="absolute inset-y-0 inset-x-0 flex items-center justify-between px-3 pointer-events-none">
          <button type="button" disabled={index === 0} onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} className="pointer-events-auto w-10 h-10 rounded-full bg-white/90 flex items-center justify-center disabled:opacity-30"><ChevronLeft /></button>
          <button type="button" disabled={index === items.length - 1} onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} className="pointer-events-auto w-10 h-10 rounded-full bg-white/90 flex items-center justify-center disabled:opacity-30"><ChevronRight /></button>
        </div>
      )}
    </div>
  );
}
