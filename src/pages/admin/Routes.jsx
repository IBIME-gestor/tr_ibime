import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
    <div className="max-w-4xl">
      <h1 className="admin-h1 mb-5">Rutas</h1>

      <form onSubmit={handleSubmit} className="admin-card mb-5">
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
              <RouteRoster route={r} allStudents={students} />
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
    <div className="mt-4 pt-4 border-t border-navy-100 grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <p className="text-xs text-navy-400 mt-2">
          El orden de recogida/bajada se guarda solo, según cómo el chofer los
          fue marcando en el recorrido real del día anterior.
        </p>
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
  );
}
