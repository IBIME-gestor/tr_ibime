import { useEffect, useMemo, useState } from 'react';
import {
  Link2,
  Copy,
  Check,
  Trash2,
  Power,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Inbox,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Drivers, Routes, Schools, Units, Students, PricingConcepts } from '../../firebase/services';
import { OperatorLinks, Submissions, approveSubmissions, linkUrl } from '../../firebase/operatorPortal';
import { cascadeStyle } from '../../utils/cascade';

const DAY_SHORT = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V' };

function serviceLabel(s) {
  if (s.tipoServicio === 'completo') return 'Completo';
  if (s.tipoServicio === 'medio') {
    const dias = (s.diasSemana || []).map((d) => DAY_SHORT[Number(d)]).join('');
    return `Medio · ${s.medioServicio === 'salida' ? 'salida' : 'entrada'} · ${dias}`;
  }
  return `Diario · ${(s.fechasDiarias || []).length} fecha(s)`;
}

const STATUS = {
  pending: { label: 'Pendiente', cls: 'badge-amber', icon: Clock },
  approved: { label: 'Aprobado', cls: 'badge-go', icon: CheckCircle2 },
  rejected: { label: 'Rechazado', cls: 'badge-stop', icon: XCircle },
};

export default function OperatorLinksPage() {
  const { profile, user } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [schools, setSchools] = useState([]);
  const [units, setUnits] = useState([]);
  const [links, setLinks] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loadError, setLoadError] = useState('');

  const [tab, setTab] = useState('solicitudes'); // solicitudes | enlaces
  const [statusFilter, setStatusFilter] = useState('pending');
  const [linkFilter, setLinkFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState('');

  // formulario de nuevo enlace
  const [operatorId, setOperatorId] = useState('');
  const [label, setLabel] = useState('');
  const [routeIds, setRouteIds] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => Drivers.subscribe(setDrivers), []);
  useEffect(() => Routes.subscribe(setRoutes), []);
  useEffect(() => Schools.subscribe(setSchools), []);
  useEffect(() => Units.subscribe(setUnits), []);
  useEffect(() => OperatorLinks.subscribe(setLinks, (e) => setLoadError(e.message || 'Sin permisos')), []);
  useEffect(() => Submissions.subscribeAll(setSubs, (e) => setLoadError(e.message || 'Sin permisos')), []);

  const operators = useMemo(() => drivers.filter((d) => (d.role || 'driver') !== 'cashier'), [drivers]);
  const schoolName = (id) => schools.find((s) => s.id === id)?.name || '';

  // Rutas sugeridas: las del operador elegido; si no tiene, todas.
  const suggestedRoutes = useMemo(() => {
    if (!operatorId) return routes;
    const mine = routes.filter((r) => r.driverId === operatorId || r.nannyId === operatorId);
    return mine.length ? mine : routes;
  }, [routes, operatorId]);

  useEffect(() => {
    setRouteIds(operatorId ? suggestedRoutes.filter((r) => r.driverId === operatorId || r.nannyId === operatorId).map((r) => r.id) : []);
  }, [operatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingCount = subs.filter((s) => s.status === 'pending').length;
  const linkByToken = useMemo(() => new Map(links.map((l) => [l.token || l.id, l])), [links]);

  const visible = useMemo(
    () =>
      subs
        .filter((s) => (statusFilter === 'todas' ? true : s.status === statusFilter))
        .filter((s) => !linkFilter || s.token === linkFilter)
        .sort((a, b) => {
          const la = linkByToken.get(a.token)?.operatorName || '';
          const lb = linkByToken.get(b.token)?.operatorName || '';
          return la.localeCompare(lb, 'es') || String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' });
        }),
    [subs, statusFilter, linkFilter, linkByToken]
  );

  const pendingVisible = visible.filter((s) => s.status === 'pending');
  const allSelected = pendingVisible.length > 0 && pendingVisible.every((s) => selected.has(`${s.token}/${s.id}`));

  function toggleSel(s) {
    const key = `${s.token}/${s.id}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pendingVisible.map((s) => `${s.token}/${s.id}`)));
  }

  async function approve(list) {
    if (!list.length) return;
    if (!window.confirm(`¿Aprobar ${list.length} solicitud(es)? Se crearán/actualizarán los alumnos y se agregarán a la lista de su ruta.`)) return;
    setBusy(true);
    setReport(null);
    try {
      const [students, concepts] = await Promise.all([Students.list(), PricingConcepts.list()]);
      const result = await approveSubmissions(list, links, {
        routes,
        schools,
        units,
        concepts,
        students,
        admin: { uid: user?.uid || '', name: profile?.name || '' },
      });
      setReport(result);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
      setReport({ ok: [], warnings: [], errors: [err.message || 'Error desconocido'] });
    } finally {
      setBusy(false);
    }
  }

  async function reject(s) {
    const reason = window.prompt(`Motivo del rechazo para ${s.name} (el operador lo verá):`, '');
    if (reason === null) return;
    try {
      await Submissions.reject(s.token, s.id, reason.trim(), profile?.name || '');
    } catch (err) {
      window.alert(err.message || 'No se pudo rechazar.');
    }
  }

  async function removeSub(s) {
    if (!window.confirm(`¿Eliminar la solicitud de ${s.name}?`)) return;
    await Submissions.remove(s.token, s.id);
  }

  async function createLink(e) {
    e.preventDefault();
    if (!operatorId || !routeIds.length) return;
    const op = drivers.find((d) => d.id === operatorId);
    setCreating(true);
    try {
      await OperatorLinks.create({
        operatorId,
        operatorName: op?.name || '',
        label: label.trim(),
        routes: routeIds.map((id) => {
          const r = routes.find((x) => x.id === id);
          return { id, name: r?.name || '', schoolId: r?.schoolId || '', schoolName: schoolName(r?.schoolId) };
        }),
        createdByName: profile?.name || '',
      });
      setLabel('');
      setOperatorId('');
      setRouteIds([]);
    } catch (err) {
      window.alert(err.message || 'No se pudo crear el enlace.');
    } finally {
      setCreating(false);
    }
  }

  async function copy(token) {
    const url = linkUrl(token);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copia el enlace:', url);
    }
    setCopied(token);
    setTimeout(() => setCopied(''), 2000);
  }

  async function removeLink(l) {
    if (!window.confirm(`¿Eliminar el enlace de ${l.operatorName} y TODAS sus solicitudes? Los alumnos ya aprobados no se borran.`)) return;
    await OperatorLinks.remove(l.token || l.id);
  }

  function whatsapp(l) {
    const text = `Hola ${l.operatorName || ''}, este es tu enlace para cargar a los alumnos de tu ruta en Ruta Segura: ${linkUrl(l.token || l.id)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  const pendingByLink = (token) => subs.filter((s) => s.token === token && s.status === 'pending').length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <h1 className="admin-h1">Enlaces y solicitudes de operadores</h1>
        <div className="inline-flex rounded-lg border border-navy-100 bg-white p-1 self-start">
          {[
            { k: 'solicitudes', label: `Solicitudes${pendingCount ? ` (${pendingCount})` : ''}` },
            { k: 'enlaces', label: 'Enlaces' },
          ].map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setTab(t.k)}
              className={`px-4 h-9 rounded-md text-sm font-semibold transition-colors ${
                tab === t.k ? 'bg-navy-800 text-white' : 'text-navy-600 hover:bg-navy-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="admin-card mb-4 text-sm text-stop">
          No se pudieron cargar los datos ({loadError}). Verifica que publicaste las nuevas reglas de Firestore.
        </div>
      )}

      {report && (
        <div className="admin-card mb-4 space-y-2 cascade-item">
          {report.ok.length > 0 && (
            <p className="text-sm text-go font-medium">
              ✔ {report.ok.length} aprobada(s) y agregada(s) a la lista de su ruta.
            </p>
          )}
          {report.warnings.map((w, i) => (
            <p key={i} className="text-sm text-signal-amber">⚠ {w}</p>
          ))}
          {report.errors.map((w, i) => (
            <p key={i} className="text-sm text-stop">✖ {w}</p>
          ))}
          <button type="button" className="link-action" onClick={() => setReport(null)}>Cerrar</button>
        </div>
      )}

      {tab === 'enlaces' && (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 items-start">
          <form onSubmit={createLink} className="admin-card space-y-3 cascade-item">
            <h2 className="font-display font-bold text-navy-900 flex items-center gap-2">
              <Plus size={16} /> Nuevo enlace
            </h2>
            <div>
              <label className="admin-label">Operador</label>
              <select className="admin-select" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
                <option value="">Elige un operador…</option>
                {operators.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="admin-label">Etiqueta (opcional)</label>
              <input className="admin-input" placeholder="Ej. Ciclo 2026-2027" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div>
              <label className="admin-label">Rutas que podrá capturar</label>
              <div className="max-h-52 overflow-y-auto rounded-md border border-navy-100 divide-y divide-navy-50">
                {suggestedRoutes.length === 0 && <p className="p-3 text-sm text-navy-400">Aún no hay rutas.</p>}
                {suggestedRoutes.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-navy-50">
                    <input
                      type="checkbox"
                      checked={routeIds.includes(r.id)}
                      onChange={() =>
                        setRouteIds((prev) => (prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]))
                      }
                    />
                    <span className="flex-1 min-w-0 truncate">{r.name}</span>
                    <span className="text-xs text-navy-400 truncate max-w-[40%]">{schoolName(r.schoolId)}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={creating || !operatorId || !routeIds.length} className="btn-admin-primary w-full disabled:opacity-50">
              <Link2 size={16} /> Generar enlace
            </button>
          </form>

          <div className="space-y-3">
            {links.length === 0 && (
              <div className="admin-card text-center py-10 text-navy-400">
                <Link2 size={26} className="mx-auto mb-2" />
                <p className="text-sm">Aún no hay enlaces. Genera uno y mándaselo al operador.</p>
              </div>
            )}
            {links.map((l, i) => {
              const token = l.token || l.id;
              const pend = pendingByLink(token);
              return (
                <div key={token} className="admin-card cascade-item" style={cascadeStyle(i, 40)}>
                  <div className="flex flex-wrap items-start gap-2 justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900">
                        {l.operatorName || 'Operador'}
                        {l.label ? <span className="text-navy-400 font-normal"> · {l.label}</span> : null}
                      </p>
                      <p className="text-xs text-navy-400 mt-0.5">
                        {(l.routes || []).map((r) => r.name).join(', ') || 'Sin rutas'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {pend > 0 && <span className="badge-amber">{pend} por revisar</span>}
                      <span className={l.active === false ? 'badge-stop' : 'badge-go'}>{l.active === false ? 'Desactivado' : 'Activo'}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2 rounded-md bg-navy-50 border border-navy-100 px-3 py-2">
                    <code className="text-xs text-navy-600 truncate flex-1">{linkUrl(token)}</code>
                    <button type="button" onClick={() => copy(token)} className="shrink-0 p-1.5 rounded hover:bg-white" aria-label="Copiar enlace">
                      {copied === token ? <Check size={15} className="text-go" /> : <Copy size={15} />}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => copy(token)} className="btn-admin-ghost !h-9">
                      <Copy size={14} /> Copiar
                    </button>
                    <button type="button" onClick={() => whatsapp(l)} className="btn-admin-ghost !h-9">
                      <MessageCircle size={14} /> WhatsApp
                    </button>
                    <a href={linkUrl(token)} target="_blank" rel="noreferrer" className="btn-admin-ghost !h-9">
                      <ExternalLink size={14} /> Abrir
                    </a>
                    <button
                      type="button"
                      onClick={() => OperatorLinks.setActive(token, l.active === false)}
                      className="btn-admin-ghost !h-9"
                    >
                      <Power size={14} /> {l.active === false ? 'Activar' : 'Desactivar'}
                    </button>
                    <button type="button" onClick={() => removeLink(l)} className="btn-admin-ghost !h-9 !text-stop">
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'solicitudes' && (
        <div>
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center mb-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { k: 'pending', label: 'Pendientes' },
                { k: 'approved', label: 'Aprobadas' },
                { k: 'rejected', label: 'Rechazadas' },
                { k: 'todas', label: 'Todas' },
              ].map((f) => (
                <button
                  key={f.k}
                  type="button"
                  onClick={() => setStatusFilter(f.k)}
                  className={`px-3 h-9 rounded-md text-sm font-medium border ${
                    statusFilter === f.k ? 'bg-navy-800 text-white border-navy-800' : 'bg-white border-navy-100 text-navy-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select className="admin-select lg:w-64" value={linkFilter} onChange={(e) => setLinkFilter(e.target.value)}>
              <option value="">Todos los operadores</option>
              {links.map((l) => (
                <option key={l.token || l.id} value={l.token || l.id}>{l.operatorName}</option>
              ))}
            </select>
            <div className="flex-1" />
            {pendingVisible.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={toggleAll} className="btn-admin-ghost !h-9">
                  {allSelected ? 'Quitar selección' : 'Seleccionar pendientes'}
                </button>
                <button
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={() => approve(pendingVisible.filter((s) => selected.has(`${s.token}/${s.id}`)))}
                  className="btn-admin-primary !h-9 disabled:opacity-50"
                >
                  <CheckCircle2 size={15} /> {busy ? 'Aprobando…' : `Aprobar seleccionadas (${selected.size})`}
                </button>
              </div>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="admin-card text-center py-12 text-navy-400">
              <Inbox size={28} className="mx-auto mb-2" />
              <p className="text-sm">
                {statusFilter === 'pending' ? 'No hay solicitudes pendientes.' : 'No hay solicitudes con este filtro.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((s, i) => {
                const st = STATUS[s.status] || STATUS.pending;
                const Icon = st.icon;
                const link = linkByToken.get(s.token);
                const key = `${s.token}/${s.id}`;
                return (
                  <div key={key} className="admin-card !p-3 sm:!p-4 cascade-item" style={cascadeStyle(i, 20)}>
                    <div className="flex items-start gap-3">
                      {s.status === 'pending' && (
                        <input
                          type="checkbox"
                          className="mt-1.5 w-4 h-4 shrink-0"
                          checked={selected.has(key)}
                          onChange={() => toggleSel(s)}
                          aria-label={`Seleccionar ${s.name}`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-navy-900">{s.name}</p>
                          <span className={`${st.cls} gap-1`}><Icon size={12} /> {st.label}</span>
                        </div>
                        <p className="text-xs text-navy-400 mt-0.5">
                          Mat. {s.matricula}
                          {s.nivel ? ` · ${s.nivel}` : ''}
                          {s.grado ? ` · ${s.grado}` : ''}
                        </p>
                        <p className="text-xs text-navy-600 mt-0.5">
                          <strong>{link?.operatorName || 'Operador'}</strong> · {s.routeName || 'Ruta'} · {serviceLabel(s)}
                        </p>
                        {(s.familiarResponsable || s.telefono || s.address) && (
                          <p className="text-xs text-navy-400 mt-0.5 break-words">
                            {[s.familiarResponsable, s.telefono, s.address].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {s.status === 'rejected' && s.rejectReason && (
                          <p className="text-xs text-stop mt-1">Motivo: {s.rejectReason}</p>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
                        {s.status === 'pending' && (
                          <>
                            <button type="button" disabled={busy} onClick={() => approve([s])} className="btn-admin-primary !h-9 !px-3">
                              Aprobar
                            </button>
                            <button type="button" onClick={() => reject(s)} className="btn-admin-ghost !h-9 !px-3">
                              Rechazar
                            </button>
                          </>
                        )}
                        {s.status !== 'pending' && (
                          <button type="button" onClick={() => removeSub(s)} className="p-2 rounded-md text-stop hover:bg-stop-light" aria-label="Eliminar solicitud">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
