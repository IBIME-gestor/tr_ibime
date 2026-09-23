import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, CircleDollarSign } from 'lucide-react';
import { Pricing, Routes } from '../../firebase/services';

const SERVICE_OPTIONS = [
  { key: 'completo', label: 'Ruta completa (entrada + salida)' },
  { key: 'medio_entrada', label: 'Media ruta — entrada' },
  { key: 'medio_salida', label: 'Media ruta — salida' },
  { key: 'por_dia', label: 'Por día' },
];

const emptyForm = {
  routeId: '',
  serviceKey: 'completo',
  concept: '',
  amount: '',
  active: true,
};

export default function PricingPage() {
  const [routes, setRoutes] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => Routes.subscribe(setRoutes), []);
  useEffect(() => Pricing.list().then(setItems).catch(() => setItems([])), []);

  const routeName = useMemo(
    () => Object.fromEntries(routes.map((r) => [r.id, r.name])),
    [routes]
  );

  const serviceLabel = (key) => SERVICE_OPTIONS.find((x) => x.key === key)?.label || key;

  async function refresh() {
    setItems(await Pricing.list());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.routeId || !form.amount || Number(form.amount) < 0) return;
    setSaving(true);
    const data = {
      routeId: form.routeId,
      serviceKey: form.serviceKey,
      concept: form.concept.trim() || serviceLabel(form.serviceKey),
      amount: Number(form.amount),
      active: !!form.active,
    };
    try {
      if (editingId) await Pricing.update(editingId, data);
      else await Pricing.create(data);
      await refresh();
      setForm(emptyForm);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  function edit(item) {
    setEditingId(item.id);
    setForm({
      routeId: item.routeId || '',
      serviceKey: item.serviceKey || 'completo',
      concept: item.concept || '',
      amount: item.amount ?? '',
      active: item.active !== false,
    });
  }

  async function remove(item) {
    if (!window.confirm(`¿Eliminar el concepto "${item.concept || serviceLabel(item.serviceKey)}"?`)) return;
    await Pricing.remove(item.id);
    await refresh();
  }

  return (
    <div>
      <h1 className="admin-h1 mb-1">Tarifas y conceptos</h1>
      <p className="text-sm text-navy-400 mb-5">
        Configura cuánto cuesta cada modalidad por ruta. La tarifa se copia automáticamente al
        alumno cuando lo agregas a una lista.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
        <form onSubmit={handleSubmit} className="admin-card lg:sticky lg:top-6">
          <div className="flex items-center gap-2 mb-3">
            <CircleDollarSign size={17} className="text-navy-500" />
            <p className="font-display font-semibold text-sm">{editingId ? 'Editar tarifa' : 'Nueva tarifa'}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="admin-label">Ruta</label>
              <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })} className="admin-select" required>
                <option value="">Selecciona…</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="admin-label">Tipo de servicio</label>
              <select value={form.serviceKey} onChange={(e) => setForm({ ...form, serviceKey: e.target.value })} className="admin-select">
                {SERVICE_OPTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <label className="admin-label">Concepto que verá Caja / Finanzas</label>
              <input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} className="admin-input" placeholder="Ej. Ruta Norte completa" />
            </div>
            <div>
              <label className="admin-label">Monto</label>
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} type="number" min="0" step="0.01" className="admin-input" placeholder="$0.00" required />
            </div>
            <label className="flex items-center gap-2 text-sm text-navy-600">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Tarifa activa
            </label>
          </div>

          <div className="flex gap-2 mt-4">
            <button disabled={saving} className="btn-admin-primary flex-1">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar tarifa'}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }} className="btn-admin-ghost">Cancelar</button>}
          </div>
        </form>

        <div className="admin-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-admin">
              <thead>
                <tr>
                  <th className="pl-5">Ruta</th>
                  <th>Servicio</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th className="pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="pl-5 font-medium">{routeName[item.routeId] || 'Ruta eliminada'}</td>
                    <td className="text-xs text-navy-500">{serviceLabel(item.serviceKey)}</td>
                    <td>{item.concept || '—'}</td>
                    <td className="font-semibold">${Number(item.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td><span className={item.active === false ? 'badge-stop' : 'badge-go'}>{item.active === false ? 'Inactiva' : 'Activa'}</span></td>
                    <td className="pr-5 text-right whitespace-nowrap">
                      <button onClick={() => edit(item)} className="link-action mr-3"><Pencil size={13} /></button>
                      <button onClick={() => remove(item)} className="link-danger"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p className="text-sm text-navy-400 text-center py-8">Todavía no hay tarifas.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
