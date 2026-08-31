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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-display font-bold text-navy-900 mb-6">Unidades</h1>

      <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <p className="md:col-span-3 font-medium text-sm text-navy-600">
          {editingId ? 'Editar unidad' : 'Nueva unidad'}
        </p>
        <input
          value={form.plate}
          onChange={(e) => setForm({ ...form, plate: e.target.value })}
          placeholder="Placas"
          className="rounded-xl border border-navy-100 px-3 py-2"
          required
        />
        <input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          placeholder="Modelo / descripción"
          className="rounded-xl border border-navy-100 px-3 py-2"
        />
        <input
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          placeholder="Capacidad (alumnos)"
          type="number"
          className="rounded-xl border border-navy-100 px-3 py-2"
        />
        <div className="flex gap-2 md:col-span-3">
          <button type="submit" className="px-4 py-2 rounded-xl bg-navy-800 text-white font-semibold">
            {editingId ? 'Guardar cambios' : 'Agregar unidad'}
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

      <div className="card divide-y divide-navy-100">
        {units.map((u) => (
          <div key={u.id} className="py-3 flex items-center justify-between">
            <div>
              <p className="font-medium">{u.plate}</p>
              <p className="text-sm text-navy-400">{u.model} {u.capacity ? `· ${u.capacity} lugares` : ''}</p>
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={() => handleEdit(u)} className="text-navy-600 underline">Editar</button>
              <button onClick={() => handleDelete(u.id)} className="text-stop underline">Eliminar</button>
            </div>
          </div>
        ))}
        {units.length === 0 && <p className="text-navy-400 text-sm py-2">Sin unidades registradas.</p>}
      </div>
    </div>
  );
}
