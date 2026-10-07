import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Students, RouteLists, FinanceRecords } from './services';

/**
 * Portal de operadores (enlace externo)
 * ---------------------------------------------------------------------
 * Modelo de datos:
 *
 *   operatorLinks/{token}                       <- enlace por operador
 *     { token, operatorId, operatorName, label, active,
 *       routes: [{ id, name, schoolId, schoolName }], ... }
 *
 *   operatorLinks/{token}/submissions/{id}      <- alumnos que captura el operador
 *     { matricula, name, nivel, grado, ..., routeId, tipoServicio, ...,
 *       status: 'pending' | 'approved' | 'rejected' }
 *
 * El "token" (largo y aleatorio) es el secreto del enlace. Quien lo tiene
 * puede capturar y ver SUS solicitudes; nadie más. Lo capturado queda en
 * "pending" y NO toca students / routeLists hasta que el administrador lo
 * apruebe desde el panel (ver approveSubmissions).
 */

const LINKS = 'operatorLinks';

export const SUBMISSION_FIELDS = [
  'matricula',
  'name',
  'nivel',
  'grado',
  'familiarResponsable',
  'telefono',
  'address',
  'routeId',
  'routeName',
  'schoolId',
  'tipoServicio',
  'medioServicio',
  'diasSemana',
  'fechasDiarias',
];

export function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 36);
}

export function linkUrl(token) {
  return `${window.location.origin}/operador/${token}`;
}

/* ------------------------------------------------------------------ */
/*  Lado público (operador, sin login)                                 */
/* ------------------------------------------------------------------ */
export const OperatorPortal = {
  async getLink(token) {
    const snap = await getDoc(doc(db, LINKS, token));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  subscribeSubmissions(token, cb, onError) {
    return onSnapshot(
      collection(db, LINKS, token, 'submissions'),
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error('Error en solicitudes del operador:', err);
        if (onError) onError(err);
      }
    );
  },

  async addSubmission(token, data) {
    const clean = pick(data);
    const ref = await addDoc(collection(db, LINKS, token, 'submissions'), {
      ...clean,
      linkToken: token,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  // Solo se puede editar mientras esté pendiente o rechazada (al editar
  // una rechazada vuelve a quedar pendiente para otra revisión).
  async updateSubmission(token, id, data) {
    await updateDoc(doc(db, LINKS, token, 'submissions', id), {
      ...pick(data),
      status: 'pending',
      rejectReason: '',
      updatedAt: serverTimestamp(),
    });
  },

  async removeSubmission(token, id) {
    await deleteDoc(doc(db, LINKS, token, 'submissions', id));
  },
};

function pick(data) {
  const out = {};
  SUBMISSION_FIELDS.forEach((k) => {
    if (data[k] !== undefined) out[k] = data[k];
  });
  out.matricula = String(out.matricula || '').trim();
  out.name = String(out.name || '').trim();
  return out;
}

/* ------------------------------------------------------------------ */
/*  Lado administrador                                                 */
/* ------------------------------------------------------------------ */
export const OperatorLinks = {
  subscribe(cb, onError) {
    return onSnapshot(
      collection(db, LINKS),
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error('Error en enlaces de operadores:', err);
        if (onError) onError(err);
      }
    );
  },

  async create({ operatorId, operatorName, label, routes, createdByName }) {
    const token = generateToken();
    await setDoc(doc(db, LINKS, token), {
      token,
      operatorId: operatorId || '',
      operatorName: operatorName || '',
      label: label || '',
      routes: routes || [],
      active: true,
      createdByName: createdByName || '',
      createdAt: serverTimestamp(),
    });
    return token;
  },

  setActive: (token, active) =>
    updateDoc(doc(db, LINKS, token), { active: !!active, updatedAt: serverTimestamp() }),

  updateRoutes: (token, routes) =>
    updateDoc(doc(db, LINKS, token), { routes, updatedAt: serverTimestamp() }),

  async remove(token) {
    const subs = await getDocs(collection(db, LINKS, token, 'submissions'));
    await Promise.all(subs.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, LINKS, token));
  },
};

export const Submissions = {
  // Todas las solicitudes de todos los enlaces (collectionGroup).
  subscribeAll(cb, onError) {
    return onSnapshot(
      query(collectionGroup(db, 'submissions')),
      (snap) =>
        cb(
          snap.docs.map((d) => ({
            id: d.id,
            token: d.ref.parent.parent?.id || d.data().linkToken || '',
            ...d.data(),
          }))
        ),
      (err) => {
        console.error('Error en solicitudes:', err);
        if (onError) onError(err);
      }
    );
  },

  reject: (token, id, reason, byName) =>
    updateDoc(doc(db, LINKS, token, 'submissions', id), {
      status: 'rejected',
      rejectReason: reason || '',
      reviewedByName: byName || '',
      reviewedAt: serverTimestamp(),
    }),

  remove: (token, id) => deleteDoc(doc(db, LINKS, token, 'submissions', id)),
};

/* ------------------------------------------------------------------ */
/*  Aprobación: alumno + lista de ruta (misma lógica de Formar lista)  */
/* ------------------------------------------------------------------ */

function localDateString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function monthRange(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    start: localDateString(new Date(y, m, 1, 12)),
    end: localDateString(new Date(y, m + 1, 0, 12)),
  };
}

function weekdaysBetween(start, end) {
  if (!start || !end || start > end) return [];
  const out = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) out.push(localDateString(cursor));
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
      ? student.medioServicio || 'entrada'
      : null;
  }
  if (tipo === 'diario') {
    return (student.fechasDiarias || []).includes(date) ? student.medioServicio || 'entrada' : null;
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
  if (student.tipoServicio === 'completo' || student.tipoServicio === 'medio') {
    estimatedAmount = baseAmount;
  } else {
    estimatedAmount =
      Object.values(days).reduce((sum, d) => sum + (d.entrada ? 1 : 0) + (d.salida ? 1 : 0), 0) * baseAmount;
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
    paid: false,
    paymentId: '',
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

function routeNomenclature(r) {
  const raw = String(r?.name || 'RUTA').trim().toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÑ ]/g, ' ');
  return raw.split(/\s+/).filter(Boolean).map((x) => x[0]).join('').slice(0, 8) || 'RUTA';
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
    operatorId: listData.operatorId || '',
    operatorName: listData.operatorName || '',
    listName: listData.listName || '',
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
    cobrado: false,
    pagoId: '',
  };
}

function capacityIssue(rows, dates, capacity) {
  if (!capacity) return '';
  for (const date of dates) {
    let ent = 0;
    let sal = 0;
    rows.forEach((r) => {
      const d = r.days?.[date];
      if (d?.entrada) ent += 1;
      if (d?.salida) sal += 1;
    });
    if (ent > capacity || sal > capacity) return `${date}: ${Math.max(ent, sal)}/${capacity}`;
  }
  return '';
}

const REVIEW_RESET = {
  reviewedStudents: false,
  reviewedPayments: false,
  reviewed: false,
  reviewedAt: '',
  reviewedByUid: '',
  reviewedByName: '',
};

/**
 * Aprueba una o varias solicitudes. Para cada una:
 *  1) crea el alumno (o actualiza el existente con la misma matrícula),
 *  2) lo agrega a la lista de ruta abierta del operador para el mes en
 *     curso (si no existe esa lista, la crea),
 *  3) crea su registro financiero y marca la solicitud como aprobada.
 *
 * ctx = { routes, schools, units, concepts, students, admin: { uid, name } }
 * Devuelve { ok: [...], warnings: [...], errors: [...] }.
 */
export async function approveSubmissions(subs, links, ctx) {
  const result = { ok: [], warnings: [], errors: [] };
  const today = localDateString(new Date());
  const range = monthRange(today);
  const dates = weekdaysBetween(range.start, range.end);

  const studentsByMat = new Map(
    (ctx.students || []).map((s) => [String(s.matricula || '').trim().toLowerCase(), s])
  );
  const linkByToken = new Map(links.map((l) => [l.token || l.id, l]));
  const listCache = new Map(); // `${routeId}|${operatorId}` -> lista en memoria

  let allLists = null;
  async function getLists() {
    if (!allLists) allLists = await RouteLists.list();
    return allLists;
  }

  for (const sub of subs) {
    try {
      const link = linkByToken.get(sub.token);
      const route = ctx.routes.find((r) => r.id === sub.routeId);
      if (!route) throw new Error('La ruta de la solicitud ya no existe.');
      const school = ctx.schools.find((s) => s.id === route.schoolId) || null;
      const unit = ctx.units.find((u) => u.id === route.unitId) || null;
      const operatorId = link?.operatorId || '';
      const operatorName = link?.operatorName || '';

      // 1) Alumno
      const base = {
        matricula: sub.matricula,
        name: sub.name,
        nivel: sub.nivel || '',
        grado: sub.grado || '',
        familiarResponsable: sub.familiarResponsable || '',
        telefono: sub.telefono || '',
        address: sub.address || '',
        schoolId: route.schoolId || sub.schoolId || '',
        routeId: route.id,
        tipoServicio: sub.tipoServicio || 'completo',
        medioServicio: sub.medioServicio || 'entrada',
        diasSemana: (sub.diasSemana || []).map(Number),
        fechasDiarias: sub.fechasDiarias || [],
      };
      const existing = studentsByMat.get(String(sub.matricula).trim().toLowerCase());
      let student;
      if (existing) {
        if (existing.routeId && existing.routeId !== route.id) {
          result.warnings.push(
            `${sub.name}: ya existía en otra ruta; se movió a ${route.name}. Revisa su lista anterior en "Formar lista de ruta".`
          );
        }
        const patch = {};
        Object.entries(base).forEach(([k, v]) => {
          const empty = v === '' || (Array.isArray(v) && v.length === 0);
          if (!empty) patch[k] = v;
        });
        await Students.update(existing.id, patch);
        student = { ...existing, ...patch, id: existing.id };
      } else {
        const data = {
          ...base,
          studentEmail: '',
          parentContact: sub.telefono || '',
          parentEmail: '',
          billingMode: 'mensual',
          billingAmount: '',
          paymentStatus: 'al_corriente',
          nextDueDate: '',
          origenSolicitud: 'portal_operador',
        };
        const id = await Students.create(data);
        student = { id, ...data };
        studentsByMat.set(String(sub.matricula).trim().toLowerCase(), student);
      }

      // 2) Lista de ruta del operador (mes en curso)
      const key = `${route.id}|${operatorId}`;
      let list = listCache.get(key);
      if (!list) {
        const lists = await getLists();
        list =
          lists.find(
            (l) =>
              l.routeId === route.id &&
              (l.operatorId || '') === operatorId &&
              l.status !== 'cerrada' &&
              l.startDate <= today &&
              l.endDate >= today
          ) || null;
      }

      const row = buildStudentRow(student, list?.dates?.length ? list.dates : dates, ctx.concepts, route);

      if (!list) {
        const rows = [row].sort(priorityCompare);
        const data = {
          routeId: route.id,
          startDate: range.start,
          endDate: range.end,
          weekdays: [1, 2, 3, 4, 5],
          dates,
          rows,
          status: 'abierta',
          createdByUid: ctx.admin?.uid || '',
          createdByName: ctx.admin?.name || '',
          operatorId,
          operatorName,
          listName: `${range.start} ${range.end} | R-${routeNomenclature(route)}-${operatorName || 'SIN-OPERADOR'}`,
          origen: 'portal_operador',
        };
        const id = await RouteLists.create(data);
        list = { id, ...data };
        (await getLists()).unshift(list);
        await FinanceRecords.upsert(`${id}_${student.id}`, financePayload(row, list, route, school));
      } else {
        const others = (list.rows || []).filter((r) => r.studentId !== student.id);
        const rows = [...others, row].sort(priorityCompare);
        const issue = capacityIssue(rows, list.dates || dates, Number(unit?.capacity || 0));
        if (issue) {
          result.warnings.push(
            `${sub.name}: se creó el alumno, pero NO se agregó a la lista porque la unidad quedaría sobre su capacidad (${issue}).`
          );
          list = null;
        } else {
          await RouteLists.update(list.id, { rows, ...REVIEW_RESET });
          list = { ...list, rows, ...REVIEW_RESET };
          const idx = (await getLists()).findIndex((l) => l.id === list.id);
          if (idx >= 0) allLists[idx] = list;
          await FinanceRecords.upsert(`${list.id}_${student.id}`, financePayload(row, list, route, school));
        }
      }
      if (list) listCache.set(key, list);

      // 3) Cerrar la solicitud
      await updateDoc(doc(db, LINKS, sub.token, 'submissions', sub.id), {
        status: 'approved',
        studentId: student.id,
        listId: list?.id || '',
        reviewedByName: ctx.admin?.name || '',
        reviewedAt: serverTimestamp(),
        rejectReason: '',
      });
      result.ok.push(sub.name);
    } catch (err) {
      console.error('Error aprobando solicitud', sub, err);
      result.errors.push(`${sub.name || sub.matricula}: ${err.message || 'error desconocido'}`);
    }
  }
  return result;
}
