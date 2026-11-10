import { useState } from 'react';
import { Bell, BellRing, Check, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useAgendaAlerts from '../../hooks/useAgendaAlerts';
import { Agenda, AGENDA_CATEGORIES, REMINDER_STEPS, dueMs, stageLabel } from '../../firebase/agenda';

/**
 * Mi agenda (solo admin)
 * Pendientes con fecha y hora: servicios solicitados para días lejanos,
 * cosas por mover, seguimientos. Cada pendiente se marca con campana cuando
 * faltan 24, 12, 6 y 1 hora (y cuando vence), en el encabezado y en esta lista.
 */

const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toTimeInput = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDue = (ms) => new Date(ms).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const emptyForm = () => ({ title: '', notes: '', category: AGENDA_CATEGORIES[0], date: toDateInput(Date.now() + 86400000), time: '09:00' });

const stageStyle = (stage) => {
  if (stage === 0) return 'bg-red-100 text-red-800 border-red-200';
  if (stage === 1) return 'bg-red-50 text-red-700 border-red-200';
  if (stage === 6) return 'bg-orange-50 text-orange-800 border-orange-200';
  if (stage === 12) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (stage === 24) return 'bg-yellow-50 text-yellow-800 border-yellow-200';
  return 'bg-white text-navy-600 border-navy-100';
};

export default function AgendaAdmin() {
  const { user } = useAuth();
  const { items, error } = useAgendaAlerts();
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.date || !form.time) { setMsg('Escribe el pendiente y su fecha y hora.'); return; }
    const due = new Date(`${form.date}T${form.time}:00`);
    if (Number.isNaN(due.getTime())) { setMsg('La fecha u hora no es válida.'); return; }
    setSaving(true); setMsg('');
    try {
      const data = { title: form.title.trim(), notes: form.notes.trim(), category: form.category, dueAt: due };
      if (editingId) await Agenda.update(editingId, data);
      else await Agenda.create({ ...data, ownerUid: user.uid });
      setForm(emptyForm()); setEditingId(null);
    } catch (err) {
      console.error(err);
      setMsg(err?.message || 'No se pudo guardar (¿están publicadas las reglas de Firestore?).');
    }
    setSaving(false);
  }

  function handleEdit(it) {
    const ms = dueMs(it);
    setEditingId(it.id);
    setForm({ title: it.title || '', notes: it.notes || '', category: it.category || AGENDA_CATEGORIES[0], date: ms ? toDateInput(ms) : '', time: ms ? toTimeInput(ms) : '09:00' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  const toggleDone = (it) => Agenda.update(it.id, { done: !it.done, doneAt: !it.done ? new Date() : null });
  async function handleDelete(it) {
    if (window.confirm('¿Eliminar este pendiente?')) await Agenda.remove(it.id);
  }
  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission());
  }

  const open = items.filter((i) => !i.done).sort((a, b) => (dueMs(a) || 0) - (dueMs(b) || 0));
  const overdue = open.filter((i) => i.stage === 0);
  const soon = open.filter((i) => i.stage !== null && i.stage !== 0);
  const later = open.filter((i) => i.stage === null);
  const done = items.filter((i) => i.done).sort((a, b) => (dueMs(b) || 0) - (dueMs(a) || 0)).slice(0, 10);

  const Row = ({ it }) => (
    <li className={`flex items-start gap-3 border rounded-lg px-3 py-2 ${stageStyle(it.stage)}`}>
      <button type="button" onClick={() => toggleDone(it)} title={it.done ? 'Reabrir' : 'Marcar como hecho'}
        className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${it.done ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-navy-300'}`}>
        {it.done && <Check size={13} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${it.done ? 'line-through text-navy-400' : 'text-navy-900'}`}>
          {it.stage !== null && !it.done && <BellRing size={14} className="inline mr-1 -mt-0.5" />}{it.title}
        </p>
        <p className="text-xs">{dueMs(it) ? fmtDue(dueMs(it)) : '—'} · {it.category || 'Otro'}{it.stage !== null && !it.done ? ` · ${stageLabel(it.stage)}` : ''}</p>
        {it.notes && <p className="text-xs text-navy-500 mt-0.5 whitespace-pre-line">{it.notes}</p>}
      </div>
      <button type="button" className="link-action" onClick={() => handleEdit(it)} title="Editar"><Pencil size={14} /></button>
      <button type="button" className="link-danger" onClick={() => handleDelete(it)} title="Eliminar"><Trash2 size={14} /></button>
    </li>
  );

  const Section = ({ title, list }) => (list.length ? (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide">{title} ({list.length})</p>
      <ul className="space-y-2">{list.map((it) => <Row key={it.id} it={it} />)}</ul>
    </div>
  ) : null);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="admin-h1 mb-1 flex items-center gap-2"><Bell size={22} /> Mi agenda</h1>
        <p className="text-sm text-navy-400">
          Pendientes con fecha y hora. Se marcan con campana cuando faltan {REMINDER_STEPS.join(', ')} horas (y al vencer), aquí y en el encabezado.
        </p>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      {perm !== 'unsupported' && (
        <div className="admin-card text-xs text-navy-600 flex flex-wrap items-center gap-3">
          {perm === 'granted' && <span>Avisos del navegador activados. Llegan solo mientras Ruta Segura esté abierta en algún navegador (no hay aviso si la app está cerrada).</span>}
          {perm === 'denied' && <span>Los avisos del navegador están bloqueados; la campana del encabezado sigue funcionando. Puedes habilitarlos en los permisos del sitio.</span>}
          {perm === 'default' && (
            <>
              <span>Activa los avisos del navegador para que, además de la campana, salte una notificación. Solo funcionan con la app abierta.</span>
              <button type="button" className="btn-admin-ghost" onClick={enableNotifications}>Activar avisos</button>
            </>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="admin-card space-y-3">
        <p className="font-display font-semibold text-sm text-navy-800">{editingId ? 'Editar pendiente' : 'Nuevo pendiente'}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-4"><label className="admin-label">Pendiente</label><input className="admin-input" value={form.title} onChange={set('title')} placeholder="ej. Servicio al museo solicitado por Dirección" required /></div>
          <div className="md:col-span-2">
            <label className="admin-label">Tipo</label>
            <select className="admin-select" value={form.category} onChange={set('category')}>{AGENDA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div><label className="admin-label">Fecha</label><input type="date" className="admin-input" value={form.date} onChange={set('date')} required /></div>
          <div><label className="admin-label">Hora</label><input type="time" className="admin-input" value={form.time} onChange={set('time')} required /></div>
          <div className="md:col-span-4"><label className="admin-label">Notas</label><textarea rows={2} className="admin-input" value={form.notes} onChange={set('notes')} /></div>
        </div>
        {msg && <p className="text-xs text-red-700">{msg}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-admin-primary" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar a mi agenda'}</button>
          {editingId && <button type="button" className="btn-admin-ghost" onClick={() => { setEditingId(null); setForm(emptyForm()); setMsg(''); }}>Cancelar edición</button>}
        </div>
      </form>

      {open.length === 0 && done.length === 0 && <p className="text-sm text-navy-400">Tu agenda está vacía.</p>}
      <Section title="Vencidos" list={overdue} />
      <Section title="Por atender pronto (dentro de 24 h)" list={soon} />
      <Section title="Próximos" list={later} />
      <Section title="Hechos recientemente" list={done} />
    </div>
  );
}
