import { useEffect, useMemo, useState } from 'react';
import { Gauge, RefreshCw } from 'lucide-react';
import { Units, Routes, Drivers } from '../../firebase/services';
import { listTripsByUnit, KM_GAP_ALERT } from '../../firebase/trips';
import { SpecialTrips } from '../../firebase/specialTrips';
import { tsMs } from '../../utils/tripOrder';

/**
 * Historial por unidad (solo admin)
 * Junta recorridos normales, recorridos de taller y viajes especiales de una
 * unidad, con km, operador y alumnos, y valida la cadena de odómetro: cada km
 * inicial debe ser ≥ al km final anterior de la misma unidad, y un salto grande
 * indica kilómetros sin registrar.
 */

const monthNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 7); };
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }) : '—');
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—');

export default function HistorialUnidad() {
  const [units, setUnits] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [unitId, setUnitId] = useState('');
  const [month, setMonth] = useState(monthNow());
  const [trips, setTrips] = useState([]);
  const [specials, setSpecials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([Units.list(), Routes.list(), Drivers.list()])
      .then(([u, r, d]) => { setUnits(u || []); setRoutes(r || []); setDrivers(d || []); })
      .catch((e) => setError(e?.message || 'No se pudieron cargar los catálogos.'));
  }, []);

  async function load() {
    if (!unitId) return;
    setLoading(true); setError('');
    try {
      const [t, s] = await Promise.all([listTripsByUnit(unitId), SpecialTrips.listByUnit(unitId)]);
      setTrips(t || []); setSpecials(s || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo leer el historial.');
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [unitId]);

  const unit = units.find((u) => u.id === unitId);
  const routeName = (id) => routes.find((r) => r.id === id)?.name || 'Ruta';
  const driverName = (id) => drivers.find((d) => d.id === id)?.name || '—';

  const entries = useMemo(() => {
    const out = [];
    trips.forEach((t) => {
      out.push({
        key: `t${t.id}`, type: t.kind === 'taller' ? 'Taller' : `Recorrido ${t.shift === 'morning' ? 'ida' : 'vuelta'}`,
        date: t.date, startMs: tsMs(t.startedAt), endMs: tsMs(t.completedAt),
        operator: driverName(t.driverId), label: routeName(t.routeId),
        kmIni: t.kmInicial ?? null, kmFin: t.kmFinal ?? null,
        students: t.studentsResolved ?? t.studentsTotal ?? null,
        changed: !!t.unitChosenByOperator, flag: t.kmAlert,
      });
    });
    specials.forEach((t) => {
      if (t.status === 'cancelado' || t.status === 'asignado' || t.status === 'solicitado') return;
      out.push({
        key: `s${t.id}`, type: 'Viaje especial', date: t.date, startMs: tsMs(t.startedAt), endMs: tsMs(t.endedAt),
        operator: t.operatorName || driverName(t.operatorId), label: t.motivo || 'Viaje especial',
        kmIni: t.kmInicial ?? null, kmFin: t.kmFinal ?? null, students: t.studentsStart ?? null, changed: false, flag: t.kmAlert,
      });
    });
    out.sort((a, b) => (a.startMs || 0) - (b.startMs || 0) || String(a.date).localeCompare(String(b.date)));
    // Validación de la cadena de odómetro (sobre TODO el historial, no solo el mes).
    let prevFin = null;
    out.forEach((e) => {
      e.issues = [];
      if (e.kmIni != null && e.kmFin != null && Number(e.kmFin) < Number(e.kmIni)) e.issues.push('Km final menor al inicial');
      if (e.kmIni != null && prevFin != null) {
        if (Number(e.kmIni) < prevFin) e.issues.push(`Km inicial menor al último registrado (${prevFin})`);
        else if (Number(e.kmIni) - prevFin > KM_GAP_ALERT) e.issues.push(`${(Number(e.kmIni) - prevFin).toFixed(0)} km sin registrar desde el viaje anterior`);
      }
      if (e.kmFin != null) prevFin = Number(e.kmFin);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, specials, routes, drivers]);

  const view = entries.filter((e) => !month || String(e.date || '').slice(0, 7) === month);
  const kmOf = (e) => (e.kmIni != null && e.kmFin != null ? Math.max(0, Number(e.kmFin) - Number(e.kmIni)) : 0);
  const totalKm = view.reduce((n, e) => n + kmOf(e), 0);
  const issuesCount = view.filter((e) => e.issues.length).length;
  const byOperator = useMemo(() => {
    const m = {};
    view.forEach((e) => { m[e.operator] = m[e.operator] || { n: 0, km: 0 }; m[e.operator].n += 1; m[e.operator].km += kmOf(e); });
    return Object.entries(m).sort((a, b) => b[1].km - a[1].km);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="admin-h1 mb-1 flex items-center gap-2"><Gauge size={22} /> Historial por unidad</h1>
        <p className="text-sm text-navy-400 max-w-3xl">Recorridos, talleres y viajes especiales de cada unidad, con kilometraje, operador y validación del odómetro.</p>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <select className="admin-select max-w-xs" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">Elige una unidad…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.plate}{u.model ? ` — ${u.model}` : ''}</option>)}
        </select>
        <input type="month" className="admin-input max-w-[160px]" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button type="button" className="btn-admin-ghost" onClick={load} disabled={!unitId || loading}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
      </div>

      {!unitId ? <p className="text-sm text-navy-400">Elige una unidad para ver su historial.</p> : loading ? <p className="text-sm text-navy-500">Cargando…</p> : (
        <>
          <div className="admin-card text-sm space-y-1">
            <p className="font-semibold text-navy-800">{unit?.plate} · último km registrado: <b>{unit?.lastKm ?? '—'}</b></p>
            <p className="text-xs text-navy-600">
              En {month || 'todo el historial'}: <b>{view.length}</b> servicio(s) · <b>{totalKm.toFixed(1)} km</b>
              {issuesCount > 0 && <> · <span className="text-amber-700 font-semibold">{issuesCount} con alerta de odómetro</span></>}
            </p>
            {byOperator.length > 0 && (
              <p className="text-xs text-navy-500">Por operador: {byOperator.map(([name, v]) => `${name} (${v.n} · ${v.km.toFixed(1)} km)`).join(' · ')}</p>
            )}
          </div>

          <div className="admin-card overflow-x-auto">
            <table className="table-admin min-w-[900px]">
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Ruta / motivo</th><th>Operador</th><th>Horario</th><th className="text-right">Km ini</th><th className="text-right">Km fin</th><th className="text-right">Km</th><th className="text-right">Alumnos</th><th>Alertas</th></tr>
              </thead>
              <tbody>
                {view.length === 0 && <tr><td colSpan={10} className="text-center text-navy-400 py-6">Sin servicios de esta unidad en el periodo.</td></tr>}
                {view.map((e) => (
                  <tr key={e.key}>
                    <td>{fmtDate(e.date)}</td>
                    <td>{e.type}{e.changed && <span className="block text-[10px] text-navy-400">unidad elegida por el operador</span>}</td>
                    <td>{e.label}</td>
                    <td>{e.operator}</td>
                    <td>{fmtTime(e.startMs)} – {fmtTime(e.endMs)}</td>
                    <td className="text-right">{e.kmIni ?? '—'}</td>
                    <td className="text-right">{e.kmFin ?? '—'}</td>
                    <td className="text-right">{e.kmFin != null ? kmOf(e).toFixed(1) : '—'}</td>
                    <td className="text-right">{e.students ?? '—'}</td>
                    <td className="text-xs text-amber-700">{e.issues.map((i) => <span key={i} className="block">⚠ {i}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
