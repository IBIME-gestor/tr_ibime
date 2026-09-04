import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Navigation2 } from 'lucide-react';
import { Routes, Schools, Drivers, Units, Students } from '../../firebase/services';
import { getReferenceTrip } from '../../firebase/trips';
import { resolveStudentLocation, resolveSchoolLocation } from '../../firebase/geocoding';
import { optimizeStopOrder } from '../../utils/routeOptimizer';

const emptyForm = { name: '', schoolId: '', driverId: '', nannyId: '', unitId: '' };

export default function RoutesPage() {
  const [routes, setRoutesState] = useState([]);
  const [schools, setSchools] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [units, setUnits] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => Routes.subscribe(setRoutesState), []);
  useEffect(() => Schools.subscribe(setSchools), []);
  useEffect(() => Drivers.subscribe(setDrivers), []);
  useEffect(() => Units.subscribe(setUnits), []);
  useEffect(() => Students.subscribe(setStudents), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.schoolId) return;
    if (editingId) {
      await Routes.update(editingId, form);
    } else {
      await Routes.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleEdit(r) {
    setForm({ ...emptyForm, ...r });
    setEditingId(r.id);
  }

  async function handleDelete(id) {
    if (window.confirm('¿Eliminar esta ruta? Los alumnos asignados quedarán sin ruta.')) {
      await Routes.remove(id);
    }
  }

  const name = (list, id) => list.find((x) => x.id === id)?.name || '—';
  const driverName = (id) => drivers.find((d) => d.id === id)?.name || '—';

  return (
    <div>
      <h1 className="admin-h1 mb-5">Rutas</h1>

      <form onSubmit={handleSubmit} className="admin-card mb-5 max-w-3xl">
        <p className="font-display font-semibold text-sm text-navy-800 mb-3">
          {editingId ? 'Editar ruta' : 'Nueva ruta'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="admin-label">Nombre de la ruta</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ej. Ruta Norte 1"
              className="admin-input"
              required
            />
          </div>
          <div>
            <label className="admin-label">Plantel</label>
            <select
              value={form.schoolId}
              onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
              className="admin-select"
              required
            >
              <option value="">Selecciona…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="admin-label">Unidad</label>
            <select
              value={form.unitId}
              onChange={(e) => setForm({ ...form, unitId: e.target.value })}
              className="admin-select"
            >
              <option value="">Selecciona…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.plate} {u.model ? `— ${u.model}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="admin-label">Chofer</label>
            <select
              value={form.driverId}
              onChange={(e) => setForm({ ...form, driverId: e.target.value })}
              className="admin-select"
            >
              <option value="">Selecciona…</option>
              {drivers.filter((d) => d.role !== 'nanny').map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="admin-label">Nanny (opcional)</label>
            <select
              value={form.nannyId}
              onChange={(e) => setForm({ ...form, nannyId: e.target.value })}
              className="admin-select"
            >
              <option value="">Sin nanny</option>
              {drivers.filter((d) => d.role === 'nanny').map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button type="submit" className="btn-admin-primary">
            {editingId ? 'Guardar cambios' : 'Crear ruta'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(emptyForm); }}
              className="btn-admin-ghost"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-2.5">
        {routes.map((r) => (
          <div key={r.id} className="admin-card">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-display font-semibold text-navy-800">{r.name}</p>
                <p className="text-sm text-navy-400">
                  {name(schools, r.schoolId)} · {driverName(r.driverId)} · {name(units, r.unitId)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="link-action flex items-center gap-1"
                >
                  Gestionar alumnos
                  {expandedId === r.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                <button onClick={() => handleEdit(r)} className="link-action">Editar</button>
                <button onClick={() => handleDelete(r.id)} className="link-danger">Eliminar</button>
              </div>
            </div>
            {expandedId === r.id && (
              <RouteRoster route={r} allStudents={students} school={schools.find((s) => s.id === r.schoolId)} />
            )}
          </div>
        ))}
        {routes.length === 0 && (
          <p className="text-navy-400 text-sm py-6 text-center">Sin rutas creadas.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Gestiona qué alumnos pertenecen a la ruta y en qué orden se
 * recogen/dejan por defecto. El orden real se recalcula solo
 * después de cada recorrido, pero aquí se puede ajustar a mano
 * (por ejemplo, para altas nuevas antes del primer recorrido).
 */
function RouteRoster({ route, allStudents, school }) {
  const assigned = useMemo(
    () => allStudents.filter((s) => s.routeId === route.id),
    [allStudents, route.id]
  );
  const unassignedSameSchool = useMemo(
    () => allStudents.filter((s) => s.schoolId === route.schoolId && s.routeId !== route.id),
    [allStudents, route.id, route.schoolId]
  );

  async function assign(studentId) {
    await Students.update(studentId, { routeId: route.id });
  }
  async function unassign(studentId) {
    await Students.update(studentId, { routeId: '' });
  }

  return (
    <div className="mt-4 pt-4 border-t border-navy-100 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-navy-400 mb-2">
            En esta ruta ({assigned.length})
          </p>
          <div className="border border-navy-100 rounded-lg divide-y divide-navy-50 max-h-64 overflow-y-auto">
            {assigned.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{s.name} <span className="text-navy-400">({s.matricula})</span></span>
                <button onClick={() => unassign(s.id)} className="link-danger">
                  Quitar
                </button>
              </div>
            ))}
            {assigned.length === 0 && (
              <p className="px-3 py-3 text-navy-400 text-sm">Sin alumnos aún.</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-navy-400 mb-2">
            Alumnos del plantel sin esta ruta ({unassignedSameSchool.length})
          </p>
          <div className="border border-navy-100 rounded-lg divide-y divide-navy-50 max-h-64 overflow-y-auto">
            {unassignedSameSchool.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{s.name} <span className="text-navy-400">({s.matricula})</span></span>
                <button onClick={() => assign(s.id)} className="text-go text-xs font-medium underline underline-offset-2">
                  Agregar
                </button>
              </div>
            ))}
            {unassignedSameSchool.length === 0 && (
              <p className="px-3 py-3 text-navy-400 text-sm">No hay alumnos disponibles.</p>
            )}
          </div>
        </div>
      </div>

      <RouteOptimizer route={route} assigned={assigned} school={school} />
    </div>
  );
}

const SHIFT_LABEL = { morning: 'Ida (mañana)', afternoon: 'Vuelta (tarde)' };

/**
 * Calcula un orden de paradas más corto (heurística gratuita, sin costo
 * de API), usando de preferencia la ubicación REAL ya capturada en
 * recorridos anteriores, y solo geocodificando (gratis, vía OpenStreetMap)
 * la dirección de texto cuando aún no existe esa ubicación real.
 */
function RouteOptimizer({ route, assigned, school }) {
  const [shift, setShift] = useState('morning');
  const [status, setStatus] = useState('idle'); // idle | working | preview | saved | error
  const [progress, setProgress] = useState('');
  const [preview, setPreview] = useState(null); // { order: [studentId...], distanceKm, byId }
  const [error, setError] = useState('');

  async function handleOptimize() {
    setStatus('working');
    setError('');
    setPreview(null);

    if (!school?.address) {
      setStatus('error');
      setError('Este plantel no tiene dirección registrada; agrégala en "Planteles" primero.');
      return;
    }
    if (assigned.length < 2) {
      setStatus('error');
      setError('Se necesitan al menos 2 alumnos en la ruta para optimizar el orden.');
      return;
    }

    setProgress('Ubicando el plantel…');
    const schoolLoc = await resolveSchoolLocation(school);
    if (!schoolLoc) {
      setStatus('error');
      setError('No se pudo ubicar la dirección del plantel. Revisa que esté bien escrita.');
      return;
    }

    // Preferimos la ubicación REAL capturada la última vez que se corrió
    // esta ruta/turno (más precisa que la dirección de texto).
    const reference = await getReferenceTrip(route.id, shift);
    const realLocById = {};
    reference?.stops.forEach((s) => {
      if (s.referenceLocation?.lat) realLocById[s.studentId] = s.referenceLocation;
    });

    const points = [];
    for (let i = 0; i < assigned.length; i++) {
      const s = assigned[i];
      setProgress(`Ubicando alumno ${i + 1} de ${assigned.length}…`);
      const loc = await resolveStudentLocation(s, realLocById[s.id]);
      if (loc) points.push({ id: s.id, ...loc });
    }

    if (points.length < 2) {
      setStatus('error');
      setError('No se pudieron ubicar suficientes direcciones. Revisa los domicilios de los alumnos.');
      return;
    }

    setProgress('Calculando el orden más corto…');
    const anchorPosition = shift === 'morning' ? 'end' : 'start';
    const { order, distanceKm } = optimizeStopOrder(points, schoolLoc, anchorPosition);

    const byId = {};
    assigned.forEach((s) => { byId[s.id] = s; });
    const missing = assigned.filter((s) => !order.includes(s.id));

    setPreview({ order, distanceKm, byId, missing });
    setStatus('preview');
  }

  async function handleSave() {
    await Routes.saveOrderFromTrip(route.id, shift, [...preview.order, ...preview.missing.map((s) => s.id)]);
    setStatus('saved');
  }

  return (
    <div className="border-t border-navy-100 pt-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-xs font-medium text-navy-400">Optimizar orden de paradas (gratis, sin API de pago)</p>
        <div className="flex gap-2 items-center">
          <select
            value={shift}
            onChange={(e) => { setShift(e.target.value); setStatus('idle'); setPreview(null); }}
            className="admin-select w-auto h-9 text-xs"
          >
            <option value="morning">Ida (mañana)</option>
            <option value="afternoon">Vuelta (tarde)</option>
          </select>
          <button onClick={handleOptimize} disabled={status === 'working'} className="btn-admin-ghost h-9 text-xs">
            <Navigation2 size={13} /> {status === 'working' ? progress : 'Optimizar'}
          </button>
        </div>
      </div>

      {error && <p className="text-stop text-sm mb-2">{error}</p>}

      {preview && status === 'preview' && (
        <div className="bg-signal-yellow/15 border border-signal-yellow rounded-lg p-3">
          <p className="text-sm text-navy-800 mb-2">
            Nuevo orden sugerido para <strong>{SHIFT_LABEL[shift]}</strong> — distancia aproximada en línea
            recta: <strong>{preview.distanceKm.toFixed(1)} km</strong>.
          </p>
          <ol className="text-sm text-navy-600 space-y-1 mb-3 max-h-56 overflow-y-auto">
            {preview.order.map((id, i) => (
              <li key={id}>{i + 1}. {preview.byId[id]?.name}</li>
            ))}
            {preview.missing.map((s) => (
              <li key={s.id} className="text-navy-400">
                {preview.order.length + preview.missing.indexOf(s) + 1}. {s.name} (sin dirección ubicable — queda al final)
              </li>
            ))}
          </ol>
          <p className="text-xs text-navy-500 mb-3">
            Se aplicará mañana en la app del chofer. Ojo: si el chofer marca a los alumnos en un orden distinto
            al sugerido, el sistema vuelve a ajustarse solo con el orden real del día siguiente.
          </p>
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-admin-primary text-xs h-9">Guardar este orden</button>
            <button onClick={() => { setStatus('idle'); setPreview(null); }} className="btn-admin-ghost text-xs h-9">
              Descartar
            </button>
          </div>
        </div>
      )}

      {status === 'saved' && (
        <p className="text-go text-sm">✅ Orden guardado. Se usará en el próximo recorrido de {SHIFT_LABEL[shift].toLowerCase()}.</p>
      )}
    </div>
  );
}
