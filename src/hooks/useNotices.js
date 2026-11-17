import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeMyPending, ackNotice } from '../firebase/announcements';
import { isPublished } from '../utils/schedule';

/** Avisos pendientes del operador/nanny en sesión (urgentes primero, luego los más viejos). */
export default function useNotices() {
  const { profile } = useAuth();
  const staffId = profile?.staffId;
  const [rows, setRows] = useState([]);
  const [now, setNow] = useState(Date.now());
  // Reloj: un aviso programado aparece solo cuando llega su día y hora, aunque la app ya esté abierta.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!staffId) { setRows([]); return undefined; }
    return subscribeMyPending(staffId, setRows);
  }, [staffId]);

  const pending = useMemo(() => rows.filter((r) => isPublished(r, now)).sort((a, b) => {
    const ua = a.priority === 'urgente' ? 0 : 1;
    const ub = b.priority === 'urgente' ? 0 : 1;
    return ua - ub || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  }), [rows, now]);

  return { pending, ack: ackNotice };
}
