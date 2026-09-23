import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, ArrowUp, ArrowDown, Trash2, Printer, Pencil, Save, X, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Students, Routes, Schools, Drivers, PricingConcepts, RouteLists, FinanceRecords } from '../../firebase/services';

const SERVICE_OPTIONS = [
  { key: 'completo', label: 'Completo — entrada y salida' },
  { key: 'medio', label: 'Medio — entrada o salida' },
  { key: 'diario', label: 'Diario — fechas específicas' },
];

const DAY_META = [
  { value: 1, short: 'L', name: 'Lunes' },
  { value: 2, short: 'M', name: 'Martes' },
  { value: 3, short: 'X', name: 'Miércoles' },
  { value: 4, short: 'J', name: 'Jueves' },
  { value: 5, short: 'V', name: 'Viernes' },
];

const emptyAddForm = {
  tipoServicio: 'completo',
  medioServicio: 'entrada',
  diasSemana: [1, 2, 3, 4, 5],
  fechasDiarias: [],
};

function localDateString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function dateRange(start, end) {
  if (!start || !end || start > end) return [];
  const out = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    const jsDay = cursor.getDay();
    if (jsDay >= 1 && jsDay <= 5) out.push(localDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function isoWeekday(date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function expectedService(student, date) {
  const tipo = student.tipoServicio || 'completo';
  const weekday = isoWeekday(date);
  if (tipo === 'completo') return 'ambas';
  if (tipo === 'medio') {
    return (student.diasSemana || []).map(Number).includes(weekday)
      ? (student.medioServicio || 'entrada')
      : null;
  }
  if (tipo === 'diario') {
    return (student.fechasDiarias || []).includes(date)
      ? (student.medioServicio || 'entrada')
      : null;
  }
  return null;
}

function conceptFor(route, concepts, key) {
  const map = route?.pricingConcepts || {};
  const aliases = {
    completo: ['completo', 'full', 'complete'],
    medio_entrada: ['medio_entrada', 'medioEntrada', 'entrada', 'halfEntry'],
    medio_salida: ['medio_salida', 'medioSalida', 'salida', 'halfExit'],
    por_dia: ['por_dia', 'porDia', 'diario', 'daily'],
  };
  const id = (aliases[key] || [key]).map((k) => map[k]).find(Boolean);
  if (id) {
    const found = concepts.find((x) => x.id === id && x.active !== false);
    if (found) return found;
  }
  // Compatibilidad con configuraciones antiguas: si la ruta ya tiene un concepto
  // asociado directamente, o si existe un único concepto activo de esa modalidad,
  // se puede resolver sin obligar al operador a volver a configurarlo.
  const directId = route?.pricingConceptId;
  if (directId) {
    const found = concepts.find((x) => x.id === directId && x.active !== false);
    if (found) return found;
  }
  const desiredMode = key === 'completo' ? 'mensual' : key === 'por_dia' ? 'por_evento' : 'por_dias';
  const byMode = concepts.filter((x) => x.active !== false && x.mode === desiredMode);
  if (byMode.length === 1) return byMode[0];
  return null;
}

function buildDays(student, dates) {
  const days = {};
  let selectedCount = 0;
  dates.forEach((date) => {
    const service = expectedService(student, date);
    const entrada = service === 'entrada' || service === 'ambas';
    const salida = service === 'salida' || service === 'ambas';
    if (service) selectedCount += 1;
    days[date] = { entrada, salida, confirmado: false };
  });
  return { days, selectedCount };
}

function buildStudentRow(student, dates, concepts, route) {
  const { days, selectedCount } = buildDays(student, dates);
  let conceptKey = 'completo';
  if (student.tipoServicio === 'medio') conceptKey = student.medioServicio === 'salida' ? 'medio_salida' : 'medio_entrada';
  if (student.tipoServicio === 'diario') conceptKey = 'por_dia';

  const concept = conceptFor(route, concepts, conceptKey);
  const baseAmount = Number(concept?.amount ?? student.billingBaseAmount ?? student.billingAmount ?? 0);
  let estimatedAmount = 0;

  if (student.tipoServicio === 'completo') {
    estimatedAmount = baseAmount;
  } else if (student.tipoServicio === 'medio') {
    // Para medio, el concepto representa el precio de cada día seleccionado.
    // Si el concepto es mensual, prorrateamos según los días elegidos.
    estimatedAmount = concept?.mode === 'mensual'
      ? baseAmount * ((student.diasSemana || []).length / 5)
      : baseAmount * (student.diasSemana || []).length;
  } else {
    estimatedAmount = baseAmount * selectedCount;
  }

  return {
    studentId: student.id,
    matricula: student.matricula || '',
    name: student.name || '',
    schoolId: student.schoolId || '',
    nivel: student.nivel || '',
    grado: student.grado || '',
    routeId: route?.id || student.routeId || '',
    tipoServicio: student.tipoServicio || 'completo',
    medioServicio: student.medioServicio || 'entrada',
    diasSemana: (student.diasSemana || []).map(Number),
    fechasDiarias: student.fechasDiarias || [],
    estimatedAmount: Number(estimatedAmount.toFixed(2)),
    baseAmount,
    daysCount: selectedCount,
    pricingConceptId: concept?.id || student.pricingConceptId || '',
    concept: concept?.name || student.billingConcept || '',
    billingMode: concept?.mode || student.billingMode || '',
    paymentDays: Number(concept?.paymentDays ?? concept?.diasPago ?? student.paymentDays ?? 0),
    paid: !!student.paid,
    paymentId: student.paymentId || '',
    days,
  };
}

function hasBothSameDay(row) {
  return Object.values(row.days || {}).some((d) => d.entrada && d.salida);
}

function priorityCompare(a, b) {
  const bothA = hasBothSameDay(a);
  const bothB = hasBothSameDay(b);
  if (bothA !== bothB) return bothA ? -1 : 1;
  return String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' });
}

function financePayload(row, listData, route, school) {
  return {
    listId: listData.id || '',
    studentId: row.studentId,
    studentName: row.name || '',
    matricula: row.matricula || '',
    schoolId: row.schoolId || route?.schoolId || '',
    schoolName: school?.name || '',
    nivel: row.nivel || '',
    grado: row.grado || '',
    routeId: route?.id || listData.routeId || '',
    routeName: route?.name || '',
    unitId: route?.unitId || '',
    periodoInicio: listData.startDate || '',
    periodoFin: listData.endDate || '',
    tipoServicio: row.tipoServicio || '',
    medioServicio: row.medioServicio || '',
    diasSemana: row.diasSemana || [],
    fechasDiarias: row.fechasDiarias || [],
    conceptId: row.pricingConceptId || '',
    conceptName: row.concept || '',
    montoEstimado: Number(row.estimatedAmount || 0),
    solicitudAtendida: false,
    servicioConfirmado: false,
    conceptoCargado: false,
    cobrado: !!row.paid,
    pagoId: row.paymentId || '',
  };
}

function dayHeader(date) {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDay();
  const meta = DAY_META.find((x) => x.value === day);
  return `${meta?.short || ''}${String(d.getDate()).padStart(2, '0')}`;
}

export default function RouteBuilder() {
  const { profile, user } = useAuth();
  const [routes, setRoutesState] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [schools, setSchools] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [matricula, setMatricula] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupStudent, setLookupStudent] = useState(null);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const inputRef = useRef(null);

  const [startDate, setStartDate] = useState(localDateString(new Date()));
  const [endDate, setEndDate] = useState(localDateString(new Date()));
  const [listId, setListId] = useState('');
  const [lists, setLists] = useState([]);
  const [currentList, setCurrentList] = useState(null);
  const [saving, setSaving] = useState(false);
  const [serviceFilters, setServiceFilters] = useState(['todos']);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [operatorId, setOperatorId] = useState('');
  const [movingRowId, setMovingRowId] = useState(null);
  const [moveRouteId, setMoveRouteId] = useState('');
  const [moveOperatorId, setMoveOperatorId] = useState('');

  useEffect(() => Routes.subscribe(setRoutesState), []);
  useEffect(() => Schools.subscribe(setSchools), []);
  useEffect(() => Drivers.subscribe(setDrivers), []);
  useEffect(() => {
    let active = true;
    Promise.all([Students.list(), PricingConcepts.list(), RouteLists.list()])
      .then(([studentRows, conceptRows, listRows]) => {
        if (!active) return;
        setAllStudents(studentRows || []);
        setConcepts(conceptRows || []);
        setLists(listRows || []);
      })
      .catch((err) => console.error('Error cargando listas:', err));
    return () => { active = false; };
  }, []);

  const route = routes.find((r) => r.id === routeId) || null;
  const school = schools.find((s) => s.id === route?.schoolId) || null;
  const dates = useMemo(() => dateRange(startDate, endDate), [startDate, endDate]);

  const list = useMemo(() => {
    let rows = [...(currentList?.rows || [])];
    const filters = serviceFilters.includes('todos') ? ['todos'] : serviceFilters;
    if (!filters.includes('todos') && filters.length) {
      rows = rows.filter((row) => {
        if (filters.includes('completo') && row.tipoServicio === 'completo') return true;
        if (filters.includes('medio_entrada') && row.tipoServicio === 'medio' && row.medioServicio === 'entrada') return true;
        if (filters.includes('medio_salida') && row.tipoServicio === 'medio' && row.medioServicio === 'salida') return true;
        if (filters.includes('diario') && row.tipoServicio === 'diario') return true;
        return false;
      });
    }
    return rows.sort(priorityCompare);
  }, [currentList, serviceFilters]);

  const searchResults = useMemo(() => {
    const q = String(matricula || '').trim().toLowerCase();
    if (!q) return [];
    return allStudents
      .filter((s) => String(s.matricula || '').toLowerCase().includes(q) || String(s.name || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [matricula, allStudents]);

  function schoolName(id) { return schools.find((s) => s.id === id)?.name || '—'; }

  function toggleServiceFilter(key) {
    if (key === 'todos') {
      setServiceFilters(['todos']);
      return;
    }
    setServiceFilters((prev) => {
      const current = prev.includes('todos') ? [] : prev;
      const next = current.includes(key) ? current.filter((x) => x !== key) : [...current, key];
      return next.length ? next : ['todos'];
    });
  }

  function resetAddFlow(close = true) {
    setMatricula('');
    setLookupStudent(null);
    setLookupError('');
    setAddForm(emptyAddForm);
    setEditingStudentId(null);
    if (close) setShowAddStudent(false);
    if (!close) setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selectLookupStudent(student, editing = false) {
    setLookupError('');
    setLookupStudent(student);
    setEditingStudentId(editing ? student.id : null);
    setAddForm({
      tipoServicio: student.tipoServicio || 'completo',
      medioServicio: student.medioServicio || 'entrada',
      diasSemana: (student.diasSemana || [1, 2, 3, 4, 5]).map(Number),
      fechasDiarias: (student.fechasDiarias || []).filter((d) => dates.includes(d)),
    });
    setMatricula(student.matricula || '');
  }

  function toggleDiaSemana(dia) {
    const diasSemana = addForm.diasSemana.includes(dia)
      ? addForm.diasSemana.filter((d) => d !== dia)
      : [...addForm.diasSemana, dia].sort((a, b) => a - b);
    setAddForm({ ...addForm, diasSemana });
  }

  function toggleFechaDiaria(fecha) {
    const fechasDiarias = addForm.fechasDiarias.includes(fecha)
      ? addForm.fechasDiarias.filter((d) => d !== fecha)
      : [...addForm.fechasDiarias, fecha].sort();
    setAddForm({ ...addForm, fechasDiarias });
  }

  async function saveStudentToRoster() {
    if (!lookupStudent || !route) return;
    if (addForm.tipoServicio === 'medio' && !addForm.diasSemana.length) {
      window.alert('Selecciona al menos un día de lunes a viernes.');
      return;
    }
    if (addForm.tipoServicio === 'diario' && !addForm.fechasDiarias.length) {
      window.alert('Selecciona al menos una fecha del calendario.');
      return;
    }

    const data = {
      routeId: route.id,
      tipoServicio: addForm.tipoServicio,
      medioServicio: addForm.medioServicio,
      diasSemana: addForm.tipoServicio === 'medio' ? addForm.diasSemana : [1, 2, 3, 4, 5],
      fechasDiarias: addForm.tipoServicio === 'diario' ? addForm.fechasDiarias.filter((d) => dates.includes(d)) : [],
    };

    const preview = buildStudentRow({ ...lookupStudent, ...data }, dates, concepts, route);
    if (!preview.pricingConceptId || !(preview.baseAmount > 0)) {
      const key = addForm.tipoServicio === 'completo' ? 'completo' : addForm.tipoServicio === 'medio' ? `medio_${addForm.medioServicio}` : 'por_dia';
      window.alert(`La ruta no tiene un concepto válido para: ${key}. Ve a Rutas y revisa la configuración de conceptos de esta ruta.`);
      return;
    }

    data.billingAmount = preview.estimatedAmount;
    data.billingBaseAmount = preview.baseAmount;
    data.billingConcept = preview.concept;
    data.billingMode = preview.billingMode;
    data.pricingConceptId = preview.pricingConceptId;
    data.billingDaysCount = preview.daysCount;
    data.billingUpdatedAt = new Date().toISOString();

    setSaving(true);
    try {
      await Students.update(lookupStudent.id, data);
      const refreshed = { ...lookupStudent, ...data };
      setAllStudents((prev) => prev.map((s) => s.id === refreshed.id ? refreshed : s));

      if (currentList && currentList.routeId === route.id) {
        const row = buildStudentRow(refreshed, currentList.dates || dates, concepts, route);
        const rows = [...(currentList.rows || []).filter((x) => x.studentId !== row.studentId), row].sort(priorityCompare);
        await RouteLists.update(currentList.id, { rows });
        await FinanceRecords.upsert(`${currentList.id}_${row.studentId}`, financePayload(row, currentList, route, school));
        const updated = { ...currentList, rows };
        setCurrentList(updated);
        setLists((prev) => prev.map((x) => x.id === currentList.id ? updated : x));
      }
      resetAddFlow();
    } catch (err) {
      console.error(err);
      setLookupError(err?.message || 'No se pudo guardar el alumno.');
    } finally {
      setSaving(false);
    }
  }

  function operatorName(id) { return drivers.find((d) => d.id === id)?.name || ''; }

  function addDays(dateString, days) {
    if (!dateString) return '';
    const d = new Date(`${dateString}T12:00:00`);
    d.setDate(d.getDate() + Number(days || 0));
    return localDateString(d);
  }

  async function syncListFinance(listData, listRows = listData.rows || [], listRoute = route, listSchool = school) {
    await Promise.all(listRows.map((row) => FinanceRecords.upsert(`${listData.id}_${row.studentId}`, financePayload(row, listData, listRoute, listSchool))));
  }

  async function createList() {
    if (!route || !startDate || !endDate || startDate > endDate || !dates.length) return;
    setSaving(true);
    try {
      const source = allStudents.filter((s) => s.routeId === route.id);
      const rows = source.map((s) => buildStudentRow(s, dates, concepts, route)).sort(priorityCompare);
      const data = {
        routeId: route.id,
        startDate,
        endDate,
        weekdays: [1, 2, 3, 4, 5],
        dates,
        rows,
        status: 'abierta',
        createdByUid: user?.uid || '',
        createdByName: profile?.name || '',
        operatorId: operatorId || '',
        operatorName: operatorName(operatorId),
      };
      const id = await RouteLists.create(data);
      const created = { id, ...data };
      await Promise.all(rows.map((row) => FinanceRecords.upsert(`${id}_${row.studentId}`, financePayload(row, created, route, school))));
      setLists((prev) => [created, ...prev]);
      setCurrentList(created);
      setListId(id);
      setServiceFilters(['todos']);
    } catch (err) {
      console.error(err);
      window.alert(err?.message || 'No se pudo crear la lista.');
    } finally {
      setSaving(false);
    }
  }

  function openList(id) {
    const found = lists.find((x) => x.id === id);
    if (!found) return;
    setCurrentList(found);
    setListId(found.id);
    setRouteId(found.routeId || '');
    setStartDate(found.startDate || startDate);
    setEndDate(found.endDate || endDate);
    setOperatorId(found.operatorId || '');
    setServiceFilters(['todos']);
  }

  async function deleteCurrentList() {
    if (!currentList) return;
    const ok = window.confirm(`¿Eliminar esta lista del ${currentList.startDate} al ${currentList.endDate}? También se eliminarán sus registros de Finanzas. Los alumnos NO se eliminarán.`);
    if (!ok) return;
    setSaving(true);
    try {
      await FinanceRecords.removeByList(currentList.id);
      await RouteLists.remove(currentList.id);
      setLists((prev) => prev.filter((x) => x.id !== currentList.id));
      setCurrentList(null); setListId(''); setShowAddStudent(false); setOperatorId(''); resetAddFlow();
    } catch (err) { console.error(err); window.alert(err?.message || 'No se pudo eliminar la lista.'); }
    finally { setSaving(false); }
  }

  async function saveListOperator(nextId) {
    if (!currentList) return;
    setOperatorId(nextId);
    const updated = { ...currentList, operatorId: nextId || '', operatorName: operatorName(nextId) };
    setSaving(true);
    try {
      await RouteLists.update(currentList.id, { operatorId: updated.operatorId, operatorName: updated.operatorName });
      await syncListFinance(updated, updated.rows || [], route, school);
      setCurrentList(updated); setLists((prev) => prev.map((x) => x.id === updated.id ? updated : x));
    } catch (err) { console.error(err); window.alert(err?.message || 'No se pudo actualizar el operador.'); }
    finally { setSaving(false); }
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

  async function editRow(row) {
    const student = allStudents.find((s) => s.id === row.studentId);
    if (!student) return;
    selectLookupStudent({ ...student, tipoServicio: row.tipoServicio, medioServicio: row.medioServicio, diasSemana: row.diasSemana, fechasDiarias: row.fechasDiarias }, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function removeRow(row) {
    if (!window.confirm(`¿Quitar a ${row.name} de esta lista? El alumno no se elimina.`)) return;
    await updateRows((currentList.rows || []).filter((x) => x.studentId !== row.studentId));
  }

  async function moveStudent(row) {
    if (!currentList || !moveRouteId || moveRouteId === currentList.routeId) { window.alert('Selecciona una ruta destino diferente.'); return; }
    const targetRoute = routes.find((r) => r.id === moveRouteId);
    if (!targetRoute) return;
    const targetSchool = schools.find((s) => s.id === targetRoute.schoolId) || null;
    setSaving(true);
    try {
      let targetList = lists.find((l) => l.routeId === moveRouteId && l.startDate === currentList.startDate && l.endDate === currentList.endDate);
      if (!targetList) {
        const targetRows = [];
        const data = { routeId: moveRouteId, startDate: currentList.startDate, endDate: currentList.endDate, weekdays: [1,2,3,4,5], dates: currentList.dates || [], rows: targetRows, status: 'abierta', createdByUid: user?.uid || '', createdByName: profile?.name || '', operatorId: moveOperatorId || '', operatorName: operatorName(moveOperatorId) };
        const id = await RouteLists.create(data); targetList = { id, ...data };
      }
      const student = allStudents.find((s) => s.id === row.studentId);
      const movedStudent = { ...student, routeId: moveRouteId };
      await Students.update(row.studentId, { routeId: moveRouteId });
      const targetRow = buildStudentRow({ ...movedStudent, tipoServicio: row.tipoServicio, medioServicio: row.medioServicio, diasSemana: row.diasSemana, fechasDiarias: row.fechasDiarias }, targetList.dates || dates, concepts, targetRoute);
      const targetRows = [...(targetList.rows || []).filter((x) => x.studentId !== row.studentId), targetRow].sort(priorityCompare);
      await RouteLists.update(targetList.id, { rows: targetRows });
      const targetUpdated = { ...targetList, rows: targetRows };
      await FinanceRecords.upsert(`${targetList.id}_${row.studentId}`, financePayload(targetRow, targetUpdated, targetRoute, targetSchool));
      await FinanceRecords.remove(`${currentList.id}_${row.studentId}`);
      const currentRows = (currentList.rows || []).filter((x) => x.studentId !== row.studentId);
      await RouteLists.update(currentList.id, { rows: currentRows });
      const currentUpdated = { ...currentList, rows: currentRows };
      setCurrentList(currentUpdated); setLists((prev) => { const exists = prev.some((x) => x.id === targetUpdated.id); return prev.map((x) => x.id === currentUpdated.id ? currentUpdated : x).concat(exists ? [] : [targetUpdated]); });
      setMovingRowId(null); setMoveRouteId(''); setMoveOperatorId('');
      window.alert(`${row.name} fue movido a ${targetRoute.name}.`);
    } catch (err) { console.error(err); window.alert(err?.message || 'No se pudo mover al alumno.'); }
    finally { setSaving(false); }
  }

  async function togglePaid(row) {
    if (!currentList || row.paid) return;
    const amount = Number(row.estimatedAmount || 0);
    if (!(amount > 0)) {
      window.alert('Este alumno no tiene un monto calculado. Revisa el concepto de la ruta.');
      return;
    }
    if (!window.confirm(`Registrar pago de $${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} para ${row.name}?`)) return;
    setSaving(true);
    try {
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
      await FinanceRecords.update(`${currentList.id}_${row.studentId}`, { cobrado: true, pagoId: paymentId, cobradoAt: new Date().toISOString() });
    } catch (err) {
      console.error(err);
      window.alert(err?.message || 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  function moveRow(index, dir) {
    const visibleIds = new Set(list.map((x) => x.studentId));
    const visible = [...list];
    const target = index + dir;
    if (target < 0 || target >= visible.length) return;
    [visible[index], visible[target]] = [visible[target], visible[index]];
    const orderMap = new Map(visible.map((r, i) => [r.studentId, i]));
    const rows = [...(currentList.rows || [])].sort((a, b) => {
      if (visibleIds.has(a.studentId) && visibleIds.has(b.studentId)) return orderMap.get(a.studentId) - orderMap.get(b.studentId);
      if (visibleIds.has(a.studentId)) return -1;
      if (visibleIds.has(b.studentId)) return 1;
      return 0;
    });
    updateRows(rows);
  }

  function typeLabel(row) {
    if (row.tipoServicio === 'completo') return 'Completo';
    if (row.tipoServicio === 'medio') return `Medio ${row.medioServicio === 'salida' ? 'S' : 'E'}`;
    return 'Diario';
  }

  function filteredTotal() {
    return list.reduce((sum, row) => sum + Number(row.estimatedAmount || 0), 0);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-h1 mb-1">Listas de alumnos</h1>
          <p className="text-sm text-navy-400">Selecciona ruta y periodo. Los días hábiles se detectan automáticamente de lunes a viernes.</p>
        </div>
        <button onClick={() => { Promise.all([Students.list(), PricingConcepts.list(), RouteLists.list()]).then(([s,c,l]) => { setAllStudents(s); setConcepts(c); setLists(l); }); }} className="btn-admin-ghost"><RefreshCw size={14}/> Actualizar</button>
      </div>

      <div className="admin-card">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="admin-label">Ruta</label><select value={routeId} onChange={(e) => { setRouteId(e.target.value); setCurrentList(null); setListId(''); resetAddFlow(); }} className="admin-select"><option value="">Selecciona una ruta…</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div><label className="admin-label">Desde</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="admin-input" /></div>
          <div><label className="admin-label">Hasta</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="admin-input" /></div>
          <div><label className="admin-label">Días hábiles detectados</label><div className="admin-input bg-navy-50">{dates.length} días · Lunes a viernes</div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button disabled={!route || !dates.length || saving} onClick={createList} className="btn-admin-primary"><Plus size={14}/> Generar lista</button>
          <select value={listId} onChange={(e) => openList(e.target.value)} className="admin-select max-w-sm"><option value="">Abrir lista existente…</option>{lists.filter((l) => !routeId || l.routeId === routeId).map((l) => <option key={l.id} value={l.id}>{l.startDate} → {l.endDate}</option>)}</select>{currentList && <><select value={operatorId} onChange={(e) => saveListOperator(e.target.value)} className="admin-select max-w-xs"><option value="">Operador / chofer…</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><button disabled={saving} onClick={deleteCurrentList} className="btn-admin-ghost text-stop"><Trash2 size={14}/> Eliminar lista</button></>}
        </div>
      </div>

      {currentList && (
        <div className="admin-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><span className="font-display font-bold">{route?.name || 'Ruta'}</span><span className="text-navy-400 ml-2">{currentList.startDate} → {currentList.endDate} · {currentList.dates?.length || 0} días</span></div>
            <div className="flex gap-2 print:hidden"><button onClick={() => { const next = !showAddStudent; setShowAddStudent(next); resetAddFlow(false); }} className="btn-admin-primary"><Plus size={14}/> Agregar alumnos</button><button onClick={() => window.print()} className="btn-admin-ghost"><Printer size={14}/> Imprimir</button></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs font-semibold text-navy-500">MOSTRAR:</span>
            {[['todos','Todos'],['completo','Completos'],['medio_entrada','Medio entrada'],['medio_salida','Medio salida'],['diario','Diarios']].map(([key,label]) => {
              const active = serviceFilters.includes(key);
              return <button key={key} onClick={() => toggleServiceFilter(key)} className={`px-2.5 py-1.5 rounded-md text-xs border ${active ? 'bg-navy-800 text-white border-navy-800' : 'border-navy-200 text-navy-500'}`}>{label}</button>;
            })}
            <span className="text-[11px] text-navy-400">Puedes seleccionar Medio entrada, Medio salida o ambos.</span>
          </div>
        </div>
      )}

      {route && (!currentList || showAddStudent) && (
        <div className="admin-card">
          <div className="flex items-center gap-2 mb-3"><Search size={15}/><span className="font-display font-semibold">Agregar alumno a la ruta</span></div>
          <form onSubmit={(e) => { e.preventDefault(); const found = allStudents.find((s) => String(s.matricula || '').toLowerCase() === matricula.trim().toLowerCase()) || searchResults[0]; if (found) selectLookupStudent(found); else setLookupError('No encontramos ese alumno en el padrón.'); }}>
            <div className="flex gap-2"><input ref={inputRef} value={matricula} onChange={(e) => { setMatricula(e.target.value); setLookupError(''); }} placeholder="Matrícula o nombre…" className="admin-input flex-1"/><button className="btn-admin-primary"><Search size={14}/> Buscar</button></div>
          </form>
          {searchResults.length > 0 && !lookupStudent && <div className="mt-2 border border-navy-100 rounded-lg overflow-hidden">{searchResults.map((s) => <button type="button" key={s.id} onClick={() => selectLookupStudent(s)} className="w-full text-left px-3 py-2 hover:bg-navy-50 border-b border-navy-100"><b>{s.name}</b><span className="block text-xs text-navy-400">{s.matricula} · {schoolName(s.schoolId)}</span></button>)}</div>}
        </div>
      )}

      {route && (lookupStudent || editingStudentId) && (
        <div className="admin-card border-signal-yellow/30">
          <div className="flex justify-between items-center mb-3"><div><p className="font-display font-semibold">{editingStudentId ? 'Editar alumno en la lista' : 'Agregar alumno a la ruta'}</p><p className="text-xs text-navy-400">{lookupStudent?.name} · {lookupStudent?.matricula}</p></div><button onClick={resetAddFlow} className="btn-admin-ghost"><X size={14}/></button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div><label className="admin-label">Tipo de servicio</label><select value={addForm.tipoServicio} onChange={(e) => setAddForm({ ...addForm, tipoServicio: e.target.value })} className="admin-select">{SERVICE_OPTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></div>
            {addForm.tipoServicio !== 'completo' && <div><label className="admin-label">Entrada o salida</label><select value={addForm.medioServicio} onChange={(e) => setAddForm({ ...addForm, medioServicio: e.target.value })} className="admin-select"><option value="entrada">Solo entrada</option><option value="salida">Solo salida</option></select></div>}
          </div>
          {addForm.tipoServicio === 'medio' && <div className="mt-3"><label className="admin-label">¿Qué días?</label><div className="flex gap-2">{DAY_META.map((d) => <label key={d.value} className={`inline-flex items-center gap-1 px-2 py-1.5 rounded border text-xs cursor-pointer ${addForm.diasSemana.includes(d.value) ? 'bg-signal-yellow/20 border-signal-yellow/60' : 'border-navy-200'}`}><input type="checkbox" checked={addForm.diasSemana.includes(d.value)} onChange={() => toggleDiaSemana(d.value)}/>{d.short}</label>)}</div></div>}
          {addForm.tipoServicio === 'diario' && <div className="mt-3"><label className="admin-label">¿Qué fechas?</label><div className="flex flex-wrap gap-1.5">{dates.map((date) => <label key={date} className={`inline-flex items-center gap-1 px-2 py-1.5 rounded border text-xs cursor-pointer ${addForm.fechasDiarias.includes(date) ? 'bg-signal-yellow/20 border-signal-yellow/60' : 'border-navy-200'}`}><input type="checkbox" checked={addForm.fechasDiarias.includes(date)} onChange={() => toggleFechaDiaria(date)}/>{dayHeader(date)}</label>)}</div></div>}
          {(() => { const preview = buildStudentRow({ ...lookupStudent, ...addForm }, dates, concepts, route); return <div className="mt-3 p-3 rounded bg-navy-50 text-xs"><b>Concepto:</b> {preview.concept || 'No configurado'} · <b>Monto:</b> ${preview.estimatedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · <b>Días:</b> {preview.daysCount}</div>; })()}
          <div className="flex gap-2 mt-3"><button disabled={saving} onClick={saveStudentToRoster} className="btn-admin-primary"><Save size={14}/>{editingStudentId ? 'Guardar cambios' : 'Agregar alumno'}</button><button onClick={resetAddFlow} className="btn-admin-ghost">Cancelar</button></div>
          {lookupError && <p className="text-stop text-xs mt-2">{lookupError}</p>}
        </div>
      )}

      {currentList && (
        <div className="admin-card p-0 overflow-hidden">
          <div className="px-3 py-3 border-b border-navy-100 flex flex-wrap justify-between gap-2"><div><b>{route?.name || 'Ruta'}</b><span className="text-xs text-navy-400 ml-2">{list.length} alumnos visibles</span></div><div className="text-xs text-navy-500">Estimado: <b>${filteredTotal().toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b></div></div>
          {movingRowId && <div className="m-3 p-3 rounded-lg bg-signal-yellow/10 border border-signal-yellow/30 text-xs"><div className="font-semibold mb-2">Mover alumno a otra ruta</div><div className="flex flex-wrap gap-2 items-end"><div><label className="admin-label">Ruta destino</label><select value={moveRouteId} onChange={(e) => setMoveRouteId(e.target.value)} className="admin-select"><option value="">Selecciona…</option>{routes.filter((r) => r.id !== currentList.routeId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div><label className="admin-label">Operador</label><select value={moveOperatorId} onChange={(e) => setMoveOperatorId(e.target.value)} className="admin-select"><option value="">Sin operador</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div><button onClick={() => moveStudent(currentList.rows.find((x) => x.studentId === movingRowId))} disabled={saving} className="btn-admin-primary">Mover alumno</button><button onClick={() => setMovingRowId(null)} className="btn-admin-ghost">Cancelar</button></div></div>}
          <div className="overflow-x-auto">
            <table className="table-admin text-[11px] min-w-[850px]">
              <thead><tr><th className="w-10">#</th><th>Alumno</th><th>Matrícula</th><th>Tipo</th>{currentList.dates?.map((date) => <th key={date} className="text-center w-10 px-1">{dayHeader(date)}</th>)}<th className="text-right">Monto</th><th>Pago</th><th className="print:hidden"></th></tr></thead>
              <tbody>
                {list.map((row, i) => {
                  const both = hasBothSameDay(row);
                  return <tr key={row.studentId} className={`${both ? 'bg-signal-yellow/15' : ''}`}>
                    <td className="font-semibold">{i + 1}</td>
                    <td className="whitespace-nowrap font-medium">{row.name}{both && <span className="badge-amber ml-1">E+S</span>}</td>
                    <td className="whitespace-nowrap text-navy-500">{row.matricula}</td>
                    <td className="whitespace-nowrap">{typeLabel(row)}</td>
                    {currentList.dates?.map((date) => {
                      const day = row.days?.[date] || {};
                      const active = day.entrada || day.salida;
                      return <td key={date} className="text-center px-1 align-middle">
                        <div className="flex flex-col items-center gap-0.5">
                          <button type="button" title="Entrada" onClick={() => toggleDay(row.studentId, date, 'entrada')} className={`w-5 h-4 rounded border text-[8px] leading-none font-bold ${day.entrada ? 'bg-signal-yellow/45 border-signal-yellow/70 text-navy-900' : 'border-navy-200 text-navy-300'}`}>E</button>
                          <button type="button" title="Salida" onClick={() => toggleDay(row.studentId, date, 'salida')} className={`w-5 h-4 rounded border text-[8px] leading-none font-bold ${day.salida ? 'bg-signal-yellow/45 border-signal-yellow/70 text-navy-900' : 'border-navy-200 text-navy-300'}`}>S</button>
                        </div>
                      </td>;
                    })}
                    <td className="text-right font-semibold whitespace-nowrap">${Number(row.estimatedAmount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td className="text-center"><input type="checkbox" checked={!!row.paid} onChange={() => togglePaid(row)} disabled={saving || row.paid} className="w-3.5 h-3.5"/></td>
                    <td className="print:hidden whitespace-nowrap"><button title="Editar" onClick={() => editRow(row)} className="link-action mr-2"><Pencil size={12}/></button><button title="Mover de ruta" onClick={() => { setMovingRowId(row.studentId); setMoveRouteId(''); setMoveOperatorId(currentList.operatorId || operatorId || ''); }} className="link-action mr-2 text-xs">Mover</button><button title="Subir" onClick={() => moveRow(i, -1)} className="text-navy-400 mr-1"><ArrowUp size={11}/></button><button title="Bajar" onClick={() => moveRow(i, 1)} className="text-navy-400 mr-1"><ArrowDown size={11}/></button><button title="Quitar de lista" onClick={() => removeRow(row)} className="text-stop"><Trash2 size={12}/></button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-navy-100 bg-navy-50/50 text-xs flex flex-wrap gap-4"><span><b>{list.length}</b> alumnos</span><span>E+S mismo día: <b>{list.filter(hasBothSameDay).length}</b></span><span>Estimado: <b>${filteredTotal().toLocaleString('es-MX')}</b></span></div>
        </div>
      )}
    </div>
  );
}
