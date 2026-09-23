import { useEffect, useState } from 'react';
import { Pencil, Trash2, CircleDollarSign } from 'lucide-react';
import { PricingConcepts } from '../../firebase/services';

const emptyForm = {
  name: '',
  description: '',
  mode: 'mensual',
  amount: '',
  active: true,
  paymentDays: 5,
};

const MODE_OPTIONS = [
  { key: 'mensual', label: 'Mensual' },
  { key: 'por_dias', label: 'Por días' },
  { key: 'por_evento', label: 'Por día / evento' },
];

function money(value) {
  return `$${Number(value || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export default function Pricing() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setError('');
      setItems(await PricingConcepts.list());
    } catch (err) {
      console.error('Error cargando conceptos:', err);
      setItems([]);
      setError('No se pudieron cargar los conceptos. Revisa que las reglas de Firestore estén desplegadas.');
    }
  }

  useEffect(() => {
    let active = true;
    PricingConcepts.list()
      .then((rows) => { if (active) setItems(rows); })
      .catch((err) => {
        console.error('Error cargando conceptos:', err);
        if (active) {
          setItems([]);
          setError('No se pudieron cargar los conceptos. Revisa que las reglas de Firestore estén desplegadas.');
        }
      });
    return () => { active = false; };
  }, []);

  function reset() {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = form.name.trim();
    const amount = Number(form.amount);
    if (!name || !Number.isFinite(amount) || amount < 0) return;

    setSaving(true);
    setError('');
    try {
      const data = {
        name,
        description: form.description.trim(),
        mode: form.mode,
        amount,
        active: !!form.active,
        paymentDays: Math.max(0, Number(form.paymentDays || 0)),
      };
      if (editingId) await PricingConcepts.update(editingId, data);
      else await PricingConcepts.create(data);
      await load();
      reset();
    } catch (err) {
      console.error('Error guardando concepto:', err);
      setError(err?.message || 'No se pudo guardar el concepto.');
    } finally {
      setSaving(false);
    }
  }

  function edit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      description: item.description || '',
      mode: item.mode || 'mensual',
      amount: item.amount ?? '',
      active: item.active !== false,
      paymentDays: item.paymentDays ?? item.diasPago ?? 5,
    });
    setError('');
  }

  async function remove(item) {
    if (!window.confirm(`¿Eliminar el concepto "${item.name}"?`)) return;
    try {
      await PricingConcepts.remove(item.id);
      await load();
    } catch (err) {
      console.error(err);
      setError('No se pudo eliminar el concepto.');
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="admin-h1 mb-1">Conceptos y costos</h1>
        <p className="text-sm text-navy-400">
          Aquí defines los conceptos de cobro. Los conceptos son independientes de las rutas;
          después se asignan a cada ruta según su modalidad de servicio.
        </p>
      </div>

      {error && <div className="admin-card mb-5 border border-stop/20 text-stop text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
        <form onSubmit={handleSubmit} className="admin-card lg:sticky lg:top-6">
          <div className="flex items-center gap-2 mb-3">
            <CircleDollarSign size={17} className="text-navy-500" />
            <p className="font-display font-semibold text-sm">{editingId ? 'Editar concepto' : 'Nuevo concepto'}</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="admin-label">Nombre del concepto</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="admin-input" placeholder="Ej. Ruta completa" required />
            </div>
            <div>
              <label className="admin-label">Descripción</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="admin-input" placeholder="Ej. Servicio completo mensual" />
            </div>
            <div>
              <label className="admin-label">Modalidad</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className="admin-select">
                {MODE_OPTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <label className="admin-label">Monto</label>
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} type="number" min="0" step="0.01" className="admin-input" placeholder="0.00" required />
            </div>
            <div>
              <label className="admin-label">Días para pagar antes de pasar a atraso</label>
              <input value={form.paymentDays} onChange={(e) => setForm({ ...form, paymentDays: e.target.value })} type="number" min="0" step="1" className="admin-input" placeholder="5" required />
              <p className="text-[11px] text-navy-400 mt-1">Se cuentan desde el fin del periodo de la lista. Al vencer, pasa a Atraso; si cruza al mes siguiente sin pago, aparece en Mora.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-navy-600">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Concepto activo
            </label>
          </div>

          <div className="flex gap-2 mt-4">
            <button disabled={saving} className="btn-admin-primary flex-1">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear concepto'}</button>
            {editingId && <button type="button" onClick={reset} className="btn-admin-ghost">Cancelar</button>}
          </div>
        </form>

        <div className="admin-card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-navy-100">
            <p className="font-display font-semibold">Catálogo de conceptos</p>
            <p className="text-xs text-navy-400 mt-1">Un mismo concepto puede ser utilizado por varias rutas.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="table-admin">
              <thead>
                <tr>
                  <th className="pl-5">Concepto</th>
                  <th>Modalidad</th>
                  <th>Monto</th>
                  <th>Plazo de pago</th>
                  <th>Estado</th>
                  <th className="pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="pl-5 font-medium">
                      {item.name}
                      {item.description && <span className="block text-xs text-navy-400 font-normal">{item.description}</span>}
                    </td>
                    <td className="text-xs text-navy-500">{MODE_OPTIONS.find((x) => x.key === item.mode)?.label || item.mode}</td>
                    <td className="font-semibold">{money(item.amount)}</td>
                    <td className="text-xs">{Number(item.paymentDays ?? item.diasPago ?? 5)} días</td>
                    <td><span className={item.active === false ? 'badge-stop' : 'badge-go'}>{item.active === false ? 'Inactivo' : 'Activo'}</span></td>
                    <td className="pr-5 text-right whitespace-nowrap">
                      <button onClick={() => edit(item)} className="link-action mr-3"><Pencil size={13} /></button>
                      <button onClick={() => remove(item)} className="link-danger"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p className="text-sm text-navy-400 text-center py-8">Todavía no hay conceptos.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
