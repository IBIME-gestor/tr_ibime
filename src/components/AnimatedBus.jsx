import { useEffect, useMemo, useRef } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { busIcon } from '../utils/mapIcons';
import { LIVE_LOCATION_INTERVAL_MS } from '../firebase/trips';

/**
 * Transporte que «avanza» por el mapa.
 *
 * La posición llega cada ~10 s (para cuidar las escrituras de Firestore), pero el
 * marcador no salta: se desliza de donde está hacia la nueva posición durante todo
 * el intervalo, así se ve como si fuera en tiempo real. Se mueve el marcador de
 * Leaflet directamente (sin pasar por el estado de React, que repintaría la página
 * en cada cuadro de la animación).
 *
 * Props: position {lat,lng}, at (hora del servidor de esa posición, ms), follow
 * (el mapa acompaña al transporte), zIndexOffset, eventHandlers, children (Popup).
 */
const SNAP_METERS = 3000; // si «salta» más que esto (GPS que reaparece), no se anima

function metersApart(a, b) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function AnimatedBus({ position, at, follow = false, zIndexOffset = 1000, eventHandlers, children }) {
  const map = useMap();
  const markerRef = useRef(null);
  const frameRef = useRef(null);
  const lastAtRef = useRef(null);

  useEffect(() => {
    if (!position) return undefined;
    const marker = markerRef.current;
    if (!marker) return undefined;
    cancelAnimationFrame(frameRef.current);

    // Se parte de donde el marcador está dibujado ahora (no de la posición anterior),
    // así, si llega una lectura antes de terminar el trayecto, no hay brincos hacia atrás.
    const cur = marker.getLatLng();
    const from = { lat: cur.lat, lng: cur.lng };

    // La animación dura lo que de verdad pasó entre las dos últimas posiciones (hora
    // del servidor), con un poco de holgura para que no se detenga esperando la
    // siguiente. Si hubo una pausa larga (estuvo parado), se usa el intervalo normal.
    const gap = at != null && lastAtRef.current != null ? at - lastAtRef.current : null;
    if (at != null) lastAtRef.current = at;
    const base = gap != null && gap >= 1500 && gap <= LIVE_LOCATION_INTERVAL_MS * 2 ? gap : LIVE_LOCATION_INTERVAL_MS;
    const duration = base * 1.1;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const same = from.lat === position.lat && from.lng === position.lng;
    if (reduce || same || metersApart(from, position) > SNAP_METERS) {
      marker.setLatLng([position.lat, position.lng]);
      if (follow) map.panTo([position.lat, position.lng], { animate: false });
      return undefined;
    }

    const start = performance.now();
    function tick(nowMs) {
      const t = Math.min(1, (nowMs - start) / duration);
      const lat = from.lat + (position.lat - from.lat) * t;
      const lng = from.lng + (position.lng - from.lng) * t;
      marker.setLatLng([lat, lng]);
      if (follow) map.panTo([lat, lng], { animate: false });
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng, at]);

  // Icono estable: no se vuelve a crear en cada render.
  const icon = useMemo(() => busIcon(), []);
  if (!position) return null;
  return (
    <Marker ref={markerRef} position={[position.lat, position.lng]} icon={icon} zIndexOffset={zIndexOffset} eventHandlers={eventHandlers}>
      {children}
    </Marker>
  );
}
