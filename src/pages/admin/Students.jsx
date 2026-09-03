import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Upload } from 'lucide-react';
import { Students, Schools, Routes } from '../../firebase/services';

const emptyForm = {
  matricula: '',
  name: '',
  schoolId: '',
  routeId: '',
  address: '',
  parentContact: '',
};

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routes, setRoutesState] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filterSchool, setFilterSchool] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => Students.subscribe(setStudents), []);
  useEffect(() => Schools.subscribe(setSchools), []);
  useEffect(() => Routes.subscribe(setRoutesState), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.matricula.trim() || !form.name.trim() || !form.schoolId) return;
    if (editingId) {
      await Students.update(editingId, form);
    } else {
      await Students.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleEdit(student) {
    setForm({ ...emptyForm, ...student });
    setEditingId(student.id);
  }

  function handleCancel() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function handleDelete(id) {
    if (window.confirm('¿Dar de baja a este alumno?')) {
      await Students.remove(id);
    }
  }

  const filtered = students.filter((s) => {
    const matchSchool = !filterSchool || s.schoolId === filterSchool;
    const matchSearch =
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.matricula?.includes(search);
    return matchSchool && matchSearch;
  });

  const schoolName = (id) => schools.find((s) => s.id === id)?.name || '—';
  const routeName = (id) => routes.find((r) => r.id === id)?.name || null;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="admin-h1">Alumnos</h1>
          <p className="text-sm text-navy-400 mt-0.5">{students.length} alumnos dados de alta</p>
        </div>
        <Link to="/admin/alumnos/importar" className="btn-admin-ghost">
          <Upload size={15} /> Cargar CSV/Excel
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="admin-card mb-5">
        <p className="font-display font-semibold text-sm text-navy-800 mb-3">
          {editingId ? 'Editar alumno' : 'Nuevo alumno'}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="admin-label">Matrícula</label>
            <input
              value={form.matricula}
              onChange={(e) => setForm({ ...form, matricula: e.target.value })}
              className="admin-input"
              required
            />
          </div>
          <div>
            <label className="admin-label">Nombre completo</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
            <label className="admin-label">Ruta (opcional por ahora)</label>
            <select
              value={form.routeId}
              onChange={(e) => setForm({ ...form, routeId: e.target.value })}
              className="admin-select"
            >
              <option value="">Sin asignar</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="admin-label">Domicilio / punto de recolección</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="admin-input"
            />
          </div>
          <div className="md:col-span-2">
            <label className="admin-label">Contacto del padre/madre (opcional)</label>
            <input
              value={form.parentContact}
              onChange={(e) => setForm({ ...form, parentContact: e.target.value })}
              placeholder="10 dígitos, para el botón de llamada del chofer"
              className="admin-input"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button type="submit" className="btn-admin-primary">
            {editingId ? 'Guardar cambios' : 'Agregar alumno'}
          </button>
          {editingId && (
            <button type="button" onClick={handleCancel} className="btn-admin-ghost">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="flex gap-3 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o matrícula"
            className="admin-input pl-9"
          />
        </div>
        <select
          value={filterSchool}
          onChange={(e) => setFilterSchool(e.target.value)}
          className="admin-select w-auto"
        >
          <option value="">Todos los planteles</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="admin-card p-0 overflow-x-auto">
        <table className="table-admin">
          <thead>
            <tr>
              <th className="pl-5">Matrícula</th>
              <th>Nombre</th>
              <th>Plantel</th>
              <th>Ruta</th>
              <th className="pr-5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className="pl-5 font-medium text-navy-700">{s.matricula}</td>
                <td>{s.name}</td>
                <td className="text-navy-500">{schoolName(s.schoolId)}</td>
                <td>
                  {routeName(s.routeId) ? (
                    <span className="badge">{routeName(s.routeId)}</span>
                  ) : (
                    <span className="text-navy-400">Sin ruta</span>
                  )}
                </td>
                <td className="pr-5 text-right whitespace-nowrap">
                  <button onClick={() => handleEdit(s)} className="link-action mr-3">Editar</button>
                  <button onClick={() => handleDelete(s.id)} className="link-danger">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-navy-400 text-sm py-6 text-center">No hay alumnos que coincidan.</p>
        )}
      </div>
    </div>
  );
}
