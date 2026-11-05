import { useEffect, useMemo, useState } from 'react';
import { Inbox, UserPlus, Undo2, XCircle, CheckCircle2, AlertTriangle, RefreshCw, Search, Trash2 } from 'lucide-react';
import { RouteLists, Routes, Units, PricingConcepts, Schools, Students } from '../../firebase/services';
import { AssignmentBank } from '../../firebase/assignmentBank';
import { useAuth } from '../../context/AuthContext';
import { fmtDateOnly } from '../../utils/dates';
import { normalizeText } from '../../utils/search';
import QuickAddToList from './QuickAddToList';

/**
 * Operación / Banco por asignar
 * ---------------------------------------------------------------------
 * Alumnos que el operador agregó "al momento" en un recorrido porque aún
 * no estaban configurados (se subieron de último minuto). Se guardan
 * aparte de las listas que ya tienes: aquí los ves, los asignas a la
 * lista de su ruta (con la misma carga exprés de Cometa) o los descartas.
 */

const TABS = [
  { key: 'pending', label: 'Por asignar' },
  { key: 'assigned', label: 'Asignados' },
  { key: 'dismissed', label: 'Descartados' },
];

const SHIFT_LABEL = { morning: 'ida', afternoon: 'vuelta' };

function monthsOf(events) {
  const months = new Set((events || []).map((e) => String(e.date || '').slice(0, 7)).filter(Boolean));
  if (!months.size) months.add(new Date().toISOString().slice(0, 7));
  return [...months].sort();
}

export default function BancoAsignar() {
  const { profile, user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const [routes, setRoutes] = useState([]);
  const [schools, setSchools] = useState([]);
  const [units, setUnits] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [lists, setLists] = useState([]);
  const [quick, setQuick] = useState(null); // { row, student, months }

  useEffect(
    () =>
      AssignmentBank.subscribe(
        (data) => {
          setRows(data);
          setLoading(false);
        },
        (err) => {
          setError(err?.message || 'No se pudo cargar el banco.');
          setLoading(false);
        }
      ),
    []
  );

  async function loadCatalogs() {
    try {
      const [r, s, u, c, l] = await Promise.all([
        Routes.list(),
        Schools.list(),
        Units.list(),
        PricingConcepts.list(),
        RouteLists.list(),
      ]);
      setRoutes(r || []);
      setSchools(s || []);
      setUnits(u || []);
      setConcepts(c || []);
      setLists(l || []);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudieron cargar rutas y listas.');
    }
  }
  useEffect(() => {
    loadCatalogs();
  }, []);

  const routeName = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r.name])), [routes]);

  const counts = useMemo(() => {
    const c = { pending: 0, assigned: 0, dismissed: 0 };
    rows.forEach((r) => {
      c[r.status || 'pending'] = (c[r.status || 'pending'] || 0) + 1;
    });
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = normalizeText(search);
    return rows
      .filter((r) => (r.status || 'pending') === tab)
      .filter((r) => !q || normalizeText(`${r.name} ${r.matricula} ${r.routeName}`).includes(q))
      .sort((a, b) => (b.lastAddedAt?.toMillis?.() || 0) - (a.lastAddedAt?.toMillis?.() || 0));
  }, [rows, tab, search]);

  async function openAssign(row) {
    setBusyId(row.id);
    setError('');
    setNotice('');
    try {
      const student = await Students.get(row.studentId);
      if (!student) {
        setError(`${row.name}: el alumno ya no existe en el catálogo. Puedes descartarlo del banco.`);
        return;
      }
      // La ruta por defecto es la del recorrido donde se agregó.
      setQuick({ row, student: { ...student, routeId: row.routeId || student.routeId || '' }, months: monthsOf(row.events) });
    } catch (err) {
      setError(err?.message || 'No se pudo abrir al alumno.');
    } finally {
      setBusyId('');
    }
  }

  async function run(row, fn, okText) {
    setBusyId(row.id);
    setError('');
    setNotice('');
    try {
      await fn();
      if (okText) setNotice(okText);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'No se pudo completar la acción.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-navy-400 font-semibold">Operación / Listas de alumnos</p>
          <h1 className="admin-h1 mt-1">Banco por asignar</h1>
          <p className="text-sm text-navy-500 mt-1 max-w-3xl">
            Alumnos que el operador agregó en pleno recorrido porque todavía no estaban configurados.
            Están aparte de tus listas: asígnalos a la lista de su ruta o descártalos.
          </p>
        </div>
        <button onClick={loadCatalogs} className="btn-admin-ghost">
          <RefreshCw size={14} /> Actualizar listas
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-sm flex gap-2">
          <AlertTriangle size={18} className="shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-sm flex gap-2">
          <CheckCircle2 size={18} className="shrink-0" /> {notice}
        </div>
      )}

      <section className="admin-card p-0 overflow-hidden">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={tab === t.key ? 'btn-admin-primary' : 'btn-admin-ghost'}
              >
                {t.label} <span className="opacity-70">({counts[t.key] || 0})</span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input
              className="admin-input !pl-9"
              placeholder="Buscar por nombre, matrícula o ruta"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className="px-4 pb-4 text-sm text-navy-500">Cargando…</p>
        ) : visible.length === 0 ? (
          <div className="px-4 pb-8 pt-2 text-center text-navy-400">
            <Inbox size={26} className="mx-auto mb-2" />
            <p className="text-sm">
              {tab === 'pending'
                ? 'No hay alumnos por asignar. Cuando un operador agregue a alguien que no estaba en su lista, aparecerá aquí.'
                : 'Nada en esta pestaña.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-navy-100">
            <table className="table-admin text-xs min-w-[860px]">
              <thead>
                <tr>
                  <th className="pl-4">Alumno</th>
                  <th>Ruta donde se agregó</th>
                  <th>Ruta configurada</th>
                  <th>Veces</th>
                  <th>Agregado por</th>
                  <th className="text-right pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const events = [...(r.events || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
                  const last = events[0];
                  const configuredRoute = r.studentRouteId ? routeName[r.studentRouteId] || 'Otra ruta' : '';
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id}>
                      <td className="pl-4 py-2">
                        <p className="font-medium text-sm text-navy-900">{r.name}</p>
                        <p className="text-navy-400">Matrícula {r.matricula || '—'}</p>
                      </td>
                      <td>{r.routeName || routeName[r.routeId] || '—'}</td>
                      <td>
                        {configuredRoute ? (
                          <span className={r.configured ? 'text-navy-600' : 'text-signal-amber font-medium'}>
                            {configuredRoute}
                          </span>
                        ) : (
                          <span className="text-signal-amber font-medium">Sin ruta</span>
                        )}
                        {r.configured && <span className="block text-navy-400">Hoy no le tocaba servicio</span>}
                      </td>
                      <td>
                        <p>{events.length}</p>
                        {last && (
                          <p className="text-navy-400">
                            {fmtDateOnly(last.date)} · {SHIFT_LABEL[last.shift] || ''}
                          </p>
                        )}
                      </td>
                      <td>{r.addedByName || '—'}</td>
                      <td className="text-right pr-4 whitespace-nowrap">
                        {tab === 'pending' && (
                          <>
                            <button className="btn-admin-primary mr-2" disabled={busy} onClick={() => openAssign(r)}>
                              <UserPlus size={13} /> {busy ? 'Abriendo…' : 'Asignar a lista'}
                            </button>
                            <button
                              className="btn-admin-ghost"
                              disabled={busy}
                              onClick={() =>
                                run(r, () => AssignmentBank.dismiss(r.id, profile?.name), `${r.name} se descartó del banco.`)
                              }
                              title="No hace falta asignarlo (por ejemplo, fue un error)"
                            >
                              <XCircle size={13} /> Descartar
                            </button>
                          </>
                        )}
                        {tab !== 'pending' && (
                          <>
                            <button
                              className="btn-admin-ghost mr-2"
                              disabled={busy}
                              onClick={() => run(r, () => AssignmentBank.reopen(r.id), `${r.name} regresó a Por asignar.`)}
                            >
                              <Undo2 size={13} /> Regresar a pendientes
                            </button>
                            <button
                              className="btn-admin-ghost text-red-700 border-red-200"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`¿Quitar a ${r.name} del banco? Esto no borra al alumno.`)) {
                                  run(r, () => AssignmentBank.remove(r.id), `${r.name} se quitó del banco.`);
                                }
                              }}
                            >
                              <Trash2 size={13} /> Quitar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {quick && (
        <QuickAddToList
          student={quick.student}
          months={quick.months}
          lists={lists}
          routes={routes}
          units={units}
          concepts={concepts}
          schools={schools}
          profile={profile}
          user={user}
          onClose={() => setQuick(null)}
          onDone={({ student, lists: updated, months }) => {
            const row = quick.row;
            setLists((prev) => prev.map((l) => updated.find((u) => u.id === l.id) || l));
            setQuick(null);
            Students.clearSearchCache();
            AssignmentBank.markAssigned(row.id, profile?.name, { routeId: student.routeId || '', months })
              .then(() => setNotice(`${student.name} quedó asignado a la lista de ${months.join(', ')}.`))
              .catch((err) => {
                console.error(err);
                setError(`${student.name} se agregó a la lista, pero no se pudo marcar como asignado en el banco: ${err?.message || ''}`);
              });
          }}
        />
      )}
    </div>
  );
}
