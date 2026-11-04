import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Routes, RouteLists } from '../../firebase/services';
import { listTripsByRouteBetween, getTripStopsOnce, todayString } from '../../firebase/trips';
import LoadingOverlay from '../../components/LoadingOverlay';

/* ------------------------------------------------------------------ */
/*  Mi lista (operador)                                                */
/*  · «Hoy / por día»: lo que le toca a cada día, entrada y salida, y   */
/*    cómo va (recogido, entregado, faltó, pendiente).                  */
/*  · «Lista del mes»: la lista vigente contra la ORIGINAL (altas,      */
/*    bajas y cambios de días).                                         */
/* ------------------------------------------------------------------ */

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const monthOf = (d) => String(d || '').slice(0, 7);
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const dayLabel = (d) => { const x = new Date(`${d}T12:00:00`); return { dow: DOW[x.getDay()], n: String(x.getDate()).padStart(2, '0') }; };
const longDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const tsMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null);
const fmtHM = (ts) => { const ms = tsMs(ts); return ms ? new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''; };
const serviceLabel = (r) => (r.tipoServicio === 'medio' ? `Medio · ${r.medioServicio === 'salida' ? 'salida' : 'entrada'}` : r.tipoServicio === 'diario' ? 'Diario' : 'Completo');
const planOf = (row, d) => (row?.days?.[d]?.entrada ? 1 : 0) + (row?.days?.[d]?.salida ? 2 : 0);
const planLetters = (n) => (n === 3 ? 'E+S' : n === 1 ? 'E' : n === 2 ? 'S' : '');

export default function MyList() {
  const { routeId: routeParam } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const today = todayString(); // el día cambia a las 19:30

  const [routes, setRoutes] = useState([]);
  const [lists, setLists] = useState([]);
  const [trips, setTrips] = useState([]);
  const [stopsByTrip, setStopsByTrip] = useState({});
  const [month, setMonth] = useState(monthOf(today));
  const [date, setDate] = useState(today);
  const [view, setView] = useState('dia');
  const [openId, setOpenId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const route = routes.find((r) => r.id === routeParam) || routes[0] || null;
  const routeId = route?.id || '';

  useEffect(() => {
    if (!profile?.staffId) { setLoading(false); return; }
    (profile.role === 'nanny' ? Routes.listByNanny(profile.staffId) : Routes.listByDriver(profile.staffId))
      .then(setRoutes).catch((e) => setError(e?.message || 'No se pudieron cargar tus rutas.')).finally(() => setLoading(false));
  }, [profile]);

  // Listas de la ruta + recorridos del mes (consulta puntual; «Actualizar» vuelve a pedirla).
  useEffect(() => {
    if (!routeId) return;
    let alive = true;
    setError('');
    Promise.all([RouteLists.listByRoute(routeId), listTripsByRouteBetween(routeId, `${month}-01`, lastDay(month))])
      .then(([l, t]) => { if (alive) { setLists(l.filter((x) => x.status !== 'eliminada')); setTrips(t); setStopsByTrip({}); } })
      .catch((e) => { console.error(e); if (alive) setError(e?.message || 'No se pudo cargar tu lista.'); });
    return () => { alive = false; };
  }, [routeId, month, tick]);

  const months = useMemo(() => {
    const set = new Set(lists.map((l) => monthOf(l.startDate)).filter(Boolean));
    set.add(monthOf(today));
    return [...set].sort();
  }, [lists, today]);

  const monthLists = lists.filter((l) => monthOf(l.startDate) === month);
  const list = monthLists.find((l) => l.operatorId && l.operatorId === profile?.staffId) || monthLists[0] || null;
  const dates = useMemo(() => [...(list?.dates || [])].sort(), [list]);

  // Día seleccionado válido dentro de la lista
  useEffect(() => {
    if (!dates.length) return;
    if (!dates.includes(date)) setDate(dates.includes(today) ? today : (dates.filter((d) => d <= today).pop() || dates[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates]);

  // Paradas de los recorridos del día elegido
  useEffect(() => {
    const dayTrips = trips.filter((t) => t.date === date && !stopsByTrip[t.id]);
    if (!dayTrips.length) return;
    let alive = true;
    Promise.all(dayTrips.map(async (t) => [t.id, await getTripStopsOnce(t.id)]))
      .then((pairs) => { if (alive) setStopsByTrip((p) => ({ ...p, ...Object.fromEntries(pairs) })); })
      .catch((e) => console.error(e));
    return () => { alive = false; };
  }, [trips, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Diferencias contra la lista original ----
  const original = useMemo(() => new Map((list?.originalRows || []).map((r) => [r.studentId, r])), [list]);
  const hasOriginal = original.size > 0;
  const diff = useMemo(() => {
    const m = new Map();
    if (!hasOriginal) return m;
    const cur = new Map((list?.rows || []).map((r) => [r.studentId, r]));
    cur.forEach((row, id) => {
      const o = original.get(id);
      if (!o) { m.set(id, { kind: 'new' }); return; }
      const changed = dates.filter((d) => (o.days?.[d] || 0) !== planOf(row, d));
      if (changed.length) m.set(id, { kind: 'changed', dates: changed });
    });
    original.forEach((o, id) => { if (!cur.has(id)) m.set(id, { kind: 'removed', name: o.name, matricula: o.matricula, row: o }); });
    return m;
  }, [list, original, hasOriginal, dates]);

  // ---- Día ----
  const orderIds = (leg) => (leg === 'entrada' ? route?.studentOrderMorning : route?.studentOrderAfternoon) || [];
  function legRows(leg) {
    const order = orderIds(leg);
    const rows = (list?.rows || []).filter((r) => r.days?.[date]?.[leg]);
    return rows.sort((a, b) => {
      const ia = order.indexOf(a.studentId); const ib = order.indexOf(b.studentId);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
      return String(a.name).localeCompare(String(b.name), 'es');
    });
  }
  function statusOf(leg, studentId) {
    const shift = leg === 'entrada' ? 'morning' : 'afternoon';
    const trip = trips.find((t) => t.date === date && t.shift === shift);
    if (!trip) return date < today ? { key: 'notrip', label: 'Sin recorrido', cls: 'badge' } : { key: 'idle', label: 'Por iniciar', cls: 'badge' };
    const stops = stopsByTrip[trip.id];
    if (!stops) return { key: 'load', label: '…', cls: 'badge' };
    const s = stops.find((x) => x.studentId === studentId);
    if (!s) return { key: 'none', label: 'Sin marca', cls: 'badge-amber' };
    if (s.status === 'absent') return { key: 'absent', label: 'No asistió', cls: 'badge-stop' };
    if (leg === 'entrada' && (s.status === 'boarded' || s.status === 'delivered')) return { key: 'done', label: `Recogido ${fmtHM(s.boardedAt)}`.trim(), cls: 'badge-go' };
    if (leg === 'salida' && s.status === 'delivered') return { key: 'done', label: `Entregado ${fmtHM(s.deliveredAt)}`.trim(), cls: 'badge-go' };
    if (leg === 'salida' && s.status === 'boarded') return { key: 'board', label: 'A bordo', cls: 'badge-amber' };
    return { key: 'pending', label: 'Pendiente', cls: 'badge-amber' };
  }
  function extrasFor(leg) {
    const shift = leg === 'entrada' ? 'morning' : 'afternoon';
    const trip = trips.find((t) => t.date === date && t.shift === shift);
    const stops = trip ? stopsByTrip[trip.id] : null;
    if (!stops) return [];
    const planned = new Set(legRows(leg).map((r) => r.studentId));
    return stops.filter((s) => !planned.has(s.studentId) && (s.status === 'boarded' || s.status === 'delivered'));
  }

  const weekDates = useMemo(() => {
    if (!dates.length) return [];
    const d = new Date(`${date}T12:00:00`);
    const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow);
    const monday = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() + 4);
    const friday = d.toISOString().slice(0, 10);
    return dates.filter((x) => x >= monday && x <= friday);
  }, [dates, date]);
  const stepWeek = (dir) => {
    const idx = dates.indexOf(weekDates[dir > 0 ? weekDates.length - 1 : 0]);
    const next = dates[idx + dir];
    if (next) setDate(next);
  };

  if (loading) return <LoadingOverlay show label="Cargando tu lista…" />;
  if (!route) return <div className="card text-center mt-10"><p className="font-display font-semibold">Sin ruta asignada</p></div>;

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('/chofer')} className="flex items-center gap-1 text-sm text-navy-500"><ArrowLeft size={15} /> Inicio</button>
        <button onClick={() => setTick((n) => n + 1)} className="flex items-center gap-1 text-sm text-navy-500"><RefreshCw size={14} /> Actualizar</button>
      </div>

      <div className="bg-navy-800 text-white rounded-2xl px-4 py-3">
        <p className="text-navy-300 text-xs">Mi lista</p>
        <p className="font-display font-bold text-lg leading-tight">{route.name}</p>
        <div className="flex items-center gap-2 mt-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="bg-navy-700 text-white text-sm rounded-lg px-2 py-1.5 capitalize">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <span className="text-navy-300 text-xs">{list ? `${(list.rows || []).length} alumnos en la lista` : 'Sin lista este mes'}</span>
        </div>
      </div>

      {routes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">{routes.map((r) => <button key={r.id} onClick={() => navigate(`/chofer/lista/${r.id}`)} className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border ${r.id === routeId ? 'bg-signal-yellow border-signal-yellow text-navy-900 font-semibold' : 'border-navy-200 text-navy-600'}`}>{r.name}</button>)}</div>
      )}

      {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      {!list && !error && <div className="card text-center text-sm text-navy-500">Todavía no hay lista de {monthLabel(month)} para esta ruta. Pide al administrador que la genere.</div>}

      {list && (
        <>
          <div className="grid grid-cols-2 gap-1 bg-navy-100 rounded-xl p-1">
            {[['dia', 'Por día'], ['mes', 'Lista del mes']].map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} className={`py-2 rounded-lg text-sm font-medium ${view === k ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-500'}`}>{label}</button>
            ))}
          </div>

          {view === 'dia' && (
            <>
              <div className="card !p-3">
                <div className="flex items-center gap-1">
                  <button onClick={() => stepWeek(-1)} className="p-2 text-navy-500" aria-label="Semana anterior"><ChevronLeft size={18} /></button>
                  <div className="flex-1 grid grid-cols-5 gap-1">
                    {weekDates.map((d) => { const l = dayLabel(d); const on = d === date;
                      return (
                        <button key={d} onClick={() => setDate(d)} className={`rounded-xl py-1.5 text-center border-2 ${on ? 'border-signal-yellow bg-signal-yellow/20' : d === today ? 'border-navy-300' : 'border-transparent bg-navy-50'}`}>
                          <span className="block text-[0.65rem] uppercase text-navy-400">{l.dow}</span>
                          <span className="block font-display font-bold text-navy-900">{l.n}</span>
                        </button>);
                    })}
                  </div>
                  <button onClick={() => stepWeek(1)} className="p-2 text-navy-500" aria-label="Semana siguiente"><ChevronRight size={18} /></button>
                </div>
                <p className="text-center text-xs text-navy-500 mt-2 capitalize">{longDate(date)}{date === today ? ' · hoy' : ''}</p>
              </div>

              {[['entrada', 'Entrada · ida'], ['salida', 'Salida · vuelta']].map(([leg, title]) => {
                const rows = legRows(leg);
                const sts = rows.map((r) => statusOf(leg, r.studentId).key);
                const count = (k) => sts.filter((x) => x === k).length;
                const extras = extrasFor(leg);
                return (
                  <div key={leg} className="card !p-0 overflow-hidden">
                    <div className="px-4 py-3 border-b border-navy-100">
                      <div className="flex items-center justify-between">
                        <p className="font-display font-semibold text-navy-900">{title}</p>
                        <span className="text-sm font-semibold text-navy-700">{rows.length} alumno{rows.length === 1 ? '' : 's'}</span>
                      </div>
                      {rows.length > 0 && <p className="text-xs text-navy-400 mt-0.5">Hechos {count('done')} · No asistió {count('absent')} · Pendientes {rows.length - count('done') - count('absent')}</p>}
                    </div>
                    {!rows.length ? <p className="text-sm text-navy-400 px-4 py-4">Nadie tiene servicio de {leg} este día.</p> : (
                      <div className="divide-y divide-navy-100">
                        {rows.map((r, i) => {
                          const st = statusOf(leg, r.studentId);
                          const df = diff.get(r.studentId);
                          const o = original.get(r.studentId);
                          const dayChanged = df?.kind === 'changed' && df.dates.includes(date);
                          return (
                            <div key={r.studentId} className="px-4 py-2.5 flex items-center gap-3">
                              <span className="w-7 h-7 rounded-full bg-navy-800 text-white text-xs font-display font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-navy-800 truncate">{r.name}</p>
                                <p className="text-xs text-navy-400 truncate">{r.matricula} · {serviceLabel(r)}
                                  {df?.kind === 'new' && <span className="ml-1 text-blue-700 font-semibold">· Agregado</span>}
                                  {dayChanged && <span className="ml-1 text-signal-amber font-semibold">· Cambió (antes: {planLetters(o?.days?.[date] || 0) || 'sin servicio'})</span>}
                                </p>
                              </div>
                              <span className={`${st.cls} shrink-0 text-[0.7rem]`}>{st.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {extras.length > 0 && (
                      <div className="px-4 py-2.5 bg-blue-50 border-t border-navy-100">
                        <p className="text-xs font-semibold text-blue-700">Atendidos fuera de la lista ({extras.length})</p>
                        {extras.map((s) => <p key={s.studentId} className="text-xs text-navy-600">{s.name} · {s.matricula}</p>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {view === 'mes' && (
            <>
              <div className="card !p-3 text-xs text-navy-500">
                {hasOriginal
                  ? <>Lista vigente comparada con la <b>original</b> (la que se generó al inicio del mes). <span className="text-blue-700 font-semibold">Agregado</span> · <span className="text-signal-amber font-semibold">Cambió de días</span> · <span className="text-stop font-semibold">Baja</span>.</>
                  : 'Esta lista se generó antes de guardar la versión original, así que no se pueden marcar cambios. Las listas nuevas sí los mostrarán.'}
              </div>
              <div className="card !p-0 divide-y divide-navy-100 overflow-hidden">
                {[...(list.rows || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')).map((r) => {
                  const df = diff.get(r.studentId);
                  const o = original.get(r.studentId);
                  const open = openId === r.studentId;
                  const units = dates.reduce((n, d) => n + (planOf(r, d) === 3 ? 2 : planOf(r, d) ? 1 : 0), 0);
                  return (
                    <div key={r.studentId}>
                      <button onClick={() => setOpenId(open ? '' : r.studentId)} className="w-full text-left px-4 py-2.5 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-navy-800 truncate">{r.name}</p>
                          <p className="text-xs text-navy-400">{r.matricula} · {serviceLabel(r)} · {units} servicio(s)</p>
                        </div>
                        {df?.kind === 'new' && <span className="badge text-[0.65rem] !bg-blue-100 !text-blue-700">Agregado</span>}
                        {df?.kind === 'changed' && <span className="badge-amber text-[0.65rem]">Cambió</span>}
                        <ChevronRight size={15} className={`text-navy-300 transition-transform ${open ? 'rotate-90' : ''}`} />
                      </button>
                      {open && (
                        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                          {dates.map((d) => {
                            const now = planOf(r, d); const was = o ? (o.days?.[d] || 0) : now;
                            if (!now && !was) return null;
                            const l = dayLabel(d); const ch = now !== was;
                            return (
                              <span key={d} className={`rounded-lg border px-2 py-1 text-xs ${ch ? 'border-signal-amber bg-signal-amber/10' : 'border-navy-100'} ${d === today ? 'ring-1 ring-navy-300' : ''}`}>
                                {l.dow} {l.n} · <b>{planLetters(now) || '—'}</b>{ch && <span className="text-navy-400 line-through ml-1">{planLetters(was) || '—'}</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {[...diff.values()].filter((x) => x.kind === 'removed').map((x) => (
                  <div key={x.row.studentId} className="px-4 py-2.5 flex items-center gap-3 bg-red-50/60">
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium text-navy-500 line-through truncate">{x.name}</p><p className="text-xs text-navy-400">{x.matricula}</p></div>
                    <span className="badge-stop text-[0.65rem]">Baja</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
