import { useEffect, useState } from 'react';
import { Units } from '../../firebase/services';
import { cascadeStyle } from '../../utils/cascade';
import { FuelPanel, MaintenancePanel } from './UnitExpenses';

const emptyForm = {
  plate: '',
  model: '',
  capacity: '',
  costPerKm: '',
  fixedTripCost: '',
  maintenanceDate: '',
  nextMaintenanceDate: '',
  insuranceFolio: '',
  verificationMonth: '',
  stickerColor: '',
  conditions: '',
  lastKmEdit: '',
};

export default function UnitsPage() {
  const [units, setUnits] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [tab, setTab] = useState('unidades');

  useEffect(() => Units.subscribe(setUnits), []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.plate.trim()) return;
    // El último km (odómetro) lo actualiza el operador al cerrar cada recorrido o viaje:
    // no se reescribe con el valor viejo del formulario salvo que el admin lo corrija aquí.
    const { lastKm, lastKmAt, lastKmTripId, lastKmEdit, ...rest } = form;
    const payload = { ...rest };
    const typed = lastKmEdit === '' || lastKmEdit == null ? null : Number(lastKmEdit);
    if (typed != null && Number.isFinite(typed) && (!editingId || typed !== Number(lastKm))) payload.lastKm = typed;
    if (editingId) {
      await Units.update(editingId, payload);
    } else {
      await Units.create(payload);
    }
    setForm(emptyForm);
    setEditingId(null);
  }

  function handleEdit(u) {
    setForm({ ...emptyForm, ...u, lastKmEdit: u.lastKm ?? '' });
    setEditingId(u.id);
  }

  async function handleDelete(id) {
    if (window.confirm('¿Eliminar esta unidad?')) await Units.remove(id);
  }

  return (
    <div>
      <h1 className="admin-h1 mb-3">Unidades</h1>
      <div className="flex flex-wrap gap-2 mb-5">
        {[['unidades', 'Unidades'], ['gasolina', 'Gasolina'], ['mantenimiento', 'Mantenimiento y reparaciones']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={tab === k ? 'btn-admin-primary' : 'btn-admin-ghost'}>{label}</button>
        ))}
      </div>

      {tab === 'gasolina' && <FuelPanel units={units} />}
      {tab === 'mantenimiento' && <MaintenancePanel units={units} />}

      {tab === 'unidades' && <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
        <form onSubmit={handleSubmit} className="admin-card shadow-panel lg:sticky lg:top-6 cascade-item">
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
                min="0"
                className="admin-input"
              />
            </div>
            <div>
              <label className="admin-label">Último km registrado (odómetro)</label>
              <input
                value={form.lastKmEdit}
                onChange={(e) => setForm({ ...form, lastKmEdit: e.target.value })}
                type="number"
                min="0"
                className="admin-input"
              />
              <p className="text-[11px] text-navy-400 mt-1">Se actualiza solo al cerrar cada recorrido o viaje; se valida contra el km inicial del siguiente. Corrígelo aquí si hace falta.</p>
            </div>
            <div>
              <label className="admin-label">Costo operativo por km</label>
              <input
                value={form.costPerKm}
                onChange={(e) => setForm({ ...form, costPerKm: e.target.value })}
                type="number"
                min="0"
                step="0.01"
                className="admin-input"
                placeholder="Ej. 4.50"
              />
            </div>
            <div>
              <label className="admin-label">Costo fijo por recorrido</label>
              <input
                value={form.fixedTripCost}
                onChange={(e) => setForm({ ...form, fixedTripCost: e.target.value })}
                type="number"
                min="0"
                step="0.01"
                className="admin-input"
                placeholder="Ej. 250"
              />
            </div>
            <div>
              <label className="admin-label">Fecha de mantenimiento</label>
              <input type="date" value={form.maintenanceDate} onChange={(e) => setForm({ ...form, maintenanceDate: e.target.value })} className="admin-input" />
            </div>
            <div>
              <label className="admin-label">Próxima cita de mantenimiento</label>
              <input type="date" value={form.nextMaintenanceDate} onChange={(e) => setForm({ ...form, nextMaintenanceDate: e.target.value })} className="admin-input" />
            </div>
            <div>
              <label className="admin-label">Folio de seguro</label>
              <input value={form.insuranceFolio} onChange={(e) => setForm({ ...form, insuranceFolio: e.target.value })} className="admin-input" />
            </div>
            <div>
              <label className="admin-label">Mes de verificación</label>
              <input type="month" value={form.verificationMonth} onChange={(e) => setForm({ ...form, verificationMonth: e.target.value })} className="admin-input" />
            </div>
            <div>
              <label className="admin-label">Engomado color</label>
              <input value={form.stickerColor} onChange={(e) => setForm({ ...form, stickerColor: e.target.value })} className="admin-input" />
            </div>
            <div>
              <label className="admin-label">Condiciones u otros</label>
              <textarea value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} className="admin-input min-h-20" />
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

        <div className="admin-card p-0 overflow-hidden cascade-item" style={cascadeStyle(1, 60)}>
          <div className="max-h-[70vh] overflow-y-auto overflow-x-auto">
            <table className="table-admin">
              <thead className="sticky top-0 z-10 bg-white shadow-sm">
                <tr>
                  <th className="pl-5">Placas</th>
                  <th>Modelo</th>
                  <th>Capacidad</th>
                  <th>Costo/km</th>
                  <th>Mantenimiento</th><th>Próxima cita</th><th>Seguro</th><th>Verificación</th><th>Engomado</th><th>Condiciones</th><th>Costo fijo/recorrido</th>
                  <th className="pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {units.map((u, i) => (
                  <tr key={u.id} className="cascade-item" style={cascadeStyle(i, 25)}>
                    <td className="pl-5 font-medium text-navy-700">{u.plate}</td>
                    <td className="text-navy-500">{u.model || '—'}</td>
                    <td className="text-navy-500">{u.capacity ? `${u.capacity} lugares` : '—'}</td>
                    <td className="text-navy-500">${Number(u.costPerKm || 0).toFixed(2)}</td>
                    <td className="text-navy-500">{u.maintenanceDate || '—'}</td>
                    <td className="text-navy-500">{u.nextMaintenanceDate || '—'}</td>
                    <td className="text-navy-500">{u.insuranceFolio || '—'}</td>
                    <td className="text-navy-500">{u.verificationMonth || '—'}</td>
                    <td className="text-navy-500">{u.stickerColor || '—'}</td>
                    <td className="text-navy-500 max-w-40 truncate" title={u.conditions || ''}>{u.conditions || '—'}</td>
                    <td className="text-navy-500">${Number(u.fixedTripCost || 0).toFixed(2)}</td>
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
      </div>}
    </div>
  );
}
