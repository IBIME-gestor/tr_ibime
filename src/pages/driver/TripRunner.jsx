import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Routes as RoutesService, Students } from '../../firebase/services';
import {
  subscribeTodayTrip,
  startTrip,
  subscribeTripStops,
  markStopManual,
  markStopAbsent,
  markAllBulk,
  addStudentToTrip,
  completeTrip,
  updateLiveLocation,
  syncPublicTracking,
  getReferenceTrip,
  setTripAlert,
  clearTripAlert,
  TRIP_ALERT_TYPES,
} from '../../firebase/trips';
import { getCurrentLocation, watchLocation } from '../../hooks/useGeolocation';
import { getFarewellMessage } from '../../utils/greetings';
import StopCard from '../../components/StopCard';

// No mandamos cada lectura del GPS a Firestore (sería carísimo y no aporta
// nada para un ETA aproximado). Con una actualización cada 15s es más que
// suficiente para que el mapa del padre se vea "en vivo".
const LOCATION_THROTTLE_MS = 15000;

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
    bulkBoardLabel: '🚌  Todos abordaron el camión',
    bulkBoardConfirm: '¿Confirmas que ya subieron todos al camión? Se registrará la hora para todos.',
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
  const [stops, setStops] = useState([]);
  const [busy, setBusy] = useState(false);
  const [matricula, setMatricula] = useState('');
  const [found, setFound] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [destinations, setDestinations] = useState({}); // studentId -> {lat,lng} | address string
  const [phones, setPhones] = useState({}); // studentId -> teléfono del padre

  // Formularios de kilometraje
  const [kmInicialInput, setKmInicialInput] = useState('');
  const [kmFinalInput, setKmFinalInput] = useState('');
  const [kmError, setKmError] = useState('');
  const [startingTrip, setStartingTrip] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Aviso de incidente (tráfico, accidente, retraso, otro)
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertType, setAlertType] = useState('traffic');
  const [alertMessage, setAlertMessage] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);

  const lastSentAtRef = useRef(0);

  useEffect(() => {
    async function init() {
      const r = await RoutesService.get(routeId);
      setRoute(r);

      // Destinos para el botón "Navegar" y teléfonos para "Llamar": primero
      // la última ubicación real capturada en un recorrido previo de esta
      // misma ruta/turno (más precisa), y si no existe, la dirección de
      // texto guardada del alumno (útil el primer día en una ruta nueva).
      const [reference, students] = await Promise.all([
        getReferenceTrip(routeId, shift),
        Students.listByRoute(routeId),
      ]);
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
    }
    init();
  }, [routeId, shift]);

  // Se suscribe al recorrido de HOY en tiempo real, exista o no todavía.
  // Así, si la nanny entra antes que el chofer, ve en vivo el momento en
  // que él registra su kilometraje y arranca el recorrido.
  useEffect(() => {
    const unsub = subscribeTodayTrip(routeId, shift, (t) => {
      setTrip(t);
      setTripLoaded(true);
    });
    return unsub;
  }, [routeId, shift]);

  useEffect(() => {
    if (!trip?.id) { setStops([]); return undefined; }
    const unsub = subscribeTripStops(trip.id, setStops);
    return unsub;
  }, [trip?.id]);

  // Mantiene el espejo público (publicTracking/{tripId}) al día cada vez
  // que cambian las paradas, para que la vista del padre de familia
  // refleje el avance del recorrido sin que cada handler tenga que
  // acordarse de sincronizarlo por su cuenta.
  useEffect(() => {
    if (!trip?.id || stops.length === 0) return;
    syncPublicTracking({ id: trip.id, ...trip }, stops);
  }, [trip, stops]);

  // Ubicación en vivo del camión mientras el recorrido está en curso
  // (solo el chofer la transmite; la nanny no necesita duplicarla).
  useEffect(() => {
    if (!isDriver || !trip?.id || trip.status !== 'in_progress') return undefined;
    const stop = watchLocation((location) => {
      const now = Date.now();
      if (now - lastSentAtRef.current < LOCATION_THROTTLE_MS) return;
      lastSentAtRef.current = now;
      updateLiveLocation(trip.id, location);
    });
    return stop;
  }, [isDriver, trip?.id, trip?.status]);

  async function handleStartTrip(e) {
    e.preventDefault();
    setKmError('');
    setStartingTrip(true);
    try {
      const t = await startTrip(route, shift, profile.staffId, kmInicialInput);
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

  // ------------------------------------------------------------------
  // Búsqueda por matrícula (primer día o alumno nuevo no listado)
  // ------------------------------------------------------------------
  async function handleSearchMatricula(e) {
    e.preventDefault();
    setSearchError('');
    setFound(null);
    if (!matricula.trim()) return;

    const alreadyInTrip = stops.find((s) => s.matricula === matricula.trim());
    const student = await Students.findByMatricula(matricula);
    if (!student) {
      setSearchError('No se encontró ningún alumno con esa matrícula.');
      return;
    }
    setFound({ student, alreadyInTrip });
  }

  async function confirmMatriculaBoard() {
    setBusy(true);
    const location = await getCurrentLocation();
    if (found.alreadyInTrip) {
      await markStopManual(trip.id, found.student.id, 'boarded', location);
    } else {
      await addStudentToTrip(trip.id, found.student, stops.length);
      await markStopManual(trip.id, found.student.id, 'boarded', location);
    }
    setFound(null);
    setMatricula('');
    setBusy(false);
  }

  async function handleFinish(e) {
    e.preventDefault();
    setKmError('');
    setFinishing(true);
    try {
      await completeTrip(trip.id, trip, kmFinalInput);
      navigate(`/chofer/resumen/${trip.id}`);
    } catch (err) {
      setKmError(err.message);
      setFinishing(false);
    }
  }

  if (!tripLoaded || !route) {
    return <p className="text-center text-navy-400 mt-10">Preparando recorrido…</p>;
  }

  // --------------------------------------------------------------
  // Candado de kilometraje: sin kmInicial no existe el recorrido ni
  // aparece la lista de alumnos, ni para el chofer ni para la nanny.
  // --------------------------------------------------------------
  if (!trip) {
    if (!isDriver) {
      return (
        <div className="card text-center mt-10">
          <p className="text-3xl mb-2">⏳</p>
          <p className="font-display font-semibold text-lg mb-1">Esperando al chofer</p>
          <p className="text-navy-400 text-sm">
            El chofer todavía no registra su kilometraje inicial para arrancar este recorrido.
            En cuanto lo haga, esta pantalla se actualiza sola.
          </p>
        </div>
      );
    }
    return (
      <div className="card mt-6">
        <p className="text-3xl mb-2 text-center">🚚</p>
        <h1 className="font-display font-bold text-lg text-center mb-1">
          {config.title} · {route.name}
        </h1>
        <p className="text-navy-400 text-sm text-center mb-4">
          Antes de ver a tus alumnos, registra el kilometraje inicial del vehículo.
        </p>
        <form onSubmit={handleStartTrip} className="space-y-3">
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
      <div>
        <p className="text-navy-400 text-sm">{config.title}</p>
        <h1 className="text-xl font-display font-bold text-navy-900">
          {stops.filter((s) => s.status === 'delivered').length} / {stops.length} completados
        </h1>
      </div>

      {/* Aviso de incidente en ruta: lo ve el padre de familia en vivo en
          /seguimiento. Disponible tanto para el chofer como para la nanny. */}
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

          {/* Buscar por matrícula — útil el primer día o para altas de última
          hora, en cualquier turno (ida o vuelta) mientras el recorrido no
          esté totalmente resuelto. */}
          {!allResolved && (
        <div className="card">
          <p className="font-medium text-sm text-navy-600 mb-2">
            ¿No aparece el alumno? Búscalo por matrícula
          </p>
          <form onSubmit={handleSearchMatricula} className="flex gap-2">
            <input
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              inputMode="numeric"
              placeholder="Matrícula"
              className="flex-1 rounded-xl border border-navy-100 px-3 py-3 text-lg"
            />
            <button type="submit" className="px-4 rounded-xl bg-navy-800 text-white font-display font-semibold">
              Buscar
            </button>
          </form>
          {searchError && <p className="text-stop text-sm mt-2">{searchError}</p>}
          {found && (
            <div className="mt-3 bg-signal-yellow/20 border-2 border-signal-yellow rounded-xl p-3">
              <p className="text-sm text-navy-600">¿Es este alumno?</p>
              <p className="font-display font-semibold text-lg">{found.student.name}</p>
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

      {/* Fase de abordaje */}
      {!boardingPhaseDone && (
        <div>
          <p className="text-sm font-medium text-navy-600 mb-2">{config.boardPhaseTitle}</p>
          {config.boardedBulk ? (
            <button onClick={handleBulkBoard} disabled={busy} className="btn-signal mb-4">
              {config.bulkBoardLabel}
            </button>
          ) : (
            pendingBoarding.map((stop) => (
              <StopCard
                key={stop.id}
                stop={stop}
                actionLabel={config.boardAction}
                onAction={handleIndividualBoard}
                onMarkAbsent={handleAbsent}
                disabled={busy}
                nav={navUrls(destinations[stop.studentId])}
                phone={phones[stop.studentId]}
              />
            ))
          )}
        </div>
      )}

      {/* Fase de entrega */}
      {boardingPhaseDone && !allResolved && (
        <div>
          <p className="text-sm font-medium text-navy-600 mb-2">
            {config.deliverPhaseTitle || 'Ve marcando a cada alumno'}
          </p>
          {config.deliveredBulk ? (
            <button onClick={handleBulkDeliver} disabled={busy} className="btn-signal mb-4">
              {config.bulkDeliverLabel}
            </button>
          ) : (
            boardedWaitingDelivery.map((stop) => (
              <StopCard
                key={stop.id}
                stop={stop}
                actionLabel={config.deliverAction}
                onAction={handleIndividualDeliver}
                onMarkAbsent={handleAbsent}
                disabled={busy}
                nav={navUrls(destinations[stop.studentId])}
                phone={phones[stop.studentId]}
              />
            ))
          )}
        </div>
      )}

      {/* Lista completa de referencia (colapsable visualmente por estado) */}
      <div>
        <p className="text-sm font-medium text-navy-600 mb-2 mt-4">Todos los alumnos</p>
        {stops.map((stop) => (
          <StopCard key={stop.id} stop={stop} disabled />
        ))}
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
          Todos los alumnos están resueltos. El chofer debe registrar el kilometraje final para
          cerrar el recorrido.
        </p>
      )}
    </div>
  );
}
