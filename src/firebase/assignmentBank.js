import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';

/**
 * Banco de alumnos por asignar
 * ---------------------------------------------------------------------
 * Cuando el operador agrega a un alumno "al momento" durante un recorrido
 * (porque se subió de último minuto y todavía no estaba configurado en la
 * ruta), además de subirlo al recorrido se deja un registro aquí para que
 * administración lo vea aparte y lo asigne a una lista de ruta.
 *
 *   assignmentBank/{studentId}          <- un documento por alumno
 *     studentId, matricula, name, schoolId
 *     studentRouteId   ruta que tenía configurada el alumno al agregarlo ('' si ninguna)
 *     routeId, routeName               ruta del recorrido donde se agregó
 *     configured       true si el alumno ya pertenecía a esa ruta
 *     status           'pending' | 'assigned' | 'dismissed'
 *     events           [{ date, shift, tripId, routeId, byName }]  cada vez que se agregó
 *     lastAddedAt, addedByName, addedByRole
 *
 * Un mismo alumno agregado varios días sigue siendo UN solo registro con
 * varios eventos: así administración ve cuántas veces ha viajado sin
 * estar asignado.
 */

const COL = 'assignmentBank';

/**
 * Registra (o reabre) al alumno en el banco. Nunca debe interrumpir el
 * recorrido: si falla, el llamador solo lo anota en consola.
 */
export async function addToAssignmentBank({ student, trip, route, profile }) {
  if (!student?.id) return;
  const ref = doc(db, COL, student.id);
  await setDoc(
    ref,
    {
      studentId: student.id,
      matricula: student.matricula || '',
      name: student.name || '',
      schoolId: student.schoolId || route?.schoolId || '',
      studentRouteId: student.routeId || '',
      routeId: trip?.routeId || route?.id || '',
      routeName: route?.name || '',
      shift: trip?.shift || '',
      date: trip?.date || '',
      tripId: trip?.id || '',
      configured: !!student.routeId && student.routeId === (trip?.routeId || route?.id),
      addedByStaffId: profile?.staffId || '',
      addedByName: profile?.name || '',
      addedByRole: profile?.role || '',
      status: 'pending',
      events: arrayUnion({
        date: trip?.date || '',
        shift: trip?.shift || '',
        tripId: trip?.id || '',
        routeId: trip?.routeId || route?.id || '',
        byName: profile?.name || '',
      }),
      lastAddedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/* ------------------------------ administración ---------------------------- */

export const AssignmentBank = {
  subscribe(cb, onError) {
    return onSnapshot(
      collection(db, COL),
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error('Error en el banco por asignar:', err);
        if (onError) onError(err);
      }
    );
  },

  markAssigned: (id, byName, info = {}) =>
    updateDoc(doc(db, COL, id), {
      status: 'assigned',
      resolvedByName: byName || '',
      resolvedAt: serverTimestamp(),
      resolvedInfo: info,
      updatedAt: serverTimestamp(),
    }),

  dismiss: (id, byName) =>
    updateDoc(doc(db, COL, id), {
      status: 'dismissed',
      resolvedByName: byName || '',
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),

  reopen: (id) =>
    updateDoc(doc(db, COL, id), {
      status: 'pending',
      updatedAt: serverTimestamp(),
    }),

  remove: (id) => deleteDoc(doc(db, COL, id)),
};
