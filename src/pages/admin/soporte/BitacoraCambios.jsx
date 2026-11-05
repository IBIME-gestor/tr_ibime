import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { RefreshCw, AlertTriangle, Search, UserPlus, Pencil, UserMinus, Layers, X } from 'lucide-react';
import { listAudit } from '../../../firebase/audit';

export const FIELD_LABEL = {
  name: 'Nombre', matricula: 'Matrícula', studentEmail: 'Correo del alumno', nivel: 'Nivel', grado: 'Grado',
  schoolId: 'Plantel', routeId: 'Ruta', familiarResponsable: 'Familiar responsable', telefono: 'Teléfono',
  parentContact: 'Contacto del padre', parentEmail: 'Correo del padre', address: 'Domicilio',
  tipoServicio: 'Tipo de servicio', medioServicio: 'Medio servicio', diasFijos: 'Días fijos',
  fechasEventuales: 'Fechas eventuales', diasSemana: 'Días de la semana', billingMode: 'Modo de cobro',
  billingAmount: 'Monto', paymentStatus: 'Estatus de pago', nextDueDate: 'Próximo vencimiento',
};

const ACTION = {
  create: { label: 'Alta', cls: 'bg-emerald-100 text-emerald-800', icon: UserPlus },
  update: { label: 'Edición', cls: 'bg-sky-100 text-sky-800', icon: Pencil },
  delete: { label: 'Baja', cls: 'bg-red-100 text-red-800', icon: UserMinus },
  bulk: { label: 'Masivo', cls: 'bg-violet-100 text-violet-800', icon: Layers },
};
const ROLE_LABEL = { admin: 'Admin', cashier: 'Cajero', driver: 'Operador', nanny: 'Nanny' };

const fmt = (ts) => {
  const v = ts?.toMillis ? ts.toMillis() : null;
  return v ? new Date(v).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
};
const show = (v) => (v === '' || v == null ? <i className="text-navy-300">vacío</i> : String(v));

/**
 * Soporte / Bitácora de cambios
 * Quién modificó a un alumno, cuándo y qué cambió (antes → después).
 */
export default function BitacoraCambios() {
  const [params, setParams] = useSearchParams();
  const entityId = params.get('alumno') || '';
  const [rows, setRows] = useState([]);
  const [max, setMax] = useState(300);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [search, setSearch] = useState('');

  async function load(limitRows = max) {
    setLoading(true); setError('');
    try { setRows(await listAudit({ max: limitRows, entityId })); }
    catch (e) { console.error(e); setError(e?.message || 'No se pudo cargar la bitácora.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(max); /* eslint-disable-next-line */ }, [entityId, max]);

  const actors = useMemo(() => [...new Set(rows.map((r) => r.actorName).filter(Boolean))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (action && r.action !== action) return false;
      if (actor && r.actorName !== actor) return false;
      if (!q) return true;
      const text = `${r.entityName} ${r.matricula} ${r.note} ${Object.keys(r.changes || {}).join(' ')} ${Object.values(r.changes || {}).map((c) => `${c.from} ${c.to}`).join(' ')}`;
      return text.toLowerCase().includes(q);
    });
  }, [rows, action, actor, search]);

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-navy-400 font-semibold">Soporte</p>
          <h1 className="admin-h1 mt-1">Bitácora de cambios</h1>
          <p className="text-sm text-navy-500 mt-1 max-w-2xl">
            Cada alta, edición o baja de alumnos queda registrada con quién la hizo, cuándo, y el valor de antes y de después.
            Esta bitácora no se puede editar ni borrar desde la app.
          </p>
        </div>
        <button className="btn-admin-ghost" onClick={() => load(max)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {entityId && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 text-sky-900 px-4 py-2.5 text-sm flex items-center justify-between gap-3">
          <span>Mostrando solo los movimientos de un alumno.</span>
          <button className="inline-flex items-center gap-1 font-semibold" onClick={() => setParams({})}><X size={14} /> Ver todos</button>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-sm flex gap-2"><AlertTriangle size={18} className="shrink-0" /> {error}</div>
      )}

      <section className="admin-card grid sm:grid-cols-3 gap-3">
        <select className="admin-select" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Todos los movimientos</option>
          {Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="admin-select" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="">Todas las personas</option>
          {actors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input className="admin-input !pl-9" placeholder="Alumno, matrícula, campo o valor…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </section>

      {loading ? (
        <p className="text-sm text-navy-500">Cargando…</p>
      ) : visible.length === 0 ? (
        <div className="admin-card text-center py-10 text-navy-500 text-sm">
          Aún no hay movimientos con este filtro. Los cambios que se hagan de ahora en adelante aparecerán aquí.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const meta = ACTION[r.action] || ACTION.update;
            const Icon = meta.icon;
            const changes = Object.entries(r.changes || {});
            return (
              <div key={r.id} className="rounded-2xl border border-navy-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`rounded-lg p-2 shrink-0 ${meta.cls}`}><Icon size={16} /></span>
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900 break-words">
                        {r.entityName || (r.action === 'bulk' ? r.source : 'Alumno')}
                        {r.matricula && <span className="ml-2 text-xs font-mono font-normal text-navy-400">{r.matricula}</span>}
                      </p>
                      <p className="text-xs text-navy-500">
                        <span className={`inline-block text-[11px] font-semibold rounded-full px-2 py-0.5 mr-1.5 ${meta.cls}`}>{meta.label}</span>
                        por <b>{r.actorName || 'Desconocido'}</b>{r.actorRole ? ` (${ROLE_LABEL[r.actorRole] || r.actorRole})` : ''} · {fmt(r.createdAt)}
                      </p>
                    </div>
                  </div>
                  {r.entityId && !entityId && (
                    <Link to={`/admin/soporte/bitacora?alumno=${r.entityId}`} className="text-xs text-navy-500 hover:text-navy-900 underline">Ver historial del alumno</Link>
                  )}
                </div>
                {r.note && <p className="text-sm text-navy-600 mt-2">{r.note}</p>}
                {changes.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-navy-100">
                    <table className="table-admin text-xs min-w-[420px]">
                      <thead><tr><th className="pl-3">Campo</th><th>Antes</th><th>Después</th></tr></thead>
                      <tbody>
                        {changes.map(([field, c]) => (
                          <tr key={field}>
                            <td className="pl-3 font-medium">{FIELD_LABEL[field] || field}</td>
                            <td className="text-red-700 break-words max-w-[260px]">{show(c.from)}</td>
                            <td className="text-emerald-800 break-words max-w-[260px]">{show(c.to)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {!entityId && rows.length >= max && (
            <div className="text-center">
              <button className="btn-admin-ghost" onClick={() => setMax(max + 300)}>Cargar 300 más</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
