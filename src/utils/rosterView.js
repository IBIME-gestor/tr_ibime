import { loadRoster, studentAppliesToday } from '../firebase/trips';

/**
 * Consulta de alumnos por ruta, ida y vuelta, para pantallas del admin
 * (detalle de cobertura y visor del calendario escolar).
 *
 * Usa la MISMA lógica que el operador (lista del periodo, servicio del alumno,
 * taller y calendario escolar), así lo que ve el admin es lo que verá el operador.
 *
 * Devuelve { ida, vuelta, excluded, calendarDay }:
 *  · ida / vuelta: alumnos que les toca ese turno, SIN quitar a los marcados «no irá»
 *    (para poder mostrarlos y desmarcarlos). Usa applyExcluded() para quitarlos.
 *  · excluded: { morning:Set, afternoon:Set } con los «no irá» de la cobertura de ese día.
 * opts: { calendarDay, coverages } (ver loadRoster).
 */
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es');

export async function loadShiftRosters(route, date, opts = {}) {
  const roster = await loadRoster(route, date, route.driverId || '', opts);
  const pick = (shift) => roster.students
    .filter((s) => studentAppliesToday(s, date, shift, route, roster.listRows))
    .sort(byName);
  return {
    ida: route.kind === 'taller' ? [] : pick('morning'),
    vuelta: pick('afternoon'),
    excluded: roster.excluded,
    calendarDay: roster.calendarDay,
  };
}

/** Quita de una lista a los alumnos marcados «no irá» en ese turno. */
export const applyExcluded = (list, excludedSet) => (excludedSet?.size ? list.filter((s) => !excludedSet.has(s.id)) : list);

/** Corre `worker` sobre `items` con un máximo de `limit` a la vez (para no saturar Firestore). */
export async function runPool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/** «Nivel · Grado» de un alumno, para mostrarlo en listas informativas. */
export const levelText = (s) => [s?.nivel, s?.grado].map((x) => String(x || '').trim()).filter(Boolean).join(' · ');
