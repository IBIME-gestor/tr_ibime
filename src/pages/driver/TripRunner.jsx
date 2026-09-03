import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Routes as RoutesService, Students } from '../../firebase/services';
import {
  getOrCreateTodayTrip,
  subscribeTripStops,
  markStopManual,
  markStopAbsent,
  markAllBulk,
  addStudentToTrip,
  completeTrip,
  updateLiveLocation,
  syncPublicTracking,
  getReferenceTrip,
} from '../../firebase/trips';
import { getCurrentLocation, watchLocation } from '../../hooks/useGeolocation';
import StopCard from '../../components/StopCard';

// No mandamos cada lectura del GPS a Firestore (sería carísimo y no aporta
// nada para un ETA aproximado). Con una actualización cada 15s es más que
// suficiente para que el mapa del padre se vea "en vivo".
const LOCATION_THROTTLE_MS = 15000;

function mapsUrl(destination) {
  if (!destination) return null;
  const dest =
    typeof destination === 'string'
      ? destination
      : `${destination.lat},${destination.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    dest
  )}&travelmode=driving`;
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

  const [trip, setTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [matricula, setMatricula] = useState('');
  const [found, setFound] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [destinations, setDestinations] = useState({}); // studentId -> {lat,lng} | address string

  const lastSentAtRef = useRef(0);

  useEffect(() => {
    async function init() {
      const route = await RoutesService.get(routeId);
      const t = await getOrCreateTodayTrip(route, shift, profile?.driverId);
      setTrip(t);
      setLoading(false);

      // Destinos para el botón "Navegar": primero la última ubicación real
      // capturada en un recorrido previo de esta misma ruta/turno (más
      // precisa), y si no existe todavía, la dirección de texto guardada
      // del alumno (útil el primer día en una ruta nueva).
      const [reference, students] = await Promise.all([
        getReferenceTrip(routeId, shift),
        Students.listByRoute(routeId),
      ]);
      const byId = {};
      students.forEach((s) => {
        if (s.address) byId[s.id] = s.address;
      });
      reference?.stops.forEach((s) => {
        if (s.referenceLocation?.lat) byId[s.studentId] = s.referenceLocation;
      });
      setDestinations(byId);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, shift]);

  useEffect(() => {
    if (!trip?.id) return undefined;
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

  // Ubicación en vivo del camión mientras el recorrido está en curso.
  useEffect(() => {
    if (!trip?.id || trip.status !== 'in_progress') return undefined;
    const stop = watchLocation((location) => {
      const now = Date.now();
      if (now - lastSentAtRef.current < LOCATION_THROTTLE_MS) return;
      lastSentAtRef.current = now;
      updateLiveLocation(trip.id, location);
    });
    return stop;
  }, [trip?.id, trip?.status]);

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

  async function handleFinish() {
    setBusy(true);
    await completeTrip(trip.id, trip);
    navigate(`/chofer/resumen/${trip.id}`);
  }

  if (loading) return <p className="text-center text-navy-400 mt-10">Preparando recorrido…</p>;

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
                navHref={mapsUrl(destinations[stop.studentId])}
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
                navHref={mapsUrl(destinations[stop.studentId])}
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

      {allResolved && (
        <button onClick={handleFinish} disabled={busy} className="btn-go">
          ✅ Finalizar y guardar recorrido
        </button>
      )}
    </div>
  );
}
