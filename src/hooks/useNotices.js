import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeMyPending, ackNotice } from '../firebase/announcements';

/** Avisos pendientes del operador/nanny en sesión (urgentes primero, luego los más viejos). */
export default function useNotices() {
  const { profile } = useAuth();
  const staffId = profile?.staffId;
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!staffId) { setRows([]); return undefined; }
    return subscribeMyPending(staffId, setRows);
  }, [staffId]);

  const pending = useMemo(() => [...rows].sort((a, b) => {
    const ua = a.priority === 'urgente' ? 0 : 1;
    const ub = b.priority === 'urgente' ? 0 : 1;
    return ua - ub || (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  }), [rows]);

  return { pending, ack: ackNotice };
}
