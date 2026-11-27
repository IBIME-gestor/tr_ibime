import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, Trash2 } from 'lucide-react';
import { Students } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';
import {
  listCalendar, saveCalendarDay, removeCalendarDay, studentAttends, normLevel, MODE_LABEL,
} from '../../firebase/schoolCalendar';
import { todayString } from '../../firebase/trips';

/**
 * Calendario escolar · días sin labores · solo admin
 *  · «Sin labores para todos»: no hay clases. Ese día no cuenta en los KPIs de
 *    operadores y nannies, y no se puede iniciar recorrido.
 *  · «Sin labores para algunos niveles»: la lista del operador sale sin esos niveles.
 *  · «Solo asisten algunos niveles»: la lista del operador sale solo con esos niveles
 *    (ej. mañana solo viene bachillerato).
 * Los niveles salen del campo «Nivel» de los alumnos.
 */
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (iso) => new Date(`${iso}T12:00:00`).getDay();
const fmt = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const MODES = [
  ['all', 'Sin labores para todos', 'No hay clases'],
  ['levels-off', 'Sin labores para algunos niveles', 'Esos niveles no asisten'],
  ['levels-only', 'Solo asisten algunos niveles', 'Los demás no asisten'],
];

export default function CalendarioEscolar() {
  const { profile } = useAuth();
  const [students, setStudents] = useState([]);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const tomorrow = addDays(todayString(), 1);
  const [from, setFrom] = useState(tomorrow);
  const [to, setTo] = useState(tomorrow);
  const [mode, setMode] = useState('all');
  const [levels, setLevels] = useState([]);
  const [reason, setReason] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [st, cal] = await Promise.all([Students.list(), listCalendar(addDays(todayString(), -7), addDays(todayString(), 365))]);
      setStudents(st || []); setDays(cal || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo cargar el calendario. ¿Ya publicaste las reglas de Firestore nuevas?');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Niveles tal como están capturados en los alumnos (con cuántos alumnos tiene cada uno).
  const levelOptions = useMemo(() => {
    const map = new Map();
    students.forEach((s) => {
      const key = normLevel(s.nivel);
      if (!key) return;
      const cur = map.get(key) || { label: String(s.nivel).trim(), n: 0 };
      cur.n += 1; map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [students]);
  const withoutLevel = students.filter((s) => !normLevel(s.nivel)).length;

  const toggleLevel = (label) => setLevels((p) => (p.includes(label) ? p.filter((x) => x !== label) : [...p, label]));
  const rule = { mode, levels };
  const attendingNow = useMemo(() => students.filter((s) => studentAttends(s, rule)).length, [students, mode, levels]); // eslint-disable-line react-hooks/exhaustive-deps

  const targetDates = useMemo(() => {
    const out = [];
    if (!from || !to || from > to) return out;
    for (let d = from, i = 0; d <= to && i < 120; d = addDays(d, 1), i += 1) {
      if (weekday(d) >= 1 && weekday(d) <= 5) out.push(d);
    }
    return out;
  }, [from, to]);

  async function save() {
    setMsg('');
    if (!targetDates.length) { setMsg('Elige un rango con al menos un día entre lunes y viernes.'); return; }
    if (mode !== 'all' && !levels.length) { setMsg('Marca al menos un nivel.'); return; }
    setSaving(true);
    try {
      for (const d of targetDates) await saveCalendarDay(d, { mode, levels, reason }, profile?.name || '');
      setMsg(`Guardado: ${targetDates.length} día(s). La lista del operador ya sale con este ajuste.`);
      setReason('');
      await load();
    } catch (e) { setMsg(e?.message || 'No se pudo guardar.'); }
    setSaving(false);
  }
  async function remove(d) {
    if (!window.confirm(`¿Quitar el ajuste del ${fmt(d.date)}? Ese día vuelve a ser normal.`)) return;
    try { await removeCalendarDay(d.date); await load(); } catch (e) { setMsg(e?.message || 'No se pudo quitar.'); }
  }

  return (
    <div className="page-fit flex flex-col gap-4">
      <div className="shrink-0">
        <h1 className="admin-h1 mb-1 flex items-center gap-2"><CalendarX2 size={22} /> Calendario escolar</h1>
        <p className="text-sm text-navy-400 max-w-3xl">
          Marca días sin labores, para todos o solo para algunos niveles. La lista del operador sale filtrada con quienes sí asisten y los días sin labores no cuentan en sus KPIs.
        </p>
      </div>
      {error && <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] gap-4">
        <div className="admin-card space-y-3 lg:overflow-y-auto lg:min-h-0 self-start lg:self-stretch">
          <p className="font-display font-semibold text-sm text-navy-800">Nuevo ajuste</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="admin-label">Desde</label><input type="date" className="admin-input" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></div>
            <div><label className="admin-label">Hasta</label><input type="date" className="admin-input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div>
            <label className="admin-label">¿Qué pasa ese día?</label>
            <div className="space-y-1.5">
              {MODES.map(([key, label, hint]) => (
                <label key={key} className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${mode === key ? 'border-navy-600 bg-navy-50' : 'border-navy-100'}`}>
                  <input type="radio" name="mode" className="mt-1" checked={mode === key} onChange={() => setMode(key)} />
                  <span className="text-sm"><b>{label}</b><span className="block text-[11px] text-navy-400">{hint}</span></span>
                </label>
              ))}
            </div>
          </div>
          {mode !== 'all' && (
            <div>
              <label className="admin-label">{mode === 'levels-only' ? 'Niveles que SÍ asisten' : 'Niveles SIN labores'}</label>
              {levelOptions.length ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {levelOptions.map((o) => (
                    <button
                      key={o.label} type="button" onClick={() => toggleLevel(o.label)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${levels.includes(o.label) ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-navy-700 border-navy-200 hover:bg-navy-50'}`}
                    >
                      {o.label} <span className="opacity-70">({o.n})</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-xs text-amber-700">Ningún alumno tiene capturado su «Nivel». Captúralo en Alumnos para poder filtrar por nivel.</p>}
              {withoutLevel > 0 && (
                <p className="text-[11px] text-navy-400 mt-1">{withoutLevel} alumno(s) sin nivel capturado: {mode === 'levels-only' ? 'no se incluyen' : 'sí asisten'} en este ajuste.</p>
              )}
            </div>
          )}
          <div><label className="admin-label">Motivo (opcional)</label><input className="admin-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Puente, consejo técnico, evento…" /></div>
          <p className="rounded-lg bg-navy-50 text-[11px] text-navy-600 px-3 py-2">
            {targetDates.length} día(s) hábil(es) en el rango. Con este ajuste asisten <b>{attendingNow}</b> de {students.length} alumnos.
          </p>
          <button type="button" className="btn-admin-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar ajuste'}</button>
          {msg && <p className="text-xs text-navy-600">{msg}</p>}
        </div>

        <div className="admin-card !p-0 flex flex-col min-h-0 min-w-0">
          <div className="shrink-0 p-4 border-b border-navy-100"><p className="font-display font-semibold text-sm text-navy-800">Días con ajuste ({days.length})</p></div>
          <div className="flex-1 min-h-0 overflow-auto divide-y divide-navy-100">
            {loading && <p className="p-4 text-sm text-navy-400">Cargando…</p>}
            {!loading && !days.length && <p className="p-6 text-center text-sm text-navy-400">No hay días con ajuste. Todos los días se consideran con labores.</p>}
            {days.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-24 shrink-0"><p className="text-sm font-semibold first-letter:uppercase">{fmt(d.date)}</p>{d.date < todayString() && <p className="text-[10px] text-navy-400">pasado</p>}</div>
                <div className="min-w-0 flex-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${d.mode === 'all' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{MODE_LABEL[d.mode]}</span>
                  {d.mode !== 'all' && <p className="text-xs text-navy-600 mt-0.5">{(d.levels || []).join(', ')}</p>}
                  {d.reason && <p className="text-[11px] text-navy-400">{d.reason}</p>}
                </div>
                <button type="button" className="link-danger shrink-0" onClick={() => remove(d)} aria-label="Quitar"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
