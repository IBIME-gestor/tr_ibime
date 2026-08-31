import { where, orderBy } from 'firebase/firestore';
import {
  listAll,
  subscribeAll,
  getOne,
  createDoc,
  updateDocById,
  removeDoc,
} from './db';

/* ------------------------------------------------------------------ */
/*  Planteles (schools)                                                */
/* ------------------------------------------------------------------ */
export const Schools = {
  list: () => listAll('schools', [orderBy('name')]),
  subscribe: (cb) => subscribeAll('schools', [orderBy('name')], cb),
  create: (data) => createDoc('schools', data),
  update: (id, data) => updateDocById('schools', id, data),
  remove: (id) => removeDoc('schools', id),
};

/* ------------------------------------------------------------------ */
/*  Unidades (vehicles)                                                */
/* ------------------------------------------------------------------ */
export const Units = {
  list: () => listAll('units', [orderBy('plate')]),
  subscribe: (cb) => subscribeAll('units', [orderBy('plate')], cb),
  create: (data) => createDoc('units', data),
  update: (id, data) => updateDocById('units', id, data),
  remove: (id) => removeDoc('units', id),
};

/* ------------------------------------------------------------------ */
/*  Choferes / nannies (drivers)                                       */
/* ------------------------------------------------------------------ */
export const Drivers = {
  list: () => listAll('drivers', [orderBy('name')]),
  listBySchool: (schoolId) =>
    listAll('drivers', [where('schoolId', '==', schoolId), orderBy('name')]),
  subscribe: (cb) => subscribeAll('drivers', [orderBy('name')], cb),
  get: (id) => getOne('drivers', id),
  create: (data) => createDoc('drivers', data),
  update: (id, data) => updateDocById('drivers', id, data),
  remove: (id) => removeDoc('drivers', id),
};

/* ------------------------------------------------------------------ */
/*  Alumnos (students)                                                  */
/* ------------------------------------------------------------------ */
export const Students = {
  list: () => listAll('students', [orderBy('name')]),
  listBySchool: (schoolId) =>
    listAll('students', [where('schoolId', '==', schoolId), orderBy('name')]),
  listByRoute: (routeId) =>
    listAll('students', [where('routeId', '==', routeId), orderBy('name')]),
  subscribe: (cb) => subscribeAll('students', [orderBy('name')], cb),
  get: (id) => getOne('students', id),
  create: (data) => createDoc('students', data),
  update: (id, data) => updateDocById('students', id, data),
  remove: (id) => removeDoc('students', id),

  /**
   * Búsqueda por matrícula exacta. Se usa cuando el chofer digita
   * la matrícula del alumno el primer día (antes de tener orden de ruta).
   */
  async findByMatricula(matricula) {
    const results = await listAll('students', [
      where('matricula', '==', matricula.trim()),
    ]);
    return results[0] || null;
  },
};

/* ------------------------------------------------------------------ */
/*  Rutas (routes) — asigna chofer + nanny + unidad + plantel + turno   */
/* ------------------------------------------------------------------ */
export const Routes = {
  list: () => listAll('routes', [orderBy('name')]),
  listBySchool: (schoolId) =>
    listAll('routes', [where('schoolId', '==', schoolId), orderBy('name')]),
  listByDriver: (driverId) =>
    listAll('routes', [where('driverId', '==', driverId)]),
  subscribe: (cb) => subscribeAll('routes', [orderBy('name')], cb),
  get: (id) => getOne('routes', id),
  create: (data) =>
    createDoc('routes', {
      // studentOrderMorning / studentOrderAfternoon guardan el ARREGLO
      // de IDs de alumnos en el orden en que normalmente se recogen/bajan.
      // Se recalculan solos después de cada recorrido real.
      studentOrderMorning: [],
      studentOrderAfternoon: [],
      ...data,
    }),
  update: (id, data) => updateDocById('routes', id, data),
  remove: (id) => removeDoc('routes', id),

  /**
   * Guarda el orden real en que se atendió a los alumnos en un recorrido,
   * para que al día siguiente la lista ya venga pre-ordenada.
   */
  async saveOrderFromTrip(routeId, shift, orderedStudentIds) {
    const field = shift === 'morning' ? 'studentOrderMorning' : 'studentOrderAfternoon';
    await updateDocById('routes', routeId, { [field]: orderedStudentIds });
  },
};
