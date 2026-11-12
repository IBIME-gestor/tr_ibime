import { useEffect, useMemo, useState } from 'react';
import { UserMinus, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Routes } from '../../firebase/services';
import { listTripRemovals, reviewTripRemoval, restoreRemovedStop } from '../../firebase/trips';
import { tsMs } from '../../utils/tripOrder';

/**
 * Alumnos quitados de la lista (solo admin)
 * Cada vez que un operador o nanny quita a un alumno de un recorrido queda aquí,
 * para revisar si fue correcto o un error. Si el recorrido sigue en curso puedes
 * devolver al alumno a la lista; si ya cerró, solo marcas la revisión.
 */

const fmtDate = (ts) => { const ms = tsMs(ts); return ms ? new Date(ms).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; };
const ROLE = { driver: 'Operador', nanny: 'Nanny', admin: 'Admin' };
const RES = { correcto: 'Revisado: correcto', error: 'Revisado: fue error', restaurado: 'Restaurado a la lista' };

export default function AlumnosQuitados() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [show, setShow] = useState('pendientes');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [r, ro] = await Promise.all([listTripRemovals(), Routes.list()]);
      setRows(r || []); setRoutes(ro || []); setError('');
    } catch (e) { console.error(e); setError(e?.message || 'No se pudo cargar (¿están publicadas las reglas de Firestore?).'); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const routeName = (id) => routes.find((r) => r.id === id)?.name || '—';
  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (show === 'todos' || (show === 'pendientes' ? !r.reviewed : r.reviewed))
      && (!q || `${r.name} ${r.matricula} ${r.removedByName}`.toLowerCase().includes(q)));
  }, [rows, show, search]);
  const pendingCount = rows.filter((r) => !r.reviewed).length;

  async function review(r, resolution) {
    setMsg(''); setError('');
    try { await reviewTripRemoval(r.id, resolution, profile); await load(); } catch (e) { setError(e?.message || 'No se pudo guardar.'); }
  }
  async function restore(r) {
    setMsg(''); setError('');
    try { await restoreRemovedStop(r, profile); setMsg(`${r.name} regresó a la lista del recorrido.`); await load(); }
    catch (e) { setError(e?.message || 'No se pudo restaurar.'); }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-h1 mb-1 flex items-center gap-2"><UserMinus size={22} /> Alumnos quitados de la lista</h1>
          <p className="text-sm text-navy-400 max-w-3xl">Cada vez que un operador o nanny quita a un alumno de un recorrido queda aquí para revisar si fue correcto o un error.</p>
        </div>
        <button type="button" className="btn-admin-ghost" onClick={load}><RefreshCw size={14} className="inline mr-1" />Actualizar</button>
      </div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-3 py-2">{error}</p>}
      {msg && <p className="rounded-lg border border-green-200 bg-green-50 text-green-800 text-sm px-3 py-2">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select className="admin-select max-w-[200px]" value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="pendientes">Por revisar ({pendingCount})</option>
          <option value="revisados">Ya revisados</option>
          <option value="todos">Todos</option>
        </select>
        <input className="admin-input max-w-[240px]" placeholder="Buscar alumno, matrícula o quien lo quitó" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="admin-card overflow-x-auto">
        <table className="table-admin min-w-[860px]">
          <thead><tr><th>Cuándo</th><th>Alumno</th><th>Ruta / turno</th><th>Lo quitó</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center text-navy-400 py-6">Cargando…</td></tr>}
            {!loading && view.length === 0 && <tr><td colSpan={6} className="text-center text-navy-400 py-6">{show === 'pendientes' ? 'No hay alumnos por revisar.' : 'Sin registros.'}</td></tr>}
            {view.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.removedAt)}<br /><span className="text-[11px] text-navy-400">recorrido del {r.date || '—'}</span></td>
                <td><b>{r.name}</b><br /><span className="text-[11px] text-navy-400">{r.matricula}</span></td>
                <td>{routeName(r.routeId)}<br /><span className="text-[11px] text-navy-400">{r.shift === 'morning' ? 'Entrada' : r.shift === 'afternoon' ? 'Salida' : '—'}</span></td>
                <td>{r.removedByName || '—'}<br /><span className="text-[11px] text-navy-400">{ROLE[r.removedByRole] || ''}</span></td>
                <td>{r.reviewed ? <span className="text-xs text-navy-600">{RES[r.resolution] || 'Revisado'}{r.reviewedByName ? ` · ${r.reviewedByName}` : ''}</span> : <span className="text-xs font-semibold text-amber-700">Por revisar</span>}</td>
                <td className="whitespace-nowrap">
                  {!r.reviewed && (
                    <>
                      <button type="button" className="link-action mr-2" onClick={() => restore(r)}>Devolver a la lista</button>
                      <button type="button" className="link-action mr-2" onClick={() => review(r, 'correcto')}>Era correcto</button>
                      <button type="button" className="link-danger" onClick={() => review(r, 'error')}>Fue error</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-navy-400">«Devolver a la lista» solo funciona si el recorrido sigue en curso. En recorridos ya cerrados, usa «Corregir recorridos» para ajustar su pase de lista y aquí marca la revisión.</p>
    </div>
  );
}
