import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listTripsByDriver } from '../../firebase/trips';

export default function TripHistory() {
  const { profile } = useAuth();
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    async function load() {
      if (!profile?.driverId) return;
      const data = await listTripsByDriver(profile.driverId);
      setTrips(data);
    }
    load();
  }, [profile]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-display font-bold">Recorridos anteriores</h1>
      {trips.length === 0 && <p className="text-navy-400 text-sm">Aún no hay recorridos guardados.</p>}
      {trips.map((t) => (
        <Link key={t.id} to={`/chofer/resumen/${t.id}`} className="card flex items-center justify-between">
          <div>
            <p className="font-medium">{t.date}</p>
            <p className="text-sm text-navy-400">{t.shift === 'morning' ? 'Ida' : 'Vuelta'} · {t.status === 'completed' ? 'Completado' : 'En curso'}</p>
          </div>
          <span>›</span>
        </Link>
      ))}
    </div>
  );
}
