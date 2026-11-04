import { useEffect, useState } from 'react';

/**
 * Reloj del servidor (aprox.). El `arrivedAt` es hora del SERVIDOR de Firestore
 * y el contador se calculaba contra el reloj del CELULAR: si el celular
 * (operador o padre) va adelantado/atrasado, el contador arrancaba corrido.
 * Se estima la diferencia una sola vez con el encabezado HTTP `Date` del propio
 * hosting (precisión ~1 s) y se reutiliza para todos los contadores.
 */
let serverOffsetMs = 0;
let offsetPromise = null;

function loadServerOffset() {
  if (offsetPromise) return offsetPromise;
  offsetPromise = (async () => {
    try {
      const t0 = Date.now();
      const res = await fetch(`${window.location.origin}/?_t=${t0}`, { method: 'HEAD', cache: 'no-store' });
      const t1 = Date.now();
      const header = res.headers.get('date');
      if (!header) return;
      // Si la respuesta salió del CDN, `Age` dice cuántos segundos lleva guardada.
      const age = Number(res.headers.get('age') || 0) * 1000;
      const server = new Date(header).getTime() + (Number.isFinite(age) ? age : 0);
      if (Number.isNaN(server)) return;
      // El encabezado trae segundos enteros: se toma el punto medio del segundo y de la espera de red.
      const offset = server + 500 - (t0 + t1) / 2;
      // Solo se corrige una diferencia razonable (si es enorme, mejor no tocar nada).
      if (Math.abs(offset) < 10 * 60 * 1000) serverOffsetMs = offset;
    } catch {
      /* sin red o sin encabezado: se queda con el reloj del celular */
    }
  })();
  return offsetPromise;
}

const nowServer = () => Date.now() + serverOffsetMs;

/**
 * Cuenta regresiva en vivo desde `arrivedAt` (Timestamp de Firestore)
 * hasta que pasan `waitSeconds`. Se actualiza solo cada segundo.
 * Regresa null si todavía no hay `arrivedAt` (p. ej. mientras el
 * serverTimestamp() no ha vuelto del servidor), o un número de
 * segundos restantes (0 cuando ya se acabó el tiempo).
 *
 * Nunca muestra más de `waitSeconds` y la hora "actual" se lee en cada
 * render (antes se guardaba en un estado viejo desde que se montó la
 * tarjeta: por eso arrancaba en 2:13 y luego saltaba a 1:55).
 */
export function useArrivalCountdown(arrivedAt, waitSeconds) {
  const [, setTick] = useState(0);
  const arrivedMs = arrivedAt?.toMillis ? arrivedAt.toMillis() : null;

  useEffect(() => { loadServerOffset().then(() => setTick((n) => n + 1)); }, []);

  useEffect(() => {
    if (arrivedMs == null) return undefined;
    setTick((n) => n + 1); // repinta ya con la hora real al llegar el dato
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [arrivedMs]);

  if (arrivedMs == null) return null;
  const remaining = Math.round((arrivedMs + waitSeconds * 1000 - nowServer()) / 1000);
  return Math.min(waitSeconds, Math.max(0, remaining));
}

export function fmtCountdown(seconds) {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
