import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Save, Play, Trash2, RefreshCw, Search, Crosshair, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  Students, Routes, Schools, Units, Drivers, PricingConcepts, RouteLists, FinanceRecords, RouteDrafts,
} from '../../firebase/services';
import { geocodeAddress, resolveStudentLocation } from '../../firebase/geocoding';
import { buildStudentRow, financePayload, invalidateListReviewPatch, priorityCompare } from './RouteBuilder';
import { schoolIcon } from '../../utils/mapIcons';

/**
 * Planeación (solo admin)
 *  1) Cobertura: ubica los planteles en el mapa y sombrea el radio de cobertura
 *     (5 km por defecto) para ver si la zona de un alumno o dirección está cubierta.
 *  2) Rutas y borradores: ve en el mapa a los alumnos de las rutas que elijas,
 *     propón moverlos de ruta y guarda el borrador. NADA cambia hasta presionar
 *     «Ejecutar»; al ejecutar se actualizan alumno, listas y registros de Finanzas.
 */

const MEXICO_CITY = [19.4326, -99.1332];
const ROUTE_COLORS = ['#0d9488', '#7c3aed', '#f97316', '#0ea5e9', '#65a30d', '#db2777', '#eab308', '#475569', '#dc2626', '#0891b2'];
const colorOf = (routeId) => {
  if (!routeId) return '#94a3b8';
  let h = 0;
  for (let i = 0; i < routeId.length; i += 1) h = (h * 31 + routeId.charCodeAt(i)) >>> 0;
  return ROUTE_COLORS[h % ROUTE_COLORS.length];
};
const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const num = (v) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v !== null ? n : null; };
const schoolLoc = (s) => {
  if (s?.geocodedLocation?.lat != null) return { lat: Number(s.geocodedLocation.lat), lng: Number(s.geocodedLocation.lng) };
  const lat = num(s?.latitude); const lng = num(s?.longitude);
  return lat != null && lng != null ? { lat, lng } : null;
};
const studentLoc = (s) => (s?.geocodedLocation?.lat != null ? { lat: Number(s.geocodedLocation.lat), lng: Number(s.geocodedLocation.lng) } : null);
function meters(a, b) {
  const R = 6371000; const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const km = (m) => `${(m / 1000).toFixed(1)} km`;
const hasPayments = (r) => !!(r.paid || Number(r.paidAmount || 0) > 0 || (r.paidDates || []).length > 0);

function Fit({ points, keyId }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(points, { padding: [30, 30], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId]);
  return null;
}
function ClickCatcher({ active, onPick }) {
  useMapEvents({ click(e) { if (active) onPick(e.latlng); } });
  return null;
}

export default function Planeacion() {
  const { profile, user } = useAuth();
  const [tab, setTab] = useState('cobertura');
  const [students, setStudents] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [schools, setSchools] = useState([]);
  const [units, setUnits] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [lists, setLists] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [st, ro, sc, un, dr, co, li, dd] = await Promise.all([
        Students.list(), Routes.list(), Schools.list(), Units.list(), Drivers.list(),
        PricingConcepts.list(), RouteLists.list(), RouteDrafts.list().catch(() => []),
      ]);
      setStudents(st || []); setRoutes(ro || []); setSchools(sc || []); setUnits(un || []);
      setDrivers(dr || []); setConcepts(co || []); setLists(li || []); setDrafts(dd || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudieron cargar los datos.');
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const routeById = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);
  const schoolsWithLoc = useMemo(() => schools.map((s) => ({ ...s, loc: schoolLoc(s) })).filter((s) => s.loc), [schools]);

  /* ----------------------- Ubicar alumnos pendientes ----------------------- */
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoDone, setGeoDone] = useState(0);
  const stopGeo = useRef(false);
  const pending = useMemo(() => students.filter((s) => !studentLoc(s) && (s.address || '').trim()), [students]);
  const noAddress = useMemo(() => students.filter((s) => !studentLoc(s) && !(s.address || '').trim()).length, [students]);
  async function geocodePending() {
    stopGeo.current = false; setGeoBusy(true); setGeoDone(0);
    let n = 0;
    for (const s of pending) {
      if (stopGeo.current) break;
      const loc = await resolveStudentLocation(s, null);
      n += 1; setGeoDone(n);
      if (loc?.lat) setStudents((prev) => prev.map((x) => (x.id === s.id ? { ...x, geocodedLocation: loc } : x)));
    }
    setGeoBusy(false);
  }

  /* ============================== COBERTURA ============================== */
  const [radiusKm, setRadiusKm] = useState(5);
  const [placingId, setPlacingId] = useState('');
  const [showStudents, setShowStudents] = useState(true);
  const [addr, setAddr] = useState('');
  const [addrRes, setAddrRes] = useState(null);
  const [addrBusy, setAddrBusy] = useState(false);

  async function placeSchool(latlng) {
    if (!placingId) return;
    const lat = Number(latlng.lat.toFixed(6)); const lng = Number(latlng.lng.toFixed(6));
    try {
      await Schools.update(placingId, { latitude: lat, longitude: lng, geocodedLocation: { lat, lng } });
      setSchools((prev) => prev.map((s) => (s.id === placingId ? { ...s, latitude: lat, longitude: lng, geocodedLocation: { lat, lng } } : s)));
      setPlacingId('');
    } catch (e) { setError(e?.message || 'No se pudo guardar la ubicación del plantel.'); }
  }
  async function checkAddress() {
    if (!addr.trim()) return;
    setAddrBusy(true); setAddrRes(null);
    const loc = await geocodeAddress(addr);
    if (!loc) { setAddrRes({ notFound: true }); setAddrBusy(false); return; }
    const near = schoolsWithLoc.map((s) => ({ name: s.name, d: meters(loc, s.loc) })).sort((a, b) => a.d - b.d);
    setAddrRes({ loc, near, covered: near.filter((n) => n.d <= radiusKm * 1000) });
    setAddrBusy(false);
  }

  const coverage = useMemo(() => {
    const rows = [];
    let none = 0;
    students.forEach((s) => {
      const loc = studentLoc(s);
      if (!loc) { none += 1; return; }
      let best = null;
      schoolsWithLoc.forEach((sc) => { const d = meters(loc, sc.loc); if (!best || d < best.d) best = { d, name: sc.name }; });
      rows.push({ s, loc, d: best?.d ?? null, near: best?.name || '' });
    });
    const inside = rows.filter((r) => r.d != null && r.d <= radiusKm * 1000);
    const outside = rows.filter((r) => r.d == null || r.d > radiusKm * 1000).sort((a, b) => (b.d ?? 0) - (a.d ?? 0));
    return { rows, inside, outside, none };
  }, [students, schoolsWithLoc, radiusKm]);

  /* ======================= RUTAS Y BORRADORES ======================= */
  const [selRoutes, setSelRoutes] = useState([]);
  const [changes, setChanges] = useState({}); // { studentId: { to, from } }
  const [showUnrouted, setShowUnrouted] = useState(false);
  const [showRings, setShowRings] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [msg, setMsg] = useState('');
  const [plan, setPlan] = useState(null);
  const [running, setRunning] = useState(false);

  const effRoute = (s) => (changes[s.id] ? changes[s.id].to : s.routeId || '');
  const routeStudents = useMemo(() => students.filter((s) => {
    if (!s.routeId && !changes[s.id]) return showUnrouted;
    return selRoutes.includes(s.routeId) || (changes[s.id] && selRoutes.includes(changes[s.id].to));
  }), [students, selRoutes, changes, showUnrouted]);
  const shownWithLoc = routeStudents.filter((s) => studentLoc(s));
  const shownNoLoc = routeStudents.length - shownWithLoc.length;

  function setMove(student, to) {
    setChanges((prev) => {
      const next = { ...prev };
      if (!to || to === (student.routeId || '')) delete next[student.id];
      else next[student.id] = { to, from: student.routeId || '' };
      return next;
    });
  }

  async function saveDraft(asNew = false) {
    const list = Object.entries(changes).map(([studentId, c]) => {
      const st = students.find((s) => s.id === studentId);
      return { studentId, name: st?.name || '', matricula: st?.matricula || '', fromRouteId: c.from || '', toRouteId: c.to };
    });
    if (!list.length) { setMsg('No hay cambios que guardar.'); return; }
    const name = draftName.trim() || `Borrador ${new Date().toLocaleDateString('es-MX')}`;
    try {
      const body = { name, changes: list, status: 'borrador', updatedByName: profile?.name || '' };
      if (draftId && !asNew) { await RouteDrafts.update(draftId, body); setMsg('Borrador actualizado.'); }
      else { const id = await RouteDrafts.create({ ...body, createdByName: profile?.name || '' }); setDraftId(id); setMsg('Borrador guardado.'); }
      setDraftName(name);
      setDrafts((await RouteDrafts.list()) || []);
    } catch (e) { setMsg(e?.message || 'No se pudo guardar el borrador.'); }
  }
  function loadDraft(id) {
    setDraftId(id); setMsg('');
    if (!id) { setChanges({}); setDraftName(''); return; }
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    const next = {}; let stale = 0;
    (d.changes || []).forEach((c) => {
      const st = students.find((s) => s.id === c.studentId);
      if (!st || (st.routeId || '') !== (c.fromRouteId || '')) { stale += 1; return; }
      next[c.studentId] = { to: c.toRouteId, from: c.fromRouteId || '' };
    });
    setChanges(next); setDraftName(d.name || '');
    const ids = new Set(); (d.changes || []).forEach((c) => { if (c.fromRouteId) ids.add(c.fromRouteId); if (c.toRouteId) ids.add(c.toRouteId); });
    setSelRoutes((prev) => Array.from(new Set([...prev, ...ids])));
    setMsg(stale ? `${stale} cambio(s) del borrador ya no aplican (el alumno cambió de ruta o ya no existe) y se omitieron.` : 'Borrador cargado.');
  }
  async function deleteDraft() {
    if (!draftId || !window.confirm('¿Eliminar este borrador? No afecta a ningún alumno ni lista.')) return;
    await RouteDrafts.remove(draftId);
    setDraftId(''); setDraftName(''); setChanges({});
    setDrafts((await RouteDrafts.list()) || []);
  }

  /* ----------------------- Plan de ejecución ----------------------- */
  function buildPlan() {
    const today = localToday();
    const sim = {};
    const items = [];
    Object.entries(changes).forEach(([studentId, c]) => {
      const student = students.find((s) => s.id === studentId);
      const item = { studentId, name: student?.name || studentId, to: c.to, ops: [], blockers: [], notes: [] };
      items.push(item);
      const toRoute = routeById[c.to];
      if (!student) { item.blockers.push('El alumno ya no existe.'); return; }
      if (!toRoute) { item.blockers.push('La ruta destino ya no existe.'); return; }
      if ((student.routeId || '') !== (c.from || '')) { item.blockers.push('El alumno cambió de ruta después de armar el borrador.'); return; }
      const unit = units.find((u) => u.id === toRoute.unitId);
      const capacity = Number(unit?.capacity || 0);
      const srcLists = lists.filter((l) => l.routeId === student.routeId && l.status !== 'eliminada'
        && String(l.endDate || '') >= today && (l.rows || []).some((r) => r.studentId === studentId));
      if (!srcLists.length) item.notes.push('Sin listas vigentes: solo cambia su ruta en el expediente.');
      srcLists.forEach((src) => {
        const row = (src.rows || []).find((r) => r.studentId === studentId);
        if (hasPayments(row)) { item.blockers.push(`Tiene pagos aplicados en «${src.listName || 'lista'}». Resuélvelo a mano (pestaña «Alumnos en varias rutas»).`); return; }
        const target = lists.find((l) => l.routeId === c.to && l.startDate === src.startDate && l.endDate === src.endDate && l.status !== 'eliminada');
        const key = target ? target.id : `new:${c.to}:${src.startDate}:${src.endDate}`;
        const dates = target?.dates || src.dates || [];
        const newRow = {
          ...buildStudentRow({
            ...student, routeId: c.to, tipoServicio: row.tipoServicio, medioServicio: row.medioServicio,
            diasSemana: row.diasSemana, fechasDiarias: row.fechasDiarias,
          }, dates, concepts, toRoute),
          paid: false, paymentId: '',
        };
        if (!newRow.pricingConceptId || !(newRow.baseAmount > 0)) { item.blockers.push(`La ruta ${toRoute.name} no tiene tarifa válida para este servicio.`); return; }
        sim[key] = sim[key] || [...(target?.rows || [])];
        if (capacity > 0) {
          const rows = [...sim[key].filter((r) => r.studentId !== studentId), newRow];
          const over = dates.filter((d) => {
            let e = 0; let s = 0;
            rows.forEach((r) => { const u = r.days?.[d]; if (u?.entrada) e += 1; if (u?.salida) s += 1; });
            return e > capacity || s > capacity;
          });
          if (over.length) { item.blockers.push(`La unidad ${unit?.plate || ''} (${capacity} lugares) se excede en ${over.length} día(s) de «${src.listName || 'lista'}».`); return; }
        }
        sim[key] = [...sim[key].filter((r) => r.studentId !== studentId), newRow];
        item.ops.push({ srcListId: src.id, srcName: src.listName || 'lista', targetListId: target?.id || null, key, startDate: src.startDate, endDate: src.endDate, dates, newRow });
        if (!target) item.notes.push(`Se creará la lista de ${toRoute.name} para ${src.startDate} – ${src.endDate}.`);
      });
      // Si alguna lista bloqueó, el alumno completo no se ejecuta (no se parte a medias).
      if (item.blockers.length) item.ops = [];
    });
    return items;
  }

  async function executePlan() {
    if (!plan) return;
    setRunning(true);
    const created = {};
    let done = 0; const failed = [];
    for (const item of plan.filter((i) => !i.blockers.length)) {
      try {
        const toRoute = routeById[item.to];
        const toSchool = schools.find((s) => s.id === toRoute.schoolId) || null;
        await Students.update(item.studentId, { routeId: item.to });
        for (const op of item.ops) {
          let targetId = op.targetListId || created[op.key] || null;
          if (!targetId) {
            const driver = drivers.find((d) => d.id === toRoute.driverId);
            const data = {
              routeId: item.to, startDate: op.startDate, endDate: op.endDate, weekdays: [1, 2, 3, 4, 5], dates: op.dates, rows: [],
              status: 'abierta', createdByUid: user?.uid || '', createdByName: profile?.name || '',
              operatorId: toRoute.driverId || '', operatorName: driver?.name || '',
              listName: `${op.startDate} ${op.endDate} | ${toRoute.name || 'Ruta'} | ${driver?.name || 'SIN-OPERADOR'}`,
            };
            targetId = await RouteLists.create(data); created[op.key] = targetId;
          }
          const tFresh = await RouteLists.get(targetId);
          const tRows = [...(tFresh.rows || []).filter((r) => r.studentId !== item.studentId), op.newRow].sort(priorityCompare);
          await RouteLists.update(targetId, { rows: tRows, ...invalidateListReviewPatch() });
          const fid = `${targetId}_${item.studentId}`;
          const existing = await FinanceRecords.get(fid);
          await FinanceRecords.upsert(fid, financePayload(op.newRow, { ...tFresh, id: targetId, rows: tRows }, toRoute, toSchool, existing || {}));
          const sFresh = await RouteLists.get(op.srcListId);
          await RouteLists.update(op.srcListId, { rows: (sFresh.rows || []).filter((r) => r.studentId !== item.studentId), ...invalidateListReviewPatch() });
          await FinanceRecords.remove(`${op.srcListId}_${item.studentId}`);
        }
        done += 1;
      } catch (e) { console.error(e); failed.push(`${item.name}: ${e?.message || 'error'}`); }
    }
    const blocked = plan.filter((i) => i.blockers.length);
    const remaining = {};
    blocked.forEach((i) => { if (changes[i.studentId]) remaining[i.studentId] = changes[i.studentId]; });
    if (draftId) {
      try {
        await RouteDrafts.update(draftId, {
          status: Object.keys(remaining).length ? 'borrador' : 'ejecutado',
          changes: Object.entries(remaining).map(([studentId, c]) => ({ studentId, name: students.find((s) => s.id === studentId)?.name || '', fromRouteId: c.from, toRouteId: c.to })),
          lastExecution: { at: new Date().toISOString(), by: profile?.name || '', moved: done, blocked: blocked.length, failed: failed.length },
        });
      } catch (e) { console.error(e); }
    }
    setChanges(remaining);
    setRunning(false); setPlan(null);
    setMsg(`Ejecutado: ${done} alumno(s) movido(s)${blocked.length ? `, ${blocked.length} bloqueado(s) y conservados en el borrador` : ''}${failed.length ? `. Con error: ${failed.join(' · ')}` : '.'}`);
    await load();
  }

  const changeList = Object.entries(changes);
  const mapPts = tab === 'cobertura'
    ? [...schoolsWithLoc.map((s) => [s.loc.lat, s.loc.lng]), ...(showStudents ? coverage.rows.map((r) => [r.loc.lat, r.loc.lng]) : [])]
    : [...shownWithLoc.map((s) => { const l = studentLoc(s); return [l.lat, l.lng]; }), ...schoolsWithLoc.map((s) => [s.loc.lat, s.loc.lng])];
  const mapKey = tab === 'cobertura' ? `c-${schoolsWithLoc.length}-${showStudents}` : `r-${selRoutes.join(',')}-${showUnrouted}`;

  const tabBtn = (v, label) => (
    <button type="button" onClick={() => setTab(v)}
      className={`px-4 py-2 text-sm font-semibold rounded-lg ${tab === v ? 'bg-navy-800 text-white' : 'bg-white text-navy-600 border border-navy-100'}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 flex items-center gap-2"><MapPin size={22} /> Planeación en mapa</h1>
          <p className="text-sm text-navy-500 mt-1 max-w-3xl">Cobertura de planteles y reasignación de alumnos entre rutas. Los alumnos se ubican con su domicilio (geocodificación gratuita de OpenStreetMap), así que la posición es aproximada.</p>
        </div>
        <button type="button" className="btn-admin-ghost" onClick={load} disabled={loading}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
      </div>
      <div className="flex gap-2">{tabBtn('cobertura', 'Cobertura de planteles')}{tabBtn('rutas', 'Rutas y borradores')}</div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      {(pending.length > 0 || geoBusy) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs px-3 py-2 flex flex-wrap items-center gap-3">
          <span>{pending.length} alumno(s) con domicilio aún sin ubicar en el mapa{noAddress ? ` · ${noAddress} sin domicilio capturado` : ''}. Ubicarlos toma ~1 segundo por alumno.</span>
          {!geoBusy
            ? <button type="button" className="btn-admin-ghost" onClick={geocodePending}>Ubicar pendientes</button>
            : <><span>Ubicando… {geoDone}/{pending.length + geoDone}</span><button type="button" className="btn-admin-ghost" onClick={() => { stopGeo.current = true; }}>Detener</button></>}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <div className="admin-card p-0 overflow-hidden" style={{ height: '72vh' }}>
          <MapContainer center={MEXICO_CITY} zoom={11} style={{ height: '100%', width: '100%', cursor: placingId ? 'crosshair' : undefined }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Fit points={mapPts} keyId={mapKey} />
            <ClickCatcher active={!!placingId} onPick={placeSchool} />

            {(tab === 'cobertura' || showRings) && schoolsWithLoc.map((s) => (
              <Circle key={`ring-${s.id}`} center={[s.loc.lat, s.loc.lng]} radius={radiusKm * 1000}
                pathOptions={{ color: '#0f766e', weight: 1.5, opacity: 0.55, fillColor: '#2dd4bf', fillOpacity: 0.13 }} />
            ))}
            {schoolsWithLoc.map((s) => (
              <Marker key={s.id} position={[s.loc.lat, s.loc.lng]} icon={schoolIcon()}>
                <Popup>{s.name}<br />Cobertura de {radiusKm} km</Popup>
              </Marker>
            ))}

            {tab === 'cobertura' && showStudents && coverage.rows.map((r) => {
              const ok = r.d != null && r.d <= radiusKm * 1000;
              return (
                <CircleMarker key={r.s.id} center={[r.loc.lat, r.loc.lng]} radius={5}
                  pathOptions={{ color: ok ? '#15803d' : '#b91c1c', fillColor: ok ? '#22c55e' : '#ef4444', fillOpacity: 0.8, weight: 1 }}>
                  <Popup>{r.s.name}<br />{r.d != null ? `${km(r.d)} de ${r.near}` : 'Sin plantel ubicado'}</Popup>
                </CircleMarker>
              );
            })}
            {tab === 'cobertura' && addrRes?.loc && (
              <CircleMarker center={[addrRes.loc.lat, addrRes.loc.lng]} radius={9} pathOptions={{ color: '#4c1d95', fillColor: '#8b5cf6', fillOpacity: 0.9, weight: 2 }}>
                <Popup>{addr}</Popup>
              </CircleMarker>
            )}

            {tab === 'rutas' && shownWithLoc.map((s) => {
              const loc = studentLoc(s); const moved = !!changes[s.id]; const eff = effRoute(s);
              return (
                <CircleMarker key={s.id} center={[loc.lat, loc.lng]} radius={moved ? 9 : 6}
                  pathOptions={{ color: moved ? '#111827' : '#ffffff', weight: moved ? 3 : 1.5, fillColor: colorOf(eff), fillOpacity: 0.9 }}>
                  <Popup>
                    <div style={{ minWidth: 190 }}>
                      <b>{s.name}</b><br />{s.matricula || 'sin matrícula'}<br />
                      <span style={{ fontSize: 11 }}>{s.address || 'sin domicilio'}</span><br />
                      <span style={{ fontSize: 11 }}>Ruta actual: {routeById[s.routeId]?.name || 'sin ruta'}</span>
                      <select style={{ display: 'block', width: '100%', marginTop: 6 }} value={changes[s.id]?.to || ''}
                        onChange={(e) => setMove(s, e.target.value)}>
                        <option value="">Sin cambio</option>
                        {routes.filter((r) => r.id !== s.routeId).map((r) => <option key={r.id} value={r.id}>Mover a {r.name}</option>)}
                      </select>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <aside className="space-y-4">
          {tab === 'cobertura' ? (
            <>
              <div className="admin-card space-y-3 text-sm">
                <p className="font-semibold text-navy-800">Cobertura</p>
                <label className="block text-xs text-navy-600">Radio (km)
                  <input type="number" min="0.5" step="0.5" className="admin-input mt-1" value={radiusKm} onChange={(e) => setRadiusKm(Math.max(0.5, Number(e.target.value) || 5))} />
                </label>
                <label className="flex items-center gap-2 text-xs text-navy-600"><input type="checkbox" checked={showStudents} onChange={(e) => setShowStudents(e.target.checked)} /> Mostrar alumnos (verde = dentro, rojo = fuera)</label>
                <p className="text-xs text-navy-600">Dentro: <b>{coverage.inside.length}</b> · Fuera: <b>{coverage.outside.length}</b> · Sin ubicar: <b>{coverage.none}</b></p>
              </div>

              <div className="admin-card space-y-2 text-sm">
                <p className="font-semibold text-navy-800">Ubicar plantel en el mapa</p>
                {schools.map((s) => {
                  const has = !!schoolLoc(s);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{s.name} {has ? '✓' : '(sin ubicación)'}</span>
                      {placingId === s.id
                        ? <button type="button" className="btn-admin-ghost" onClick={() => setPlacingId('')}><X size={12} className="inline" /> Cancelar</button>
                        : <button type="button" className="btn-admin-ghost" onClick={() => setPlacingId(s.id)}><Crosshair size={12} className="inline mr-1" />{has ? 'Mover' : 'Marcar'}</button>}
                    </div>
                  );
                })}
                {placingId && <p className="text-xs text-teal-700">Haz clic en el mapa donde está el plantel.</p>}
              </div>

              <div className="admin-card space-y-2 text-sm">
                <p className="font-semibold text-navy-800">¿Una dirección está cubierta?</p>
                <div className="flex gap-2">
                  <input className="admin-input" placeholder="Calle, colonia, municipio" value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && checkAddress()} />
                  <button type="button" className="btn-admin-primary" onClick={checkAddress} disabled={addrBusy}><Search size={14} /></button>
                </div>
                {addrRes?.notFound && <p className="text-xs text-red-700">No se encontró esa dirección.</p>}
                {addrRes?.loc && (
                  <p className="text-xs">
                    {addrRes.covered.length
                      ? <span className="text-green-700">Dentro de cobertura: {addrRes.covered.map((c) => `${c.name} (${km(c.d)})`).join(', ')}.</span>
                      : <span className="text-red-700">Fuera de cobertura.{addrRes.near[0] ? ` El plantel más cercano es ${addrRes.near[0].name}, a ${km(addrRes.near[0].d)}.` : ''}</span>}
                  </p>
                )}
              </div>

              {coverage.outside.length > 0 && (
                <div className="admin-card text-xs">
                  <p className="font-semibold text-navy-800 mb-1">Alumnos fuera de cobertura ({coverage.outside.length})</p>
                  <ul className="max-h-48 overflow-y-auto space-y-0.5">
                    {coverage.outside.slice(0, 80).map((r) => <li key={r.s.id}>{r.s.name} · {r.d != null ? `${km(r.d)} de ${r.near}` : 'sin plantel ubicado'}</li>)}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="admin-card space-y-2 text-sm">
                <p className="font-semibold text-navy-800">Rutas a mostrar</p>
                <div className="max-h-44 overflow-y-auto space-y-1">
                  {routes.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={selRoutes.includes(r.id)} onChange={(e) => setSelRoutes((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))} />
                      <span style={{ background: colorOf(r.id) }} className="inline-block w-3 h-3 rounded-full" />{r.name}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showUnrouted} onChange={(e) => setShowUnrouted(e.target.checked)} /> Mostrar alumnos sin ruta</label>
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showRings} onChange={(e) => setShowRings(e.target.checked)} /> Mostrar cobertura de planteles</label>
                <p className="text-xs text-navy-500">{shownWithLoc.length} en el mapa{shownNoLoc ? ` · ${shownNoLoc} sin ubicar` : ''}. Haz clic en un punto para proponer su cambio de ruta.</p>
              </div>

              <div className="admin-card space-y-2 text-sm">
                <p className="font-semibold text-navy-800">Borrador de cambios ({changeList.length})</p>
                <select className="admin-input" value={draftId} onChange={(e) => loadDraft(e.target.value)}>
                  <option value="">— Borrador nuevo —</option>
                  {drafts.map((d) => <option key={d.id} value={d.id}>{d.name}{d.status === 'ejecutado' ? ' (ejecutado)' : ''}</option>)}
                </select>
                <input className="admin-input" placeholder="Nombre del borrador" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                <ul className="max-h-48 overflow-y-auto text-xs space-y-1">
                  {changeList.map(([id, c]) => {
                    const st = students.find((s) => s.id === id);
                    return (
                      <li key={id} className="flex items-center justify-between gap-2">
                        <span>{st?.name || id}: {routeById[c.from]?.name || 'sin ruta'} → <b>{routeById[c.to]?.name || '?'}</b></span>
                        <button type="button" className="link-danger" onClick={() => setMove(st || { id, routeId: c.from }, '')}>Quitar</button>
                      </li>
                    );
                  })}
                  {!changeList.length && <li className="text-navy-400">Sin cambios propuestos.</li>}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-admin-ghost" onClick={() => saveDraft(false)}><Save size={13} className="inline mr-1" />{draftId ? 'Guardar' : 'Guardar borrador'}</button>
                  {draftId && <button type="button" className="btn-admin-ghost" onClick={() => saveDraft(true)}>Guardar como nuevo</button>}
                  {draftId && <button type="button" className="link-danger" onClick={deleteDraft}><Trash2 size={13} className="inline" /> Eliminar</button>}
                </div>
                <button type="button" className="btn-admin-primary w-full" disabled={!changeList.length} onClick={() => setPlan(buildPlan())}><Play size={14} className="inline mr-1" />Revisar y ejecutar cambios</button>
                {msg && <p className="text-xs text-navy-600">{msg}</p>}
              </div>
            </>
          )}
        </aside>
      </div>

      {plan && (
        <div className="fixed inset-0 z-[2000] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 space-y-3 text-sm">
            <p className="font-display font-bold text-navy-900 text-lg">Revisar antes de ejecutar</p>
            <p className="text-xs text-navy-500">Al ejecutar se cambia la ruta del alumno, se mueve su fila de las listas vigentes (periodos que no han terminado) a la lista de la ruta nueva y se actualiza Finanzas. Los periodos pasados no se tocan. Los alumnos con pagos aplicados o que excedan la capacidad se bloquean y se quedan en el borrador.</p>
            <ul className="space-y-2">
              {plan.map((i) => (
                <li key={i.studentId} className={`rounded-lg border px-3 py-2 ${i.blockers.length ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                  <b>{i.name}</b> → {routeById[i.to]?.name || '?'}
                  {i.blockers.map((b, k) => <p key={`b${k}`} className="text-xs text-red-800">✕ {b}</p>)}
                  {!i.blockers.length && i.ops.map((o, k) => <p key={`o${k}`} className="text-xs text-green-900">✓ Sale de «{o.srcName}» ({o.startDate} – {o.endDate})</p>)}
                  {i.notes.map((n, k) => <p key={`n${k}`} className="text-xs text-navy-600">{n}</p>)}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-admin-ghost" onClick={() => setPlan(null)} disabled={running}>Cancelar</button>
              <button type="button" className="btn-admin-primary" onClick={executePlan} disabled={running || !plan.some((i) => !i.blockers.length)}>
                {running ? 'Ejecutando…' : `Ejecutar ${plan.filter((i) => !i.blockers.length).length} cambio(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
