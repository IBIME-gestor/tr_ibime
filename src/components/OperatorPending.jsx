import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Bus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SpecialTrips } from '../firebase/specialTrips';

/** Recuadro de Inicio del operador: avisos sin confirmar y viajes especiales asignados. */
export default function OperatorPending({ pendingNotices }) {
  const { profile } = useAuth();
  const [trips, setTrips] = useState(0);

  useEffect(() => {
    if (profile?.role !== 'driver' || !profile?.staffId) return;
    SpecialTrips.listByOperator(profile.staffId)
      .then((rows) => setTrips(rows.filter((t) => t.status === 'asignado' || t.status === 'en_curso').length))
      .catch(() => setTrips(0));
  }, [profile?.role, profile?.staffId]);

  if (!pendingNotices && !trips) return null;
  return (
    <div className="space-y-2 mb-4">
      {pendingNotices > 0 && (
        <Link to="/chofer/avisos" className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Bell size={18} /> <span className="flex-1">Tienes <b>{pendingNotices}</b> aviso(s) sin confirmar.</span> <span className="font-semibold">Ver</span>
        </Link>
      )}
      {trips > 0 && (
        <Link to="/chofer/viajes-especiales" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Bus size={18} /> <span className="flex-1">Tienes <b>{trips}</b> viaje(s) especial(es) asignado(s).</span> <span className="font-semibold">Ver</span>
        </Link>
      )}
    </div>
  );
}
