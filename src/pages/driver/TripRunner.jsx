import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { RefreshCw, Search, UserPlus, ListOrdered, CheckCircle2, Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Routes as RoutesService, Students, Units } from '../../firebase/services';
import {
  subscribeTodayTrip,
  startTrip,
  subscribeTripStops,
  markStopManual,
  markStopAbsent,
  markArrived,
  markAllBulk,
  addStudentToTrip,
  removeStudentFromTrip,
  undoStop,
  applyOrderToTrip,
  completeTrip,
  updateLiveLocation,
  LIVE_LOCATION_INTERVAL_MS,
  LIVE_LOCATION_MIN_MOVE_M,
  LIVE_LOCATION_HEARTBEAT_MS,
  metersBetween,
  syncPublicTracking,
  createTrackRecorder,
  getReferenceTrip,
  setTripAlert,
  clearTripAlert,
  TRIP_ALERT_TYPES,
} from '../../firebase/trips';
import { getCurrentLocation, watchLocation } from '../../hooks/useGeolocation';
import { useWakeLock } from '../../hooks/useWakeLock';
import { getFarewellMessage } from '../../utils/greetings';
import { weekdayName, fmtCoords } from '../../utils/dates';
import { numberedIcon, startFlagIcon, finishFlagIcon } from '../../utils/mapIcons';
import { normalizeText } from '../../utils/search';
import { optimizeStopOrder } from '../../utils/routeOptimizer';
import { addToAssignmentBank } from '../../firebase/assignmentBank';
import {
  actualSequence,
  withActualOrder,
  proposeOrder,
  sameOrder,
  locKeyFor,
  timeKeyFor,
  actionVerb,
  fmtLongDate,
} from '../../utils/tripOrder';
import StopCard from '../../components/StopCard';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// No mandamos cada lectura del GPS a Firestore (sería carísimo y no aporta
// nada para un ETA aproximado). Se publica la última lectura cada
// LIVE_LOCATION_INTERVAL_MS (5 s) para que el mapa del admin y del padre se vea "en vivo".

function navUrls(destination) {
  if (!destination) return null;
  if (typeof destination === 'string') {
    const encoded = encodeURIComponent(destination);
    return {
      maps: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`,
      waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
    };
  }
  const { lat, lng } = destination;
  return {
    maps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}

/**
 * Ruta completa en Google Maps con todas las paradas pendientes como
 * waypoints, en el orden del recorrido — Google Maps se encarga de la
 * navegación real y de recalcular solo con tráfico en vivo (eso ya lo
 * hace mejor que cualquier cosa que podamos construir aquí). Solo se
 * arma con paradas de las que ya tenemos coordenadas exactas (de un
 * recorrido de referencia anterior); las que solo tienen dirección de
 * texto (ruta nueva, primer día) se quedan fuera de este botón.
 */
function buildFullRouteUrl(pendingStops, destinations) {
  const coords = pendingStops
    .map((s) => destinations[s.studentId])
    .filter((d) => d && typeof d === 'object' && d.lat != null);
  if (coords.length === 0) return null;

  const last = coords[coords.length - 1];
  const waypoints = coords
    .slice(0, -1)
    .map((c) => `${c.lat},${c.lng}`)
    .join('|');

  const params = new URLSearchParams({
    api: '1',
    destination: `${last.lat},${last.lng}`,
    travelmode: 'driving',
  });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

const SHIFT_CONFIG = {
  morning: {
    title: 'Recorrido de ida',
    boardedBulk: false,
    deliveredBulk: true,
    boardAction: 'Recogido',
    boardPhaseTitle: 'Ve marcando a cada alumno al subirlo',
    bulkDeliverLabel: '🏫  Llegamos al plantel',
    bulkDeliverConfirm: '¿Confirmas que ya llegaron todos al plantel? Se registrará la hora para todos.',
    deliverAction: 'Entregado',
  },
  afternoon: {
    title: 'Recorrido de vuelta',
    boardedBulk: true,
    deliveredBulk: false,
    bulkBoardLabel: '🚌  Todos abordaron el transporte',
    bulkBoardConfirm: '¿Confirmas que ya subieron todos al transporte? Se registrará la hora para todos.',
    boardPhaseTitle: 'Alumnos a bordo',
    deliverAction: 'Bajó',
    deliverPhaseTitle: 'Ve marcando a cada alumno al bajarlo',
  },
};

export default function TripRunner() {
  const { routeId, shift } = useParams();
  const config = SHIFT_CONFIG[shift];
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isDriver = profile?.role === 'driver';

  const [route, setRoute] = useState(null);
  const [trip, setTrip] = useState(null); // null mientras carga, undefined... (ver tripLoaded)
  const [tripLoaded, setTripLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [stops, setStops] = useState([]);
  const [busy, setBusy] = useState(false);
  const [matricula, setMatricula] = useState('');
  const [found, setFound] = useState(null);
  const [matches, setMatches] = useState([]); // resultados del buscador, para elegir
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [bankNotice, setBankNotice] = useState('');
  const [reference, setReference] = useState(null); // último recorrido completado de esta ruta/turno
  const [proposalDismissed, setProposalDismissed] = useState(false);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [proposalExpanded, setProposalExpanded] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const [destinations, setDestinations] = useState({}); // studentId -> {lat,lng} | address string
  const [phones, setPhones] = useState({}); // studentId -> teléfono del padre

  // Formularios de kilometraje
  const [kmInicialInput, setKmInicialInput] = useState('');
  const [kmFinalInput, setKmFinalInput] = useState('');
  const [kmError, setKmError] = useState('');
  const [startingTrip, setStartingTrip] = useState(false);
  const [units, setUnits] = useState([]); // solo en rutas de taller: el operador elige la unidad
  const [unitIdInput, setUnitIdInput] = useState('');
  const [finishing, setFinishing] = useState(false);

  // Aviso de incidente (tráfico, accidente, retraso, otro)
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertType, setAlertType] = useState('traffic');
  const [alertMessage, setAlertMessage] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);

  const lastSentAtRef = useRef(0);
  const [showMap, setShowMap] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [gpsError, setGpsError] = useState(false);
  const [signalGap, setSignalGap] = useState(null); // { minutes } cuando la pantalla estuvo apagada
  const [recalcOrder, setRecalcOrder] = useState(null); // ids en el orden recalculado, o null
  const [recalculating, setRecalculating] = useState(false);

  // El mapa (y el "Recalcular orden") necesitan saber dónde está el
  // operador desde que abre la pantalla, no solo hasta que arranca el
  // recorrido — así el mapa abre centrado en él, no en el centro de la
  // ciudad ni en la primera parada.
  useEffect(() => {
    getCurrentLocation().then((loc) => { if (loc) setMyLocation(loc); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    async function init() {
      try {
        const r = await RoutesService.get(routeId);
        if (cancelled) return;
        setRoute(r);

        // Destinos para el botón "Navegar" y teléfonos para "Llamar": primero
        // la última ubicación real capturada en un recorrido previo de esta
        // misma ruta/turno (más precisa), y si no existe, la dirección de
        // texto guardada del alumno (útil el primer día en una ruta nueva).
        const [reference, students] = await Promise.all([
          getReferenceTrip(routeId, shift),
          Students.listByRoute(routeId),
        ]);
        if (cancelled) return;
        setReference(reference);
        const byId = {};
        const phoneById = {};
        students.forEach((s) => {
          if (s.address) byId[s.id] = s.address;
          if (s.parentContact) phoneById[s.id] = s.parentContact;
        });
        reference?.stops.forEach((s) => {
          if (s.referenceLocation?.lat) byId[s.studentId] = s.referenceLocation;
        });
        setDestinations(byId);
        setPhones(phoneById);
      } catch (err) {
        // Sin este try/catch, cualquier error aquí (permisos, ruta
        // inexistente, sin conexión) dejaba la pantalla en "Preparando
        // recorrido…" para siempre, porque `route` nunca se llegaba a
        // asignar y no había forma de saber qué pasó.
        console.error('TripRunner init error:', err);
        if (!cancelled) setLoadError(err.message || 'No se pudo cargar la ruta. Revisa tu conexión e intenta de nuevo.');
      }
    }
    init();
    return () => { cancelled = true; };
  }, [routeId, shift]);

  // Se suscribe al recorrido de HOY en tiempo real, exista o no todavía.
  // Así, si la nanny entra antes que el operador, ve en vivo el momento en
  // que él registra su kilometraje y arranca el recorrido.
  useEffect(() => {
    const unsub = subscribeTodayTrip(
      routeId,
      shift,
      (t) => {
        setTrip(t);
        setTripLoaded(true);
      },
      (err) => {
        setTripLoaded(true);
        setLoadError(err.message || 'No se pudo cargar el recorrido de hoy. Revisa tu conexión e intenta de nuevo.');
      }
    );
    return unsub;
  }, [routeId, shift]);

  useEffect(() => {
    if (!trip?.id) { setStops([]); return undefined; }
    const unsub = subscribeTripStops(trip.id, setStops, (err) => {
      setLoadError(err.message || 'No se pudieron cargar los alumnos de este recorrido.');
    });
    return unsub;
  }, [trip?.id]);

  // Mantiene el espejo público (publicTracking/{tripId}) al día cada vez
  // que cambian las paradas, para que la vista del padre de familia
  // refleje el avance del recorrido sin que cada handler tenga que
  // acordarse de sincronizarlo por su cuenta.
  // OJO: no depende de `trip` completo. Cada posición en vivo actualiza
  // trips/{id}.liveLocation y, si dependiera de `trip`, volvería a disparar
  // esta sincronización (una escritura de más cada 5 s). Solo se vuelve a
  // sincronizar cuando cambia algo que de verdad se publica.
  const tripRef = useRef(trip);
  tripRef.current = trip;
  useEffect(() => {
    const t = tripRef.current;
    if (!t?.id || stops.length === 0) return;
    syncPublicTracking({ id: t.id, ...t }, stops);
  }, [trip?.id, trip?.routeId, trip?.shift, trip?.date, trip?.status, trip?.startLocation?.lat, trip?.startLocation?.lng, stops]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ubicación en vivo del transporte mientras el recorrido está en curso
  // (solo el operador la transmite; la nanny no necesita duplicarla).
  useEffect(() => {
    if (!isDriver || !trip?.id || trip.status !== 'in_progress') return undefined;
    let latest = null;
    let lastSent = null; // última posición publicada
    // Huella GPS (por dónde pasó): se anota cada 5 s si avanzó y se sube en lotes.
    const recorder = createTrackRecorder(trip.id);
    const flushTimer = setInterval(() => recorder.flush(), 60000);
    const onHide = () => { if (document.visibilityState === 'hidden') recorder.flush(); };
    document.addEventListener('visibilitychange', onHide);
    const publish = (loc) => {
      lastSent = loc;
      lastSentAtRef.current = Date.now();
      updateLiveLocation(trip.id, loc);
    };
    const stopWatch = watchLocation((location) => {
      latest = location;
      setMyLocation(location);
      setGpsError(false);
      // Primera lectura: se publica de inmediato, sin esperar el primer intervalo.
      if (!lastSent) publish(location);
    }, { onError: () => setGpsError(true) });
    // Cada 5 s se revisa la ÚLTIMA lectura del GPS (así no se pierde si llega entre
    // intervalos), pero solo se publica si el transporte se movió ≥ 15 m o si lleva
    // 30 s sin publicar (señal de vida). Parado en un semáforo o en una parada
    // no se escribe nada de más.
    const timer = setInterval(() => {
      if (!latest) return;
      recorder.add(latest);
      const moved = metersBetween(lastSent, latest) >= LIVE_LOCATION_MIN_MOVE_M;
      const idleTooLong = Date.now() - lastSentAtRef.current >= LIVE_LOCATION_HEARTBEAT_MS;
      if (moved || idleTooLong) publish(latest);
    }, LIVE_LOCATION_INTERVAL_MS);
    return () => {
      stopWatch(); clearInterval(timer); clearInterval(flushTimer);
      document.removeEventListener('visibilitychange', onHide);
      recorder.flush();
    };
  }, [isDriver, trip?.id, trip?.status]);

  // Pantalla encendida mientras el recorrido está en curso: si se apaga o se
  // sale de la app, el navegador corta el GPS y el transporte "desaparece" para
  // el admin y para los padres.
  const trackingActive = isDriver && trip?.status === 'in_progress';
  const wakeLock = useWakeLock(trackingActive);

  // Detecta que la página estuvo oculta (pantalla apagada o cambio de app) y
  // se lo avisa al operador al regresar, con una vibración corta.
  useEffect(() => {
    if (!trackingActive) { setSignalGap(null); return undefined; }
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= 30000) {
        setSignalGap({ minutes: Math.max(1, Math.round((Date.now() - hiddenAt) / 60000)) });
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin vibración */ }
      }
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [trackingActive]);

  // En rutas de taller el operador elige la unidad que toma ese día.
  useEffect(() => {
    if (route?.kind !== 'taller') return;
    Units.list()
      .then((rows) => { setUnits(rows || []); setUnitIdInput((cur) => cur || route.unitId || ''); })
      .catch((err) => console.error('No se pudieron cargar las unidades:', err));
  }, [route?.id, route?.kind]);

  async function handleStartTrip(e) {
    e.preventDefault();
    setKmError('');
    setStartingTrip(true);
    try {
      // Dónde arranca la unidad: ahí se dibuja la banderita de salida.
      const startLoc = (await getCurrentLocation({ timeout: 6000 })) || myLocation;
      const isTaller = route.kind === 'taller';
      if (isTaller && !unitIdInput) throw new Error('Elige la unidad que vas a usar.');
      let opts = isTaller ? { unitId: unitIdInput } : {};
      let t = null;
      for (let i = 0; i < 3 && !t; i += 1) {
        try {
          t = await startTrip(route, shift, profile.staffId, kmInicialInput, startLoc, opts);
        } catch (err) {
          if (err.code === 'KM_LOWER' && !opts.ignoreKmAlert && window.confirm(`${err.message}\n\n¿Confirmas que el kilometraje es correcto?`)) {
            opts = { ...opts, ignoreKmAlert: true };
          } else if (err.code === 'CAPACITY' && !opts.ignoreCapacity && window.confirm(`${err.message}\n\n¿Salir de todos modos?`)) {
            opts = { ...opts, ignoreCapacity: true };
          } else {
            throw err;
          }
        }
      }
      setTrip(t);
    } catch (err) {
      setKmError(err.message);
    }
    setStartingTrip(false);
  }

  async function handleSendAlert(e) {
    e.preventDefault();
    setSendingAlert(true);
    await setTripAlert(trip.id, alertType, alertMessage);
    setSendingAlert(false);
    setAlertOpen(false);
    setAlertMessage('');
  }

  async function handleClearAlert() {
    await clearTripAlert(trip.id);
  }

  const pendingBoarding = useMemo(() => stops.filter((s) => s.status === 'pending'), [stops]);
  const boardedWaitingDelivery = useMemo(
    () => stops.filter((s) => s.status === 'boarded'),
    [stops]
  );
  const allResolved = useMemo(
    () => stops.length > 0 && stops.every((s) => s.status === 'delivered' || s.status === 'absent'),
    [stops]
  );

  // Paradas que todavía faltan por resolver: en la mañana, a quién falta
  // recoger; en la tarde, a quién falta bajar (suben y bajan, así que
  // cuenta también a quien aún no se marca como abordado).
  const remainingStops = useMemo(
    () =>
      shift === 'morning'
        ? pendingBoarding
        : stops.filter((s) => s.status === 'pending' || s.status === 'boarded'),
    [shift, pendingBoarding, stops]
  );

  // Orden REAL en que se ha ido atendiendo a los alumnos hoy (por hora de
  // marcado). Es lo que numera el mapa: no la posición en la lista.
  const locKey = locKeyFor(shift);
  const timeKey = timeKeyFor(shift);
  const doneSequence = useMemo(() => actualSequence(stops, shift), [stops, shift]);
  const doneCount = doneSequence.length;
  const orderedAll = useMemo(() => withActualOrder(stops, shift), [stops, shift]);

  // Propuesta de orden: cómo se fue atendiendo el último recorrido completado
  // de esta ruta/turno (el de ayer, normalmente). Se ofrece ANTES de
  // "Recalcular orden", que reordena por cercanía desde donde está la unidad.
  const remainingSorted = useMemo(
    () => [...remainingStops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [remainingStops]
  );
  const referenceStops = reference?.stops;
  const proposalIds = useMemo(
    () => (referenceStops?.length ? proposeOrder(remainingSorted, referenceStops) : []),
    [remainingSorted, referenceStops]
  );
  const proposalDiffers =
    proposalIds.length > 1 && !sameOrder(proposalIds, remainingSorted.map((s) => s.studentId));

  const remainingWithCoords = useMemo(
    () =>
      remainingStops
        .map((s) => ({ ...s, coords: destinations[s.studentId] }))
        .filter((s) => s.coords && typeof s.coords === 'object' && s.coords.lat != null),
    [remainingStops, destinations]
  );

  const fullRouteUrl = useMemo(
    () => buildFullRouteUrl(remainingStops, destinations),
    [remainingStops, destinations]
  );

  /**
   * "Recalcular ruta": no vuelve a pedir direcciones a nadie — reordena
   * las paradas que faltan por cercanía real desde donde está el
   * operador AHORITA (vecino más cercano + mejora 2-opt), usando el
   * mismo motor de optimización que ya usa el admin al armar una ruta
   * nueva. Útil si se tuvo que desviar, o si el orden original ya no
   * tiene sentido a media ruta.
   */
  async function handleRecalculate() {
    setRecalculating(true);
    const loc = myLocation || (await getCurrentLocation());
    if (loc) setMyLocation(loc);
    const points = remainingStops
      .map((s) => ({ id: s.studentId, ...(destinations[s.studentId] || {}) }))
      .filter((p) => p.lat != null);
    if (loc && points.length > 1) {
      const { order } = optimizeStopOrder(points, loc, 'start');
      setRecalcOrder(order);
    }
    setRecalculating(false);
  }

  function applyRecalcOrder(list) {
    if (!recalcOrder) return list;
    const idx = Object.fromEntries(recalcOrder.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (idx[a.studentId] ?? Infinity) - (idx[b.studentId] ?? Infinity));
  }

  // Números del mapa: los ya atendidos llevan su orden real (1, 2, 3…) y los
  // que faltan siguen contando desde ahí, en el orden en que se ven en la lista.
  const fmtHour = (ts) =>
    ts?.toDate ? ts.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—';
  const doneMarkers = doneSequence
    .filter((s) => s[locKey]?.lat != null)
    .map((s) => ({
      id: s.id,
      seq: s.seq,
      name: s.name,
      matricula: s.matricula,
      lat: s[locKey].lat,
      lng: s[locKey].lng,
      hour: fmtHour(s[timeKey]),
    }));
  const remainingNumberById = new Map(
    applyRecalcOrder(remainingSorted).map((s, i) => [s.studentId, doneCount + i + 1])
  );
  const remainingMarkers = applyRecalcOrder(remainingWithCoords).map((s) => ({
    ...s,
    number: remainingNumberById.get(s.studentId),
  }));

  const mapCenter = myLocation
    ? [myLocation.lat, myLocation.lng]
    : remainingWithCoords[0]
    ? [remainingWithCoords[0].coords.lat, remainingWithCoords[0].coords.lng]
    : [19.4326, -99.1332];

  // ------------------------------------------------------------------
  // Fase 1: abordaje (individual en la mañana, masivo en la tarde)
  // ------------------------------------------------------------------
  async function handleIndividualBoard(stop) {
    setBusy(true);
    const location = await getCurrentLocation();
    await markStopManual(trip.id, stop.studentId, 'boarded', location);
    setBusy(false);
  }

  async function handleBulkBoard() {
    if (!window.confirm(config.bulkBoardConfirm)) return;
    setBusy(true);
    const location = await getCurrentLocation();
    await markAllBulk(trip.id, 'boarded', location, stops);
    setBusy(false);
  }

  // ------------------------------------------------------------------
  // Fase 2: entrega (masiva en la mañana, individual en la tarde)
  // ------------------------------------------------------------------
  async function handleBulkDeliver() {
    if (!window.confirm(config.bulkDeliverConfirm)) return;
    setBusy(true);
    const location = await getCurrentLocation();
    await markAllBulk(trip.id, 'delivered', location, stops);
    setBusy(false);
  }

  async function handleIndividualDeliver(stop) {
    setBusy(true);
    const location = await getCurrentLocation();
    await markStopManual(trip.id, stop.studentId, 'delivered', location);
    setBusy(false);
  }

  async function handleAbsent(stop) {
    await markStopAbsent(trip.id, stop.studentId);
  }

  // "Llegué" al domicilio: no bloquea la pantalla con el overlay grande
  // (busy) porque el operador sigue viendo el contador arrancar al toque;
  // es una acción rápida y de bajo riesgo si falla, no hace falta tapar
  // la pantalla para ella.
  async function handleArrive(stop) {
    await markArrived(trip.id, stop.studentId);
  }

  // ------------------------------------------------------------------
  // Búsqueda por matrícula (primer día o alumno nuevo no listado)
  // ------------------------------------------------------------------
  async function handleSearchMatricula(e) {
    e.preventDefault();
    setSearchError('');
    setBankNotice('');
    setFound(null);
    setMatches([]);
    const term = matricula.trim();
    if (!term) return;
    setSearching(true);
    try {
      const results = await Students.search(term, 12);
      if (!results.length) {
        setSearchError('No encontramos a nadie con eso. Prueba con otro nombre, otro apellido o la matrícula.');
        return;
      }
      // Matrícula exacta, o un único resultado: se va directo a confirmar.
      const exact = results.find((st) => normalizeText(st.matricula) === normalizeText(term));
      if (exact || results.length === 1) {
        pickStudent(exact || results[0]);
        return;
      }
      setMatches(results);
    } catch (err) {
      setSearchError(err?.message || 'No se pudo buscar al alumno.');
    } finally {
      setSearching(false);
    }
  }

  function findInTrip(student) {
    return stops.find(
      (s) =>
        s.studentId === student.id ||
        (student.matricula && normalizeText(s.matricula) === normalizeText(student.matricula))
    );
  }

  function pickStudent(student) {
    setSearchError('');
    setFound({ student, alreadyInTrip: findInTrip(student) });
  }

  // Etiqueta que dice de un vistazo en qué situación está cada resultado.
  function studentSituation(student) {
    if (findInTrip(student)) return { label: 'Ya está en la lista de hoy', tone: 'text-go' };
    if (!student.routeId) return { label: 'Sin ruta asignada', tone: 'text-signal-amber' };
    if (student.routeId === routeId) return { label: 'De esta ruta · hoy no le toca', tone: 'text-navy-400' };
    return { label: 'De otra ruta', tone: 'text-signal-amber' };
  }

  // Deshacer un marcado hecho por error (No vino / Subió / Bajó) mientras el recorrido sigue en curso.
  async function handleUndo(stop) {
    if (!trip || trip.status !== 'in_progress') return;
    if (!window.confirm(`¿Deshacer el marcado de ${stop.name}? Volverá a quedar como pendiente.`)) return;
    try {
      setBusy(true);
      await undoStop(trip.id, stop.studentId, profile);
    } catch (err) {
      setSearchError(err?.message || 'No se pudo deshacer el marcado.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveFromToday(stop) {
    if (!trip || stop.status !== 'pending') return;
    const ok = window.confirm(`¿Quitar a ${stop.name} únicamente de la lista de este recorrido? Su expediente y asignación permanente no se modificarán.`);
    if (!ok) return;
    try {
      setBusy(true);
      await removeStudentFromTrip(trip.id, stop.studentId, profile, trip);
    } catch (err) {
      setSearchError(err?.message || 'No se pudo quitar al alumno de este recorrido.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmMatriculaBoard() {
    setBusy(true);
    try {
      const location = await getCurrentLocation();
      const action = shift === 'morning' ? 'boarded' : 'delivered';
      if (found.alreadyInTrip) {
        await markStopManual(trip.id, found.student.id, action, location);
      } else {
        await addStudentToTrip(trip.id, found.student, stops.length, trip, profile);
        await markStopManual(trip.id, found.student.id, action, location);
        // Alta de último momento: además de subirlo hoy, queda en el banco
        // de alumnos por asignar para que administración lo configure. Si
        // esto falla no se interrumpe el recorrido.
        try {
          await addToAssignmentBank({ student: found.student, trip, route, profile });
          setBankNotice(`${found.student.name} se agregó al recorrido y quedó en el banco de alumnos por asignar.`);
        } catch (err) {
          console.error('No se pudo registrar en el banco por asignar:', err);
          setBankNotice(`${found.student.name} se agregó al recorrido.`);
        }
      }
      setFound(null);
      setMatches([]);
      setMatricula('');
    } catch (err) {
      setSearchError(err?.message || 'No se pudo agregar al alumno. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyProposal() {
    setApplyingProposal(true);
    setProposalError('');
    try {
      await applyOrderToTrip(trip.id, proposalIds, stops);
      setRecalcOrder(null);
    } catch (err) {
      console.error('No se pudo aplicar la propuesta:', err);
      setProposalError(err?.message || 'No se pudo aplicar el orden. Intenta de nuevo.');
    } finally {
      setApplyingProposal(false);
    }
  }

  async function handleFinish(e) {
    e.preventDefault();
    setKmError('');
    setFinishing(true);
    try {
      // Dónde se cierra el viaje: ahí se dibuja la bandera de meta.
      const endLoc = (await getCurrentLocation({ timeout: 6000 })) || myLocation;
      await completeTrip(trip.id, trip, kmFinalInput, false, endLoc);
      navigate(`/chofer/resumen/${trip.id}`);
    } catch (err) {
      setKmError(err.message);
      setFinishing(false);
    }
  }

  if (loadError) {
    return (
      <div className="card text-center mt-10 cascade-item">
        <p className="text-3xl mb-2">⚠️</p>
        <p className="font-display font-semibold text-lg mb-1">No se pudo abrir el recorrido</p>
        <p className="text-navy-400 text-sm mb-4">{loadError}</p>
        <button onClick={() => window.location.reload()} className="btn-admin-primary mx-auto">
          Reintentar
        </button>
      </div>
    );
  }

  if (!tripLoaded || !route) {
    return <LoadingOverlay show label="Preparando recorrido…" />;
  }

  // --------------------------------------------------------------
  // Candado de kilometraje: sin kmInicial no existe el recorrido ni
  // aparece la lista de alumnos, ni para el operador ni para la nanny.
  // --------------------------------------------------------------
  if (!trip) {
    if (!isDriver) {
      return (
        <div className="card text-center mt-10 cascade-item">
          <p className="text-3xl mb-2">⏳</p>
          <p className="font-display font-semibold text-lg mb-1">Esperando al operador</p>
          <p className="text-navy-400 text-sm">
            El operador todavía no registra su kilometraje inicial para arrancar este recorrido.
            En cuanto lo haga, esta pantalla se actualiza sola.
          </p>
        </div>
      );
    }
    return (
      <div className="card mt-6 cascade-item">
        <LoadingOverlay show={startingTrip} label="Iniciando recorrido…" />
        <p className="text-3xl mb-2 text-center">🚚</p>
        <h1 className="font-display font-bold text-lg text-center mb-1">
          {config.title} · {route.name}
        </h1>
        <p className="text-navy-400 text-sm text-center mb-4">
          Antes de ver a tus alumnos, registra el kilometraje inicial del vehículo.
        </p>
        <form onSubmit={handleStartTrip} className="space-y-3">
          {route.kind === 'taller' && (
            <select
              value={unitIdInput}
              onChange={(e) => setUnitIdInput(e.target.value)}
              className="w-full rounded-xl border border-navy-100 px-3 py-3 text-base bg-white"
              required
            >
              <option value="">¿Qué unidad vas a usar?</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.plate}{u.model ? ` — ${u.model}` : ''}{u.capacity ? ` (${u.capacity} lugares)` : ''}
                </option>
              ))}
            </select>
          )}
          <input
            value={kmInicialInput}
            onChange={(e) => setKmInicialInput(e.target.value)}
            type="number"
            inputMode="decimal"
            placeholder="Kilometraje inicial"
            className="w-full rounded-xl border border-navy-100 px-3 py-3 text-lg text-center"
            required
          />
          {kmError && <p className="text-stop text-sm text-center">{kmError}</p>}
          <button type="submit" disabled={startingTrip} className="btn-go w-full">
            {startingTrip ? 'Iniciando…' : 'Iniciar recorrido'}
          </button>
        </form>
      </div>
    );
  }

  const boardingPhaseDone = config.boardedBulk
    ? stops.length > 0 && stops.every((s) => s.status !== 'pending')
    : pendingBoarding.length === 0 && stops.length > 0;

  return (
    <div className="space-y-4 pb-10">
      <LoadingOverlay show={busy} label="Guardando…" />
      <LoadingOverlay show={finishing} label="Cerrando recorrido…" />
      <div className="cascade-item">
        <p className="text-navy-400 text-sm">{config.title}</p>
        <h1 className="text-xl font-display font-bold text-navy-900">
          {stops.filter((s) => s.status === 'delivered').length} / {stops.length} completados
        </h1>
      </div>

      {trackingActive && (
        <div className="space-y-2 cascade-item">
          {gpsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
              <b>No se está enviando tu ubicación.</b> Activa el permiso de ubicación para este sitio en los ajustes
              del teléfono y regresa a esta pantalla.
            </div>
          )}
          {signalGap && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 flex items-start justify-between gap-3">
              <span>
                <b>Tu ubicación se pausó unos {signalGap.minutes} min</b> porque la pantalla se apagó o saliste de la
                app. Ya se reanudó; durante ese tiempo el admin y los padres no vieron el transporte.
              </span>
              <button type="button" onClick={() => setSignalGap(null)} className="shrink-0 text-xs font-semibold underline">
                Entendido
              </button>
            </div>
          )}
          <p className={`text-xs rounded-lg px-3 py-2 ${wakeLock.held ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
            {wakeLock.held
              ? '📍 Ubicación en vivo · la pantalla se mantiene encendida. No cambies de app.'
              : wakeLock.supported
              ? '📍 Mantén esta pantalla abierta y no la bloquees: si se apaga, se corta tu ubicación en vivo.'
              : '📍 Mantén esta pantalla abierta y desactiva el bloqueo automático del teléfono: si se apaga, se corta tu ubicación en vivo.'}
            {' '}Si abres Google Maps, regresa a esta pantalla.
          </p>
        </div>
      )}

      {/* Mapa de la ruta: vista rápida adentro de la app + un botón para
          abrir la ruta completa (todas las paradas que faltan, en orden)
          en Google Maps, para navegación real con tráfico en vivo y
          recálculo automático — eso Google ya lo hace muy bien, no hace
          falta reinventarlo aquí. */}
      <div className="flex gap-2 cascade-item">
        <button
          type="button"
          onClick={() => setShowMap((v) => !v)}
          className="btn-admin-ghost text-xs flex-1 justify-center"
        >
          {showMap ? 'Ocultar mapa' : '🗺️ Ver mapa de la ruta'}
        </button>
        {fullRouteUrl ? (
          <a
            href={fullRouteUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-admin-ghost text-xs flex-1 justify-center text-center"
          >
            🧭 Abrir ruta completa
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Aún no hay ubicaciones exactas capturadas para esta ruta"
            className="btn-admin-ghost text-xs flex-1 justify-center opacity-40 cursor-not-allowed"
          >
            🧭 Ruta completa (sin ubicaciones aún)
          </button>
        )}
      </div>

      {showMap && (
        <div className="rounded-2xl overflow-hidden border border-navy-100 cascade-item" style={{ height: 280 }}>
          <MapContainer
            center={mapCenter}
            zoom={remainingWithCoords.length || doneMarkers.length || myLocation ? 13 : 11}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {trip?.startLocation?.lat != null && (
              <Marker position={[trip.startLocation.lat, trip.startLocation.lng]} icon={startFlagIcon()}>
                <Popup>Salida · aquí inició el recorrido</Popup>
              </Marker>
            )}
            {trip?.endLocation?.lat != null && (
              <Marker position={[trip.endLocation.lat, trip.endLocation.lng]} icon={finishFlagIcon()}>
                <Popup>Meta · aquí se cerró el recorrido</Popup>
              </Marker>
            )}
            {myLocation && (
              <Marker position={[myLocation.lat, myLocation.lng]}>
                <Popup>Tú (unidad)</Popup>
              </Marker>
            )}
            {doneMarkers.length > 1 && (
              <Polyline
                positions={doneMarkers.map((m) => [m.lat, m.lng])}
                pathOptions={{ color: '#2E7D57', weight: 3, opacity: 0.7 }}
              />
            )}
            {doneMarkers.map((m) => (
              <Marker key={`done-${m.id}`} position={[m.lat, m.lng]} icon={numberedIcon(m.seq, '#2E7D57')}>
                <Popup>
                  <div className="text-xs leading-relaxed">
                    <p className="font-semibold">{m.seq}. {m.name}</p>
                    <p>Matrícula: {m.matricula}</p>
                    <p>{shift === 'morning' ? 'Recogido' : 'Bajó'} a las {m.hour}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
            {remainingMarkers.map((m) => (
              <Marker key={m.studentId} position={[m.coords.lat, m.coords.lng]} icon={numberedIcon(m.number)}>
                <Popup>
                  <div className="text-xs leading-relaxed">
                    <p className="font-semibold">{m.number}. {m.name}</p>
                    <p>Matrícula: {m.matricula}</p>
                    <p>{weekdayName(trip?.date)} · {trip?.date}</p>
                    <p className="text-navy-400">{fmtCoords(m.coords.lat, m.coords.lng)}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
      {showMap && (
        <p className="text-xs text-navy-400 cascade-item">
          Los números siguen el orden en que vas {shift === 'morning' ? 'recogiendo' : 'bajando'} a los alumnos:
          verde = ya atendido, amarillo = falta. 🚩 salida · 🏁 meta.
        </p>
      )}
      {showMap && remainingWithCoords.length < remainingStops.length && (
        <p className="text-xs text-navy-400 cascade-item">
          {remainingStops.length - remainingWithCoords.length} parada(s) todavía sin ubicación
          exacta (se van a ir agregando solas conforme se recorran).
        </p>
      )}

      {/* Aviso de incidente en ruta: lo ve el padre de familia en vivo en
          /seguimiento. Disponible tanto para el operador como para la nanny. */}
      {trip.alert ? (
        <div className="rounded-xl border-2 border-signal-yellow bg-signal-yellow/15 p-3 flex items-start justify-between gap-3">
          <div>
            <p className="font-display font-semibold text-sm text-navy-800">
              {TRIP_ALERT_TYPES[trip.alert.type]?.icon} {TRIP_ALERT_TYPES[trip.alert.type]?.label}
            </p>
            {trip.alert.message && (
              <p className="text-sm text-navy-600 mt-0.5">{trip.alert.message}</p>
            )}
            <p className="text-xs text-navy-400 mt-1">Visible para los padres en tiempo real</p>
          </div>
          <button onClick={handleClearAlert} className="text-xs text-navy-400 underline shrink-0">
            Quitar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAlertOpen((v) => !v)}
          className="text-sm px-3 py-2 rounded-xl border border-navy-100 text-navy-600"
        >
          ⚠️ Reportar tráfico, accidente o retraso
        </button>
      )}

      {alertOpen && !trip.alert && (
        <form onSubmit={handleSendAlert} className="card space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TRIP_ALERT_TYPES).map(([key, t]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAlertType(key)}
                className={`py-2 rounded-xl border-2 text-sm font-medium ${
                  alertType === key ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-100'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <input
            value={alertMessage}
            onChange={(e) => setAlertMessage(e.target.value)}
            placeholder="Detalle breve (opcional), ej. vamos ~15 min tarde"
            className="w-full rounded-xl border border-navy-100 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAlertOpen(false)}
              className="flex-1 py-2 rounded-xl border border-navy-100 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sendingAlert}
              className="flex-1 py-2 rounded-xl bg-signal-yellow text-navy-900 font-semibold text-sm"
            >
              {sendingAlert ? 'Enviando…' : 'Avisar a los padres'}
            </button>
          </div>
        </form>
      )}

      {/* Buscar alumno por nombre, apellido o matrícula — útil el primer día o
          para altas de último momento, en cualquier turno (ida o vuelta)
          mientras el recorrido no esté totalmente resuelto. Quien no estaba
          en la lista se agrega al recorrido y queda en el banco de alumnos
          por asignar (ver Operación > Banco por asignar). */}
      {!allResolved && (
        <div className="card">
          <p className="font-medium text-sm text-navy-600 mb-2">
            ¿No aparece el alumno? Búscalo por nombre, apellido o matrícula
          </p>
          <form onSubmit={handleSearchMatricula} className="flex gap-2">
            <input
              value={matricula}
              onChange={(e) => {
                setMatricula(e.target.value);
                setMatches([]);
                setFound(null);
              }}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="words"
              placeholder="Ej. Pérez Ana, 24015"
              className="flex-1 min-w-0 rounded-xl border border-navy-100 px-3 py-3 text-lg"
            />
            <button
              type="submit"
              disabled={searching}
              className="px-4 rounded-xl bg-navy-800 text-white font-display font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Search size={16} /> {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </form>
          <p className="text-xs text-navy-400 mt-1.5">
            Escribe el nombre, el apellido o los dos, en el orden que quieras.
          </p>
          {searchError && <p className="text-stop text-sm mt-2">{searchError}</p>}
          {bankNotice && !found && (
            <p className="text-sm mt-2 rounded-lg bg-go-light text-go px-3 py-2 flex items-start gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> {bankNotice}
            </p>
          )}

          {matches.length > 0 && !found && (
            <div className="mt-3">
              <p className="text-xs text-navy-400 mb-1.5">
                {matches.length} coincidencias · toca al alumno correcto
              </p>
              <ul className="space-y-2">
                {matches.map((st) => {
                  const sit = studentSituation(st);
                  return (
                    <li key={st.id}>
                      <button
                        type="button"
                        onClick={() => pickStudent(st)}
                        className="w-full text-left rounded-xl border border-navy-100 px-3 py-2.5 active:scale-[0.99] transition-transform"
                      >
                        <p className="font-display font-semibold text-navy-900 truncate">{st.name}</p>
                        <p className="text-xs text-navy-400">
                          Matrícula {st.matricula || '—'}
                          {st.grado ? ` · ${st.grado}` : ''}
                        </p>
                        <p className={`text-xs mt-0.5 ${sit.tone}`}>{sit.label}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {found && (
            <div className="mt-3 bg-signal-yellow/20 border-2 border-signal-yellow rounded-xl p-3">
              <p className="text-sm text-navy-600">¿Es este alumno?</p>
              <p className="font-display font-semibold text-lg">{found.student.name}</p>
              <p className="text-xs text-navy-400">
                Matrícula {found.student.matricula || '—'}
                {found.student.grado ? ` · ${found.student.grado}` : ''}
              </p>
              {found.alreadyInTrip ? (
                <p className="text-xs text-go mt-1.5">Ya está en la lista de hoy; solo se va a marcar.</p>
              ) : (
                <p className="text-xs text-navy-600 mt-1.5 flex items-start gap-1.5">
                  <UserPlus size={13} className="shrink-0 mt-0.5" />
                  Se agrega a este recorrido y queda en el banco de alumnos por asignar, para que
                  administración lo configure en su ruta.
                </p>
              )}
              <div className="flex gap-2 mt-2">
                <button onClick={() => setFound(null)} className="flex-1 py-2 rounded-lg border border-navy-100">
                  No
                </button>
                <button
                  onClick={confirmMatriculaBoard}
                  disabled={busy}
                  className="flex-1 py-2 rounded-lg bg-go text-white font-semibold"
                >
                  Sí, confirmar e iniciar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Propuesta de orden: cómo se fue atendiendo el último recorrido.
          Va ANTES de "Recalcular orden" (que reordena por cercanía). */}
      {!allResolved && reference && remainingSorted.length > 1 && (
        proposalDiffers && !proposalDismissed ? (
          <div className="rounded-2xl border-2 border-signal-yellow bg-signal-yellow/15 p-4 cascade-item">
            <div className="flex items-start gap-3">
              <ListOrdered size={20} className="text-navy-800 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-display font-semibold text-navy-900">Propuesta de orden para hoy</p>
                <p className="text-sm text-navy-600 mt-0.5">
                  Así los fuiste {actionVerb(shift)} el {fmtLongDate(reference.trip.date)}. Acomódalos
                  igual antes de recalcular la ruta.
                </p>
              </div>
            </div>
            <ol className="mt-3 space-y-1">
              {(proposalExpanded ? proposalIds : proposalIds.slice(0, 5)).map((id, i) => {
                const st = remainingSorted.find((x) => x.studentId === id);
                return (
                  <li key={id} className="flex items-center gap-2 text-sm text-navy-800">
                    <span className="w-6 h-6 rounded-full bg-navy-800 text-white text-xs font-display font-bold flex items-center justify-center shrink-0">
                      {doneCount + i + 1}
                    </span>
                    <span className="truncate">{st?.name}</span>
                  </li>
                );
              })}
            </ol>
            {proposalIds.length > 5 && (
              <button
                type="button"
                onClick={() => setProposalExpanded((v) => !v)}
                className="text-xs font-medium text-navy-600 underline mt-2"
              >
                {proposalExpanded ? 'Ver menos' : `Ver los ${proposalIds.length - 5} restantes`}
              </button>
            )}
            {proposalError && <p className="text-stop text-sm mt-2">{proposalError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setProposalDismissed(true)}
                className="flex-1 py-2.5 rounded-xl border border-navy-100 bg-white text-sm font-medium text-navy-600"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={handleApplyProposal}
                disabled={applyingProposal}
                className="flex-1 py-2.5 rounded-xl bg-navy-800 text-white text-sm font-display font-semibold"
              >
                {applyingProposal ? 'Acomodando…' : 'Usar este orden'}
              </button>
            </div>
          </div>
        ) : (
          !proposalDiffers && (
            <p className="text-xs text-navy-500 flex items-start gap-1.5 cascade-item">
              <CheckCircle2 size={14} className="text-go shrink-0 mt-px" />
              La lista de hoy ya va en el orden en que los fuiste {actionVerb(shift)} el{' '}
              {fmtLongDate(reference.trip.date)}.
            </p>
          )
        )
      )}

      {/* Fase de abordaje */}
      {!boardingPhaseDone && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-navy-600">{config.boardPhaseTitle}</p>
            {!config.boardedBulk && pendingBoarding.length > 1 && (
              <div className="flex items-center gap-3 shrink-0">
                {recalcOrder && (
                  <button onClick={() => setRecalcOrder(null)} className="flex items-center gap-1 text-xs font-medium text-navy-500 underline">
                    <Undo2 size={12} /> Orden de la lista
                  </button>
                )}
                <button onClick={handleRecalculate} disabled={recalculating} className="flex items-center gap-1 text-xs font-medium text-navy-500 underline">
                  <RefreshCw size={12} className={recalculating ? 'animate-spin' : ''} /> Recalcular orden
                </button>
              </div>
            )}
          </div>
          {config.boardedBulk ? (
            <button onClick={handleBulkBoard} disabled={busy} className="btn-signal mb-4">
              {config.bulkBoardLabel}
            </button>
          ) : (
            applyRecalcOrder(pendingBoarding).map((stop, i) => (
              <StopCard
                key={stop.id}
                stop={stop}
                number={doneCount + i + 1}
                actionLabel={config.boardAction}
                onAction={handleIndividualBoard}
                onMarkAbsent={handleAbsent}
                onArrive={handleArrive}
                disabled={busy}
                nav={navUrls(destinations[stop.studentId])}
                phone={phones[stop.studentId]}
                className="cascade-item"
                style={cascadeStyle(i, 40)}
              />
            ))
          )}
        </div>
      )}

      {/* Fase de entrega */}
      {boardingPhaseDone && !allResolved && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-navy-600">
              {config.deliverPhaseTitle || 'Ve marcando a cada alumno'}
            </p>
            {!config.deliveredBulk && boardedWaitingDelivery.length > 1 && (
              <div className="flex items-center gap-3 shrink-0">
                {recalcOrder && (
                  <button onClick={() => setRecalcOrder(null)} className="flex items-center gap-1 text-xs font-medium text-navy-500 underline">
                    <Undo2 size={12} /> Orden de la lista
                  </button>
                )}
                <button onClick={handleRecalculate} disabled={recalculating} className="flex items-center gap-1 text-xs font-medium text-navy-500 underline">
                  <RefreshCw size={12} className={recalculating ? 'animate-spin' : ''} /> Recalcular orden
                </button>
              </div>
            )}
          </div>
          {config.deliveredBulk ? (
            <button onClick={handleBulkDeliver} disabled={busy} className="btn-signal mb-4">
              {config.bulkDeliverLabel}
            </button>
          ) : (
            applyRecalcOrder(boardedWaitingDelivery).map((stop, i) => (
              <StopCard
                key={stop.id}
                stop={stop}
                number={doneCount + i + 1}
                actionLabel={config.deliverAction}
                onAction={handleIndividualDeliver}
                onMarkAbsent={handleAbsent}
                onArrive={handleArrive}
                disabled={busy}
                nav={navUrls(destinations[stop.studentId])}
                phone={phones[stop.studentId]}
                className="cascade-item"
                style={cascadeStyle(i, 40)}
              />
            ))
          )}
        </div>
      )}

      {/* Lista completa: primero los ya atendidos, en el orden real en que se
          atendieron (el mismo número que lleva el mapa), luego los que faltan. */}
      <div>
        <p className="text-sm font-medium text-navy-600 mb-2 mt-4">Todos los alumnos</p>
        {(() => {
          let next = doneCount;
          return orderedAll.map((stop, i) => {
            let number;
            if (stop.seq) number = stop.seq;
            else if (stop.status === 'absent') number = false;
            else {
              next += 1;
              number = next;
            }
            return (
              <div key={stop.id} className="relative">
                <StopCard stop={stop} number={number} disabled className="cascade-item" style={cascadeStyle(i, 15, 300)} />
                {stop.status !== 'pending' && trip.status === 'in_progress' && (
                  <button
                    type="button"
                    onClick={() => handleUndo(stop)}
                    disabled={busy}
                    className="ml-3 mb-3 text-xs font-semibold text-navy-600 underline underline-offset-2 inline-flex items-center gap-1"
                  ><Undo2 size={12} /> Deshacer marcado</button>
                )}
                {stop.status === 'pending' && !allResolved && (
                  <button
                    type="button"
                    onClick={() => handleRemoveFromToday(stop)}
                    disabled={busy}
                    className="ml-3 mb-3 text-xs font-semibold text-stop underline underline-offset-2"
                  >Quitar de este recorrido</button>
                )}
              </div>
            );
          });
        })()}
      </div>

      {allResolved && isDriver && (
        <form onSubmit={handleFinish} className="card space-y-3">
          <p className="font-medium text-sm text-navy-600">
            Registra el kilometraje final para cerrar el recorrido
          </p>
          <input
            value={kmFinalInput}
            onChange={(e) => setKmFinalInput(e.target.value)}
            type="number"
            inputMode="decimal"
            placeholder={`Kilometraje final (inicial: ${trip.kmInicial})`}
            className="w-full rounded-xl border border-navy-100 px-3 py-3 text-lg text-center"
            required
          />
          {kmError && <p className="text-stop text-sm">{kmError}</p>}
          <p className="text-xs text-navy-400 text-center">
            Al cerrar: <span className="font-medium text-navy-600">{getFarewellMessage(shift)}</span> 💙
          </p>
          <button type="submit" disabled={finishing} className="btn-go w-full">
            {finishing ? 'Cerrando…' : '✅ Finalizar y guardar recorrido'}
          </button>
        </form>
      )}

      {allResolved && !isDriver && (
        <p className="text-center text-navy-400 text-sm">
          Todos los alumnos están resueltos. El operador debe registrar el kilometraje final para
          cerrar el recorrido.
        </p>
      )}
    </div>
  );
}
