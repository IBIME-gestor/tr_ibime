import { useEffect, useMemo, useState } from 'react';
import { KpiIndicators, subscribeMyEvidence, getDriveConfig } from '../firebase/kpiTasks';
import { appliesToRole, isScheduled, todayStr, nowHHMM } from '../utils/kpiTasks';

/** Días hacia atrás en los que el operador todavía puede entregar una tarea atrasada. */
export const GRACE_DAYS = 3;

function addDays(date, n) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Tareas del operador / nannie: hoy y los últimos días que sigan pendientes.
 * state: 'pendiente' | 'rechazada' | 'revision' | 'aprobada'
 */
export default function useMyTasks(profile) {
  const staffId = profile?.staffId;
  const role = profile?.role === 'nanny' ? 'nanny' : 'operador';
  const [indicators, setIndicators] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => KpiIndicators.subscribe(setIndicators, () => setError(true)), []);
  useEffect(() => {
    if (!staffId) { setLoading(false); return undefined; }
    return subscribeMyEvidence(staffId, (rows) => { setEvidence(rows); setLoading(false); });
  }, [staffId]);
  useEffect(() => { getDriveConfig().then(setCfg).catch(() => setCfg(null)); }, []);

  const tasks = useMemo(() => {
    const today = todayStr();
    const out = [];
    indicators.filter((i) => appliesToRole(i, role)).forEach((ind) => {
      for (let back = 0; back <= GRACE_DAYS; back += 1) {
        const date = addDays(today, -back);
        if (!isScheduled(ind, date)) continue;
        const ev = evidence.find((e) => e.indicatorId === ind.id && e.date === date) || null;
        const state = !ev ? 'pendiente' : ev.status === 'rechazada' ? 'rechazada' : ev.status === 'aprobada' ? 'aprobada' : 'revision';
        // Días pasados ya entregados no estorban en la lista
        if (back > 0 && (state === 'aprobada' || state === 'revision')) continue;
        const late = date < today || (!!ind.deadline && nowHHMM() > ind.deadline);
        out.push({ key: `${ind.id}_${date}`, ind, date, ev, state, late });
      }
    });
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.ind.name.localeCompare(b.ind.name));
  }, [indicators, evidence, role]);

  // Próximas tareas (siguientes 7 días): para que se vea que SÍ están programadas aunque hoy no toquen
  const upcoming = useMemo(() => {
    const today = todayStr();
    const out = [];
    indicators.filter((i) => appliesToRole(i, role)).forEach((ind) => {
      for (let ahead = 1; ahead <= 7; ahead += 1) {
        const date = addDays(today, ahead);
        if (isScheduled(ind, date)) out.push({ key: `${ind.id}_${date}`, ind, date });
      }
    });
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.ind.name.localeCompare(b.ind.name));
  }, [indicators, role]);

  const actionable = tasks.filter((t) => t.state === 'pendiente' || t.state === 'rechazada').length;
  return { tasks, upcoming, actionable, loading, error, cfg, role };
}
