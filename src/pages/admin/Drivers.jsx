import { useEffect, useState } from 'react';
import { Drivers, Schools } from '../../firebase/services';

const emptyForm = { name: '', phone: '', role: 'driver', schoolId: '', email: '' };

export default function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => Drivers.subscribe(setDrivers), []);
  useEffect(() => Schools.subscribe(setSchools), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    const data = { ...form, email: form.email.trim().toLowerCase() };
    if (editingId) {
      await Drivers.update(editingId, data);
    } else {
      await Drivers.create(data);
    }
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleEdit(d) {
    setForm({ ...emptyForm, ...d });
    setEditingId(d.id);
  }

  async function handleDelete(id) {
    if (window.confirm('¿Dar de baja a este chofer/nanny? Ya no podrá iniciar sesión.')) {
      await Drivers.remove(id);
    }
  }

  const schoolName = (id) => schools.find((s) => s.id === id)?.name || '—';

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-navy-900 mb-6">Choferes y nannies</h1>

      <div className="bg-signal-yellow/20 border-2 border-signal-yellow rounded-xl p-3 text-sm text-navy-800 mb-6">
        No necesitas crear ninguna contraseña: el chofer entra solo con su
        cuenta de Google institucional. Lo único importante es que el
        correo que registres aquí sea <strong>exactamente</strong> el mismo
        con el que él iniciará sesión.
      </div>

      <form onSubmit={handleSubmit} className="card mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        <p className="md:col-span-2 font-medium text-sm text-navy-600">
          {editingId ? 'Editar' : 'Nuevo chofer / nanny'}
        </p>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nombre completo"
          className="rounded-xl border border-navy-100 px-3 py-2"
          required
        />
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="Teléfono"
          className="rounded-xl border border-navy-100 px-3 py-2"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          <option value="driver">Chofer</option>
          <option value="nanny">Nanny</option>
        </select>
        <select
          value={form.schoolId}
          onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
          className="rounded-xl border border-navy-100 px-3 py-2"
        >
          <option value="">Plantel principal…</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Correo de Google institucional"
          type="email"
          className="rounded-xl border border-navy-100 px-3 py-2 md:col-span-2"
          required
        />
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="px-4 py-2 rounded-xl bg-navy-800 text-white font-semibold">
            {editingId ? 'Guardar cambios' : 'Agregar'}
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
        {drivers.map((d) => (
          <div key={d.id} className="py-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-medium">
                {d.name} <span className="text-xs text-navy-400">({d.role === 'nanny' ? 'nanny' : 'chofer'})</span>
              </p>
              <p className="text-sm text-navy-400">{schoolName(d.schoolId)} · {d.email}</p>
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={() => handleEdit(d)} className="text-navy-600 underline">Editar</button>
              <button onClick={() => handleDelete(d.id)} className="text-stop underline">Eliminar</button>
            </div>
          </div>
        ))}
        {drivers.length === 0 && <p className="text-navy-400 text-sm py-2">Sin choferes registrados.</p>}
      </div>
    </div>
  );
}
