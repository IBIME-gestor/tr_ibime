import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, UserMinus, AlertTriangle } from 'lucide-react';
import { Students, Routes, RouteLists } from '../../../firebase/services';
import { logAudit } from '../../../firebase/audit';

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

/**
 * Soporte / Sincronizar operador con lista
 * La lista de cobro (Listas de alumnos) y la lista que ve el operador en sus
 * viajes son distintas: la del operador sale de la ruta (o taller) guardada en
 * cada alumno. Aquí se ven los alumnos que el operador todavía ve pero que ya
 * no están en la lista elegida, y se pueden quitar del operador.
 */
export default function SincronizarOperador() {
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState('');
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState('');
  const [operatorStudents, setOperatorStudents] = useState([]);
  const [wrongTaller, setWrongTaller] = useState([]); // alumnos con la ruta de taller como ruta normal
  const [picked, setPicked] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Routes.list().then((r) => setRoutes(r || [])).catch((e) => setError(e?.message || 'No se pudieron cargar las rutas.'));
  }, []);

  const route = routes.find((r) => r.id === routeId) || null;
  const isTaller = route?.kind === 'taller';

  async function loadRoute(id) {
    setRouteId(id); setListId(''); setLists([]); setOperatorStudents([]); setWrongTaller([]); setPicked({}); setMsg(''); setError('');
    if (!id) return;
    const r = routes.find((x) => x.id === id);
    setLoading(true);
    try {
      const [students, rl, damaged] = await Promise.all([
        r?.kind === 'taller' ? Students.listByTallerRoute(id) : Students.listByRoute(id),
        RouteLists.listByRoute(id),
        r?.kind === 'taller' ? Students.listByRoute(id) : Promise.resolve([]),
      ]);
      const valid = (rl || []).filter((l) => l.status !== 'eliminada').sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
      setLists(valid);
      const t = today();
      setListId((valid.find((l) => l.startDate <= t && l.endDate >= t) || valid[0])?.id || '');
      setOperatorStudents(students || []);
      setWrongTaller(damaged || []);
    } catch (e) { setError(e?.message || 'No se pudo consultar.'); }
    setLoading(false);
  }

  const list = lists.find((l) => l.id === listId) || null;
  const stale = useMemo(() => {
    if (!list) return [];
    const inList = new Set((list.rows || []).map((x) => x.studentId));
    return operatorStudents.filter((s) => !inList.has(s.id));
  }, [list, operatorStudents]);

  async function removeFromOperator() {
    const chosen = stale.filter((s) => picked[s.id]);
    if (!chosen.length) return;
    if (!window.confirm(`¿Quitar a ${chosen.length} alumno(s) de la lista del operador? Ya no aparecerán en sus viajes de ${route?.name}. Los alumnos no se eliminan.`)) return;
    setError(''); setMsg('');
    try {
      const patch = isTaller ? { tallerRouteId: '', tallerDias: [] } : { routeId: '' };
      for (const s of chosen) {
        await Students.update(s.id, patch);
        logAudit({ entity: 'student', entityId: s.id, entityName: s.name, matricula: s.matricula, action: 'update',
          changes: isTaller ? { tallerRouteId: { from: route.id, to: '' } } : { routeId: { from: route.id, to: '' } },
          source: 'Soporte/Sincronizar operador' });
      }
      setMsg(`${chosen.length} alumno(s) quitados de la lista del operador.`);
      await loadRoute(routeId);
    } catch (e) { setError(e?.message || 'No se pudo guardar.'); }
  }

  async function fixWrongTaller(s) {
    if (!window.confirm(`${s.name} tiene esta ruta de taller como su ruta NORMAL (se sobrescribió al agregarlo a una lista de taller).\n\nSe pasará a taller (lun–vie) y quedará sin ruta normal; después asígnale su ruta normal desde «Banco por asignar». ¿Continuar?`)) return;
    try {
      await Students.update(s.id, { tallerRouteId: routeId, tallerDias: [1, 2, 3, 4, 5], routeId: '' });
      logAudit({ entity: 'student', entityId: s.id, entityName: s.name, matricula: s.matricula, action: 'update',
        changes: { routeId: { from: routeId, to: '' }, tallerRouteId: { from: '', to: routeId } }, source: 'Soporte/Sincronizar operador' });
      setMsg(`${s.name} se movió a taller. Asígnale su ruta normal en «Banco por asignar».`);
      await loadRoute(routeId);
    } catch (e) { setError(e?.message || 'No se pudo guardar.'); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-800">Sincronizar operador con lista</h1>
        <p className="text-sm text-navy-400 mt-1 max-w-3xl">
          Si quitaste alumnos de una lista pero el operador todavía los ve en sus viajes, elige la ruta y la lista:
          aquí aparecen los que el operador ve y ya no están en la lista.
        </p>
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="admin-label">Ruta</label>
          <select className="admin-select" value={routeId} onChange={(e) => loadRoute(e.target.value)}>
            <option value="">Selecciona…</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.kind === 'taller' ? ' (taller)' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="admin-label">Lista contra la que comparar</label>
          <select className="admin-select" value={listId} onChange={(e) => { setListId(e.target.value); setPicked({}); }} disabled={!lists.length}>
            {!lists.length && <option value="">Sin listas para esta ruta</option>}
            {lists.map((l) => <option key={l.id} value={l.id}>{l.listName || `${l.startDate} a ${l.endDate}`}</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-navy-400"><RefreshCw size={14} className="inline animate-spin mr-1" />Consultando…</p>}
      {error && <p className="text-sm text-stop bg-red-50 rounded-md p-3">{error}</p>}
      {msg && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-md p-3">{msg}</p>}

      {wrongTaller.length > 0 && (
        <section className="card p-4 space-y-2 border border-amber-300">
          <h2 className="font-display font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle size={16} /> Alumnos con la ruta de taller como ruta normal</h2>
          <p className="text-xs text-navy-500">Pasó al agregarlos a una lista de taller. Por eso no salen en el módulo Talleres ni en el viaje del operador de taller.</p>
          {wrongTaller.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm border-t border-navy-50 pt-2">
              <span><b>{s.name}</b> <span className="text-navy-400">{s.matricula}</span></span>
              <button type="button" className="btn-admin-ghost !h-8 !px-3" onClick={() => fixWrongTaller(s)}>Pasar a taller</button>
            </div>
          ))}
        </section>
      )}

      {route && list && !loading && (
        <section className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-semibold text-navy-800">
              El operador ve {operatorStudents.length} alumno(s) · {stale.length} ya no están en la lista
            </h2>
            {stale.length > 0 && (
              <button type="button" className="btn-admin-primary" onClick={removeFromOperator} disabled={!Object.values(picked).some(Boolean)}>
                <UserMinus size={15} /> Quitar seleccionados del operador
              </button>
            )}
          </div>
          {stale.length === 0 && <p className="text-sm text-emerald-700">Todo coincide: el operador solo ve alumnos que están en la lista.</p>}
          {stale.length > 0 && (
            <>
              <p className="text-xs text-navy-500">
                Revisa antes de marcar: un alumno nuevo o de otro periodo también aparece aquí si no está en la lista elegida.
              </p>
              <label className="text-xs flex items-center gap-2">
                <input type="checkbox" checked={stale.every((s) => picked[s.id])}
                  onChange={(e) => setPicked(Object.fromEntries(stale.map((s) => [s.id, e.target.checked])))} />
                Seleccionar todos
              </label>
              <ul className="divide-y divide-navy-50">
                {stale.map((s) => (
                  <li key={s.id} className="py-2 flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={!!picked[s.id]} onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.checked }))} />
                    <span><b>{s.name}</b> <span className="text-navy-400">{s.matricula}</span></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
