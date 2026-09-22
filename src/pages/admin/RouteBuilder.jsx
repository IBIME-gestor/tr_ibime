import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Plus, ArrowUp, ArrowDown, Trash2, Printer, Truck, Baby, Pencil,
} from 'lucide-react';
import { Students, Routes, Drivers, Schools } from '../../firebase/services';
import { TIPOS_SERVICIO, OPCIONES_SERVICIO, WEEKDAYS } from './Students';

const ORDER_FIELD = { morning: 'studentOrderMorning', afternoon: 'studentOrderAfternoon' };

const CHECKS = [
  { key: 'confirmado', label: 'Confirmado' },
  { key: 'notificadoPlantel', label: 'Notificado al plantel' },
  { key: 'conceptoCargado', label: 'Concepto cargado' },
  { key: 'pagado', label: 'Pagado' },
];

const emptyAddForm = { tipoServicio: 'completo', medioServicio: 'entrada', diasFijos: [] };

/**
 * Arma la lista de una ruta a punta de matrícula: se captura (o escanea)
 * una por una, el sistema jala nombre/plantel/nivel/grado/grupo del
 * expediente ya existente (esta pantalla NO da de alta alumnos nuevos,
 * solo los va enganchando a la ruta), se define su tipo de servicio, y
 * se van acomodando en el orden real de la parada. Ese orden es
 * exactamente el mismo que usa la app del operador al arrancar su
 * recorrido (route.studentOrderMorning/Afternoon) — no es una lista
 * aparte, es la misma.
 */
export default function RouteBuilder() {
  const [routes, setRoutesState] = useState([]);
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [drivers, setDrivers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [shift, setShift] = useState('morning');

  const [matricula, setMatricula] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupStudent, setLookupStudent] = useState(null);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [printMode, setPrintMode] = useState(null); // null | 'admin' | 'operator'
  const inputRef = useRef(null);

  useEffect(() => Routes.subscribe(setRoutesState), []);
  useEffect(() => {
    let alive = true;
    setCatalogLoading(true);
    Students.list().then((data) => {
      if (alive) { setAllStudents(data); setCatalogLoading(false); }
    }).catch(() => {
      if (alive) { setAllStudents([]); setCatalogLoading(false); }
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!routeId) {
      setStudents([]);
      setStudentsLoading(false);
      return;
    }
    let alive = true;
    setStudentsLoading(true);
    Students.listByRoute(routeId).then((data) => {
      if (alive) { setStudents(data); setStudentsLoading(false); }
    }).catch(() => {
      if (alive) { setStudents([]); setStudentsLoading(false); }
    });
    return () => { alive = false; };
  }, [routeId]);
  useEffect(() => Drivers.subscribe(setDrivers), []);
  useEffect(() => Schools.subscribe(setSchools), []);

  const route = routes.find((r) => r.id === routeId) || null;
  const driver = drivers.find((d) => d.id === route?.driverId);
  const nanny = drivers.find((d) => d.id === route?.nannyId);
  const school = schools.find((s) => s.id === route?.schoolId);

  const orderField = ORDER_FIELD[shift];
  const order = route?.[orderField] || [];

  // La lista visible: primero los que ya tienen un lugar en el orden
  // guardado, y al final (por si acaso) cualquiera que quedó asignado a
  // esta ruta pero todavía no tiene lugar en el orden.
  const list = useMemo(() => {
    if (!route) return [];
    const byId = Object.fromEntries(students.map((s) => [s.id, s]));
    const ordered = order.map((id) => byId[id]).filter(Boolean);
    const orderedIds = new Set(order);
    const leftover = students.filter((s) => s.routeId === route.id && !orderedIds.has(s.id));
    return [...ordered, ...leftover];
  }, [route, order, students]);

  function schoolName(id) {
    return schools.find((s) => s.id === id)?.name || '—';
  }

  function normalizeLookup(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s._-]+/g, '');
  }

  const searchResults = useMemo(() => {
    const q = normalizeLookup(matricula);
    if (!q || catalogLoading) return [];
    return allStudents
      .filter((s) => {
        const mat = normalizeLookup(s.matricula);
        const name = normalizeLookup(s.name);
        return mat.includes(q) || name.includes(q);
      })
      .sort((a, b) => {
        const aMat = normalizeLookup(a.matricula);
        const bMat = normalizeLookup(b.matricula);
        const aName = normalizeLookup(a.name);
        const bName = normalizeLookup(b.name);
        const score = (mat, name) => (mat === q ? 0 : mat.startsWith(q) ? 1 : name.startsWith(q) ? 2 : 3);
        return score(aMat, aName) - score(bMat, bName) || String(a.name || '').localeCompare(String(b.name || ''));
      })
      .slice(0, 8);
  }, [matricula, allStudents, catalogLoading]);

  function selectLookupStudent(found) {
    setLookupError('');
    setLookupStudent(found);
    setAddForm({
      tipoServicio: found.tipoServicio || 'completo',
      medioServicio: found.medioServicio || 'entrada',
      diasFijos: found.diasFijos || [],
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
    setLookupError('');
    const key = matricula.trim();
    if (!key) return;

    const normalizedKey = normalizeLookup(key);
    const foundByMatricula = allStudents.find(
      (s) => normalizeLookup(s.matricula) === normalizedKey
    );

    if (foundByMatricula) {
      selectLookupStudent(foundByMatricula);
      return;
    }

    const exactNames = allStudents.filter(
      (s) => normalizeLookup(s.name) === normalizedKey
    );
    if (exactNames.length === 1) {
      selectLookupStudent(exactNames[0]);
      return;
    }

    if (searchResults.length === 1) {
      selectLookupStudent(searchResults[0]);
      return;
    }

    // Último intento contra Firestore por si el catálogo todavía no alcanzó
    // a cargar o el dato fue agregado recientemente. La comparación también
    // se normaliza para tolerar mayúsculas, espacios, guiones y acentos.
    const fallback = await Students.findByMatricula(key);
    if (fallback) {
      selectLookupStudent(fallback);
      setAllStudents((prev) => prev.some((s) => s.id === fallback.id) ? prev : [...prev, fallback]);
      return;
    }

    setLookupStudent(null);
    setLookupError(
      searchResults.length > 1
        ? 'Hay varios alumnos que coinciden. Selecciona uno de la lista.'
        : 'No encontramos ese alumno. Verifica nombre o matrícula; no es necesario volver a cargar el padrón.'
    );
  }

  function toggleDiaFijo(dia) {
    const yaEsta = addForm.diasFijos.some((d) => d.dia === dia);
    const diasFijos = yaEsta
      ? addForm.diasFijos.filter((d) => d.dia !== dia)
      : [...addForm.diasFijos, { dia, servicio: 'ambas' }].sort((a, b) => a.dia - b.dia);
    setAddForm({ ...addForm, diasFijos });
  }

  async function handleAddToList() {
    if (!lookupStudent || !route) return;
    const updatedStudent = {
      ...lookupStudent,
      routeId: route.id,
      tipoServicio: addForm.tipoServicio,
      medioServicio: addForm.medioServicio,
      diasFijos: addForm.diasFijos,
    };
    await Students.update(lookupStudent.id, {
      routeId: route.id,
      tipoServicio: addForm.tipoServicio,
      medioServicio: addForm.medioServicio,
      diasFijos: addForm.diasFijos,
    });
    setStudents((prev) => prev.some((s) => s.id === updatedStudent.id)
      ? prev.map((s) => s.id === updatedStudent.id ? updatedStudent : s)
      : [...prev, updatedStudent]
    );
    if (!order.includes(lookupStudent.id)) {
      await Routes.update(route.id, { [orderField]: [...order, lookupStudent.id] });
    }
    resetAddFlow();
  }

  async function move(index, dir) {
    const ids = list.map((s) => s.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await Routes.update(route.id, { [orderField]: ids });
  }

  async function removeFromList(studentId) {
    if (!window.confirm('¿Quitar a este alumno de la ruta? Su expediente no se borra, solo se desasigna.')) return;
    await Routes.update(route.id, { [orderField]: order.filter((id) => id !== studentId) });
    await Students.update(studentId, { routeId: '' });
  }

  async function toggleCheck(student, key) {
    const current = student.onboarding || {};
    await Students.update(student.id, { onboarding: { ...current, [key]: !current[key] } });
  }

  function scheduleSummary(s) {
    const tipo = s.tipoServicio || 'completo';
    if (tipo === 'completo') return 'Completo';
    if (tipo === 'medio') return `Medio (${OPCIONES_SERVICIO[s.medioServicio] || 'entrada'})`;
    if (tipo === 'eventual_fijo') {
      return (s.diasFijos || []).map((d) => WEEKDAYS.find((w) => w.value === d.dia)?.label).join(' ') || 'Sin días';
    }
    return TIPOS_SERVICIO[tipo] || tipo;
  }

  function doPrint(mode) {
    setPrintMode(mode);
    setTimeout(() => window.print(), 50);
  }

  useEffect(() => {
    function afterPrint() { setPrintMode(null); }
    window.addEventListener('afterprint', afterPrint);
    return () => window.removeEventListener('afterprint', afterPrint);
  }, []);

  return (
    <div>
      <h1 className="admin-h1 mb-1">Formar lista de ruta</h1>
      <p className="text-sm text-navy-400 mb-5">
        Captura la matrícula, define el servicio y ve acomodando el orden exacto en el que el
        operador va a recoger o bajar a cada alumno.
      </p>

      <div className="flex flex-wrap gap-3 mb-5 print:hidden">
        <div>
          <label className="admin-label">Ruta</label>
          <select value={routeId} onChange={(e) => { setRouteId(e.target.value); resetAddFlow(); }} className="admin-select min-w-[220px]">
            <option value="">Selecciona una ruta…</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="admin-label">Turno</label>
          <select value={shift} onChange={(e) => setShift(e.target.value)} className="admin-select">
            <option value="morning">Matutino (ida)</option>
            <option value="afternoon">Vespertino (vuelta)</option>
          </select>
        </div>
      </div>

      {routeId && studentsLoading && (
        <div className="mb-4 rounded-lg border border-navy-100 bg-navy-50 px-4 py-3 text-sm text-navy-500 print:hidden">
          Cargando únicamente los alumnos asignados a esta ruta…
        </div>
      )}

      {route && (
        <>
          <div className="admin-card mb-5 print:hidden">
            <div className="flex flex-wrap gap-6 text-sm">
              <p><span className="text-navy-400">Plantel:</span> <span className="font-medium">{school?.name || '—'}</span></p>
              <p className="flex items-center gap-1.5">
                <Truck size={14} className="text-navy-400" />
                <span className="text-navy-400">Operador:</span> <span className="font-medium">{driver?.name || 'Sin asignar'}</span>
              </p>
              {route.nannyId && (
                <p className="flex items-center gap-1.5">
                  <Baby size={14} className="text-navy-400" />
                  <span className="text-navy-400">Nanny:</span> <span className="font-medium">{nanny?.name || '—'}</span>
                </p>
              )}
            </div>
          </div>

          {/* Búsqueda rápida por matrícula o nombre */}
          <form onSubmit={handleLookup} className="admin-card mb-5 print:hidden">
            <p className="font-display font-semibold text-navy-800 mb-1">Agregar alumno</p>
            <p className="text-xs text-navy-400 mb-3">Busca por matrícula o por nombre. El alumno debe estar dado de alta en el padrón; no necesitas volver a cargarlo.</p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={matricula}
                onChange={(e) => { setMatricula(e.target.value); setLookupError(''); }}
                placeholder="Escribe matrícula o nombre…"
                className="admin-input flex-1"
                autoFocus
              />
              <button type="submit" className="btn-admin-primary shrink-0">
                <Search size={14} /> Buscar
              </button>
            </div>

            {matricula.trim() && !lookupStudent && searchResults.length > 0 && (
              <div className="mt-2 border border-navy-100 rounded-lg overflow-hidden bg-white">
                {searchResults.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectLookupStudent(s)}
                    className="w-full text-left px-3 py-2.5 hover:bg-navy-50 border-b last:border-b-0 border-navy-100"
                  >
                    <span className="block font-medium text-navy-800">{s.name}</span>
                    <span className="block text-xs text-navy-400">Matrícula: {s.matricula || '—'} · {schoolName(s.schoolId)}</span>
                  </button>
                ))}
              </div>
            )}

            {lookupError && <p className="text-stop text-sm mt-2">{lookupError}</p>}

            {lookupStudent && (
              <div className="mt-4 p-4 rounded-lg border border-navy-100 bg-navy-50/50 cascade-item">
                <p className="font-medium text-navy-800">{lookupStudent.name}</p>
                <p className="text-xs text-navy-400 mb-3">
                  {schoolName(lookupStudent.schoolId)}
                  {(lookupStudent.nivel || lookupStudent.grado || lookupStudent.grupo) &&
                    ` · ${[lookupStudent.nivel, lookupStudent.grado, lookupStudent.grupo].filter(Boolean).join(' ')}`}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="admin-label">Tipo de servicio</label>
                    <select
                      value={addForm.tipoServicio}
                      onChange={(e) => setAddForm({ ...addForm, tipoServicio: e.target.value })}
                      className="admin-select"
                    >
                      {Object.entries(TIPOS_SERVICIO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  {addForm.tipoServicio === 'medio' && (
                    <div>
                      <label className="admin-label">¿Entrada o salida?</label>
                      <select
                        value={addForm.medioServicio}
                        onChange={(e) => setAddForm({ ...addForm, medioServicio: e.target.value })}
                        className="admin-select"
                      >
                        <option value="entrada">Solo entrada</option>
                        <option value="salida">Solo salida</option>
                      </select>
                    </div>
                  )}
                </div>

                {addForm.tipoServicio === 'eventual_fijo' && (
                  <div className="mt-3">
                    <label className="admin-label">Días de la semana</label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((d) => {
                        const active = addForm.diasFijos.some((x) => x.dia === d.value);
                        return (
                          <button
                            type="button"
                            key={d.value}
                            onClick={() => toggleDiaFijo(d.value)}
                            className={active ? 'badge cursor-pointer' : 'badge cursor-pointer opacity-40'}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-navy-400 mt-1">
                      Se agrega con "Entrada + Salida" por default — ajusta el detalle fino por día
                      después en Alumnos si algún día necesita solo entrada o solo salida.
                    </p>
                  </div>
                )}
                {addForm.tipoServicio === 'eventual_dia' && (
                  <p className="text-xs text-navy-400 mt-3">
                    Las fechas sueltas de "eventual día" se capturan después en el expediente del
                    alumno (Alumnos → editar) — aquí solo se deja agendado en la ruta.
                  </p>
                )}

                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={handleAddToList} className="btn-admin-primary">
                    <Plus size={14} /> Agregar a la lista
                  </button>
                  <button type="button" onClick={resetAddFlow} className="btn-admin-ghost">Cancelar</button>
                </div>
              </div>
            )}
          </form>

          {/* Botones de impresión */}
          <div className="flex flex-wrap gap-2 mb-3 print:hidden">
            <button onClick={() => doPrint('admin')} className="btn-admin-ghost">
              <Printer size={14} /> Imprimir (admin, con todo)
            </button>
            <button onClick={() => doPrint('operator')} className="btn-admin-ghost">
              <Printer size={14} /> Imprimir (operador, pasar lista)
            </button>
          </div>

          {/* Lista */}
          <div className="admin-card p-0 overflow-hidden roster-print">
            <p className="hidden print:block px-4 pt-4 font-display font-bold text-lg">
              {route.name} · {shift === 'morning' ? 'Matutino' : 'Vespertino'}
              {printMode === 'operator' ? ' · Lista de asistencia' : ' · Lista completa'}
            </p>
            <p className="hidden print:block px-4 pb-2 text-sm text-navy-500">
              {school?.name} · Operador: {driver?.name || '—'}
            </p>
            <div className="overflow-x-auto">
              <table className="table-admin">
                <thead>
                  <tr>
                    <th className="pl-5 print:hidden"></th>
                    <th className="pl-5">#</th>
                    <th>Alumno</th>
                    <th className="print:hidden">Plantel / Nivel</th>
                    <th className="print:hidden">Servicio</th>
                    {printMode !== 'operator' && (
                      <>
                        {CHECKS.map((c) => (
                          <th key={c.key} className="text-center">{c.label}</th>
                        ))}
                      </>
                    )}
                    {printMode === 'operator' && <th className="text-center">Asistió</th>}
                    <th className="pr-5 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s, i) => (
                    <tr key={s.id}>
                      <td className="pl-5 print:hidden">
                        <div className="flex flex-col">
                          <button onClick={() => move(i, -1)} disabled={i === 0} className="text-navy-400 disabled:opacity-20">
                            <ArrowUp size={13} />
                          </button>
                          <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="text-navy-400 disabled:opacity-20">
                            <ArrowDown size={13} />
                          </button>
                        </div>
                      </td>
                      <td className="pl-5 font-medium">{i + 1}</td>
                      <td>
                        <p className="font-medium text-navy-800">{s.name}</p>
                        <p className="text-xs text-navy-400">{s.matricula}</p>
                      </td>
                      <td className="print:hidden text-navy-500 text-xs">
                        {schoolName(s.schoolId)}
                        {(s.nivel || s.grado || s.grupoEsp || s.grupo || s.familiarResponsable || s.telefono || s.parentContact) && (
                          <span className="block">
                            {[s.nivel, s.grado, s.grupoEsp || s.grupo].filter(Boolean).join(' ')}
                            {(s.familiarResponsable || s.telefono || s.parentContact) && (
                              <span className="block text-navy-400">
                                {s.familiarResponsable || 'Sin responsable'} · {s.telefono || s.parentContact || 'Sin teléfono'}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="print:hidden text-xs">{scheduleSummary(s)}</td>
                      {printMode !== 'operator' && CHECKS.map((c) => (
                        <td key={c.key} className="text-center">
                          <input
                            type="checkbox"
                            checked={!!s.onboarding?.[c.key]}
                            onChange={() => toggleCheck(s, c.key)}
                            className="w-4 h-4 print:appearance-none print:w-3.5 print:h-3.5 print:border print:border-navy-400"
                          />
                        </td>
                      ))}
                      {printMode === 'operator' && (
                        <td className="text-center">
                          <span className="inline-block w-4 h-4 border border-navy-400" />
                        </td>
                      )}
                      <td className="pr-5 print:hidden">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/admin/alumnos?editar=${encodeURIComponent(s.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="link-action"
                            title="Editar datos del alumno"
                          >
                            <Pencil size={13} />
                          </Link>
                          <button onClick={() => removeFromList(s.id)} className="link-danger">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.length === 0 && (
                <p className="text-navy-400 text-sm py-6 text-center">
                  Todavía no hay alumnos en esta ruta/turno — agrégalos por matrícula arriba.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {!route && (
        <p className="text-navy-400 text-sm">Selecciona una ruta para empezar a formar su lista.</p>
      )}
    </div>
  );
}
