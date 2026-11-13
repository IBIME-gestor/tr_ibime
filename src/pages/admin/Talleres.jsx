import { useEffect, useMemo, useState } from 'react';
import { GraduationCap, RefreshCw, Search } from 'lucide-react';
import { Students, Routes } from '../../firebase/services';
import { tallerDatesFor } from '../../firebase/trips';

/**
 * Talleres (salida 17:30) · solo admin
 * Asigna alumnos a una RUTA DE TALLER (se crea en «Rutas» con tipo Taller; cada
 * unidad/zona es una ruta con su propia lista, operador y tarifa) y los días de
 * la semana en que van.
 *
 *  · Si tiene registro en una ruta normal (completo, medio o diario) → SOLO se
 *    mueve su salida al taller: ya no aparece en la salida normal del operador,
 *    se cuenta en el taller y no cambia lo que paga.
 *  · Si NO tiene registro en ruta normal (solo taller) → el taller es un viaje
 *    que se cobra por día, en la lista de la ruta de taller (se genera en
 *    «Listas de alumnos»).
 */

const DAYS = [
  { v: 1, n: 'Lun' }, { v: 2, n: 'Mar' }, { v: 3, n: 'Mié' }, { v: 4, n: 'Jue' }, { v: 5, n: 'Vie' },
];
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const monthNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 7); };

function weekdaysOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const out = [];
  const last = new Date(y, m, 0).getDate();
  for (let day = 1; day <= last; day += 1) {
    const dt = new Date(y, m - 1, day, 12);
    const wd = dt.getDay();
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
  const [days, setDays] = useState([1, 2, 3, 4]);
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
    setDays(s.tallerDias?.length ? s.tallerDias.map(Number) : [1, 2, 3, 4]);
    setMsg('');
  }
  const toggleDay = (v) => setDays((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v].sort()));

  async function save() {
    if (!picked || !tallerId || !days.length) { setMsg('Elige el alumno, la ruta de taller y al menos un día.'); return; }
    setSaving(true); setMsg('');
    try {
      await Students.update(picked.id, { tallerRouteId: tallerId, tallerDias: days });
      setMsg(`Guardado: ${picked.name} → ${routeById[tallerId]?.name || 'taller'}.`);
      setPicked(null);
      await load();
    } catch (e) { setMsg(e?.message || 'No se pudo guardar.'); }
    setSaving(false);
  }
  async function remove(s) {
    if (!window.confirm(`¿Quitar a ${s.name} del taller? Su salida normal vuelve a aparecer en su ruta. Las listas de cobro ya generadas no se modifican solas.`)) return;
    await Students.update(s.id, { tallerRouteId: '', tallerDias: [] });
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-h1 mb-1 flex items-center gap-2"><GraduationCap size={22} /> Talleres (salida 17:30)</h1>
          <p className="text-sm text-navy-400 max-w-3xl">
            Asigna alumnos a una ruta de taller y los días que van. Si ya tienen registro en una ruta normal (completo o medio), solo se mueve su salida (sin cobro extra);
            si no tienen registro, el taller se cobra como viaje por día en la lista de la ruta de taller.
          </p>
        </div>
        <button type="button" className="btn-admin-ghost" onClick={load} disabled={loading}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      {!loading && tallerRoutes.length === 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm px-3 py-2">
          Aún no hay rutas de taller. Créalas en <b>Rutas</b> eligiendo «Ruta de taller» (una por unidad o zona), con su operador y sus conceptos de cobro.
        </p>
      )}

      <div className="admin-card space-y-3">
        <p className="font-display font-semibold text-sm text-navy-800">Asignar alumno a taller</p>
        {!picked ? (
          <>
            <div className="relative max-w-md">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
              <input className="admin-input pl-8" placeholder="Buscar alumno por nombre o matrícula" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {matches.length > 0 && (
              <ul className="border border-navy-100 rounded-lg divide-y divide-navy-100 max-w-md">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-navy-50" onClick={() => pick(s)}>
                      <b>{s.name}</b> <span className="text-navy-400">({s.matricula || 'sin matrícula'})</span>
                      <span className="block text-[11px] text-navy-400">{routeById[s.routeId]?.name || 'Sin ruta normal'} · {serviceLabel(s)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm"><b>{picked.name}</b> <span className="text-navy-400">({picked.matricula || 'sin matrícula'})</span> · {routeById[picked.routeId]?.name || 'Sin ruta normal'} · {serviceLabel(picked)}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
              <div>
                <label className="admin-label">Ruta de taller</label>
                <select className="admin-select" value={tallerId} onChange={(e) => setTallerId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {tallerRoutes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="admin-label">Días de taller</label>
                <div className="flex gap-3 pt-2">
                  {DAYS.map((d) => (
                    <label key={d.v} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={days.includes(d.v)} onChange={() => toggleDay(d.v)} />{d.n}</label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-admin-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar taller'}</button>
              <button type="button" className="btn-admin-ghost" onClick={() => setPicked(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {msg && <p className="text-xs text-navy-600">{msg}</p>}
      </div>

      <div className="admin-card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display font-semibold text-sm text-navy-800 mr-2">Alumnos en taller ({assigned.length})</p>
          <select className="admin-select max-w-[220px]" value={filterRoute} onChange={(e) => setFilterRoute(e.target.value)}>
            <option value="">Todas las rutas de taller</option>
            {tallerRoutes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <label className="text-xs text-navy-500 flex items-center gap-1">Mes a revisar <input type="month" className="admin-input max-w-[150px]" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="table-admin min-w-[900px]">
            <thead>
              <tr><th>Alumno</th><th>Ruta normal</th><th>Servicio normal</th><th>Ruta de taller</th><th>Días</th><th>Salida movida (sin cobro)</th><th>Viaje con cobro por día</th><th /></tr>
            </thead>
            <tbody>
              {!assigned.length && <tr><td colSpan={8} className="text-center text-navy-400 py-6">Aún no hay alumnos asignados a taller.</td></tr>}
              {assigned.map((s) => {
                const { moved, billable } = tallerDatesFor(s, dates);
                return (
                  <tr key={s.id}>
                    <td><b>{s.name}</b><br /><span className="text-[11px] text-navy-400">{s.matricula}</span></td>
                    <td>{routeById[s.routeId]?.name || '—'}</td>
                    <td>{serviceLabel(s)}</td>
                    <td>{routeById[s.tallerRouteId]?.name || 'Ruta eliminada'}</td>
                    <td>{(s.tallerDias || []).map((d) => DAYS.find((x) => x.v === Number(d))?.n).filter(Boolean).join(', ')}</td>
                    <td>{moved.length} día(s)</td>
                    <td>{billable.length ? <b className="text-amber-700">{billable.length} día(s)</b> : '0'}</td>
                    <td className="whitespace-nowrap">
                      <button type="button" className="link-action mr-2" onClick={() => pick(s)}>Editar</button>
                      <button type="button" className="link-danger" onClick={() => remove(s)}>Quitar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-navy-400">
          Los días con cobro se facturan al generar la lista de la ruta de taller en «Listas de alumnos» (periodo y ruta de taller). Si cambias días u operador después de generar la lista, genera o ajusta la lista de nuevo.
        </p>
      </div>
    </div>
  );
}
