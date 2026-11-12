import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardCheck, RefreshCw, ChevronDown, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Routes, Drivers, Units } from '../../firebase/services';
import {
  listTripsByDate, getTripStopsOnce, adminSetStopStatus, adminUpdateTripKm, adminReopenTrip, completeTrip,
  deleteTripCascade, todayString,
} from '../../firebase/trips';
import { tsMs } from '../../utils/tripOrder';
import LoadingOverlay from '../../components/LoadingOverlay';

/**
 * Corregir recorridos (solo admin)
 * Para cualquier recorrido de un día, en curso o ya cerrado: corregir el pase de lista
 * de cada alumno, el kilometraje inicial y final, reabrirlo, cerrarlo o eliminarlo.
 * Toda corrección queda marcada en el recorrido (quién y cuándo).
 */

const STATUS_OPTIONS = [
  { v: 'pending', n: 'Sin marcar' },
  { v: 'boarded', n: 'Abordó / a bordo' },
  { v: 'delivered', n: 'Bajó / entregado' },
  { v: 'absent', n: 'No asistió' },
];
const fmtTime = (ts) => { const ms = tsMs(ts); return ms ? new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'; };

function TripEditor({ trip, route, operator, unit, by, onChanged }) {
  const [open, setOpen] = useState(false);
  const [stops, setStops] = useState(null);
  const [kmIni, setKmIni] = useState(trip.kmInicial ?? '');
  const [kmFin, setKmFin] = useState(trip.kmFinal ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const closed = trip.status === 'completed';
  const isMorning = trip.shift === 'morning';

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && stops === null) {
      setBusy(true);
      try { setStops(await getTripStopsOnce(trip.id)); } catch (e) { setError(e?.message || 'No se pudieron cargar los alumnos.'); }
      setBusy(false);
    }
  }
  async function run(fn, okMsg) {
    setBusy(true); setError(''); setMsg('');
    try { await fn(); if (okMsg) setMsg(okMsg); } catch (e) { console.error(e); setError(e?.message || 'No se pudo guardar.'); }
    setBusy(false);
  }
  const changeStatus = (stop, status) => run(async () => {
    if (status === stop.status) return;
    setStops(await adminSetStopStatus(trip, stop, status, by));
  }, 'Pase de lista corregido.');
  const saveKm = () => run(async () => { await adminUpdateTripKm(trip, { kmInicial: kmIni, kmFinal: kmFin }, by); await onChanged(); }, 'Kilometraje guardado.');
  const reopen = () => run(async () => {
    if (!window.confirm('¿Reabrir este recorrido? El operador podrá terminarlo y volver a capturar el kilometraje final.')) return;
    await adminReopenTrip(trip, by); await onChanged();
  });
  const closeIt = () => run(async () => {
    if (kmFin === '' || Number.isNaN(Number(kmFin))) throw new Error('Captura el kilometraje final para cerrarlo.');
    await completeTrip(trip.id, trip, kmFin, true); await onChanged();
  }, 'Recorrido cerrado.');
  const remove = () => run(async () => {
    if (!window.confirm('¿Eliminar este recorrido por completo? Se borran su asistencia, kilometraje y huella GPS, y no se puede deshacer. Hazlo solo si la información es errónea.')) return;
    await deleteTripCascade(trip); await onChanged();
  });

  return (
    <div className="admin-card space-y-3">
      <LoadingOverlay show={busy} label="Guardando…" />
      <button type="button" onClick={toggle} className="w-full flex items-start justify-between gap-3 text-left">
        <div>
          <p className="font-semibold text-navy-900">{route?.name || 'Ruta'} · {isMorning ? 'Entrada' : 'Salida'}{trip.kind === 'taller' ? ' · Taller' : ''}</p>
          <p className="text-xs text-navy-500">
            {operator || '—'} · Unidad {unit?.plate || '—'} · Km {trip.kmInicial ?? '—'} → {trip.kmFinal ?? '—'} · Inicio {fmtTime(trip.startedAt)}{closed ? ` · Cierre ${fmtTime(trip.completedAt)}` : ''}
          </p>
          <p className="text-xs mt-1">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${closed ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>{closed ? 'Cerrado' : 'En curso'}</span>
            {trip.closedByAdmin && <span className="ml-2 text-amber-700">cerrado por admin</span>}
            {trip.correctedByAdmin && <span className="ml-2 text-amber-700">con correcciones</span>}
          </p>
        </div>
        <ChevronDown size={18} className="text-navy-400 mt-1 shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div className="space-y-4 pt-3 border-t border-navy-100">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <div><label className="admin-label">Km inicial</label><input type="number" className="admin-input" value={kmIni} onChange={(e) => setKmIni(e.target.value)} /></div>
            <div><label className="admin-label">Km final</label><input type="number" className="admin-input" value={kmFin} onChange={(e) => setKmFin(e.target.value)} /></div>
            <button type="button" className="btn-admin-primary" onClick={saveKm}>Guardar km</button>
          </div>

          <div className="flex flex-wrap gap-3 text-xs">
            {closed
              ? <button type="button" className="btn-admin-ghost" onClick={reopen}>Reabrir recorrido</button>
              : <button type="button" className="btn-admin-ghost" onClick={closeIt}>Cerrar recorrido (usa el km final de arriba)</button>}
            <button type="button" className="link-danger inline-flex items-center gap-1" onClick={remove}><Trash2 size={12} /> Eliminar recorrido</button>
          </div>

          <div>
            <p className="text-sm font-semibold text-navy-800 mb-1">Pase de lista ({stops?.length ?? 0})</p>
            <div className="divide-y divide-navy-50 rounded-xl border border-navy-100 max-h-96 overflow-y-auto">
              {(stops || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((s) => (
                <div key={s.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{s.name}{s.addedManually ? <span className="ml-2 text-[10px] text-navy-400">agregado en ruta</span> : null}</p>
                    <p className="text-[11px] text-navy-400">
                      {s.matricula} · {isMorning ? `subió ${fmtTime(s.boardedAt)}` : `bajó ${fmtTime(s.deliveredAt)}`}
                      {s.lastUndoBy ? ` · deshecho por ${s.lastUndoBy}` : ''}
                    </p>
                  </div>
                  <select className="admin-select max-w-[190px]" value={s.status || 'pending'} onChange={(e) => changeStatus(s, e.target.value)}>
                    {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.n}</option>)}
                  </select>
                </div>
              ))}
              {stops && stops.length === 0 && <p className="p-3 text-xs text-navy-400">Este recorrido no tiene alumnos.</p>}
            </div>
            <p className="text-[11px] text-navy-400 mt-1">Al corregir un alumno se conservan sus horas originales si ya las tenía; si pasa a «Abordó» o «Bajó» sin hora previa, se registra la hora de la corrección. Los marcados corregidos quedan señalados.</p>
          </div>

          {Array.isArray(trip.correctionLog) && trip.correctionLog.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-navy-700 mb-1">Bitácora de correcciones</p>
              <ul className="text-[11px] text-navy-500 space-y-0.5 max-h-28 overflow-y-auto">
                {[...trip.correctionLog].reverse().map((c, i) => <li key={i}>{new Date(c.at).toLocaleString('es-MX')} · {c.by || 'Admin'} · {c.what}</li>)}
              </ul>
            </div>
          )}
          {msg && <p className="text-xs text-green-700">{msg}</p>}
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function CorregirRecorridos() {
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get('fecha') || todayString());
  const [trips, setTrips] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [units, setUnits] = useState([]);
  const [fRoute, setFRoute] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([Routes.list(), Drivers.list(), Units.list()])
      .then(([r, d, u]) => { setRoutes(r || []); setDrivers(d || []); setUnits(u || []); })
      .catch((e) => setError(e?.message || 'No se pudieron cargar los catálogos.'));
  }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const rows = await listTripsByDate(date);
      setTrips(rows.sort((a, b) => (tsMs(a.startedAt) || 0) - (tsMs(b.startedAt) || 0)));
    } catch (e) { console.error(e); setError(e?.message || 'No se pudieron cargar los recorridos.'); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [date]);

  const view = useMemo(() => trips.filter((t) => !fRoute || t.routeId === fRoute), [trips, fRoute]);

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="admin-h1 mb-1 flex items-center gap-2"><ClipboardCheck size={22} /> Corregir recorridos</h1>
        <p className="text-sm text-navy-400">Corrige pase de lista y kilometraje de cualquier recorrido, reábrelo, ciérralo o elimínalo si tiene información errónea.</p>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className="admin-input max-w-[170px]" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className="admin-select max-w-[220px]" value={fRoute} onChange={(e) => setFRoute(e.target.value)}>
          <option value="">Todas las rutas</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <button type="button" className="btn-admin-ghost" onClick={load} disabled={loading}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
      </div>
      {loading ? <p className="text-sm text-navy-500">Cargando…</p> : view.length === 0 ? <p className="text-sm text-navy-400">No hay recorridos ese día.</p> : (
        view.map((t) => (
          <TripEditor
            key={t.id}
            trip={t}
            route={routes.find((r) => r.id === t.routeId)}
            operator={drivers.find((d) => d.id === t.driverId)?.name}
            unit={units.find((u) => u.id === t.unitId)}
            by={profile}
            onChanged={load}
          />
        ))
      )}
    </div>
  );
}
