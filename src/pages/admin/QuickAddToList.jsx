import { useMemo, useState } from 'react';
import { X, Plus, AlertTriangle } from 'lucide-react';
import { Students, RouteLists, FinanceRecords } from '../../firebase/services';
import { buildStudentRow, financePayload, invalidateListReviewPatch, priorityCompare, DAY_META, SERVICE_OPTIONS, dayHeader } from './RouteBuilder';

/* ------------------------------------------------------------------ */
/*  Módulo exprés «Agregar a lista» (se abre desde Banco Cometa)       */
/*  Mete al alumno en la(s) lista(s) de ruta de uno o varios meses con  */
/*  la MISMA lógica de «Formar ruta» (concepto, monto, capacidad,       */
/*  registro financiero) para poder aplicar el pago ahí mismo.          */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthLabel = (ym) => { const [y, m] = String(ym).split('-').map(Number); return `${MONTH_NAMES[(m || 1) - 1]} de ${y}`; };
const money = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const monthOf = (l) => String(l.startDate || '').slice(0, 7);

export default function QuickAddToList({ student, months, hintTipo, lists, routes, units, concepts, schools, profile, user, onClose, onDone }) {
  const [routeId, setRouteId] = useState(student.routeId || '');
  const [tipo, setTipo] = useState(student.tipoServicio || hintTipo || 'completo');
  const [medio, setMedio] = useState(student.medioServicio || 'entrada');
  const [dias, setDias] = useState((student.diasSemana?.length ? student.diasSemana : [1, 2, 3, 4, 5]).map(Number));
  const [fechas, setFechas] = useState({}); // { 'YYYY-MM': [fechas] } solo para servicio diario
  const [chosen, setChosen] = useState({}); // { 'YYYY-MM': listId }
  const [skip, setSkip] = useState({});     // { 'YYYY-MM': true } = no agregar en ese mes
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const route = routes.find((r) => r.id === routeId) || null;
  const school = schools.find((s) => s.id === route?.schoolId) || null;
  const unit = units.find((u) => u.id === route?.unitId) || null;
  const capacity = Number(unit?.capacity || 0);

  const candidates = (ym) => lists.filter((l) => l.routeId === routeId && monthOf(l) === ym && l.status !== 'eliminada');
  const pickedList = (ym) => {
    const cs = candidates(ym);
    return cs.find((l) => l.id === chosen[ym]) || cs[0] || null;
  };

  const entries = useMemo(() => months.map((ym) => {
    const list = pickedList(ym);
    const base = { ym, list, off: !!skip[ym] || !list, problems: [], preview: null };
    if (!list || !route) return base;
    const already = (list.rows || []).some((r) => r.studentId === student.id);
    const dates = list.dates || [];
    const mine = (fechas[ym] || []).filter((d) => dates.includes(d));
    const preview = buildStudentRow({
      ...student, routeId, tipoServicio: tipo, medioServicio: medio,
      diasSemana: tipo === 'medio' ? dias : [1, 2, 3, 4, 5], fechasDiarias: tipo === 'diario' ? mine : [],
    }, dates, concepts, route);
    const problems = [];
    if (already) problems.push('El alumno ya está en esa lista.');
    if (tipo === 'medio' && !dias.length) problems.push('Elige al menos un día de lunes a viernes.');
    if (tipo === 'diario' && !mine.length) problems.push('Elige al menos una fecha del servicio diario.');
    if (!preview.pricingConceptId || !(preview.baseAmount > 0)) problems.push('La ruta no tiene concepto/tarifa válido para este tipo de servicio (revisa Rutas).');
    if (capacity > 0) {
      const over = dates.filter((d) => {
        let e = 0; let s = 0;
        [...(list.rows || []).filter((r) => r.studentId !== student.id), preview].forEach((r) => { const u = r.days?.[d]; if (u?.entrada) e += 1; if (u?.salida) s += 1; });
        return e > capacity || s > capacity;
      });
      if (over.length) problems.push(`La unidad ${unit?.plate || ''} (${capacity} lugares) se pasa de capacidad en: ${over.slice(0, 6).map(dayHeader).join(', ')}${over.length > 6 ? '…' : ''}`);
    }
    return { ...base, off: !!skip[ym], preview, problems, dates };
  }), // eslint-disable-next-line react-hooks/exhaustive-deps
  [months, lists, routeId, tipo, medio, dias, fechas, chosen, skip, concepts, route]);

  const active = entries.filter((e) => !e.off);
  const blocking = active.flatMap((e) => e.problems);
  const canSave = !!route && active.length > 0 && blocking.length === 0 && !saving;

  const toggleDia = (d) => setDias((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort((a, b) => a - b)));
  const toggleFecha = (ym, d) => setFechas((p) => { const cur = p[ym] || []; return { ...p, [ym]: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() }; });

  async function save() {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      // 1) El alumno queda en la ruta con su tipo de servicio (igual que «Formar ruta»).
      const last = active[active.length - 1];
      const data = {
        routeId, tipoServicio: tipo, medioServicio: medio,
        diasSemana: tipo === 'medio' ? dias : [1, 2, 3, 4, 5],
        fechasDiarias: tipo === 'diario' ? (fechas[last.ym] || []).filter((d) => (last.dates || []).includes(d)) : [],
        billingAmount: last.preview.estimatedAmount, billingBaseAmount: last.preview.baseAmount, billingConcept: last.preview.concept,
        billingMode: last.preview.billingMode, pricingConceptId: last.preview.pricingConceptId, billingDaysCount: last.preview.daysCount,
        billingUpdatedAt: new Date().toISOString(),
      };
      await Students.update(student.id, data);
      const refreshed = { ...student, ...data };

      // 2) Se agrega a cada lista (se vuelve a leer la lista para no pisar cambios de otros).
      const updatedLists = [];
      const done = [];
      for (const e of active) {
        const fresh = (await RouteLists.get(e.list.id)) || e.list;
        if ((fresh.rows || []).some((r) => r.studentId === student.id)) continue;
        const row = { ...buildStudentRow(refreshed, fresh.dates || e.dates, concepts, route), paid: false, paymentId: '' };
        const rows = [...(fresh.rows || []), row].sort(priorityCompare);
        const reset = invalidateListReviewPatch();
        await RouteLists.update(fresh.id, { rows, ...reset });
        const fid = `${fresh.id}_${student.id}`;
        const existing = await FinanceRecords.get(fid);
        await FinanceRecords.upsert(fid, financePayload(row, fresh, route, school, existing || {}));
        updatedLists.push({ ...fresh, rows, ...reset });
        done.push(e.ym);
      }
      onDone({ student: refreshed, lists: updatedLists, months: done });
    } catch (err) {
      console.error(err);
      setError(`${err?.message || 'No se pudo agregar a la lista.'} Revisa el estado real (puede que algún mes ya se haya agregado) y vuelve a intentar.`);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-900/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display font-semibold text-navy-800">Agregar a lista · carga exprés</p>
            <p className="text-xs text-navy-500">{student.name} · <span className="font-mono">{student.matricula || 'sin matrícula'}</span></p>
          </div>
          <button type="button" className="btn-admin-ghost" onClick={onClose} disabled={saving}><X size={14} /></button>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="admin-label">Ruta</label>
            <select className="admin-select w-full" value={routeId} onChange={(e) => { setRouteId(e.target.value); setChosen({}); }}>
              <option value="">— elige ruta —</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="admin-label">Tipo de servicio</label>
            <select className="admin-select w-full" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {SERVICE_OPTIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </div>
          {tipo !== 'completo' && (
            <div>
              <label className="admin-label">{tipo === 'diario' ? 'Servicio del día' : 'Entrada o salida'}</label>
              <select className="admin-select w-full" value={medio} onChange={(e) => setMedio(e.target.value)}>
                <option value="entrada">Solo entrada</option><option value="salida">Solo salida</option>
                {tipo === 'diario' && <option value="ambas">Entrada + salida</option>}
              </select>
            </div>
          )}
          {tipo === 'medio' && (
            <div>
              <label className="admin-label">¿Qué días?</label>
              <div className="flex gap-2">{DAY_META.map((d) => (
                <label key={d.value} className={`inline-flex items-center gap-1 px-2 py-1.5 rounded border text-xs cursor-pointer ${dias.includes(d.value) ? 'bg-signal-yellow/20 border-signal-yellow/60' : 'border-navy-200'}`}>
                  <input type="checkbox" checked={dias.includes(d.value)} onChange={() => toggleDia(d.value)} />{d.short}
                </label>))}</div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {entries.map((e) => (
            <div key={e.ym} className={`rounded-xl border p-3 space-y-2 ${e.off ? 'border-navy-100 opacity-60' : 'border-navy-200'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-navy-800 capitalize">{monthLabel(e.ym)}</p>
                {e.list && <label className="text-xs inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={!skip[e.ym]} onChange={(ev) => setSkip((p) => ({ ...p, [e.ym]: !ev.target.checked }))} />Agregar en este mes</label>}
              </div>
              {!routeId ? <p className="text-xs text-navy-500">Elige una ruta.</p>
                : !candidates(e.ym).length ? <p className="text-xs text-amber-800 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />Esta ruta no tiene lista en {monthLabel(e.ym)}. Créala en «Formar ruta» y vuelve; mientras tanto el pago se aplicará solo al mes.</p>
                  : <>
                    <div>
                      <label className="admin-label">Lista</label>
                      <select className="admin-select w-full" value={e.list?.id || ''} onChange={(ev) => setChosen((p) => ({ ...p, [e.ym]: ev.target.value }))}>
                        {candidates(e.ym).map((l) => <option key={l.id} value={l.id}>{l.listName || `${l.startDate} ${l.endDate}`}</option>)}
                      </select>
                    </div>
                    {tipo === 'diario' && !e.off && (
                      <div>
                        <label className="admin-label">Fechas de servicio en {monthLabel(e.ym)}</label>
                        <div className="flex flex-wrap gap-1.5">{(e.list?.dates || []).map((d) => (
                          <label key={d} className={`inline-flex items-center gap-1 px-2 py-1.5 rounded border text-xs cursor-pointer ${(fechas[e.ym] || []).includes(d) ? 'bg-signal-yellow/20 border-signal-yellow/60' : 'border-navy-200'}`}>
                            <input type="checkbox" checked={(fechas[e.ym] || []).includes(d)} onChange={() => toggleFecha(e.ym, d)} />{dayHeader(d)}
                          </label>))}</div>
                      </div>
                    )}
                    {e.preview && !e.off && <div className="p-2 rounded bg-navy-50 text-xs"><b>Concepto:</b> {e.preview.concept || 'No configurado'} · <b>Monto:</b> {money(e.preview.estimatedAmount)} · <b>Días:</b> {e.preview.daysCount}</div>}
                    {!e.off && e.problems.map((w) => <p key={w} className="text-xs text-red-700 flex gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{w}</p>)}
                  </>}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-navy-500">Se actualiza «Formar ruta», Finanzas y la tabla de Cometa al guardar.</span>
          <div className="flex gap-2">
            <button type="button" className="btn-admin-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className="btn-admin-primary" disabled={!canSave} onClick={save}><Plus size={13} className="inline mr-1" />{saving ? 'Agregando…' : `Agregar a ${active.length} lista(s)`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
