import { useEffect, useState } from 'react';
import { Units } from '../../firebase/services';

const emptyForm = { plate: '', model: '', capacity: '' };

export default function UnitsPage() {
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => Units.subscribe(setUnits), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.plate.trim()) return;
    if (editingId) {
      await Units.update(editingId, form);
    } else {
      await Units.create(form);
    }
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleEdit(u) {
    setForm({ ...emptyForm, ...u });
    setEditingId(u.id);
  }

  async function handleDelete(id) {
    if (window.confirm('¿Eliminar esta unidad?')) await Units.remove(id);
  }

  return (
    <div>
      <h1 className="admin-h1 mb-5">Unidades</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        <form onSubmit={handleSubmit} className="admin-card lg:sticky lg:top-6">
          <p className="font-display font-semibold text-sm text-navy-800 mb-3">
            {editingId ? 'Editar unidad' : 'Nueva unidad'}
          </p>
          <div className="space-y-3">
            <div>
              <label className="admin-label">Placas</label>
              <input
                value={form.plate}
                onChange={(e) => setForm({ ...form, plate: e.target.value })}
                className="admin-input"
                required
              />
            </div>
            <div>
              <label className="admin-label">Modelo / descripción</label>
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="admin-input"
              />
            </div>
            <div>
              <label className="admin-label">Capacidad (alumnos)</label>
              <input
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                type="number"
                className="admin-input"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn-admin-primary flex-1">
              {editingId ? 'Guardar cambios' : 'Agregar unidad'}
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

        <div className="admin-card p-0 overflow-hidden">
          <table className="table-admin">
            <thead>
              <tr>
                <th className="pl-5">Placas</th>
                <th>Modelo</th>
                <th>Capacidad</th>
                <th className="pr-5"></th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="pl-5 font-medium text-navy-700">{u.plate}</td>
                  <td className="text-navy-500">{u.model || '—'}</td>
                  <td className="text-navy-500">{u.capacity ? `${u.capacity} lugares` : '—'}</td>
                  <td className="pr-5 text-right whitespace-nowrap">
                    <button onClick={() => handleEdit(u)} className="link-action mr-3">Editar</button>
                    <button onClick={() => handleDelete(u.id)} className="link-danger">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {units.length === 0 && (
            <p className="text-navy-400 text-sm py-6 text-center">Sin unidades registradas.</p>
          )}
        </div>
      </div>
    </div>
  );
}
