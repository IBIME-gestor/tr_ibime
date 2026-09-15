import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Users, FileText, CheckCircle2, Clock, AlertTriangle, Search, X, ChevronDown,
  Download, MessageCircle, Mail as MailIcon, Ticket as TicketIcon, History, Ban,
  TrendingUp, Printer,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Students, Routes, Mail } from '../../firebase/services';
import { listTripsByDate, getTripStopsOnce, todayString } from '../../firebase/trips';
import { PAYMENT_STATUSES, BILLING_MODES } from './Students';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';
import { routeColorClasses } from '../../utils/routeColor';
import { fmtDateTime24, fmtTimestamp24, fmtDateOnly, daysOverdue, monthBounds } from '../../utils/dates';

const METHODS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };

/**
 * Estatus "de verdad", calculado contra HOY — no lo que quedó guardado
 * la última vez que alguien lo tocó a mano. Si ya pasó la fecha de
 * vencimiento y nadie registró un pago, cae en mora solo, sin que el
 * cajero tenga que acordarse de marcarlo.
 */
function effectiveStatus(s, now) {
  if (!(Number(s.billingAmount) > 0)) return null; // sin concepto de cobro
  if (s.paymentStatus === 'al_corriente') return 'al_corriente';
  if (s.nextDueDate && daysOverdue(s.nextDueDate, now) > 0) return 'sin_pago';
  return s.paymentStatus === 'sin_pago' ? 'sin_pago' : 'desfase';
}

function waLink(phone, text) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/52${digits.slice(-10)}?text=${encodeURIComponent(text)}`;
}

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
  const [payForm, setPayForm] = useState({ amount: '', method: 'efectivo', note: '', nextDueDate: '' });
  const [historyFor, setHistoryFor] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [ticket, setTicket] = useState(null); // { student, payment }

  useEffect(() => Students.subscribe(setStudents), []);
  useEffect(() => Routes.subscribe(setRoutesState), []);

  const routeNameById = Object.fromEntries(routes.map((r) => [r.id, r.name]));
  const conConcepto = students.filter((s) => Number(s.billingAmount) > 0);
  const sinConcepto = students.length - conConcepto.length;
  const withEffective = conConcepto.map((s) => ({ ...s, _status: effectiveStatus(s, now) }));
  const pagados = withEffective.filter((s) => s._status === 'al_corriente');
  const pendientes = withEffective.filter((s) => s._status === 'desfase');
  const enMora = withEffective.filter((s) => s._status === 'sin_pago');

  const CARDS = [
    { key: 'total', label: 'Alumnos totales', icon: Users, value: students.length, tone: 'navy' },
    { key: 'con_concepto', label: 'Con concepto de cobro', icon: FileText, value: conConcepto.length, tone: 'navy' },
    { key: 'pagado', label: 'Pagados', icon: CheckCircle2, value: pagados.length, tone: 'go' },
    { key: 'pendiente', label: 'Pendientes de pago', icon: Clock, value: pendientes.length, tone: 'amber' },
    { key: 'mora', label: 'En mora', icon: AlertTriangle, value: enMora.length, tone: 'stop' },
  ];

  const bucketStudents = { total: students, con_concepto: conConcepto, pagado: pagados, pendiente: pendientes, mora: enMora };

  const visible = (bucketStudents[activeBucket] || [])
    .filter((s) => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.matricula?.includes(search))
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

  function suggestedNextDue(billingMode) {
    const d = new Date(now);
    if (billingMode === 'mensual') d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  async function handleStatusSelect(student, value) {
    if (value === 'al_corriente') {
      setPayingId(student.id);
      setPayForm({ amount: student.billingAmount || '', method: 'efectivo', note: '', nextDueDate: suggestedNextDue(student.billingMode) });
      return;
    }
    await Students.setPaymentStatus(student.id, value, profile?.name);
  }

  async function handleRegisterPayment(e, student) {
    e.preventDefault();
    const paymentId = await Students.registerPayment(student.id, {
      amount: payForm.amount,
      method: payForm.method,
      note: payForm.note,
      nextDueDate: payForm.nextDueDate,
      byName: profile?.name,
      byUid: user?.uid,
    });
    setPayingId(null);
    setTicket({
      student: { ...student, nextDueDate: payForm.nextDueDate },
      payment: { id: paymentId, amount: payForm.amount, method: payForm.method, at: new Date() },
    });
    refreshRevenue();
  }

  async function toggleHistory(studentId) {
    if (historyFor === studentId) { setHistoryFor(null); return; }
    setHistoryFor(studentId);
    setHistoryList(await Students.listPayments(studentId));
  }

  async function handleCancelPayment(student, payment) {
    const reason = window.prompt(`¿Por qué se cancela/reembolsa este pago de $${payment.amount || 0}?`, '');
    if (reason == null) return;
    await Students.cancelPayment(student.id, payment.id, reason, profile?.name);
    setHistoryList(await Students.listPayments(student.id));
    refreshRevenue();
  }

  // ---- proyección de ingresos (#8) ------------------------------------
  const projectedMonthly = conConcepto
    .filter((s) => (s.billingMode || 'mensual') === 'mensual')
    .reduce((sum, s) => sum + Number(s.billingAmount || 0), 0);
  const [collectedThisMonth, setCollectedThisMonth] = useState(null);

  async function refreshRevenue() {
    const { since, until } = monthBounds(now);
    const payments = await Students.listPaymentsBetween(since, until);
    const total = payments.filter((p) => !p.cancelled).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    setCollectedThisMonth(total);
  }
  useEffect(() => { refreshRevenue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- antigüedad de saldos / aging (#4) -------------------------------
  const agingTiers = [
    { key: '1-7', label: '1 a 7 días', test: (d) => d >= 1 && d <= 7 },
    { key: '8-15', label: '8 a 15 días', test: (d) => d >= 8 && d <= 15 },
    { key: '16-30', label: '16 a 30 días', test: (d) => d >= 16 && d <= 30 },
    { key: '31+', label: 'Más de 30 días', test: (d) => d > 30 },
  ];
  const agingRows = agingTiers.map((tier) => {
    const inTier = enMora.filter((s) => s.nextDueDate && tier.test(daysOverdue(s.nextDueDate, now)));
    return { ...tier, count: inTier.length, amount: inTier.reduce((sum, s) => sum + Number(s.billingAmount || 0), 0) };
  });
  const moraSinFecha = enMora.filter((s) => !s.nextDueDate);

  // ---- avisos de cobranza (#2): 3+ días de atraso ----------------------
  const overdue3 = enMora
    .filter((s) => s.nextDueDate && daysOverdue(s.nextDueDate, now) >= 3)
    .sort((a, b) => daysOverdue(b.nextDueDate, now) - daysOverdue(a.nextDueDate, now));
  const [queuedEmails, setQueuedEmails] = useState({});

  async function queueReminderEmail(s) {
    const dias = daysOverdue(s.nextDueDate, now);
    await Mail.queue({
      to: s.parentEmail,
      subject: `Aviso de pago pendiente — transporte escolar de ${s.name}`,
      html: `<p>Hola,</p><p>El pago del servicio de transporte escolar de <b>${s.name}</b> (matrícula ${s.matricula}) venció el ${fmtDateOnly(s.nextDueDate)} — lleva ${dias} día(s) de atraso.</p><p>Monto: $${s.billingAmount}.</p><p>Por favor regulariza tu pago a la brevedad. Gracias.</p><p>Ruta Segura · IBIME Transporte Escolar</p>`,
    });
    setQueuedEmails((q) => ({ ...q, [s.id]: true }));
  }

  // ---- exportar a Excel (#6) -------------------------------------------
  function exportToExcel(list, filename) {
    const data = list.map((s) => ({
      Matrícula: s.matricula,
      Nombre: s.name,
      Ruta: routeNameById[s.routeId] || '',
      Estatus: PAYMENT_STATUSES[effectiveStatus(s, now) || 'al_corriente']?.label || '',
      Monto: s.billingAmount || '',
      Cobro: BILLING_MODES[s.billingMode || 'mensual'],
      Vencimiento: s.nextDueDate ? fmtDateOnly(s.nextDueDate) : '',
      'Días de atraso': s.nextDueDate ? Math.max(0, daysOverdue(s.nextDueDate, now)) : '',
      'Último pago': s.lastPaymentAmount || '',
      'Método último pago': s.lastPaymentMethod || '',
      'Actualizado': fmtTimestamp24(s.paymentStatusUpdatedAt),
      'Actualizado por': s.paymentStatusUpdatedBy || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Caja');
    XLSX.writeFile(wb, filename);
  }

  // ---- consulta secundaria: recorridos de un día puntual ----------------
  const [date, setDate] = useState(todayString());
  const [loading, setLoading] = useState(false);
  const [dayRows, setDayRows] = useState(null);
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);
  const [showDayTool, setShowDayTool] = useState(false);

  async function consultDay() {
    setLoading(true);
    const [trips, studentList, routeList] = await Promise.all([
      listTripsByDate(date), Students.list(), Routes.list(),
    ]);
    const routeNameById2 = Object.fromEntries(routeList.map((r) => [r.id, r.name]));
    const studentById = Object.fromEntries(studentList.map((s) => [s.id, s]));
    const took = {};
    await Promise.all(trips.map(async (trip) => {
      const stops = await getTripStopsOnce(trip.id);
      stops.forEach((s) => {
        const tomoElServicio = s.status === 'boarded' || s.status === 'delivered';
        if (!tomoElServicio) return;
        if (!took[s.studentId]) took[s.studentId] = { morning: false, afternoon: false, adHocMorning: null, adHocAfternoon: null, routeId: trip.routeId };
        const key = trip.shift === 'morning' ? 'morning' : 'afternoon';
        took[s.studentId][key] = true;
        took[s.studentId].routeId = trip.routeId;
        if (s.addedManually) took[s.studentId][trip.shift === 'morning' ? 'adHocMorning' : 'adHocAfternoon'] = s.addedByName || 'operador';
      });
    }));
    const list = Object.entries(took).map(([studentId, flags]) => {
      const student = studentById[studentId];
      return {
        studentId, name: student?.name || '(alumno ya no está dado de alta)', matricula: student?.matricula || '—',
        routeName: routeNameById2[flags.routeId] || '—', paymentStatus: student?.paymentStatus || 'al_corriente', ...flags,
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

      {/* ---------------- boleto imprimible (modal) ---------------- */}
      {ticket && (
        <div className="fixed inset-0 z-50 bg-navy-900/50 flex items-center justify-center p-4 print:bg-transparent">
          <div className="ticket-card ticket-print w-full max-w-sm">
            <p className="font-display font-bold text-lg text-navy-900">Ruta Segura</p>
            <p className="text-xs text-navy-400 mb-4">IBIME Transporte Escolar · Boleto de servicio</p>
            <div className="space-y-1.5 text-sm">
              <p><span className="text-navy-400">Folio:</span> <span className="font-mono">{ticket.payment.id.slice(-10).toUpperCase()}</span></p>
              <p><span className="text-navy-400">Alumno:</span> {ticket.student.name}</p>
              <p><span className="text-navy-400">Matrícula:</span> {ticket.student.matricula}</p>
              <p><span className="text-navy-400">Ruta:</span> {routeNameById[ticket.student.routeId] || '—'}</p>
              <p><span className="text-navy-400">Monto pagado:</span> ${ticket.payment.amount || 0}</p>
              <p><span className="text-navy-400">Método:</span> {METHODS[ticket.payment.method] || ticket.payment.method}</p>
              <p><span className="text-navy-400">Fecha de pago:</span> {fmtDateTime24(ticket.payment.at instanceof Date ? ticket.payment.at : now)}</p>
              <p className="pt-2 border-t border-dashed border-navy-100 mt-2">
                <span className="text-navy-400">Servicio vigente hasta:</span>{' '}
                <span className="font-semibold">{ticket.student.nextDueDate ? fmtDateOnly(ticket.student.nextDueDate) : '—'}</span>
              </p>
            </div>
            <p className="text-[0.65rem] text-navy-300 mt-4">
              Boleto simbólico de control interno — no sustituye el recibo fiscal/de caja del plantel.
            </p>
            <div className="flex gap-2 mt-5 print:hidden">
              <button onClick={() => window.print()} className="btn-admin-primary flex-1">
                <Printer size={14} /> Imprimir / Guardar PDF
              </button>
              <button onClick={() => setTicket(null)} className="btn-admin-ghost">Cerrar</button>
            </div>
          </div>
        </div>
      )}

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
          Pagados/Pendientes/Mora hasta que se les asigne un monto en su expediente. "En mora" se
          calcula solo cuando pasa la fecha de vencimiento configurada en Alumnos, contra la hora
          de ahorita ({fmtDateTime24(now)}) — no depende de que alguien lo marque a mano.
        </p>
      )}

      {/* ---------------- proyección de ingresos (#8) ---------------- */}
      <div className="admin-card mb-5 cascade-item">
        <p className="font-display font-semibold text-navy-800 mb-3 flex items-center gap-2">
          <TrendingUp size={15} className="text-navy-400" /> Proyección de ingresos de este mes
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-navy-400">Configurado (cuotas mensuales)</p>
            <p className="text-xl font-display font-bold text-navy-800">${projectedMonthly.toLocaleString('es-MX')}</p>
          </div>
          <div>
            <p className="text-xs text-navy-400">Cobrado hasta ahorita este mes</p>
            <p className="text-xl font-display font-bold text-go">
              {collectedThisMonth == null ? '…' : `$${collectedThisMonth.toLocaleString('es-MX')}`}
            </p>
          </div>
          <div>
            <p className="text-xs text-navy-400">Diferencia (por cobrar / eventual)</p>
            <p className="text-xl font-display font-bold text-signal-amber">
              {collectedThisMonth == null ? '…' : `$${Math.max(0, projectedMonthly - collectedThisMonth).toLocaleString('es-MX')}`}
            </p>
          </div>
        </div>
        <p className="text-xs text-navy-400 mt-3">
          "Configurado" solo suma alumnos con cobro mensual fijo — los de "por días" o "por
          evento" son variables y no se pueden proyectar de antemano con datos confiables.
        </p>
      </div>

      {/* ---------------- antigüedad de saldos / aging (#4) ---------------- */}
      {enMora.length > 0 && (
        <div className="admin-card mb-5 cascade-item">
          <p className="font-display font-semibold text-navy-800 mb-3">Antigüedad de saldos en mora</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {agingRows.map((t) => (
              <div key={t.key} className="rounded-md border border-stop/20 bg-stop-light p-3">
                <p className="text-lg font-display font-bold text-stop">{t.count}</p>
                <p className="text-xs text-stop/80">{t.label}</p>
                <p className="text-xs text-stop/60 mt-0.5">${t.amount.toLocaleString('es-MX')}</p>
              </div>
            ))}
          </div>
          {moraSinFecha.length > 0 && (
            <p className="text-xs text-navy-400 mt-3">
              {moraSinFecha.length} alumno(s) en mora sin fecha de vencimiento registrada — no se
              puede calcular su antigüedad. Ve a su expediente en Alumnos y captúrasela.
            </p>
          )}
        </div>
      )}

      {/* ---------------- avisos de cobranza (#2) ---------------- */}
      {overdue3.length > 0 && (
        <div className="admin-card mb-8 cascade-item">
          <p className="font-display font-semibold text-navy-800 mb-1">
            Avisos de pago — {overdue3.length} con 3+ días de atraso
          </p>
          <p className="text-xs text-navy-400 mb-3">
            WhatsApp abre un chat prellenado (tú lo mandas, no es automático). El correo se
            encola para tu cuenta de Workspace — para que salga solo hace falta instalar la
            extensión de Firebase "Trigger Email" una sola vez (ver nota abajo del todo).
          </p>
          <div className="divide-y divide-navy-50">
            {overdue3.map((s) => {
              const dias = daysOverdue(s.nextDueDate, now);
              const msg = `Hola, te escribimos de Ruta Segura (transporte escolar). El pago de ${s.name} venció el ${fmtDateOnly(s.nextDueDate)} (${dias} días de atraso). Monto: $${s.billingAmount}. Por favor regulariza tu pago, gracias.`;
              const wa = waLink(s.parentContact, msg);
              return (
                <div key={s.id} className="py-2 flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-800">{s.name}</p>
                    <p className="text-xs text-stop">{dias} días de atraso · ${s.billingAmount}</p>
                  </div>
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className="btn-admin-ghost h-8 text-xs px-2.5">
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                  {s.parentEmail && (
                    <button
                      onClick={() => queueReminderEmail(s)}
                      disabled={queuedEmails[s.id]}
                      className="btn-admin-ghost h-8 text-xs px-2.5 disabled:opacity-50"
                    >
                      <MailIcon size={13} /> {queuedEmails[s.id] ? 'Encolado' : 'Encolar correo'}
                    </button>
                  )}
                  {!wa && !s.parentEmail && (
                    <span className="text-xs text-navy-300">Sin teléfono ni correo registrado</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="admin-input pl-7 h-8 text-xs w-40" />
              </div>
              <button onClick={() => exportToExcel(visible, `caja_${activeBucket}_${todayString()}.xlsx`)} className="btn-admin-ghost h-8 text-xs px-2.5">
                <Download size={13} /> Excel
              </button>
              <button onClick={() => setActiveBucket(null)} className="text-navy-300 hover:text-navy-600">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="divide-y divide-navy-50">
            {visible.map((s) => {
              const rc = routeColorClasses(s.routeId);
              const status = s._status || 'al_corriente';
              const dias = s.nextDueDate ? daysOverdue(s.nextDueDate, now) : null;
              return (
                <div key={s.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy-800 truncate">{s.name}</p>
                      <p className="text-xs text-navy-400">
                        {s.matricula}
                        {s.routeId && rc && (
                          <span className={`badge ml-2 ${rc.bg} ${rc.text} ${rc.border}`}>{routeNameById[s.routeId] || 'Ruta'}</span>
                        )}
                        {Number(s.billingAmount) > 0 && <span className="ml-2">${s.billingAmount} · {BILLING_MODES[s.billingMode || 'mensual']}</span>}
                        {s.nextDueDate && (
                          <span className="ml-2">
                            Vence {fmtDateOnly(s.nextDueDate)}
                            {dias > 0 && <span className="text-stop"> ({dias}d de atraso)</span>}
                          </span>
                        )}
                      </p>
                    </div>
                    <button onClick={() => toggleHistory(s.id)} className="link-action flex items-center gap-1 shrink-0">
                      <History size={12} /> Historial
                    </button>
                    <div className="relative">
                      <select
                        value={status}
                        onChange={(e) => handleStatusSelect(s, e.target.value)}
                        className={`text-xs rounded-md border-0 py-1.5 pl-2.5 pr-7 font-medium cursor-pointer appearance-none ${PAYMENT_STATUSES[status].badgeClass}`}
                      >
                        {Object.entries(PAYMENT_STATUSES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-60" />
                    </div>
                  </div>

                  {s.paymentStatusUpdatedAt && (
                    <p className="text-[0.7rem] text-navy-300 mt-1">
                      Actualizado {fmtTimestamp24(s.paymentStatusUpdatedAt)}{s.paymentStatusUpdatedBy ? ` · ${s.paymentStatusUpdatedBy}` : ''}
                    </p>
                  )}

                  {historyFor === s.id && (
                    <div className="mt-2 p-3 rounded-md border border-navy-100 bg-navy-50/50 cascade-item text-xs">
                      <p className="font-semibold text-navy-600 mb-2">Historial de pagos</p>
                      {historyList.length === 0 && <p className="text-navy-400">Sin pagos registrados todavía.</p>}
                      {historyList.map((p) => (
                        <div key={p.id} className={`flex items-center justify-between gap-2 py-1 ${p.cancelled ? 'opacity-50' : ''}`}>
                          <span>
                            ${p.amount || 0} · {METHODS[p.method] || p.method} · {fmtTimestamp24(p.at)}
                            {p.registeredByName ? ` · ${p.registeredByName}` : ''}
                            {p.cancelled && <span className="text-stop font-medium"> · CANCELADO ({p.cancelReason})</span>}
                          </span>
                          {!p.cancelled && (
                            <button onClick={() => handleCancelPayment(s, p)} className="link-danger flex items-center gap-1 shrink-0">
                              <Ban size={11} /> Cancelar
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {payingId === s.id && (
                    <form onSubmit={(e) => handleRegisterPayment(e, s)} className="mt-2 p-3 rounded-md border border-navy-100 bg-navy-50/50 cascade-item">
                      <p className="text-xs font-semibold text-navy-600 mb-2">Registrar pago de {s.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="admin-label">Monto</label>
                          <input type="number" min="0" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder="$0.00" className="admin-input h-8 text-xs" />
                        </div>
                        <div>
                          <label className="admin-label">Método</label>
                          <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} className="admin-select h-8 text-xs">
                            {Object.entries(METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="admin-label">Próximo vencimiento</label>
                          <input type="date" value={payForm.nextDueDate} onChange={(e) => setPayForm({ ...payForm, nextDueDate: e.target.value })} className="admin-input h-8 text-xs" />
                        </div>
                        <div>
                          <label className="admin-label">Nota (opcional)</label>
                          <input value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} placeholder="folio, mes que cubre…" className="admin-input h-8 text-xs" />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button type="submit" className="btn-admin-primary h-8 text-xs px-3">
                          <TicketIcon size={13} /> Registrar pago y generar boleto
                        </button>
                        <button type="button" onClick={() => setPayingId(null)} className="btn-admin-ghost h-8 text-xs px-3">Cancelar</button>
                      </div>
                      <p className="text-[0.65rem] text-navy-400 mt-2">
                        Quedará registrado como pagado el {fmtDateTime24(now)}{profile?.name ? ` por ${profile.name}` : ''}.
                      </p>
                    </form>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && <p className="text-center text-sm text-navy-400 py-6">Nadie en este grupo.</p>}
          </div>
        </div>
      )}

      {/* ---------------- consulta secundaria por día ---------------- */}
      <button onClick={() => setShowDayTool(!showDayTool)} className="link-action mb-3">
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
                    <th className="p-2">Alumno</th><th className="p-2">Ruta</th>
                    <th className="p-2 whitespace-nowrap">Tomó ese día</th><th className="p-2">Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {visibleDayRows.map((r, i) => (
                    <tr key={r.studentId} className="cascade-item" style={cascadeStyle(i)}>
                      <td className="p-2"><p className="font-medium">{r.name}</p><p className="text-xs text-navy-400">{r.matricula}</p></td>
                      <td className="p-2 text-navy-500">{r.routeName}</td>
                      <td className="p-2 text-xs whitespace-nowrap">
                        {r.morning && r.afternoon ? 'Ida y vuelta' : r.morning ? 'Solo ida' : 'Solo vuelta'}
                        {(r.adHocMorning || r.adHocAfternoon) && (
                          <span className="block text-signal-amber font-medium mt-0.5">
                            ➕ Agregado al vuelo{r.adHocMorning ? ` (ida, por ${r.adHocMorning})` : ''}{r.adHocAfternoon ? ` (vuelta, por ${r.adHocAfternoon})` : ''}
                          </span>
                        )}
                      </td>
                      <td className="p-2"><span className={PAYMENT_STATUSES[r.paymentStatus].badgeClass}>{PAYMENT_STATUSES[r.paymentStatus].label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleDayRows.length === 0 && <p className="text-center text-sm text-navy-400 py-6">Nadie tomó el servicio ese día con ese filtro (o ya están todos al corriente).</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
