import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Agenda, reminderStage, stageLabel } from '../firebase/agenda';

const STORE_KEY = 'agenda_notified_v1';
const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; } };
const writeStore = (v) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

/**
 * Pendientes de la agenda del admin con su etapa de aviso (24/12/6/1 h o vencido).
 * Además, si el usuario activó los avisos del navegador, lanza una notificación
 * cada vez que un pendiente entra a una etapa más urgente (solo con la app abierta).
 */
export default function useAgendaAlerts() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const enabled = profile?.role === 'admin' && !!user?.uid;
  const notified = useRef(readStore());

  useEffect(() => {
    if (!enabled) return undefined;
    return Agenda.subscribeMine(user.uid, setItems, (e) => setError(e?.message || 'No se pudo leer la agenda.'));
  }, [enabled, user?.uid]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const withStage = useMemo(
    () => items.map((it) => ({ ...it, stage: reminderStage(it, now) })),
    [items, now]
  );
  const alerts = useMemo(() => withStage.filter((it) => it.stage !== null && !it.done), [withStage]);

  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    let changed = false;
    alerts.forEach((it) => {
      const last = notified.current[it.id];
      if (last === undefined || it.stage < last) {
        try { new Notification(`Agenda: ${it.title}`, { body: stageLabel(it.stage), tag: `agenda-${it.id}` }); } catch { /* ignorar */ }
        notified.current[it.id] = it.stage;
        changed = true;
      }
    });
    if (changed) writeStore(notified.current);
  }, [alerts, enabled]);

  return { items: withStage, alerts, count: alerts.length, error, enabled };
}
