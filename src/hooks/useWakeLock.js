import { useEffect, useState } from 'react';

/**
 * Mantiene la pantalla encendida mientras `active` sea true (Wake Lock API).
 * El navegador lo suelta solo cuando la página queda oculta (cambio de app o
 * bloqueo manual), así que se vuelve a pedir al regresar.
 * Devuelve { supported, held } para poder avisar al operador.
 */
export function useWakeLock(active) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !supported) { setHeld(false); return undefined; }
    let sentinel = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) { s.release().catch(() => {}); return; }
        sentinel = s;
        setHeld(true);
        s.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false); // sin permiso, batería baja, etc.
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') acquire(); };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel) sentinel.release().catch(() => {});
      setHeld(false);
    };
  }, [active, supported]);

  return { supported, held };
}
