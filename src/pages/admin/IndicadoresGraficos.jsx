import { useEffect, useMemo, useState } from 'react';
import { Printer, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Routes, Units, Schools, Students, FinanceRecords, UnitFuelLogs, UnitMaintenance } from '../../firebase/services';
import { listTripsBetween } from '../../firebase/trips';
import { cascadeStyle } from '../../utils/cascade';
import { Donut, Bars, GroupedBars, HBars, Lines } from '../../components/kpi/Charts';
import {
  normalizeRecords, groupBy, monthlySeries, agingBuckets, topDebtors, monthsBetween, prevMonth,
  monthStart, monthEnd, ymLabel, money, moneyShort, delta,
} from '../../utils/financeStats';

/* ------------------------------------------------------------------ */
/*  Indicadores gráficos para Dirección: ingresos, cartera, comparativos */
/* ------------------------------------------------------------------ */
function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const tsMonth = (ts) => {
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  if (!ms) return '';
  const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 7);
};
const METHOD_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', cometa: 'Banco (Cometa)', lista: 'Desde lista', deposito: 'Depósito' };
const METHOD_COLORS = ['#12405f', '#1E9E96', '#E0714A', '#7C6FE0', '#8C9A2E', '#C4548C'];

function Delta({ value, upIsGood = true }) {
  if (value == null) return <span className="text-[11px] text-navy-300">sin comparativo</span>;
  if (Math.abs(value) < 0.005) return <span className="text-[11px] text-navy-400 flex items-center gap-0.5"><Minus size={12} /> igual que el mes anterior</span>;
  const up = value > 0;
  const good = up === upIsGood;
  return (
    <span className="text-[11px] font-bold flex items-center gap-0.5" style={{ color: good ? '#16a34a' : '#dc2626' }}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(Math.round(value * 100))}% vs mes anterior
    </span>
  );
}

function Tile({ label, value, sub, children, index = 0, tone }) {
  return (
    <div className="cascade-item admin-card !p-4" style={cascadeStyle(index, 50, 450)}>
      <p className="text-[11px] font-semibold text-navy-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: tone || '#12405f' }}>{value}</p>
      {sub && <p className="text-[11px] text-navy-400 mt-0.5">{sub}</p>}
      {children}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <div className="pt-2">
        <h2 className="text-base font-bold text-navy-900">{title}</h2>
        {subtitle && <p className="text-xs text-navy-400">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Card({ title, hint, children, index = 0, wide }) {
  return (
    <div className={`cascade-item admin-card !p-4 break-inside-avoid ${wide ? 'xl:col-span-2' : ''}`} style={cascadeStyle(index, 60, 500)}>
      <h3 className="text-sm font-bold text-navy-800">{title}</h3>
      {hint && <p className="text-[11px] text-navy-400 mb-2">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </div>
  );
}

export default function IndicadoresGraficos() {
  const nowYm = today().slice(0, 7);
  const [fromYm, setFromYm] = useState(addMonths(nowYm, -5));
  const [toYm, setToYm] = useState(nowYm);
  const [schoolId, setSchoolId] = useState('');
  const [records, setRecords] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [units, setUnits] = useState([]);
  const [students, setStudents] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [trips, setTrips] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => Schools.subscribe(setSchools), []);
  useEffect(() => Routes.subscribe(setRoutes), []);
  useEffect(() => Units.subscribe(setUnits), []);
  useEffect(() => Students.subscribe(setStudents), []);
  useEffect(() => UnitFuelLogs.subscribe(setFuelLogs), []);
  useEffect(() => UnitMaintenance.subscribe(setMaintenance), []);
  useEffect(() => {
    let active = true;
    FinanceRecords.list().then((rows) => { if (active) setRecords(rows); }).catch((e) => { console.error(e); if (active) setRecords([]); });
    return () => { active = false; };
  }, []);

  // Recorridos y pagos del rango (por fecha)
  useEffect(() => {
    if (fromYm > toYm) return undefined;
    let active = true;
    setLoading(true);
    Promise.all([
      listTripsBetween(monthStart(fromYm), monthEnd(toYm)).catch((e) => { console.error(e); return []; }),
      Students.listPaymentsBetween(new Date(`${monthStart(fromYm)}T00:00:00`), new Date(`${monthEnd(toYm)}T23:59:59`)).catch((e) => { console.error(e); return []; }),
    ]).then(([t, p]) => { if (active) { setTrips(t); setPayments(p.filter((x) => !x.cancelled)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fromYm, toYm]);

  const months = useMemo(() => (fromYm <= toYm ? monthsBetween(fromYm, toYm) : []), [fromYm, toYm]);
  const schoolsById = useMemo(() => new Map(schools.map((s) => [s.id, s])), [schools]);
  const unitsById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const routesById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const schoolName = (id, fallback) => schoolsById.get(id)?.name || fallback || 'Sin plantel';

  const normAll = useMemo(() => normalizeRecords(records, today()), [records]);
  const normSchool = useMemo(() => normAll.filter((r) => !schoolId || r.schoolId === schoolId), [normAll, schoolId]);
  const rows = useMemo(() => normSchool.filter((r) => r.ym >= fromYm && r.ym <= toYm), [normSchool, fromYm, toYm]);

  const monthly = useMemo(() => monthlySeries(rows, months), [rows, months]);
  const focus = useMemo(() => monthlySeries(normSchool, [prevMonth(toYm), toYm]), [normSchool, toYm]);
  const cur = focus[1], prev = focus[0];

  const totals = useMemo(() => rows.reduce((a, r) => ({
    billed: a.billed + r.amount, paid: a.paid + r.paid, pending: a.pending + r.pending,
    mora: a.mora + (r.status === 'mora' ? r.pending : 0), vigente: a.vigente + (r.status === 'vigente' ? r.pending : 0),
  }), { billed: 0, paid: 0, pending: 0, mora: 0, vigente: 0 }), [rows]);

  const aging = useMemo(() => agingBuckets(rows), [rows]);
  const debtors = useMemo(() => topDebtors(rows, 10), [rows]);
  const bySchool = useMemo(() => groupBy(rows, (r) => r.schoolId || r.schoolName, (k) => k).map((g) => ({ ...g, label: schoolName(g.key, rows.find((r) => (r.schoolId || r.schoolName) === g.key)?.schoolName) })).sort((a, b) => b.billed - a.billed), [rows, schoolsById]); // eslint-disable-line react-hooks/exhaustive-deps
  const byLevel = useMemo(() => groupBy(rows, (r) => r.nivel || 'Sin nivel').sort((a, b) => b.billed - a.billed), [rows]);
  const byRoute = useMemo(() => groupBy(rows, (r) => r.routeId || 'sin', (k) => routesById.get(k)?.name || 'Sin ruta').map((g) => ({ ...g, label: routesById.get(g.key)?.name || 'Sin ruta' })), [rows, routesById]);

  // Alumnos con servicio por mes y por plantel
  const studentsByMonth = monthly.map((m) => ({ label: m.label, value: m.students }));
  const studentsBySchool = bySchool.map((g) => ({ label: g.label, value: g.students }));

  // Pagos recibidos (por fecha real de pago) y forma de pago
  const cash = useMemo(() => {
    const byMonth = new Map(); const byMethod = new Map();
    payments.forEach((p) => {
      const ym = tsMonth(p.at);
      const amt = Number(p.amount || 0);
      if (ym) byMonth.set(ym, (byMonth.get(ym) || 0) + amt);
      const m = p.method || 'efectivo';
      byMethod.set(m, (byMethod.get(m) || 0) + amt);
    });
    return {
      monthly: months.map((ym) => ({ label: ymLabel(ym), value: Math.round(byMonth.get(ym) || 0) })),
      methods: [...byMethod.entries()].map(([k, v], i) => ({ label: METHOD_LABEL[k] || k, value: Math.round(v), color: METHOD_COLORS[i % METHOD_COLORS.length] })).sort((a, b) => b.value - a.value),
    };
  }, [payments, months]);

  // Operación
  const ops = useMemo(() => {
    const g = new Map(months.map((ym) => [ym, { trips: 0, km: 0, served: 0 }]));
    trips.forEach((t) => {
      const ym = String(t.date || '').slice(0, 7);
      const x = g.get(ym); if (!x) return;
      x.trips += 1;
      if (!t.kmShared && t.kmInicial != null && t.kmFinal != null) x.km += Math.max(0, Number(t.kmFinal) - Number(t.kmInicial));
      x.served += Number(t.studentsResolved || 0);
    });
    return months.map((ym) => ({ label: ymLabel(ym), ...g.get(ym) }));
  }, [trips, months]);

  // Costos reales (gasolina + mantenimiento)
  const costs = useMemo(() => {
    const inRange = (x) => x.date >= monthStart(fromYm) && x.date <= monthEnd(toYm);
    const fuel = fuelLogs.filter(inRange); const maint = maintenance.filter(inRange);
    const byM = new Map(months.map((ym) => [ym, { fuel: 0, maint: 0 }]));
    fuel.forEach((l) => { const x = byM.get(String(l.date).slice(0, 7)); if (x) x.fuel += Number(l.amount || 0); });
    maint.forEach((l) => { const x = byM.get(String(l.date).slice(0, 7)); if (x) x.maint += Number(l.amount || 0); });
    const monthlyCost = months.map((ym) => ({ label: ymLabel(ym), values: [Math.round(byM.get(ym).fuel), Math.round(byM.get(ym).maint)] }));
    const perUnit = units.map((u) => {
      const cost = fuel.filter((l) => l.unitId === u.id).reduce((n, l) => n + Number(l.amount || 0), 0)
        + maint.filter((l) => l.unitId === u.id).reduce((n, l) => n + Number(l.amount || 0), 0);
      const income = rows.filter((r) => r.unitId === u.id).reduce((n, r) => n + r.paid, 0);
      return { label: u.plate || u.id, values: [Math.round(income), Math.round(cost)] };
    }).filter((x) => x.values[0] > 0 || x.values[1] > 0);
    const total = [...fuel, ...maint].reduce((n, l) => n + Number(l.amount || 0), 0);
    return { monthlyCost, perUnit, total };
  }, [fuelLogs, maintenance, months, units, rows, fromYm, toYm]);

  const moneyFmt = (v) => moneyShort(v);
  const rangeLabel = months.length ? `${ymLabel(months[0])} → ${ymLabel(months[months.length - 1])}` : '';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-h1">Indicadores gráficos</h1>
          <p className="text-sm text-navy-400 mt-1">Vista para Dirección: ingresos, cartera por cobrar, comparativos y operación. Periodo {rangeLabel}.</p>
        </div>
        <button type="button" className="btn-admin-ghost print:hidden" onClick={() => window.print()}><Printer size={14} /> Imprimir / guardar PDF</button>
      </div>

      <div className="admin-card !p-3 flex flex-wrap items-end gap-3 print:hidden">
        <div><label className="admin-label">Desde (mes)</label><input type="month" className="admin-input" value={fromYm} max={toYm} onChange={(e) => e.target.value && setFromYm(e.target.value)} /></div>
        <div><label className="admin-label">Hasta (mes)</label><input type="month" className="admin-input" value={toYm} min={fromYm} onChange={(e) => e.target.value && setToYm(e.target.value)} /></div>
        <div>
          <label className="admin-label">Plantel</label>
          <select className="admin-select" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">Todos</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-navy-400 max-w-sm">Los costos y recorridos incluyen todas las unidades; el filtro de plantel aplica a ingresos, cartera y alumnos.</p>
      </div>

      {loading && <p className="text-sm text-navy-400">Cargando recorridos y pagos…</p>}
      {fromYm > toYm && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">El mes inicial no puede ser posterior al final.</p>}

      {/* Resumen del mes en foco */}
      <div>
        <p className="text-xs text-navy-400 mb-2">Mes en foco: <b>{ymLabel(toYm)}</b> (comparado contra {ymLabel(prevMonth(toYm))}). Las tarjetas de cartera suman todo el periodo.</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile index={0} label="Facturado del mes" value={money(cur?.billed)}><Delta value={delta(cur?.billed, prev?.billed)} /></Tile>
          <Tile index={1} label="Cobrado del mes" value={money(cur?.paid)} tone="#16a34a"><Delta value={delta(cur?.paid, prev?.paid)} /></Tile>
          <Tile index={2} label="% de cobranza del mes" value={pct(cur?.rate)}><Delta value={cur?.rate != null && prev?.rate != null ? delta(cur.rate, prev.rate) : null} /></Tile>
          <Tile index={3} label="Alumnos con servicio" value={(cur?.students || 0).toLocaleString('es-MX')}><Delta value={delta(cur?.students, prev?.students)} /></Tile>
          <Tile index={4} label="Por cobrar (periodo)" value={money(totals.pending)} tone="#E0714A" sub={`${money(totals.vigente)} vigente`} />
          <Tile index={5} label="En mora (periodo)" value={money(totals.mora)} tone={totals.mora ? '#dc2626' : '#16a34a'} sub="pagos vencidos" />
        </div>
      </div>

      <Section title="Ingresos" subtitle="Lo facturado contra lo que realmente se ha cobrado, mes con mes">
        <Card index={0} title="Facturado vs. cobrado por mes" hint="Facturado = lo que se debía cobrar por el periodo de servicio">
          <GroupedBars data={monthly.map((m) => ({ label: m.label, values: [Math.round(m.billed), Math.round(m.paid)] }))} series={[{ name: 'Facturado', color: '#12405f' }, { name: 'Cobrado', color: '#16a34a' }]} format={moneyFmt} />
        </Card>
        <Card index={1} title="% de cobranza por mes" hint="Cobrado entre facturado">
          <Lines labels={monthly.map((m) => m.label)} series={[{ name: '% cobranza', color: '#1E9E96', values: monthly.map((m) => (m.rate == null ? null : Math.round(m.rate * 100))) }]} format={(v) => `${v}%`} yMax={100} />
        </Card>
        <Card index={2} title="Dinero recibido por mes" hint="Por fecha en que entró el pago (incluye pagos de periodos anteriores)">
          <Bars data={cash.monthly} color="#1E9E96" format={moneyFmt} />
        </Card>
        <Card index={3} title="Forma de pago" hint="Cómo pagan los padres en el periodo">
          {cash.methods.length ? <Donut data={cash.methods} centerTop={moneyShort(cash.methods.reduce((n, m) => n + m.value, 0))} centerBottom="recibido" format={moneyFmt} /> : <p className="text-xs text-navy-400">Sin pagos en el periodo.</p>}
        </Card>
      </Section>

      <Section title="Faltantes de pago" subtitle="Cartera por cobrar y qué tan vencida está">
        <Card index={0} title="Estado de la cartera" hint="De todo lo facturado en el periodo">
          <Donut
            data={[{ label: 'Cobrado', value: Math.round(totals.paid), color: '#16a34a' }, { label: 'Por cobrar vigente', value: Math.round(totals.vigente), color: '#2E86D6' }, { label: 'En mora', value: Math.round(totals.mora), color: '#dc2626' }]}
            centerTop={pct(totals.billed ? totals.paid / totals.billed : null)} centerBottom="cobrado" format={moneyFmt}
          />
        </Card>
        <Card index={1} title="Antigüedad del adeudo" hint="Cuánto lleva vencido lo que falta por cobrar">
          <HBars data={aging.map((a) => ({ label: a.label, value: Math.round(a.value), color: a.color }))} format={moneyFmt} />
        </Card>
        <Card index={2} title="Adeudo por plantel" hint="Lo que falta por cobrar, de mayor a menor">
          <HBars data={[...bySchool].filter((g) => g.pending > 0).sort((a, b) => b.pending - a.pending).slice(0, 10).map((g) => ({ label: g.label, value: Math.round(g.pending), note: `${g.students} alumnos` }))} color="#E0714A" format={moneyFmt} />
        </Card>
        <Card index={3} title="Adeudo por ruta (las 10 mayores)">
          <HBars data={[...byRoute].filter((g) => g.pending > 0).sort((a, b) => b.pending - a.pending).slice(0, 10).map((g) => ({ label: g.label, value: Math.round(g.pending), note: `${g.students} alumnos` }))} color="#C4548C" format={moneyFmt} />
        </Card>
        <Card index={4} wide title="Los 10 alumnos con mayor adeudo" hint="Para dar seguimiento de cobranza">
          {debtors.length === 0 ? <p className="text-xs text-navy-400">Sin adeudos en el periodo.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-navy-400 border-b border-navy-100">
                  <th className="py-1.5 pr-3">Alumno</th><th className="py-1.5 pr-3">Plantel</th><th className="py-1.5 pr-3 text-right">Meses</th><th className="py-1.5 pr-3 text-right">Días de atraso</th><th className="py-1.5 text-right">Adeudo</th>
                </tr></thead>
                <tbody>
                  {debtors.map((d) => (
                    <tr key={d.studentId} className="border-b border-navy-50">
                      <td className="py-1.5 pr-3 font-medium text-navy-800">{d.name || '—'}</td>
                      <td className="py-1.5 pr-3 text-navy-500">{d.school || '—'}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{d.months}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums" style={{ color: d.maxOverdue > 30 ? '#dc2626' : undefined }}>{d.maxOverdue || '—'}</td>
                      <td className="py-1.5 text-right tabular-nums font-bold">{money(d.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>

      <Section title="Comparativos por plantel y nivel" subtitle="Dónde se cobra mejor y dónde se concentra el ingreso">
        <Card index={0} wide title="Facturado vs. cobrado por plantel">
          <GroupedBars data={bySchool.slice(0, 12).map((g) => ({ label: g.label.length > 14 ? `${g.label.slice(0, 13)}…` : g.label, values: [Math.round(g.billed), Math.round(g.paid)] }))} series={[{ name: 'Facturado', color: '#12405f' }, { name: 'Cobrado', color: '#16a34a' }]} format={moneyFmt} />
        </Card>
        <Card index={1} title="% de cobranza por plantel" hint="Más alto es mejor">
          <HBars max={100} data={[...bySchool].filter((g) => g.rate != null).sort((a, b) => b.rate - a.rate).map((g) => ({ label: g.label, value: Math.round(g.rate * 100), color: g.rate >= 0.85 ? '#16a34a' : g.rate >= 0.65 ? '#f59e0b' : '#dc2626' }))} format={(v) => `${v}%`} />
        </Card>
        <Card index={2} title="Ingreso facturado por nivel académico">
          <Donut data={byLevel.map((g, i) => ({ label: g.label, value: Math.round(g.billed) }))} centerTop={moneyShort(totals.billed)} centerBottom="facturado" format={moneyFmt} />
        </Card>
        <Card index={3} wide title="% de cobranza por nivel académico">
          <HBars max={100} data={byLevel.filter((g) => g.rate != null).map((g) => ({ label: g.label, value: Math.round(g.rate * 100), note: `${g.students} alumnos`, color: g.rate >= 0.85 ? '#16a34a' : g.rate >= 0.65 ? '#f59e0b' : '#dc2626' }))} format={(v) => `${v}%`} />
        </Card>
      </Section>

      <Section title="Alumnos" subtitle="Crecimiento del servicio">
        <Card index={0} title="Alumnos con servicio por mes" hint="Alumnos con al menos un cargo en el mes">
          <Bars data={studentsByMonth} color="#7C6FE0" />
        </Card>
        <Card index={1} title="Alumnos por plantel" hint="Del periodo seleccionado">
          <Donut data={studentsBySchool.map((x) => ({ ...x }))} centerTop={(students.length || 0).toLocaleString('es-MX')} centerBottom="en padrón" />
        </Card>
      </Section>

      <Section title="Operación y costos" subtitle="Recorridos, kilómetros y lo que cuesta operar las unidades (gasolina + mantenimiento)">
        <Card index={0} title="Recorridos por mes">
          <Bars data={ops.map((o) => ({ label: o.label, value: o.trips }))} color="#12405f" />
        </Card>
        <Card index={1} title="Kilómetros recorridos por mes">
          <Bars data={ops.map((o) => ({ label: o.label, value: Math.round(o.km) }))} color="#1E9E96" unit=" km" />
        </Card>
        <Card index={2} title="Gasto de gasolina vs. mantenimiento" hint={`Total del periodo: ${money(costs.total)}`}>
          <GroupedBars data={costs.monthlyCost} series={[{ name: 'Gasolina', color: '#E0714A' }, { name: 'Mantenimiento', color: '#7C6FE0' }]} format={moneyFmt} />
        </Card>
        <Card index={3} title="Ingreso cobrado vs. gasto por unidad" hint="Ingreso de las rutas de cada unidad contra su gasolina y mantenimiento">
          <GroupedBars data={costs.perUnit} series={[{ name: 'Ingreso cobrado', color: '#16a34a' }, { name: 'Gasto real', color: '#dc2626' }]} format={moneyFmt} />
        </Card>
      </Section>
    </div>
  );
}
