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
    <div>
      <h1 className="admin-h1 mb-5">Planteles</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        <form onSubmit={handleSubmit} className="admin-card lg:sticky lg:top-6">
          <p className="font-display font-semibold text-sm text-navy-800 mb-3">
            {editingId ? 'Editar plantel' : 'Nuevo plantel'}
          </p>
          <div className="space-y-3">
            <div>
              <label className="admin-label">Nombre del colegio</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="admin-input"
                required
              />
            </div>
            <div>
              <label className="admin-label">Dirección (opcional)</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="admin-input"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn-admin-primary flex-1">
              {editingId ? 'Guardar cambios' : 'Agregar plantel'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => { setEditingId(null); setForm({ name: '', address: '' }); }}
                className="btn-admin-ghost"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div className="admin-card p-0 overflow-hidden">
          <table className="table-admin">
            <thead>
              <tr>
                <th className="pl-5">Nombre</th>
                <th>Dirección</th>
                <th className="pr-5"></th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id}>
                  <td className="pl-5 font-medium text-navy-700">{s.name}</td>
                  <td className="text-navy-500">{s.address || '—'}</td>
                  <td className="pr-5 text-right whitespace-nowrap">
                    <button onClick={() => handleEdit(s)} className="link-action mr-3">Editar</button>
                    <button onClick={() => handleDelete(s.id)} className="link-danger">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {schools.length === 0 && (
            <p className="text-navy-400 text-sm py-6 text-center">Sin planteles registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}
