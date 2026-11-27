import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, RefreshCw, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Students, Routes } from '../../firebase/services';
import { tallerDatesFor, todayString } from '../../firebase/trips';
import { syncStudentTaller } from '../../utils/tallerSync';

/**
 * Talleres (salida 17:30) · solo admin
 * Asigna alumnos a una RUTA DE TALLER (se crea en «Rutas» con tipo Taller; cada
 * unidad/zona es una ruta con su propia lista, operador y tarifa).
 *
 * Dos modos:
 *  · FIJO       → se repite cada semana en los días elegidos (lun–vie).
 *  · ESPORÁDICO → solo en las fechas exactas que se marquen en el calendario.
 *
 *  · Si tiene registro en una ruta normal (completo, medio o diario) → SOLO se
 *    mueve su salida al taller: ya no aparece en la salida normal del operador
 *    NI en su lista de la ruta normal, se cuenta en el taller y no cambia lo que paga.
 *  · Si NO tiene registro en ruta normal (solo taller) → el taller es un viaje
 *    que se cobra por día, en la lista de la ruta de taller.
 *
 * Al guardar o quitar, las listas ya generadas se actualizan solas: no hay que
 * volver a generarlas en «Listas de alumnos».
 */

const DAYS = [
  { v: 1, n: 'Lun' }, { v: 2, n: 'Mar' }, { v: 3, n: 'Mié' }, { v: 4, n: 'Jue' }, { v: 5, n: 'Vie' },
];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const monthNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 7); };
const shortDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function weekdaysOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const out = [];
  const last = new Date(y, m, 0).getDate();
  for (let day = 1; day <= last; day += 1) {
    const wd = new Date(y, m - 1, day, 12).getDay();
    if (wd >= 1 && wd <= 5) out.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return out;
}
function serviceLabel(s) {
  if (!s.routeId) return 'Sin ruta normal (solo taller)';
  if (s.tipoServicio === 'medio') return `Medio (${s.medioServicio || 'entrada'})`;
  if (s.tipoServicio === 'diario') return `Diario (${s.medioServicio || 'entrada'})`;
  return 'Completo';
}
/** Resumen corto de cuándo va: «Fijo · Lun, Mar» o «Esporádico · 3 fechas». */
function whenLabel(s) {
  if (s.tallerModo === 'esporadico') {
    const f = [...(s.tallerFechas || [])].sort();
    return { kind: 'Esporádico', text: f.length ? f.map(shortDate).join(', ') : 'sin fechas' };
  }
  return { kind: 'Fijo', text: (s.tallerDias || []).map((d) => DAYS.find((x) => x.v === Number(d))?.n).filter(Boolean).join(', ') || 'sin días' };
}

/** Calendario lun–vie para marcar fechas sueltas (no deja marcar días ya pasados). */
function DatePicker({ value, onToggle }) {
  const minDate = todayString();
  const [month, setMonth] = useState(() => (value[0] || minDate).slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };

  const rows = useMemo(() => {
    const out = [];
    let row = Array(5).fill(null);
    const last = new Date(y, m, 0).getDate();
    for (let day = 1; day <= last; day += 1) {
      const wd = new Date(y, m - 1, day, 12).getDay();
      if (wd === 0 || wd === 6) {
        if (row.some(Boolean)) { out.push(row); row = Array(5).fill(null); }
      } else {
        row[wd - 1] = `${month}-${String(day).padStart(2, '0')}`;
      }
    }
    if (row.some(Boolean)) out.push(row);
    return out;
  }, [month, y, m]);

  return (
    <div className="rounded-lg border border-navy-100 p-2.5 bg-white">
      <div className="flex items-center justify-between mb-2">
        <button type="button" className="btn-admin-ghost !px-2 !py-1" onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft size={14} /></button>
        <p className="text-sm font-semibold text-navy-800 capitalize">{MONTHS[m - 1]} {y}</p>
        <button type="button" className="btn-admin-ghost !px-2 !py-1" onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight size={14} /></button>
      </div>
      <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-semibold text-navy-400 mb-1">
        {DAYS.map((d) => <span key={d.v}>{d.n}</span>)}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {rows.flat().map((iso, i) => {
          if (!iso) return <span key={`e${i}`} />;
          const on = value.includes(iso);
          const past = iso < minDate;
          return (
            <button
              key={iso}
              type="button"
              disabled={past}
              onClick={() => onToggle(iso)}
              className={`h-8 rounded-md text-xs font-semibold transition-colors ${
                on ? 'bg-navy-700 text-white' : past ? 'text-navy-200 cursor-not-allowed' : 'bg-navy-50 text-navy-700 hover:bg-navy-100'
              }`}
            >
              {Number(iso.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Talleres() {
  const [students, setStudents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(monthNow());
  const [filterRoute, setFilterRoute] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(null);
  const [tallerId, setTallerId] = useState('');
  const [modo, setModo] = useState('fijo');
  const [days, setDays] = useState([1, 2, 3, 4]);
  const [fechas, setFechas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [st, ro] = await Promise.all([Students.list(), Routes.list()]);
      setStudents(st || []); setRoutes(ro || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudieron cargar los datos.');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const routeById = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);
  const tallerRoutes = useMemo(() => routes.filter((r) => r.kind === 'taller'), [routes]);
  const dates = useMemo(() => weekdaysOfMonth(month), [month]);

  const matches = useMemo(() => {
    const q = norm(search).trim();
    if (q.length < 2) return [];
    return students.filter((s) => norm(`${s.name} ${s.matricula}`).includes(q)).slice(0, 8);
  }, [students, search]);

  const assigned = useMemo(() => students
    .filter((s) => s.tallerRouteId && (!filterRoute || s.tallerRouteId === filterRoute))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es')), [students, filterRoute]);

  function pick(s) {
    setPicked(s); setSearch('');
    setTallerId(s.tallerRouteId || tallerRoutes[0]?.id || '');
    setModo(s.tallerModo === 'esporadico' ? 'esporadico' : 'fijo');
    setDays(s.tallerDias?.length ? s.tallerDias.map(Number) : [1, 2, 3, 4]);
    setFechas([...(s.tallerFechas || [])].sort());
    setMsg('');
  }
  const toggleDay = (v) => setDays((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v].sort()));
  const toggleFecha = (iso) => setFechas((p) => (p.includes(iso) ? p.filter((x) => x !== iso) : [...p, iso].sort()));

  async function save() {
    if (!picked || !tallerId) { setMsg('Elige el alumno y la ruta de taller.'); return; }
    if (modo === 'fijo' && !days.length) { setMsg('Marca al menos un día de la semana.'); return; }
    if (modo === 'esporadico' && !fechas.length) { setMsg('Marca al menos una fecha en el calendario.'); return; }
    setSaving(true); setMsg('');
    try {
      const patch = {
        tallerRouteId: tallerId,
        tallerModo: modo,
        tallerDias: modo === 'fijo' ? days : [],
        tallerFechas: modo === 'esporadico' ? fechas : [],
      };
      await Students.update(picked.id, patch);
      const updatedLists = await syncStudentTaller({ ...picked, ...patch });
      setMsg(`Guardado: ${picked.name} → ${routeById[tallerId]?.name || 'taller'}.${updatedLists.length ? ` Se actualizaron ${updatedLists.length} lista(s): ${updatedLists.join(', ')}.` : ''}`);
      setPicked(null);
      await load();
    } catch (e) { setMsg(e?.message || 'No se pudo guardar.'); }
    setSaving(false);
  }
  async function remove(s) {
    if (!window.confirm(`¿Quitar a ${s.name} del taller? Su salida normal vuelve a aparecer en su ruta y en su lista. Las fechas ya pasadas no se modifican.`)) return;
    try {
      const patch = { tallerRouteId: '', tallerModo: 'fijo', tallerDias: [], tallerFechas: [] };
      await Students.update(s.id, patch);
      const updatedLists = await syncStudentTaller({ ...s, ...patch });
      setMsg(`${s.name} salió del taller.${updatedLists.length ? ` Se actualizaron ${updatedLists.length} lista(s).` : ''}`);
      await load();
    } catch (e) { setMsg(e?.message || 'No se pudo quitar.'); }
  }

  const effectNote = picked
    ? (picked.routeId
      ? `Esos días su salida de las 17:30 sale de ${routeById[picked.routeId]?.name || 'su ruta normal'} (operador y lista) y va al taller, sin cobro extra.`
      : 'No tiene ruta normal: cada día de taller se cobra como viaje por día en la lista de la ruta de taller.')
    : '';

  return (
    <div className="page-fit flex flex-col gap-4">
      <div className="shrink-0 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-h1 mb-1 flex items-center gap-2"><GraduationCap size={22} /> Talleres (salida 17:30)</h1>
          <p className="text-sm text-navy-400 max-w-3xl">
            Asigna alumnos a una ruta de taller, fijo (días de la semana) o esporádico (fechas sueltas). Las listas ya generadas se actualizan solas.
          </p>
        </div>
        <button type="button" className="btn-admin-ghost" onClick={load} disabled={loading}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
      </div>
      {error && <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      {!loading && tallerRoutes.length === 0 && (
        <p className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm px-3 py-2">
          Aún no hay rutas de taller. Créalas en <b>Rutas</b> eligiendo «Ruta de taller» (una por unidad o zona), con su operador y sus conceptos de cobro.
        </p>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] gap-4">
        {/* Columna izquierda: asignar */}
        <div className="admin-card space-y-3 lg:overflow-y-auto lg:min-h-0 self-start lg:self-stretch">
          <p className="font-display font-semibold text-sm text-navy-800">Asignar alumno a taller</p>
          {!picked ? (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
                <input className="admin-input pl-8" placeholder="Buscar alumno por nombre o matrícula" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {matches.length > 0 && (
                <ul className="border border-navy-100 rounded-lg divide-y divide-navy-100">
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-navy-50" onClick={() => pick(s)}>
                        <b>{s.name}</b> <span className="text-navy-400">({s.matricula || 'sin matrícula'})</span>
                        <span className="block text-[11px] text-navy-400">{s.routeId ? `${routeById[s.routeId]?.name || 'Ruta'} · ` : ''}{serviceLabel(s)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!matches.length && <p className="text-xs text-navy-400">Escribe al menos 2 letras para buscar.</p>}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm"><b>{picked.name}</b> <span className="text-navy-400">({picked.matricula || 'sin matrícula'})</span><br />
                <span className="text-[11px] text-navy-400">{picked.routeId ? `${routeById[picked.routeId]?.name || 'Ruta'} · ` : ''}{serviceLabel(picked)}</span></p>

              <div>
                <label className="admin-label">Ruta de taller</label>
                <select className="admin-select" value={tallerId} onChange={(e) => setTallerId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {tallerRoutes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div>
                <label className="admin-label">Tipo de taller</label>
                <div className="flex rounded-lg border border-navy-200 overflow-hidden" role="tablist" aria-label="Tipo de taller">
                  {[['fijo', 'Fijo', 'todas las semanas'], ['esporadico', 'Esporádico', 'fechas sueltas']].map(([key, label, hint]) => (
                    <button
                      key={key} type="button" role="tab" aria-selected={modo === key}
                      onClick={() => setModo(key)}
                      className={`flex-1 h-12 text-sm font-bold leading-tight transition-colors ${modo === key ? 'bg-navy-700 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}
                    >
                      {label}<span className="block text-[10px] font-normal opacity-80">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {modo === 'fijo' ? (
                <div>
                  <label className="admin-label">Días de la semana</label>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {DAYS.map((d) => (
                      <label key={d.v} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={days.includes(d.v)} onChange={() => toggleDay(d.v)} />{d.n}</label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="admin-label">Fechas (marca los días que va)</label>
                  <DatePicker value={fechas} onToggle={toggleFecha} />
                  {fechas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {fechas.map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 rounded-full bg-navy-50 border border-navy-100 px-2 py-0.5 text-xs text-navy-700">
                          {shortDate(f)}
                          <button type="button" onClick={() => toggleFecha(f)} aria-label={`Quitar ${f}`} className="text-navy-400 hover:text-red-600"><X size={11} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="rounded-lg bg-navy-50 text-[11px] text-navy-600 px-3 py-2">{effectNote}</p>

              <div className="flex gap-2">
                <button type="button" className="btn-admin-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar taller'}</button>
                <button type="button" className="btn-admin-ghost" onClick={() => setPicked(null)}>Cancelar</button>
              </div>
            </div>
          )}
          {msg && <p className="text-xs text-navy-600">{msg}</p>}
        </div>

        {/* Columna derecha: alumnos en taller (encabezado fijo, tabla con scroll propio) */}
        <div className="admin-card !p-0 flex flex-col min-h-0 min-w-0">
          <div className="shrink-0 flex flex-wrap items-center gap-2 p-4 border-b border-navy-100">
            <p className="font-display font-semibold text-sm text-navy-800 mr-2">Alumnos en taller ({assigned.length})</p>
            <select className="admin-select max-w-[220px]" value={filterRoute} onChange={(e) => setFilterRoute(e.target.value)}>
              <option value="">Todas las rutas de taller</option>
              {tallerRoutes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <label className="text-xs text-navy-500 flex items-center gap-1">Mes a revisar <input type="month" className="admin-input max-w-[150px]" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="table-admin min-w-[560px] [&_th]:sticky [&_th]:top-0 [&_th]:z-10">
              <thead>
                <tr><th>Alumno</th><th>Ruta normal</th><th>Taller</th><th>Cuándo</th><th>En el mes</th><th /></tr>
              </thead>
              <tbody>
                {!assigned.length && <tr><td colSpan={6} className="text-center text-navy-400 py-6">Aún no hay alumnos asignados a taller.</td></tr>}
                {assigned.map((s) => {
                  const { moved, billable } = tallerDatesFor(s, dates);
                  const when = whenLabel(s);
                  return (
                    <tr key={s.id}>
                      <td><b>{s.name}</b><br /><span className="text-[11px] text-navy-400">{s.matricula}</span></td>
                      <td>{routeById[s.routeId]?.name || '—'}<br /><span className="text-[11px] text-navy-400">{serviceLabel(s)}</span></td>
                      <td>{routeById[s.tallerRouteId]?.name || 'Ruta eliminada'}</td>
                      <td>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${when.kind === 'Fijo' ? 'bg-navy-100 text-navy-700' : 'bg-amber-100 text-amber-800'}`}>{when.kind}</span>
                        <span className="block text-xs mt-0.5 max-w-[180px]">{when.text}</span>
                      </td>
                      <td className="text-xs">
                        {moved.length} movida(s)<br />
                        {billable.length ? <b className="text-amber-700">{billable.length} con cobro</b> : <span className="text-navy-400">0 con cobro</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        <button type="button" className="link-action block" onClick={() => pick(s)}>Editar</button>
                        <button type="button" className="link-danger block mt-1" onClick={() => remove(s)}>Quitar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="shrink-0 text-[11px] text-navy-400 p-3 border-t border-navy-100">
            «Movida» = su salida normal pasa al taller sin cobro extra. «Con cobro» = viaje de taller por día (alumno sin ruta normal); se refleja solo en la lista de la ruta de taller.
          </p>
        </div>
      </div>
    </div>
  );
}
