import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Search, Home, Navigation, Sun, Sunset, ChevronLeft, Plus } from 'lucide-react';
import {
  getPublicStudentIndex,
  subscribePublicTracking,
  TRIP_ALERT_TYPES,
  ARRIVAL_WAIT_SECONDS,
  LIVE_LOCATION_INTERVAL_MS,
} from '../firebase/trips';
import LoadingOverlay from '../components/LoadingOverlay';
import { useArrivalCountdown, fmtCountdown } from '../utils/countdown';
import { busIcon, startFlagIcon, finishFlagIcon, busSvg, startFlagSvg, finishFlagSvg } from '../utils/mapIcons';
import { tsMs } from '../utils/tripOrder';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Si todavía no hay suficiente historial de esta ruta/turno para calcular
// un promedio real, se usa este valor genérico solo para no dejar al padre
// sin ningún estimado los primeros días.
const FALLBACK_MINUTES_PER_STOP = 3;
const STALE_MS = 3 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  Recuerdo de alumnos consultados (solo en este dispositivo)          */
/* ------------------------------------------------------------------ */
const SAVED_KEY = 'ibime_seguimiento_alumnos';
const MAX_SAVED = 4;

function readSavedStudents() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function rememberStudent(entry) {
  try {
    const current = readSavedStudents().filter((s) => s.matricula !== entry.matricula);
    const next = [entry, ...current].slice(0, MAX_SAVED);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readSavedStudents();
  }
}

function forgetStudent(matricula) {
  try {
    const next = readSavedStudents().filter((s) => s.matricula !== matricula);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readSavedStudents();
  }
}

/* ------------------------------------------------------------------ */
/*  Utilidades de texto                                                 */
/* ------------------------------------------------------------------ */
const titleCase = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

const fmtClock = (ms) =>
  new Date(ms).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });

function fmtAgo(ms, now) {
  const sec = Math.max(0, Math.round((now - ms) / 1000));
  if (sec < 15) return 'hace unos segundos';
  if (sec < 60) return `hace ${sec} s`;
  const min = Math.round(sec / 60);
  return `hace ${min} min`;
}

const defaultShift = () => (new Date().getHours() < 12 ? 'morning' : 'afternoon');

/* ------------------------------------------------------------------ */
/*  Mapa                                                                */
/* ------------------------------------------------------------------ */

/**
 * El camión se mueve entre lecturas del GPS (cada ~7 s) deslizando el
 * marcador de Leaflet directamente — sin pasar por el estado de React, que
 * volvería a pintar toda la página en cada cuadro de la animación.
 */
function AnimatedBus({ position, follow }) {
  const map = useMap();
  const markerRef = useRef(null);
  const fromRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!position) return undefined;
    const marker = markerRef.current;
    if (!marker) return undefined;
    const from = fromRef.current || position;
    fromRef.current = position;
    cancelAnimationFrame(frameRef.current);

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || (from.lat === position.lat && from.lng === position.lng)) {
      marker.setLatLng([position.lat, position.lng]);
      if (follow) map.panTo([position.lat, position.lng], { animate: false });
      return undefined;
    }

    const duration = Math.max(1000, LIVE_LOCATION_INTERVAL_MS - 1000);
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const lat = from.lat + (position.lat - from.lat) * t;
      const lng = from.lng + (position.lng - from.lng) * t;
      marker.setLatLng([lat, lng]);
      if (follow) map.panTo([lat, lng], { animate: false });
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng]);

  // Icono estable: no se vuelve a crear en cada render.
  const icon = useMemo(() => busIcon(), []);
  if (!position) return null;
  return (
    <Marker ref={markerRef} position={[position.lat, position.lng]} icon={icon} zIndexOffset={1000}>
      <Popup>Camión escolar</Popup>
    </Marker>
  );
}

/** Si la persona mueve el mapa con el dedo, dejamos de seguir al camión. */
function StopFollowOnDrag({ onDrag }) {
  useMapEvents({ dragstart: onDrag });
  return null;
}

/** Encuadra el camión y las banderas la primera vez que hay datos. */
function FitOnce({ points }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

/* ------------------------------------------------------------------ */
/*  Línea del recorrido: salida → paradas → meta, con el camioncito     */
/* ------------------------------------------------------------------ */
function RouteTrack({ stopsCount, myIndex, busX, progress, shift, completed }) {
  const inset = 50; // px reservados en cada extremo para las banderas
  const x = (f) => `calc(${inset}px + (100% - ${inset * 2}px) * ${f})`;
  const showDots = stopsCount > 0 && stopsCount <= 30;

  return (
    <div
      className="relative mt-5 select-none"
      style={{ height: 100 }}
      role="img"
      aria-label={
        myIndex >= 0
          ? `Recorrido de ${stopsCount} paradas. Tu parada es la ${myIndex + 1}.`
          : `Recorrido de ${stopsCount} paradas.`
      }
    >
      {/* camino */}
      <div className="absolute rounded-full bg-white/15" style={{ left: inset, right: inset, top: 40, height: 6 }} />
      <div
        className="absolute rounded-full bg-signal-yellow transition-[width] duration-1000 ease-in-out motion-reduce:transition-none"
        style={{ left: inset, top: 40, height: 6, width: `calc((100% - ${inset * 2}px) * ${progress})` }}
      />

      {/* paradas */}
      {showDots &&
        Array.from({ length: stopsCount }, (_, i) => {
          const f = (i + 1) / (stopsCount + 1);
          const passed = f <= progress + 0.0001;
          return (
            <span
              key={i}
              className={`absolute rounded-full ${passed ? 'bg-signal-yellow' : 'bg-white/45'} ${
                i === myIndex ? 'opacity-0' : ''
              }`}
              style={{ left: x(f), top: 39, width: 8, height: 8, marginLeft: -4 }}
            />
          );
        })}

      {/* salida y meta */}
      <span
        className="absolute"
        style={{ left: 4, top: 8 }}
        dangerouslySetInnerHTML={{ __html: startFlagSvg(30, '#fff') }}
      />
      <span
        className="absolute"
        style={{ right: 4, top: 8 }}
        dangerouslySetInnerHTML={{ __html: finishFlagSvg(30, '#fff') }}
      />

      {/* tu parada */}
      {myIndex >= 0 && (
        <div
          className="absolute flex flex-col items-center"
          style={{ left: x((myIndex + 1) / (stopsCount + 1)), top: 52, transform: 'translateX(-50%)' }}
        >
          <span className="w-7 h-7 rounded-full bg-white text-navy-800 flex items-center justify-center ring-4 ring-signal-yellow">
            <Home size={15} strokeWidth={2.4} />
          </span>
          <span className="text-[0.7rem] font-medium text-white mt-1 whitespace-nowrap">
            {shift === 'morning' ? 'Tu parada' : 'Tu casa'}
          </span>
        </div>
      )}

      {/* camioncito */}
      <div
        className="absolute transition-[left] duration-1000 ease-in-out motion-reduce:transition-none"
        style={{ left: x(busX), top: 12, transform: 'translateX(-50%)' }}
      >
        <span
          className="block"
          style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.35))' }}
          dangerouslySetInnerHTML={{ __html: busSvg(52) }}
        />
        {!completed && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-go opacity-60 animate-ping motion-reduce:animate-none" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-go border-2 border-navy-800" />
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Página                                                              */
/* ------------------------------------------------------------------ */
export default function PublicTrack() {
  const [matriculaInput, setMatriculaInput] = useState('');
  const [shift, setShift] = useState(defaultShift);
  const [student, setStudent] = useState(null); // { matricula, name, routeId }
  const [tracking, setTracking] = useState(null);
  const [trackingLoaded, setTrackingLoaded] = useState(false);
  const [firstSeenMs, setFirstSeenMs] = useState(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [follow, setFollow] = useState(true);
  const mapRef = useRef(null);

  const [savedStudents, setSavedStudents] = useState(readSavedStudents);
  const [showForm, setShowForm] = useState(() => readSavedStudents().length === 0);

  // Reloj ligero: refresca "actualizado hace…" y las estimaciones sin
  // tocar la red.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // Se suscribe al recorrido de hoy de la ruta del alumno, en el turno elegido.
  // Cambiar de turno cambia la suscripción al instante.
  useEffect(() => {
    if (!student) return undefined;
    setTracking(null);
    setTrackingLoaded(false);
    setFirstSeenMs(null);
    setFollow(true);
    return subscribePublicTracking(student.routeId, shift, (t) => {
      setTracking(t);
      setTrackingLoaded(true);
      setFirstSeenMs((prev) => prev ?? Date.now());
    });
  }, [student?.routeId, student?.matricula, shift]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openStudent(matriculaValue) {
    const value = String(matriculaValue || '').trim();
    setError('');
    if (!value) return;
    setSearching(true);
    try {
      const idx = await getPublicStudentIndex(value);
      if (!idx) {
        setError('No encontramos ningún alumno con esa matrícula. Revisa que esté completa.');
        return;
      }
      setStudent({ matricula: value, name: idx.name || '', routeId: idx.routeId });
      setSavedStudents(rememberStudent({ matricula: value, name: idx.name || '' }));
      setShowForm(false);
      setMatriculaInput('');
    } catch (err) {
      console.error(err);
      setError('No pudimos consultar en este momento. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSearching(false);
    }
  }

  // Si ya consultó antes, abre directo al primer alumno guardado.
  useEffect(() => {
    const saved = readSavedStudents();
    if (saved.length) openStudent(saved[0].matricula);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    openStudent(matriculaInput);
  }

  /* ------------------------- datos derivados ------------------------- */
  const sortedStops = useMemo(
    () => [...(tracking?.stops || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [tracking]
  );
  const myIndex = sortedStops.findIndex((s) => s.matricula === student?.matricula);
  const myStop = myIndex >= 0 ? sortedStops[myIndex] : null;
  const total = sortedStops.length;
  const completed = tracking?.status === 'completed';

  const isResolved = (s) => !!s.resolvedAt || s.status === 'delivered';
  const lastDoneIdx = sortedStops.reduce((acc, s, i) => (isResolved(s) ? i : acc), -1);
  const waitingIdx = sortedStops.findIndex(
    (s) => s.arrivedAt && (s.status === 'pending' || s.status === 'boarded')
  );

  // Cuántas paradas faltan antes de la de tu hijo(a).
  const stopsBefore = myIndex >= 0
    ? sortedStops.slice(0, myIndex).filter((s) => !isResolved(s) && s.status !== 'absent').length
    : 0;

  // Posición del camión sobre la línea (0 = salida, 1 = meta).
  const busX = (() => {
    if (!total) return 0;
    if (completed) return 1;
    if (waitingIdx >= 0) return (waitingIdx + 1) / (total + 1);
    if (lastDoneIdx >= 0) return Math.min(0.97, (lastDoneIdx + 1.5) / (total + 1));
    return 0.5 / (total + 1);
  })();
  const progress = busX;

  // Estimado de llegada: se ancla a la última parada atendida (no a "ahora")
  // para que la hora no se vaya corriendo cada vez que se repinta la página.
  const eta = useMemo(() => {
    if (!myStop || completed) return null;
    if (myStop.status === 'delivered' || myStop.status === 'absent') return null;
    if (myStop.status === 'boarded' && tracking?.shift === 'morning') return null;

    const doneUpTo = sortedStops.reduce((max, s) => (isResolved(s) ? Math.max(max, s.order ?? 0) : max), -1);
    if ((myStop.order ?? 0) <= doneUpTo) return null;

    const avg = tracking?.avgStopMinutes || [];
    let minutes = 0;
    let usedFallback = false;
    for (let i = doneUpTo + 1; i <= (myStop.order ?? 0); i += 1) {
      if (avg[i] != null) minutes += avg[i];
      else {
        minutes += FALLBACK_MINUTES_PER_STOP;
        usedFallback = true;
      }
    }
    const lastDoneMs = sortedStops.reduce((max, s) => Math.max(max, tsMs(s.resolvedAt) || 0), 0);
    const baseMs = lastDoneMs || firstSeenMs || now;
    return { atMs: baseMs + minutes * 60000, usedFallback };
  }, [tracking, sortedStops, myStop, completed, firstSeenMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveLoc = tracking?.liveLocation;
  const liveMs = tsMs(liveLoc?.updatedAt);
  const liveIsStale = liveMs != null && now - liveMs > STALE_MS;

  const arrivalSecondsLeft = useArrivalCountdown(myStop?.arrivedAt, ARRIVAL_WAIT_SECONDS);
  const arrivalTimeUp = arrivalSecondsLeft === 0;
  const waitingForMe =
    arrivalSecondsLeft != null && myStop && (myStop.status === 'pending' || myStop.status === 'boarded');

  const mapPoints = useMemo(() => {
    const pts = [];
    if (liveLoc?.lat != null) pts.push([liveLoc.lat, liveLoc.lng]);
    if (tracking?.startLocation?.lat != null) pts.push([tracking.startLocation.lat, tracking.startLocation.lng]);
    if (tracking?.destination?.lat != null) pts.push([tracking.destination.lat, tracking.destination.lng]);
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveLoc?.lat != null, tracking?.startLocation?.lat, tracking?.destination?.lat]);

  /* ------------------------- mensaje principal ------------------------ */
  const shiftName = shift === 'morning' ? 'ida' : 'vuelta';
  const childName = titleCase(student?.name);

  const status = (() => {
    if (!trackingLoaded) return { tone: 'idle', pill: 'Consultando…', headline: 'Un momento…', sub: '' };

    if (!tracking) {
      return {
        tone: 'idle',
        pill: 'Aún no sale',
        headline: `El recorrido de ${shiftName} todavía no inicia`,
        sub: 'No necesitas recargar: esta pantalla se actualiza sola en cuanto el camión salga.',
      };
    }
    if (!myStop) {
      return {
        tone: 'idle',
        pill: 'Sin parada hoy',
        headline: `${childName} no aparece en el recorrido de ${shiftName} de hoy`,
        sub: 'Puede que hoy no tenga servicio en este turno. Prueba con el otro turno o confirma con el plantel.',
      };
    }
    if (myStop.status === 'absent') {
      return {
        tone: 'idle',
        pill: 'No abordó',
        headline: `Hoy ${childName} no abordó el camión`,
        sub: 'El operador lo marcó como ausente. Si crees que es un error, comunícate con el plantel.',
      };
    }
    if (shift === 'afternoon' && myStop.status === 'delivered') {
      const at = tsMs(myStop.deliveredAt) || tsMs(myStop.resolvedAt);
      return {
        tone: 'done',
        pill: 'Ya llegó',
        headline: `${childName} ya llegó a su parada`,
        sub: at ? `Lo bajaron a las ${fmtClock(at)}.` : 'El operador ya registró su llegada.',
      };
    }
    if (shift === 'morning' && myStop.status === 'delivered') {
      const at = tsMs(myStop.deliveredAt);
      return {
        tone: 'done',
        pill: 'En el plantel',
        headline: `${childName} ya llegó al plantel`,
        sub: at ? `Llegaron a las ${fmtClock(at)}.` : 'El camión ya llegó al plantel.',
      };
    }
    if (shift === 'morning' && myStop.status === 'boarded') {
      const at = tsMs(myStop.boardedAt) || tsMs(myStop.resolvedAt);
      return {
        tone: 'go',
        pill: 'A bordo',
        headline: `${childName} ya va en el camión`,
        sub: `${at ? `Subió a las ${fmtClock(at)}. ` : ''}El camión sigue su recorrido rumbo al plantel.`,
      };
    }
    if (waitingForMe) {
      return {
        tone: 'wait',
        pill: 'Esperando',
        headline:
          shift === 'morning'
            ? arrivalTimeUp
              ? 'El camión ya no puede esperar más'
              : '¡El camión ya llegó a tu parada!'
            : arrivalTimeUp
            ? 'El camión ya no puede esperar más'
            : '¡El camión ya llegó a tu casa!',
        sub: arrivalTimeUp
          ? 'Va a continuar para no atrasar a los demás alumnos.'
          : shift === 'morning'
          ? 'Si tu hijo(a) va a salir, este es el momento.'
          : 'Ya pueden recibir a tu hijo(a).',
      };
    }

    // En camino
    const nextStop = stopsBefore === 0;
    const beforeText = nextStop
      ? 'Es la siguiente parada.'
      : `Faltan ${stopsBefore} ${stopsBefore === 1 ? 'parada' : 'paradas'} antes de la tuya.`;
    if (eta && eta.atMs > now + 30000) {
      const mins = Math.max(1, Math.round((eta.atMs - now) / 60000));
      return {
        tone: 'go',
        pill: 'En camino',
        headline: `Llega ${shift === 'morning' ? 'a tu parada' : 'a casa'} a las ${fmtClock(eta.atMs)}`,
        sub: `En unos ${mins} min. ${beforeText}`,
      };
    }
    return {
      tone: 'go',
      pill: 'En camino',
      headline: 'Debe llegar en cualquier momento',
      sub: `${beforeText} Es un estimado: el camión puede traer un poco de retraso.`,
    };
  })();

  const pillTone = {
    idle: 'bg-white/15 text-white',
    go: 'bg-go text-white',
    wait: 'bg-signal-yellow text-navy-900',
    done: 'bg-white text-navy-800',
  }[status.tone];

  const alert = tracking?.alert;
  const alertMs = tsMs(alert?.createdAt);

  /* ---------------------------- render ---------------------------- */
  return (
    <div className="min-h-screen bg-navy-50">
      <LoadingOverlay show={searching} label="Buscando…" />

      <header className="bg-navy-800 text-white">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/ibime-shield.png" alt="" className="w-9 h-9" />
          <div className="leading-tight">
            <p className="font-display font-semibold">Ruta Segura</p>
            <p className="text-navy-100 text-xs">Seguimiento del transporte escolar</p>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Alumnos guardados */}
        {savedStudents.length > 0 && !showForm && (
          <div className="flex flex-wrap items-center gap-2">
            {savedStudents.map((s) => {
              const active = student?.matricula === s.matricula;
              return (
                <button
                  key={s.matricula}
                  type="button"
                  onClick={() => openStudent(s.matricula)}
                  className={`flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full border-2 text-sm font-medium transition-colors ${
                    active ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-100 bg-white text-navy-700'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-bold ${
                      active ? 'bg-signal-yellow text-navy-900' : 'bg-navy-50 text-navy-600'
                    }`}
                  >
                    {titleCase(s.name).charAt(0) || '?'}
                  </span>
                  <span className="truncate max-w-[9rem]">{titleCase(s.name) || s.matricula}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border-2 border-dashed border-navy-100 text-sm font-medium text-navy-400"
            >
              <Plus size={14} /> Otro alumno
            </button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="card space-y-3">
            {savedStudents.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex items-center gap-1 text-xs text-navy-400"
              >
                <ChevronLeft size={14} /> Volver a mis alumnos
              </button>
            )}
            <div>
              <h1 className="font-display font-bold text-lg text-navy-900">¿Dónde va el camión?</h1>
              <p className="text-sm text-navy-400 mt-0.5">
                Escribe la matrícula de tu hijo(a) para ver su recorrido en vivo.
              </p>
            </div>
            <input
              value={matriculaInput}
              onChange={(e) => setMatriculaInput(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Matrícula"
              aria-label="Matrícula"
              autoFocus={savedStudents.length > 0}
              className="w-full rounded-xl border border-navy-100 px-3 py-3 text-lg"
            />
            {error && <p className="text-stop text-sm">{error}</p>}
            <button
              type="submit"
              disabled={searching || !matriculaInput.trim()}
              className="w-full py-3 rounded-xl bg-navy-800 text-white font-display font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Search size={17} /> Ver seguimiento
            </button>
            <p className="text-xs text-navy-400">
              La matrícula se guarda solo en este teléfono para que la próxima vez entres directo.
            </p>
          </form>
        )}

        {student && !showForm && (
          <>
            {/* Turno */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-navy-100" role="tablist" aria-label="Turno">
              {[
                { k: 'morning', label: 'Ida a la escuela', Icon: Sun },
                { k: 'afternoon', label: 'Regreso a casa', Icon: Sunset },
              ].map(({ k, label, Icon }) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={shift === k}
                  onClick={() => setShift(k)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    shift === k ? 'bg-navy-800 text-white' : 'text-navy-600'
                  }`}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>

            {/* Aviso del transporte */}
            {alert && (
              <div className="rounded-2xl border-2 border-signal-yellow bg-signal-yellow/15 p-3.5 flex gap-3">
                <span className="text-2xl leading-none" aria-hidden="true">
                  {TRIP_ALERT_TYPES[alert.type]?.icon || '⚠️'}
                </span>
                <div className="min-w-0">
                  <p className="font-display font-semibold text-navy-900 text-sm">
                    Aviso del transporte: {TRIP_ALERT_TYPES[alert.type]?.label?.toLowerCase() || 'incidente'}
                  </p>
                  {alert.message && <p className="text-sm text-navy-600 mt-0.5">{alert.message}</p>}
                  {alertMs && <p className="text-xs text-navy-400 mt-1">Publicado {fmtAgo(alertMs, now)}</p>}
                </div>
              </div>
            )}

            {/* Mensaje principal + línea del recorrido */}
            <section className="rounded-3xl bg-navy-800 text-white p-5 shadow-panel" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <p className="text-navy-100 text-sm truncate">{childName}</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shrink-0 ${pillTone}`}>
                  {status.tone === 'go' && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 animate-ping motion-reduce:animate-none" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                    </span>
                  )}
                  {status.pill}
                </span>
              </div>

              <h2 className="font-display font-bold text-[1.65rem] leading-tight mt-3">{status.headline}</h2>
              {status.sub && <p className="text-navy-100 text-[0.95rem] leading-snug mt-2">{status.sub}</p>}

              {waitingForMe && !arrivalTimeUp && (
                <div className="mt-4 rounded-2xl bg-signal-yellow text-navy-900 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-medium">Tiempo de espera</p>
                  <p className="font-display font-bold text-3xl tabular-nums">{fmtCountdown(arrivalSecondsLeft)}</p>
                </div>
              )}

              {tracking && total > 0 && (
                <RouteTrack
                  stopsCount={total}
                  myIndex={myIndex}
                  busX={busX}
                  progress={progress}
                  shift={shift}
                  completed={completed}
                />
              )}
              {tracking && total > 0 && (
                <p className="text-xs text-navy-100/80 mt-1">
                  {completed
                    ? 'El recorrido ya terminó.'
                    : lastDoneIdx < 0
                    ? `${total} paradas en este recorrido. El camión aún no atiende la primera.`
                    : `${sortedStops.filter(isResolved).length} de ${total} paradas atendidas.`}
                </p>
              )}
              {eta?.usedFallback && status.tone === 'go' && (
                <p className="text-xs text-navy-100/70 mt-2">
                  Recorrido con poco historial: el estimado mejora conforme pasan los días.
                </p>
              )}
            </section>

            {/* Mapa */}
            {tracking && (
              <section>
                {liveLoc?.lat != null ? (
                  <div className="relative isolate rounded-3xl overflow-hidden border border-navy-100 bg-white" style={{ height: 300 }}>
                    <MapContainer
                      ref={mapRef}
                      center={[liveLoc.lat, liveLoc.lng]}
                      zoom={14}
                      style={{ height: '100%', width: '100%' }}
                    >
                      <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <FitOnce points={mapPoints} />
                      <StopFollowOnDrag onDrag={() => setFollow(false)} />
                      {tracking.startLocation?.lat != null && (
                        <Marker position={[tracking.startLocation.lat, tracking.startLocation.lng]} icon={startFlagIcon()}>
                          <Popup>Salida del recorrido</Popup>
                        </Marker>
                      )}
                      {tracking.destination?.lat != null && (
                        <Marker position={[tracking.destination.lat, tracking.destination.lng]} icon={finishFlagIcon()}>
                          <Popup>{tracking.destination.name || 'Plantel'} · meta</Popup>
                        </Marker>
                      )}
                      <AnimatedBus position={completed ? null : liveLoc} follow={follow} />
                    </MapContainer>

                    <div className="absolute top-3 left-3 z-[1000] rounded-full bg-white/95 shadow px-3 py-1.5 text-xs font-medium flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${liveIsStale || completed ? 'bg-wait' : 'bg-go'}`} />
                      {completed
                        ? 'Recorrido terminado'
                        : liveMs
                        ? `Ubicación ${fmtAgo(liveMs, now)}`
                        : 'Ubicación en vivo'}
                    </div>
                    {!follow && !completed && (
                      <button
                        type="button"
                        onClick={() => {
                          setFollow(true);
                          if (liveLoc?.lat != null) mapRef.current?.flyTo([liveLoc.lat, liveLoc.lng], 15);
                        }}
                        className="absolute bottom-3 right-3 z-[1000] rounded-full bg-navy-800 text-white shadow px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Navigation size={13} /> Seguir al camión
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-navy-100 bg-white p-5 text-center">
                    <span
                      className="inline-block opacity-60"
                      dangerouslySetInnerHTML={{ __html: busSvg(64) }}
                    />
                    <p className="text-sm text-navy-600 mt-2">El camión todavía no comparte su ubicación.</p>
                    <p className="text-xs text-navy-400 mt-0.5">En cuanto la comparta, lo verás moverse aquí.</p>
                  </div>
                )}

                {liveIsStale && !completed && (
                  <p className="text-xs text-navy-600 bg-white border border-navy-100 rounded-xl px-3 py-2 mt-2">
                    El camión no ha enviado su ubicación en los últimos {Math.round((now - liveMs) / 60000)} min.
                    Puede estar en una zona sin señal; el mapa se actualiza solo cuando regrese.
                  </p>
                )}
              </section>
            )}

            {/* Detalle */}
            {tracking && myStop && (
              <section className="card">
                <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  <div>
                    <dt className="text-navy-400 text-xs">Recorrido</dt>
                    <dd className="font-medium text-navy-800">{shift === 'morning' ? 'Ida a la escuela' : 'Regreso a casa'}</dd>
                  </div>
                  <div>
                    <dt className="text-navy-400 text-xs">Parada de tu hijo(a)</dt>
                    <dd className="font-medium text-navy-800">{myIndex + 1} de {total}</dd>
                  </div>
                  {tracking.routeName && (
                    <div className="col-span-2">
                      <dt className="text-navy-400 text-xs">Ruta</dt>
                      <dd className="font-medium text-navy-800">{tracking.routeName}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            <div className="text-center space-y-1 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSavedStudents(forgetStudent(student.matricula));
                  setStudent(null);
                  setShowForm(true);
                }}
                className="text-xs text-navy-400 underline"
              >
                Dejar de seguir a {childName || 'este alumno'} en este teléfono
              </button>
              <p className="text-xs text-navy-400">
                Esta página se actualiza sola. Las horas son estimadas y pueden variar por tráfico.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
