import { useEffect, useMemo, useState } from 'react';
import { Send, Search, X, Trash2, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Students, Routes, Schools } from '../../firebase/services';
import { NOTICE_TYPES, sendFamilyNotice, listSentNotices, countNoticeReads, deleteFamilyNotice } from '../../firebase/familyNotices';
import { PAYMENT_STATUSES } from './Students';
import { tsMs } from '../../utils/tripOrder';
import ScheduleField from '../../components/ScheduleField';
import { emptySchedule, scheduleDate, scheduleError, fmtWhen } from '../../utils/schedule';

/**
 * Avisos a familias (solo admin).
 * Se redacta un aviso, se elige a quién llega y las familias lo ven en la pestaña
 * «Avisos» del seguimiento (con su correo o el del alumno). Sirve para recordatorios
 * de pago, cambios de horario, etc.
 */
const emailOf = (s) => [s.parentEmail, s.studentEmail].map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@'));
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const TEMPLATES = {
  pago: {
    title: 'Recordatorio de pago del transporte',
    body: 'Estimada familia: les recordamos que tienen pendiente el pago del servicio de transporte escolar. Si ya lo realizaron, hagan caso omiso de este aviso; si tienen dudas, comuníquense con el plantel.',
  },
};

export default function AvisosFamilias() {
  const { profile, user } = useAuth();
  const [students, setStudents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [schools, setSchools] = useState([]);
  const [sent, setSent] = useState([]);
  const [reads, setReads] = useState({}); // noticeId -> conteo
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [type, setType] = useState('aviso');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState('all'); // all | school | routes | payment | students
  const [schoolId, setSchoolId] = useState('');
  const [routeIds, setRouteIds] = useState([]);
  const [payStatus, setPayStatus] = useState('desfase');
  const [picked, setPicked] = useState([]); // ids de alumnos
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [schedule, setSchedule] = useState(emptySchedule());

  async function load() {
    setLoading(true); setError('');
    try {
      const [st, ro, sc, se] = await Promise.all([Students.list(), Routes.list(), Schools.list(), listSentNotices()]);
      setStudents(st || []); setRoutes((ro || []).filter((r) => r.kind !== 'taller')); setSchools(sc || []); setSent(se || []);
    } catch (e) { setError(e?.message || 'No se pudieron cargar los datos.'); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const audience = useMemo(() => {
    let list = students;
    let label = 'Todas las familias';
    if (mode === 'school') { list = students.filter((s) => s.schoolId === schoolId); label = `Plantel: ${schools.find((x) => x.id === schoolId)?.name || ''}`; }
    if (mode === 'routes') { list = students.filter((s) => routeIds.includes(s.routeId)); label = `Rutas: ${routeIds.map((id) => routes.find((r) => r.id === id)?.name).filter(Boolean).join(', ')}`; }
    if (mode === 'payment') { list = students.filter((s) => (s.paymentStatus || 'al_corriente') === payStatus); label = `Pago: ${PAYMENT_STATUSES[payStatus]?.label || payStatus}`; }
    if (mode === 'students') { list = students.filter((s) => picked.includes(s.id)); label = `${list.length} alumno(s) elegido(s)`; }
    const emails = Array.from(new Set(list.flatMap(emailOf)));
    const noEmail = list.filter((s) => !emailOf(s).length);
    return { list, emails, noEmail, label };
  }, [students, mode, schoolId, routeIds, payStatus, picked, schools, routes]);

  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return students.filter((s) => `${s.name} ${s.matricula || ''}`.toLowerCase().includes(q) && !picked.includes(s.id)).slice(0, 8);
  }, [search, students, picked]);

  const canSend = title.trim() && body.trim() && audience.emails.length > 0 && !sending && !scheduleError(schedule);

  async function send() {
    if (!canSend) return;
    const when = scheduleDate(schedule);
    if (!window.confirm(when ? `«${title.trim()}» se programará para ${fmtWhen(when.getTime())}, para ${audience.emails.length} correo(s) de ${audience.list.length} alumno(s). ¿Programar?` : `Se enviará «${title.trim()}» a ${audience.emails.length} correo(s) de ${audience.list.length} alumno(s). ¿Enviar?`)) return;
    setSending(true); setError(''); setMsg('');
    try {
      await sendFamilyNotice({
        title, body, type, audienceLabel: audience.label, recipientEmails: audience.emails,
        studentCount: audience.list.length, createdByName: profile?.name || '', createdByUid: user?.uid || '', publishAt: when,
      });
      setMsg(when ? `Aviso programado para ${fmtWhen(when.getTime())}. Las familias lo verán en «Avisos» desde ese día y hora.` : 'Aviso enviado. Las familias lo verán en la pestaña «Avisos» del seguimiento.');
      setTitle(''); setBody(''); setSchedule(emptySchedule());
      setSent(await listSentNotices());
    } catch (e) { setError(e?.message || 'No se pudo enviar el aviso.'); }
    setSending(false);
  }

  async function showReads(id) {
    try { const n = await countNoticeReads(id); setReads((p) => ({ ...p, [id]: n })); } catch (e) { setError(e?.message || 'No se pudo contar.'); }
  }
  async function remove(id) {
    if (!window.confirm('¿Eliminar este aviso? Las familias dejarán de verlo.')) return;
    try { await deleteFamilyNotice(id); setSent((p) => p.filter((n) => n.id !== id)); } catch (e) { setError(e?.message || 'No se pudo eliminar.'); }
  }

  const modeBtn = (v, label) => (
    <button type="button" onClick={() => setMode(v)}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${mode === v ? 'bg-navy-800 text-white' : 'bg-white text-navy-600 border border-navy-100'}`}>{label}</button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-900">Avisos a familias</h1>
        <p className="text-sm text-navy-500 mt-1 max-w-3xl">
          Manda avisos y recordatorios (por ejemplo, de pago) a los tutores y alumnos. Los ven en la pestaña «Avisos» del seguimiento cuando entran con su correo.
        </p>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}
      {msg && <p className="rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm px-3 py-2">{msg}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <div className="admin-card space-y-3 text-sm">
          <p className="font-semibold text-navy-800">Nuevo aviso</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-navy-600">Tipo
              <select className="admin-input mt-1" value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(NOTICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              {type === 'pago' && <button type="button" className="btn-admin-ghost" onClick={() => { setTitle(TEMPLATES.pago.title); setBody(TEMPLATES.pago.body); }}>Usar plantilla de pago</button>}
            </div>
          </div>
          <label className="block text-xs text-navy-600">Título
            <input className="admin-input mt-1" maxLength={90} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-xs text-navy-600">Mensaje
            <textarea className="admin-input mt-1" rows={5} maxLength={700} value={body} onChange={(e) => setBody(e.target.value)} />
            <span className="text-navy-400">{body.length}/700</span>
          </label>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-navy-600">¿A quién le llega?</p>
            <div className="flex flex-wrap gap-2">
              {modeBtn('all', 'Todas las familias')}{modeBtn('school', 'Un plantel')}{modeBtn('routes', 'Rutas')}{modeBtn('payment', 'Por estatus de pago')}{modeBtn('students', 'Alumnos específicos')}
            </div>
            {mode === 'school' && (
              <select className="admin-input" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                <option value="">Elige un plantel…</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {mode === 'routes' && (
              <div className="max-h-40 overflow-y-auto space-y-1 border border-navy-100 rounded-lg p-2">
                {routes.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={routeIds.includes(r.id)} onChange={(e) => setRouteIds((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))} /> {r.name}
                  </label>
                ))}
              </div>
            )}
            {mode === 'payment' && (
              <select className="admin-input" value={payStatus} onChange={(e) => setPayStatus(e.target.value)}>
                {Object.entries(PAYMENT_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            )}
            {mode === 'students' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-3 text-navy-300" />
                  <input className="admin-input pl-8" placeholder="Buscar por nombre o matrícula" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {found.length > 0 && (
                  <ul className="border border-navy-100 rounded-lg divide-y divide-navy-50 text-xs">
                    {found.map((s) => <li key={s.id}><button type="button" className="w-full text-left px-2 py-1.5 hover:bg-navy-50" onClick={() => { setPicked((p) => [...p, s.id]); setSearch(''); }}>{s.name} · {s.matricula}</button></li>)}
                  </ul>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {picked.map((id) => {
                    const s = students.find((x) => x.id === id);
                    return <span key={id} className="inline-flex items-center gap-1 text-xs bg-navy-50 rounded-full pl-2.5 pr-1.5 py-1">{s?.name || id}<button type="button" onClick={() => setPicked((p) => p.filter((x) => x !== id))}><X size={12} /></button></span>;
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-700 space-y-1">
            <p><b>{audience.list.length}</b> alumno(s) · <b>{audience.emails.length}</b> correo(s) recibirán el aviso.</p>
            {audience.noEmail.length > 0 && (
              <p className="text-amber-800">
                {audience.noEmail.length} alumno(s) sin ningún correo registrado no lo recibirán: {audience.noEmail.slice(0, 6).map((s) => s.name).join(', ')}{audience.noEmail.length > 6 ? '…' : ''}.
              </p>
            )}
          </div>
          <ScheduleField value={schedule} onChange={setSchedule} />
          <button type="button" className="btn-admin-primary w-full" disabled={!canSend} onClick={send}>
            <Send size={14} className="inline mr-1" />{sending ? 'Guardando…' : schedule.mode === 'later' ? 'Programar aviso' : 'Enviar aviso'}
          </button>
        </div>

        <div className="admin-card space-y-2 text-sm">
          <p className="font-semibold text-navy-800">Avisos enviados {loading && <span className="text-xs text-navy-400">cargando…</span>}</p>
          <ul className="divide-y divide-navy-50">
            {sent.map((n) => (
              <li key={n.id} className="py-2.5 space-y-1">
                <p className="font-medium text-navy-900">{NOTICE_TYPES[n.type]?.icon} {n.title}</p>
                <p className="text-xs text-navy-500 whitespace-pre-line">{n.body}</p>
                {tsMs(n.publishAt) > Date.now() && <p className="text-xs font-semibold text-blue-700">Programado para {fmtWhen(tsMs(n.publishAt))}</p>}
                <p className="text-xs text-navy-400">{fmtDate(tsMs(n.createdAt))} · {n.audienceLabel} · {n.recipientCount} correo(s) · por {n.createdByName || '—'}</p>
                <div className="flex items-center gap-3 text-xs">
                  {reads[n.id] != null
                    ? <span className="text-navy-600">Leído por {reads[n.id]} de {n.recipientCount} correo(s)</span>
                    : <button type="button" className="link-action" onClick={() => showReads(n.id)}><Eye size={12} className="inline mr-1" />Ver cuántos lo leyeron</button>}
                  <button type="button" className="link-danger" onClick={() => remove(n.id)}><Trash2 size={12} className="inline" /> Eliminar</button>
                </div>
              </li>
            ))}
            {!sent.length && !loading && <li className="py-3 text-navy-400">Todavía no has enviado avisos.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
