import { useEffect, useState } from 'react';
import { Bell, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listMyNotices, ackNotice } from '../../firebase/announcements';
import LoadingOverlay from '../../components/LoadingOverlay';

const fmt = (ts) => (ts?.seconds ? new Date(ts.seconds * 1000).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/** Avisos recibidos del administrador, con su estado. */
export default function DriverNotices() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    if (!profile?.staffId) { setLoading(false); return; }
    try { setRows((await listMyNotices(profile.staffId)).filter((r) => r.status !== 'cancelado')); setError(''); }
    catch (e) { console.error(e); setError(e?.message || 'No se pudieron cargar tus avisos.'); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile?.staffId]);

  async function handleAck(id) {
    try { await ackNotice(id); await load(); } catch (e) { setError(e?.message || 'No se pudo confirmar.'); }
  }

  if (loading) return <LoadingOverlay show label="Cargando avisos…" />;
  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display font-bold text-lg text-navy-900">Avisos</h1>
        <p className="text-xs text-navy-400">Mensajes de la administración.</p>
      </div>
      {error && <p className="text-stop text-sm">{error}</p>}
      {rows.length === 0 && <div className="card text-sm text-navy-400 text-center">No has recibido avisos.</div>}
      {rows.map((n) => (
        <div key={n.id} className={`card space-y-1 ${n.status === 'pendiente' ? 'border border-red-200' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-navy-900 flex items-center gap-1.5">
              <Bell size={14} className={n.priority === 'urgente' ? 'text-red-600' : 'text-navy-400'} />{n.title}
            </p>
            {n.priority === 'urgente' && <span className="text-[10px] font-bold text-red-700 bg-red-50 rounded-full px-2 py-0.5">URGENTE</span>}
          </div>
          {n.body && <p className="text-sm text-navy-600 whitespace-pre-line">{n.body}</p>}
          <p className="text-[11px] text-navy-400">Enviado {fmt(n.createdAt)}</p>
          {n.status === 'visto'
            ? <p className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 size={13} /> Enterado {fmt(n.ackedAt)}</p>
            : <button type="button" className="btn-go w-full" onClick={() => handleAck(n.id)}>Enterado</button>}
        </div>
      ))}
    </div>
  );
}
