import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw } from 'lucide-react';

/**
 * Cámara en vivo a pantalla completa. La foto se toma en el momento con la cámara
 * del teléfono; NO abre la galería, así que no se puede subir una foto vieja.
 * onCapture recibe un File (JPEG). Requiere HTTPS y permiso de cámara.
 */
export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false); setError('');
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError('Este navegador no permite usar la cámara en vivo. Abre la app desde Chrome o Safari.'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); setReady(true); }
      } catch (e) {
        console.error(e);
        setError(e?.name === 'NotAllowedError' ? 'Permite el acceso a la cámara en tu navegador para tomar la foto.' : 'No se pudo abrir la cámara.');
      }
    })();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, [facing]);

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', 0.9);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/15" aria-label="Cerrar cámara"><X size={20} /></button>
        <button type="button" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} className="p-2 rounded-full bg-white/15" aria-label="Cambiar cámara"><RefreshCw size={20} /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {error ? <p className="text-white text-center px-6 text-sm">{error}</p> : <video ref={videoRef} playsInline muted className="max-h-full max-w-full" />}
      </div>
      <div className="p-5 flex justify-center">
        <button type="button" disabled={!ready} onClick={snap} className="w-16 h-16 rounded-full bg-white border-4 border-white/50 disabled:opacity-40 flex items-center justify-center" aria-label="Tomar foto">
          <Camera size={26} className="text-navy-800" />
        </button>
      </div>
    </div>
  );
}
