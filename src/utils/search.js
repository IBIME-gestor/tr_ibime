/**
 * Búsqueda de alumnos por matrícula, nombre, apellido o cualquier
 * combinación de ellos.
 *
 *  - Ignora mayúsculas, acentos y signos ("Pérez" = "perez").
 *  - Cada palabra escrita debe aparecer en alguna parte del nombre o de la
 *    matrícula, en CUALQUIER orden: "juan lopez" encuentra a "LOPEZ GARCIA
 *    JUAN CARLOS", y "garcia 2401" encuentra por apellido + matrícula.
 *  - Ordena primero las coincidencias más claras (matrícula exacta, nombre
 *    que empieza igual, palabras completas) y después las parciales.
 */

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(query) {
  const norm = normalizeText(query);
  return norm ? norm.split(' ') : [];
}

function haystackOf(student) {
  return {
    name: normalizeText(
      [student.name, student.apellido, student.lastName, student.apellidos].filter(Boolean).join(' ')
    ),
    matricula: normalizeText(student.matricula),
  };
}

/** Puntaje de una coincidencia (menor = mejor). Devuelve null si no coincide. */
function scoreStudent(student, tokens, fullQuery) {
  const { name, matricula } = haystackOf(student);
  const words = name.split(' ');
  let score = 0;

  if (matricula && matricula === fullQuery) return -100; // matrícula exacta

  for (const t of tokens) {
    const inMatricula = matricula.includes(t);
    const wordStart = words.some((w) => w.startsWith(t));
    const wordExact = words.some((w) => w === t);
    const inName = name.includes(t);
    if (!inMatricula && !inName) return null; // falta una palabra: no coincide

    if (wordExact) score += 0;
    else if (wordStart) score += 1;
    else if (matricula.startsWith(t)) score += 1;
    else score += 3; // coincide a mitad de palabra
  }

  if (name.startsWith(tokens[0])) score -= 2;
  if (name.includes(fullQuery)) score -= 1; // frase completa tal cual
  return score;
}

/**
 * @param {Array} students  lista completa de alumnos
 * @param {string} query    lo que escribió la persona
 * @param {number} limit    máximo de resultados
 */
export function searchStudents(students, query, limit = 20) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const fullQuery = tokens.join(' ');

  const scored = [];
  for (const s of students) {
    const score = scoreStudent(s, tokens, fullQuery);
    if (score !== null) scored.push({ s, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      String(a.s.name || '').localeCompare(String(b.s.name || ''), 'es', { sensitivity: 'base' })
  );
  return scored.slice(0, limit).map((x) => x.s);
}
