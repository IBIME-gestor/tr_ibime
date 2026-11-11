import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { playChime, unlockAudio } from '../utils/chime';

const SNOOZE_MS = 5 * 60 * 1000;

/**
 * Ventana emergente de avisos del administrador. Mientras el aviso no se confirme
 * con «Enterado»: si se cierra, vuelve a aparecer a los 5 minutos y cada vez que
 * se abre la app o se regresa a ella.
 */
export default function NoticeGate({ pending, ack }) {
  const snoozed = useRef({}); // id -> hasta cuándo está pospuesto (solo en memoria)
  const lastShown = useRef(null);
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') { snoozed.current = {}; setTick((x) => x + 1); }
    };
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const now = Date.now();
  const current = pending.find((n) => !(snoozed.current[n.id] > now)) || null;

  useEffect(() => {
    if (current && lastShown.current !== current.id) playChime({ urgent: current.priority === 'urgente' });
    lastShown.current = current ? current.id : null;
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;
  const urgent = current.priority === 'urgente';
  const sentAt = current.createdAt?.seconds
    ? new Date(current.createdAt.seconds * 1000).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  async function handleAck() {
    setBusy(true); setError('');
    try { await ack(current.id); } catch (e) { setError(e?.message || 'No se pudo confirmar. Intenta de nuevo.'); }
    setBusy(false);
  }
  function handleClose() {
    snoozed.current[current.id] = Date.now() + SNOOZE_MS;
    setTick((x) => x + 1);
  }

  return (
    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className={`px-4 py-3 flex items-center gap-2 text-white ${urgent ? 'bg-red-600' : 'bg-navy-800'}`}>
          <Bell size={18} />
          <p className="font-display font-semibold">{urgent ? 'Aviso urgente' : 'Aviso de la administración'}</p>
          {pending.length > 1 && <span className="ml-auto text-xs bg-white/20 rounded-full px-2 py-0.5">{pending.length} pendientes</span>}
        </div>
        <div className="p-4 space-y-2">
          <p className="font-display font-bold text-navy-900 text-lg leading-snug">{current.title}</p>
          {current.body && <p className="text-sm text-navy-700 whitespace-pre-line">{current.body}</p>}
          {sentAt && <p className="text-[11px] text-navy-400">Enviado {sentAt}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button type="button" onClick={handleClose} className="flex-1 rounded-xl border border-navy-100 py-3 text-sm font-medium text-navy-600">Recordármelo en 5 min</button>
          <button type="button" onClick={handleAck} disabled={busy} className="flex-1 rounded-xl bg-green-600 text-white py-3 text-sm font-semibold disabled:opacity-60">
            {busy ? 'Confirmando…' : 'Enterado'}
          </button>
        </div>
      </div>
    </div>
  );
}
