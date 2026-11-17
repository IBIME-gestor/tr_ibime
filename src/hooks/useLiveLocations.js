import { useEffect, useState } from 'react';
import { subscribeTodayLiveLocations } from '../firebase/trips';

/**
 * Ubicaciones en vivo de los recorridos de hoy ({ [tripId]: liveLocation }), para las
 * pantallas de administración. Solo escucha mientras la pestaña está a la vista: si
 * está oculta, se pausa (cada actualización cuenta como una lectura de Firestore).
 */
export default function useLiveLocations() {
  const [map, setMap] = useState({});
  const [visible, setVisible] = useState(typeof document === 'undefined' ? true : !document.hidden);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    return subscribeTodayLiveLocations(setMap);
  }, [visible]);

  return map;
}

/** Superpone la ubicación en vivo en cada recorrido (la ubicación ya no se guarda en trips). */
export const withLive = (trips, map) => trips.map((t) => (map[t.id] ? { ...t, liveLocation: map[t.id] } : t));
