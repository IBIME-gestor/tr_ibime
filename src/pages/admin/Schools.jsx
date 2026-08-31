import { useEffect, useState } from 'react';
import { Schools } from '../../firebase/services';

export default function SchoolsPage() {
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState({ name: '', address: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => Schools.subscribe(setSchools), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) {
      await Schools.update(editingId, form);
    } else {
      await Schools.create(form);
    }
    setForm({ name: '', address: '' });
    setEditingId(null);
  }

  function handleEdit(school) {
    setForm({ name: school.name, address: school.address || '' });
    setEditingId(school.id);
  }

  async function handleDelete(id) {
    if (window.confirm('¿Eliminar este plantel? Esto no borra a sus alumnos.')) {
      await Schools.remove(id);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-display font-bold text-navy-900 mb-6">Planteles</h1>

      <form onSubmit={handleSubmit} className="card mb-6 space-y-3">
        <p className="font-medium text-sm text-navy-600">
          {editingId ? 'Editar plantel' : 'Nuevo plantel'}
        </p>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nombre del colegio"
          className="w-full rounded-xl border border-navy-100 px-3 py-2"
          required
        />
        <input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Dirección (opcional)"
          className="w-full rounded-xl border border-navy-100 px-3 py-2"
        />
        <div className="flex gap-2">
          <button type="submit" className="px-4 py-2 rounded-xl bg-navy-800 text-white font-semibold">
            {editingId ? 'Guardar cambios' : 'Agregar plantel'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm({ name: '', address: '' }); }}
              className="px-4 py-2 rounded-xl border border-navy-100"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="card divide-y divide-navy-100">
        {schools.map((s) => (
          <div key={s.id} className="py-3 flex items-center justify-between">
            <div>
              <p className="font-medium">{s.name}</p>
              {s.address && <p className="text-sm text-navy-400">{s.address}</p>}
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={() => handleEdit(s)} className="text-navy-600 underline">Editar</button>
              <button onClick={() => handleDelete(s.id)} className="text-stop underline">Eliminar</button>
            </div>
          </div>
        ))}
        {schools.length === 0 && <p className="text-navy-400 text-sm py-2">Sin planteles aún.</p>}
      </div>
    </div>
  );
}
