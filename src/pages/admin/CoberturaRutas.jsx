import { useEffect, useMemo, useState } from 'react';
import { Repeat, Trash2, Users, ChevronDown, Sun, Sunset, UserX } from 'lucide-react';
import { Routes, Drivers } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';
import {
  listCoveragesFrom, saveCoverage, removeCoverage, saveCoverageExclusions, coverageId, SHIFT_LABEL,
} from '../../firebase/coverages';
import { todayString } from '../../firebase/trips';
import { loadShiftRosters, levelText } from '../../utils/rosterView';

/**
 * Cobertura de rutas · solo admin
 * Cuando un operador va a faltar y otro toma su ruta, se reasigna SOLO ese viaje
 * (un día y un turno, o todo el día): la ruta sigue siendo del operador de siempre.
 *  · El sustituto ve la ruta en su pantalla ese día y la inicia con su cuenta:
 *    el recorrido, los km y los KPIs quedan a su nombre.
 *  · El operador que faltó no ve esa ruta ese día y no recibe nada en sus KPIs.
 *  · «Detalle»: muestra los alumnos de ida y de vuelta de ese día y permite marcar
 *    quién NO irá, para que la lista del operador sea exacta. Sin cambios, todo queda igual.
 */
const fmt = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const countOff = (c) => (c.excluded?.morning?.length || 0) + (c.excluded?.afternoon?.length || 0);
const SHIFT_TABS = { morning: { label: 'Ida', Icon: Sun }, afternoon: { label: 'Vuelta', Icon: Sunset } };

/** Detalle de una cobertura: alumnos de ida y de vuelta, con «No irá» por alumno. */
function CoverageDetail({ cover, route, by, onSaved }) {
  const [data, setData] = useState(null); // { ida, vuelta }
  const [error, setError] = useState('');
  const [off, setOff] = useState({ morning: new Set(cover.excluded?.morning || []), afternoon: new Set(cover.excluded?.afternoon || []) });
  const shifts = (cover.shift === 'both' ? ['morning', 'afternoon'] : [cover.shift]).filter((sh) => !(route?.kind === 'taller' && sh === 'morning'));
  const [tab, setTab] = useState(shifts[0] || 'afternoon');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    if (!route) { setError('La ruta de esta cobertura ya no existe.'); return undefined; }
    loadShiftRosters(route, cover.date)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { console.error(e); if (!cancelled) setError(e?.message || 'No se pudieron cargar los alumnos.'); });
    return () => { cancelled = true; };
  }, [route?.id, cover.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = (sh) => new Set(cover.excluded?.[sh] || []);
  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const dirty = shifts.some((sh) => !sameSet(off[sh], saved(sh)));

  const list = data ? (tab === 'morning' ? data.ida : data.vuelta) : [];
  const offHere = list.filter((s) => off[tab].has(s.id)).length;

  function toggle(id) {
    setMsg('');
    setOff((prev) => {
      const next = new Set(prev[tab]);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, [tab]: next };
    });
  }
  function resetTab() { setMsg(''); setOff((prev) => ({ ...prev, [tab]: new Set() })); }

  async function save() {
    setSaving(true); setMsg('');
    try {
      // Solo se guardan los alumnos que de verdad están en la lista de ese turno.
      const keep = (sh, rows) => [...off[sh]].filter((id) => rows.some((s) => s.id === id));
      await saveCoverageExclusions(cover.id, {
        morning: shifts.includes('morning') ? keep('morning', data.ida) : [...saved('morning')],
        afternoon: shifts.includes('afternoon') ? keep('afternoon', data.vuelta) : [...saved('afternoon')],
      }, by);
      setMsg('Guardado. La lista del operador ya sale con estos cambios.');
      await onSaved();
    } catch (e) { setMsg(e?.message || 'No se pudo guardar.'); }
    setSaving(false);
  }

  return (
    <div className="border-t border-navy-100 bg-navy-50/60 px-4 py-3 space-y-3">
      {error && <p className="text-xs text-red-700">{error}</p>}
      {!error && !data && <p className="text-sm text-navy-400">Cargando alumnos…</p>}
      {data && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {shifts.map((sh) => {
              const { label, Icon } = SHIFT_TABS[sh];
              const rows = sh === 'morning' ? data.ida : data.vuelta;
              const n = rows.filter((s) => !off[sh].has(s.id)).length;
              return (
                <button
                  key={sh} type="button" onClick={() => setTab(sh)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${tab === sh ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-navy-700 border-navy-200 hover:bg-navy-50'}`}
                >
                  <Icon size={13} /> {label} · {n}{off[sh].size ? ` de ${rows.length}` : ''}
                </button>
              );
            })}
            <span className="text-[11px] text-navy-400 ml-auto">Ya considera la lista del periodo y el calendario escolar.</span>
          </div>

          {data.calendarDay && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] px-3 py-1.5">
              Ese día tiene ajuste en el calendario escolar{data.calendarDay.reason ? ` (${data.calendarDay.reason})` : ''}: solo salen los niveles que sí asisten.
            </p>
          )}

          {!list.length ? (
            <p className="text-sm text-navy-400 py-2">Nadie tiene servicio en {SHIFT_TABS[tab].label.toLowerCase()} ese día.</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-navy-600">
                <span><b>{list.length - offHere}</b> irán · <b className={offHere ? 'text-red-700' : ''}>{offHere}</b> no irán</span>
                {off[tab].size > 0 && <button type="button" className="underline font-semibold" onClick={resetTab}>Quitar marcas de {SHIFT_TABS[tab].label.toLowerCase()}</button>}
              </div>
              <ul className="max-h-72 overflow-auto rounded-lg border border-navy-100 bg-white divide-y divide-navy-100">
                {list.map((s, i) => {
                  const isOff = off[tab].has(s.id);
                  return (
                    <li key={s.id}>
                      <label className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${isOff ? 'bg-red-50' : 'hover:bg-navy-50'}`}>
                        <span className="w-6 text-[11px] text-navy-400 tabular-nums text-right shrink-0">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm truncate ${isOff ? 'line-through text-navy-400' : 'font-medium text-navy-800'}`}>{s.name}</span>
                          <span className="block text-[11px] text-navy-400 truncate">{[s.matricula, levelText(s)].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${isOff ? 'text-red-700' : 'text-navy-500'}`}>
                          {isOff && <UserX size={13} />} No irá
                          <input type="checkbox" className="w-4 h-4 accent-red-600" checked={isOff} onChange={() => toggle(s.id)} />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className="btn-admin-primary" onClick={save} disabled={saving || !dirty}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            <p className="text-[11px] text-navy-500">
              {dirty ? 'Tienes cambios sin guardar.' : 'Sin cambios: todo en orden, la lista queda como la arma la ruta.'}
            </p>
          </div>
          {msg && <p className="text-xs text-navy-600">{msg}</p>}
        </>
      )}
    </div>
  );
}

export default function CoberturaRutas() {
  const { profile } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(todayString());
  const [routeId, setRouteId] = useState('');
  const [shift, setShift] = useState('both');
  const [driverId, setDriverId] = useState('');
  const [reason, setReason] = useState('');
  const [openId, setOpenId] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [ro, dr, cov] = await Promise.all([Routes.list(), Drivers.list(), listCoveragesFrom(todayString())]);
      setRoutes((ro || []).filter((r) => r.kind !== 'taller').sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')));
      setDrivers((dr || []).filter((d) => d.role !== 'nanny' && d.role !== 'cashier').sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')));
      setRows(cov || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo cargar. ¿Ya publicaste las reglas de Firestore nuevas?');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const driverById = useMemo(() => Object.fromEntries(drivers.map((d) => [d.id, d])), [drivers]);
  const routeById = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);
  const route = routes.find((r) => r.id === routeId);
  const original = route ? driverById[route.driverId] : null;

  async function save() {
    setMsg('');
    if (!routeId || !driverId) { setMsg('Elige la ruta y el operador que la cubre.'); return; }
    if (route?.driverId === driverId) { setMsg('Ese operador ya es el de la ruta. Elige a otra persona.'); return; }
    setSaving(true);
    try {
      await saveCoverage({
        routeId, routeName: route?.name, date, shift, driverId, driverName: driverById[driverId]?.name,
        originalDriverId: route?.driverId, reason,
      }, profile?.name || '');
      setMsg(`Listo: ${driverById[driverId]?.name} cubre ${route?.name} el ${fmt(date)} (${SHIFT_LABEL[shift].toLowerCase()}). Revisa el detalle de alumnos abajo.`);
      setReason('');
      setOpenId(coverageId(routeId, date, shift));
      await load();
    } catch (e) { setMsg(e?.message || 'No se pudo guardar.'); }
    setSaving(false);
  }
  async function remove(c) {
    if (!window.confirm(`¿Quitar la cobertura de ${c.routeName} del ${fmt(c.date)}? La ruta vuelve a su operador.`)) return;
    try { await removeCoverage(c.id); if (openId === c.id) setOpenId(''); await load(); } catch (e) { setMsg(e?.message || 'No se pudo quitar.'); }
  }
  // Recarga la lista sin cerrar el detalle abierto ni mostrar «Cargando…».
  async function refreshRows() {
    try { setRows((await listCoveragesFrom(todayString())) || []); } catch (e) { console.error(e); }
  }

  return (
    <div className="page-fit flex flex-col gap-4">
      <div className="shrink-0">
        <h1 className="admin-h1 mb-1 flex items-center gap-2"><Repeat size={22} /> Cobertura de rutas</h1>
        <p className="text-sm text-navy-400 max-w-3xl">
          Cuando un operador falta y otro toma su ruta, reasigna solo ese viaje. El recorrido, los km y los KPIs quedan a nombre de quien lo maneja.
          Con «Detalle» ves los alumnos de ida y vuelta de ese día y marcas quién no irá.
        </p>
      </div>
      {error && <p className="shrink-0 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] gap-4">
        <div className="admin-card space-y-3 lg:overflow-y-auto lg:min-h-0 self-start lg:self-stretch">
          <p className="font-display font-semibold text-sm text-navy-800">Nueva cobertura</p>
          <div><label className="admin-label">Fecha</label><input type="date" className="admin-input" value={date} min={todayString()} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <label className="admin-label">Ruta</label>
            <select className="admin-select" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">Selecciona…</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {route && <p className="text-[11px] text-navy-400 mt-1">Operador de la ruta: <b>{original?.name || 'sin asignar'}</b></p>}
          </div>
          <div>
            <label className="admin-label">Turno</label>
            <div className="flex rounded-lg border border-navy-200 overflow-hidden">
              {Object.entries(SHIFT_LABEL).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setShift(key)} className={`flex-1 h-10 text-xs font-bold ${shift === key ? 'bg-navy-700 text-white' : 'bg-white text-navy-600 hover:bg-navy-50'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="admin-label">Operador que la cubre</label>
            <select className="admin-select" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Selecciona…</option>
              {drivers.filter((d) => d.id !== route?.driverId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><label className="admin-label">Motivo (opcional)</label><input className="admin-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Falta por enfermedad, permiso…" /></div>
          <p className="rounded-lg bg-navy-50 text-[11px] text-navy-600 px-3 py-2">
            El sustituto necesita su acceso a la app de operadores. Si cubre dos rutas, el sistema le muestra ambas ese día.
            Al guardar se abre el detalle de alumnos: si no haces cambios, todo queda en orden.
          </p>
          <button type="button" className="btn-admin-primary" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cobertura'}</button>
          {msg && <p className="text-xs text-navy-600">{msg}</p>}
        </div>

        <div className="admin-card !p-0 flex flex-col min-h-0 min-w-0">
          <div className="shrink-0 p-4 border-b border-navy-100"><p className="font-display font-semibold text-sm text-navy-800">Coberturas de hoy en adelante ({rows.length})</p></div>
          <div className="flex-1 min-h-0 overflow-auto divide-y divide-navy-100">
            {loading && <p className="p-4 text-sm text-navy-400">Cargando…</p>}
            {!loading && !rows.length && <p className="p-6 text-center text-sm text-navy-400">No hay coberturas programadas.</p>}
            {rows.map((c) => {
              const open = openId === c.id;
              const off = countOff(c);
              return (
                <div key={c.id}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-24 shrink-0"><p className="text-sm font-semibold first-letter:uppercase">{fmt(c.date)}</p><p className="text-[10px] text-navy-400">{SHIFT_LABEL[c.shift]}</p></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{c.routeName}</p>
                      <p className="text-xs text-navy-600">Cubre: <b>{c.driverName}</b>{driverById[c.originalDriverId] ? ` · en lugar de ${driverById[c.originalDriverId].name}` : ''}</p>
                      {c.reason && <p className="text-[11px] text-navy-400">{c.reason}</p>}
                      {off > 0 && <p className="text-[11px] font-semibold text-red-700 mt-0.5">{off} alumno(s) marcados «no irá»</p>}
                    </div>
                    <button
                      type="button" onClick={() => setOpenId(open ? '' : c.id)} aria-expanded={open}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${open ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-navy-700 border-navy-200 hover:bg-navy-50'}`}
                    >
                      <Users size={14} /> Detalle <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    <button type="button" className="link-danger shrink-0" onClick={() => remove(c)} aria-label="Quitar"><Trash2 size={15} /></button>
                  </div>
                  {open && <CoverageDetail cover={c} route={routeById[c.routeId]} by={profile?.name || ''} onSaved={refreshRows} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
