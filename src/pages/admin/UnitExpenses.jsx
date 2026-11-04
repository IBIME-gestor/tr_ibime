import { useEffect, useMemo, useState } from 'react';
import { Fuel, Wrench, Trash2, Pencil } from 'lucide-react';
import { UnitFuelLogs, UnitMaintenance } from '../../firebase/services';
import { useAuth } from '../../context/AuthContext';

/* ------------------------------------------------------------------ */
/*  Pestañas de Unidades: «Gasolina» y «Mantenimiento y reparaciones»   */
/*  Todo lo capturado aquí alimenta Reportes (costo real y km/L).       */
/* ------------------------------------------------------------------ */

export const money = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function nowParts() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const num = (v) => (v === '' || v == null ? 0 : Number(v));

function UnitSelect({ units, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="admin-select w-full" required>
      <option value="">— elige unidad —</option>
      {units.map((u) => <option key={u.id} value={u.id}>{u.plate}{u.model ? ` — ${u.model}` : ''}</option>)}
    </select>
  );
}

/* ----------------------------- GASOLINA ----------------------------- */
const emptyFuel = () => ({ unitId: '', ...nowParts(), amount: '', liters: '', odometer: '', station: '', notes: '' });

export function FuelPanel({ units }) {
  const { profile, user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(emptyFuel());
  const [editingId, setEditingId] = useState(null);
  const [unitFilter, setUnitFilter] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => UnitFuelLogs.subscribe(setLogs), []);
  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  const shown = logs.filter((l) => !unitFilter || l.unitId === unitFilter)
    .sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`));
  const total = shown.reduce((a, l) => ({ amount: a.amount + num(l.amount), liters: a.liters + num(l.liters) }), { amount: 0, liters: 0 });
  const price = num(form.liters) > 0 ? num(form.amount) / num(form.liters) : 0;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.unitId) return setError('Elige la unidad.');
    if (!(num(form.amount) > 0)) return setError('Captura el importe cargado (en pesos).');
    if (!(num(form.liters) > 0)) return setError('Captura los litros cargados.');
    if (!form.date || !form.time) return setError('Captura la fecha y la hora.');
    setSaving(true);
    try {
      const data = {
        unitId: form.unitId, date: form.date, time: form.time,
        amount: Number(num(form.amount).toFixed(2)), liters: Number(num(form.liters).toFixed(2)),
        pricePerLiter: Number((num(form.amount) / num(form.liters)).toFixed(3)),
        odometer: form.odometer === '' ? null : Number(form.odometer),
        station: form.station.trim(), notes: form.notes.trim(),
        loggedBy: profile?.name || user?.email || '',
      };
      if (editingId) await UnitFuelLogs.update(editingId, data); else await UnitFuelLogs.create(data);
      setForm({ ...emptyFuel(), unitId: form.unitId });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudo guardar la carga.');
    } finally { setSaving(false); }
  }

  function edit(l) {
    setEditingId(l.id);
    setForm({ unitId: l.unitId, date: l.date, time: l.time || '', amount: l.amount, liters: l.liters, odometer: l.odometer ?? '', station: l.station || '', notes: l.notes || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function remove(l) {
    if (window.confirm('¿Eliminar esta carga de gasolina?')) await UnitFuelLogs.remove(l.id);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
      <form onSubmit={submit} className="admin-card shadow-panel lg:sticky lg:top-6">
        <p className="font-display font-semibold text-sm text-navy-800 mb-3 flex items-center gap-2"><Fuel size={15} />{editingId ? 'Editar carga' : 'Registrar carga de gasolina'}</p>
        <div className="space-y-3">
          <div><label className="admin-label">Unidad</label><UnitSelect units={units} value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="admin-label">Fecha</label><input type="date" className="admin-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
            <div><label className="admin-label">Hora</label><input type="time" className="admin-input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="admin-label">Importe ($)</label><input type="number" min="0" step="0.01" className="admin-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Ej. 850" /></div>
            <div><label className="admin-label">Litros</label><input type="number" min="0" step="0.01" className="admin-input" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} placeholder="Ej. 35.5" /></div>
          </div>
          {price > 0 && <p className="text-xs text-navy-500">Precio por litro: <b>{money(price)}</b></p>}
          <div><label className="admin-label">Kilometraje del tablero (opcional)</label><input type="number" min="0" step="0.1" className="admin-input" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} placeholder="Para calcular km/L exacto" /></div>
          <div><label className="admin-label">Gasolinera / folio (opcional)</label><input className="admin-input" value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} /></div>
          <div><label className="admin-label">Notas</label><textarea className="admin-input min-h-16" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="submit" disabled={saving} className="btn-admin-primary flex-1">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar carga'}</button>
          {editingId && <button type="button" className="btn-admin-ghost" onClick={() => { setEditingId(null); setForm(emptyFuel()); }}>Cancelar</button>}
        </div>
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-navy-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-navy-600"><b>{shown.length}</b> carga(s) · <b>{money(total.amount)}</b> · <b>{total.liters.toFixed(1)} L</b></p>
          <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="admin-select">
            <option value="">Todas las unidades</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.plate}</option>)}
          </select>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-admin min-w-[760px]">
            <thead className="sticky top-0 z-10 bg-white shadow-sm"><tr><th className="pl-5">Fecha</th><th>Hora</th><th>Unidad</th><th className="text-right">Importe</th><th className="text-right">Litros</th><th className="text-right">$/L</th><th className="text-right">Km tablero</th><th>Gasolinera</th><th className="pr-5"></th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id}>
                  <td className="pl-5">{l.date}</td><td>{l.time || '—'}</td><td className="font-medium">{unitById[l.unitId]?.plate || '—'}</td>
                  <td className="text-right">{money(l.amount)}</td><td className="text-right">{Number(l.liters || 0).toFixed(2)}</td>
                  <td className="text-right">{l.liters > 0 ? money(l.amount / l.liters) : '—'}</td>
                  <td className="text-right">{l.odometer != null ? Number(l.odometer).toLocaleString('es-MX') : '—'}</td>
                  <td className="max-w-[160px] truncate" title={l.notes || ''}>{l.station || '—'}</td>
                  <td className="pr-5 text-right whitespace-nowrap">
                    <button onClick={() => edit(l)} className="link-action mr-3"><Pencil size={12} className="inline mr-1" />Editar</button>
                    <button onClick={() => remove(l)} className="link-danger"><Trash2 size={12} className="inline mr-1" />Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <p className="text-navy-400 text-sm py-6 text-center">Aún no hay cargas registradas.</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------- MANTENIMIENTO Y REPARACIONES ------------------- */
export const MAINT_KINDS = { mantenimiento: 'Mantenimiento', reparacion: 'Reparación', pieza: 'Pieza / refacción', otro: 'Otro' };
const emptyMaint = () => ({ unitId: '', date: nowParts().date, kind: 'mantenimiento', description: '', amount: '', provider: '', odometer: '', notes: '' });

export function MaintenancePanel({ units }) {
  const { profile, user } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyMaint());
  const [editingId, setEditingId] = useState(null);
  const [unitFilter, setUnitFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => UnitMaintenance.subscribe(setItems), []);
  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  const shown = items.filter((x) => (!unitFilter || x.unitId === unitFilter) && (!kindFilter || x.kind === kindFilter))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = shown.reduce((n, x) => n + num(x.amount), 0);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.unitId) return setError('Elige la unidad.');
    if (!form.description.trim()) return setError('Describe qué se hizo o qué pieza fue.');
    if (!(num(form.amount) > 0)) return setError('Captura el costo (en pesos).');
    setSaving(true);
    try {
      const data = {
        unitId: form.unitId, date: form.date, kind: form.kind, description: form.description.trim(),
        amount: Number(num(form.amount).toFixed(2)), provider: form.provider.trim(),
        odometer: form.odometer === '' ? null : Number(form.odometer), notes: form.notes.trim(),
        loggedBy: profile?.name || user?.email || '',
      };
      if (editingId) await UnitMaintenance.update(editingId, data); else await UnitMaintenance.create(data);
      setForm({ ...emptyMaint(), unitId: form.unitId });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudo guardar.');
    } finally { setSaving(false); }
  }
  function edit(x) {
    setEditingId(x.id);
    setForm({ unitId: x.unitId, date: x.date, kind: x.kind || 'mantenimiento', description: x.description || '', amount: x.amount, provider: x.provider || '', odometer: x.odometer ?? '', notes: x.notes || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function remove(x) { if (window.confirm('¿Eliminar este registro?')) await UnitMaintenance.remove(x.id); }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
      <form onSubmit={submit} className="admin-card shadow-panel lg:sticky lg:top-6">
        <p className="font-display font-semibold text-sm text-navy-800 mb-3 flex items-center gap-2"><Wrench size={15} />{editingId ? 'Editar registro' : 'Registrar mantenimiento, reparación o pieza'}</p>
        <div className="space-y-3">
          <div><label className="admin-label">Unidad</label><UnitSelect units={units} value={form.unitId} onChange={(v) => setForm({ ...form, unitId: v })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="admin-label">Fecha</label><input type="date" className="admin-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
            <div><label className="admin-label">Tipo</label><select className="admin-select w-full" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(MAINT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <div><label className="admin-label">¿Qué se hizo / qué pieza?</label><input className="admin-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ej. Cambio de balatas delanteras" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="admin-label">Costo total ($)</label><input type="number" min="0" step="0.01" className="admin-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><label className="admin-label">Km tablero (opcional)</label><input type="number" min="0" step="0.1" className="admin-input" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} /></div>
          </div>
          <div><label className="admin-label">Taller / proveedor (opcional)</label><input className="admin-input" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></div>
          <div><label className="admin-label">Notas</label><textarea className="admin-input min-h-16" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="submit" disabled={saving} className="btn-admin-primary flex-1">{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar registro'}</button>
          {editingId && <button type="button" className="btn-admin-ghost" onClick={() => { setEditingId(null); setForm(emptyMaint()); }}>Cancelar</button>}
        </div>
      </form>

      <div className="admin-card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-navy-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-navy-600"><b>{shown.length}</b> registro(s) · <b>{money(total)}</b></p>
          <div className="flex gap-2">
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="admin-select"><option value="">Todos los tipos</option>{Object.entries(MAINT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="admin-select"><option value="">Todas las unidades</option>{units.map((u) => <option key={u.id} value={u.id}>{u.plate}</option>)}</select>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="table-admin min-w-[760px]">
            <thead className="sticky top-0 z-10 bg-white shadow-sm"><tr><th className="pl-5">Fecha</th><th>Unidad</th><th>Tipo</th><th>Descripción</th><th>Proveedor</th><th className="text-right">Costo</th><th className="pr-5"></th></tr></thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.id}>
                  <td className="pl-5">{x.date}</td><td className="font-medium">{unitById[x.unitId]?.plate || '—'}</td><td>{MAINT_KINDS[x.kind] || x.kind}</td>
                  <td className="max-w-[240px] truncate" title={x.notes || x.description}>{x.description}</td><td>{x.provider || '—'}</td>
                  <td className="text-right font-semibold">{money(x.amount)}</td>
                  <td className="pr-5 text-right whitespace-nowrap">
                    <button onClick={() => edit(x)} className="link-action mr-3"><Pencil size={12} className="inline mr-1" />Editar</button>
                    <button onClick={() => remove(x)} className="link-danger"><Trash2 size={12} className="inline mr-1" />Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <p className="text-navy-400 text-sm py-6 text-center">Aún no hay registros.</p>}
        </div>
      </div>
    </div>
  );
}
