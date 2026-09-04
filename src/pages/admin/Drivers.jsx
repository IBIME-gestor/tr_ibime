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
      <h1 className="admin-h1 mb-1">Choferes y nannies</h1>
      <p className="text-sm text-navy-400 mb-5">{drivers.length} personas dadas de alta</p>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="bg-signal-yellow/20 border border-signal-yellow rounded-lg px-4 py-3 text-sm text-navy-800">
            No necesitas crear ninguna contraseña: cada persona entra sola con su cuenta de Google
            institucional. Solo asegúrate de que el correo coincida exactamente.
          </div>

          <form onSubmit={handleSubmit} className="admin-card">
            <p className="font-display font-semibold text-sm text-navy-800 mb-3">
              {editingId ? 'Editar' : 'Nuevo chofer / nanny'}
            </p>
            <div className="space-y-3">
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
                <label className="admin-label">Teléfono</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="admin-label">Rol</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="admin-select"
                >
                  <option value="driver">Chofer</option>
                  <option value="nanny">Nanny</option>
                </select>
              </div>
              <div>
                <label className="admin-label">Plantel principal</label>
                <select
                  value={form.schoolId}
                  onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
                  className="admin-select"
                >
                  <option value="">Selecciona…</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="admin-label">Correo de Google institucional</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  type="email"
                  className="admin-input"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button type="submit" className="btn-admin-primary flex-1">
                {editingId ? 'Guardar cambios' : 'Agregar'}
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
        </div>

        <div className="admin-card p-0 overflow-hidden">
          <table className="table-admin">
            <thead>
              <tr>
                <th className="pl-5">Nombre</th>
                <th>Rol</th>
                <th>Plantel</th>
                <th>Correo</th>
                <th className="pr-5"></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <td className="pl-5 font-medium text-navy-700">{d.name}</td>
                  <td>
                    <span className="badge">{d.role === 'nanny' ? 'Nanny' : 'Chofer'}</span>
                  </td>
                  <td className="text-navy-500">{schoolName(d.schoolId)}</td>
                  <td className="text-navy-500">{d.email}</td>
                  <td className="pr-5 text-right whitespace-nowrap">
                    <button onClick={() => handleEdit(d)} className="link-action mr-3">Editar</button>
                    <button onClick={() => handleDelete(d.id)} className="link-danger">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {drivers.length === 0 && (
            <p className="text-navy-400 text-sm py-6 text-center">Sin choferes registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}
