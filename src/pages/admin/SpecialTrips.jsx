import { useEffect, useMemo, useState } from 'react';
import { Bus, RefreshCw } from 'lucide-react';
import { Schools, Drivers, Units } from '../../firebase/services';
import { SpecialTrips, SPECIAL_STATUS, REQUEST_AREAS } from '../../firebase/specialTrips';
import { tsMs } from '../../utils/tripOrder';

/**
 * Viajes especiales (solo admin)
 * Traslados solicitados por dirección, coordinación u otro personal fuera de
 * los horarios de las rutas. Aquí se capturan y se asigna operador (y unidad
 * sugerida); el operador registra el inicio y el cierre desde su portal.
 * Solo se cuenta CUÁNTOS alumnos fueron, no cuáles.
 */

const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const empty = () => ({
  date: todayStr(), scheduledStart: '', scheduledEnd: '', schoolId: '', requestedByName: '', requestedByArea: 'Dirección',
  motivo: '', descripcion: '', destino: '', studentsPlanned: '', operatorId: '', unitId: '',
  status: 'solicitado', kmInicial: '', kmFinal: '', studentsStart: '', studentsEnd: '', startedAtLocal: '', endedAtLocal: '',
});
const toLocalInput = (ts) => {
  const ms = tsMs(ts);
  if (!ms) return '';
  const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const fmtTime = (ts) => { const ms = tsMs(ts); return ms ? new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'; };
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const numOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const kmOf = (t) => (t.kmFinal != null && t.kmInicial != null ? Math.max(0, Number(t.kmFinal) - Number(t.kmInicial)) : 0);
const hoursOf = (t) => { const a = tsMs(t.startedAt); const b = tsMs(t.endedAt); return a && b && b > a ? (b - a) / 3600000 : 0; };

export default function SpecialTripsAdmin() {
  const [rows, setRows] = useState([]);
  const [schools, setSchools] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(empty());
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fMonth, setFMonth] = useState(todayStr().slice(0, 7));
  const [fSchool, setFSchool] = useState('');
  const [fOperator, setFOperator] = useState('');
  const [fUnit, setFUnit] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const [t, s, d, u] = await Promise.all([SpecialTrips.list(), Schools.list(), Drivers.list(), Units.list()]);
      setRows(t || []); setSchools(s || []); setDrivers((d || []).filter((x) => x.role !== 'nanny')); setUnits(u || []);
      setError('');
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudieron cargar los viajes (¿están publicadas las reglas de Firestore?).');
    }
  }
  useEffect(() => { load(); }, []);

  const nameOf = (list, id, key = 'name') => list.find((x) => x.id === id)?.[key] || '';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.date || !form.motivo.trim()) { setError('Indica la fecha y el motivo del viaje.'); return; }
    setSaving(true); setError('');
    try {
      let status = form.status;
      if (!editingId) status = form.operatorId ? 'asignado' : 'solicitado';
      else if (status === 'solicitado' && form.operatorId) status = 'asignado';
      const payload = {
        date: form.date,
        scheduledStart: form.scheduledStart,
        scheduledEnd: form.scheduledEnd,
        schoolId: form.schoolId,
        schoolName: nameOf(schools, form.schoolId),
        requestedByName: form.requestedByName.trim(),
        requestedByArea: form.requestedByArea,
        motivo: form.motivo.trim(),
        descripcion: form.descripcion.trim(),
        destino: form.destino.trim(),
        studentsPlanned: numOrNull(form.studentsPlanned),
        operatorId: form.operatorId,
        operatorName: nameOf(drivers, form.operatorId),
        unitId: form.unitId,
        unitName: nameOf(units, form.unitId, 'plate'),
        status,
      };
      if (editingId) {
        payload.kmInicial = numOrNull(form.kmInicial);
        payload.kmFinal = numOrNull(form.kmFinal);
        payload.studentsStart = numOrNull(form.studentsStart);
        payload.studentsEnd = numOrNull(form.studentsEnd);
        payload.startedAt = form.startedAtLocal ? new Date(form.startedAtLocal) : null;
        payload.endedAt = form.endedAtLocal ? new Date(form.endedAtLocal) : null;
        if (status === 'completado') {
          if (payload.kmInicial == null || payload.kmFinal == null || payload.kmFinal < payload.kmInicial) {
            setError('Para marcarlo como completado captura km inicial y final (el final no puede ser menor).'); setSaving(false); return;
          }
        }
        await SpecialTrips.update(editingId, payload);
        // Si lo cerró el admin, el km final queda como último km de la unidad.
        if (status === 'completado' && form.unitId && payload.kmFinal != null) {
          const unit = units.find((u) => u.id === form.unitId);
          if (unit?.lastKm == null || unit.lastKm === '' || payload.kmFinal > Number(unit.lastKm)) {
            await Units.update(form.unitId, { lastKm: payload.kmFinal });
          }
        }
      } else {
        await SpecialTrips.create(payload);
      }
      setForm(empty()); setEditingId(null);
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudo guardar el viaje.');
    }
    setSaving(false);
  }

  function handleEdit(t) {
    setEditingId(t.id);
    setForm({
      ...empty(), ...t,
      studentsPlanned: t.studentsPlanned ?? '', kmInicial: t.kmInicial ?? '', kmFinal: t.kmFinal ?? '',
      studentsStart: t.studentsStart ?? '', studentsEnd: t.studentsEnd ?? '',
      startedAtLocal: toLocalInput(t.startedAt), endedAtLocal: toLocalInput(t.endedAt),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function handleCancelTrip(t) {
    if (!window.confirm('¿Cancelar este viaje? Se conserva en el historial como cancelado.')) return;
    await SpecialTrips.update(t.id, { status: 'cancelado' });
    await load();
  }
  async function handleDelete(t) {
    if (!window.confirm('¿Eliminar este viaje definitivamente?')) return;
    await SpecialTrips.remove(t.id);
    await load();
  }

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((t) => {
      if (fMonth && String(t.date || '').slice(0, 7) !== fMonth) return false;
      if (fSchool && t.schoolId !== fSchool) return false;
      if (fOperator && t.operatorId !== fOperator) return false;
      if (fUnit && t.unitId !== fUnit) return false;
      if (fStatus && t.status !== fStatus) return false;
      if (q && !`${t.motivo} ${t.destino} ${t.requestedByName} ${t.descripcion}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, fMonth, fSchool, fOperator, fUnit, fStatus, search]);

  const done = view.filter((t) => t.status === 'completado');
  const totals = {
    trips: done.length,
    km: done.reduce((n, t) => n + kmOf(t), 0),
    students: done.reduce((n, t) => n + Number(t.studentsStart || 0), 0),
    hours: done.reduce((n, t) => n + hoursOf(t), 0),
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-h1 mb-1 flex items-center gap-2"><Bus size={22} /> Viajes especiales</h1>
          <p className="text-sm text-navy-400 max-w-3xl">Traslados solicitados por dirección, coordinación u otro personal fuera de los horarios de las rutas. Se registra cuántos alumnos fueron, la unidad, los horarios y el operador.</p>
        </div>
        <button type="button" className="btn-admin-ghost" onClick={load}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}

      <form onSubmit={handleSubmit} className="admin-card space-y-3">
        <p className="font-display font-semibold text-sm text-navy-800">{editingId ? 'Editar viaje' : 'Nuevo viaje solicitado'}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="admin-label">Fecha</label><input type="date" className="admin-input" value={form.date} onChange={set('date')} required /></div>
          <div><label className="admin-label">Hora de salida (programada)</label><input type="time" className="admin-input" value={form.scheduledStart} onChange={set('scheduledStart')} /></div>
          <div><label className="admin-label">Hora de regreso (programada)</label><input type="time" className="admin-input" value={form.scheduledEnd} onChange={set('scheduledEnd')} /></div>
          <div>
            <label className="admin-label">Plantel</label>
            <select className="admin-select" value={form.schoolId} onChange={set('schoolId')}>
              <option value="">Selecciona…</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="admin-label">Solicita (nombre)</label><input className="admin-input" value={form.requestedByName} onChange={set('requestedByName')} /></div>
          <div>
            <label className="admin-label">Área que solicita</label>
            <select className="admin-select" value={form.requestedByArea} onChange={set('requestedByArea')}>
              {REQUEST_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2"><label className="admin-label">Motivo</label><input className="admin-input" value={form.motivo} onChange={set('motivo')} placeholder="ej. Traslado al centro cultural" required /></div>
          <div className="lg:col-span-2"><label className="admin-label">Destino</label><input className="admin-input" value={form.destino} onChange={set('destino')} /></div>
          <div><label className="admin-label">Alumnos aproximados</label><input type="number" min="0" className="admin-input" value={form.studentsPlanned} onChange={set('studentsPlanned')} /></div>
          <div>
            <label className="admin-label">Operador asignado</label>
            <select className="admin-select" value={form.operatorId} onChange={set('operatorId')}>
              <option value="">Sin asignar</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="admin-label">Unidad sugerida (el operador puede cambiarla)</label>
            <select className="admin-select" value={form.unitId} onChange={set('unitId')}>
              <option value="">Sin sugerir</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.plate}{u.model ? ` — ${u.model}` : ''}</option>)}
            </select>
          </div>
          <div className="lg:col-span-4"><label className="admin-label">Descripción</label><textarea rows={2} className="admin-input" value={form.descripcion} onChange={set('descripcion')} /></div>
        </div>

        {editingId && (
          <div className="pt-3 border-t border-navy-100 space-y-3">
            <p className="text-xs text-navy-500">Datos reales del viaje (los captura el operador; edítalos solo para corregir).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="admin-label">Estado</label>
                <select className="admin-select" value={form.status} onChange={set('status')}>
                  {Object.entries(SPECIAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className="admin-label">Salida real</label><input type="datetime-local" className="admin-input" value={form.startedAtLocal} onChange={set('startedAtLocal')} /></div>
              <div><label className="admin-label">Regreso real</label><input type="datetime-local" className="admin-input" value={form.endedAtLocal} onChange={set('endedAtLocal')} /></div>
              <div />
              <div><label className="admin-label">Km inicial</label><input type="number" className="admin-input" value={form.kmInicial} onChange={set('kmInicial')} /></div>
              <div><label className="admin-label">Km final</label><input type="number" className="admin-input" value={form.kmFinal} onChange={set('kmFinal')} /></div>
              <div><label className="admin-label">Alumnos que subieron</label><input type="number" min="0" className="admin-input" value={form.studentsStart} onChange={set('studentsStart')} /></div>
              <div><label className="admin-label">Alumnos que regresaron</label><input type="number" min="0" className="admin-input" value={form.studentsEnd} onChange={set('studentsEnd')} /></div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" className="btn-admin-primary" disabled={saving}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Registrar viaje'}</button>
          {editingId && <button type="button" className="btn-admin-ghost" onClick={() => { setEditingId(null); setForm(empty()); setError(''); }}>Cancelar edición</button>}
        </div>
      </form>

      <div className="admin-card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" className="admin-input max-w-[170px]" value={fMonth} onChange={(e) => setFMonth(e.target.value)} />
          <select className="admin-select max-w-[180px]" value={fSchool} onChange={(e) => setFSchool(e.target.value)}><option value="">Todos los planteles</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select className="admin-select max-w-[180px]" value={fOperator} onChange={(e) => setFOperator(e.target.value)}><option value="">Todos los operadores</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select className="admin-select max-w-[160px]" value={fUnit} onChange={(e) => setFUnit(e.target.value)}><option value="">Todas las unidades</option>{units.map((u) => <option key={u.id} value={u.id}>{u.plate}</option>)}</select>
          <select className="admin-select max-w-[150px]" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">Todos los estados</option>{Object.entries(SPECIAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="admin-input max-w-[200px]" placeholder="Buscar motivo, destino…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <p className="text-xs text-navy-600">
          Completados: <b>{totals.trips}</b> · Km recorridos: <b>{totals.km.toFixed(1)}</b> · Alumnos trasladados: <b>{totals.students}</b> · Horas: <b>{totals.hours.toFixed(1)}</b>
          {' '}· Mostrando {view.length} viaje(s)
        </p>
        <div className="overflow-x-auto">
          <table className="table-admin min-w-[1000px]">
            <thead>
              <tr>
                <th>Fecha</th><th>Programado</th><th>Plantel</th><th>Solicita</th><th>Motivo / destino</th><th>Operador</th><th>Unidad</th>
                <th>Estado</th><th>Real</th><th className="text-right">Km</th><th className="text-right">Alumnos</th><th />
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && <tr><td colSpan={12} className="text-center text-navy-400 py-6">No hay viajes con esos filtros.</td></tr>}
              {view.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.date)}</td>
                  <td>{t.scheduledStart || '—'}{t.scheduledEnd ? ` – ${t.scheduledEnd}` : ''}</td>
                  <td>{t.schoolName || '—'}</td>
                  <td>{t.requestedByName || '—'}<br /><span className="text-[11px] text-navy-400">{t.requestedByArea}</span></td>
                  <td><b>{t.motivo}</b>{t.destino ? <><br /><span className="text-[11px] text-navy-400">{t.destino}</span></> : null}</td>
                  <td>{t.operatorName || 'Sin asignar'}</td>
                  <td>{t.unitName || '—'}{t.kmAlert && <span title="Alerta de odómetro" className="text-amber-600"> ⚠</span>}</td>
                  <td>{SPECIAL_STATUS[t.status] || t.status}</td>
                  <td>{t.startedAt ? `${fmtTime(t.startedAt)} – ${fmtTime(t.endedAt)}` : '—'}</td>
                  <td className="text-right">{t.status === 'completado' ? kmOf(t).toFixed(1) : '—'}</td>
                  <td className="text-right">{t.studentsStart != null ? `${t.studentsStart}${t.studentsEnd != null ? ` / ${t.studentsEnd}` : ''}` : (t.studentsPlanned ? `~${t.studentsPlanned}` : '—')}</td>
                  <td className="whitespace-nowrap">
                    <button type="button" className="link-action mr-2" onClick={() => handleEdit(t)}>Editar</button>
                    {t.status !== 'cancelado' && t.status !== 'completado' && <button type="button" className="link-action mr-2" onClick={() => handleCancelTrip(t)}>Cancelar</button>}
                    <button type="button" className="link-danger" onClick={() => handleDelete(t)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
