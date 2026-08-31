import { useEffect, useMemo, useState } from 'react';
import { Routes, Schools, Drivers, Units, Students } from '../../firebase/services';

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
      <h1 className="text-2xl font-display font-bold text-navy-900 mb-6">Rutas</h1>

      <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <p className="md:col-span-2 font-medium text-sm text-navy-600">
          {editingId ? 'Editar ruta' : 'Nueva ruta'}
        </p>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nombre de la ruta (ej. Ruta Norte 1)"
          className="rounded-xl border border-navy-100 px-3 py-2 md:col-span-2"
          required
        />
        <select
          value={form.schoolId}
          onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
          className="rounded-xl border border-navy-100 px-3 py-2"
          required
        >
          <option value="">Plantel…</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={form.unitId}
          onChange={(e) => setForm({ ...form, unitId: e.target.value })}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          <option value="">Unidad…</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.plate} {u.model ? `— ${u.model}` : ''}</option>
          ))}
        </select>
        <select
          value={form.driverId}
          onChange={(e) => setForm({ ...form, driverId: e.target.value })}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          <option value="">Chofer…</option>
          {drivers.filter((d) => d.role !== 'nanny').map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          value={form.nannyId}
          onChange={(e) => setForm({ ...form, nannyId: e.target.value })}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          <option value="">Nanny (opcional)…</option>
          {drivers.filter((d) => d.role === 'nanny').map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="px-4 py-2 rounded-xl bg-navy-800 text-white font-semibold">
            {editingId ? 'Guardar cambios' : 'Crear ruta'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(emptyForm); }}
              className="px-4 py-2 rounded-xl border border-navy-100"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        {routes.map((r) => (
          <div key={r.id} className="card">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-display font-semibold">{r.name}</p>
                <p className="text-sm text-navy-400">
                  {name(schools, r.schoolId)} · {driverName(r.driverId)} · {name(units, r.unitId)}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <button
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="text-navy-600 underline"
                >
                  {expandedId === r.id ? 'Ocultar alumnos' : 'Gestionar alumnos'}
                </button>
                <button onClick={() => handleEdit(r)} className="text-navy-600 underline">Editar</button>
                <button onClick={() => handleDelete(r.id)} className="text-stop underline">Eliminar</button>
              </div>
            </div>
            {expandedId === r.id && (
              <RouteRoster route={r} allStudents={students} />
            )}
          </div>
        ))}
        {routes.length === 0 && <p className="text-navy-400 text-sm">Sin rutas creadas.</p>}
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
function RouteRoster({ route, allStudents }) {
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
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <p className="text-sm font-medium text-navy-600 mb-2">
          En esta ruta ({assigned.length})
        </p>
        <div className="border border-navy-100 rounded-xl divide-y divide-navy-50 max-h-64 overflow-y-auto">
          {assigned.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-2 text-sm">
              <span>{s.name} <span className="text-navy-400">({s.matricula})</span></span>
              <button onClick={() => unassign(s.id)} className="text-stop text-xs underline">
                Quitar
              </button>
            </div>
          ))}
          {assigned.length === 0 && <p className="p-2 text-navy-400 text-sm">Sin alumnos aún.</p>}
        </div>
        <p className="text-xs text-navy-400 mt-2">
          El orden de recogida/bajada se guarda solo, según cómo el chofer los
          fue marcando en el recorrido real del día anterior.
        </p>
      </div>
      <div>
        <p className="text-sm font-medium text-navy-600 mb-2">
          Alumnos del plantel sin esta ruta ({unassignedSameSchool.length})
        </p>
        <div className="border border-navy-100 rounded-xl divide-y divide-navy-50 max-h-64 overflow-y-auto">
          {unassignedSameSchool.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-2 text-sm">
              <span>{s.name} <span className="text-navy-400">({s.matricula})</span></span>
              <button onClick={() => assign(s.id)} className="text-go text-xs underline">
                Agregar
              </button>
            </div>
          ))}
          {unassignedSameSchool.length === 0 && (
            <p className="p-2 text-navy-400 text-sm">No hay alumnos disponibles.</p>
          )}
        </div>
      </div>
    </div>
  );
}
