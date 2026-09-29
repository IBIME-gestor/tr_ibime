import { where, orderBy, doc, setDoc, deleteDoc, collection, collectionGroup, writeBatch, addDoc, getDocs, query, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import {
  listAll,
  subscribeAll,
  getOne,
  createDoc,
  updateDocById,
  removeDoc,
} from './db';

// Firestore acepta hasta 500 operaciones por lote; dejamos margen.
const BATCH_CHUNK_SIZE = 400;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Mantiene publicStudentIndex/{matricula} en sincronía con el alumno.
 * Es lo único que la vista pública del padre de familia puede leer sin
 * iniciar sesión: matrícula -> a qué ruta pertenece. No incluye domicilio,
 * escuela, ni ningún otro dato del expediente.
 */
async function syncPublicStudentIndex(student) {
  if (!student?.matricula || !student?.routeId) return;
  await setDoc(doc(db, 'publicStudentIndex', student.matricula.trim()), {
    studentId: student.id,
    name: student.name || '',
    routeId: student.routeId,
  });
}

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
/*  Usuarios / acceso                                                  */
/* ------------------------------------------------------------------ */
export const Users = {
  list: () => listAll('users', [orderBy('name')]),

  subscribe: (cb) =>
    subscribeAll('users', [orderBy('name')], cb),

  get: (id) =>
    getOne('users', id),

  create: (data) =>
    createDoc('users', data),

  update: (id, data) =>
    updateDocById('users', id, data),

  remove: (id) =>
    removeDoc('users', id),
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

  async create(data) {
    const id = await createDoc('students', data);
    await syncPublicStudentIndex({ id, ...data });
    return id;
  },

  async update(id, data) {
    await updateDocById('students', id, data);
    const full = await getOne('students', id);
    await syncPublicStudentIndex(full);
  },

  async remove(id) {
    const existing = await getOne('students', id);
    await removeDoc('students', id);
    if (existing?.matricula) {
      await deleteDoc(doc(db, 'publicStudentIndex', existing.matricula.trim()));
    }
  },

  /**
   * Cambia el estatus de pago SIN registrar un cobro (para marcar
   * "Pendiente de pago" o "En mora"). Siempre deja sello de quién y
   * cuándo exactamente se hizo el cambio — es lo que alimenta el
   * "actualizado el dd/mm/aaaa HH:mm:ss" que se ve en Caja y Alumnos.
   */
  async setPaymentStatus(id, paymentStatus, byName) {
    await updateDocById('students', id, {
      paymentStatus,
      paymentStatusUpdatedAt: serverTimestamp(),
      paymentStatusUpdatedBy: byName || '',
    });
  },

  /**
   * Registra un pago con folio propio en students/{id}/payments — el
   * inicio de una bitácora de cobranza real (monto, método, quién lo
   * capturó y a qué hora exacta), no solo un banderazo de "pagado".
   * Además marca al alumno como al corriente, guarda cuándo vence su
   * SIGUIENTE pago (para que la mora se calcule sola contra la fecha de
   * hoy, sin que nadie tenga que ir a marcarla a mano) y deja el último
   * pago a la mano en su propio expediente.
   */
  async registerPayment(id, { amount, method, note, nextDueDate, byName, byUid, routeId, unitId, listId }) {
    const numAmount = amount === '' || amount == null ? null : Number(amount);
    const paymentRef = await addDoc(collection(db, 'students', id, 'payments'), {
      amount: numAmount,
      method: method || 'efectivo',
      note: note || '',
      registeredByName: byName || '',
      registeredByUid: byUid || '',
      routeId: routeId || '',
      unitId: unitId || '',
      listId: listId || '',
      cancelled: false,
      at: serverTimestamp(),
    });
    await updateDocById('students', id, {
      paymentStatus: 'al_corriente',
      nextDueDate: nextDueDate || null,
      lastPaymentAt: serverTimestamp(),
      lastPaymentAmount: numAmount,
      lastPaymentMethod: method || 'efectivo',
      paymentStatusUpdatedAt: serverTimestamp(),
      paymentStatusUpdatedBy: byName || '',
    });
    return paymentRef.id;
  },

  /**
   * Cancela/reembolsa un pago ya registrado. NO se borra (se necesita
   * para la auditoría): se marca como cancelado, con quién y cuándo, y
   * por qué. El alumno regresa a "pendiente de pago" — no se asume que
   * automáticamente está en mora, eso lo decide la fecha de vencimiento.
   */
  async cancelPayment(studentId, paymentId, reason, byName) {
    await setDoc(
      doc(db, 'students', studentId, 'payments', paymentId),
      { cancelled: true, cancelledAt: serverTimestamp(), cancelledBy: byName || '', cancelReason: reason || '' },
      { merge: true }
    );
    await updateDocById('students', studentId, {
      paymentStatus: 'desfase',
      paymentStatusUpdatedAt: serverTimestamp(),
      paymentStatusUpdatedBy: byName || '',
    });
  },

  /** Bitácora completa de pagos de un alumno (folio, monto, método, fecha). */
  listPayments: (id) => listAll(`students/${id}/payments`, [orderBy('at', 'desc')]),

  /**
   * Todos los pagos de TODOS los alumnos entre dos fechas (para la
   * proyección/corte de ingresos y la conciliación). `since`/`until`
   * son objetos Date.
   */
  async listPaymentsBetween(since, until) {
    const q = query(
      collectionGroup(db, 'payments'),
      where('at', '>=', since),
      where('at', '<=', until),
      orderBy('at', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, studentId: d.ref.parent.parent.id, ...d.data() }));
  },

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

  /**
   * Alta masiva por lotes (CSV de 3500+ alumnos). Muchísimo más rápido
   * que crear uno por uno: agrupa en lotes de hasta 400 escrituras y
   * los manda en paralelo-secuencial. No asigna ruta ni calendario —
   * eso se hace después con bulkAssignRoute o editando cada alumno.
   */
  async bulkImport(rows) {
    let ok = 0;
    for (const group of chunk(rows, BATCH_CHUNK_SIZE)) {
      const batch = writeBatch(db);
      group.forEach((row) => {
        const ref = doc(collection(db, 'students'));
        batch.set(ref, { routeId: '', ...row });
      });
      await batch.commit();
      ok += group.length;
    }
    return ok;
  },

  /**
   * Asignación masiva de ruta por matrícula (para no hacerlo de uno en
   * uno en la pantalla de Rutas). items: [{ id, matricula, name, routeId }].
   * Actualiza el alumno Y su espejo público (publicStudentIndex) en el
   * mismo lote, sin leer cada documento de vuelta.
   */
  async bulkAssignRoute(items) {
    let ok = 0;
    for (const group of chunk(items, BATCH_CHUNK_SIZE)) {
      const batch = writeBatch(db);
      group.forEach(({ id, matricula, name, routeId }) => {
        batch.update(doc(db, 'students', id), { routeId });
        if (routeId && matricula) {
          batch.set(doc(db, 'publicStudentIndex', matricula.trim()), {
            studentId: id,
            name: name || '',
            routeId,
          });
        }
      });
      await batch.commit();
      ok += group.length;
    }
    return ok;
  },
};


/* ------------------------------------------------------------------ */
/*  Conceptos de cobro                                                 */
/*  Los conceptos son independientes de las rutas. Una ruta solamente  */
/*  selecciona qué concepto usa para cada modalidad de servicio.       */
/* ------------------------------------------------------------------ */
export const PricingConcepts = {
  list: () => listAll('pricingConcepts', [orderBy('name')]),
  get: (id) => getOne('pricingConcepts', id),
  create: (data) => createDoc('pricingConcepts', data),
  update: (id, data) => updateDocById('pricingConcepts', id, data),
  remove: (id) => removeDoc('pricingConcepts', id),
};

// Alias de compatibilidad para cualquier pantalla que todavía importe Pricing.
export const Pricing = PricingConcepts;

/* ------------------------------------------------------------------ */
/*  Listas operativas por periodo                                      */
/* ------------------------------------------------------------------ */
export const RouteLists = {
  list: () => listAll('routeLists', [orderBy('startDate', 'desc')]),
  get: (id) => getOne('routeLists', id),
  create: (data) => createDoc('routeLists', data),
  update: (id, data) => updateDocById('routeLists', id, data),
  remove: (id) => removeDoc('routeLists', id),
};

/* ------------------------------------------------------------------ */
/*  Rutas (routes) — asigna chofer + nanny + unidad + plantel + turno   */
/* ------------------------------------------------------------------ */
export const FinanceRecords = {
  list: () => listAll('financeRecords', [orderBy('studentName')]),
  subscribe: (cb) => subscribeAll('financeRecords', [orderBy('studentName')], cb),
  listByStudent: (studentId) => listAll('financeRecords', [where('studentId', '==', studentId)]),
  get: (id) => getOne('financeRecords', id),
  upsert: async (id, data) => { await setDoc(doc(db, 'financeRecords', id), { ...data, updatedAt: serverTimestamp() }, { merge: true }); return id; },
  update: (id, data) => updateDocById('financeRecords', id, { ...data, updatedAt: serverTimestamp() }),
  remove: (id) => removeDoc('financeRecords', id),
  async removeByList(listId) {
    if (!listId) return;
    const rows = await listAll('financeRecords', [where('listId', '==', listId)]);
    for (const row of rows) await removeDoc('financeRecords', row.id);
  },

  /**
   * Sincroniza un pago originado en Caja con el registro financiero y la
   * fila de la lista operativa que corresponden al alumno. No toca
   * registros históricos: primero busca el registro abierto del periodo
   * actual y, si no existe, usa el registro abierto más reciente.
   */
  async syncStudentPayment(studentId, { paid, paymentId = '', byName = '', financeId = '' } = {}) {
    if (!studentId) return { financeId: '', listId: '', found: false };

    const records = await this.listByStudent(studentId);
    if (!records.length) return { financeId: '', listId: '', found: false };

    const localDate = new Date();
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    const today = localDate.toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;

    const exact = financeId ? records.find((r) => r.id === financeId) : null;
    if (exact) {
      // Si Caja ya conoce el registro financiero visible en pantalla, usa
      // exactamente ese registro y no otro periodo del mismo alumno.
      const financePatch = paid
        ? { cobrado: true, pagoId: paymentId || exact.pagoId || '', cobradoAt: new Date().toISOString(), cobradoBy: byName || '' }
        : { cobrado: false, cobradoAt: '', cobradoBy: '' };
      await updateDocById('financeRecords', exact.id, financePatch);
      if (exact.listId) {
        const list = await getOne('routeLists', exact.listId);
        if (list) {
          const rows = (list.rows || []).map((row) =>
            row.studentId === studentId
              ? { ...row, paid: !!paid, ...(paid && paymentId ? { paymentId } : {}) }
              : row
          );
          await updateDocById('routeLists', exact.listId, { rows });
        }
      }
      return { financeId: exact.id, listId: exact.listId || '', found: true };
    }

    const open = records.filter((r) => !r.cobrado);
    const inCurrentPeriod = open.find((r) =>
      r.periodoInicio && r.periodoFin && r.periodoInicio <= today && today <= r.periodoFin
    );
    const currentMonth = open.find((r) =>
      (r.periodoFin || '') >= monthStart && (r.periodoInicio || '') <= today
    );
    const sorted = [...records].sort((a, b) => String(b.periodoFin || '').localeCompare(String(a.periodoFin || '')));
    const target = inCurrentPeriod || currentMonth || open[0] || sorted[0];
    if (!target) return { financeId: '', listId: '', found: false };

    const financePatch = paid
      ? { cobrado: true, pagoId: paymentId || target.pagoId || '', cobradoAt: new Date().toISOString(), cobradoBy: byName || '' }
      : { cobrado: false, cobradoAt: '', cobradoBy: '' };

    await updateDocById('financeRecords', target.id, financePatch);

    if (target.listId) {
      const list = await getOne('routeLists', target.listId);
      if (list) {
        const rows = (list.rows || []).map((row) =>
          row.studentId === studentId
            ? { ...row, paid: !!paid, ...(paid && paymentId ? { paymentId } : {}) }
            : row
        );
        await updateDocById('routeLists', target.listId, { rows });
      }
    }

    return { financeId: target.id, listId: target.listId || '', found: true };
  },
};


/* ------------------------------------------------------------------ */
/*  Conciliación con reportes de Cometa                                */
/* ------------------------------------------------------------------ */
export const Cometa = {
  createImport: (data) => createDoc('cometaImports', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
    status: 'procesado',
  }),
  listImports: () => listAll('cometaImports', [orderBy('createdAt', 'desc')]),
  getImport: (id) => getOne('cometaImports', id),
  async bulkCreateRecords(importId, rows) {
    for (const group of chunk(rows, BATCH_CHUNK_SIZE)) {
      const batch = writeBatch(db);
      group.forEach((row, i) => {
        const id = `${importId}_${row.sheetType}_${row.rowNumber}_${i}`;
        batch.set(doc(db, 'cometaRecords', id), {
          importId,
          ...row,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  },
  listByImport: (importId) => listAll('cometaRecords', [where('importId', '==', importId)]),
  async latestPending() {
    const imports = await listAll('cometaImports', [orderBy('createdAt', 'desc')]);
    if (!imports.length) return { importInfo: null, rows: [] };
    const rows = await this.listByImport(imports[0].id);
    return { importInfo: imports[0], rows: rows.filter((r) => r.sheetType === 'pending') };
  },

  /**
   * Confirma un registro de Cometa sin borrar el origen. Para un pago,
   * crea la bitácora del alumno, marca Finanzas y la fila de Lista.
   * Para un concepto pendiente, solo marca el concepto como cargado.
   */
  async confirmRecord({ importId, row, byName = '' }) {
    if (!row?.student?.id) throw new Error('El registro no tiene un alumno de Ruta Segura asociado.');
    const studentId = row.student.id;
    const existingFinance = row.financeRecord || (await FinanceRecords.listByStudent(studentId)).find((f) =>
      !row.concepto || !f.conceptName || normText(f.conceptName).includes(normText(row.concepto)) || normText(row.concepto).includes(normText(f.conceptName))
    );

    let financeId = existingFinance?.id || '';
    let listId = existingFinance?.listId || row.routeRow?.listId || '';
    if (!listId) {
      const lists = await RouteLists.list();
      const found = lists.find((list) => (list.rows || []).some((r) => r.studentId === studentId));
      if (found) listId = found.id;
    }

    if (!financeId) {
      financeId = `cometa_${studentId}_${String(row.ciclo || 'actual').replace(/[^a-zA-Z0-9]+/g, '_')}_${normText(row.concepto).slice(0, 30) || 'concepto'}`;
      await FinanceRecords.upsert(financeId, {
        listId,
        studentId,
        studentName: row.student?.name || row.alumno || '',
        matricula: row.student?.matricula || row.matricula || '',
        schoolId: row.student?.schoolId || '',
        schoolName: row.school?.name || row.plantel || '',
        concepto: row.concepto || '',
        conceptName: row.concepto || '',
        conceptoCargado: false,
        cobrado: false,
        montoEstimado: Number(row.monto || row.student?.billingAmount || 0),
        periodoInicio: '',
        periodoFin: '',
        tipoServicio: row.student?.tipoServicio || '',
        medioServicio: row.student?.medioServicio || '',
        origen: 'cometa',
      });
    }

    if (row.sheetType === 'pending') {
      await FinanceRecords.update(financeId, {
        conceptoCargado: true,
        conceptName: row.concepto || existingFinance?.conceptName || '',
        concepto: row.concepto || existingFinance?.concepto || '',
        origen: 'cometa',
        cometaImportId: importId,
        cometaConfirmedAt: new Date().toISOString(),
        cometaConfirmedBy: byName || '',
      });
      await updateCometaRow(importId, row, { confirmed: true, confirmedType: 'concepto', confirmedBy: byName || '' });
      return { message: `Concepto confirmado para ${row.student.name}.`, financeId, listId };
    }

    if (existingFinance?.cobrado || row.routeRow?.paid) {
      await updateCometaRow(importId, row, { confirmed: true, confirmedType: 'already_paid', confirmedBy: byName || '' });
      return { message: `${row.student.name} ya aparece pagado en Ruta Segura; no se duplicó el cobro.`, financeId, listId };
    }

    const paymentId = await Students.registerPayment(studentId, {
      amount: Number(row.monto || 0),
      method: 'cometa',
      note: `Pago conciliado desde Cometa · ${row.concepto || ''} · ${row.fechaPago || ''}`,
      nextDueDate: existingFinance?.agreementDueDate || existingFinance?.fechaVencimiento || null,
      byName,
      byUid: '',
      routeId: row.student?.routeId || '',
      unitId: '',
      listId,
    });

    await FinanceRecords.update(financeId, {
      cobrado: true,
      conceptoCargado: true,
      pagoId: paymentId,
      montoEstimado: Number(row.monto || existingFinance?.montoEstimado || row.student?.billingAmount || 0),
      cobradoAt: row.fechaPago || new Date().toISOString(),
      cobradoBy: byName || '',
      origen: 'cometa',
      cometaImportId: importId,
      cometaRowNumber: row.rowNumber,
      cometaConfirmedAt: new Date().toISOString(),
      cometaConfirmedBy: byName || '',
    });

    if (listId) {
      const list = await RouteLists.get(listId);
      if (list) {
        const nextRows = (list.rows || []).map((x) => x.studentId === studentId ? { ...x, paid: true, paymentId } : x);
        await RouteLists.update(listId, { rows: nextRows });
      }
    }
    await updateCometaRow(importId, row, { confirmed: true, confirmedType: 'paid', confirmedBy: byName || '', paymentId });
    return { message: `Pago confirmado para ${row.student.name}. Caja, Finanzas y Lista quedaron actualizados.`, financeId, listId, paymentId };
  },
};

function normText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
async function updateCometaRow(importId, row, patch) {
  if (!importId || !row?._key) return;
  await updateDocById('cometaRecords', `${importId}_${row._key}`, patch);
}

export const Routes = {
  list: () => listAll('routes', [orderBy('name')]),
  listBySchool: (schoolId) =>
    listAll('routes', [where('schoolId', '==', schoolId), orderBy('name')]),
  listByDriver: (driverId) =>
    listAll('routes', [where('driverId', '==', driverId)]),
  listByNanny: (nannyId) =>
    listAll('routes', [where('nannyId', '==', nannyId)]),
  subscribe: (cb) => subscribeAll('routes', [orderBy('name')], cb),
  get: (id) => getOne('routes', id),
  create: (data) =>
    createDoc('routes', {
      // studentOrderMorning / studentOrderAfternoon guardan el ARREGLO
      // de IDs de alumnos en el orden en que normalmente se recogen/bajan.
      // Se recalculan solos después de cada recorrido real.
      studentOrderMorning: [],
      studentOrderAfternoon: [],
      // Minutos promedio (histórico) entre parada N-1 y parada N, indexado
      // por posición. Se recalcula solo al cerrar cada recorrido y
      // alimenta el ETA aproximado que ve el padre de familia.
      avgStopMinutesMorning: [],
      avgStopMinutesAfternoon: [],
      pricingConcepts: {
        completo: '',
        medio_entrada: '',
        medio_salida: '',
        por_dia: '',
      },
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

/**
 * "Buzón" para la extensión oficial de Firebase "Trigger Email"
 * (firestore-send-email): esta app solo escribe aquí el correo que hay
 * que mandar; quien REALMENTE lo envía es la extensión, ya configurada
 * en la consola de Firebase con el relay SMTP de Workspace. Sin la
 * extensión instalada, estos documentos se quedan aquí guardados sin
 * enviarse — no truena nada, pero tampoco llega el correo hasta que se
 * instale y configure (ver instrucciones aparte).
 */
export const Mail = {
  queue: ({ to, subject, html }) =>
    createDoc('mail', { to: [to], message: { subject, html } }),
};

/* ------------------------------------------------------------------ */
/*  Notificaciones masivas                                             */
/*  La app solo registra la campaña. El envío real lo hace Google       */
/*  Apps Script + Gmail Workspace, para evitar servicios pagados.      */
/* ------------------------------------------------------------------ */
export const Notifications = {
  list: () => listAll('notificationCampaigns', [orderBy('createdAt', 'desc')]),
  get: (id) => getOne('notificationCampaigns', id),
  create: async (data) => {
    const id = data.id || null;
    if (!id) return createDoc('notificationCampaigns', data);
    await setDoc(doc(db, 'notificationCampaigns', id), data, { merge: true });
    return id;
  },
  update: (id, data) => updateDocById('notificationCampaigns', id, { ...data, updatedAt: serverTimestamp() }),
};


/* ------------------------------------------------------------------ */
/*  Correcciones de integridad de cobros — añadido sin eliminar código */
/* ------------------------------------------------------------------ */
/*
 * IMPORTANTE:
 * - Se conserva íntegramente la implementación original de arriba.
 * - Estas funciones sustituyen únicamente los métodos sensibles después
 *   de que los objetos ya fueron definidos.
 * - Un "paid" o "al_corriente" administrativo NO crea un cobro.
 * - Un cobro real siempre necesita pagoId.
 */

const _originalStudentsSetPaymentStatus = Students.setPaymentStatus;

Students.setPaymentStatus = async function setPaymentStatusSafe(id, paymentStatus, byName) {
  await _originalStudentsSetPaymentStatus(id, paymentStatus, byName);

  // Reflejar el estatus en Finanzas sin convertirlo en un pago.
  const financeRecords = await FinanceRecords.listByStudent(id);
  const localDate = new Date();
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  const today = localDate.toISOString().slice(0, 10);

  for (const finance of financeRecords) {
    const hasRealPayment = finance.cobrado === true && !!finance.pagoId;

    // Un cambio manual a pendiente/mora afecta el registro vigente,
    // pero no borra pagos históricos ya conciliados de periodos pasados.
    const isCurrentFinance =
      !finance.periodoFin ||
      String(finance.periodoFin) >= today;

    const shouldClearCurrentPayment =
      paymentStatus !== 'al_corriente' &&
      isCurrentFinance;

    const patch = {
      paymentStatus,
      paymentStatusUpdatedAt: serverTimestamp(),
      paymentStatusUpdatedBy: byName || '',
    };

    // Sin folio nunca hay cobro. Si el usuario cambia el estatus del
    // periodo vigente a pendiente/mora, también se desmarca ese cobro.
    if (!hasRealPayment || shouldClearCurrentPayment) {
      patch.cobrado = false;
      patch.pagoId = '';
      patch.cobradoAt = '';
      patch.cobradoBy = '';
    }

    await updateDocById('financeRecords', finance.id, {
      ...patch,
      updatedAt: serverTimestamp(),
    });

    // La Lista solo se desmarca para el registro vigente que dejó de estar
    // pagado; los históricos reales permanecen intactos.
    if ((!hasRealPayment || shouldClearCurrentPayment) && finance.listId) {
      const list = await getOne('routeLists', finance.listId);
      if (list) {
        const rows = (list.rows || []).map((row) =>
          row.studentId === id
            ? { ...row, paid: false, paymentId: '' }
            : row
        );

        await updateDocById('routeLists', finance.listId, {
          rows,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }
};


const _originalFinanceUpsert = FinanceRecords.upsert;

FinanceRecords.upsert = async function upsertSafe(id, data) {
  const patch = { ...data };

  // Nunca guardar cobrado=true si no existe folio.
  if (patch.cobrado === true && !(patch.pagoId || '')) {
    patch.cobrado = false;
    patch.pagoId = '';
    patch.cobradoAt = '';
    patch.cobradoBy = '';
  }

  // Al desmarcar cobrado también se limpian los datos que lo harían
  // parecer un pago real en Caja.
  if (patch.cobrado === false) {
    patch.pagoId = '';
    patch.cobradoAt = '';
    patch.cobradoBy = '';
  }

  return _originalFinanceUpsert(id, patch);
};


const _originalFinanceUpdate = FinanceRecords.update;

FinanceRecords.update = async function updateSafe(id, data) {
  const current = await getOne('financeRecords', id);
  const patch = { ...data };

  if (patch.cobrado === true) {
    const paymentId = patch.pagoId || current?.pagoId || '';

    if (!paymentId) {
      patch.cobrado = false;
      patch.pagoId = '';
      patch.cobradoAt = '';
      patch.cobradoBy = '';
    } else {
      patch.pagoId = paymentId;
    }
  }

  if (patch.cobrado === false) {
    patch.pagoId = '';
    patch.cobradoAt = '';
    patch.cobradoBy = '';
  }

  return _originalFinanceUpdate(id, patch);
};


const _originalSyncStudentPayment = FinanceRecords.syncStudentPayment;

FinanceRecords.syncStudentPayment = async function syncStudentPaymentSafe(
  studentId,
  { paid, paymentId = '', byName = '', financeId = '' } = {}
) {
  /*
   * El método original se conserva. Antes de llamarlo, si Caja intenta
   * mandar paid=true sin folio, lo convertimos en NO pagado.
   */
  const realPaid = !!paid && !!paymentId;

  const result = await _originalSyncStudentPayment(studentId, {
    paid: realPaid,
    paymentId: realPaid ? paymentId : '',
    byName,
    financeId,
  });

  /*
   * Cuando se desmarca, limpiamos explícitamente el folio de Finanzas y
   * de la Lista para que no quede un "cobrado" fantasma.
   */
  if (!realPaid && result?.found && result.financeId) {
    await updateDocById('financeRecords', result.financeId, {
      cobrado: false,
      pagoId: '',
      cobradoAt: '',
      cobradoBy: '',
      updatedAt: serverTimestamp(),
    });

    if (result.listId) {
      const list = await getOne('routeLists', result.listId);
      if (list) {
        const rows = (list.rows || []).map((row) =>
          row.studentId === studentId
            ? { ...row, paid: false, paymentId: '' }
            : row
        );

        await updateDocById('routeLists', result.listId, {
          rows,
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  return result;
};
