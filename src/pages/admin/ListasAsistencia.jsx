import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { RouteLists, Routes } from '../../firebase/services';
import { listTripsByRouteBetween, getTripStopsOnce } from '../../firebase/trips';

/* ------------------------------------------------------------------ */
/*  Asistencia vs lista del mes                                        */
/*  Lo SOLICITADO (la lista ya generada: días y entrada/salida por      */
/*  alumno) contra lo REAL (lo que el operador marcó en sus recorridos).*/
/* ------------------------------------------------------------------ */

const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dayHead = (date) => {
  const d = new Date(`${date}T12:00:00`);
  return { dow: ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getDay()], n: String(d.getDate()).padStart(2, '0') };
};

// Estados de cada tramo (entrada = recorrido de ida / salida = recorrido de vuelta)
const LEG = {
  ok:     { sym: '✓', cls: 'text-go', label: 'Asistió' },
  absent: { sym: '✗', cls: 'text-stop', label: 'No asistió' },
  none:   { sym: '?', cls: 'text-signal-amber', label: 'Hubo recorrido pero sin marca del operador' },
  notrip: { sym: '·', cls: 'text-navy-300', label: 'No hubo recorrido ese día' },
  extra:  { sym: '+', cls: 'text-blue-600', label: 'Asistió sin estar solicitado' },
};

export default function ListasAsistencia() {
  const [lists, setLists] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [listId, setListId] = useState('');
  const [trips, setTrips] = useState([]); // con _stops
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);

  useEffect(() => RouteLists.subscribe(setLists), []);
  useEffect(() => { Routes.list().then(setRoutes).catch((e) => console.error(e)); }, []);

  const routeName = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r.name])), [routes]);
  const monthLists = useMemo(() => lists
    .filter((l) => String(l.startDate || '').slice(0, 7) === month && l.status !== 'eliminada')
    .sort((a, b) => String(routeName[a.routeId] || '').localeCompare(String(routeName[b.routeId] || ''), 'es')), [lists, month, routeName]);
  const list = monthLists.find((l) => l.id === listId) || null;

  async function load(l) {
    if (!l) { setTrips([]); return; }
    setLoading(true); setError('');
    try {
      const found = await listTripsByRouteBetween(l.routeId, l.startDate, l.endDate);
      const withStops = [];
      for (const t of found) withStops.push({ ...t, _stops: await getTripStopsOnce(t.id) });
      setTrips(withStops);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo cargar la asistencia.');
      setTrips([]);
    } finally { setLoading(false); }
  }
  useEffect(() => { setTrips([]); if (list) load(list); /* eslint-disable-next-line */ }, [listId]);
  useEffect(() => { if (listId && !monthLists.some((l) => l.id === listId)) setListId(''); }, [monthLists, listId]);

  const today = localToday();
  const dates = list?.dates || [];

  // tripIndex[date][shift] = { trip, byStudent: Map(studentId → stop) }
  const tripIndex = useMemo(() => {
    const idx = {};
    trips.forEach((t) => {
      (idx[t.date] = idx[t.date] || {})[t.shift] = { trip: t, byStudent: new Map((t._stops || []).map((s) => [s.studentId, s])) };
    });
    return idx;
  }, [trips]);

  const legState = (date, shift, studentId, requested) => {
    if (date > today) return requested ? { st: 'future' } : { st: 'blank' };
    const t = tripIndex[date]?.[shift];
    if (!t) return requested ? { st: 'notrip' } : { st: 'blank' };
    const stop = t.byStudent.get(studentId);
    const attended = stop && (stop.status === 'boarded' || stop.status === 'delivered');
    if (requested) {
      if (attended) return { st: 'ok' };
      if (stop?.status === 'absent') return { st: 'absent' };
      return { st: 'none' };
    }
    return attended ? { st: 'extra' } : { st: 'blank' };
  };

  const table = useMemo(() => {
    if (!list) return { rows: [], totals: { req: 0, ok: 0, absent: 0, none: 0, extra: 0, notrip: 0 }, outside: [] };
    const totals = { req: 0, ok: 0, absent: 0, none: 0, extra: 0, notrip: 0 };
    const rows = (list.rows || []).map((row) => {
      const s = { req: 0, ok: 0, absent: 0, none: 0, extra: 0, notrip: 0 };
      const cells = dates.map((date) => {
        const day = row.days?.[date] || {};
        const e = legState(date, 'morning', row.studentId, !!day.entrada);
        const sa = legState(date, 'afternoon', row.studentId, !!day.salida);
        [[e, !!day.entrada], [sa, !!day.salida]].forEach(([x, req]) => {
          if (req && x.st !== 'future') s.req += 1;
          if (x.st === 'ok') s.ok += 1;
          else if (x.st === 'absent') s.absent += 1;
          else if (x.st === 'none') s.none += 1;
          else if (x.st === 'notrip') s.notrip += 1;
          else if (x.st === 'extra') s.extra += 1;
        });
        return { date, e, s: sa };
      });
      Object.keys(totals).forEach((k) => { totals[k] += s[k]; });
      const evaluable = s.req - s.notrip;
      return { row, cells, ...s, pct: evaluable > 0 ? (s.ok / evaluable) * 100 : null };
    }).sort((a, b) => String(a.row.name).localeCompare(String(b.row.name), 'es'));

    // Alumnos que fueron atendidos en un recorrido pero NO están en la lista.
    const inList = new Set((list.rows || []).map((r) => r.studentId));
    const outside = new Map();
    trips.forEach((t) => (t._stops || []).forEach((st) => {
      if (inList.has(st.studentId)) return;
      if (st.status !== 'boarded' && st.status !== 'delivered') return;
      const key = st.studentId;
      const cur = outside.get(key) || { name: st.name, matricula: st.matricula, days: new Set() };
      cur.days.add(t.date);
      outside.set(key, cur);
    }));
    return { rows, totals, outside: [...outside.values()] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, tripIndex, trips]);

  const shownRows = table.rows.filter((r) => !onlyIssues || r.absent || r.none || r.extra || (r.pct != null && r.pct < 100));
  const evaluableTotal = table.totals.req - table.totals.notrip;
  const pctTotal = evaluableTotal > 0 ? (table.totals.ok / evaluableTotal) * 100 : null;
  const tripDays = new Set(trips.map((t) => t.date)).size;
  const futureOrPast = dates.filter((d) => d <= today).length;

  function exportExcel() {
    const data = table.rows.map((r) => ({
      Alumno: r.row.name, Matrícula: r.row.matricula, Servicio: r.row.tipoServicio,
      Solicitados: r.req, Atendidos: r.ok, 'No asistió': r.absent, 'Sin marca': r.none, 'Sin recorrido': r.notrip, 'Extra (no solicitado)': r.extra,
      'Cumplimiento %': r.pct != null ? Number(r.pct.toFixed(1)) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia vs lista');
    XLSX.writeFile(wb, `asistencia_vs_lista_${list.startDate}_${routeName[list.routeId] || 'ruta'}.xlsx`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-h1">Asistencia vs lista</h1>
          <p className="text-sm text-navy-400 mt-1 max-w-3xl">
            Compara lo que se solicitó en la lista del mes (días y entrada/salida de cada alumno) contra lo que el operador marcó en sus recorridos.
          </p>
        </div>
        {list && <button className="btn-admin-ghost" onClick={exportExcel}><Download size={14} /> Exportar a Excel</button>}
      </div>

      <div className="admin-card">
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="admin-label">Mes</label><input type="month" className="admin-input" value={month} onChange={(e) => { setMonth(e.target.value); setListId(''); }} /></div>
          <div className="min-w-[280px] flex-1">
            <label className="admin-label">Lista</label>
            <select className="admin-select w-full" value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">— elige una lista de {month} ({monthLists.length}) —</option>
              {monthLists.map((l) => <option key={l.id} value={l.id}>{routeName[l.routeId] || 'Ruta'} · {l.listName || `${l.startDate} ${l.endDate}`}</option>)}
            </select>
          </div>
          <button className="btn-admin-ghost" disabled={!list || loading} onClick={() => load(list)}><RefreshCw size={14} className="inline mr-1" />{loading ? 'Cargando…' : 'Actualizar'}</button>
          <label className="text-sm inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />Solo con diferencias</label>
        </div>
        {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      </div>

      {!list && <p className="text-sm text-navy-400">Elige una lista para ver su asistencia.</p>}

      {list && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div className="admin-card"><p className="text-xs text-navy-400">Solicitados (a hoy)</p><p className="text-xl font-display font-bold">{table.totals.req}</p></div>
            <div className="admin-card"><p className="text-xs text-navy-400">Atendidos</p><p className="text-xl font-display font-bold text-go">{table.totals.ok}</p></div>
            <div className="admin-card"><p className="text-xs text-navy-400">No asistieron</p><p className="text-xl font-display font-bold text-stop">{table.totals.absent}</p></div>
            <div className="admin-card"><p className="text-xs text-navy-400">Sin marca</p><p className="text-xl font-display font-bold text-signal-amber">{table.totals.none}</p></div>
            <div className="admin-card"><p className="text-xs text-navy-400">Extras (no solicitados)</p><p className="text-xl font-display font-bold text-blue-600">{table.totals.extra}</p></div>
            <div className="admin-card"><p className="text-xs text-navy-400">Cumplimiento</p><p className="text-xl font-display font-bold">{pctTotal != null ? `${pctTotal.toFixed(1)}%` : '—'}</p><p className="text-[11px] text-navy-400">{tripDays} de {futureOrPast} día(s) con recorrido</p></div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-500">
            {Object.entries(LEG).map(([k, v]) => <span key={k}><b className={v.cls}>{v.sym}</b> {v.label}</span>)}
            <span>Cada día: arriba <b>E</b> = entrada (ida), abajo <b>S</b> = salida (vuelta). Vacío = no solicitado.</span>
          </div>

          <div className="admin-card p-0 overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="table-admin text-xs">
                <thead className="sticky top-0 z-10 bg-white shadow-sm">
                  <tr>
                    <th className="pl-4 sticky left-0 bg-white z-20 min-w-[190px]">Alumno</th>
                    <th className="text-right">Solic.</th><th className="text-right">Aten.</th><th className="text-right">Faltas</th><th className="text-right">S/marca</th><th className="text-right">%</th>
                    {dates.map((d) => { const h = dayHead(d); return <th key={d} className={`text-center px-1 ${d === today ? 'bg-signal-yellow/30' : ''}`}>{h.dow}<span className="block font-normal text-navy-400">{h.n}</span></th>; })}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map(({ row, cells, req, ok, absent, none, pct }) => (
                    <tr key={row.studentId}>
                      <td className="pl-4 sticky left-0 bg-white font-medium">{row.name}<span className="block text-[10px] font-mono text-navy-400">{row.matricula}</span></td>
                      <td className="text-right">{req}</td><td className="text-right text-go font-semibold">{ok}</td>
                      <td className="text-right text-stop">{absent || ''}</td><td className="text-right text-signal-amber">{none || ''}</td>
                      <td className={`text-right font-semibold ${pct != null && pct < 80 ? 'text-stop' : ''}`}>{pct != null ? `${pct.toFixed(0)}%` : '—'}</td>
                      {cells.map((c) => {
                        const g = (x) => (x.st === 'blank' || x.st === 'future' ? <span className="text-navy-200">{x.st === 'future' ? '–' : ''}</span> : <b className={LEG[x.st].cls} title={LEG[x.st].label}>{LEG[x.st].sym}</b>);
                        return <td key={c.date} className={`text-center px-1 leading-4 ${c.date === today ? 'bg-signal-yellow/10' : ''}`}><div>{g(c.e)}</div><div>{g(c.s)}</div></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shownRows.length && <p className="text-center text-sm text-navy-400 py-8">{loading ? 'Cargando asistencia…' : 'No hay alumnos para mostrar.'}</p>}
            </div>
          </div>

          {table.outside.length > 0 && (
            <div className="admin-card">
              <p className="font-display font-semibold text-sm flex items-center gap-2"><Plus size={14} className="text-blue-600" /> Atendidos en recorrido pero que NO están en esta lista</p>
              <p className="text-xs text-navy-400 mb-2">Posibles altas manuales del operador o alumnos que faltan en la lista.</p>
              <div className="divide-y divide-navy-100">
                {table.outside.map((o) => <div key={o.matricula + o.name} className="py-1.5 text-sm flex justify-between gap-3"><span>{o.name} <span className="text-xs font-mono text-navy-400">{o.matricula}</span></span><span className="text-xs text-navy-500">{o.days.size} día(s)</span></div>)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
