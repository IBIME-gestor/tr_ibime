import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Copy, Check, X, PauseCircle, PlayCircle, Camera, ClipboardCheck, Cloud, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { Units, Drivers } from '../../firebase/services';
import {
  KpiIndicators, listEvidenceBetween, reviewEvidence, removeEvidence, markManualEvidence, removeManualEvidence,
  getDriveConfig, saveDriveConfig, pingDrive,
} from '../../firebase/kpiTasks';
import { useAuth } from '../../context/AuthContext';
import Drawer from '../../components/Drawer';
import { DriveImg, PhotoLightbox } from '../../components/kpi/Photos';
import { cascadeStyle } from '../../utils/cascade';
import { WEEKDAYS, appliesToRole, scheduleText, scheduledDates, todayStr, EVIDENCE_STATES, stateOfEvidence } from '../../utils/kpiTasks';
import { norm, WEIGHTS } from '../../utils/staffKpis';
import { DRIVE_SCRIPT_SOURCE } from '../../utils/driveScriptSource';

function addDays(date, amount) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

const emptyForm = {
  name: '', description: '', appliesTo: 'ambos', kind: 'foto', photosRequired: 1, photoSource: 'camera', askUnit: true,
  scheduleType: 'weekly', days: [1, 2, 3, 4, 5], dates: [], startDate: '', deadline: '', weight: 10, active: true,
};
const APPLIES = { operador: 'Operadores', nanny: 'Nannies', ambos: 'Operadores y nannies' };
const fmtShort = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
/** Próximas fechas en que aparecerá la tarea (para que Dirección vea si realmente le va a salir a la gente). */
const nextDates = (ind, n = 5) => {
  const t = todayStr();
  return scheduledDates({ ...ind, startDate: ind.startDate && ind.startDate > t ? ind.startDate : t }, t, addDays(t, 60)).slice(0, n);
};

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
      photoSource: form.photoSource === 'both' ? 'both' : 'camera',
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
                <div><b>Próxima:</b> {r.active === false ? 'pausado' : (nextDates(r, 1)[0] ? fmtShort(nextDates(r, 1)[0]) : 'sin fechas próximas')}</div>
                <div><b>Evidencia:</b> {r.kind === 'foto' ? `${r.photosRequired} foto${r.photosRequired === 1 ? '' : 's'}${r.askUnit ? ' + unidad' : ''} · ${r.photoSource === 'both' ? 'cámara o galería' : 'solo cámara en vivo'}` : 'solo confirmar'}</div>
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
            <div>
              <label className="admin-label">¿De dónde puede tomar las fotos?</label>
              <select className="admin-select" value={form.photoSource === 'both' ? 'both' : 'camera'} onChange={(e) => setForm({ ...form, photoSource: e.target.value })}>
                <option value="camera">Solo cámara en tiempo real (sin galería)</option>
                <option value="both">Cámara o galería (dos botones: «Tomar foto» y «Galería»)</option>
              </select>
              <p className="text-[11px] text-navy-400 mt-1">Con «solo cámara» la app abre la cámara en vivo y no deja elegir fotos guardadas, para evitar fotos viejas o ajenas.</p>
            </div>
          )}
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
              <div className="flex flex-wrap gap-2 items-center">
                <button type="button" className="btn-admin-ghost !h-9 text-xs" onClick={() => setForm({ ...form, days: [1, 2, 3, 4, 5] })}>Lun–Vie</button>
                <button type="button" className="btn-admin-ghost !h-9 text-xs" onClick={() => setForm({ ...form, days: [0, 1, 2, 3, 4, 5, 6] })}>Todos los días</button>
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
            {(() => {
              const next = nextDates(form);
              const t = todayStr();
              return (
                <div className={`rounded-lg px-3 py-2 text-xs ${next.length ? 'bg-sky-50 text-sky-900' : 'bg-amber-50 text-amber-900'}`}>
                  {next.length === 0
                    ? 'Con esta programación la tarea no le aparecerá a nadie en los próximos 60 días. Revisa los días o la fecha de inicio.'
                    : <>Les aparecerá {next[0] === t ? <b>hoy</b> : <>por primera vez el <b>{fmtShort(next[0])}</b> (hoy no está programada)</>}. Próximas fechas: {next.map(fmtShort).join(' · ')}.</>}
                </div>
              );
            })()}
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
              ) : <p className="text-xs text-navy-400">{r.manual ? 'Marcada a mano por Dirección.' : 'Sin fotos (solo confirmación).'}</p>}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full px-2 py-0.5" style={{ background: `${EVIDENCE_STATES[stateOfEvidence({ ...r, status: r.status === 'rechazada' ? 'rechazada' : 'aprobada' })].color}1f` }}>
                  {r.onTime === false ? 'Entregada tarde' : 'Entregada a tiempo'}
                </span>
                {r.manual && <span className="rounded-full px-2 py-0.5 bg-amber-100 text-amber-800 font-bold">Captura manual</span>}
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
/*  Pestaña: captura manual (Dirección marca la tarea como cumplida)    */
/* ------------------------------------------------------------------ */
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Calendario de un mes donde se pueden elegir varios días. */
function MultiDayCalendar({ month, onMonth, selected, onToggle, scheduled, marks, maxDate }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1, 12);
  const lead = (first.getDay() + 6) % 7; // lunes = 0
  const daysIn = new Date(y, m, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (n) => {
    const d = new Date(y, m - 1 + n, 1, 12);
    onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-2">
        <button type="button" className="btn-admin-ghost !h-8 !px-2" onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft size={16} /></button>
        <p className="text-sm font-bold text-navy-800 capitalize">{MONTHS[m - 1]} {y}</p>
        <button type="button" className="btn-admin-ghost !h-8 !px-2" onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-navy-400 mb-1">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />;
          const on = selected.has(date);
          const future = date > maxDate;
          const mark = marks.get(date);
          return (
            <button
              key={date} type="button" disabled={future} onClick={() => onToggle(date)}
              title={mark ? `${mark.label}` : scheduled.has(date) ? 'Día programado' : ''}
              className={`relative h-10 rounded-lg text-sm font-semibold border transition-colors ${
                on ? 'bg-navy-700 text-white border-navy-700' : future ? 'bg-navy-50 text-navy-300 border-transparent cursor-not-allowed' : scheduled.has(date) ? 'bg-sky-50 text-navy-800 border-sky-200 hover:bg-sky-100' : 'bg-white text-navy-600 border-navy-100 hover:bg-navy-50'
              }`}
            >
              {Number(date.slice(8))}
              {mark && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style={{ background: on ? '#fff' : mark.color }} />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-navy-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-50 border border-sky-200" /> programado</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-600" /> ya cumplido</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-600" /> rechazado</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> en revisión</span>
      </div>
    </div>
  );
}

function ManualTab() {
  const { profile } = useAuth();
  const [indicators, setIndicators] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [indicatorId, setIndicatorId] = useState('');
  const [picked, setPicked] = useState(() => new Set()); // ids de personas
  const [dates, setDates] = useState(() => new Set());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [mode, setMode] = useState('marcar'); // 'marcar' | 'quitar'
  const [onTime, setOnTime] = useState(true);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [existing, setExisting] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => KpiIndicators.subscribe(setIndicators), []);
  useEffect(() => Drivers.subscribe(setDrivers), []);

  const indicator = useMemo(() => indicators.find((i) => i.id === indicatorId) || null, [indicators, indicatorId]);

  /* Personas a las que aplica el indicador elegido */
  const people = useMemo(() => drivers
    .filter((d) => d.role !== 'cashier' && d.active !== false)
    .filter((d) => {
      if (!indicator) return true;
      return indicator.appliesTo === 'ambos' || (indicator.appliesTo === 'nanny' ? d.role === 'nanny' : d.role !== 'nanny');
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name))), [drivers, indicator]);

  const shownPeople = useMemo(() => {
    const q = norm(search);
    return q ? people.filter((p) => norm(p.name).includes(q)) : people;
  }, [people, search]);

  /* Si cambia el indicador, se quitan las personas que ya no aplican */
  useEffect(() => {
    setPicked((cur) => new Set([...cur].filter((id) => people.some((p) => p.id === id))));
  }, [people]);

  /* Evidencias existentes del mes que se ve (para marcar el calendario y no duplicar) */
  const loadExisting = useCallback(async () => {
    if (!indicatorId) { setExisting(new Map()); return; }
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    try {
      const rows = await listEvidenceBetween(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`);
      setExisting(new Map(rows.filter((r) => r.indicatorId === indicatorId).map((r) => [r.id, r])));
    } catch (e) { console.error(e); setExisting(new Map()); }
  }, [indicatorId, month]);
  useEffect(() => { loadExisting(); }, [loadExisting]);

  const scheduled = useMemo(() => {
    if (!indicator) return new Set();
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return new Set(scheduledDates(indicator, `${month}-01`, `${month}-${String(last).padStart(2, '0')}`));
  }, [indicator, month]);

  /* Marca del calendario: estado de la evidencia de la(s) persona(s) elegida(s) */
  const marks = useMemo(() => {
    const out = new Map();
    if (!picked.size) return out;
    const ids = [...picked];
    [...existing.values()].filter((e) => picked.has(e.personId)).forEach((e) => {
      const st = stateOfEvidence(e);
      const cur = out.get(e.date) || { n: 0 };
      const color = st === 'rechazada' ? '#dc2626' : st === 'revision' ? '#2E86D6' : '#16a34a';
      out.set(e.date, { n: cur.n + 1, color: cur.color && cur.color !== color ? '#f59e0b' : color, label: `${cur.n + 1} de ${ids.length} con evidencia` });
    });
    return out;
  }, [existing, picked]);

  const today = todayStr();
  const togglePerson = (id) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleDate = (d) => setDates((cur) => { const n = new Set(cur); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  const allShownPicked = shownPeople.length > 0 && shownPeople.every((p) => picked.has(p.id));
  const toggleAll = () => setPicked((cur) => {
    const n = new Set(cur);
    shownPeople.forEach((p) => { if (allShownPicked) n.delete(p.id); else n.add(p.id); });
    return n;
  });
  const monthDays = () => {
    const [y, m] = month.split('-').map(Number);
    return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter((d) => d <= today);
  };

  const sortedDates = [...dates].sort();
  const chosenPeople = people.filter((p) => picked.has(p.id));
  const total = chosenPeople.length * sortedDates.length;
  const ready = !!indicator && total > 0 && !busy;

  async function run() {
    if (!ready) return;
    setMsg(null);
    const what = mode === 'marcar'
      ? `Marcar «${indicator.name}» como cumplida${onTime ? '' : ' (tarde)'} para ${chosenPeople.length} persona(s) en ${sortedDates.length} día(s) (${total} registros). Cuenta en su calificación.`
      : `Quitar las marcas manuales de «${indicator.name}» para ${chosenPeople.length} persona(s) en ${sortedDates.length} día(s). Lo que enviaron ellas mismas no se toca.`;
    if (!window.confirm(`${what}\n\n¿Continuar?`)) return;
    setBusy(true);
    try {
      if (mode === 'marcar') {
        // Los días elegidos pueden caer en otros meses: se leen las evidencias de todo el rango
        const rows = await listEvidenceBetween(sortedDates[0], sortedDates[sortedDates.length - 1]);
        const ex = new Map(rows.filter((r) => r.indicatorId === indicator.id).map((r) => [r.id, r]));
        const n = await markManualEvidence({
          indicator, people: chosenPeople.map((p) => ({ id: p.id, name: p.name, role: p.role })),
          dates: sortedDates, onTime, note: note.trim(), byName: profile?.name, existing: ex,
        });
        setMsg({ ok: true, text: n ? `Listo: ${n} registro(s) marcados como cumplidos.` : 'Todo eso ya estaba cumplido; no hubo cambios.' });
      } else {
        const rows = await listEvidenceBetween(sortedDates[0], sortedDates[sortedDates.length - 1]);
        const ids = rows
          .filter((r) => r.indicatorId === indicator.id && r.manual === true && picked.has(r.personId) && dates.has(r.date))
          .map((r) => r.id);
        const n = await removeManualEvidence(ids);
        setMsg({ ok: true, text: n ? `Listo: se quitaron ${n} marca(s) manual(es).` : 'No había marcas manuales en esos días.' });
      }
      setDates(new Set());
      await loadExisting();
    } catch (e) {
      console.error(e);
      setMsg({ ok: false, text: e?.message || 'No se pudo guardar. Revisa tu conexión (y que las reglas de Firestore estén publicadas).' });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-500 max-w-3xl">
        Úsalo cuando alguien sí hizo la tarea pero no pudo registrarla (sin red, sin señal, falla del teléfono…). Elige el indicador, las personas y los días del calendario;
        queda como <b>aprobada</b>, cuenta en su calificación y se distingue como «manual».
      </p>

      <div className="admin-card !p-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px]">
          <label className="admin-label">Indicador</label>
          <select className="admin-select" value={indicatorId} onChange={(e) => { setIndicatorId(e.target.value); setDates(new Set()); setMsg(null); }}>
            <option value="">Elige un indicador…</option>
            {indicators.map((i) => <option key={i.id} value={i.id}>{i.name}{i.active === false ? ' (pausado)' : ''}</option>)}
          </select>
        </div>
        <div className="flex rounded-lg border border-navy-200 overflow-hidden" role="tablist" aria-label="Acción">
          {[['marcar', 'Marcar cumplida'], ['quitar', 'Quitar marca manual']].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setMsg(null); }}
              className={`h-10 px-3 text-sm font-bold ${mode === k ? 'bg-navy-700 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>{label}</button>
          ))}
        </div>
        {mode === 'marcar' && (
          <div className="flex rounded-lg border border-navy-200 overflow-hidden" role="tablist" aria-label="Puntualidad">
            {[[true, 'A tiempo (100 %)'], [false, 'Tarde (50 %)']].map(([k, label]) => (
              <button key={String(k)} type="button" role="tab" aria-selected={onTime === k} onClick={() => setOnTime(k)}
                className={`h-10 px-3 text-sm font-bold ${onTime === k ? 'bg-navy-700 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {!indicator ? (
        <div className="admin-card text-sm text-navy-500">Primero elige el indicador para ver a quién le aplica y qué días están programados.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Personas */}
          <section className="admin-card !p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-navy-800 flex items-center gap-1.5"><Users size={15} /> Personas <span className="text-navy-400 font-normal">({picked.size} de {people.length})</span></h3>
              <button type="button" className="btn-admin-ghost !h-8 text-xs" onClick={toggleAll}>{allShownPicked ? 'Quitar todas' : 'Elegir todas'}</button>
            </div>
            <input className="admin-input" placeholder="Buscar por nombre…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-[360px] overflow-y-auto divide-y divide-navy-50 rounded-lg border border-navy-100">
              {shownPeople.length === 0 && <p className="text-sm text-navy-400 p-3">Nadie coincide.</p>}
              {shownPeople.map((p) => (
                <label key={p.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-navy-50 ${picked.has(p.id) ? 'bg-sky-50' : ''}`}>
                  <input type="checkbox" className="w-4 h-4" checked={picked.has(p.id)} onChange={() => togglePerson(p.id)} />
                  <span className="text-sm font-semibold text-navy-800 flex-1 truncate">{p.name}</span>
                  <span className="text-[11px] text-navy-400">{p.role === 'nanny' ? 'Nannie' : 'Operador'}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Calendario */}
          <section className="admin-card !p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-navy-800 flex items-center gap-1.5"><CalendarDays size={15} /> Días <span className="text-navy-400 font-normal">({dates.size} elegido{dates.size === 1 ? '' : 's'})</span></h3>
              <div className="flex gap-1.5 flex-wrap">
                <button type="button" className="btn-admin-ghost !h-8 text-xs" onClick={() => setDates((cur) => new Set([...cur, ...[...scheduled].filter((d) => d <= today)]))}>Programados del mes</button>
                <button type="button" className="btn-admin-ghost !h-8 text-xs" onClick={() => setDates((cur) => new Set([...cur, ...monthDays()]))}>Todo el mes</button>
                <button type="button" className="btn-admin-ghost !h-8 text-xs" onClick={() => setDates(new Set())}>Limpiar</button>
              </div>
            </div>
            <MultiDayCalendar month={month} onMonth={setMonth} selected={dates} onToggle={toggleDate} scheduled={scheduled} marks={marks} maxDate={today} />
            {picked.size === 0 && <p className="text-[11px] text-navy-400">Elige personas para ver en el calendario qué días ya tienen evidencia.</p>}
          </section>
        </div>
      )}

      {indicator && (
        <div className="admin-card !p-4 space-y-3">
          {mode === 'marcar' && (
            <div>
              <label className="admin-label">Motivo / nota (opcional, la ve la persona)</label>
              <input className="admin-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sin red ese día; Dirección lo confirmó" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={mode === 'marcar' ? 'btn-admin-primary' : 'btn-admin-ghost text-red-600'} disabled={!ready} onClick={run}>
              {busy ? 'Guardando…' : mode === 'marcar' ? <><CheckSquare size={16} /> Marcar como cumplida</> : <><Trash2 size={15} /> Quitar marcas manuales</>}
            </button>
            <p className="text-sm text-navy-500">
              {total ? <>{chosenPeople.length} persona(s) × {sortedDates.length} día(s) = <b>{total}</b> registro(s)</> : 'Elige al menos una persona y un día.'}
            </p>
          </div>
          {msg && <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pestaña: galería de lo que se califica                              */
/* ------------------------------------------------------------------ */
const BASE_INFO = {
  cumplimiento: ['Recorridos que la persona inició y llegaron a cerrarse (cerrados ÷ iniciados).', ClipboardCheck],
  cierrePropio: ['De los recorridos cerrados, cuántos cerró la propia persona y no Dirección.', Check],
  duracion: 'Tiempo del recorrido contra el promedio de la misma ruta y turno. Hasta 5 % más lento = 100 %; 50 % más lento = 0 %.',
  km: 'Odómetro sin huecos (más de 100 km entre recorridos de la unidad) ni km final menor al inicial.',
  sinCorrecciones: 'Recorridos que Dirección no tuvo que corregir después de cerrados.',
  resueltos: 'Alumnos presentes que la nannie sí atendió (marcó) antes de cerrar.',
};
const baseText = (key) => (Array.isArray(BASE_INFO[key]) ? BASE_INFO[key][0] : BASE_INFO[key]);

function WhatIsGradedTab() {
  const [indicators, setIndicators] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [personId, setPersonId] = useState('');
  useEffect(() => KpiIndicators.subscribe(setIndicators), []);
  useEffect(() => Drivers.subscribe(setDrivers), []);

  const staff = useMemo(() => drivers.filter((d) => d.role !== 'cashier').sort((a, b) => String(a.name).localeCompare(String(b.name))), [drivers]);
  const person = staff.find((d) => d.id === personId) || null;

  /* Criterios de un rol: base + indicadores activos, con el peso real que tendrían (suman 100) */
  const criteriaFor = (role) => {
    const base = WEIGHTS[role].map((c) => ({ key: c.key, label: c.label, weight: c.weight, text: baseText(c.key), custom: false }));
    const custom = indicators.filter((i) => appliesToRole(i, role)).map((i) => ({
      key: i.id, label: i.name, weight: Number(i.weight) || 10, custom: true,
      text: `${i.description || 'Tarea con evidencia.'} · ${scheduleText(i)}${i.deadline ? ` · antes de las ${i.deadline}` : ''} · ${i.kind === 'foto' ? `${i.photosRequired} foto(s), ${i.photoSource === 'both' ? 'cámara o galería' : 'solo cámara en vivo'}` : 'solo confirmar'}`,
    }));
    const all = [...base, ...custom];
    const total = all.reduce((n, c) => n + c.weight, 0) || 1;
    return all.map((c) => ({ ...c, pct: (c.weight / total) * 100 }));
  };

  const Block = ({ title, role }) => (
    <section className="admin-card !p-4 space-y-3">
      <h3 className="text-sm font-bold text-navy-800">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {criteriaFor(role).map((c) => (
          <div key={c.key} className={`rounded-lg border p-3 ${c.custom ? 'border-sky-200 bg-sky-50' : 'border-navy-100 bg-white'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-navy-900">{c.label}</p>
              <span className="text-xs font-bold tabular-nums rounded-full bg-navy-700 text-white px-2 py-0.5 shrink-0">{c.pct.toFixed(1)} %</span>
            </div>
            <p className="text-[11px] text-navy-400 mt-0.5">{c.custom ? 'Indicador tuyo (tarea con evidencia)' : 'Automático, sale de los recorridos'}</p>
            <p className="text-xs text-navy-600 mt-1.5">{c.text}</p>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-500 max-w-3xl">
        Aquí ves exactamente qué se le califica a cada rol y cuánto pesa cada cosa. Lo automático sale de los recorridos; los indicadores tuyos se suman y el resto se reparte para que todo sume 100 %.
        Si pausas o creas un indicador, los porcentajes se ajustan solos.
      </p>

      <div className="admin-card !p-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[240px]">
          <label className="admin-label">Ver qué se le califica a una persona</label>
          <select className="admin-select" value={personId} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">— Ver por rol —</option>
            {staff.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.role === 'nanny' ? 'Nannie' : 'Operador'}</option>)}
          </select>
        </div>
      </div>

      {person ? (
        <Block title={`${person.name} — ${person.role === 'nanny' ? 'Nannie' : 'Operador'}`} role={person.role === 'nanny' ? 'nanny' : 'operador'} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Block title="Operadores" role="operador" />
          <Block title="Nannies" role="nanny" />
        </div>
      )}

      <section className="admin-card !p-4">
        <h3 className="text-sm font-bold text-navy-800 mb-2">Indicadores tuyos y a quién se asignan</h3>
        {indicators.length === 0 ? <p className="text-sm text-navy-400">Aún no hay indicadores personalizados.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-navy-400 border-b border-navy-100">
                <th className="py-1.5 pr-3">Indicador</th><th className="py-1.5 pr-3">Aplica a</th><th className="py-1.5 pr-3">Personas</th><th className="py-1.5 pr-3">Cuándo</th><th className="py-1.5">Estado</th>
              </tr></thead>
              <tbody>
                {indicators.map((i) => (
                  <tr key={i.id} className="border-b border-navy-50">
                    <td className="py-1.5 pr-3 font-semibold text-navy-800">{i.name}</td>
                    <td className="py-1.5 pr-3">{APPLIES[i.appliesTo]}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{staff.filter((d) => i.appliesTo === 'ambos' || (i.appliesTo === 'nanny' ? d.role === 'nanny' : d.role !== 'nanny')).length}</td>
                    <td className="py-1.5 pr-3 text-navy-500">{scheduleText(i)}</td>
                    <td className="py-1.5">{i.active === false ? 'Pausado (no se califica)' : 'Activo'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
  const tabs = [['indicadores', 'Indicadores'], ['revision', 'Revisión de evidencias'], ['manual', 'Captura manual'], ['calificacion', '¿Qué se califica?'], ['drive', 'Conexión con Drive']];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="admin-h1">Indicadores y tareas</h1>
        <p className="text-sm text-navy-400 mt-1">Programa tareas con evidencia en foto para operadores y nannies, revísalas, captúralas a mano si hace falta y úsalas en sus KPIs.</p>
      </div>
      <div className="flex rounded-lg border border-navy-200 overflow-hidden w-fit max-w-full overflow-x-auto" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-10 px-4 text-sm font-bold whitespace-nowrap ${tab === k ? 'bg-navy-700 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>{label}</button>
        ))}
      </div>
      {tab === 'indicadores' && <IndicatorsTab />}
      {tab === 'revision' && <ReviewTab />}
      {tab === 'manual' && <ManualTab />}
      {tab === 'calificacion' && <WhatIsGradedTab />}
      {tab === 'drive' && <DriveTab />}
    </div>
  );
}
