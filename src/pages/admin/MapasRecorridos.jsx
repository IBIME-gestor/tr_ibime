import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Printer } from 'lucide-react';
import { Routes, Schools } from '../../firebase/services';
import { listTripsByRouteBetween, getTripStopsOnce } from '../../firebase/trips';
import { numberedIcon, schoolIcon, startFlagIcon, finishFlagIcon } from '../../utils/mapIcons';
import { actualSequence } from '../../utils/tripOrder';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/* ------------------------------------------------------------------ */
/*  Mapas de recorridos (admin)                                        */
/*  · Por día: el mismo mapa final que ve el operador, separado en      */
/*    ENTRADA (recolección, ida) y SALIDA (entrega, vuelta).            */
/*  · Promedio semanal: punto promedio de cada alumno + orden y hora    */
/*    promedio, para recalcular la ruta.                                */
/* ------------------------------------------------------------------ */

const SHIFTS = {
  morning:   { label: 'Entrada · recolección (ida)', short: 'Entrada', locKey: 'boardedLocation', timeKey: 'boardedAt', color: '#FFC93C' },
  afternoon: { label: 'Salida · entrega (vuelta)', short: 'Salida', locKey: 'deliveredLocation', timeKey: 'deliveredAt', color: '#2F80ED' },
};
const MEXICO_CITY = [19.4326, -99.1332];

const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (date) => { const d = new Date(`${date}T12:00:00`); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10); };
const fmtShort = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
const tsMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null);
const minutesOfDay = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const fmtHM = (min) => (min == null ? '—' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`);
const fmtTs = (ts) => { const ms = tsMs(ts); return ms ? new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'; };
function meters(a, b) {
  const R = 6371000; const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function Fit({ points, keyId }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId]);
  return null;
}

function MapBox({ title, markers, line, schoolLoc, schoolName, startLoc, endLoc, height = 340, keyId }) {
  const pts = markers.map((m) => [m.lat, m.lng]);
  if (startLoc?.lat != null) pts.push([startLoc.lat, startLoc.lng]);
  if (endLoc?.lat != null) pts.push([endLoc.lat, endLoc.lng]);
  if (schoolLoc?.lat) pts.push([schoolLoc.lat, schoolLoc.lng]);
  return (
    <div className="admin-card p-0 overflow-hidden break-inside-avoid">
      <div className="px-4 py-2.5 border-b border-navy-100 flex justify-between items-center">
        <p className="font-display font-semibold text-sm">{title}</p>
        <span className="text-xs text-navy-400">{markers.length} punto(s)</span>
      </div>
      {markers.length === 0 ? (
        <div className="flex items-center justify-center text-sm text-navy-400 bg-navy-50" style={{ height }}>Sin ubicaciones registradas.</div>
      ) : (
        <div style={{ height }}>
          <MapContainer center={pts[0] || MEXICO_CITY} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Fit points={pts} keyId={keyId} />
            {line && markers.length > 1 && <Polyline positions={markers.map((m) => [m.lat, m.lng])} pathOptions={{ color: '#152238', weight: 3, opacity: 0.55, dashArray: '6 6' }} />}
            {schoolLoc?.lat && <Marker position={[schoolLoc.lat, schoolLoc.lng]} icon={schoolIcon()}><Popup>{schoolName || 'Plantel'}</Popup></Marker>}
            {startLoc?.lat != null && <Marker position={[startLoc.lat, startLoc.lng]} icon={startFlagIcon()}><Popup>Salida · inicio del recorrido</Popup></Marker>}
            {endLoc?.lat != null && <Marker position={[endLoc.lat, endLoc.lng]} icon={finishFlagIcon()}><Popup>Meta · cierre del recorrido</Popup></Marker>}
            {markers.map((m, i) => (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={numberedIcon(m.n ?? i + 1, m.color)}>
                <Popup><div className="text-xs leading-relaxed">{m.popup}</div></Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

export default function MapasRecorridos() {
  const [routes, setRoutes] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [mode, setMode] = useState('dia'); // 'dia' | 'semana'
  const [date, setDate] = useState(localToday());
  const [weekStart, setWeekStart] = useState(mondayOf(localToday()));
  const [trips, setTrips] = useState([]); // últimas 10 semanas de la ruta
  const [stopsByTrip, setStopsByTrip] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [layers, setLayers] = useState({ morning: true, afternoon: true });
  const cache = useRef({});

  useEffect(() => { Routes.list().then(setRoutes).catch(console.error); Schools.list().then(setSchools).catch(console.error); }, []);
  const route = routes.find((r) => r.id === routeId) || null;
  const school = schools.find((s) => s.id === route?.schoolId) || null;

  // Recorridos de la ruta (últimas 10 semanas) — solo los encabezados, sin paradas.
  useEffect(() => {
    cache.current = {}; setStopsByTrip({}); setTrips([]);
    if (!routeId) return;
    let alive = true;
    setLoading(true); setError('');
    listTripsByRouteBetween(routeId, addDays(localToday(), -70), localToday())
      .then((rows) => { if (alive) setTrips(rows); })
      .catch((e) => { console.error(e); if (alive) setError(e?.message || 'No se pudieron cargar los recorridos.'); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [routeId]);

  const tripDates = useMemo(() => [...new Set(trips.map((t) => t.date))].sort().reverse(), [trips]);
  useEffect(() => { if (tripDates.length && !tripDates.includes(date) && mode === 'dia') setDate(tripDates[0]); /* eslint-disable-next-line */ }, [tripDates]);

  async function ensureStops(list) {
    const missing = list.filter((t) => !cache.current[t.id]);
    if (!missing.length) return;
    setLoading(true);
    try {
      for (const t of missing) cache.current[t.id] = await getTripStopsOnce(t.id);
      setStopsByTrip({ ...cache.current });
    } catch (e) { console.error(e); setError(e?.message || 'No se pudieron cargar las paradas.'); }
    finally { setLoading(false); }
  }

  const dayTrips = useMemo(() => trips.filter((t) => t.date === date), [trips, date]);
  const weekEnd = addDays(weekStart, 4);
  const weekTrips = useMemo(() => trips.filter((t) => t.date >= weekStart && t.date <= weekEnd), [trips, weekStart, weekEnd]);

  useEffect(() => { if (mode === 'dia') ensureStops(dayTrips); /* eslint-disable-next-line */ }, [mode, dayTrips]);
  useEffect(() => { if (mode === 'semana') ensureStops(weekTrips); /* eslint-disable-next-line */ }, [mode, weekTrips]);

  // ---------- Por día ----------
  const dayMarkers = (shift) => {
    const cfg = SHIFTS[shift];
    const trip = dayTrips.find((t) => t.shift === shift);
    if (!trip) return { trip: null, markers: [] };
    // Orden REAL de atención (por hora de marcado), no el de la lista.
    const stops = actualSequence(stopsByTrip[trip.id] || [], shift).filter((s) => s[cfg.locKey]?.lat);
    return {
      trip,
      markers: stops.map((s) => ({
        id: s.id, n: s.seq, lat: s[cfg.locKey].lat, lng: s[cfg.locKey].lng, color: cfg.color,
        popup: <><p className="font-semibold">{s.name}</p><p>Matrícula: {s.matricula}</p><p>{cfg.short}: {fmtTs(s[cfg.timeKey])}</p></>,
      })),
    };
  };

  // ---------- Promedio semanal ----------
  const weekly = useMemo(() => {
    const out = {};
    Object.entries(SHIFTS).forEach(([shift, cfg]) => {
      const byStudent = new Map();
      weekTrips.filter((t) => t.shift === shift).forEach((t) => {
        (stopsByTrip[t.id] || []).forEach((s) => {
          if (s.status === 'absent' || !s[cfg.locKey]?.lat) return;
          const cur = byStudent.get(s.studentId) || { name: s.name, matricula: s.matricula, pts: [], mins: [], orders: [] };
          cur.pts.push(s[cfg.locKey]);
          const ms = tsMs(s[cfg.timeKey]); if (ms) cur.mins.push(minutesOfDay(ms));
          cur.orders.push(s.order ?? 0);
          byStudent.set(s.studentId, cur);
        });
      });
      const avg = (a) => a.reduce((n, x) => n + x, 0) / a.length;
      const items = [...byStudent.entries()].map(([id, v]) => {
        const c = { lat: avg(v.pts.map((p) => p.lat)), lng: avg(v.pts.map((p) => p.lng)) };
        return { id, name: v.name, matricula: v.matricula, ...c, days: v.pts.length,
          avgMin: v.mins.length ? avg(v.mins) : null, avgOrder: avg(v.orders),
          spread: v.pts.length > 1 ? Math.max(...v.pts.map((p) => meters(c, p))) : 0 };
      }).sort((a, b) => (a.avgMin != null && b.avgMin != null ? a.avgMin - b.avgMin : a.avgOrder - b.avgOrder));
      out[shift] = items;
    });
    return out;
  }, [weekTrips, stopsByTrip]);

  // Resumen por semana (solo con los encabezados de recorrido, sin paradas)
  const weekSummary = useMemo(() => {
    const map = new Map();
    trips.forEach((t) => {
      const w = mondayOf(t.date);
      const cur = map.get(w) || { week: w, morning: 0, afternoon: 0, km: 0, durMin: [] };
      cur[t.shift] += 1;
      if (!t.kmShared && t.kmInicial != null && t.kmFinal != null) cur.km += Math.max(0, Number(t.kmFinal) - Number(t.kmInicial));
      const a = tsMs(t.startedAt); const b = tsMs(t.completedAt);
      if (a && b && b > a) cur.durMin.push((b - a) / 60000);
      map.set(w, cur);
    });
    return [...map.values()].sort((a, b) => b.week.localeCompare(a.week));
  }, [trips]);

  const weekLabel = `${fmtShort(weekStart)} → ${fmtShort(weekEnd)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="admin-h1">Mapas de recorridos</h1>
          <p className="text-sm text-navy-400 mt-1 max-w-3xl">Los puntos reales donde el operador recogió (entrada) y entregó (salida) a cada alumno, por día y como promedio semanal para recalcular la ruta. En el mapa del día los números son el orden en que se atendió a cada alumno; 🚩 marca dónde inició el recorrido y 🏁 dónde se cerró.</p>
        </div>
        <button className="btn-admin-ghost" onClick={() => window.print()}><Printer size={14} className="inline mr-1" />Imprimir</button>
      </div>

      <div className="admin-card print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]"><label className="admin-label">Ruta</label>
            <select className="admin-select w-full" value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">— elige ruta —</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div className="flex gap-2">
            <button type="button" className={mode === 'dia' ? 'btn-admin-primary' : 'btn-admin-ghost'} onClick={() => setMode('dia')}>Por día</button>
            <button type="button" className={mode === 'semana' ? 'btn-admin-primary' : 'btn-admin-ghost'} onClick={() => setMode('semana')}>Promedio semanal</button>
          </div>
          {mode === 'dia' && <div><label className="admin-label">Día</label><input type="date" className="admin-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
          {mode === 'semana' && <div><label className="admin-label">Semana (lunes)</label><input type="date" className="admin-input" value={weekStart} onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))} /></div>}
          {loading && <span className="text-xs text-navy-400">Cargando…</span>}
        </div>
        {mode === 'dia' && tripDates.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tripDates.slice(0, 14).map((d) => <button key={d} type="button" onClick={() => setDate(d)} className={`px-2 py-1 rounded border text-xs ${d === date ? 'bg-signal-yellow/30 border-signal-yellow' : 'border-navy-200'}`}>{fmtShort(d)}</button>)}
          </div>
        )}
        {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      </div>

      {!routeId && <p className="text-sm text-navy-400">Elige una ruta para ver sus mapas.</p>}

      {routeId && mode === 'dia' && (
        <>
          <p className="text-sm text-navy-600">{route?.name} · <b>{fmtShort(date)}</b>{!dayTrips.length && !loading ? ' · no hubo recorridos ese día.' : ''}</p>
          <div className="grid lg:grid-cols-2 gap-4">
            {Object.entries(SHIFTS).map(([shift, cfg]) => {
              const { trip, markers } = dayMarkers(shift);
              return (
                <div key={shift} className="space-y-2">
                  <MapBox title={cfg.label} markers={markers} line schoolLoc={school?.geocodedLocation} schoolName={school?.name} startLoc={trip?.startLocation} endLoc={trip?.endLocation} keyId={`${date}-${shift}-${markers.length}`} />
                  {trip && <p className="text-xs text-navy-500">Inicio {fmtTs(trip.startedAt)} · fin {fmtTs(trip.completedAt)} · km {trip.kmInicial != null && trip.kmFinal != null ? (trip.kmFinal - trip.kmInicial).toFixed(1) : '—'} · {trip.status === 'completed' ? 'completado' : 'en curso'}</p>}
                  {markers.length > 0 && <ol className="text-xs text-navy-600 columns-2 gap-4">{actualSequence(stopsByTrip[trip.id] || [], shift).filter((s) => s[cfg.locKey]?.lat).map((s) => <li key={s.id} className="break-inside-avoid">{s.seq}. {s.name} · {fmtTs(s[cfg.timeKey])}</li>)}</ol>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {routeId && mode === 'semana' && (
        <>
          <div className="flex flex-wrap items-center gap-4 print:hidden">
            <p className="text-sm text-navy-600">{route?.name} · semana <b>{weekLabel}</b> · {weekTrips.length} recorrido(s)</p>
            {Object.entries(SHIFTS).map(([k, cfg]) => (
              <label key={k} className="text-sm inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /><span className="inline-block w-3 h-3 rounded-full" style={{ background: cfg.color }} />{cfg.short}</label>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {Object.entries(SHIFTS).filter(([k]) => layers[k]).map(([shift, cfg]) => {
              const items = weekly[shift] || [];
              const markers = items.map((it) => ({
                ...it, color: cfg.color,
                popup: <><p className="font-semibold">{it.name}</p><p>Matrícula: {it.matricula}</p><p>Hora promedio: {fmtHM(it.avgMin)}</p><p>Días con dato: {it.days}</p><p>Dispersión: {Math.round(it.spread)} m</p></>,
              }));
              return (
                <div key={shift} className="space-y-2">
                  <MapBox title={`Promedio · ${cfg.label}`} markers={markers} line schoolLoc={school?.geocodedLocation} schoolName={school?.name} keyId={`${weekStart}-${shift}-${markers.length}`} />
                  {items.length > 0 && (
                    <div className="admin-card p-0 overflow-hidden">
                      <table className="table-admin text-xs"><thead><tr><th className="pl-4">#</th><th>Alumno</th><th>Hora prom.</th><th className="text-right">Días</th><th className="text-right pr-4">Dispersión</th></tr></thead>
                        <tbody>{items.map((it, i) => <tr key={it.id}><td className="pl-4">{i + 1}</td><td>{it.name}</td><td>{fmtHM(it.avgMin)}</td><td className="text-right">{it.days}</td><td className={`text-right pr-4 ${it.spread > 150 ? 'text-signal-amber font-semibold' : ''}`}>{Math.round(it.spread)} m</td></tr>)}</tbody></table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-navy-400">El punto de cada alumno es el promedio de los días de la semana; el orden va por hora promedio. «Dispersión» = qué tan lejos cayó el punto más alejado del promedio (si es grande, el operador no recoge/entrega siempre en el mismo lugar).</p>

          <div className="admin-card p-0 overflow-hidden print:hidden">
            <div className="px-5 py-3 border-b border-navy-100"><p className="font-display font-semibold text-sm">Semanas recientes de la ruta</p></div>
            <table className="table-admin text-sm"><thead><tr><th className="pl-5">Semana</th><th className="text-right">Ida</th><th className="text-right">Vuelta</th><th className="text-right">Km</th><th className="text-right pr-5">Duración prom.</th></tr></thead>
              <tbody>{weekSummary.map((w) => (
                <tr key={w.week} className={`cursor-pointer hover:bg-navy-50 ${w.week === weekStart ? 'bg-signal-yellow/15' : ''}`} onClick={() => setWeekStart(w.week)}>
                  <td className="pl-5">{fmtShort(w.week)} → {fmtShort(addDays(w.week, 4))}</td><td className="text-right">{w.morning}</td><td className="text-right">{w.afternoon}</td>
                  <td className="text-right">{w.km.toFixed(1)}</td><td className="text-right pr-5">{w.durMin.length ? `${Math.round(w.durMin.reduce((a, b) => a + b, 0) / w.durMin.length)} min` : '—'}</td>
                </tr>))}</tbody></table>
            {!weekSummary.length && <p className="text-center text-sm text-navy-400 py-6">Esta ruta no tiene recorridos en las últimas 10 semanas.</p>}
          </div>
        </>
      )}
    </div>
  );
}
