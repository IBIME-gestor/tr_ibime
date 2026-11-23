import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, Clock, XCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Units } from '../../firebase/services';
import { submitEvidence, uploadEvidencePhoto } from '../../firebase/kpiTasks';
import useMyTasks from '../../hooks/useMyTasks';
import LoadingOverlay from '../../components/LoadingOverlay';
import { DriveImg } from '../../components/kpi/Photos';
import { todayStr } from '../../utils/kpiTasks';

const fmtDay = (date) => {
  if (date === todayStr()) return 'Hoy';
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
};

const STATE_UI = {
  pendiente: { text: 'Pendiente', cls: 'text-amber-700 bg-amber-50', Icon: Clock },
  rechazada: { text: 'Rechazada: repítela', cls: 'text-red-700 bg-red-50', Icon: XCircle },
  revision: { text: 'Enviada, en revisión', cls: 'text-sky-700 bg-sky-50', Icon: Clock },
  aprobada: { text: 'Aprobada', cls: 'text-green-700 bg-green-50', Icon: CheckCircle2 },
};

function TaskCard({ task, profile, units, cfg }) {
  const { ind, date, ev, state, late } = task;
  const [files, setFiles] = useState([]); // [{ file, url }]
  const [note, setNote] = useState('');
  const [unitId, setUnitId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const need = ind.kind === 'check' ? 0 : Math.max(1, Number(ind.photosRequired) || 1);
  const ui = STATE_UI[state];
  const canSend = state === 'pendiente' || state === 'rechazada';

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function onPick(e) {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    if (!picked.length) return;
    setFiles((cur) => [...cur, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, need));
  }
  function removeFile(i) {
    setFiles((cur) => { URL.revokeObjectURL(cur[i].url); return cur.filter((_, k) => k !== i); });
  }

  async function send() {
    setError('');
    if (need && files.length < need) { setError(`Faltan fotos: se piden ${need}.`); return; }
    if (ind.askUnit && !unitId) { setError('Elige la unidad.'); return; }
    if (need && !cfg?.url) { setError('Dirección aún no configura el envío de fotos. Avísales.'); return; }
    try {
      const photos = [];
      for (let i = 0; i < files.length; i += 1) {
        setBusy(`Subiendo foto ${i + 1} de ${files.length}…`);
        photos.push(await uploadEvidencePhoto(files[i].file, { indicatorName: ind.name, date, personName: profile.name, index: i }, cfg));
      }
      setBusy('Guardando…');
      await submitEvidence({
        indicator: ind, date,
        person: { id: profile.staffId, name: profile.name, role: profile.role },
        unitId, photos, note, onTime: !late,
      });
      setFiles([]); setNote('');
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo enviar. Revisa tu señal e intenta de nuevo.');
    }
    setBusy('');
  }

  return (
    <div className={`card space-y-2 ${state === 'rechazada' ? 'border border-red-200' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-navy-900 flex items-center gap-1.5"><ClipboardCheck size={15} className="text-navy-400 shrink-0" />{ind.name}</p>
          <p className="text-[11px] text-navy-400">
            {fmtDay(date)}{ind.deadline ? ` · antes de las ${ind.deadline}` : ''}{late && state === 'pendiente' ? ' · atrasada' : ''}
          </p>
        </div>
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0 ${ui.cls}`}><ui.Icon size={12} />{ui.text}</span>
      </div>
      {ind.description && <p className="text-sm text-navy-600 whitespace-pre-line">{ind.description}</p>}
      {state === 'rechazada' && ev?.reviewNote && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">Motivo: {ev.reviewNote}</p>}

      {(state === 'revision' || state === 'aprobada') && ev?.photos?.length > 0 && (
        <div className="flex gap-2 flex-wrap">{ev.photos.map((p) => <DriveImg key={p.fileId} photo={p} width={200} className="w-20 h-20" />)}</div>
      )}

      {canSend && (
        <div className="space-y-2 pt-1">
          {ind.askUnit && (
            <select className="admin-select w-full" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">¿Qué unidad?</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.plate}{u.model ? ` · ${u.model}` : ''}</option>)}
            </select>
          )}
          {need > 0 && (
            <>
              <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPick} />
              <div className="flex gap-2 flex-wrap">
                {files.map((f, i) => (
                  <div key={f.url} className="relative">
                    <img src={f.url} alt="" className="w-20 h-20 object-cover rounded-lg" />
                    <button type="button" onClick={() => removeFile(i)} className="absolute -top-1.5 -right-1.5 bg-white rounded-full shadow p-0.5" aria-label="Quitar foto"><Trash2 size={13} className="text-red-600" /></button>
                  </div>
                ))}
                {files.length < need && (
                  <button type="button" onClick={() => inputRef.current?.click()} className="w-20 h-20 rounded-lg border-2 border-dashed border-navy-200 text-navy-500 flex flex-col items-center justify-center text-[11px] gap-1">
                    <Camera size={20} /> Tomar foto
                  </button>
                )}
              </div>
              <p className="text-[11px] text-navy-400">{files.length} de {need} foto{need === 1 ? '' : 's'}</p>
            </>
          )}
          <textarea className="admin-input !h-16 py-2" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="text-stop text-sm">{error}</p>}
          <button type="button" className="btn-go w-full" disabled={!!busy} onClick={send}>
            {busy || (need ? 'Enviar evidencia' : 'Marcar como realizada')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Tareas programadas por Dirección (p. ej. limpieza de la unidad) con evidencia en foto. */
export default function MyTasks() {
  const { profile } = useAuth();
  const { tasks, loading, cfg } = useMyTasks(profile);
  const [units, setUnits] = useState([]);
  useEffect(() => Units.subscribe(setUnits), []);

  if (loading) return <LoadingOverlay show label="Cargando tareas…" />;
  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-display font-bold text-lg text-navy-900">Mis tareas</h1>
        <p className="text-xs text-navy-400">Tareas que programa Dirección. Toma la foto en el momento y envíala.</p>
      </div>
      {tasks.length === 0 && <div className="card text-sm text-navy-400 text-center">No tienes tareas pendientes.</div>}
      {tasks.map((t) => <TaskCard key={t.key} task={t} profile={profile} units={units} cfg={cfg} />)}
    </div>
  );
}
