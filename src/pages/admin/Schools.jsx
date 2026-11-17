import { useEffect, useState } from 'react';
import Drawer from '../../components/Drawer';
import { Plus } from 'lucide-react';
import { Schools } from '../../firebase/services';
import { cascadeStyle } from '../../utils/cascade';

export default function SchoolsPage() {
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState({ name: '', address: '', latitude: '', longitude: '' });
  const [editingId, setEditingId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openNew = () => { setEditingId(null); setForm({ name: '', address: '', latitude: '', longitude: '' }); setDrawerOpen(true); };
  const closeDrawer = () => { setEditingId(null); setForm({ name: '', address: '', latitude: '', longitude: '' }); setDrawerOpen(false); };

  useEffect(() => Schools.subscribe(setSchools), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) {
      await Schools.update(editingId, form);
    } else {
      await Schools.create(form);
    }
    setForm({ name: '', address: '', latitude: '', longitude: '' });
    setEditingId(null);
    setDrawerOpen(false);
  }

  function handleEdit(school) {
    setForm({ name: school.name, address: school.address || '', latitude: school.latitude ?? '', longitude: school.longitude ?? '' });
    setEditingId(school.id);
    setDrawerOpen(true);
  }

  async function handleDelete(id) {
    if (window.confirm('¿Eliminar este plantel? Esto no borra a sus alumnos.')) {
      await Schools.remove(id);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="admin-h1">Planteles</h1>
        <button type="button" onClick={openNew} className="btn-admin-primary"><Plus size={16} /> Nuevo plantel</button>
      </div>

      <div>
        <Drawer open={drawerOpen} onClose={closeDrawer} title={editingId ? 'Editar plantel' : 'Nuevo plantel'} size="md">
<form onSubmit={handleSubmit} className="pb-0">
          
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
            <div>
              <label className="admin-label">Latitud</label>
              <input type="number" step="any" value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })} className="admin-input"
                placeholder="Ej. 19.640000" />
            </div>
            <div>
              <label className="admin-label">Longitud</label>
              <input type="number" step="any" value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })} className="admin-input"
                placeholder="Ej. -99.220000" />
              <p className="text-[11px] text-navy-400 mt-1">Estas coordenadas pertenecen al plantel. No indican el origen de cada transporte.</p>
            </div>
          </div>
          <div className="drawer-actions">
            <button type="submit" className="btn-admin-primary flex-1">
              {editingId ? 'Guardar cambios' : 'Agregar plantel'}
            </button>
            <button type="button" onClick={closeDrawer} className="btn-admin-ghost">Cancelar</button>
          </div>
        </form>
</Drawer>

        <div className="admin-card p-0 overflow-hidden cascade-item" style={cascadeStyle(1, 60)}>
          <div className="max-h-[70vh] overflow-y-auto overflow-x-auto">
            <table className="table-admin">
              <thead className="sticky top-0 z-10 bg-white shadow-sm">
                <tr>
                  <th className="pl-5">Nombre</th>
                  <th>Dirección</th><th>Coordenadas</th>
                  <th className="pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s, i) => (
                  <tr key={s.id} className="cascade-item" style={cascadeStyle(i, 25)}>
                    <td className="pl-5 font-medium text-navy-700">{s.name}</td>
                    <td className="text-navy-500">{s.address || '—'}</td><td className="text-navy-500">{s.latitude != null && s.longitude != null && s.latitude !== '' && s.longitude !== '' ? `${s.latitude}, ${s.longitude}` : '—'}</td>
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
    </div>
  );
}
