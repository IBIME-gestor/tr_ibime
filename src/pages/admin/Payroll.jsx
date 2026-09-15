import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ChevronDown, Pencil, Trash2, Plus, Download, Search, Truck, Baby, Wrench, Users2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  STAFF_CATEGORIES, subscribeStaffLogDay, addStaffLogEntry, updateStaffLogEntry,
  removeStaffLogEntry, listStaffLogRange,
} from '../../firebase/staffLogs';
import { todayString } from '../../firebase/trips';
import { fmtDateOnly, dateRange, fmtDateTime24 } from '../../utils/dates';

const CATEGORY_ICONS = { operador: Truck, nanny: Baby, operador_taller: Wrench, otro: Users2 };

const emptyEntry = { staffName: '', sustituto: '', entrada: '', salida: '', nannyPresente: true, bono: '', nota: '' };

function fmtTs(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  return ms ? fmtDateTime24(new Date(ms)) : '';
}

export default function Payroll() {
  const { profile } = useAuth();
  const [date, setDate] = useState(todayString());
  const [entries, setEntries] = useState([]);
  const [open, setOpen] = useState({ operador: true, nanny: true, operador_taller: false, otro: false });
  const [addingIn, setAddingIn] = useState(null); // categoría con el formulario "+ agregar" abierto
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyEntry);

  useEffect(() => subscribeStaffLogDay(date, setEntries), [date]);

  function startAdd(category) {
    setAddingIn(category);
    setEditingId(null);
    setForm(emptyEntry);
  }

  function startEdit(entry) {
    setForm({ ...emptyEntry, ...entry });
    setEditingId(entry.id);
    setAddingIn(entry.category);
  }

  function cancelForm() {
    setAddingIn(null);
    setEditingId(null);
    setForm(emptyEntry);
  }

  async function handleSubmit(e, category) {
    e.preventDefault();
    if (!form.staffName.trim()) return;
    const data = {
      category,
      staffName: form.staffName.trim(),
      entrada: form.entrada || '',
      salida: form.salida || '',
      bono: form.bono === '' ? null : Number(form.bono),
      nota: form.nota || '',
      ...(category === 'operador' ? { nannyPresente: !!form.nannyPresente } : {}),
      ...(category === 'otro' ? { sustituto: form.sustituto || '' } : {}),
      createdBy: profile?.name || '',
    };
    if (editingId) {
      await updateStaffLogEntry(date, editingId, data);
    } else {
      await addStaffLogEntry(date, data);
    }
    cancelForm();
  }

  async function handleDelete(entryId) {
    if (!window.confirm('¿Eliminar este registro de la bitácora del día?')) return;
    await removeStaffLogEntry(date, entryId);
  }

  function exportRows(rows, filename) {
    const data = rows.map((r) => ({
      Fecha: fmtDateOnly(r.date || date),
      Categoría: STAFF_CATEGORIES[r.category] || r.category,
      Nombre: r.staffName,
      Sustituto: r.sustituto || '',
      Entrada: r.entrada || '',
      Salida: r.salida || '',
      'Nanny presente': r.category === 'operador' ? (r.nannyPresente ? 'Sí' : 'No') : '',
      Bono: r.bono ?? '',
      Nota: r.nota || '',
      'Capturado por': r.createdBy || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nómina');
    XLSX.writeFile(wb, filename);
  }

  // ---- consulta / exportación por rango de fechas ---------------------
  const [rangeFrom, setRangeFrom] = useState(date);
  const [rangeTo, setRangeTo] = useState(date);
  const [rangeRows, setRangeRows] = useState(null);
  const [rangeLoading, setRangeLoading] = useState(false);

  async function consultRange() {
    setRangeLoading(true);
    const rows = await listStaffLogRange(dateRange(rangeFrom, rangeTo));
    setRangeRows(rows);
    setRangeLoading(false);
  }

  const grouped = Object.keys(STAFF_CATEGORIES).reduce((acc, cat) => {
    acc[cat] = entries.filter((e) => e.category === cat);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="admin-h1">Nómina de personal</h1>
        <button
          onClick={() => exportRows(entries.map((e) => ({ ...e, date })), `nomina_${date}.xlsx`)}
          disabled={entries.length === 0}
          className="btn-admin-ghost"
        >
          <Download size={14} /> Exportar este día
        </button>
      </div>
      <p className="text-sm text-navy-400 mb-5">
        Bitácora diaria: horarios, bonos y sustituciones del personal. Cada día es un documento
        nuevo y vacío — lo llenas en la noche y al día siguiente empiezas de cero. Nada se borra
        solo, así que puedes volver a cualquier fecha pasada a corregir algo.
      </p>

      <div className="flex items-end gap-3 mb-6">
        <div>
          <label className="admin-label">Fecha de esta bitácora</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="admin-input" />
        </div>
        <p className="text-sm text-navy-400 pb-2">{fmtDateOnly(date)} · {entries.length} registro(s)</p>
      </div>

      <div className="space-y-3 mb-8">
        {Object.entries(STAFF_CATEGORIES).map(([cat, label]) => {
          const Icon = CATEGORY_ICONS[cat];
          const rows = grouped[cat];
          const isOpen = open[cat];
          return (
            <div key={cat} className="admin-card p-0 overflow-hidden">
              <button
                onClick={() => setOpen({ ...open, [cat]: !isOpen })}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-navy-50/60 transition-colors"
              >
                <span className="flex items-center gap-2.5 font-display font-semibold text-navy-800">
                  <Icon size={16} className="text-navy-400" />
                  {label}
                  <span className="badge">{rows.length}</span>
                </span>
                <ChevronDown size={16} className={`text-navy-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="border-t border-navy-100 px-5 py-4">
                  {rows.length === 0 && addingIn !== cat && (
                    <p className="text-sm text-navy-400 mb-3">Sin registros todavía.</p>
                  )}

                  <div className="divide-y divide-navy-50 mb-3">
                    {rows.map((r) => (
                      <div key={r.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-navy-800">
                            {r.staffName}
                            {r.sustituto && <span className="text-navy-400 font-normal"> · sustituyó: {r.sustituto}</span>}
                          </p>
                          <p className="text-xs text-navy-400">
                            {r.entrada && `Entrada ${r.entrada}`}{r.entrada && r.salida ? ' · ' : ''}{r.salida && `Salida ${r.salida}`}
                            {cat === 'operador' && (r.nannyPresente ? ' · Con nanny' : ' · Sin nanny')}
                            {r.bono ? ` · Bono $${r.bono}` : ''}
                          </p>
                          {r.nota && <p className="text-xs text-navy-500 mt-0.5">{r.nota}</p>}
                          {r.createdAt && (
                            <p className="text-[0.65rem] text-navy-300 mt-0.5">
                              Capturado {fmtTs(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-3 shrink-0">
                          <button onClick={() => startEdit(r)} className="link-action flex items-center gap-1">
                            <Pencil size={12} /> Editar
                          </button>
                          <button onClick={() => handleDelete(r.id)} className="link-danger flex items-center gap-1">
                            <Trash2 size={12} /> Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {addingIn === cat ? (
                    <form onSubmit={(e) => handleSubmit(e, cat)} className="p-3 rounded-md border border-navy-100 bg-navy-50/50 cascade-item">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="admin-label">{cat === 'otro' ? 'Nombre de quien faltó' : 'Nombre'}</label>
                          <input
                            value={form.staffName}
                            onChange={(e) => setForm({ ...form, staffName: e.target.value })}
                            className="admin-input h-9 text-sm"
                            required
                          />
                        </div>
                        {cat === 'otro' && (
                          <div>
                            <label className="admin-label">Quién lo sustituyó</label>
                            <input
                              value={form.sustituto}
                              onChange={(e) => setForm({ ...form, sustituto: e.target.value })}
                              className="admin-input h-9 text-sm"
                            />
                          </div>
                        )}
                        <div>
                          <label className="admin-label">Hora de entrada</label>
                          <input type="time" value={form.entrada} onChange={(e) => setForm({ ...form, entrada: e.target.value })} className="admin-input h-9 text-sm" />
                        </div>
                        <div>
                          <label className="admin-label">Hora de salida</label>
                          <input type="time" value={form.salida} onChange={(e) => setForm({ ...form, salida: e.target.value })} className="admin-input h-9 text-sm" />
                        </div>
                        <div>
                          <label className="admin-label">Bono adicional</label>
                          <input type="number" min="0" step="0.01" value={form.bono} onChange={(e) => setForm({ ...form, bono: e.target.value })} placeholder="$0.00" className="admin-input h-9 text-sm" />
                        </div>
                        {cat === 'operador' && (
                          <div className="flex items-end pb-1.5">
                            <label className="flex items-center gap-2 text-sm text-navy-600">
                              <input type="checkbox" checked={form.nannyPresente} onChange={(e) => setForm({ ...form, nannyPresente: e.target.checked })} />
                              ¿Llevó nanny ese día?
                            </label>
                          </div>
                        )}
                        <div className="sm:col-span-2">
                          <label className="admin-label">Nota (talleres, eventos, motivo…)</label>
                          <input value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="p. ej. transporte a taller mecánico, evento fin de curso…" className="admin-input h-9 text-sm" />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button type="submit" className="btn-admin-primary h-8 text-xs px-3">
                          {editingId ? 'Guardar cambios' : 'Agregar'}
                        </button>
                        <button type="button" onClick={cancelForm} className="btn-admin-ghost h-8 text-xs px-3">Cancelar</button>
                      </div>
                    </form>
                  ) : (
                    <button onClick={() => startAdd(cat)} className="btn-admin-ghost">
                      <Plus size={14} /> Agregar {cat === 'otro' ? 'sustitución' : 'registro'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Consulta por rango de fechas, para el corte de nómina        */}
      {/* ------------------------------------------------------------ */}
      <div className="admin-card">
        <p className="font-display font-semibold text-navy-800 mb-3">Consultar / exportar un periodo</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="admin-label">Del</label>
            <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="admin-input" />
          </div>
          <div>
            <label className="admin-label">Al</label>
            <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="admin-input" />
          </div>
          <button onClick={consultRange} disabled={rangeLoading} className="btn-admin bg-navy-800 text-white hover:bg-navy-700">
            <Search size={14} /> {rangeLoading ? 'Consultando…' : 'Consultar'}
          </button>
          {rangeRows && rangeRows.length > 0 && (
            <button onClick={() => exportRows(rangeRows, `nomina_${rangeFrom}_a_${rangeTo}.xlsx`)} className="btn-admin-ghost">
              <Download size={14} /> Exportar periodo (para RH)
            </button>
          )}
        </div>

        {rangeRows && (
          <div className="mt-4 overflow-x-auto border border-navy-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-left text-xs text-navy-400">
                <tr>
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Categoría</th>
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Horario</th>
                  <th className="p-2">Bono</th>
                  <th className="p-2">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {rangeRows.map((r) => (
                  <tr key={`${r.date}-${r.id}`}>
                    <td className="p-2 whitespace-nowrap">{fmtDateOnly(r.date)}</td>
                    <td className="p-2">{STAFF_CATEGORIES[r.category]}</td>
                    <td className="p-2">
                      {r.staffName}{r.sustituto && <span className="text-navy-400"> · sust: {r.sustituto}</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs">{r.entrada}{r.entrada && r.salida ? ' – ' : ''}{r.salida}</td>
                    <td className="p-2">{r.bono ? `$${r.bono}` : ''}</td>
                    <td className="p-2 text-xs text-navy-500">{r.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rangeRows.length === 0 && (
              <p className="text-center text-sm text-navy-400 py-6">Sin registros en ese periodo.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
