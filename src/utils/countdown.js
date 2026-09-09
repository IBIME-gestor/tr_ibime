import { useEffect, useState } from 'react';

/**
 * Cuenta regresiva en vivo desde `arrivedAt` (Timestamp de Firestore)
 * hasta que pasan `waitSeconds`. Se actualiza solo cada segundo.
 * Regresa null si todavía no hay `arrivedAt` (p. ej. mientras el
 * serverTimestamp() no ha vuelto del servidor), o un número de
 * segundos restantes (0 cuando ya se acabó el tiempo).
 */
export function useArrivalCountdown(arrivedAt, waitSeconds) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!arrivedAt?.toMillis) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [arrivedAt]);

  if (!arrivedAt?.toMillis) return null;
  const targetMs = arrivedAt.toMillis() + waitSeconds * 1000;
  return Math.max(0, Math.round((targetMs - now) / 1000));
}

export function fmtCountdown(seconds) {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
