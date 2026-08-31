import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const routeName = (id) => routes.find((r) => r.id === id)?.name || 'Sin ruta';

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-navy-900">Alumnos</h1>
        <Link
          to="/admin/alumnos/importar"
          className="px-4 py-2 rounded-xl bg-navy-800 text-white font-semibold text-sm"
        >
          Cargar desde CSV/Excel
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <p className="md:col-span-2 font-medium text-sm text-navy-600">
          {editingId ? 'Editar alumno' : 'Nuevo alumno'}
        </p>
        <input
          value={form.matricula}
          onChange={(e) => setForm({ ...form, matricula: e.target.value })}
          placeholder="Matrícula"
          className="rounded-xl border border-navy-100 px-3 py-2"
          required
        />
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nombre completo"
          className="rounded-xl border border-navy-100 px-3 py-2"
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
          value={form.routeId}
          onChange={(e) => setForm({ ...form, routeId: e.target.value })}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          <option value="">Ruta (opcional por ahora)…</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Domicilio / punto de recolección"
          className="rounded-xl border border-navy-100 px-3 py-2 md:col-span-2"
        />
        <input
          value={form.parentContact}
          onChange={(e) => setForm({ ...form, parentContact: e.target.value })}
          placeholder="Contacto del padre/madre (opcional)"
          className="rounded-xl border border-navy-100 px-3 py-2 md:col-span-2"
        />
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="px-4 py-2 rounded-xl bg-navy-800 text-white font-semibold">
            {editingId ? 'Guardar cambios' : 'Agregar alumno'}
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

      <div className="flex gap-3 mb-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o matrícula"
          className="rounded-xl border border-navy-100 px-3 py-2 flex-1 min-w-[200px]"
        />
        <select
          value={filterSchool}
          onChange={(e) => setFilterSchool(e.target.value)}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          <option value="">Todos los planteles</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-navy-400 border-b border-navy-100">
              <th className="py-2 pr-3">Matrícula</th>
              <th className="py-2 pr-3">Nombre</th>
              <th className="py-2 pr-3">Plantel</th>
              <th className="py-2 pr-3">Ruta</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-navy-50">
                <td className="py-2 pr-3">{s.matricula}</td>
                <td className="py-2 pr-3">{s.name}</td>
                <td className="py-2 pr-3">{schoolName(s.schoolId)}</td>
                <td className="py-2 pr-3">{routeName(s.routeId)}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap">
                  <button onClick={() => handleEdit(s)} className="text-navy-600 underline mr-3">Editar</button>
                  <button onClick={() => handleDelete(s.id)} className="text-stop underline">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-navy-400 text-sm py-3">No hay alumnos que coincidan.</p>}
      </div>
    </div>
  );
}
