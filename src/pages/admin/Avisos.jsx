import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Drivers } from '../../firebase/services';
import { sendAnnouncement, listAnnouncements, listRecipientsFor, cancelAnnouncement } from '../../firebase/announcements';

/**
 * Avisos a operadores y nannies (solo admin)
 * Eliges a todos o a algunos; cada quien recibe una ventana emergente al abrir
 * la app que sigue apareciendo (a los 5 min y al reabrir) hasta que pulse
 * «Enterado». Aquí ves quién ya lo confirmó y a qué hora.
 * Importante: el aviso llega cuando la persona abre la app (no es push con la app cerrada).
 */

const fmt = (ts) => (ts?.seconds ? new Date(ts.seconds * 1000).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function AvisosAdmin() {
  const { profile, user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [anns, setAnns] = useState([]);
  const [recs, setRecs] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    Drivers.list()
      .then((rows) => setStaff((rows || []).filter((d) => !d.role || d.role === 'driver' || d.role === 'nanny')
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))))
      .catch((e) => setError(e?.message || 'No se pudo cargar el personal.'));
  }, []);

  async function loadHistory() {
    try {
      const list = await listAnnouncements(30);
      setAnns(list);
      setRecs(list.length ? await listRecipientsFor(list.map((a) => a.id)) : []);
      setError('');
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo leer el historial (¿están publicadas las reglas de Firestore?).');
    }
  }
  useEffect(() => {
    loadHistory();
    const t = setInterval(loadHistory, 20000);
    return () => clearInterval(t);
  }, []);

  const operators = staff.filter((d) => d.role !== 'nanny');
  const nannies = staff.filter((d) => d.role === 'nanny');
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const setGroup = (list, on) => setPicked((p) => {
    const ids = list.map((d) => d.id);
    return on ? Array.from(new Set([...p, ...ids])) : p.filter((x) => !ids.includes(x));
  });

  async function handleSend(e) {
    e.preventDefault();
    if (!title.trim()) { setMsg('Escribe el título del aviso.'); return; }
    if (!picked.length) { setMsg('Elige al menos un destinatario.'); return; }
    if (!window.confirm(`¿Enviar este aviso a ${picked.length} persona(s)?`)) return;
    setSending(true); setMsg('');
    try {
      const recipients = staff.filter((d) => picked.includes(d.id)).map((d) => ({ id: d.id, name: d.name || 'Sin nombre' }));
      await sendAnnouncement({
        title: title.trim(), body: body.trim(), priority,
        audience: recipients.length === staff.length ? 'all' : 'selected',
        recipients, createdByName: profile?.name || '', createdByUid: user?.uid || '',
      });
      setTitle(''); setBody(''); setPriority('normal'); setPicked([]);
      setMsg(`Aviso enviado a ${recipients.length} persona(s). Lo verán al abrir la app.`);
      await loadHistory();
    } catch (err) {
      console.error(err);
      setMsg(err?.message || 'No se pudo enviar el aviso.');
    }
    setSending(false);
  }

  async function handleCancel(a) {
    if (!window.confirm('¿Cancelar este aviso? A quien no lo haya visto ya no le aparecerá.')) return;
    await cancelAnnouncement(a.id);
    await loadHistory();
  }

  const byAnn = useMemo(() => {
    const m = {};
    recs.forEach((r) => { (m[r.announcementId] = m[r.announcementId] || []).push(r); });
    return m;
  }, [recs]);

  const Group = ({ label, list }) => (list.length ? (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <p className="text-xs font-semibold text-navy-500">{label} ({list.length})</p>
        <button type="button" className="link-action text-xs" onClick={() => setGroup(list, true)}>Todos</button>
        <button type="button" className="link-action text-xs" onClick={() => setGroup(list, false)}>Ninguno</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {list.map((d) => (
          <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(d.id)} onChange={() => toggle(d.id)} />{d.name}</label>
        ))}
      </div>
    </div>
  ) : null);

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="admin-h1 mb-1 flex items-center gap-2"><Bell size={22} /> Avisos a operadores</h1>
        <p className="text-sm text-navy-400">
          Cada persona recibe una ventana emergente al abrir la app y le sigue apareciendo (a los 5 minutos y al reabrir) hasta que pulse «Enterado».
          Aquí ves quién ya lo confirmó. Solo les llega cuando tienen la app abierta; no es una notificación con la app cerrada.
        </p>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      <form onSubmit={handleSend} className="admin-card space-y-3">
        <p className="font-display font-semibold text-sm text-navy-800">Nuevo aviso</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3"><label className="admin-label">Título</label><input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required /></div>
          <div>
            <label className="admin-label">Prioridad</label>
            <select className="admin-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="normal">Normal</option>
              <option value="urgente">Urgente (tono doble)</option>
            </select>
          </div>
          <div className="md:col-span-4"><label className="admin-label">Mensaje</label><textarea rows={3} className="admin-input" value={body} onChange={(e) => setBody(e.target.value)} /></div>
        </div>
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-navy-700">Destinatarios ({picked.length} de {staff.length})</p>
            <button type="button" className="link-action text-xs" onClick={() => setPicked(staff.map((d) => d.id))}>Seleccionar a todos</button>
            <button type="button" className="link-action text-xs" onClick={() => setPicked([])}>Limpiar</button>
          </div>
          <Group label="Operadores" list={operators} />
          <Group label="Nannies" list={nannies} />
          {staff.length === 0 && <p className="text-xs text-navy-400">No hay operadores ni nannies registrados.</p>}
          <p className="text-[11px] text-navy-400">Solo lo verá quien tenga su cuenta vinculada a su ficha en «Personas con acceso».</p>
        </div>
        {msg && <p className="text-xs text-navy-600">{msg}</p>}
        <button type="submit" className="btn-admin-primary" disabled={sending}>{sending ? 'Enviando…' : 'Enviar aviso'}</button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-display font-semibold text-sm text-navy-800">Avisos enviados</p>
          <button type="button" className="btn-admin-ghost" onClick={loadHistory}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
        </div>
        {anns.length === 0 && <p className="text-sm text-navy-400">Aún no has enviado avisos.</p>}
        {anns.map((a) => {
          const list = (byAnn[a.id] || []).filter((r) => r.status !== 'cancelado');
          const seen = list.filter((r) => r.status === 'visto').length;
          const pendingCount = list.filter((r) => r.status === 'pendiente').length;
          const expanded = open === a.id;
          return (
            <div key={a.id} className="admin-card space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-navy-900">
                    {a.title}
                    {a.priority === 'urgente' && <span className="ml-2 text-[10px] font-bold text-red-700 bg-red-50 rounded-full px-2 py-0.5">URGENTE</span>}
                    {a.cancelled && <span className="ml-2 text-[10px] font-bold text-navy-500 bg-navy-50 rounded-full px-2 py-0.5">CANCELADO</span>}
                  </p>
                  <p className="text-[11px] text-navy-400">{fmt(a.createdAt)} · {a.createdByName || 'Admin'}</p>
                </div>
                <p className={`text-sm font-semibold ${pendingCount === 0 ? 'text-green-700' : 'text-amber-700'}`}>
                  Visto {seen} de {list.length}
                </p>
              </div>
              {a.body && <p className="text-sm text-navy-600 whitespace-pre-line">{a.body}</p>}
              <div className="flex gap-3 text-xs">
                <button type="button" className="link-action" onClick={() => setOpen(expanded ? null : a.id)}>{expanded ? 'Ocultar detalle' : 'Ver quién lo vio'}</button>
                {pendingCount > 0 && !a.cancelled && <button type="button" className="link-danger" onClick={() => handleCancel(a)}>Cancelar aviso</button>}
              </div>
              {expanded && (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm pt-1">
                  {list.sort((x, y) => String(x.staffName).localeCompare(String(y.staffName), 'es')).map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      {r.status === 'visto'
                        ? <CheckCircle2 size={14} className="text-green-600" />
                        : <Clock size={14} className="text-amber-600" />}
                      <span>{r.staffName}</span>
                      <span className="text-[11px] text-navy-400">{r.status === 'visto' ? `visto ${fmt(r.ackedAt)}` : 'pendiente'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
