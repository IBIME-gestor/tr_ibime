import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Bus,
  Save,
  X,
  Info,
} from 'lucide-react';
import { OperatorPortal } from '../firebase/operatorPortal';
import LoadingOverlay from '../components/LoadingOverlay';
import { cascadeStyle } from '../utils/cascade';

const DAYS = [
  { value: 1, short: 'L', name: 'Lunes' },
  { value: 2, short: 'M', name: 'Martes' },
  { value: 3, short: 'X', name: 'Miércoles' },
  { value: 4, short: 'J', name: 'Jueves' },
  { value: 5, short: 'V', name: 'Viernes' },
];

const STATUS = {
  pending: { label: 'En revisión', cls: 'badge-amber', icon: Clock },
  approved: { label: 'Aprobado', cls: 'badge-go', icon: CheckCircle2 },
  rejected: { label: 'Rechazado', cls: 'badge-stop', icon: XCircle },
};

const emptyForm = {
  matricula: '',
  name: '',
  nivel: '',
  grado: '',
  familiarResponsable: '',
  telefono: '',
  address: '',
  routeId: '',
  tipoServicio: 'completo',
  medioServicio: 'entrada',
  diasSemana: [1, 2, 3, 4, 5],
  fechasDiarias: [],
};

function serviceLabel(s) {
  if (s.tipoServicio === 'completo') return 'Completo (entrada y salida)';
  if (s.tipoServicio === 'medio') {
    const dias = (s.diasSemana || []).map((d) => DAYS.find((x) => x.value === Number(d))?.short).join('');
    return `Medio · ${s.medioServicio === 'salida' ? 'salida' : 'entrada'} · ${dias || 'sin días'}`;
  }
  return `Diario · ${(s.fechasDiarias || []).length} fecha(s)`;
}

function normKey(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export default function OperatorPortalPage() {
  const { token } = useParams();
  const [link, setLink] = useState(undefined); // undefined = cargando, null = no existe
  const [subs, setSubs] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');
  const [newDate, setNewDate] = useState('');
  const fileRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    let active = true;
    OperatorPortal.getLink(token)
      .then((l) => active && setLink(l))
      .catch((err) => {
        console.error(err);
        if (active) {
          setLink(null);
          setLoadError(err.message || '');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!link?.active) return undefined;
    return OperatorPortal.subscribeSubmissions(token, (rows) => setSubs(rows));
  }, [token, link?.active]);

  const routes = link?.routes || [];

  useEffect(() => {
    if (routes.length === 1 && !form.routeId) setForm((f) => ({ ...f, routeId: routes[0].id }));
  }, [routes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...subs]
      .filter((s) => (filter === 'todos' ? true : s.status === filter))
      .filter(
        (s) => !q || String(s.name).toLowerCase().includes(q) || String(s.matricula).toLowerCase().includes(q)
      )
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' }));
  }, [subs, search, filter]);

  const counts = useMemo(
    () => ({
      total: subs.length,
      pending: subs.filter((s) => s.status === 'pending').length,
      approved: subs.filter((s) => s.status === 'approved').length,
      rejected: subs.filter((s) => s.status === 'rejected').length,
    }),
    [subs]
  );

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...emptyForm, routeId: routes.length === 1 ? routes[0].id : '' });
    setError('');
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function openEdit(s) {
    setEditingId(s.id);
    setForm({ ...emptyForm, ...s });
    setError('');
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setError('');
  }

  function toggleDay(value) {
    setForm((f) => {
      const has = f.diasSemana.includes(value);
      return { ...f, diasSemana: has ? f.diasSemana.filter((d) => d !== value) : [...f.diasSemana, value].sort() };
    });
  }

  function addDate() {
    if (!newDate) return;
    setForm((f) => (f.fechasDiarias.includes(newDate) ? f : { ...f, fechasDiarias: [...f.fechasDiarias, newDate].sort() }));
    setNewDate('');
  }

  function validate(data) {
    if (!data.matricula.trim()) return 'Escribe la matrícula del alumno.';
    if (!data.name.trim()) return 'Escribe el nombre del alumno.';
    if (!data.routeId) return 'Elige la ruta del alumno.';
    if (data.tipoServicio === 'medio' && !data.diasSemana.length) return 'Elige al menos un día de servicio.';
    if (data.tipoServicio === 'diario' && !data.fechasDiarias.length) return 'Agrega al menos una fecha de servicio.';
    const dup = subs.find(
      (s) =>
        s.id !== editingId &&
        String(s.matricula).trim().toLowerCase() === data.matricula.trim().toLowerCase() &&
        s.status !== 'rejected'
    );
    if (dup) return `La matrícula ${data.matricula} ya está en tu lista (${dup.name}).`;
    return '';
  }

  function payloadFromForm(f) {
    const route = routes.find((r) => r.id === f.routeId);
    return {
      matricula: f.matricula.trim(),
      name: f.name.trim(),
      nivel: f.nivel.trim(),
      grado: f.grado.trim(),
      familiarResponsable: f.familiarResponsable.trim(),
      telefono: f.telefono.trim(),
      address: f.address.trim(),
      routeId: f.routeId,
      routeName: route?.name || '',
      schoolId: route?.schoolId || '',
      tipoServicio: f.tipoServicio,
      medioServicio: f.tipoServicio === 'completo' ? 'entrada' : f.medioServicio,
      diasSemana: f.tipoServicio === 'medio' ? f.diasSemana : [],
      fechasDiarias: f.tipoServicio === 'diario' ? f.fechasDiarias : [],
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const data = payloadFromForm(form);
    const msg = validate({ ...data });
    if (msg) {
      setError(msg);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) await OperatorPortal.updateSubmission(token, editingId, data);
      else await OperatorPortal.addSubmission(token, data);
      setNotice(editingId ? 'Cambios enviados a revisión.' : 'Alumno enviado a revisión.');
      closeForm();
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(s) {
    if (!window.confirm(`¿Quitar a ${s.name} de tu lista?`)) return;
    try {
      await OperatorPortal.removeSubmission(token, s.id);
    } catch (err) {
      window.alert(err.message || 'No se pudo quitar.');
    }
  }

  // Importación masiva desde Excel / CSV: columnas matrícula, nombre, nivel,
  // grado, familiar, teléfono, domicilio, servicio (completo/medio/diario).
  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const routeId = routes.length === 1 ? routes[0].id : form.routeId;
    if (!routeId) {
      window.alert('Primero elige la ruta en el formulario ("Agregar alumno") y vuelve a importar.');
      return;
    }
    const route = routes.find((r) => r.id === routeId);
    setSaving(true);
    setNotice('');
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const existing = new Set(subs.filter((s) => s.status !== 'rejected').map((s) => String(s.matricula).trim().toLowerCase()));
      let added = 0;
      let skipped = 0;
      for (const raw of rows) {
        const r = {};
        Object.entries(raw).forEach(([k, v]) => {
          r[normKey(k)] = String(v ?? '').trim();
        });
        const matricula = r.matricula || r.matr || r.id || '';
        const name = r.nombre || r.alumno || r.name || '';
        if (!matricula || !name || existing.has(matricula.toLowerCase())) {
          skipped += 1;
          continue;
        }
        const svcRaw = normKey(r.servicio || r.tipodeservicio || 'completo');
        const tipoServicio = svcRaw.startsWith('medio') ? 'medio' : svcRaw.startsWith('diario') ? 'diario' : 'completo';
        await OperatorPortal.addSubmission(token, {
          matricula,
          name,
          nivel: r.nivel || '',
          grado: r.grado || '',
          familiarResponsable: r.familiar || r.familiarresponsable || r.tutor || '',
          telefono: r.telefono || r.tel || r.celular || '',
          address: r.domicilio || r.direccion || '',
          routeId,
          routeName: route?.name || '',
          schoolId: route?.schoolId || '',
          tipoServicio,
          medioServicio: normKey(r.medio || '') === 'salida' ? 'salida' : 'entrada',
          diasSemana: tipoServicio === 'medio' ? [1, 2, 3, 4, 5] : [],
          fechasDiarias: [],
        });
        existing.add(matricula.toLowerCase());
        added += 1;
      }
      setNotice(
        `Importación lista: ${added} alumno(s) enviados a revisión${skipped ? `, ${skipped} omitido(s) (sin matrícula/nombre o repetidos)` : ''}.` +
          (added ? ' Los servicios "medio" o "diario" quedaron con valores base; el administrador los ajusta al revisar.' : '')
      );
    } catch (err) {
      console.error(err);
      window.alert(`No se pudo leer el archivo: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  }

  /* -------------------------- estados de carga -------------------------- */
  if (link === undefined) return <LoadingOverlay show label="Abriendo tu enlace…" />;

  if (link === null || link.active === false) {
    return (
      <div className="min-h-screen bg-navy-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-panel p-6 max-w-sm w-full text-center">
          <img src="/ibime-shield.png" alt="" className="w-14 h-14 mx-auto mb-3" />
          <h1 className="font-display text-lg font-bold text-navy-900 mb-1">
            {link === null ? 'Enlace no válido' : 'Enlace desactivado'}
          </h1>
          <p className="text-sm text-navy-400">
            {link === null
              ? 'Este enlace no existe o está mal copiado. Pide uno nuevo al administrador.'
              : 'El administrador desactivó este enlace. Pídele que lo vuelva a activar.'}
          </p>
          {loadError && <p className="text-xs text-navy-400 mt-3">{loadError}</p>}
        </div>
      </div>
    );
  }

  const showRoutePicker = routes.length > 1;

  return (
    <div className="min-h-screen bg-navy-50">
      <header className="bg-navy-800 text-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src="/ibime-shield.png" alt="IBIME" className="w-10 h-10" />
          <div className="min-w-0">
            <p className="font-display font-semibold leading-tight">Ruta Segura · Portal del operador</p>
            <p className="text-navy-100 text-xs truncate">
              {link.operatorName ? `Operador: ${link.operatorName}` : 'Captura de alumnos'}
              {link.label ? ` · ${link.label}` : ''}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        <div className="admin-card flex gap-3 items-start cascade-item">
          <Info size={18} className="text-navy-400 shrink-0 mt-0.5" />
          <p className="text-sm text-navy-600">
            Captura aquí a los alumnos de tu ruta. Lo que envíes queda <strong>en revisión</strong>: solo el
            administrador puede aprobarlo y, al aprobarlo, el alumno se agrega a la lista de tu ruta. Mientras tanto
            puedes corregir o quitar lo que está pendiente.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { k: 'todos', label: 'Total', value: counts.total },
            { k: 'pending', label: 'En revisión', value: counts.pending },
            { k: 'approved', label: 'Aprobados', value: counts.approved },
            { k: 'rejected', label: 'Rechazados', value: counts.rejected },
          ].map((c, i) => (
            <button
              key={c.k}
              type="button"
              onClick={() => setFilter(c.k)}
              className={`admin-card text-left cascade-item transition-all ${
                filter === c.k ? 'border-navy-600 ring-2 ring-signal-yellow/40' : 'hover:border-navy-400'
              }`}
              style={cascadeStyle(i, 50)}
            >
              <p className="text-2xl font-display font-bold text-navy-800">{c.value}</p>
              <p className="text-xs text-navy-400">{c.label}</p>
            </button>
          ))}
        </div>

        {notice && (
          <div className="rounded-lg bg-go-light border border-go/20 text-go text-sm px-4 py-3 cascade-item">{notice}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={openNew} className="btn-admin-primary sm:w-auto w-full">
            <Plus size={16} /> Agregar alumno
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={saving}
            className="btn-admin-ghost sm:w-auto w-full"
          >
            <Upload size={16} /> Importar Excel / CSV
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
            <input
              className="admin-input pl-9"
              placeholder="Buscar por nombre o matrícula"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {showForm && (
          <form ref={formRef} onSubmit={handleSubmit} className="admin-card space-y-4 cascade-item scroll-mt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-navy-900">{editingId ? 'Editar alumno' : 'Nuevo alumno'}</h2>
              <button type="button" onClick={closeForm} className="p-1 text-navy-400 hover:text-navy-800" aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="admin-label">Matrícula *</label>
                <input className="admin-input" value={form.matricula} onChange={(e) => setField('matricula', e.target.value)} />
              </div>
              <div>
                <label className="admin-label">Nombre completo *</label>
                <input className="admin-input" value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </div>
              <div>
                <label className="admin-label">Nivel</label>
                <input className="admin-input" placeholder="Primaria, Secundaria…" value={form.nivel} onChange={(e) => setField('nivel', e.target.value)} />
              </div>
              <div>
                <label className="admin-label">Grado y grupo</label>
                <input className="admin-input" placeholder="3° A" value={form.grado} onChange={(e) => setField('grado', e.target.value)} />
              </div>
              <div>
                <label className="admin-label">Familiar responsable</label>
                <input className="admin-input" value={form.familiarResponsable} onChange={(e) => setField('familiarResponsable', e.target.value)} />
              </div>
              <div>
                <label className="admin-label">Teléfono</label>
                <input className="admin-input" inputMode="tel" value={form.telefono} onChange={(e) => setField('telefono', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="admin-label">Domicilio</label>
                <input className="admin-input" value={form.address} onChange={(e) => setField('address', e.target.value)} />
              </div>
              {showRoutePicker && (
                <div className="sm:col-span-2">
                  <label className="admin-label">Ruta *</label>
                  <select className="admin-select" value={form.routeId} onChange={(e) => setField('routeId', e.target.value)}>
                    <option value="">Elige la ruta…</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.schoolName ? ` — ${r.schoolName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="admin-label">Servicio</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { k: 'completo', t: 'Completo', d: 'Entrada y salida' },
                  { k: 'medio', t: 'Medio', d: 'Entrada o salida' },
                  { k: 'diario', t: 'Diario', d: 'Fechas específicas' },
                ].map((o) => (
                  <button
                    type="button"
                    key={o.k}
                    onClick={() => setField('tipoServicio', o.k)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-all ${
                      form.tipoServicio === o.k
                        ? 'border-navy-600 bg-navy-50 ring-2 ring-signal-yellow/40'
                        : 'border-navy-100 hover:border-navy-400'
                    }`}
                  >
                    <p className="text-sm font-semibold text-navy-800">{o.t}</p>
                    <p className="text-xs text-navy-400">{o.d}</p>
                  </button>
                ))}
              </div>
            </div>

            {form.tipoServicio !== 'completo' && (
              <div>
                <label className="admin-label">Tramo</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { k: 'entrada', t: 'Solo entrada' },
                    { k: 'salida', t: 'Solo salida' },
                    ...(form.tipoServicio === 'diario' ? [{ k: 'ambas', t: 'Entrada y salida' }] : []),
                  ].map((o) => (
                    <button
                      type="button"
                      key={o.k}
                      onClick={() => setField('medioServicio', o.k)}
                      className={`px-3 h-10 rounded-md border text-sm font-medium ${
                        form.medioServicio === o.k ? 'bg-navy-800 text-white border-navy-800' : 'border-navy-100 text-navy-600'
                      }`}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.tipoServicio === 'medio' && (
              <div>
                <label className="admin-label">Días de servicio</label>
                <div className="flex gap-2">
                  {DAYS.map((d) => (
                    <button
                      type="button"
                      key={d.value}
                      title={d.name}
                      onClick={() => toggleDay(d.value)}
                      className={`w-11 h-11 rounded-md border text-sm font-semibold ${
                        form.diasSemana.includes(d.value) ? 'bg-navy-800 text-white border-navy-800' : 'border-navy-100 text-navy-600'
                      }`}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.tipoServicio === 'diario' && (
              <div>
                <label className="admin-label">Fechas de servicio</label>
                <div className="flex gap-2">
                  <input type="date" className="admin-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  <button type="button" onClick={addDate} className="btn-admin-ghost shrink-0">
                    Agregar
                  </button>
                </div>
                {form.fechasDiarias.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.fechasDiarias.map((d) => (
                      <span key={d} className="badge gap-1">
                        {d}
                        <button
                          type="button"
                          aria-label={`Quitar ${d}`}
                          onClick={() => setForm((f) => ({ ...f, fechasDiarias: f.fechasDiarias.filter((x) => x !== d) }))}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-stop bg-stop-light rounded-md px-3 py-2">{error}</p>}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button type="button" onClick={closeForm} className="btn-admin-ghost">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn-admin-primary">
                <Save size={16} /> {saving ? 'Enviando…' : editingId ? 'Enviar cambios a revisión' : 'Enviar a revisión'}
              </button>
            </div>
          </form>
        )}

        {/* Lista */}
        <div className="space-y-2">
          {sorted.length === 0 && (
            <div className="admin-card text-center py-10 text-navy-400">
              <Bus size={28} className="mx-auto mb-2" />
              <p className="text-sm">
                {subs.length === 0 ? 'Todavía no has cargado alumnos. Usa “Agregar alumno”.' : 'Sin resultados con ese filtro.'}
              </p>
            </div>
          )}
          {sorted.map((s, i) => {
            const st = STATUS[s.status] || STATUS.pending;
            const Icon = st.icon;
            const editable = s.status !== 'approved';
            return (
              <div key={s.id} className="admin-card !p-3 sm:!p-4 cascade-item" style={cascadeStyle(i, 25)}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-navy-900 truncate">{s.name}</p>
                      <span className={`${st.cls} gap-1`}>
                        <Icon size={12} /> {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-navy-400 mt-0.5">
                      Mat. {s.matricula}
                      {s.grado ? ` · ${s.grado}` : ''}
                      {s.routeName ? ` · ${s.routeName}` : ''}
                    </p>
                    <p className="text-xs text-navy-600 mt-0.5">{serviceLabel(s)}</p>
                    {s.status === 'rejected' && s.rejectReason && (
                      <p className="text-xs text-stop mt-1">Motivo: {s.rejectReason}</p>
                    )}
                  </div>
                  {editable && (
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => openEdit(s)} className="p-2 rounded-md text-navy-600 hover:bg-navy-50" aria-label="Editar">
                        <Pencil size={16} />
                      </button>
                      {s.status === 'pending' && (
                        <button type="button" onClick={() => handleRemove(s)} className="p-2 rounded-md text-stop hover:bg-stop-light" aria-label="Quitar">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-navy-400 pt-2 pb-6">IBIME · Ruta Segura</p>
      </main>
    </div>
  );
}
