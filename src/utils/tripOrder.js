/**
 * Orden REAL de un recorrido.
 *
 * `stop.order` es el orden PLANEADO (el de la lista con la que arrancó el
 * día). Lo que de verdad pasó es otra cosa: el operador recoge/baja a los
 * alumnos en el orden que le conviene. Aquí se reconstruye ese orden real a
 * partir de la hora en que se marcó a cada alumno:
 *
 *   ida (morning)      → boardedAt    (hora a la que lo recogió)
 *   vuelta (afternoon) → deliveredAt  (hora a la que lo bajó)
 *
 * El número que se dibuja en los mapas es la posición en ese orden real
 * (1 = primero que se atendió), no la posición en la lista.
 */

export const tsMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null);

export const timeKeyFor = (shift) => (shift === 'morning' ? 'boardedAt' : 'deliveredAt');
export const locKeyFor = (shift) => (shift === 'morning' ? 'boardedLocation' : 'deliveredLocation');

/** "recogió" (ida) o "bajó" (vuelta) — para textos como "cómo los fuiste bajando". */
export const actionVerb = (shift) => (shift === 'morning' ? 'recogiendo' : 'bajando');

/**
 * Paradas ya atendidas (no ausentes, con hora) en el orden real en que se
 * atendieron. Cada una trae `seq` (1, 2, 3…). Si dos horas empatan se
 * respeta el orden planeado.
 */
export function actualSequence(stops, shift) {
  const timeKey = timeKeyFor(shift);
  return stops
    .filter((s) => s.status !== 'absent' && tsMs(s[timeKey]) != null)
    .sort((a, b) => tsMs(a[timeKey]) - tsMs(b[timeKey]) || (a.order ?? 0) - (b.order ?? 0))
    .map((s, i) => ({ ...s, seq: i + 1 }));
}

/**
 * Todas las paradas: primero las ya atendidas en su orden real (con `seq`)
 * y después las que faltan, en su orden planeado (sin `seq`).
 */
export function withActualOrder(stops, shift) {
  const done = actualSequence(stops, shift);
  const doneIds = new Set(done.map((s) => s.id));
  const rest = stops
    .filter((s) => !doneIds.has(s.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return [...done, ...rest];
}

/**
 * Orden que se guarda en la ruta al cerrar el recorrido (y con el que
 * arranca el día siguiente): primero como de verdad se atendió; los que no
 * se atendieron (no vino, sin marcar) se quedan junto a los vecinos que
 * tenían en la lista, en vez de irse todos al final en orden alfabético.
 */
export function buildSavedOrder(stops, shift) {
  const result = actualSequence(stops, shift).map((s) => s.studentId);
  const inResult = new Set(result);
  const planned = [...stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let anchor = null;
  planned.forEach((s) => {
    if (inResult.has(s.studentId)) {
      anchor = s.studentId;
      return;
    }
    const at = anchor ? result.indexOf(anchor) + 1 : 0;
    result.splice(at, 0, s.studentId);
    inResult.add(s.studentId);
    anchor = s.studentId;
  });
  return result;
}

/**
 * Propuesta de orden para hoy, a partir de cómo se atendió el último
 * recorrido completado (`referenceStops`, ya en orden real).
 * Los alumnos que no estuvieron ese día se quedan al final, en el orden que
 * ya traían, y los esporádicos siempre van hasta el último.
 *
 * @returns {string[]} studentIds en el orden propuesto
 */
export function proposeOrder(stops, referenceStops) {
  const rank = new Map();
  referenceStops.forEach((r, i) => {
    if (!rank.has(r.studentId)) rank.set(r.studentId, i);
  });
  const byRank = (a, b) => rank.get(a.studentId) - rank.get(b.studentId);

  const fixed = stops.filter((s) => !s.sporadic);
  const sporadic = stops.filter((s) => s.sporadic);

  const known = fixed.filter((s) => rank.has(s.studentId)).sort(byRank);
  const unknown = fixed.filter((s) => !rank.has(s.studentId));
  const knownSporadic = sporadic.filter((s) => rank.has(s.studentId)).sort(byRank);
  const unknownSporadic = sporadic.filter((s) => !rank.has(s.studentId));

  return [...known, ...unknown, ...knownSporadic, ...unknownSporadic].map((s) => s.studentId);
}

export function sameOrder(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** 'martes 3 de noviembre' a partir de 'YYYY-MM-DD'. */
export function fmtLongDate(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
