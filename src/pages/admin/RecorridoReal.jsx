import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Route as RouteIcon, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Routes } from '../../firebase/services';
import { listTripsByRouteBetween, getTripTrack, getTripStopsOnce, metersBetween } from '../../firebase/trips';
import { reverseGeocode } from '../../firebase/geocoding';
import { tsMs, actualSequence } from '../../utils/tripOrder';
import { numberedIcon } from '../../utils/mapIcons';

/**
 * Recorrido real (GPS) · solo admin
 * Dibuja por dónde pasó el transporte en cada recorrido de la semana, mide la
 * distancia y el tiempo y compara contra la semana anterior y entre días,
 * para juzgar si la ruta es eficiente. Usa la huella que el operador guarda
 * durante el recorrido (trips/{id}/track).
 */

const MEXICO_CITY = [19.4326, -99.1332];
const COLORS = ['#0d9488', '#7c3aed', '#f97316', '#0ea5e9', '#65a30d', '#db2777', '#eab308', '#475569', '#dc2626', '#0891b2'];
const SHIFT = { morning: 'Entrada', afternoon: 'Salida' };
// Entrada = recolección (se guarda dónde subió); Salida = entrega (dónde bajó).
const STOP_KEYS = { morning: { loc: 'boardedLocation', time: 'boardedAt', verb: 'Recogido' }, afternoon: { loc: 'deliveredLocation', time: 'deliveredAt', verb: 'Entregado' } };
const MAX_JUMP_MS = 36; // m/s (~130 km/h): saltos mayores se consideran error de GPS

const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (date) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDay = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });

function distanceOf(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = metersBetween(pts[i - 1], pts[i]);
    const dt = pts[i].t - pts[i - 1].t;
    if (dt > 0 && d / dt > MAX_JUMP_MS) continue;
    m += d;
  }
  return m;
}
function metricsOf(trip, pts) {
  const meters = distanceOf(pts);
  const s = tsMs(trip.startedAt); const e = tsMs(trip.completedAt);
  let minutes = null;
  if (s && e && e > s) minutes = (e - s) / 60000;
  else if (pts.length > 1) minutes = (pts[pts.length - 1].t - pts[0].t) / 60;
  const kmh = minutes && minutes > 0 ? (meters / 1000) / (minutes / 60) : null;
  return { meters, minutes, kmh };
}

async function loadWeek(routeId, weekStart) {
  const trips = await listTripsByRouteBetween(routeId, weekStart, addDays(weekStart, 6));
  const rows = await Promise.all(trips.map(async (trip) => {
    let pts = [];
    let stops = [];
    try { pts = await getTripTrack(trip.id); } catch (e) { console.error(e); }
    try {
      const cfg = STOP_KEYS[trip.shift] || STOP_KEYS.morning;
      // Orden REAL de atención (por hora de marcado), solo paradas con ubicación capturada.
      stops = actualSequence(await getTripStopsOnce(trip.id), trip.shift).filter((x) => x[cfg.loc]?.lat != null);
    } catch (e) { console.error(e); }
    return { trip, pts, stops, ...metricsOf(trip, pts) };
  }));
  return rows.sort((a, b) => String(a.trip.date).localeCompare(String(b.trip.date)) || String(a.trip.shift).localeCompare(String(b.trip.shift)));
}

function Fit({ points, keyId }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId]);
  return null;
}

export default function RecorridoReal() {
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [weekStart, setWeekStart] = useState(mondayOf(localToday()));
  const [rows, setRows] = useState([]);
  const [prevRows, setPrevRows] = useState([]);
  const [compare, setCompare] = useState(true);
  const [picked, setPicked] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streets, setStreets] = useState({}); // tripId -> { busy, list }
  const stopStreets = useRef(false);

  useEffect(() => { Routes.list().then((r) => setRoutes(r || [])).catch((e) => setError(e?.message || 'No se pudieron cargar las rutas.')); }, []);

  async function load() {
    if (!routeId) return;
    setLoading(true); setError(''); setStreets({});
    try {
      const cur = await loadWeek(routeId, weekStart);
      setRows(cur);
      setPicked(Object.fromEntries(cur.filter((r) => r.pts.length > 1).map((r) => [r.trip.id, true])));
      setPrevRows(compare ? await loadWeek(routeId, addDays(weekStart, -7)) : []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo leer el historial (¿están publicadas las reglas de Firestore?).');
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [routeId, weekStart, compare]);

  const withTrack = rows.filter((r) => r.pts.length > 1);
  const minByShift = useMemo(() => {
    const m = {};
    withTrack.forEach((r) => { const k = r.trip.shift; if (!m[k] || r.meters < m[k]) m[k] = r.meters; });
    return m;
  }, [withTrack]);
  const totals = (list) => {
    const t = list.filter((r) => r.pts.length > 1);
    return { n: t.length, km: t.reduce((a, r) => a + r.meters, 0) / 1000, min: t.reduce((a, r) => a + (r.minutes || 0), 0) };
  };
  const cur = totals(rows); const prev = totals(prevRows);
  const delta = prev.km > 0 ? ((cur.km - prev.km) / prev.km) * 100 : null;

  const shown = withTrack.filter((r) => picked[r.trip.id]);
  const colorFor = (id) => COLORS[Math.max(0, withTrack.findIndex((r) => r.trip.id === id)) % COLORS.length];
  const allPts = shown.flatMap((r) => r.pts.map((p) => [p.lat, p.lng]));

  async function loadStreets(r) {
    stopStreets.current = false;
    setStreets((p) => ({ ...p, [r.trip.id]: { busy: true, list: [] } }));
    const samples = []; let acc = 0; let nextAt = 0;
    r.pts.forEach((p, i) => { if (i > 0) acc += metersBetween(r.pts[i - 1], p); if (acc >= nextAt) { samples.push(p); nextAt = acc + 350; } });
    const list = [];
    for (const p of samples.slice(0, 40)) {
      if (stopStreets.current) break;
      const res = await reverseGeocode(p.lat, p.lng);
      if (res && list[list.length - 1] !== res.road) list.push(res.road);
      setStreets((s) => ({ ...s, [r.trip.id]: { busy: true, list: [...list] } }));
    }
    setStreets((s) => ({ ...s, [r.trip.id]: { busy: false, list: [...list] } }));
  }

  const routeName = routes.find((r) => r.id === routeId)?.name || '';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-900 flex items-center gap-2"><RouteIcon size={22} /> Recorrido real (GPS)</h1>
        <p className="text-sm text-navy-500 mt-1 max-w-3xl">
          Por dónde pasó el transporte en cada recorrido, con distancia y tiempo, para comparar días y semanas. La huella se graba solo mientras el operador
          tiene el recorrido abierto y la pantalla encendida; los recorridos anteriores a esta función no tienen huella.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="admin-input max-w-xs" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="">Elige una ruta…</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button type="button" className="btn-admin-ghost" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={14} /></button>
        <span className="text-sm font-semibold text-navy-700">Semana del {fmtDay(weekStart)} al {fmtDay(addDays(weekStart, 6))}</span>
        <button type="button" className="btn-admin-ghost" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={14} /></button>
        <label className="flex items-center gap-1.5 text-xs text-navy-600"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Comparar con semana anterior</label>
        <button type="button" className="btn-admin-ghost" onClick={load} disabled={loading || !routeId}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      {!routeId ? <p className="text-sm text-navy-400">Elige una ruta para ver su historial.</p> : loading ? <p className="text-sm text-navy-500">Cargando…</p> : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
          <div className="admin-card p-0 overflow-hidden" style={{ height: '70vh' }}>
            <MapContainer center={MEXICO_CITY} zoom={12} style={{ height: '100%', width: '100%' }}>
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Fit points={allPts} keyId={`${routeId}-${weekStart}-${shown.map((r) => r.trip.id).join(',')}`} />
              {shown.map((r) => (
                <Polyline key={r.trip.id} positions={r.pts.map((p) => [p.lat, p.lng])} pathOptions={{ color: colorFor(r.trip.id), weight: 4, opacity: 0.75 }} />
              ))}
              {shown.flatMap((r) => {
                const cfg = STOP_KEYS[r.trip.shift] || STOP_KEYS.morning;
                return r.stops.map((x) => (
                  <Marker key={`p${r.trip.id}-${x.id}`} position={[x[cfg.loc].lat, x[cfg.loc].lng]} icon={numberedIcon(x.seq, colorFor(r.trip.id))}>
                    <Popup>
                      <b>{x.name}</b><br />{x.matricula}<br />
                      {fmtDay(r.trip.date)} · {cfg.verb} {x[cfg.time] && tsMs(x[cfg.time]) ? new Date(tsMs(x[cfg.time])).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Popup>
                  </Marker>
                ));
              })}
              {shown.map((r) => (
                <CircleMarker key={`s${r.trip.id}`} center={[r.pts[0].lat, r.pts[0].lng]} radius={6} pathOptions={{ color: '#fff', fillColor: colorFor(r.trip.id), fillOpacity: 1, weight: 2 }}>
                  <Popup>{fmtDay(r.trip.date)} · {SHIFT[r.trip.shift] || r.trip.shift}: inicio</Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          <aside className="space-y-4 text-sm">
            <div className="admin-card space-y-1">
              <p className="font-semibold text-navy-800">{routeName} · resumen semanal</p>
              <p className="text-xs text-navy-600">Recorridos con huella: <b>{cur.n}</b> · Distancia: <b>{cur.km.toFixed(1)} km</b> · Tiempo: <b>{Math.round(cur.min)} min</b></p>
              {compare && (
                <p className="text-xs text-navy-600">
                  Semana anterior: <b>{prev.km.toFixed(1)} km</b> ({prev.n} recorridos)
                  {delta != null && <> · <span className={delta > 5 ? 'text-red-700' : delta < -5 ? 'text-green-700' : ''}>{delta > 0 ? '+' : ''}{delta.toFixed(0)}%</span></>}
                </p>
              )}
              {cur.n > 0 && prev.n > 0 && Math.abs(cur.n - prev.n) > 0 && <p className="text-[11px] text-amber-700">Las semanas tienen distinto número de recorridos: compara con cuidado.</p>}
            </div>

            <div className="admin-card p-0 overflow-hidden">
              <div className="max-h-[48vh] overflow-y-auto">
                {rows.length === 0 && <p className="p-4 text-xs text-navy-400">No hay recorridos de esta ruta en la semana.</p>}
                {rows.map((r) => {
                  const has = r.pts.length > 1;
                  const over = has && minByShift[r.trip.shift] > 0 ? (r.meters / minByShift[r.trip.shift] - 1) * 100 : 0;
                  const st = streets[r.trip.id];
                  return (
                    <div key={r.trip.id} className="px-3 py-2 border-b border-navy-100 text-xs space-y-1">
                      <label className="flex items-center gap-2 font-semibold text-navy-800">
                        <input type="checkbox" disabled={!has} checked={!!picked[r.trip.id]} onChange={(e) => setPicked((p) => ({ ...p, [r.trip.id]: e.target.checked }))} />
                        {has && <span className="inline-block w-3 h-3 rounded-full" style={{ background: colorFor(r.trip.id) }} />}
                        {fmtDay(r.trip.date)} · {SHIFT[r.trip.shift] || r.trip.shift}
                      </label>
                      {has ? (
                        <>
                          <p className="text-navy-600">
                            {(r.meters / 1000).toFixed(1)} km · {r.minutes ? `${Math.round(r.minutes)} min` : '—'}{r.kmh ? ` · ${r.kmh.toFixed(0)} km/h` : ''} · {r.stops.length} alumno(s) con ubicación{r.stops.length ? ` · ${(r.meters / 1000 / r.stops.length).toFixed(2)} km por alumno` : ''}
                          </p>
                          {over >= 15 && <p className="text-amber-700">+{over.toFixed(0)}% más largo que el día más corto de este turno: posible desvío.</p>}
                          <button type="button" className="link-action" disabled={st?.busy} onClick={() => loadStreets(r)}>{st?.busy ? 'Buscando calles…' : 'Ver calles por donde pasó'}</button>
                          {st?.list?.length > 0 && <p className="text-navy-600">{st.list.join(' → ')}</p>}
                        </>
                      ) : <p className="text-navy-400">Sin huella GPS guardada.</p>}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-navy-400">Las calles se obtienen de OpenStreetMap tomando un punto cada ~350 m (máximo 40 por recorrido); es una referencia, no un listado exacto.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
