import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowUp, ArrowDown, ChevronsUp, Save, Trash2, RotateCcw, Wand2, Check } from 'lucide-react';
import { Routes, RouteDrafts } from '../../firebase/services';
import { metersBetween } from '../../firebase/trips';
import { optimizeStopOrder } from '../../utils/routeOptimizer';
import { schoolIcon } from '../../utils/mapIcons';

/**
 * Planeación · Orden de entrega
 * Se elige una ruta y un turno (ida o vuelta) y se «juega» con el orden en que se
 * pasa por cada alumno: se ve el trayecto en el mapa, los kilómetros que salen y la
 * comparación contra el orden actual. El resultado se guarda como BORRADOR (para
 * platicarlo con el operador); no cambia nada de la operación hasta que se pulse
 * «Aplicar a la ruta».
 */

const SHIFTS = { morning: 'Ida (camino a la escuela)', afternoon: 'Vuelta (camino a casa)' };
const orderField = (shift) => (shift === 'morning' ? 'studentOrderMorning' : 'studentOrderAfternoon');

function numIcon(n, { selected, moved }) {
  const bg = selected ? '#f59e0b' : moved ? '#0f766e' : '#1e3a5f';
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:700 12px system-ui">${n}</div>`,
  });
}

function FitTo({ points, keyId }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    else if (points.length === 1) map.setView(points[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId]);
  return null;
}

/** Km de un recorrido: del plantel a las paradas (vuelta) o de las paradas al plantel (ida). */
function pathKm(stops, school, shift) {
  const pts = stops.map((s) => s.loc).filter(Boolean);
  const seq = shift === 'morning' ? [...pts, ...(school ? [school] : [])] : [...(school ? [school] : []), ...pts];
  let m = 0;
  for (let i = 1; i < seq.length; i += 1) m += metersBetween(seq[i - 1], seq[i]);
  return m / 1000;
}

export default function PlaneacionOrden({ students, routes, schools, drafts, reloadDrafts, profile, studentLoc }) {
  const normalRoutes = useMemo(() => routes.filter((r) => r.kind !== 'taller'), [routes]);
  const [routeId, setRouteId] = useState('');
  const [shift, setShift] = useState('afternoon');
  const [order, setOrder] = useState([]); // ids en el orden del borrador
  const [draftId, setDraftId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [msg, setMsg] = useState('');

  const route = normalRoutes.find((r) => r.id === routeId) || null;
  const school = useMemo(() => {
    const sc = schools.find((x) => x.id === route?.schoolId);
    return sc?.geocodedLocation?.lat != null ? { lat: Number(sc.geocodedLocation.lat), lng: Number(sc.geocodedLocation.lng), name: sc.name } : null;
  }, [route, schools]);

  const routeStudents = useMemo(() => students.filter((s) => s.routeId === routeId), [students, routeId]);
  const byId = useMemo(() => new Map(routeStudents.map((s) => [s.id, s])), [routeStudents]);

  // Orden actual de la ruta (el que usa hoy el operador): el guardado en la ruta y, al final, el resto por nombre.
  const currentOrder = useMemo(() => {
    const saved = (route?.[orderField(shift)] || []).filter((id) => byId.has(id));
    const rest = routeStudents.filter((s) => !saved.includes(s.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')).map((s) => s.id);
    return [...saved, ...rest];
  }, [route, shift, byId, routeStudents]);

  // Al cambiar de ruta o turno se parte del orden actual (o del borrador si hay uno elegido).
  useEffect(() => {
    setOrder(currentOrder);
    setDraftId(''); setDraftName(''); setNote(''); setSelected(''); setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, shift]);

  const toStop = (id) => { const s = byId.get(id); return s ? { id, student: s, loc: studentLoc(s) } : null; };
  const draftStops = useMemo(() => order.map(toStop).filter(Boolean), [order, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentStops = useMemo(() => currentOrder.map(toStop).filter(Boolean), [currentOrder, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const noLoc = draftStops.filter((s) => !s.loc);
  const kmDraft = pathKm(draftStops, school, shift);
  const kmCurrent = pathKm(currentStops, school, shift);
  const changed = order.some((id, i) => id !== currentOrder[i]);
  const delta = kmDraft - kmCurrent;

  const line = (stops) => {
    const pts = stops.filter((s) => s.loc).map((s) => [s.loc.lat, s.loc.lng]);
    const sc = school ? [[school.lat, school.lng]] : [];
    return shift === 'morning' ? [...pts, ...sc] : [...sc, ...pts];
  };
  const draftLine = line(draftStops);
  const currentLine = line(currentStops);

  function move(i, to) {
    if (to < 0 || to >= order.length || i === to) return;
    setOrder((prev) => { const next = [...prev]; const [x] = next.splice(i, 1); next.splice(to, 0, x); return next; });
  }
  function optimize() {
    const pts = draftStops.filter((s) => s.loc).map((s) => ({ id: s.id, lat: s.loc.lat, lng: s.loc.lng }));
    if (pts.length < 2 || !school) { setMsg(school ? 'Hace falta ubicar al menos 2 alumnos.' : 'El plantel de la ruta no tiene ubicación en el mapa.'); return; }
    try {
      const { order: best } = optimizeStopOrder(pts, school, shift === 'morning' ? 'end' : 'start');
      const rest = order.filter((id) => !best.includes(id)); // los que no tienen ubicación se quedan al final
      setOrder([...best, ...rest]);
      setMsg('Orden propuesto por cercanía. Ajústalo como quieras.');
    } catch (e) { setMsg('No se pudo calcular el orden por cercanía.'); }
  }

  /* ---- Borradores de orden ---- */
  const orderDrafts = useMemo(() => (drafts || []).filter((d) => d.type === 'orden'), [drafts]);
  const myDrafts = orderDrafts.filter((d) => d.routeId === routeId && d.shift === shift);

  async function saveDraft(asNew = false) {
    if (!route) return;
    const name = draftName.trim() || `Orden ${route.name} · ${new Date().toLocaleDateString('es-MX')}`;
    const body = {
      type: 'orden', status: 'borrador', name, note: note.trim(),
      routeId, routeName: route.name, shift, order,
      stops: order.map((id) => ({ studentId: id, name: byId.get(id)?.name || '', matricula: byId.get(id)?.matricula || '' })),
      kmDraft: Number(kmDraft.toFixed(2)), kmCurrent: Number(kmCurrent.toFixed(2)),
      updatedByName: profile?.name || '',
    };
    try {
      if (draftId && !asNew) { await RouteDrafts.update(draftId, body); setMsg('Borrador actualizado.'); }
      else { const id = await RouteDrafts.create({ ...body, createdByName: profile?.name || '' }); setDraftId(id); setMsg('Borrador guardado.'); }
      setDraftName(name);
      await reloadDrafts();
    } catch (e) { setMsg(e?.message || 'No se pudo guardar el borrador.'); }
  }
  function loadDraft(id) {
    setDraftId(id); setMsg('');
    if (!id) { setOrder(currentOrder); setDraftName(''); setNote(''); return; }
    const d = orderDrafts.find((x) => x.id === id);
    if (!d) return;
    const valid = (d.order || []).filter((sid) => byId.has(sid));
    const missing = routeStudents.filter((s) => !valid.includes(s.id)).map((s) => s.id); // alumnos nuevos: al final
    const dropped = (d.order || []).length - valid.length;
    setOrder([...valid, ...missing]); setDraftName(d.name || ''); setNote(d.note || '');
    setMsg(dropped || missing.length ? `Borrador cargado. ${dropped ? `${dropped} alumno(s) ya no están en la ruta y se quitaron. ` : ''}${missing.length ? `${missing.length} alumno(s) nuevo(s) se agregaron al final.` : ''}` : 'Borrador cargado.');
  }
  async function deleteDraft() {
    if (!draftId || !window.confirm('¿Eliminar este borrador? No afecta la operación.')) return;
    await RouteDrafts.remove(draftId);
    setDraftId(''); setDraftName(''); setNote(''); setOrder(currentOrder);
    await reloadDrafts();
  }
  async function applyToRoute() {
    if (!route) return;
    if (!window.confirm(`¿Aplicar este orden como el orden de ${SHIFTS[shift].toLowerCase()} de «${route.name}»?\n\nEl operador lo verá desde su siguiente recorrido. Ojo: el orden de la ruta se vuelve a ajustar con lo que el operador realmente recorra.`)) return;
    try {
      await Routes.update(routeId, { [orderField(shift)]: order });
      if (draftId) await RouteDrafts.update(draftId, { status: 'aplicado', appliedByName: profile?.name || '' });
      setMsg('Orden aplicado a la ruta.');
      await reloadDrafts();
    } catch (e) { setMsg(e?.message || 'No se pudo aplicar el orden.'); }
  }

  const mapPoints = [...draftLine];
  const fitKey = `${routeId}-${shift}-${draftStops.length}`;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
      <div className="admin-card p-0 overflow-hidden relative" style={{ height: '72vh' }}>
        {!route && <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80 text-sm text-navy-500 text-center px-6">Elige una ruta y un turno para ver y reordenar su trayecto.</div>}
        <MapContainer center={[19.43, -99.13]} zoom={11} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitTo points={mapPoints} keyId={fitKey} />
          {changed && currentLine.length > 1 && <Polyline positions={currentLine} pathOptions={{ color: '#94a3b8', weight: 3, dashArray: '6 8', opacity: 0.9 }} />}
          {draftLine.length > 1 && <Polyline positions={draftLine} pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.85 }} />}
          {school && <Marker position={[school.lat, school.lng]} icon={schoolIcon()}><Popup>{school.name} · {shift === 'morning' ? 'llegada' : 'salida'}</Popup></Marker>}
          {draftStops.map((s, i) => s.loc && (
            <Marker key={s.id} position={[s.loc.lat, s.loc.lng]}
              icon={numIcon(i + 1, { selected: selected === s.id, moved: order[i] !== currentOrder[i] })}
              eventHandlers={{ click: () => setSelected(s.id) }}>
              <Popup>
                <div style={{ minWidth: 170 }}>
                  <b>{i + 1}. {s.student.name}</b><br />
                  <span style={{ fontSize: 11 }}>{s.student.address || 'sin domicilio'}</span>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0}>↑ Antes</button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1}>↓ Después</button>
                    <button type="button" onClick={() => move(i, 0)} disabled={i === 0}>1.º</button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <aside className="space-y-4">
        <div className="admin-card space-y-2 text-sm">
          <p className="font-semibold text-navy-800">Ruta y turno</p>
          <select className="admin-input" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Elige una ruta…</option>
            {normalRoutes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(SHIFTS).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setShift(k)}
                className={`px-2 py-2 text-xs font-semibold rounded-lg ${shift === k ? 'bg-navy-800 text-white' : 'bg-white text-navy-600 border border-navy-100'}`}>{label}</button>
            ))}
          </div>
          {route && !school && <p className="text-xs text-amber-700">El plantel de esta ruta no tiene ubicación en el mapa; los kilómetros no incluyen el tramo del plantel.</p>}
          {route && (
            <div className="rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-700 space-y-0.5">
              <p>{draftStops.length} paradas · {noLoc.length ? `${noLoc.length} sin ubicación (no cuentan en los km)` : 'todas ubicadas'}</p>
              <p>Orden actual: <b>{kmCurrent.toFixed(1)} km</b> · Borrador: <b>{kmDraft.toFixed(1)} km</b>
                {changed && <span className={delta <= 0 ? 'text-green-700' : 'text-red-700'}> ({delta <= 0 ? '' : '+'}{delta.toFixed(1)} km)</span>}</p>
              <p className="text-navy-400">Línea verde: borrador. Línea gris punteada: orden actual.</p>
            </div>
          )}
        </div>

        {route && (
          <>
            <div className="admin-card space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-navy-800">Orden de entrega</p>
                <div className="flex gap-2">
                  <button type="button" className="btn-admin-ghost" onClick={optimize} title="Ordenar por cercanía"><Wand2 size={13} className="inline mr-1" />Por cercanía</button>
                  <button type="button" className="btn-admin-ghost" onClick={() => { setOrder(currentOrder); setMsg('Se restableció el orden actual.'); }} title="Volver al orden actual"><RotateCcw size={13} className="inline mr-1" />Actual</button>
                </div>
              </div>
              <p className="text-[11px] text-navy-400">Arrastra para cambiar el orden, o usa las flechas. Los números del mapa son el orden del borrador.</p>
              <ol className="max-h-[42vh] overflow-y-auto divide-y divide-navy-50 text-xs">
                {order.map((id, i) => {
                  const s = byId.get(id);
                  if (!s) return null;
                  const moved = id !== currentOrder[i];
                  return (
                    <li key={id} draggable onDragStart={() => setDragIndex(i)} onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (dragIndex != null) move(dragIndex, i); setDragIndex(null); }}
                      onClick={() => setSelected(id)}
                      className={`py-1.5 px-1 flex items-center gap-2 cursor-grab ${selected === id ? 'bg-amber-50' : ''}`}>
                      <span className={`w-6 h-6 shrink-0 rounded-full text-[11px] font-bold text-white flex items-center justify-center ${moved ? 'bg-teal-700' : 'bg-navy-700'}`}>{i + 1}</span>
                      <span className="flex-1 min-w-0 truncate" title={s.address || ''}>{s.name}{!studentLoc(s) && <span className="text-amber-700"> · sin ubicar</span>}</span>
                      <button type="button" className="p-1 text-navy-500" onClick={(e) => { e.stopPropagation(); move(i, 0); }} title="Al inicio"><ChevronsUp size={14} /></button>
                      <button type="button" className="p-1 text-navy-500" onClick={(e) => { e.stopPropagation(); move(i, i - 1); }} title="Subir"><ArrowUp size={14} /></button>
                      <button type="button" className="p-1 text-navy-500" onClick={(e) => { e.stopPropagation(); move(i, i + 1); }} title="Bajar"><ArrowDown size={14} /></button>
                    </li>
                  );
                })}
                {!order.length && <li className="py-2 text-navy-400">Esta ruta no tiene alumnos asignados.</li>}
              </ol>
            </div>

            <div className="admin-card space-y-2 text-sm">
              <p className="font-semibold text-navy-800">Borrador de orden</p>
              <select className="admin-input" value={draftId} onChange={(e) => loadDraft(e.target.value)}>
                <option value="">— Borrador nuevo —</option>
                {myDrafts.map((d) => <option key={d.id} value={d.id}>{d.name}{d.status === 'aplicado' ? ' (aplicado)' : ''}</option>)}
              </select>
              <input className="admin-input" placeholder="Nombre del borrador" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
              <textarea className="admin-input" rows={2} placeholder="Notas para platicar con el operador (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-admin-ghost" onClick={() => saveDraft(false)}><Save size={13} className="inline mr-1" />{draftId ? 'Guardar' : 'Guardar borrador'}</button>
                {draftId && <button type="button" className="btn-admin-ghost" onClick={() => saveDraft(true)}>Guardar como nuevo</button>}
                {draftId && <button type="button" className="link-danger" onClick={deleteDraft}><Trash2 size={13} className="inline" /> Eliminar</button>}
              </div>
              <button type="button" className="btn-admin-primary w-full" disabled={!order.length} onClick={applyToRoute}>
                <Check size={14} className="inline mr-1" />Aplicar a la ruta
              </button>
              <p className="text-[11px] text-navy-400">Guardar el borrador no cambia nada. «Aplicar a la ruta» sí cambia el orden que usa el operador.</p>
              {msg && <p className="text-xs text-navy-600">{msg}</p>}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
