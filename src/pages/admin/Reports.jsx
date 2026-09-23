import { useEffect, useMemo, useState } from 'react';
import { Download, TrendingUp, Users, Truck, Route as RouteIcon, CircleDollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Routes, Units, Students, RouteLists } from '../../firebase/services';
import { listTripsBetween, getTripStopsOnce } from '../../firebase/trips';
import { cascadeStyle } from '../../utils/cascade';

function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + amount);
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const [routes, setRoutes] = useState([]);
  const [units, setUnits] = useState([]);
  const [students, setStudents] = useState([]);
  const [lists, setLists] = useState([]);
  const [startDate, setStartDate] = useState(addDays(today(), -30));
  const [endDate, setEndDate] = useState(today());
  const [trips, setTrips] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unitFilter, setUnitFilter] = useState('');

  useEffect(() => Routes.subscribe(setRoutes), []);
  useEffect(() => Units.subscribe(setUnits), []);
  useEffect(() => Students.subscribe(setStudents), []);
  useEffect(() => {
    let active = true;
    RouteLists.list().then((rows) => { if (active) setLists(rows); }).catch((err) => { console.error('Error cargando listas:', err); if (active) setLists([]); });
    return () => { active = false; };
  }, []);

  async function load() {
    if (!startDate || !endDate || startDate > endDate) return;
    setLoading(true);
    try {
      const [tripRows, paymentRows] = await Promise.all([
        listTripsBetween(startDate, endDate),
        Students.listPaymentsBetween(new Date(`${startDate}T00:00:00`), new Date(`${endDate}T23:59:59`)),
      ]);
      setTrips(tripRows);
      setPayments(paymentRows.filter((p) => !p.cancelled));

      // Los stops se consultan para ocupación real. Si hay muchos recorridos,
      // se hace en paralelo para que el reporte siga siendo razonablemente rápido.
      const enriched = [];
      for (const trip of tripRows) {
        const stops = await getTripStopsOnce(trip.id);
        enriched.push({ ...trip, _stops: stops });
      }
      setTrips(enriched);
    } catch (error) {
      console.error(error);
      setTrips([]);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const routeById = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);
  const unitById = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u])), [units]);
  const studentById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const rows = useMemo(() => {
    return units
      .filter((u) => !unitFilter || u.id === unitFilter)
      .map((unit) => {
        const unitRoutes = routes.filter((r) => r.unitId === unit.id);
        const routeIds = new Set(unitRoutes.map((r) => r.id));
        const unitTrips = trips.filter((t) => routeIds.has(t.routeId) || t.unitId === unit.id);

        const km = unitTrips.reduce((sum, t) => {
          if (t.kmInicial == null || t.kmFinal == null) return sum;
          return sum + Math.max(0, Number(t.kmFinal) - Number(t.kmInicial));
        }, 0);

        const tripCount = unitTrips.length;
        const fixed = tripCount * Number(unit.fixedTripCost || 0);
        const kmCost = km * Number(unit.costPerKm || 0);
        const estimatedCost = fixed + kmCost;

        const unitPayments = payments.filter((p) => {
          if (p.unitId) return p.unitId === unit.id;
          const student = studentById[p.studentId];
          return student && routeIds.has(student.routeId);
        });
        const collected = unitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        const unitLists = lists.filter((l) => {
          if (!routeIds.has(l.routeId)) return false;
          return l.startDate <= endDate && l.endDate >= startDate;
        });
        const estimatedRevenue = unitLists.reduce(
          (sum, l) => sum + (l.rows || []).reduce((a, r) => a + Number(r.estimatedAmount || 0), 0),
          0
        );

        const served = new Set();
        unitTrips.forEach((t) => (t._stops || []).forEach((s) => {
          if (s.status === 'boarded' || s.status === 'delivered') served.add(s.studentId);
        }));

        const capacity = Number(unit.capacity || 0);
        const possibleSeats = capacity * Math.max(1, tripCount);
        const occupancy = possibleSeats ? (served.size / possibleSeats) * 100 : 0;
        const balance = collected - estimatedCost;
        const margin = collected ? (balance / collected) * 100 : 0;

        return {
          id: unit.id,
          plate: unit.plate,
          model: unit.model,
          capacity,
          routes: unitRoutes.map((r) => r.name).join(', ') || 'Sin ruta',
          tripCount,
          km,
          served: served.size,
          occupancy,
          estimatedRevenue,
          collected,
          estimatedCost,
          balance,
          margin,
        };
      });
  }, [units, routes, trips, payments, lists, studentById, unitFilter, startDate, endDate]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    units: a.units + 1,
    trips: a.trips + r.tripCount,
    km: a.km + r.km,
    served: a.served + r.served,
    estimatedRevenue: a.estimatedRevenue + r.estimatedRevenue,
    collected: a.collected + r.collected,
    cost: a.cost + r.estimatedCost,
    balance: a.balance + r.balance,
  }), {
    units: 0, trips: 0, km: 0, served: 0, estimatedRevenue: 0, collected: 0, cost: 0, balance: 0,
  }), [rows]);

  const collectionRate = totals.estimatedRevenue ? (totals.collected / totals.estimatedRevenue) * 100 : 0;
  const overallMargin = totals.collected ? (totals.balance / totals.collected) * 100 : 0;

  function exportExcel() {
    const data = rows.map((r) => ({
      Unidad: r.plate,
      Modelo: r.model || '',
      Rutas: r.routes,
      Recorridos: r.tripCount,
      Kilometros: Number(r.km.toFixed(1)),
      'Alumnos atendidos': r.served,
      'Ocupacion %': Number(r.occupancy.toFixed(1)),
      'Ingreso estimado': Number(r.estimatedRevenue.toFixed(2)),
      'Cobrado': Number(r.collected.toFixed(2)),
      'Costo estimado': Number(r.estimatedCost.toFixed(2)),
      'Balance': Number(r.balance.toFixed(2)),
      'Margen %': Number(r.margin.toFixed(1)),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI unidades');
    XLSX.writeFile(wb, `kpi_unidades_${startDate}_${endDate}.xlsx`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="admin-h1">Reportes y KPI</h1>
          <p className="text-sm text-navy-400 mt-1">
            Periodo {startDate} → {endDate}. El balance usa cobros registrados menos costo operativo estimado de las unidades.
          </p>
        </div>
        <button onClick={exportExcel} className="btn-admin-ghost" disabled={!rows.length}>
          <Download size={14} /> Exportar KPI a Excel
        </button>
      </div>

      <div className="admin-card mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="admin-label">Desde</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="admin-input" />
          </div>
          <div>
            <label className="admin-label">Hasta</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="admin-input" />
          </div>
          <div>
            <label className="admin-label">Unidad</label>
            <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="admin-select min-w-[180px]">
              <option value="">Todas</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.plate} {u.model ? `— ${u.model}` : ''}</option>)}
            </select>
          </div>
          <button onClick={load} disabled={loading || !startDate || !endDate || startDate > endDate} className="btn-admin-primary">
            {loading ? 'Calculando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { icon: Truck, label: 'Unidades', value: totals.units },
          { icon: RouteIcon, label: 'Recorridos', value: totals.trips },
          { icon: TrendingUp, label: 'Kilómetros', value: totals.km.toFixed(1) },
          { icon: Users, label: 'Alumnos atendidos', value: totals.served },
          { icon: CircleDollarSign, label: 'Ingreso estimado', value: fmtMoney(totals.estimatedRevenue) },
          { icon: CircleDollarSign, label: 'Cobrado', value: fmtMoney(totals.collected) },
          { icon: CircleDollarSign, label: 'Costo estimado', value: fmtMoney(totals.cost) },
          { icon: CircleDollarSign, label: 'Balance', value: fmtMoney(totals.balance) },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="admin-card cascade-item" style={cascadeStyle(i, 35)}>
              <Icon size={15} className="text-navy-400 mb-2" />
              <p className="text-xl font-display font-bold tabular-nums">{k.value}</p>
              <p className="text-xs text-navy-400 mt-1">{k.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="admin-card">
          <p className="text-xs text-navy-400">Tasa de cobranza del periodo</p>
          <p className="text-2xl font-display font-bold">{collectionRate.toFixed(1)}%</p>
          <p className="text-xs text-navy-400 mt-1">Cobrado / ingreso estimado de listas</p>
        </div>
        <div className="admin-card">
          <p className="text-xs text-navy-400">Margen operativo sobre cobrado</p>
          <p className="text-2xl font-display font-bold">{overallMargin.toFixed(1)}%</p>
          <p className="text-xs text-navy-400 mt-1">Balance / cobrado</p>
        </div>
        <div className="admin-card">
          <p className="text-xs text-navy-400">Costo por km</p>
          <p className="text-2xl font-display font-bold">{totals.km ? fmtMoney(totals.cost / totals.km) : '—'}</p>
          <p className="text-xs text-navy-400 mt-1">Incluye costo/km + fijo por recorrido</p>
        </div>
      </div>

      <div className="admin-card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-100">
          <p className="font-display font-semibold">Balance por unidad</p>
          <p className="text-xs text-navy-400 mt-1">
            La ocupación se calcula como alumnos distintos atendidos / asientos disponibles de los recorridos.
            Si no capturas costos en Unidades, el costo y la rentabilidad quedan subestimados.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="table-admin min-w-[1100px]">
            <thead>
              <tr>
                <th className="pl-5">Unidad</th>
                <th>Rutas</th>
                <th>Recorridos</th>
                <th>Km</th>
                <th>Atendidos</th>
                <th>Ocupación</th>
                <th>Estimado</th>
                <th>Cobrado</th>
                <th>Costo</th>
                <th>Balance</th>
                <th className="pr-5">Margen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="cascade-item" style={cascadeStyle(i, 25)}>
                  <td className="pl-5 font-medium">{r.plate}<span className="block text-xs text-navy-400">{r.model || ''}</span></td>
                  <td className="text-xs max-w-[220px]">{r.routes}</td>
                  <td>{r.tripCount}</td>
                  <td>{r.km.toFixed(1)}</td>
                  <td>{r.served}</td>
                  <td>{r.occupancy.toFixed(1)}%</td>
                  <td>{fmtMoney(r.estimatedRevenue)}</td>
                  <td className="text-go font-semibold">{fmtMoney(r.collected)}</td>
                  <td>{fmtMoney(r.estimatedCost)}</td>
                  <td className="font-semibold">{fmtMoney(r.balance)}</td>
                  <td className="pr-5">{r.margin.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-center text-sm text-navy-400 py-8">No hay unidades para el filtro seleccionado.</p>}
        </div>
      </div>
    </div>
  );
}
