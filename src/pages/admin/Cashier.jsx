import { useEffect, useState } from 'react';
import {
  Users, FileText, CheckCircle2, Clock, AlertTriangle, Search, X, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Students, Routes } from '../../firebase/services';
import { listTripsByDate, getTripStopsOnce, todayString } from '../../firebase/trips';
import { PAYMENT_STATUSES, BILLING_MODES } from './Students';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';
import { routeColorClasses } from '../../utils/routeColor';
import { fmtDateTime24, fmtTimestamp24 } from '../../utils/dates';

const METHODS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };

/**
 * Caja tiene dos herramientas, deliberadamente separadas:
 *
 * 1) El dashboard de arriba (esta pantalla, EN VIVO): control de estatus
 *    de pago de TODOS los alumnos en cualquier momento — no depende de
 *    qué recorridos hubo hoy. Es la vista de "gestor de cobranza".
 *
 * 2) "Consulta por recorridos de un día" (abajo, sigue igual que antes):
 *    cruza, para una fecha puntual, quién realmente USÓ el servicio
 *    contra su estatus — útil para validar si alguien sin pagar de
 *    todos modos subió al camión.
 */
export default function Cashier() {
  const { profile, user } = useAuth();

  // ---- reloj en vivo: dd/mm/aaaa, 24 hrs, con segundos --------------
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- dashboard en vivo de estatus de pago --------------------------
  const [students, setStudents] = useState([]);
  const [routes, setRoutesState] = useState([]);
  const [activeBucket, setActiveBucket] = useState(null);
  const [search, setSearch] = useState('');
  const [payingId, setPayingId] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'efectivo', note: '' });

  useEffect(() => Students.subscribe(setStudents), []);
  useEffect(() => Routes.subscribe(setRoutesState), []);

  const routeNameById = Object.fromEntries(routes.map((r) => [r.id, r.name]));
  const conConcepto = students.filter((s) => Number(s.billingAmount) > 0);
  const sinConcepto = students.length - conConcepto.length;
  const pagados = conConcepto.filter((s) => (s.paymentStatus || 'al_corriente') === 'al_corriente');
  const pendientes = conConcepto.filter((s) => s.paymentStatus === 'desfase');
  const enMora = conConcepto.filter((s) => s.paymentStatus === 'sin_pago');

  const CARDS = [
    { key: 'total', label: 'Alumnos totales', icon: Users, value: students.length, tone: 'navy' },
    { key: 'con_concepto', label: 'Con concepto de cobro', icon: FileText, value: conConcepto.length, tone: 'navy' },
    { key: 'pagado', label: 'Pagados', icon: CheckCircle2, value: pagados.length, tone: 'go' },
    { key: 'pendiente', label: 'Pendientes de pago', icon: Clock, value: pendientes.length, tone: 'amber' },
    { key: 'mora', label: 'En mora', icon: AlertTriangle, value: enMora.length, tone: 'stop' },
  ];

  const bucketStudents = {
    total: students,
    con_concepto: conConcepto,
    pagado: pagados,
    pendiente: pendientes,
    mora: enMora,
  };

  const visible = (bucketStudents[activeBucket] || [])
    .filter(
      (s) =>
        !search ||
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.matricula?.includes(search)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  function toneClasses(tone, active) {
    const map = {
      navy: active ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-100 bg-white text-navy-800 hover:border-navy-400',
      go: active ? 'border-go bg-go text-white' : 'border-go/25 bg-go-light text-go hover:border-go',
      amber: active ? 'border-signal-amber bg-signal-amber text-white' : 'border-signal-amber/30 bg-signal-amber/10 text-signal-amber hover:border-signal-amber',
      stop: active ? 'border-stop bg-stop text-white' : 'border-stop/25 bg-stop-light text-stop hover:border-stop',
    };
    return map[tone];
  }

  async function handleStatusSelect(student, value) {
    if (value === 'al_corriente') {
      setPayingId(student.id);
      setPayForm({ amount: student.billingAmount || '', method: 'efectivo', note: '' });
      return;
    }
    await Students.setPaymentStatus(student.id, value, profile?.name);
  }

  async function handleRegisterPayment(e, student) {
    e.preventDefault();
    await Students.registerPayment(student.id, {
      amount: payForm.amount,
      method: payForm.method,
      note: payForm.note,
      byName: profile?.name,
      byUid: user?.uid,
    });
    setPayingId(null);
  }

  // ---- consulta secundaria: recorridos de un día puntual -------------
  const [date, setDate] = useState(todayString());
  const [loading, setLoading] = useState(false);
  const [dayRows, setDayRows] = useState(null);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [showDayTool, setShowDayTool] = useState(false);

  async function consultDay() {
    setLoading(true);
    const [trips, studentList, routeList] = await Promise.all([
      listTripsByDate(date),
      Students.list(),
      Routes.list(),
    ]);
    const routeNameById2 = Object.fromEntries(routeList.map((r) => [r.id, r.name]));
    const studentById = Object.fromEntries(studentList.map((s) => [s.id, s]));

    const took = {};
    await Promise.all(
      trips.map(async (trip) => {
        const stops = await getTripStopsOnce(trip.id);
        stops.forEach((s) => {
          const tomoElServicio = s.status === 'boarded' || s.status === 'delivered';
          if (!tomoElServicio) return;
          if (!took[s.studentId]) {
            took[s.studentId] = { morning: false, afternoon: false, adHocMorning: null, adHocAfternoon: null, routeId: trip.routeId };
          }
          const key = trip.shift === 'morning' ? 'morning' : 'afternoon';
          took[s.studentId][key] = true;
          took[s.studentId].routeId = trip.routeId;
          if (s.addedManually) {
            took[s.studentId][trip.shift === 'morning' ? 'adHocMorning' : 'adHocAfternoon'] = s.addedByName || 'operador';
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
        routeName: routeNameById2[flags.routeId] || '—',
        paymentStatus: student?.paymentStatus || 'al_corriente',
        ...flags,
      };
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    setDayRows(list);
    setLoading(false);
  }

  const visibleDayRows = (dayRows || []).filter((r) => !onlyUnpaid || r.paymentStatus !== 'al_corriente');

  return (
    <div>
      <LoadingOverlay show={loading} label="Consultando…" />
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h1 className="admin-h1">Caja</h1>
        <p className="font-display text-sm text-navy-500 tabular-nums">{fmtDateTime24(now)}</p>
      </div>
      <p className="text-sm text-navy-400 mb-5">
        Control de estatus de pago de transporte, en vivo. Da clic en una tarjeta para ver a
        esos alumnos y cambiarles el estatus — se actualiza al instante en toda la app.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
        {CARDS.map((c, i) => {
          const Icon = c.icon;
          const active = activeBucket === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setActiveBucket(active ? null : c.key)}
              className={`cascade-item text-left rounded-lg border p-3.5 transition-colors ${toneClasses(c.tone, active)}`}
              style={cascadeStyle(i)}
            >
              <Icon size={16} className="mb-2 opacity-80" />
              <p className="text-2xl font-display font-bold tabular-nums leading-none">{c.value}</p>
              <p className="text-xs mt-1.5 opacity-90">{c.label}</p>
            </button>
          );
        })}
      </div>

      {sinConcepto > 0 && (
        <p className="text-xs text-navy-400 mb-5">
          {sinConcepto} alumno(s) sin ningún concepto de cobro configurado — no cuentan en
          Pagados/Pendientes/Mora hasta que se les asigne un monto en su expediente (Alumnos → editar → Cobro y pago).
        </p>
      )}

      {activeBucket && (
        <div className="admin-card mb-8 cascade-item">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <p className="font-display font-semibold text-navy-800">
              {CARDS.find((c) => c.key === activeBucket)?.label} ({visible.length})
            </p>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="admin-input pl-7 h-8 text-xs w-40"
                />
              </div>
              <button onClick={() => setActiveBucket(null)} className="text-navy-300 hover:text-navy-600">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="divide-y divide-navy-50">
            {visible.map((s) => {
              const rc = routeColorClasses(s.routeId);
              const status = s.paymentStatus || 'al_corriente';
              return (
                <div key={s.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy-800 truncate">{s.name}</p>
                      <p className="text-xs text-navy-400">
                        {s.matricula}
                        {s.routeId && rc && (
                          <span className={`badge ml-2 ${rc.bg} ${rc.text} ${rc.border}`}>
                            {routeNameById[s.routeId] || 'Ruta'}
                          </span>
                        )}
                        {Number(s.billingAmount) > 0 && (
                          <span className="ml-2">${s.billingAmount} · {BILLING_MODES[s.billingMode || 'mensual']}</span>
                        )}
                      </p>
                    </div>
                    <div className="relative">
                      <select
                        value={status}
                        onChange={(e) => handleStatusSelect(s, e.target.value)}
                        className={`text-xs rounded-md border-0 py-1.5 pl-2.5 pr-7 font-medium cursor-pointer appearance-none ${PAYMENT_STATUSES[status].badgeClass}`}
                      >
                        {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60" />
                    </div>
                  </div>

                  {s.paymentStatusUpdatedAt && (
                    <p className="text-[0.7rem] text-navy-300 mt-1">
                      Actualizado {fmtTimestamp24(s.paymentStatusUpdatedAt)}
                      {s.paymentStatusUpdatedBy ? ` · ${s.paymentStatusUpdatedBy}` : ''}
                    </p>
                  )}

                  {payingId === s.id && (
                    <form
                      onSubmit={(e) => handleRegisterPayment(e, s)}
                      className="mt-2 p-3 rounded-md border border-navy-100 bg-navy-50/50 cascade-item"
                    >
                      <p className="text-xs font-semibold text-navy-600 mb-2">Registrar pago de {s.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="admin-label">Monto</label>
                          <input
                            type="number" min="0" step="0.01"
                            value={payForm.amount}
                            onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                            placeholder="$0.00"
                            className="admin-input h-8 text-xs"
                          />
                        </div>
                        <div>
                          <label className="admin-label">Método</label>
                          <select
                            value={payForm.method}
                            onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                            className="admin-select h-8 text-xs"
                          >
                            {Object.entries(METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="admin-label">Nota (opcional)</label>
                          <input
                            value={payForm.note}
                            onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                            placeholder="folio, mes que cubre…"
                            className="admin-input h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button type="submit" className="btn-admin-primary h-8 text-xs px-3">
                          Registrar pago
                        </button>
                        <button type="button" onClick={() => setPayingId(null)} className="btn-admin-ghost h-8 text-xs px-3">
                          Cancelar
                        </button>
                      </div>
                      <p className="text-[0.65rem] text-navy-400 mt-2">
                        Quedará registrado como pagado el {fmtDateTime24(now)}
                        {profile?.name ? ` por ${profile.name}` : ''}.
                      </p>
                    </form>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && (
              <p className="text-center text-sm text-navy-400 py-6">Nadie en este grupo.</p>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Herramienta secundaria: cruce contra los recorridos de un día */}
      {/* ------------------------------------------------------------ */}
      <button
        onClick={() => setShowDayTool(!showDayTool)}
        className="link-action mb-3"
      >
        {showDayTool ? 'Ocultar' : 'Ver'} consulta por recorridos de un día específico
      </button>

      {showDayTool && (
        <div className="cascade-item">
          <p className="text-sm text-navy-400 mb-4">
            Cruza qué alumnos tomaron el servicio ese día contra su estatus de pago — útil para
            detectar a alguien que subió al camión sin estar al corriente.
          </p>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="admin-label">Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="admin-input" />
            </div>
            <button onClick={consultDay} disabled={loading} className="btn-admin bg-navy-800 text-white hover:bg-navy-700">
              {loading ? 'Consultando…' : 'Consultar'}
            </button>
            {dayRows && (
              <label className="flex items-center gap-2 text-sm text-navy-600 sm:ml-auto">
                <input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} />
                Solo los que no están al corriente
              </label>
            )}
          </div>

          {dayRows && (
            <div className="overflow-x-auto border border-navy-100 rounded-lg">
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
                  {visibleDayRows.map((r, i) => (
                    <tr key={r.studentId} className="cascade-item" style={cascadeStyle(i)}>
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
                        <span className={PAYMENT_STATUSES[r.paymentStatus].badgeClass}>
                          {PAYMENT_STATUSES[r.paymentStatus].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleDayRows.length === 0 && (
                <p className="text-center text-sm text-navy-400 py-6">
                  Nadie tomó el servicio ese día con ese filtro (o ya están todos al corriente).
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
