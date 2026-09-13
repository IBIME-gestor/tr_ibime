import { useState } from 'react';
import { User, Bus, CreditCard, CircleDollarSign, Pencil, X } from 'lucide-react';
import { Students, Routes } from '../../firebase/services';
import { listTripsByDate, getTripStopsOnce, todayString } from '../../firebase/trips';
import { PAYMENT_STATUSES, BILLING_MODES } from './Students';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {Icon && <Icon size={14} className="text-navy-300 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-navy-400">{label}</p>
        <p className="text-sm text-navy-800 font-medium break-words">{children}</p>
      </div>
    </div>
  );
}

/**
 * Caja. A propósito es de consulta puntual (botón "Consultar"), no un
 * listener en vivo: cruza, para la fecha elegida, quién tomó realmente
 * el servicio (leyendo los recorridos de ese día) contra el estatus de
 * pago/cobro guardado en cada alumno.
 *
 * A diferencia de Alumnos, aquí NO hay un registro propio que se pueda
 * "eliminar" — cada fila se arma al vuelo cruzando trips + el expediente
 * del alumno. Por eso el panel lateral solo permite VER el detalle y
 * EDITAR (con el lápiz) el cobro/estatus de pago de ese alumno; no hay
 * botón de eliminar.
 */
export default function Cashier() {
  const [date, setDate] = useState(todayString());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [form, setForm] = useState({ paymentStatus: 'al_corriente', billingMode: 'mensual', billingAmount: '' });

  async function consult() {
    setLoading(true);
    setSelectedId(null);
    setMode('view');
    const [trips, students, routes] = await Promise.all([
      listTripsByDate(date),
      Students.list(),
      Routes.list(),
    ]);
    const routeNameById = Object.fromEntries(routes.map((r) => [r.id, r.name]));
    const studentById = Object.fromEntries(students.map((s) => [s.id, s]));

    const took = {}; // studentId -> { morning, afternoon, adHocMorning, adHocAfternoon, routeId }
    await Promise.all(
      trips.map(async (trip) => {
        const stops = await getTripStopsOnce(trip.id);
        stops.forEach((s) => {
          const tomoElServicio = s.status === 'boarded' || s.status === 'delivered';
          if (!tomoElServicio) return;
          if (!took[s.studentId]) {
            took[s.studentId] = {
              morning: false,
              afternoon: false,
              adHocMorning: null,
              adHocAfternoon: null,
              routeId: trip.routeId,
            };
          }
          const key = trip.shift === 'morning' ? 'morning' : 'afternoon';
          took[s.studentId][key] = true;
          // La ruta real en la que viajó ese día (por si difiere de la que
          // tiene configurada actualmente, p. ej. altas al vuelo).
          took[s.studentId].routeId = trip.routeId;
          if (s.addedManually) {
            took[s.studentId][trip.shift === 'morning' ? 'adHocMorning' : 'adHocAfternoon'] =
              s.addedByName || 'operador';
          }
        });
      })
    );

    const list = Object.entries(took).map(([studentId, flags]) => {
      const student = studentById[studentId];
      return {
        studentId,
        name: student?.name || '(alumno ya no está dado de alta)',
        matricula: student?.matricula || '—',
        routeName: routeNameById[flags.routeId] || '—',
        paymentStatus: student?.paymentStatus || 'al_corriente',
        billingMode: student?.billingMode || 'mensual',
        billingAmount: student?.billingAmount || '',
        ...flags,
      };
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    setRows(list);
    setLoading(false);
  }

  const selectedRow = (rows || []).find((r) => r.studentId === selectedId) || null;

  function handleSelectRow(row) {
    setSelectedId(row.studentId);
    setMode('view');
  }

  function handleEditClick() {
    if (!selectedRow) return;
    setForm({
      paymentStatus: selectedRow.paymentStatus,
      billingMode: selectedRow.billingMode,
      billingAmount: selectedRow.billingAmount,
    });
    setMode('edit');
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!selectedRow) return;
    await Students.update(selectedRow.studentId, {
      paymentStatus: form.paymentStatus,
      billingMode: form.billingMode,
      billingAmount: form.billingAmount,
    });
    setRows((prev) =>
      prev.map((r) => (r.studentId === selectedRow.studentId ? { ...r, ...form } : r))
    );
    setMode('view');
  }

  async function changePayment(studentId, paymentStatus) {
    await Students.update(studentId, { paymentStatus });
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, paymentStatus } : r)));
  }

  const visible = (rows || []).filter((r) => !onlyUnpaid || r.paymentStatus !== 'al_corriente');

  return (
    <div>
      <LoadingOverlay show={loading} label="Consultando…" />
      <h1 className="admin-h1 mb-1">Caja</h1>
      <p className="text-sm text-navy-400 mb-5">
        Cruza qué alumnos tomaron el servicio ese día contra su estatus de pago, para validar
        cobros. Es de consulta puntual (aprieta "Consultar"), no se actualiza sola.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="admin-label">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="admin-input"
          />
        </div>
        <button
          onClick={consult}
          disabled={loading}
          className="btn-admin bg-navy-800 text-white hover:bg-navy-700"
        >
          {loading ? 'Consultando…' : 'Consultar'}
        </button>
        {rows && (
          <label className="flex items-center gap-2 text-sm text-navy-600 sm:ml-auto">
            <input
              type="checkbox"
              checked={onlyUnpaid}
              onChange={(e) => setOnlyUnpaid(e.target.checked)}
            />
            Solo los que no están al corriente
          </label>
        )}
      </div>

      {rows && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
          <div className="overflow-x-auto border border-navy-100 rounded-xl cascade-item">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-left text-xs text-navy-400">
                <tr>
                  <th className="p-2">Alumno</th>
                  <th className="p-2">Ruta</th>
                  <th className="p-2 whitespace-nowrap">Tomó ese día</th>
                  <th className="p-2">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {visible.map((r, i) => (
                  <tr
                    key={r.studentId}
                    onClick={() => handleSelectRow(r)}
                    className={`cascade-item cursor-pointer hover:bg-navy-50/70 ${
                      selectedId === r.studentId ? 'bg-signal-yellow/10' : ''
                    }`}
                    style={cascadeStyle(i)}
                  >
                    <td className="p-2">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-navy-400">{r.matricula}</p>
                    </td>
                    <td className="p-2 text-navy-500">{r.routeName}</td>
                    <td className="p-2 text-xs whitespace-nowrap">
                      {r.morning && r.afternoon ? 'Ida y vuelta' : r.morning ? 'Solo ida' : 'Solo vuelta'}
                      {(r.adHocMorning || r.adHocAfternoon) && (
                        <span className="block text-signal-amber font-medium mt-0.5">
                          ➕ Agregado al vuelo
                          {r.adHocMorning ? ` (ida, por ${r.adHocMorning})` : ''}
                          {r.adHocAfternoon ? ` (vuelta, por ${r.adHocAfternoon})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      <select
                        value={r.paymentStatus}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => changePayment(r.studentId, e.target.value)}
                        className={`text-xs rounded-md border-0 py-1 pr-6 font-medium cursor-pointer ${PAYMENT_STATUSES[r.paymentStatus].badgeClass}`}
                      >
                        {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <p className="text-center text-sm text-navy-400 py-6">
                Nadie tomó el servicio ese día con ese filtro (o ya están todos al corriente).
              </p>
            )}
          </div>

          <div className="lg:sticky lg:top-6">
            {selectedRow && mode === 'edit' && (
              <form onSubmit={handleSaveEdit} className="admin-card shadow-panel">
                <p className="font-display font-semibold text-base text-navy-800 mb-4">
                  Editar cobro de {selectedRow.name}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="admin-label">Cobro (para caja)</label>
                    <select
                      value={form.billingMode}
                      onChange={(e) => setForm({ ...form, billingMode: e.target.value })}
                      className="admin-select"
                    >
                      {Object.entries(BILLING_MODES).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="admin-label">
                      {form.billingMode === 'por_evento' ? 'Monto por cada vez que se usa' : 'Monto'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.billingAmount}
                      onChange={(e) => setForm({ ...form, billingAmount: e.target.value })}
                      placeholder="$0.00"
                      className="admin-input"
                    />
                  </div>
                  <div>
                    <label className="admin-label">Estatus de pago</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={form.paymentStatus}
                        onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}
                        className="admin-select flex-1"
                      >
                        {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <span className={PAYMENT_STATUSES[form.paymentStatus].badgeClass}>●</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button type="submit" className="btn-admin-primary flex-1">Guardar cambios</button>
                  <button type="button" onClick={() => setMode('view')} className="btn-admin-ghost">Cancelar</button>
                </div>
              </form>
            )}

            {selectedRow && mode === 'view' && (
              <div className="admin-card shadow-panel">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-navy-50 flex items-center justify-center shrink-0">
                      <User size={20} className="text-navy-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-semibold text-navy-900 leading-snug break-words">
                        {selectedRow.name}
                      </p>
                      <p className="text-xs text-navy-400">Matrícula: {selectedRow.matricula}</p>
                      <span className={PAYMENT_STATUSES[selectedRow.paymentStatus].badgeClass}>
                        {PAYMENT_STATUSES[selectedRow.paymentStatus].label}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-navy-300 hover:text-navy-600 shrink-0"
                    title="Cerrar"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="divide-y divide-navy-50">
                  <DetailRow icon={Bus} label="Ruta">{selectedRow.routeName}</DetailRow>
                  <DetailRow icon={Bus} label="Tomó ese día">
                    {selectedRow.morning && selectedRow.afternoon
                      ? 'Ida y vuelta'
                      : selectedRow.morning ? 'Solo ida' : 'Solo vuelta'}
                    {(selectedRow.adHocMorning || selectedRow.adHocAfternoon) && (
                      <span className="block text-signal-amber font-medium mt-0.5">
                        ➕ Agregado al vuelo
                        {selectedRow.adHocMorning ? ` (ida, por ${selectedRow.adHocMorning})` : ''}
                        {selectedRow.adHocAfternoon ? ` (vuelta, por ${selectedRow.adHocAfternoon})` : ''}
                      </span>
                    )}
                  </DetailRow>
                  <DetailRow icon={CreditCard} label="Cobro">
                    {BILLING_MODES[selectedRow.billingMode]}
                  </DetailRow>
                  <DetailRow icon={CircleDollarSign} label="Monto">
                    {selectedRow.billingAmount ? `$${selectedRow.billingAmount}` : 'Sin monto registrado'}
                  </DetailRow>
                </div>

                <div className="mt-5 pt-4 border-t border-navy-100">
                  <button onClick={handleEditClick} className="btn-admin-ghost w-full">
                    <Pencil size={14} /> Editar cobro y estatus de pago
                  </button>
                </div>
              </div>
            )}

            {!selectedRow && (
              <div className="admin-card shadow-panel text-center py-10">
                <User size={28} className="mx-auto text-navy-200 mb-2" />
                <p className="text-sm text-navy-400">
                  Selecciona un alumno de la lista para ver el detalle de su cobro.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
