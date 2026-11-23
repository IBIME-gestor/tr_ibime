import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Copy, Check, X, PauseCircle, PlayCircle, Camera, ClipboardCheck, Cloud } from 'lucide-react';
import { Units, Drivers } from '../../firebase/services';
import {
  KpiIndicators, listEvidenceBetween, reviewEvidence, removeEvidence,
  getDriveConfig, saveDriveConfig, pingDrive,
} from '../../firebase/kpiTasks';
import { useAuth } from '../../context/AuthContext';
import Drawer from '../../components/Drawer';
import { DriveImg, PhotoLightbox } from '../../components/kpi/Photos';
import { cascadeStyle } from '../../utils/cascade';
import { WEEKDAYS, scheduleText, todayStr, EVIDENCE_STATES, stateOfEvidence } from '../../utils/kpiTasks';
import { DRIVE_SCRIPT_SOURCE } from '../../utils/driveScriptSource';

function addDays(date, amount) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

const emptyForm = {
  name: '', description: '', appliesTo: 'operador', kind: 'foto', photosRequired: 1, askUnit: true,
  scheduleType: 'weekly', days: [1], dates: [], startDate: '', deadline: '', weight: 10, active: true,
};
const APPLIES = { operador: 'Operadores', nanny: 'Nannies', ambos: 'Operadores y nannies' };

/* ------------------------------------------------------------------ */
/*  Pestaña 1: catálogo de indicadores                                  */
/* ------------------------------------------------------------------ */
function IndicatorsTab() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [dateInput, setDateInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => KpiIndicators.subscribe(setRows), []);

  function openNew() { setForm({ ...emptyForm, startDate: todayStr() }); setEditingId(null); setError(''); setOpen(true); }
  function openEdit(r) { setForm({ ...emptyForm, ...r }); setEditingId(r.id); setError(''); setOpen(true); }

  function toggleDay(n) {
    setForm((f) => ({ ...f, days: f.days.includes(n) ? f.days.filter((d) => d !== n) : [...f.days, n] }));
  }
  function addDate() {
    if (!dateInput) return;
    setForm((f) => ({ ...f, dates: [...new Set([...(f.dates || []), dateInput])].sort() }));
    setDateInput('');
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Ponle un nombre al indicador.'); return; }
    if (form.scheduleType === 'weekly' && !form.days.length) { setError('Elige al menos un día de la semana.'); return; }
    if (form.scheduleType === 'dates' && !(form.dates || []).length) { setError('Agrega al menos una fecha.'); return; }
    const data = {
      name: form.name.trim(), description: form.description.trim(), appliesTo: form.appliesTo, kind: form.kind,
      photosRequired: form.kind === 'foto' ? Math.max(1, Math.min(6, Number(form.photosRequired) || 1)) : 0,
      askUnit: !!form.askUnit, scheduleType: form.scheduleType,
      days: form.scheduleType === 'weekly' ? form.days : [], dates: form.scheduleType === 'dates' ? form.dates : [],
      startDate: form.startDate || '', deadline: form.deadline || '', weight: Math.max(1, Number(form.weight) || 1), active: form.active !== false,
    };
    try {
      if (editingId) await KpiIndicators.update(editingId, data); else await KpiIndicators.create(data);
      setOpen(false);
    } catch (err) { console.error(err); setError(err?.message || 'No se pudo guardar.'); }
  }

  async function remove(r) {
    if (window.confirm(`¿Eliminar «${r.name}»? Las evidencias ya enviadas se conservan, pero el indicador deja de calificarse.`)) await KpiIndicators.remove(r.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500 max-w-2xl">
          Crea los indicadores que quieras medir. Los que pidan evidencia aparecen en la app del operador (sección «Mis tareas») solo en los días que programes,
          y entran a su calificación en el módulo de KPIs.
        </p>
        <button type="button" className="btn-admin-primary" onClick={openNew}><Plus size={16} /> Nuevo indicador</button>
      </div>

      {rows.length === 0 ? (
        <div className="admin-card text-sm text-navy-500">Aún no hay indicadores. Ejemplo: «Limpieza de unidad», foto, lunes y jueves, antes de las 7:00.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <div key={r.id} className={`cascade-item admin-card !p-4 ${r.active === false ? 'opacity-60' : ''}`} style={cascadeStyle(i)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-navy-900 flex items-center gap-1.5">{r.kind === 'foto' ? <Camera size={15} /> : <ClipboardCheck size={15} />}{r.name}</p>
                  <p className="text-xs text-navy-400">{APPLIES[r.appliesTo]} · peso {r.weight}</p>
                </div>
                {r.active === false && <span className="text-[10px] font-bold bg-navy-100 text-navy-600 rounded-full px-2 py-0.5">PAUSADO</span>}
              </div>
              {r.description && <p className="text-sm text-navy-600 mt-2 line-clamp-3">{r.description}</p>}
              <dl className="text-xs text-navy-500 mt-3 space-y-0.5">
                <div><b>Cuándo:</b> {scheduleText(r)}{r.deadline ? ` · antes de las ${r.deadline}` : ''}</div>
                <div><b>Evidencia:</b> {r.kind === 'foto' ? `${r.photosRequired} foto${r.photosRequired === 1 ? '' : 's'}${r.askUnit ? ' + unidad' : ''}` : 'solo confirmar'}</div>
              </dl>
              <div className="flex gap-2 mt-3 pt-3 border-t border-navy-100">
                <button type="button" className="btn-admin-ghost !h-8 !px-3 text-xs" onClick={() => openEdit(r)}><Pencil size={13} /> Editar</button>
                <button type="button" className="btn-admin-ghost !h-8 !px-3 text-xs" onClick={() => KpiIndicators.update(r.id, { active: r.active === false })}>
                  {r.active === false ? <><PlayCircle size={13} /> Activar</> : <><PauseCircle size={13} /> Pausar</>}
                </button>
                <button type="button" className="btn-admin-ghost !h-8 !px-3 text-xs ml-auto text-red-600" onClick={() => remove(r)} aria-label="Eliminar"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} title={editingId ? 'Editar indicador' : 'Nuevo indicador'} size="md">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="admin-label">Nombre</label>
            <input className="admin-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Limpieza de unidad" />
          </div>
          <div>
            <label className="admin-label">Instrucciones para la persona</label>
            <textarea className="admin-input !h-24 py-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Toma una foto del interior de la unidad ya limpia, con los asientos visibles." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="admin-label">Aplica a</label>
              <select className="admin-select" value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}>
                {Object.entries(APPLIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="admin-label">Peso en la calificación</label>
              <input type="number" min="1" max="100" className="admin-input" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="admin-label">Evidencia</label>
              <select className="admin-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="foto">Foto(s)</option>
                <option value="check">Solo confirmar que se hizo</option>
              </select>
            </div>
            {form.kind === 'foto' && (
              <div>
                <label className="admin-label">Fotos requeridas</label>
                <input type="number" min="1" max="6" className="admin-input" value={form.photosRequired} onChange={(e) => setForm({ ...form, photosRequired: e.target.value })} />
              </div>
            )}
          </div>
          {form.kind === 'foto' && (
            <label className="flex items-center gap-2 text-sm text-navy-700">
              <input type="checkbox" checked={!!form.askUnit} onChange={(e) => setForm({ ...form, askUnit: e.target.checked })} /> Pedir que elija la unidad (para ver las fotos por unidad)
            </label>
          )}

          <fieldset className="rounded-lg border border-navy-100 p-3 space-y-3">
            <legend className="text-xs font-semibold text-navy-400 px-1">Programación</legend>
            <div className="flex rounded-lg border border-navy-200 overflow-hidden w-fit">
              {[['weekly', 'Días de la semana'], ['dates', 'Fechas específicas']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setForm({ ...form, scheduleType: k })} className={`h-9 px-3 text-sm font-semibold ${form.scheduleType === k ? 'bg-navy-700 text-white' : 'bg-white text-navy-600'}`}>{label}</button>
              ))}
            </div>
            {form.scheduleType === 'weekly' ? (
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => (
                  <button key={d.n} type="button" onClick={() => toggleDay(d.n)} className={`w-12 h-9 rounded-lg text-sm font-bold border ${form.days.includes(d.n) ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-navy-600 border-navy-200'}`}>{d.label}</button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input type="date" className="admin-input" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
                  <button type="button" className="btn-admin-ghost" onClick={addDate}>Agregar</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(form.dates || []).map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full bg-navy-50 text-navy-700 text-xs px-2 py-1">
                      {d}<button type="button" onClick={() => setForm({ ...form, dates: form.dates.filter((x) => x !== d) })} aria-label="Quitar"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="admin-label">Empieza a medirse el</label>
                <input type="date" className="admin-input" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label className="admin-label">Hora límite (opcional)</label>
                <input type="time" className="admin-input" value={form.deadline || ''} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
              </div>
            </div>
            <p className="text-[11px] text-navy-400">Lo entregado después de la hora límite o de un día posterior cuenta como «tarde» (50 %).</p>
          </fieldset>

          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-admin-primary flex-1">Guardar</button>
            <button type="button" className="btn-admin-ghost" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pestaña 2: revisión de evidencias                                   */
/* ------------------------------------------------------------------ */
function ReviewTab() {
  const { profile } = useAuth();
  const [from, setFrom] = useState(addDays(todayStr(), -14));
  const [to, setTo] = useState(todayStr());
  const [status, setStatus] = useState('revision');
  const [indicatorId, setIndicatorId] = useState('');
  const [personId, setPersonId] = useState('');
  const [rows, setRows] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [units, setUnits] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => KpiIndicators.subscribe(setIndicators), []);
  useEffect(() => Units.subscribe(setUnits), []);
  useEffect(() => Drivers.subscribe(setDrivers), []);

  async function load() {
    if (from > to) return;
    setLoading(true);
    try { setRows(await listEvidenceBetween(from, to)); } catch (e) { console.error(e); setRows([]); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const unitsById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const shown = useMemo(() => rows
    .filter((r) => (status === 'todas' || r.status === status) && (!indicatorId || r.indicatorId === indicatorId) && (!personId || r.personId === personId))
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.personName).localeCompare(String(b.personName))), [rows, status, indicatorId, personId]);

  const gallery = useMemo(() => shown.flatMap((r) => (r.photos || []).map((photo) => ({
    photo, caption: `${r.indicatorName} · ${r.personName} · ${r.date}${r.unitId && unitsById.get(r.unitId) ? ` · ${unitsById.get(r.unitId).plate}` : ''}`, evId: r.id,
  }))), [shown, unitsById]);

  async function approve(r) {
    await reviewEvidence(r.id, 'aprobada', '', profile?.name);
    setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, status: 'aprobada' } : x)));
  }
  async function reject(r) {
    const reason = window.prompt('Motivo del rechazo (la persona lo verá y repetirá la tarea):', '');
    if (reason === null) return;
    await reviewEvidence(r.id, 'rechazada', reason, profile?.name);
    setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, status: 'rechazada', reviewNote: reason } : x)));
  }
  async function del(r) {
    if (!window.confirm('¿Borrar esta evidencia? La foto se queda en tu Drive.')) return;
    await removeEvidence(r.id);
    setRows((cur) => cur.filter((x) => x.id !== r.id));
  }

  const STATUS_CHIP = { revision: ['Por revisar', '#2E86D6'], aprobada: ['Aprobada', '#16a34a'], rechazada: ['Rechazada', '#dc2626'] };

  return (
    <div className="space-y-4">
      <div className="admin-card !p-3 flex flex-wrap items-end gap-3">
        <div><label className="admin-label">Desde</label><input type="date" className="admin-input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="admin-label">Hasta</label><input type="date" className="admin-input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="admin-label">Estado</label>
          <select className="admin-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="revision">Por revisar</option><option value="aprobada">Aprobadas</option><option value="rechazada">Rechazadas</option><option value="todas">Todas</option>
          </select>
        </div>
        <div>
          <label className="admin-label">Indicador</label>
          <select className="admin-select" value={indicatorId} onChange={(e) => setIndicatorId(e.target.value)}>
            <option value="">Todos</option>{indicators.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <label className="admin-label">Persona</label>
          <select className="admin-select" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Todas</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-navy-400">Cargando…</p>}
      {!loading && shown.length === 0 && <div className="admin-card text-sm text-navy-500">No hay evidencias con esos filtros.</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((r, i) => {
          const chip = STATUS_CHIP[r.status] || STATUS_CHIP.revision;
          const idxBase = gallery.findIndex((g) => g.evId === r.id);
          return (
            <div key={r.id} className="cascade-item admin-card !p-4 space-y-2" style={cascadeStyle(i, 35, 400)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-navy-900 truncate">{r.personName}</p>
                  <p className="text-xs text-navy-400 truncate">{r.indicatorName} · {r.date}{r.unitId && unitsById.get(r.unitId) ? ` · ${unitsById.get(r.unitId).plate}` : ''}</p>
                </div>
                <span className="text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0" style={{ background: `${chip[1]}1f`, color: chip[1] }}>{chip[0]}</span>
              </div>
              {(r.photos || []).length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {r.photos.map((p, k) => <DriveImg key={p.fileId} photo={p} width={400} className="w-full aspect-square" onClick={() => setLightbox(idxBase + k)} />)}
                </div>
              ) : <p className="text-xs text-navy-400">Sin fotos (solo confirmación).</p>}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full px-2 py-0.5" style={{ background: `${EVIDENCE_STATES[stateOfEvidence({ ...r, status: r.status === 'rechazada' ? 'rechazada' : 'aprobada' })].color}1f` }}>
                  {r.onTime === false ? 'Entregada tarde' : 'Entregada a tiempo'}
                </span>
              </div>
              {r.note && <p className="text-sm text-navy-600 bg-navy-50 rounded-lg px-3 py-2">“{r.note}”</p>}
              {r.status === 'rechazada' && r.reviewNote && <p className="text-xs text-red-700">Motivo: {r.reviewNote}</p>}
              <div className="flex gap-2 pt-2 border-t border-navy-100">
                {r.status !== 'aprobada' && <button type="button" className="btn-admin-primary !h-8 !px-3 text-xs" onClick={() => approve(r)}><Check size={13} /> Aprobar</button>}
                {r.status !== 'rechazada' && <button type="button" className="btn-admin-ghost !h-8 !px-3 text-xs text-red-600" onClick={() => reject(r)}><X size={13} /> Rechazar</button>}
                <button type="button" className="btn-admin-ghost !h-8 !px-3 text-xs ml-auto" onClick={() => del(r)} aria-label="Borrar"><Trash2 size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {lightbox != null && <PhotoLightbox items={gallery} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pestaña 3: conexión con Google Drive                                */
/* ------------------------------------------------------------------ */
function DriveTab() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { getDriveConfig().then((c) => { if (c) { setUrl(c.url || ''); setToken(c.token || ''); } }).catch(() => {}); }, []);

  async function save() {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url.trim())) { setMsg({ ok: false, text: 'La URL debe terminar en /exec (la que da Apps Script al implementar).' }); return; }
    if (!token.trim()) { setMsg({ ok: false, text: 'Falta la clave (token).' }); return; }
    setBusy('save');
    try { await saveDriveConfig({ url, token }); setMsg({ ok: true, text: 'Guardado.' }); } catch (e) { setMsg({ ok: false, text: e?.message || 'No se pudo guardar.' }); }
    setBusy('');
  }
  async function test() {
    setBusy('test'); setMsg(null);
    try { await pingDrive({ url: url.trim(), token: token.trim() }); setMsg({ ok: true, text: 'Conexión correcta: el script respondió y la clave coincide.' }); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'No se pudo conectar.' }); }
    setBusy('');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(DRIVE_SCRIPT_SOURCE); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sin permiso de portapapeles */ }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="admin-card space-y-3">
        <h2 className="font-bold text-navy-900 flex items-center gap-2"><Cloud size={17} /> Conexión</h2>
        <div><label className="admin-label">URL de la aplicación web (termina en /exec)</label><input className="admin-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></div>
        <div><label className="admin-label">Clave (token) — la misma que pusiste en el script</label><input className="admin-input" value={token} onChange={(e) => setToken(e.target.value)} /></div>
        <div className="flex gap-2">
          <button type="button" className="btn-admin-primary" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn-admin-ghost" disabled={!!busy || !url || !token} onClick={test}>{busy === 'test' ? 'Probando…' : 'Probar conexión'}</button>
        </div>
        {msg && <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
        <div className="text-xs text-navy-500 space-y-1 pt-2 border-t border-navy-100">
          <p><b>Cómo instalarlo (una sola vez):</b></p>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li>Entra a script.google.com con la cuenta de Google donde quieres guardar las fotos y crea un proyecto.</li>
            <li>Pega el código de la derecha y cambia <code>TOKEN</code> por una clave larga que inventes.</li>
            <li>Implementar → Nueva implementación → Aplicación web. Ejecutar como <b>Yo</b>; acceso: <b>Cualquier persona</b>. Autoriza los permisos de Drive.</li>
            <li>Copia la URL /exec y la clave aquí, guarda y presiona «Probar conexión».</li>
          </ol>
          <p>Las fotos quedan en tu Drive en «Ruta Segura - Evidencias / indicador / fecha». Cada foto se comparte como «cualquiera con el enlace puede ver», para que Dirección la vea aquí sin iniciar sesión en Google.</p>
        </div>
      </section>
      <section className="admin-card space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-navy-900">Código del script (Code.gs)</h2>
          <button type="button" className="btn-admin-ghost !h-8 text-xs" onClick={copy}>{copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}</button>
        </div>
        <pre className="text-[11px] leading-snug bg-navy-50 rounded-lg p-3 overflow-auto max-h-[460px] whitespace-pre-wrap">{DRIVE_SCRIPT_SOURCE}</pre>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export default function KpiIndicadores() {
  const [tab, setTab] = useState('indicadores');
  const tabs = [['indicadores', 'Indicadores'], ['revision', 'Revisión de evidencias'], ['drive', 'Conexión con Drive']];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="admin-h1">Indicadores y tareas</h1>
        <p className="text-sm text-navy-400 mt-1">Programa tareas con evidencia en foto para operadores y nannies, revísalas y úsalas en sus KPIs.</p>
      </div>
      <div className="flex rounded-lg border border-navy-200 overflow-hidden w-fit max-w-full overflow-x-auto" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-10 px-4 text-sm font-bold whitespace-nowrap ${tab === k ? 'bg-navy-700 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>{label}</button>
        ))}
      </div>
      {tab === 'indicadores' && <IndicatorsTab />}
      {tab === 'revision' && <ReviewTab />}
      {tab === 'drive' && <DriveTab />}
    </div>
  );
}
