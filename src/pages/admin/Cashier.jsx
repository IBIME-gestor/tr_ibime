import { useState } from 'react';
import { Students, Routes } from '../../firebase/services';
import { listTripsByDate, getTripStopsOnce, todayString } from '../../firebase/trips';
import { PAYMENT_STATUSES } from './Students';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

/**
 * Caja. A propósito es de consulta puntual (botón "Consultar"), no un
 * listener en vivo: cruza, para la fecha elegida, quién tomó realmente
 * el servicio (leyendo los recorridos de ese día) contra el estatus de
 * pago guardado en cada alumno.
 */
export default function Cashier() {
  const [date, setDate] = useState(todayString());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  async function consult() {
    setLoading(true);
    const [trips, students, routes] = await Promise.all([
      listTripsByDate(date),
      Students.list(),
      Routes.list(),
    ]);
    const routeNameById = Object.fromEntries(routes.map((r) => [r.id, r.name]));
    const studentById = Object.fromEntries(students.map((s) => [s.id, s]));

    const took = {}; // studentId -> { morning: bool, afternoon: bool }
    await Promise.all(
      trips.map(async (trip) => {
        const stops = await getTripStopsOnce(trip.id);
        stops.forEach((s) => {
          const tomoElServicio = s.status === 'boarded' || s.status === 'delivered';
          if (!tomoElServicio) return;
          if (!took[s.studentId]) took[s.studentId] = { morning: false, afternoon: false };
          took[s.studentId][trip.shift === 'morning' ? 'morning' : 'afternoon'] = true;
        });
      })
    );

    const list = Object.entries(took).map(([studentId, flags]) => {
      const student = studentById[studentId];
      return {
        studentId,
        name: student?.name || '(alumno ya no está dado de alta)',
        matricula: student?.matricula || '—',
        routeName: routeNameById[student?.routeId] || '—',
        paymentStatus: student?.paymentStatus || 'al_corriente',
        ...flags,
      };
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    setRows(list);
    setLoading(false);
  }

  async function changePayment(studentId, paymentStatus) {
    await Students.update(studentId, { paymentStatus });
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, paymentStatus } : r)));
  }

  const visible = (rows || []).filter((r) => !onlyUnpaid || r.paymentStatus !== 'al_corriente');

  return (
    <div className="max-w-3xl">
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
                <tr key={r.studentId} className="cascade-item" style={cascadeStyle(i)}>
                  <td className="p-2">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-navy-400">{r.matricula}</p>
                  </td>
                  <td className="p-2 text-navy-500">{r.routeName}</td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {r.morning && r.afternoon ? 'Ida y vuelta' : r.morning ? 'Solo ida' : 'Solo vuelta'}
                  </td>
                  <td className="p-2">
                    <select
                      value={r.paymentStatus}
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
      )}
    </div>
  );
}
