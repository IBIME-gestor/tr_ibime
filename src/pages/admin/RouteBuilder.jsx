import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Plus, ArrowUp, ArrowDown, Trash2, Printer, Truck, Baby, Pencil,
  CalendarDays, Save, RefreshCw, CircleDollarSign, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Students, Routes, Drivers, Schools, PricingConcepts, RouteLists } from '../../firebase/services';
import { TIPOS_SERVICIO, OPCIONES_SERVICIO, WEEKDAYS } from './Students';

const ORDER_FIELD = { morning: 'studentOrderMorning', afternoon: 'studentOrderAfternoon' };

const SERVICE_OPTIONS = [
  { key: 'completo', label: 'Completo — entrada y salida' },
  { key: 'medio', label: 'Media ruta' },
  { key: 'eventual_fijo', label: 'Eventual fijo — días de semana' },
  { key: 'eventual_dia', label: 'Eventual día — fechas específicas' },
];

const emptyAddForm = {
  tipoServicio: 'completo',
  medioServicio: 'entrada',
  diasFijos: [],
  bloqueEntrada: '',
  bloqueSalida: '',
};

function localDateString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function dateRange(start, end, weekdays = [1, 2, 3, 4, 5]) {
  if (!start || !end || start > end) return [];
  const out = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    const jsDay = cursor.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    if (weekdays.includes(isoDay)) out.push(localDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function expectedService(student, date) {
  const tipo = student.tipoServicio || 'completo';
  const d = new Date(`${date}T12:00:00`);
  const weekday = d.getDay() === 0 ? 7 : d.getDay();

  if (tipo === 'completo') return 'ambas';
  if (tipo === 'medio') return student.medioServicio || 'entrada';

  if (tipo === 'eventual_fijo') {
    return student.diasFijos?.find((x) => Number(x.dia) === weekday)?.servicio || null;
  }

  if (tipo === 'eventual_dia') {
    return student.fechasEventuales?.find((x) => x.fecha === date)?.servicio || null;
  }

  return null;
}

function serviceLabel(service) {
  return OPCIONES_SERVICIO[service] || '—';
}

function conceptFor(route, concepts, key) {
  const id = route?.pricingConcepts?.[key];
  return concepts.find((x) => x.id === id && x.active !== false) || null;
}

function buildStudentRow(student, dates, concepts, route) {
  const days = {};
  let dailyTotal = 0;

  dates.forEach((date) => {
    const service = expectedService(student, date);
    days[date] = {
      entrada: service === 'entrada' || service === 'ambas',
      salida: service === 'salida' || service === 'ambas',
      confirmado: false,
    };

    if (service && (student.tipoServicio === 'eventual_fijo' || student.tipoServicio === 'eventual_dia')) {
      const p = conceptFor(route, concepts, 'por_dia');
      dailyTotal += Number(p?.amount || 0);
    }
  });

  let estimatedAmount = 0;
  let conceptId = '';
  let concept = '';

  if (student.tipoServicio === 'completo') {
    const p = conceptFor(route, concepts, 'completo');
    estimatedAmount = Number(p?.amount || student.billingAmount || 0);
    conceptId = p?.id || student.pricingConceptId || '';
    concept = p?.name || student.billingConcept || 'Ruta completa';
  } else if (student.tipoServicio === 'medio') {
    const key = student.medioServicio === 'salida' ? 'medio_salida' : 'medio_entrada';
    const p = conceptFor(route, concepts, key);
    estimatedAmount = Number(p?.amount || student.billingAmount || 0);
    conceptId = p?.id || student.pricingConceptId || '';
    concept = p?.name || student.billingConcept || 'Media ruta';
  } else {
    estimatedAmount = dailyTotal || Number(student.billingAmount || 0);
    const p = conceptFor(route, concepts, 'por_dia');
    conceptId = p?.id || student.pricingConceptId || '';
    concept = p?.name || student.billingConcept || 'Por día';
  }

  return {
    studentId: student.id,
    matricula: student.matricula || '',
    name: student.name || '',
    routeId: student.routeId || '',
    tipoServicio: student.tipoServicio || 'completo',
    medioServicio: student.medioServicio || 'entrada',
    bloqueEntrada: student.bloqueEntrada || '',
    bloqueSalida: student.bloqueSalida || '',
    estimatedAmount,
    pricingConceptId: conceptId,
    concept,
    paid: false,
    paymentId: '',
    days,
  };
}

function priorityCompare(a, b) {
  const bothA = Object.values(a.days || {}).some((d) => d.entrada && d.salida);
  const bothB = Object.values(b.days || {}).some((d) => d.entrada && d.salida);
  if (bothA !== bothB) return bothA ? -1 : 1;

  const beA = String(a.bloqueEntrada || '').localeCompare(String(b.bloqueEntrada || ''), undefined, { numeric: true });
  const beB = String(b.bloqueEntrada || '').localeCompare(String(b.bloqueEntrada || ''), undefined, { numeric: true });
  if (beA !== beB) return beA.localeCompare(beB, undefined, { numeric: true });

  const bsA = String(a.bloqueSalida || '').localeCompare(String(b.bloqueSalida || ''), undefined, { numeric: true });
  const bsB = String(b.bloqueSalida || '').localeCompare(String(b.bloqueSalida || ''), undefined, { numeric: true });
  if (bsA !== bsB) return bsA.localeCompare(bsB, undefined, { numeric: true });

  return String(a.name).localeCompare(String(b.name));
}

export default function RouteBuilder() {
  const { profile, user } = useAuth();
  const [routes, setRoutesState] = useState([]);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [shift, setShift] = useState('morning');
  const [operatorId, setOperatorId] = useState('');
  const [unitId, setUnitId] = useState('');

  const [matricula, setMatricula] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupStudent, setLookupStudent] = useState(null);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const inputRef = useRef(null);

  const [startDate, setStartDate] = useState(localDateString(new Date()));
  const [endDate, setEndDate] = useState(localDateString(new Date()));
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [listId, setListId] = useState('');
  const [lists, setLists] = useState([]);
  const [currentList, setCurrentList] = useState(null);
  const [saving, setSaving] = useState(false);
  const [printMode, setPrintMode] = useState(null);

  useEffect(() => Routes.subscribe(setRoutesState), []);
  useEffect(() => Drivers.subscribe(setDrivers), []);
  useEffect(() => Schools.subscribe(setSchools), []);
  useEffect(() => {
    let active = true;
    PricingConcepts.list().then((rows) => { if (active) setConcepts(rows); }).catch((err) => console.error('Error cargando conceptos:', err));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    Students.list().then(setAllStudents).catch(() => setAllStudents([]));
    RouteLists.list().then(setLists).catch(() => setLists([]));
  }, []);

  useEffect(() => {
    if (!routeId) { setStudents([]); return; }
    Students.listByRoute(routeId).then(setStudents).catch(() => setStudents([]));
  }, [routeId]);

  const route = routes.find((r) => r.id === routeId) || null;
  const driver = drivers.find((d) => d.id === (currentList?.driverId || operatorId || route?.driverId));
  const nanny = drivers.find((d) => d.id === route?.nannyId);

  useEffect(() => {
    if (!currentList) {
      setOperatorId(route?.driverId || '');
      setUnitId(route?.unitId || '');
    }
  }, [routeId, route?.driverId, route?.unitId, currentList]);
  const school = schools.find((s) => s.id === route?.schoolId);
  const orderField = ORDER_FIELD[shift];
  const order = route?.[orderField] || [];

  const dates = useMemo(() => dateRange(startDate, endDate, [1, 2, 3, 4, 5]), [startDate, endDate]);

  const list = useMemo(() => {
    if (!currentList) return [];
    return [...(currentList.rows || [])].sort(priorityCompare);
  }, [currentList]);

  const normalizeLookup = (value) => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s._-]+/g, '');

  const searchResults = useMemo(() => {
    const q = normalizeLookup(matricula);
    if (!q) return [];
    return allStudents.filter((s) => normalizeLookup(s.matricula).includes(q) || normalizeLookup(s.name).includes(q))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(0, 8);
  }, [matricula, allStudents]);

  function schoolName(id) {
    return schools.find((s) => s.id === id)?.name || '—';
  }

  function selectLookupStudent(student) {
    setLookupError('');
    setLookupStudent(student);
    setAddForm({
      tipoServicio: student.tipoServicio || 'completo',
      medioServicio: student.medioServicio || 'entrada',
      diasFijos: student.diasFijos || [],
      bloqueEntrada: student.bloqueEntrada || '',
      bloqueSalida: student.bloqueSalida || '',
    });
  }

  function resetAddFlow() {
    setMatricula('');
    setLookupStudent(null);
    setLookupError('');
    setAddForm(emptyAddForm);
    inputRef.current?.focus();
  }

  async function handleLookup(e) {
    e.preventDefault();
    const key = normalizeLookup(matricula);
    const found = allStudents.find((s) => normalizeLookup(s.matricula) === key)
      || allStudents.find((s) => normalizeLookup(s.name) === key)
      || searchResults[0];
    if (found) selectLookupStudent(found);
    else setLookupError('No encontramos ese alumno en el padrón.');
  }


  function toggleDiaFijo(dia) {
    const exists = addForm.diasFijos.some((d) => Number(d.dia) === dia);
    const diasFijos = exists
      ? addForm.diasFijos.filter((d) => Number(d.dia) !== dia)
      : [...addForm.diasFijos, { dia, servicio: 'ambas' }].sort((a, b) => a.dia - b.dia);
    setAddForm({ ...addForm, diasFijos });
  }

  async function addStudentToRoster() {
    if (!lookupStudent || !route) return;
    const data = {
      routeId: route.id,
      tipoServicio: addForm.tipoServicio,
      medioServicio: addForm.medioServicio,
      diasFijos: addForm.diasFijos,
      bloqueEntrada: addForm.bloqueEntrada.trim(),
      bloqueSalida: addForm.bloqueSalida.trim(),
    };

    const conceptKey = addForm.tipoServicio === 'completo'
      ? 'completo'
      : addForm.tipoServicio === 'medio'
        ? `medio_${addForm.medioServicio}`
        : 'por_dia';
    const concept = conceptFor(route, concepts, conceptKey);

    if (concept) {
      data.billingAmount = Number(concept.amount || 0);
      data.billingConcept = concept.name || '';
      data.billingMode = addForm.tipoServicio === 'completo' || addForm.tipoServicio === 'medio' ? 'mensual' : 'por_evento';
      data.pricingConceptId = concept.id;
    }

    await Students.update(lookupStudent.id, data);
    const refreshed = { ...lookupStudent, ...data };
    setAllStudents((prev) => prev.map((s) => s.id === refreshed.id ? refreshed : s));
    setStudents((prev) => prev.some((s) => s.id === refreshed.id) ? prev.map((s) => s.id === refreshed.id ? refreshed : s) : [...prev, refreshed]);

    const nextOrder = order.includes(lookupStudent.id) ? order : [...order, lookupStudent.id];
    await Routes.update(route.id, { [orderField]: nextOrder });

    // Si ya existe una lista abierta para el mismo periodo, la agregamos de inmediato.
    if (currentList && currentList.routeId === route.id) {
      const row = buildStudentRow(refreshed, currentList.dates || dates, concepts, route);
      const rows = [...(currentList.rows || []).filter((x) => x.studentId !== row.studentId), row].sort(priorityCompare);
      const updated = { ...currentList, rows };
      await RouteLists.update(currentList.id, { rows });
      setCurrentList(updated);
    }
    resetAddFlow();
  }

  async function createList() {
    if (!route || !startDate || !endDate || startDate > endDate || !dates.length) return;
    setSaving(true);
    try {
      const source = students.length ? students : allStudents.filter((s) => s.routeId === route.id);
      const rows = source.map((s) => buildStudentRow(s, dates, concepts, route)).filter((row) => Object.keys(row.days).length);
      rows.sort(priorityCompare);

      const data = {
        routeId: route.id,
        shift,
        driverId: operatorId || route.driverId || '',
        driverName: drivers.find((d) => d.id === (operatorId || route.driverId))?.name || '',
        unitId: route.unitId || '',
        startDate,
        endDate,
        weekdays: [1, 2, 3, 4, 5],
        dates,
        rows,
        status: 'abierta',
        createdByUid: user?.uid || '',
        createdByName: profile?.name || '',
      };
      const id = await RouteLists.create(data);
      const created = { id, ...data };
      setLists((prev) => [created, ...prev]);
      setCurrentList(created);
      setListId(id);
    } finally {
      setSaving(false);
    }
  }

  async function openList(id) {
    const found = lists.find((x) => x.id === id);
    if (!found) return;
    setCurrentList(found);
    setListId(found.id);
    setRouteId(found.routeId || '');
    setShift(found.shift || 'morning');
    setOperatorId(found.driverId || '');
    setUnitId(found.unitId || '');
    setStartDate(found.startDate || startDate);
    setEndDate(found.endDate || endDate);
    setWeekdays([1, 2, 3, 4, 5]);
  }

  async function updateRows(rows) {
    const sorted = [...rows].sort(priorityCompare);
    const updated = { ...currentList, rows: sorted };
    await RouteLists.update(currentList.id, { rows: sorted });
    setCurrentList(updated);
    setLists((prev) => prev.map((x) => x.id === currentList.id ? updated : x));
  }

  async function toggleDay(studentId, date, key) {
    if (!currentList) return;
    const rows = (currentList.rows || []).map((row) => {
      if (row.studentId !== studentId) return row;
      const day = row.days?.[date] || { entrada: false, salida: false, confirmado: false };
      return { ...row, days: { ...row.days, [date]: { ...day, [key]: !day[key] } } };
    });
    await updateRows(rows);
  }

  async function togglePaid(row) {
    if (!currentList || row.paid) return;
    const amount = Number(row.estimatedAmount || 0);
    if (!(amount > 0)) {
      window.alert('Este alumno no tiene una tarifa configurada. Ve a Tarifas y conceptos.');
      return;
    }

    const ok = window.confirm(`Registrar pago de $${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} para ${row.name}? Este movimiento aparecerá en Caja.`);
    if (!ok) return;

    setSaving(true);
    try {
      const student = allStudents.find((s) => s.id === row.studentId);
      const paymentId = await Students.registerPayment(row.studentId, {
        amount,
        method: 'lista',
        note: `${row.concept || 'Servicio'} · lista ${currentList.startDate} al ${currentList.endDate}`,
        nextDueDate: currentList.endDate,
        byName: profile?.name,
        byUid: user?.uid,
        routeId: currentList.routeId,
        unitId: route?.unitId,
        listId: currentList.id,
      });
      const rows = (currentList.rows || []).map((x) => x.studentId === row.studentId ? { ...x, paid: true, paymentId } : x);
      await updateRows(rows);
      if (student) {
        setAllStudents((prev) => prev.map((s) => s.id === student.id ? { ...s, paymentStatus: 'al_corriente', lastPaymentAmount: amount } : s));
      }
    } finally {
      setSaving(false);
    }
  }

  function moveRow(index, dir) {
    if (!currentList) return;
    const rows = [...list];
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    updateRows(rows);
  }

  async function removeRow(row) {
    if (!window.confirm(`¿Quitar a ${row.name} de esta lista? El alumno no se elimina.`)) return;
    await updateRows(list.filter((x) => x.studentId !== row.studentId));
  }

  async function refreshConcepts() {
    try { setConcepts(await PricingConcepts.list()); } catch (err) { console.error(err); }
  }

  function doPrint(mode) {
    setPrintMode(mode);
    setTimeout(() => window.print(), 50);
  }

  useEffect(() => {
    const fn = () => setPrintMode(null);
    window.addEventListener('afterprint', fn);
    return () => window.removeEventListener('afterprint', fn);
  }, []);

  const activeLists = useMemo(
    () => lists.filter((x) => !routeId || x.routeId === routeId),
    [lists, routeId]
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="admin-h1">Formar lista de ruta</h1>
          <p className="text-sm text-navy-400 mt-1">
            La lista se crea por periodo y detecta automáticamente lunes a viernes. El operador se asigna al recorrido, no queda amarrado a una sola ruta.
            Los alumnos con entrada + salida quedan sombreados y arriba como prioridad.
          </p>
        </div>
        <Link to="/admin/tarifas" className="btn-admin-ghost print:hidden">
          <CircleDollarSign size={14} /> Configurar tarifas
        </Link>
      </div>

      <div className="admin-card mb-5 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="admin-label">Ruta</label>
            <select value={routeId} onChange={(e) => { setRouteId(e.target.value); setCurrentList(null); setListId(''); resetAddFlow(); }} className="admin-select">
              <option value="">Selecciona una ruta…</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="admin-label">Turno</label>
            <select value={shift} onChange={(e) => setShift(e.target.value)} className="admin-select">
              <option value="morning">Entrada / ida</option>
              <option value="afternoon">Salida / vuelta</option>
            </select>
          </div>
          <div>
            <label className="admin-label">Operador de este recorrido</label>
            <select value={operatorId || route?.driverId || ''} onChange={(e) => setOperatorId(e.target.value)} className="admin-select">
              <option value="">Sin operador</option>
              {drivers.filter((d) => d.role !== 'nanny').map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-navy-400 mt-1">Puede ser diferente al operador predeterminado de la ruta. El mismo operador puede realizar varias rutas.</p>
          </div>
          <div>
            <label className="admin-label">Desde</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="admin-input" />
          </div>
          <div>
            <label className="admin-label">Hasta</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="admin-input" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-navy-400 mr-1">Días hábiles detectados automáticamente:</span>
          <span className="badge">Lun</span><span className="badge">Mar</span><span className="badge">Mié</span><span className="badge">Jue</span><span className="badge">Vie</span>
          <span className="text-xs text-navy-400 ml-2">{dates.length} día(s) en el periodo</span>
          <button onClick={createList} disabled={!route || !dates.length || saving} className="btn-admin-primary ml-auto">
            <CalendarDays size={14} /> {saving ? 'Generando…' : 'Generar lista del periodo'}
          </button>
        </div>

        {activeLists.length > 0 && (
          <div className="mt-4 pt-4 border-t border-navy-100">
            <label className="admin-label">Abrir una lista ya creada</label>
            <div className="flex gap-2">
              <select value={listId} onChange={(e) => openList(e.target.value)} className="admin-select flex-1">
                <option value="">Selecciona…</option>
                {activeLists.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.startDate} → {x.endDate} · {x.shift === 'morning' ? 'Entrada' : 'Salida'} · {x.rows?.length || 0} alumnos
                  </option>
                ))}
              </select>
              {currentList && <button onClick={refreshConcepts} className="btn-admin-ghost" title="Actualizar tarifas"><RefreshCw size={14} /></button>}
            </div>
          </div>
        )}
      </div>

      {route && (
        <>
          <div className="admin-card mb-5 print:hidden">
            <div className="flex flex-wrap gap-6 text-sm">
              <p><span className="text-navy-400">Plantel:</span> <span className="font-medium">{school?.name || '—'}</span></p>
              <p className="flex items-center gap-1.5"><Truck size={14} className="text-navy-400" /><span className="text-navy-400">Operador:</span> <span className="font-medium">{drivers.find((d) => d.id === (currentList?.driverId || operatorId || route?.driverId))?.name || 'Sin asignar'}</span></p>
              {route.nannyId && <p className="flex items-center gap-1.5"><Baby size={14} className="text-navy-400" /><span className="text-navy-400">Nanny:</span> <span className="font-medium">{nanny?.name || '—'}</span></p>}
            </div>
          </div>

          <form onSubmit={handleLookup} className="admin-card mb-5 print:hidden">
            <p className="font-display font-semibold text-navy-800 mb-1">Agregar / ajustar alumno en la ruta</p>
            <p className="text-xs text-navy-400 mb-3">
              Busca por matrícula o nombre. Al guardar, el sistema asigna la tarifa configurada para esta ruta y servicio.
            </p>
            <div className="flex gap-2">
              <input ref={inputRef} value={matricula} onChange={(e) => { setMatricula(e.target.value); setLookupError(''); }} placeholder="Matrícula o nombre…" className="admin-input flex-1" />
              <button className="btn-admin-primary"><Search size={14} /> Buscar</button>
            </div>

            {matricula.trim() && !lookupStudent && searchResults.length > 0 && (
              <div className="mt-2 border border-navy-100 rounded-lg overflow-hidden bg-white">
                {searchResults.map((s) => (
                  <button type="button" key={s.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selectLookupStudent(s)} className="w-full text-left px-3 py-2.5 hover:bg-navy-50 border-b last:border-b-0 border-navy-100">
                    <span className="block font-medium">{s.name}</span>
                    <span className="block text-xs text-navy-400">{s.matricula} · {schoolName(s.schoolId)}</span>
                  </button>
                ))}
              </div>
            )}
            {lookupError && <p className="text-stop text-sm mt-2">{lookupError}</p>}

            {lookupStudent && (
              <div className="mt-4 p-4 rounded-lg border border-navy-100 bg-navy-50/50">
                <p className="font-medium text-navy-800">{lookupStudent.name}</p>
                <p className="text-xs text-navy-400 mb-3">{lookupStudent.matricula} · {schoolName(lookupStudent.schoolId)}</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="admin-label">Tipo de servicio</label>
                    <select value={addForm.tipoServicio} onChange={(e) => setAddForm({ ...addForm, tipoServicio: e.target.value })} className="admin-select">
                      {SERVICE_OPTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                  </div>
                  {addForm.tipoServicio === 'medio' && (
                    <div>
                      <label className="admin-label">Entrada o salida</label>
                      <select value={addForm.medioServicio} onChange={(e) => setAddForm({ ...addForm, medioServicio: e.target.value })} className="admin-select">
                        <option value="entrada">Solo entrada</option>
                        <option value="salida">Solo salida</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="admin-label">Bloque entrada</label>
                    <input value={addForm.bloqueEntrada} onChange={(e) => setAddForm({ ...addForm, bloqueEntrada: e.target.value })} className="admin-input" placeholder="Ej. 1" />
                  </div>
                  <div>
                    <label className="admin-label">Bloque salida</label>
                    <input value={addForm.bloqueSalida} onChange={(e) => setAddForm({ ...addForm, bloqueSalida: e.target.value })} className="admin-input" placeholder="Ej. 2" />
                  </div>
                </div>

                {addForm.tipoServicio === 'eventual_fijo' && (
                  <div className="mt-3">
                    <label className="admin-label">Días fijos y servicio de cada día</label>
                    <div className="space-y-2">
                      {WEEKDAYS.slice(0, 5).map((d) => {
                        const item = addForm.diasFijos.find((x) => Number(x.dia) === d.value);
                        return (
                          <div key={d.value} className="flex items-center gap-2">
                            <label className="badge cursor-pointer">
                              <input type="checkbox" className="mr-1" checked={!!item} onChange={() => toggleDiaFijo(d.value)} /> {d.label}
                            </label>
                            {item && (
                              <select value={item.servicio || 'ambas'} onChange={(e) => setAddForm({ ...addForm, diasFijos: addForm.diasFijos.map((x) => Number(x.dia) === d.value ? { ...x, servicio: e.target.value } : x) })} className="admin-select h-8 w-40 text-xs">
                                <option value="entrada">Entrada</option>
                                <option value="salida">Salida</option>
                                <option value="ambas">Entrada + Salida</option>
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {addForm.tipoServicio === 'eventual_dia' && (
                  <p className="text-xs text-navy-400 mt-3">
                    Las fechas esporádicas se toman del expediente del alumno. Cada fecha conserva su tipo: Entrada, Salida o Entrada + Salida.
                  </p>
                )}

                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={addStudentToRoster} className="btn-admin-primary"><Plus size={14} /> Guardar alumno en ruta</button>
                  <button type="button" onClick={resetAddFlow} className="btn-admin-ghost">Cancelar</button>
                </div>
              </div>
            )}
          </form>
        </>
      )}

      {currentList && (
        <div className="admin-card p-0 overflow-hidden roster-print">
          <div className="px-4 pt-4 pb-3 border-b border-navy-100">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display font-bold text-lg">{route?.name} · {shift === 'morning' ? 'Entrada' : 'Salida'}</p>
                <p className="text-sm text-navy-500">{currentList.startDate} → {currentList.endDate} · {currentList.dates?.length || 0} días · {list.length} alumnos</p>
                <p className="text-xs text-navy-400 mt-1">Operador del recorrido: <strong>{currentList.driverName || drivers.find((d) => d.id === currentList.driverId)?.name || 'Sin asignar'}</strong></p>
              </div>
              <div className="flex gap-2 print:hidden">
                <button onClick={() => doPrint('admin')} className="btn-admin-ghost"><Printer size={14} /> Imprimir</button>
                <button onClick={() => doPrint('operator')} className="btn-admin-ghost"><Printer size={14} /> Lista operador</button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table-admin min-w-[1250px]">
              <thead>
                <tr>
                  <th className="pl-4 print:hidden">Orden</th>
                  <th>#</th>
                  <th>Alumno</th>
                  <th>Servicio</th>
                  <th>Bloque E</th>
                  <th>Bloque S</th>
                  {currentList.dates?.map((date) => (
                    <th key={date} className="text-center min-w-[82px]">
                      <span className="block font-semibold">{new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short' })}</span>
                      <span className="block text-[10px]">{date.split('-').reverse().join('/')}</span>
                    </th>
                  ))}
                  <th className="text-center">Pago</th>
                  <th className="pr-4 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((row, i) => {
                  const both = Object.values(row.days || {}).some((d) => d.entrada && d.salida);
                  return (
                    <tr key={row.studentId} className={both ? 'bg-signal-yellow/15' : ''}>
                      <td className="pl-4 print:hidden">
                        <div className="flex flex-col">
                          <button onClick={() => moveRow(i, -1)} disabled={i === 0} className="text-navy-400 disabled:opacity-20"><ArrowUp size={13} /></button>
                          <button onClick={() => moveRow(i, 1)} disabled={i === list.length - 1} className="text-navy-400 disabled:opacity-20"><ArrowDown size={13} /></button>
                        </div>
                      </td>
                      <td className="font-medium">{i + 1}</td>
                      <td>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-navy-400">{row.matricula}</p>
                        {both && <span className="badge-amber mt-1">Entrada + salida</span>}
                      </td>
                      <td className="text-xs">{row.tipoServicio === 'medio' ? `Media · ${serviceLabel(row.medioServicio)}` : TIPOS_SERVICIO[row.tipoServicio] || row.tipoServicio}</td>
                      <td className="text-xs">{row.bloqueEntrada || '—'}</td>
                      <td className="text-xs">{row.bloqueSalida || '—'}</td>
                      {currentList.dates?.map((date) => {
                        const day = row.days?.[date] || {};
                        return (
                          <td key={date} className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <label title="Entrada" className={`text-xs ${day.entrada ? 'text-go font-bold' : 'text-navy-300'}`}>
                                E
                                <input type="checkbox" checked={!!day.entrada} onChange={() => toggleDay(row.studentId, date, 'entrada')} className="ml-1 w-4 h-4 align-middle" />
                              </label>
                              <label title="Salida" className={`text-xs ${day.salida ? 'text-navy-700 font-bold' : 'text-navy-300'}`}>
                                S
                                <input type="checkbox" checked={!!day.salida} onChange={() => toggleDay(row.studentId, date, 'salida')} className="ml-1 w-4 h-4 align-middle" />
                              </label>
                            </div>
                          </td>
                        );
                      })}
                      <td className="text-center">
                        <label title={row.paid ? 'Pago registrado en Caja' : `Registrar $${row.estimatedAmount || 0}`}>
                          <input type="checkbox" checked={!!row.paid} onChange={() => togglePaid(row)} disabled={!!row.paid || saving} className="w-5 h-5" />
                        </label>
                        <span className="block text-[10px] text-navy-400">${Number(row.estimatedAmount || 0).toLocaleString('es-MX')}</span>
                      </td>
                      <td className="pr-4 print:hidden">
                        <button onClick={() => removeRow(row)} className="link-danger"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-navy-100 bg-navy-50/50 flex flex-wrap gap-5 text-sm">
            <span><strong>{list.length}</strong> alumnos</span>
            <span>Estimado: <strong>${list.reduce((s, x) => s + Number(x.estimatedAmount || 0), 0).toLocaleString('es-MX')}</strong></span>
            <span>Pagado: <strong className="text-go">${list.filter((x) => x.paid).reduce((s, x) => s + Number(x.estimatedAmount || 0), 0).toLocaleString('es-MX')}</strong></span>
            <span>Prioridad E+S: <strong>{list.filter((x) => Object.values(x.days || {}).some((d) => d.entrada && d.salida)).length}</strong></span>
          </div>
        </div>
      )}

      {!currentList && (
        <div className="admin-card text-sm text-navy-400">
          Selecciona una ruta, captura el periodo y genera la lista. Las columnas se crean automáticamente para todos los lunes a viernes que caigan dentro del periodo.
        </div>
      )}
    </div>
  );
}
