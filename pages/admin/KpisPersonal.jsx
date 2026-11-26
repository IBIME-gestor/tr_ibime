import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Truck, Users, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Drivers, Routes, Units } from '../../firebase/services';
import { listTripsBetween, getTripStopsOnce, adminReassignTrips, KM_GAP_ALERT } from '../../firebase/trips';
import { listStaffLogRange } from '../../firebase/staffLogs';
import { KpiIndicators, listEvidenceBetween } from '../../firebase/kpiTasks';
import { personTasks, EVIDENCE_STATES } from '../../utils/kpiTasks';
import { cascadeStyle } from '../../utils/cascade';
import {
  prepareTrips, computeKpis, analyzeStops, staffSummary, daysBetween, eachDate,
  levelOf, LEVEL_COLORS, LEVEL_LABELS,
} from '../../utils/staffKpis';
import { Donut, Bars, ScoreRing } from '../../components/kpi/Charts';
import { DriveImg, PhotoLightbox } from '../../components/kpi/Photos';

/* ------------------------------------------------------------------ */
/*  Utilidades                                                          */
/* ------------------------------------------------------------------ */
function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function addDays(date, amount) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}
const fmt1 = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 }));
const fmt0 = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('es-MX'));
const fmtPct = (n) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const SHIFT_LABEL = { morning: 'Mañana', afternoon: 'Tarde' };
const STATUS_LABEL = { completed: 'Cerrado', in_progress: 'En curso' };
const ALERT_LABEL = { traffic: 'Tráfico', accident: 'Accidente', delay: 'Retraso', breakdown: 'Falla', other: 'Otro' };

function LevelBadge({ level }) {
  const c = LEVEL_COLORS[level];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${c}1f`, color: c }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {LEVEL_LABELS[level]}
    </span>
  );
}

function Tile({ label, value, sub, index = 0, tone }) {
  return (
    <div className="cascade-item rounded-lg border border-navy-100 bg-white px-3 py-2.5" style={cascadeStyle(index, 45, 450)}>
      <p className="text-[11px] font-semibold text-navy-400 leading-tight">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color: tone || '#12405f' }}>{value}</p>
      {sub && <p className="text-[11px] text-navy-400 leading-tight mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, hint, children, index = 0 }) {
  return (
    <section className="cascade-item admin-card !p-4" style={cascadeStyle(index + 4, 70, 600)}>
      <h3 className="text-sm font-bold text-navy-800">{title}</h3>
      {hint && <p className="text-[11px] text-navy-400 mb-2">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Tarjeta de persona                                                  */
/* ------------------------------------------------------------------ */
function PersonCard({ person, role, compact, selected, onClick, registerRef, index }) {
  const k = person.kpis;
  const color = LEVEL_COLORS[k.level];
  const mini = role === 'nanny'
    ? [
        ['Atendidos', fmtPct(k.values.resueltos)],
        ['Ausentes', fmt0(k.stAbsent)],
        ['Correcc.', fmt0(k.corrected)],
      ]
    : [
        ['Cerrados', `${k.completed}/${k.total}`],
        ['Duración', k.durRatio == null ? '—' : `${k.durRatio.toFixed(2)}×`],
        ['Correcc.', fmt0(k.corrected)],
      ];
  return (
    <button
      type="button"
      ref={(el) => registerRef(person.id, el)}
      onClick={onClick}
      className={`cascade-item text-left bg-white rounded-xl border transition-shadow hover:shadow-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-signal-yellow ${
        selected ? 'border-navy-700 shadow-panel ring-1 ring-navy-700' : 'border-navy-100'
      } ${compact ? 'px-3 py-2' : 'p-4'}`}
      style={{ ...cascadeStyle(index, 40, 480), borderLeft: `4px solid ${color}` }}
      aria-pressed={selected}
    >
      <div className="flex items-center gap-3">
        <ScoreRing score={k.score} color={color} size={compact ? 38 : 58} stroke={compact ? 5 : 6} />
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-navy-900 truncate ${compact ? 'text-[13px]' : 'text-sm'}`}>{person.name}</p>
          {person.orphan && <p className="text-[10px] font-semibold text-amber-700 truncate">ID …{String(person.id).slice(-6)} · revisar y reasignar</p>}
          <p className="text-[11px] text-navy-400 truncate">
            {role === 'nanny' ? 'Nannie' : 'Operador'} · {k.total
              ? `${k.total} recorrido${k.total === 1 ? '' : 's'}`
              : person.assigned ? `sin recorridos (${person.assigned} ruta${person.assigned === 1 ? '' : 's'} asignada${person.assigned === 1 ? '' : 's'})` : 'sin recorridos ni ruta asignada'}
          </p>
        </div>
        {!compact && <LevelBadge level={k.level} />}
      </div>
      {!compact && (
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-navy-100">
          {mini.map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] uppercase tracking-wide text-navy-400">{label}</p>
              <p className="text-sm font-bold text-navy-800 tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Página                                                              */
/* ------------------------------------------------------------------ */
export default function KpisPersonal() {
  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(today());
  const [shift, setShift] = useState('all');
  const [role, setRole] = useState('operador');
  const [sort, setSort] = useState('score-asc');
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [units, setUnits] = useState([]);
  const [trips, setTrips] = useState([]);
  const [staff, setStaff] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState({ loading: false, analysis: null });
  const [reloadKey, setReloadKey] = useState(0);
  const { profile } = useAuth();

  const cardRefs = useRef(new Map());
  const prevRects = useRef(new Map());
  const stopsCache = useRef(new Map());

  useEffect(() => Drivers.subscribe(setDrivers), []);
  useEffect(() => Routes.subscribe(setRoutes), []);
  useEffect(() => Units.subscribe(setUnits), []);
  useEffect(() => KpiIndicators.subscribe(setIndicators), []);

  /* Recorridos del periodo */
  useEffect(() => {
    if (!from || !to || from > to) return undefined;
    let active = true;
    setLoading(true); setError('');
    listTripsBetween(from, to)
      .then((rows) => { if (active) setTrips(rows); })
      .catch((e) => { console.error(e); if (active) { setTrips([]); setError('No se pudieron cargar los recorridos.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, reloadKey]);

  /* Bitácora de Nómina del periodo (máx. 62 días) */
  useEffect(() => {
    if (!from || !to || from > to) return undefined;
    let active = true;
    listStaffLogRange(eachDate(from, to, 62))
      .then((rows) => { if (active) setStaff(rows); })
      .catch((e) => { console.error(e); if (active) setStaff([]); });
    return () => { active = false; };
  }, [from, to]);

  /* Evidencias (fotos) del periodo */
  useEffect(() => {
    if (!from || !to || from > to) return undefined;
    let active = true;
    listEvidenceBetween(from, to)
      .then((rows) => { if (active) setEvidence(rows); })
      .catch((e) => { console.error(e); if (active) setEvidence([]); });
    return () => { active = false; };
  }, [from, to]);

  const driversById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const routesById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const unitsById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const prepared = useMemo(() => prepareTrips(trips, { kmGap: KM_GAP_ALERT }), [trips]);
  const bucket = daysBetween(from, to) > 21 ? 'week' : 'day';

  const people = useMemo(() => {
    const groups = new Map();
    const nannyLedByOperator = new Map(); // viajes del operador que llevó la nannie (no se le califican)
    prepared.rows.forEach((t) => {
      if (shift !== 'all' && t.shift !== shift) return;
      const id = role === 'nanny' ? t.nannyId : t.driverId;
      if (!id) return;
      if (!groups.has(id)) groups.set(id, []);
      if (role !== 'nanny' && t._nannyLed) { nannyLedByOperator.set(id, (nannyLedByOperator.get(id) || 0) + 1); return; }
      groups.get(id).push(t);
    });
    // Todo el personal activo del catálogo aparece, tenga o no recorridos en el periodo
    drivers.forEach((d) => {
      const isNannyDoc = d.role === 'nanny';
      const isOperatorDoc = d.role !== 'nanny' && d.role !== 'cashier';
      if ((role === 'nanny' && isNannyDoc) || (role !== 'nanny' && isOperatorDoc)) {
        if (!groups.has(d.id)) groups.set(d.id, []);
      }
    });
    const list = [...groups.entries()].map(([id, rows]) => {
      const d = driversById.get(id);
      const assigned = routes.filter((r) => (role === 'nanny' ? r.nannyId : r.driverId) === id).length;
      const tasks = personTasks(indicators, role, evidence.filter((e) => e.personId === id), from, to);
      const extras = tasks.map(({ ind, comp }) => ({ key: `ind_${ind.id}`, label: ind.name, weight: Number(ind.weight) || 10, value: comp.value }));
      return {
        id,
        name: d?.name || (d ? '(sin nombre en el catálogo)' : '(no existe en el catálogo)'),
        orphan: !d?.name,
        inCatalog: !!d,
        phone: d?.phone || '',
        assigned,
        nannyLed: role === 'nanny' ? rows.filter((t) => t._nannyLed).length : (nannyLedByOperator.get(id) || 0),
        trips: rows,
        tasks,
        kpis: computeKpis(rows, role, prepared.peerAvg, { bucket, extras }),
      };
    });
    const byScore = (a, b) => (a.kpis.score ?? 101) - (b.kpis.score ?? 101);
    list.sort((a, b) => {
      if (sort === 'score-desc') return -byScore(a, b) || a.name.localeCompare(b.name);
      if (sort === 'name') return a.name.localeCompare(b.name);
      return byScore(a, b) || a.name.localeCompare(b.name);
    });
    return list;
  }, [prepared, shift, role, sort, drivers, driversById, routes, bucket, indicators, evidence, from, to]);

  const selected = useMemo(() => people.find((p) => p.id === selectedId) || null, [people, selectedId]);
  /* Todos los recorridos del periodo ligados a la persona abierta (sin filtro de turno ni de «llevados por nannie») */
  const allTripsOfSelected = useMemo(() => {
    if (!selected) return [];
    const field = role === 'nanny' ? 'nannyId' : 'driverId';
    return prepared.rows.filter((t) => t[field] === selected.id);
  }, [selected, prepared, role]);

  /* Si el filtro deja fuera a la persona abierta, se cierra el detalle */
  useEffect(() => {
    if (selectedId && !people.some((p) => p.id === selectedId)) setSelectedId(null);
  }, [people, selectedId]);

  /* Paradas de la persona abierta (para tiempos en parada y tipo de captura) */
  useEffect(() => {
    if (!selected) { setDetail({ loading: false, analysis: null }); return undefined; }
    let active = true;
    setDetail({ loading: true, analysis: null });
    (async () => {
      const closed = selected.trips.filter((t) => t._completed).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 120);
      const out = [];
      for (let i = 0; i < closed.length; i += 8) {
        const chunk = closed.slice(i, i + 8);
        const res = await Promise.all(chunk.map(async (t) => {
          if (!stopsCache.current.has(t.id)) {
            try { stopsCache.current.set(t.id, await getTripStopsOnce(t.id)); } catch { return null; }
          }
          return { trip: t, stops: stopsCache.current.get(t.id) };
        }));
        res.forEach((r) => r && out.push(r));
        if (!active) return;
      }
      if (active) setDetail({ loading: false, analysis: analyzeStops(out), sample: out.length, of: closed.length });
    })().catch((e) => { console.error(e); if (active) setDetail({ loading: false, analysis: null }); });
    return () => { active = false; };
  }, [selected?.id, selected?.trips.length, role]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Efecto cascada: las tarjetas se deslizan a su nuevo lugar (técnica FLIP) */
  function registerRef(id, el) {
    if (el) cardRefs.current.set(id, el); else cardRefs.current.delete(id);
  }
  function pick(id) {
    prevRects.current = new Map();
    cardRefs.current.forEach((el, key) => prevRects.current.set(key, el.getBoundingClientRect()));
    setSelectedId((cur) => (cur === id ? null : id));
  }
  useLayoutEffect(() => {
    if (!prevRects.current.size) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cardRefs.current.forEach((el, key) => {
      const p = prevRects.current.get(key);
      if (!p || reduce) return;
      const n = el.getBoundingClientRect();
      const dx = p.left - n.left;
      const dy = p.top - n.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      }
    });
    prevRects.current = new Map();
  }, [selectedId]);

  /* Tarjeta abierta primero (arriba a la izquierda) */
  const ordered = useMemo(() => {
    if (!selected) return people;
    return [selected, ...people.filter((p) => p.id !== selected.id)];
  }, [people, selected]);

  /* Resumen general */
  const overview = useMemo(() => {
    const scored = people.filter((p) => p.kpis.score != null);
    const avg = scored.length ? scored.reduce((n, p) => n + p.kpis.score, 0) / scored.length : null;
    const count = (lv) => people.filter((p) => p.kpis.level === lv).length;
    return { avg, green: count('green'), amber: count('amber'), red: count('red') };
  }, [people]);

  const staffInfo = useMemo(() => (selected ? staffSummary(staff, selected.name, role) : null), [selected, staff, role]);

  return (
    <div className="page-fit flex flex-col gap-4">
      {/* Parte fija: título, filtros y resumen. Solo las tarjetas / el detalle se desplazan. */}
      <div className="shrink-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-h1">KPIs de operadores y nannies</h1>
          <p className="text-sm text-navy-400 mt-1">Desempeño por persona calculado con los recorridos, paradas y bitácora ya registrados en el sistema.</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="admin-card !p-3 flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-navy-200 overflow-hidden" role="tablist" aria-label="Rol">
          {[['operador', 'Operadores', Truck], ['nanny', 'Nannies', Users]].map(([key, label, Icon]) => (
            <button
              key={key} type="button" role="tab" aria-selected={role === key}
              onClick={() => { prevRects.current = new Map(); setRole(key); setSelectedId(null); }}
              className={`h-10 px-4 text-sm font-bold flex items-center gap-2 transition-colors ${role === key ? 'bg-navy-700 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div>
          <label className="admin-label">Desde</label>
          <input type="date" className="admin-input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="admin-label">Hasta</label>
          <input type="date" className="admin-input" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="admin-label">Turno</label>
          <select className="admin-select" value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="all">Todos</option>
            <option value="morning">Mañana</option>
            <option value="afternoon">Tarde</option>
          </select>
        </div>
        <div>
          <label className="admin-label">Ordenar por</label>
          <select className="admin-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="score-asc">Calificación (atención primero)</option>
            <option value="score-desc">Calificación (mejores primero)</option>
            <option value="name">Nombre</option>
          </select>
        </div>
        <button type="button" className="btn-admin-ghost" onClick={() => { setTo(today()); setFrom(addDays(today(), -30)); }}>
          <RefreshCw size={15} /> Últimos 30 días
        </button>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {from > to && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">La fecha inicial no puede ser posterior a la final.</p>}

      {/* Resumen general (solo cuando no hay una tarjeta abierta) */}
      {!selected && !loading && people.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile index={0} label={role === 'nanny' ? 'Nannies evaluadas' : 'Operadores evaluados'} value={`${people.filter((p) => p.kpis.score != null).length} de ${people.length}`} sub="las demás no tienen recorridos en el periodo" />
          <Tile index={1} label="Calificación promedio" value={overview.avg == null ? '—' : Math.round(overview.avg)} tone={LEVEL_COLORS[levelOf(overview.avg)]} />
          <Tile index={2} label="En verde" value={overview.green} tone={LEVEL_COLORS.green} sub="85 o más" />
          <Tile index={3} label="En atención / crítico" value={`${overview.amber} / ${overview.red}`} tone={overview.red ? LEVEL_COLORS.red : LEVEL_COLORS.amber} sub="70–84 / menos de 70" />
        </div>
      )}

      {loading && <p className="text-sm text-navy-400">Cargando recorridos…</p>}
      {!loading && !people.length && !error && (
        <div className="admin-card text-sm text-navy-500">No hay {role === 'nanny' ? 'nannies' : 'operadores'} en el catálogo ni recorridos en este periodo.</div>
      )}
      </div>

      {/* Tarjetas + detalle: cada columna se desplaza por su cuenta (en escritorio) */}
      <div className={`flex-1 min-h-0 ${selected ? 'flex flex-col lg:flex-row gap-4 lg:overflow-hidden' : 'lg:overflow-y-auto lg:pr-1'}`}>
        <div
          className={selected
            ? 'w-full lg:w-[300px] shrink-0 flex flex-col gap-2 lg:overflow-y-auto lg:min-h-0 lg:pr-1'
            : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 content-start'}
        >
          {ordered.map((p, i) => (
            <PersonCard
              key={`${role}-${p.id}`}
              person={p}
              role={role}
              index={i}
              compact={!!selected && p.id !== selected.id}
              selected={selected?.id === p.id}
              onClick={() => pick(p.id)}
              registerRef={(id, el) => registerRef(`${role}-${id}`, el)}
            />
          ))}
        </div>

        {selected && (
          <Detail
            key={`${role}-${selected.id}`}
            person={selected}
            role={role}
            detail={detail}
            staffInfo={staffInfo}
            from={from}
            to={to}
            routesById={routesById}
            unitsById={unitsById}
            onClose={() => pick(selected.id)}
            catalog={drivers}
            allTrips={allTripsOfSelected}
            by={profile}
            onReassigned={() => { setSelectedId(null); setReloadKey((n) => n + 1); }}
          />
        )}
      </div>

      {!selected && (
      <p className="shrink-0 text-[11px] text-navy-400">
        Notas: la duración se compara contra el promedio de la misma ruta y turno entre todos los recorridos del periodo (se excluyen cierres hechos por Dirección y duraciones menores a 3 min o mayores a 6 h).
        Los avisos solo cuentan los que no se limpiaron al resolverse. La bitácora se relaciona por nombre exacto con Nómina.
      </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detalle de una persona                                              */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Persona sin nombre: reasignar sus recorridos                        */
/* ------------------------------------------------------------------ */
function OrphanPanel({ person, role, catalog, allTrips, routesById, by, onDone }) {
  const isNanny = role === 'nanny';
  const field = isNanny ? 'nannyId' : 'driverId';
  const candidates = useMemo(
    () => catalog.filter((d) => d.name && (isNanny ? d.role === 'nanny' : d.role !== 'nanny' && d.role !== 'cashier')),
    [catalog, isNanny],
  );
  // Sugerencia: quien tiene asignada hoy la ruta donde más aparece este id
  const suggested = useMemo(() => {
    const count = new Map();
    allTrips.forEach((t) => count.set(t.routeId, (count.get(t.routeId) || 0) + 1));
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    const id = top ? routesById.get(top[0])?.[field] : '';
    return candidates.some((d) => d.id === id) ? id : '';
  }, [allTrips, routesById, candidates, field]);
  const [target, setTarget] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const routeNames = [...new Set(allTrips.map((t) => routesById.get(t.routeId)?.name).filter(Boolean))];

  async function apply(newId) {
    const msg = newId
      ? `¿Pasar ${allTrips.length} recorrido(s) a ${candidates.find((d) => d.id === newId)?.name}? Sus KPIs se recalcularán.`
      : `¿Quitar ${isNanny ? 'la nannie' : 'el operador'} de ${allTrips.length} recorrido(s)? Dejarán de contar en los KPIs de cualquier persona.`;
    if (!window.confirm(msg)) return;
    setBusy(true); setError('');
    try { await adminReassignTrips(allTrips, field, newId, by); onDone(); }
    catch (e) { console.error(e); setError(e?.message || 'No se pudo reasignar.'); }
    setBusy(false);
  }

  return (
    <section className="admin-card !p-4 border border-amber-300 bg-amber-50/60 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-900">
          <p className="font-bold">
            {person.inCatalog
              ? 'Este registro existe en el catálogo pero no tiene nombre.'
              : 'Estos recorridos apuntan a un id que ya no existe en el catálogo (persona dada de baja o cruce erróneo).'}
          </p>
          <p className="mt-1 text-xs">
            ID: <code className="font-mono">{person.id}</code> · {allTrips.length} recorrido(s) en el periodo
            {routeNames.length ? ` · rutas: ${routeNames.join(', ')}` : ''}.
            {person.inCatalog && ' Puedes ponerle nombre en Operadores y nannies, o reasignar sus recorridos aquí.'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="admin-label">Reasignar a</label>
          <select className="admin-select" value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
            <option value="">— elige —</option>
            {candidates.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button type="button" className="btn-admin-primary" disabled={!target || busy || !allTrips.length} onClick={() => apply(target)}>
          {busy ? 'Guardando…' : 'Reasignar recorridos'}
        </button>
        <button type="button" className="btn-admin-ghost" disabled={busy || !allTrips.length} onClick={() => apply('')}>
          Quitar de los recorridos
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <p className="text-[11px] text-amber-800">Se guarda el id original en cada recorrido y no cuenta como «corrección de Dirección» para nadie.</p>
    </section>
  );
}

function Detail({ person, role, detail, staffInfo, from, to, routesById, unitsById, onClose, catalog, allTrips, by, onReassigned }) {
  const [lightbox, setLightbox] = useState(null);
  const k = person.kpis;
  const color = LEVEL_COLORS[k.level];
  const a = detail.analysis;
  const isNanny = role === 'nanny';

  const statusData = [
    { label: 'Cerrados por la persona', value: k.closedOwn, color: '#16a34a' },
    { label: 'Cerrados por Dirección', value: k.closedAdmin, color: '#f59e0b' },
    { label: 'Sin cerrar', value: k.open, color: '#dc2626' },
  ];
  const studentsData = [
    { label: 'Atendidos', value: k.stResolved, color: '#16a34a' },
    { label: 'Ausentes', value: k.stAbsent, color: '#94a3b8' },
    { label: 'Pendientes al cierre', value: k.stPending, color: '#dc2626' },
  ];
  const kmData = [
    { label: 'Sin incidencia', value: Math.max(0, k.kmWithData - k.kmBad), color: '#16a34a' },
    { label: 'Hueco de odómetro', value: k.kmGaps, color: '#f59e0b' },
    { label: 'Km final menor al inicial', value: k.kmOrderBad, color: '#dc2626' },
  ];
  const corrData = [
    { label: 'Sin corrección', value: Math.max(0, k.total - k.corrected), color: '#16a34a' },
    { label: 'Corregidos por Dirección', value: k.corrected, color: '#E0714A' },
  ];
  const alertData = Object.entries(k.alerts).map(([type, value]) => ({ label: ALERT_LABEL[type] || type, value }));
  const waitData = a ? [
    { label: 'Hasta 2 min', value: a.wait.fast, color: '#16a34a' },
    { label: '2 a 5 min', value: a.wait.mid, color: '#f59e0b' },
    { label: 'Más de 5 min', value: a.wait.slow, color: '#dc2626' },
  ] : [];
  const captureData = a ? [
    { label: 'Uno por uno', value: a.capture.manual, color: '#12405f' },
    { label: 'Masiva', value: a.capture.bulk, color: '#7C6FE0' },
    { label: 'Dirección', value: a.capture.admin, color: '#E0714A' },
    { label: 'Otro / sin dato', value: a.capture.otro, color: '#94a3b8' },
  ] : [];

  const tiles = isNanny
    ? [
        ['Alumnos atendidos', fmtPct(k.values.resueltos), `${fmt0(k.stResolved)} de ${fmt0(k.stDen)}`],
        ['Pendientes al cierre', fmt0(k.stPending), 'alumnos sin atender'],
        ['Ausentes registrados', fmt0(k.stAbsent), `de ${fmt0(k.stTotal)} en lista`],
        ['Recorridos cerrados', `${k.completed}/${k.total}`, fmtPct(k.values.cumplimiento)],
        ['Correcciones de Dirección', fmt0(k.corrected), `${fmt0(k.corrEntries)} cambios`],
        ['Días en bitácora', fmt0(staffInfo?.days), 'registros en Nómina'],
        ['Suplencias', fmt0(staffInfo?.substitutions), 'días con sustituto'],
        ['Avisos en ruta', fmt0(k.alertsTotal), 'sin resolver'],
      ]
    : [
        ['Recorridos cerrados', `${k.completed}/${k.total}`, fmtPct(k.values.cumplimiento)],
        ['Cerrados por el operador', fmtPct(k.values.cierrePropio), `${k.closedAdmin} por Dirección`],
        ['Duración promedio', k.avgDur == null ? '—' : `${fmt1(k.avgDur)} min`, k.avgPeerDur == null ? '' : `prom. de su ruta ${fmt1(k.avgPeerDur)} min`],
        ['Km recorridos', fmt0(k.kmTotal), `${k.kmWithData} recorridos con odómetro`],
        ['Incidencias de odómetro', fmt0(k.kmBad), `${k.kmGaps} huecos · ${k.kmOrderBad} invertidos`],
        ['Correcciones de Dirección', fmt0(k.corrected), `${fmt0(k.corrEntries)} cambios`],
        ['Ausentes en sus listas', fmt0(k.stAbsent), `de ${fmt0(k.stTotal)} alumnos`],
        ['Días en bitácora', fmt0(staffInfo?.days), `${fmt0(staffInfo?.substitutions)} suplencia(s) · ${fmt0(staffInfo?.withoutNanny)} día(s) sin nannie`],
      ];

  if (person.nannyLed) {
    tiles.push(isNanny
      ? ['Viajes que inició ella', fmt0(person.nannyLed), 'operador sin acceso']
      : ['Viajes llevados por la nannie', fmt0(person.nannyLed), 'no se te califican']);
  }

  const recent = [...person.trips].sort((x, y) => String(y.date).localeCompare(String(x.date)) || (y._start || 0) - (x._start || 0)).slice(0, 15);
  const loadingNote = detail.loading ? <p className="text-xs text-navy-400">Cargando paradas…</p> : <p className="text-xs text-navy-400">Sin datos de paradas en el periodo.</p>;

  return (
    <div className="flex-1 min-w-0 w-full space-y-4 kpi-slide-in lg:overflow-y-auto lg:min-h-0 lg:pr-1">
      <div className="admin-card !p-4 flex flex-wrap items-center gap-4" style={{ borderTop: `4px solid ${color}` }}>
        <ScoreRing score={k.score} color={color} size={84} stroke={8} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-navy-900">{person.name}</h2>
            <LevelBadge level={k.level} />
          </div>
          <p className="text-xs text-navy-400 mt-0.5">
            {isNanny ? 'Nannie' : 'Operador'} · del {from} al {to} · {k.total} recorrido{k.total === 1 ? '' : 's'}
            {person.phone ? ` · ${person.phone}` : ''}
          </p>
        </div>
        <button type="button" className="btn-admin-ghost" onClick={onClose}><X size={15} /> Cerrar</button>
      </div>

      {person.orphan && (
        <OrphanPanel person={person} role={role} catalog={catalog} allTrips={allTrips} routesById={routesById} by={by} onDone={onReassigned} />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(([label, value, sub], i) => <Tile key={label} index={i} label={label} value={value} sub={sub} />)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {!isNanny && (
          <>
            <ChartCard index={0} title="Estado de sus recorridos" hint="Quién los cerró o si quedaron abiertos">
              <Donut data={statusData} centerTop={`${k.completed}/${k.total}`} centerBottom="cerrados" />
            </ChartCard>
            <ChartCard index={1} title="Duración promedio por recorrido (min)" hint={k.avgPeerDur != null ? 'La línea punteada es el promedio de las mismas rutas y turnos' : ''}>
              <Bars data={k.series.duration} unit=" min" refLine={k.avgPeerDur ?? undefined} refLabel="prom. de su ruta" />
            </ChartCard>
            <ChartCard index={2} title="Kilómetros recorridos">
              <Bars data={k.series.km} color="#1E9E96" unit=" km" />
            </ChartCard>
            <ChartCard index={3} title="Odómetro" hint="Huecos mayores a 100 km entre recorridos de la misma unidad o km final menor al inicial">
              {k.kmWithData ? <Donut data={kmData} centerTop={fmt0(k.kmBad)} centerBottom="incidencias" /> : <p className="text-xs text-navy-400">Sin lecturas de odómetro.</p>}
            </ChartCard>
            <ChartCard index={4} title="Tiempo en parada" hint="De «Llegué» al registro del alumno (solo captura uno por uno)">
              {a && a.wait.n ? <Donut data={waitData} centerTop={a.avgWaitSec != null ? `${Math.round(a.avgWaitSec)}s` : ''} centerBottom="promedio" /> : loadingNote}
            </ChartCard>
            <ChartCard index={5} title="Correcciones de Dirección" hint="Recorridos que Dirección tuvo que editar después de cerrados">
              <Donut data={corrData} centerTop={fmt0(k.corrected)} centerBottom="corregidos" />
            </ChartCard>
            {alertData.length > 0 && (
              <ChartCard index={6} title="Avisos en ruta" hint="Tipos de aviso que reportó y siguen registrados">
                <Donut data={alertData} centerTop={fmt0(k.alertsTotal)} centerBottom="avisos" />
              </ChartCard>
            )}
          </>
        )}

        {isNanny && (
          <>
            <ChartCard index={0} title="Alumnos en sus recorridos" hint="Atendidos, ausentes y pendientes al cierre">
              <Donut data={studentsData} centerTop={fmtPct(k.values.resueltos)} centerBottom="atendidos" />
            </ChartCard>
            <ChartCard index={1} title="% de alumnos atendidos por periodo" hint="100 % = todos los alumnos presentes fueron atendidos">
              <Bars data={k.series.resolved} color="#16a34a" unit="%" maxValue={100} />
            </ChartCard>
            <ChartCard index={2} title="Cómo registra a los alumnos" hint="Uno por uno es lo ideal; masiva = botón para todos a la vez">
              {a && (a.capture.manual + a.capture.bulk + a.capture.admin + a.capture.otro) > 0
                ? <Donut data={captureData} centerTop={fmtPct(a.capture.manual / Math.max(1, a.capture.manual + a.capture.bulk + a.capture.admin + a.capture.otro))} centerBottom="uno por uno" />
                : loadingNote}
            </ChartCard>
            <ChartCard index={3} title="Tiempo en parada" hint="De «Llegué» al registro del alumno (solo captura uno por uno)">
              {a && a.wait.n ? <Donut data={waitData} centerTop={a.avgWaitSec != null ? `${Math.round(a.avgWaitSec)}s` : ''} centerBottom="promedio" /> : loadingNote}
            </ChartCard>
            <ChartCard index={4} title="Estado de sus recorridos">
              <Donut data={statusData} centerTop={`${k.completed}/${k.total}`} centerBottom="cerrados" />
            </ChartCard>
            <ChartCard index={5} title="Correcciones de Dirección" hint={a ? `${a.correctedStops} parada(s) de alumnos corregidas por Dirección` : 'Recorridos que Dirección tuvo que editar'}>
              <Donut data={corrData} centerTop={fmt0(k.corrected)} centerBottom="corregidos" />
            </ChartCard>
          </>
        )}
      </div>

      {/* Tareas con evidencia (fotos en Drive) */}
      {person.tasks.length > 0 && person.tasks.map(({ ind, comp }, ti) => {
        const photos = comp.items.flatMap((it) => (it.ev?.photos || []).map((photo) => ({
          photo, state: it.state, date: it.date,
          caption: `${ind.name} · ${it.date}${it.ev?.unitId && unitsById.get(it.ev.unitId) ? ` · ${unitsById.get(it.ev.unitId).plate}` : ''} · ${EVIDENCE_STATES[it.state].label}`,
        })));
        const donut = Object.entries(EVIDENCE_STATES).map(([key, st]) => ({ label: st.label, value: comp.counts[key], color: st.color }));
        return (
          <section key={ind.id} className="cascade-item admin-card !p-4" style={cascadeStyle(8 + ti, 70, 700)}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-navy-800">{ind.name}</h3>
              <p className="text-[11px] text-navy-400">
                {comp.expected ? `${comp.expected} día(s) programados · cumplimiento ${fmtPct(comp.value)}` : 'Sin días vencidos en el periodo'}
                {comp.items.some((it) => it.ev?.manual) ? ` · ${comp.items.filter((it) => it.ev?.manual).length} capturado(s) manualmente` : ''} · peso {ind.weight}
              </p>
            </div>
            {comp.expected > 0 && (
              <div className="mt-2"><Donut data={donut} centerTop={fmtPct(comp.value)} centerBottom="cumplimiento" /></div>
            )}
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-3">
                {photos.map((ph, i) => (
                  <figure key={ph.photo.fileId} className="relative">
                    <DriveImg photo={ph.photo} width={300} className="w-full aspect-square" onClick={() => setLightbox({ items: photos, index: i })} />
                    <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white rounded px-1" style={{ background: EVIDENCE_STATES[ph.state].color }}>{ph.date.slice(5)}</span>
                  </figure>
                ))}
              </div>
            ) : <p className="text-xs text-navy-400 mt-3">Sin fotos en el periodo.</p>}
          </section>
        );
      })}
      {lightbox && <PhotoLightbox items={lightbox.items} index={lightbox.index} onIndex={(i) => setLightbox((l) => ({ ...l, index: i }))} onClose={() => setLightbox(null)} />}

      {/* Cómo se calcula la calificación */}
      <section className="cascade-item admin-card !p-4" style={cascadeStyle(9, 70, 700)}>
        <h3 className="text-sm font-bold text-navy-800">Cómo se calculó la calificación</h3>
        <p className="text-[11px] text-navy-400 mb-2">Cada indicador vale de 0 a 100 % y se multiplica por su peso. Si falta un dato, el resto se reparte para sumar 100.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-navy-400 border-b border-navy-100">
                <th className="py-1.5 pr-3">Indicador</th><th className="py-1.5 pr-3 text-right">Resultado</th><th className="py-1.5 pr-3 text-right">Peso</th><th className="py-1.5 text-right">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {k.components.map((c) => (
                <tr key={c.key} className="border-b border-navy-50">
                  <td className="py-1.5 pr-3 text-navy-700">{c.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.value == null ? 'sin datos' : fmtPct(c.value)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-navy-500">{c.value == null ? '—' : `${fmt1(c.effectiveWeight)}%`}</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold">{c.points == null ? '—' : fmt1(c.points)}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 font-bold text-navy-900" colSpan={3}>Calificación general</td>
                <td className="pt-2 text-right font-bold tabular-nums" style={{ color }}>{k.score == null ? '—' : fmt1(k.score)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Últimos recorridos */}
      <section className="cascade-item admin-card !p-4" style={cascadeStyle(10, 70, 750)}>
        <h3 className="text-sm font-bold text-navy-800 mb-2">Últimos recorridos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-navy-400 border-b border-navy-100">
                <th className="py-1.5 pr-3">Fecha</th><th className="py-1.5 pr-3">Ruta</th><th className="py-1.5 pr-3">Turno</th><th className="py-1.5 pr-3">Unidad</th>
                <th className="py-1.5 pr-3">Estado</th><th className="py-1.5 pr-3 text-right">Min</th><th className="py-1.5 pr-3 text-right">Km</th><th className="py-1.5 text-right">Alumnos</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-b border-navy-50">
                  <td className="py-1.5 pr-3 tabular-nums">{t.date}</td>
                  <td className="py-1.5 pr-3">{routesById.get(t.routeId)?.name || '—'}</td>
                  <td className="py-1.5 pr-3">{SHIFT_LABEL[t.shift] || t.shift}</td>
                  <td className="py-1.5 pr-3">{unitsById.get(t.unitId)?.plate || '—'}</td>
                  <td className="py-1.5 pr-3">
                    {STATUS_LABEL[t.status] || t.status}
                    {t.closedByAdmin ? ' (Dirección)' : ''}{t.correctedByAdmin ? ' · corregido' : ''}{t._gap ? ' · hueco km' : ''}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{t._dur == null ? '—' : fmt0(t._dur)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{t._km == null ? '—' : fmt0(t._km)}</td>
                  <td className="py-1.5 text-right tabular-nums">{t._completed ? `${t.studentsResolved ?? 0}/${Math.max(0, (t.studentsTotal ?? 0) - (t.studentsAbsent ?? 0))}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
