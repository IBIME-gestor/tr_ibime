import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Save, AlertTriangle, CheckCircle2, RotateCcw, History, Code2 } from 'lucide-react';
import { Students, Schools, Routes } from '../../../firebase/services';
import { listAudit, diffFields } from '../../../firebase/audit';
import { TIPOS_SERVICIO, BILLING_MODES, PAYMENT_STATUSES } from '../Students';
import { FIELD_LABEL } from './BitacoraCambios';

// Campos que el sistema maneja solo: no se editan a mano.
const PROTECTED = new Set(['id', 'createdAt', 'updatedAt']);

const SERVICIO_ENTRADA = { entrada: 'Solo entrada', salida: 'Solo salida' };

const fmt = (ts) => {
  const v = ts?.toMillis ? ts.toMillis() : null;
  return v ? new Date(v).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
};

/** El documento sin lo que no se edita, y con Timestamps ya convertidos a texto. */
function editable(student) {
  const out = {};
  Object.entries(student || {}).forEach(([k, v]) => {
    if (PROTECTED.has(k)) return;
    out[k] = v && typeof v === 'object' && typeof v.toDate === 'function' ? v.toDate().toISOString() : v;
  });
  return out;
}

const same = (a, b) =>
  (typeof a === 'object' && a !== null) || (typeof b === 'object' && b !== null)
    ? JSON.stringify(a ?? '') === JSON.stringify(b ?? '')
    : String(a ?? '') === String(b ?? '');

/**
 * Soporte / Editor de alumnos
 * Corrige cualquier dato de un alumno. Antes de guardar muestra exactamente
 * qué va a cambiar; al guardar actualiza el expediente, el índice público de
 * la matrícula y la búsqueda del operador, y deja el movimiento en la bitácora.
 */
export default function EditorAlumnos() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [original, setOriginal] = useState(null); // documento tal como está guardado
  const [draft, setDraft] = useState(null);
  const [studentId, setStudentId] = useState('');
  const [schools, setSchools] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [advanced, setAdvanced] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    Schools.list().then(setSchools).catch(() => {});
    Routes.list().then(setRoutes).catch(() => {});
  }, []);

  // Búsqueda con pequeña espera mientras se escribe.
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setResults([]); return undefined; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setResults(await Students.search(q, 15)); } catch (e) { setError(e?.message || 'No se pudo buscar.'); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  async function openStudent(id) {
    setError(''); setNotice(''); setConfirming(false); setAdvanced(false);
    try {
      const fresh = await Students.get(id); // siempre el documento actual, no la copia de la búsqueda
      if (!fresh) { setError('Ese alumno ya no existe.'); return; }
      const e = editable(fresh);
      setStudentId(id); setOriginal(e); setDraft(e); setJsonText(JSON.stringify(e, null, 2)); setJsonError('');
      setResults([]); setTerm('');
      listAudit({ max: 8, entityId: id }).then(setHistory).catch(() => setHistory([]));
    } catch (e) { setError(e?.message || 'No se pudo abrir al alumno.'); }
  }

  const set = (field, value) => {
    setConfirming(false);
    const next = { ...draft, [field]: value };
    setDraft(next);
    setJsonText(JSON.stringify(next, null, 2));
  };

  function applyJson(text) {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Debe ser un objeto { … }');
      setDraft(parsed); setJsonError(''); setConfirming(false);
    } catch (e) { setJsonError(`JSON no válido: ${e.message}`); }
  }

  // Solo los campos que realmente cambian (no se pueden borrar campos desde aquí).
  const patch = useMemo(() => {
    if (!original || !draft) return {};
    const out = {};
    Object.keys(draft).forEach((k) => {
      if (PROTECTED.has(k)) return;
      if (!same(original[k], draft[k])) out[k] = draft[k];
    });
    return out;
  }, [original, draft]);
  const changes = useMemo(() => diffFields(original, patch), [original, patch]);
  const removedKeys = useMemo(
    () => (original && draft ? Object.keys(original).filter((k) => !(k in draft)) : []),
    [original, draft]
  );
  const dirty = Object.keys(patch).length > 0;

  async function review() {
    setError(''); setNotice('');
    const name = String(draft.name || '').trim();
    const mat = String(draft.matricula || '').trim();
    if (!name) { setError('El nombre no puede quedar vacío.'); return; }
    if (!mat) { setError('La matrícula no puede quedar vacía.'); return; }
    if (mat !== String(original.matricula || '').trim()) {
      const dup = await Students.findByMatricula(mat);
      if (dup && dup.id !== studentId) { setError(`La matrícula ${mat} ya pertenece a ${dup.name}.`); return; }
    }
    setConfirming(true);
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const clean = { ...patch };
      if ('name' in clean) clean.name = String(clean.name).trim();
      if ('matricula' in clean) clean.matricula = String(clean.matricula).trim();
      if ('billingAmount' in clean && clean.billingAmount !== '' && !Number.isNaN(Number(clean.billingAmount))) {
        clean.billingAmount = Number(clean.billingAmount);
      }
      await Students.update(studentId, clean); // actualiza expediente + índice público + bitácora
      setNotice('Cambios guardados. Ya se ven en la búsqueda del operador y en las listas.');
      setConfirming(false);
      await openStudent(studentId);
      setNotice('Cambios guardados. Ya se ven en la búsqueda del operador y en las listas.');
    } catch (e) {
      console.error(e);
      setError(e?.message || 'No se pudo guardar.');
    } finally { setSaving(false); }
  }

  const rotate = () => { setDraft(original); setJsonText(JSON.stringify(original, null, 2)); setJsonError(''); setConfirming(false); };

  const text = (field, label, props = {}) => (
    <label className="block">
      <span className="admin-label">{label}</span>
      <input className="admin-input w-full" value={draft?.[field] ?? ''} onChange={(e) => set(field, e.target.value)} {...props} />
    </label>
  );
  const select = (field, label, options, empty = '— Sin asignar —') => (
    <label className="block">
      <span className="admin-label">{label}</span>
      <select className="admin-select w-full" value={draft?.[field] ?? ''} onChange={(e) => set(field, e.target.value)}>
        <option value="">{empty}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  const tipoOptions = Object.entries(TIPOS_SERVICIO);
  if (draft?.tipoServicio && !TIPOS_SERVICIO[draft.tipoServicio]) tipoOptions.push([draft.tipoServicio, draft.tipoServicio]);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <p className="text-xs text-navy-400 font-semibold">Soporte</p>
        <h1 className="admin-h1 mt-1">Editor de alumnos</h1>
        <p className="text-sm text-navy-500 mt-1 max-w-3xl">
          Busca a un alumno por nombre, apellido o matrícula y corrige lo que haga falta. Antes de guardar ves
          exactamente qué cambia, y cada guardado queda en la bitácora.
        </p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 p-3 text-sm flex gap-2"><AlertTriangle size={18} className="shrink-0" /> {error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-sm flex gap-2"><CheckCircle2 size={18} className="shrink-0" /> {notice}</div>}

      <section className="admin-card relative">
        <label className="admin-label">Buscar alumno</label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            type="search"
            className="admin-input !pl-9 w-full"
            placeholder="Ej. “garcia juan” o una matrícula…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        {searching && <p className="text-xs text-navy-400 mt-2">Buscando…</p>}
        {results.length > 0 && (
          <ul className="mt-3 divide-y divide-navy-100 rounded-xl border border-navy-100 overflow-hidden">
            {results.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => openStudent(s.id)} className="w-full text-left px-3 py-2.5 hover:bg-navy-50 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-navy-900 truncate">{s.name}</span>
                    <span className="block text-xs text-navy-400">Matrícula {s.matricula || '—'}{s.grado ? ` · ${s.grado}` : ''}</span>
                  </span>
                  <span className="text-xs text-navy-500 shrink-0">{routes.find((r) => r.id === s.routeId)?.name || 'Sin ruta'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {term.trim().length >= 2 && !searching && results.length === 0 && (
          <p className="text-sm text-navy-500 mt-3">No se encontró a nadie con esa búsqueda.</p>
        )}
      </section>

      {draft && (
        <>
          <section className="admin-card space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold text-navy-900">{original.name}</p>
                <p className="text-xs text-navy-400">Matrícula {original.matricula || '—'}</p>
              </div>
              <div className="flex gap-2">
                <Link to={`/admin/soporte/bitacora?alumno=${studentId}`} className="btn-admin-ghost"><History size={14} /> Historial</Link>
                <button className="btn-admin-ghost" onClick={rotate} disabled={!dirty}><RotateCcw size={14} /> Deshacer cambios</button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Datos del alumno</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {text('name', 'Nombre completo')}
                {text('matricula', 'Matrícula')}
                {text('studentEmail', 'Correo del alumno', { type: 'email' })}
                {text('nivel', 'Nivel')}
                {text('grado', 'Grado')}
                {select('schoolId', 'Plantel', schools.map((s) => [s.id, s.name]))}
                {select('routeId', 'Ruta', routes.map((r) => [r.id, r.name]), '— Sin ruta —')}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Familia y contacto</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {text('familiarResponsable', 'Familiar responsable')}
                {text('telefono', 'Teléfono')}
                {text('parentContact', 'Contacto del padre')}
                {text('parentEmail', 'Correo del padre', { type: 'email' })}
                <div className="sm:col-span-2">{text('address', 'Domicilio')}</div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Servicio y cobro</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {select('tipoServicio', 'Tipo de servicio', tipoOptions, '—')}
                {draft.tipoServicio === 'medio' && select('medioServicio', 'Cuál servicio', Object.entries(SERVICIO_ENTRADA), '—')}
                {select('billingMode', 'Modo de cobro', Object.entries(BILLING_MODES), '—')}
                {text('billingAmount', 'Monto', { inputMode: 'decimal' })}
                {select('paymentStatus', 'Estatus de pago', Object.entries(PAYMENT_STATUSES).map(([k, v]) => [k, v.label]), '—')}
                {text('nextDueDate', 'Próximo vencimiento', { type: 'date' })}
              </div>
              <p className="text-xs text-navy-400 mt-2">
                Los días fijos y las fechas eventuales se pueden ajustar en «Avanzado» o desde{' '}
                <Link className="underline" to="/admin/alumnos">Alumnos</Link>.
              </p>
            </div>

            <div>
              <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-900" onClick={() => setAdvanced((v) => !v)}>
                <Code2 size={15} /> {advanced ? 'Ocultar' : 'Avanzado:'} datos completos del expediente (todos los campos)
              </button>
              {advanced && (
                <div className="mt-2 space-y-2">
                  <textarea
                    className="admin-input w-full font-mono text-xs"
                    rows={14}
                    spellCheck={false}
                    value={jsonText}
                    onChange={(e) => applyJson(e.target.value)}
                  />
                  {jsonError && <p className="text-xs text-red-700">{jsonError}</p>}
                  {removedKeys.length > 0 && (
                    <p className="text-xs text-amber-800">Los campos quitados del texto ({removedKeys.join(', ')}) se ignoran: desde aquí no se borran campos.</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Resumen de lo que cambia */}
          <section className={`rounded-2xl border p-4 space-y-3 ${dirty ? 'border-amber-300 bg-amber-50/70' : 'border-navy-100 bg-white'}`}>
            <p className="font-semibold text-navy-900">
              {dirty ? `Cambios por guardar (${Object.keys(changes).length || Object.keys(patch).length})` : 'Sin cambios todavía'}
            </p>
            {dirty && (
              <div className="overflow-x-auto rounded-xl border border-navy-100 bg-white">
                <table className="table-admin text-xs min-w-[420px]">
                  <thead><tr><th className="pl-3">Campo</th><th>Antes</th><th>Después</th></tr></thead>
                  <tbody>
                    {Object.entries(changes).map(([f, c]) => (
                      <tr key={f}>
                        <td className="pl-3 font-medium">{FIELD_LABEL[f] || f}</td>
                        <td className="text-red-700 break-words max-w-[260px]">{c.from === '' ? <i className="text-navy-300">vacío</i> : c.from}</td>
                        <td className="text-emerald-800 break-words max-w-[260px]">{c.to === '' ? <i className="text-navy-300">vacío</i> : c.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!confirming ? (
                <button className="btn-admin-primary" disabled={!dirty || !!jsonError} onClick={review}><Save size={14} /> Revisar y guardar</button>
              ) : (
                <>
                  <button className="btn-admin-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Confirmar y guardar'}</button>
                  <button className="btn-admin-ghost" disabled={saving} onClick={() => setConfirming(false)}>Seguir editando</button>
                </>
              )}
            </div>
          </section>

          {history.length > 0 && (
            <section className="admin-card">
              <p className="font-semibold text-navy-900 mb-2">Últimos movimientos de este alumno</p>
              <ul className="divide-y divide-navy-100 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span><b>{{ create: 'Alta', update: 'Edición', delete: 'Baja', bulk: 'Masivo' }[h.action] || h.action}</b> · {Object.keys(h.changes || {}).map((k) => FIELD_LABEL[k] || k).join(', ') || h.note || '—'}</span>
                    <span className="text-xs text-navy-400">{h.actorName || '—'} · {fmt(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
