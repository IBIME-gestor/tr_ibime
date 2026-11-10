import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Units } from '../../firebase/services';
import {
  SpecialTrips, SPECIAL_STATUS, startSpecialTrip, finishSpecialTrip,
} from '../../firebase/specialTrips';
import { tsMs } from '../../utils/tripOrder';
import LoadingOverlay from '../../components/LoadingOverlay';

/**
 * Viajes especiales · vista del operador
 * Muestra los viajes que el administrador le asignó (traslados solicitados por
 * dirección, coordinación, etc.). Al iniciar elige la unidad, el km inicial y
 * cuántos alumnos suben; al cerrar registra el km final y cuántos regresan.
 */

const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
const fmtTime = (ts) => {
  const ms = tsMs(ts);
  return ms ? new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
};

function TripCard({ trip, units, onChanged }) {
  const [open, setOpen] = useState(false);
  const [unitId, setUnitId] = useState(trip.unitId || '');
  const [km, setKm] = useState('');
  const [count, setCount] = useState(trip.studentsPlanned ? String(trip.studentsPlanned) : '');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleStart(e) {
    e.preventDefault();
    setBusy(true); setError('');
    let ignoreKmAlert = false;
    try {
      for (let i = 0; i < 2; i += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await startSpecialTrip(trip, { unitId, kmInicial: km, studentsStart: count, ignoreKmAlert });
          break;
        } catch (err) {
          if (err.code === 'KM_LOWER' && !ignoreKmAlert && window.confirm(`${err.message}\n\n¿Confirmas que el kilometraje es correcto?`)) {
            ignoreKmAlert = true;
          } else {
            throw err;
          }
        }
      }
      setOpen(false); setKm('');
      await onChanged();
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el viaje.');
    }
    setBusy(false);
  }

  async function handleFinish(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await finishSpecialTrip(trip, { kmFinal: km, studentsEnd: count, notes });
      setOpen(false); setKm(''); setNotes('');
      await onChanged();
    } catch (err) {
      setError(err.message || 'No se pudo cerrar el viaje.');
    }
    setBusy(false);
  }

  const inputCls = 'w-full rounded-xl border border-navy-100 px-3 py-2.5 text-base bg-white';
  const done = trip.status === 'completado';

  return (
    <div className="card space-y-2 cascade-item">
      <LoadingOverlay show={busy} label="Guardando…" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display font-semibold text-navy-900">{trip.motivo || 'Viaje especial'}</p>
          <p className="text-xs text-navy-400">
            {fmtDate(trip.date)} · {trip.scheduledStart || '—'}{trip.scheduledEnd ? ` a ${trip.scheduledEnd}` : ''}
            {trip.schoolName ? ` · ${trip.schoolName}` : ''}
          </p>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-navy-50 text-navy-600 shrink-0">{SPECIAL_STATUS[trip.status] || trip.status}</span>
      </div>
      {trip.destino && <p className="text-sm text-navy-600">Destino: {trip.destino}</p>}
      {trip.descripcion && <p className="text-xs text-navy-500">{trip.descripcion}</p>}
      <p className="text-xs text-navy-400">
        Solicita: {trip.requestedByName || '—'}{trip.requestedByArea ? ` (${trip.requestedByArea})` : ''}
        {trip.studentsPlanned ? ` · ~${trip.studentsPlanned} alumnos` : ''}
      </p>

      {done && (
        <p className="text-xs text-navy-500">
          Unidad {trip.unitName || '—'} · {fmtTime(trip.startedAt)} – {fmtTime(trip.endedAt)} · {Math.max(0, Number(trip.kmFinal || 0) - Number(trip.kmInicial || 0))} km · {trip.studentsStart ?? 0} suben / {trip.studentsEnd ?? 0} regresan
        </p>
      )}
      {trip.status === 'en_curso' && (
        <p className="text-xs text-navy-500">En curso desde {fmtTime(trip.startedAt)} · Unidad {trip.unitName || '—'} · km inicial {trip.kmInicial} · {trip.studentsStart ?? 0} alumnos</p>
      )}

      {(trip.status === 'asignado' || trip.status === 'en_curso') && !open && (
        <button type="button" className="btn-go w-full" onClick={() => setOpen(true)}>
          {trip.status === 'asignado' ? 'Iniciar viaje' : 'Terminar viaje'}
        </button>
      )}

      {open && trip.status === 'asignado' && (
        <form onSubmit={handleStart} className="space-y-2 pt-1">
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputCls} required>
            <option value="">¿Qué unidad vas a usar?</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.plate}{u.model ? ` — ${u.model}` : ''}{u.capacity ? ` (${u.capacity} lugares)` : ''}</option>
            ))}
          </select>
          <input value={km} onChange={(e) => setKm(e.target.value)} type="number" inputMode="decimal" placeholder="Kilometraje inicial" className={inputCls} required />
          <input value={count} onChange={(e) => setCount(e.target.value)} type="number" inputMode="numeric" min="0" placeholder="¿Cuántos alumnos suben?" className={inputCls} required />
          {error && <p className="text-stop text-sm">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-admin-ghost flex-1" onClick={() => { setOpen(false); setError(''); }}>Cancelar</button>
            <button type="submit" className="btn-go flex-1">Iniciar</button>
          </div>
        </form>
      )}

      {open && trip.status === 'en_curso' && (
        <form onSubmit={handleFinish} className="space-y-2 pt-1">
          <input value={km} onChange={(e) => setKm(e.target.value)} type="number" inputMode="decimal" placeholder="Kilometraje final" className={inputCls} required />
          <input value={count} onChange={(e) => setCount(e.target.value)} type="number" inputMode="numeric" min="0" placeholder={`¿Cuántos alumnos regresan? (salieron ${trip.studentsStart ?? 0})`} className={inputCls} />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notas (opcional)" className={inputCls} />
          {error && <p className="text-stop text-sm">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-admin-ghost flex-1" onClick={() => { setOpen(false); setError(''); }}>Cancelar</button>
            <button type="submit" className="btn-go flex-1">Terminar</button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function DriverSpecialTrips() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    if (!profile?.staffId) { setLoading(false); return; }
    try {
      const [t, u] = await Promise.all([SpecialTrips.listByOperator(profile.staffId), Units.list()]);
      setTrips(t || []); setUnits(u || []); setError('');
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudieron cargar tus viajes.');
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [profile?.staffId]);

  if (loading) return <LoadingOverlay show label="Cargando viajes…" />;
  if (profile?.role !== 'driver') {
    return <div className="card text-center text-sm text-navy-500">Los viajes especiales los registra el operador asignado.</div>;
  }

  const active = trips.filter((t) => t.status === 'asignado' || t.status === 'en_curso');
  const past = trips.filter((t) => t.status === 'completado').slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display font-bold text-lg text-navy-900">Viajes especiales</h1>
        <p className="text-xs text-navy-400">Traslados solicitados fuera del horario de las rutas.</p>
      </div>
      {error && <p className="text-stop text-sm">{error}</p>}
      {active.length === 0 && <div className="card text-sm text-navy-400 text-center">No tienes viajes especiales asignados.</div>}
      {active.map((t) => <TripCard key={t.id} trip={t} units={units} onChanged={load} />)}
      {past.length > 0 && (
        <>
          <p className="text-xs font-semibold text-navy-500 pt-2">Últimos viajes terminados</p>
          {past.map((t) => <TripCard key={t.id} trip={t} units={units} onChanged={load} />)}
        </>
      )}
    </div>
  );
}
