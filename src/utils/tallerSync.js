import { Routes, Schools, PricingConcepts, RouteLists, FinanceRecords } from '../firebase/services';
import { tallerDatesFor, todayString } from '../firebase/trips';
import {
  applyTallerToDays,
  buildStudentRow,
  financePayload,
  invalidateListReviewPatch,
  priorityCompare,
} from '../pages/admin/RouteBuilder';

/**
 * Mantiene al día las LISTAS YA GENERADAS cuando a un alumno se le asigna, cambia
 * o quita el taller, para no tener que volver a generarlas en «Listas de alumnos».
 *
 *  · Lista de su ruta NORMAL: en los días de taller se desmarca su salida (se movió
 *    al taller); si se quita o se cambia el taller, la salida regresa. El cobro no
 *    cambia (el taller no modifica lo que ya paga).
 *  · Lista de la ruta de TALLER: si el alumno no tiene ruta normal, se agrega/ajusta/
 *    quita su fila de cobro por día.
 *
 * Solo toca listas cuyo periodo no ha terminado y solo las fechas de hoy en adelante:
 * lo que ya pasó (y ya se cobró) no se reescribe.
 *
 * `student` debe ser el alumno YA con sus campos de taller nuevos.
 * Devuelve los nombres de las listas que se actualizaron.
 */
export async function syncStudentTaller(student) {
  if (!student?.id) return [];
  const today = todayString();
  const [routes, lists, concepts, schools] = await Promise.all([
    Routes.list(), RouteLists.list(), PricingConcepts.list(), Schools.list(),
  ]);
  const routeById = Object.fromEntries((routes || []).map((r) => [r.id, r]));
  const updated = [];

  for (const list of lists || []) {
    if (list.status === 'eliminada' || !list.endDate || list.endDate < today) continue;
    const route = routeById[list.routeId];
    if (!route) continue;
    const rows = list.rows || [];
    const row = rows.find((r) => r.studentId === student.id) || null;
    let nextRows = null;

    if (route.kind !== 'taller') {
      // Ruta normal: mover / devolver la salida de los días de taller.
      if (!row) continue;
      let changed = false;
      const days = {};
      Object.entries(row.days || {}).forEach(([date, d]) => {
        if (date < today) { days[date] = d; return; }
        const next = applyTallerToDays(student, { [date]: d })[date];
        if (Boolean(next.salida) !== Boolean(d.salida) || Boolean(next.tallerMoved) !== Boolean(d.tallerMoved)) changed = true;
        days[date] = next;
      });
      if (!changed) continue;
      nextRows = rows.map((r) => (r.studentId === student.id ? { ...r, days } : r));
    } else {
      // Ruta de taller: fila de cobro por día (solo si el alumno no tiene ruta normal).
      const mine = student.tallerRouteId === list.routeId;
      const future = (list.dates || []).filter((d) => d >= today);
      const billable = mine ? tallerDatesFor(student, future).billable : [];
      const kept = (row?.fechasDiarias || []).filter((d) => d < today);
      const all = [...new Set([...kept, ...billable])].sort();

      if (!all.length) {
        if (!row || row.paid) continue;
        nextRows = rows.filter((r) => r.studentId !== student.id);
        const financeId = `${list.id}_${student.id}`;
        const existing = await FinanceRecords.get(financeId);
        if (existing && !existing.cobrado) await FinanceRecords.remove(financeId);
      } else {
        const built = buildStudentRow({
          ...student, routeId: route.id, tipoServicio: 'diario', medioServicio: 'salida', fechasDiarias: all, diasSemana: [],
        }, list.dates || [], concepts, route);
        const newRow = { ...built, paid: !!row?.paid, paymentId: row?.paymentId || '', tallerBilling: true };
        if (row && JSON.stringify(row.fechasDiarias || []) === JSON.stringify(all)) continue;
        nextRows = [...rows.filter((r) => r.studentId !== student.id), newRow].sort(priorityCompare);
        const financeId = `${list.id}_${student.id}`;
        const existing = await FinanceRecords.get(financeId);
        const school = schools.find((s) => s.id === (route.schoolId || newRow.schoolId)) || null;
        await FinanceRecords.upsert(financeId, financePayload(newRow, list, route, school, existing || {}));
      }
    }

    await RouteLists.update(list.id, { rows: nextRows, ...invalidateListReviewPatch() });
    updated.push(list.listName || route.name || list.id);
  }
  return updated;
}
