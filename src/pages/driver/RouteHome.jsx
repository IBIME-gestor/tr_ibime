import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Sun, Sunset, History, Users, ChevronDown, ChevronRight, Clock, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Routes, Students, Schools, Units } from '../../firebase/services';
import {
  studentAppliesToday,
  todayString,
  subscribeTodayTrip,
  subscribeTripStops,
  getReferenceTrip,
  listTripsByDriver,
  listTripsByNanny,
} from '../../firebase/trips';
import { getTimeGreeting, getFirstName } from '../../utils/greetings';
import { fmtDateTime24, fmtDateOnly, daysOverdue } from '../../utils/dates';
import { numberedIcon, schoolIcon } from '../../utils/mapIcons';
import LoadingOverlay from '../../components/LoadingOverlay';
import { cascadeStyle } from '../../utils/cascade';

// Mismo catálogo y misma lógica que ya usan Caja y Alumnos (Cashier.jsx /
// Students.jsx) — duplicado aquí en vez de importado de un util compartido
// porque este repo todavía no tiene ese util separado. Si en algún momento
// se extrae a src/utils/payments.js, esto se puede volver un import.
const PAYMENT_STATUSES = {
  al_corriente: { label: 'Pagado', badgeClass: 'badge-go' },
  desfase: { label: 'Pendiente de pago', badgeClass: 'badge-amber' },
  sin_pago: { label: 'En mora', badgeClass: 'badge-stop' },
};

function effectiveStatus(student, now = new Date()) {
  if (!(Number(student.billingAmount) > 0)) return null;
  if (student.paymentStatus === 'al_corriente') return 'al_corriente';
  if (student.nextDueDate && daysOverdue(student.nextDueDate, now) > 0) return 'sin_pago';
  return student.paymentStatus === 'sin_pago' ? 'sin_pago' : 'desfase';
}

/** 'HH:MM' a partir de un Timestamp de Firestore, o null si no existe. */
function fmtHM(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Vista previa de mapa, en miniatura y sin controles molestos: solo para
 * que el operador ubique de un vistazo dónde caen las paradas de HOY.
 * Usa ubicaciones YA CONOCIDAS (última ubicación real capturada en un
 * recorrido anterior, o la dirección ya geocodificada de cada alumno) —
 * nunca geocodifica en vivo aquí, para no disparar llamadas a Nominatim
 * cada vez que el operador abre su panel.
 */
function RouteMiniMap({ markers, schoolLoc, schoolName }) {
  const points = markers.map((m) => [m.loc.lat, m.loc.lng]);
  if (schoolLoc?.lat) points.push([schoolLoc.lat, schoolLoc.lng]);

  if (points.length === 0) {
    return (
      <div
        className="rounded-xl border border-navy-100 bg-navy-50 flex flex-col items-center justify-center gap-1.5 text-center px-4"
        style={{ height: 150 }}
      >
        <MapPin size={20} className="text-navy-300" />
        <p className="text-xs text-navy-400 max-w-[240px]">
          El mapa de esta ruta se va llenando solo, con ubicaciones reales, conforme completes recorridos.
        </p>
      </div>
    );
  }

  const viewProps =
    points.length > 1
      ? { bounds: points, boundsOptions: { padding: [28, 28] } }
      : { center: points[0], zoom: 15 };

  return (
    <div className="rounded-xl overflow-hidden border border-navy-100" style={{ height: 190 }}>
      <MapContainer {...viewProps} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {schoolLoc?.lat && (
          <Marker position={[schoolLoc.lat, schoolLoc.lng]} icon={schoolIcon()}>
            <Popup>{schoolName || 'Plantel'}</Popup>
          </Marker>
        )}
        {markers.map((m, i) => (
          <Marker key={m.id} position={[m.loc.lat, m.loc.lng]} icon={numberedIcon(i + 1)}>
            <Popup>
              {i + 1}. {m.name}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

/**
 * Tarjeta de un turno (ida/vuelta) dentro de la ruta del día: de un
 * vistazo dice si ya se arrancó, cuántos alumnos lleva y qué botón toca
 * presionar. Reemplaza a los botones planos "Recorrido de ida/vuelta"
 * de antes por algo que SÍ refleja el estado real del recorrido de hoy.
 */
function ShiftCard({ shift, route, trip, stops, studentsCount, navigate }) {
  const Icon = shift === 'morning' ? Sun : Sunset;
  const title = shift === 'morning' ? 'Recorrido de ida' : 'Recorrido de vuelta';
  const subtitle = shift === 'morning' ? 'Matutino · domicilio → plantel' : 'Vespertino · plantel → domicilio';

  const status = !trip ? 'idle' : trip.status === 'in_progress' ? 'active' : 'done';
  const total = stops.length || studentsCount;
  const finishedCount = stops.filter((s) => s.status === 'delivered').length;
  const absentCount = stops.filter((s) => s.status === 'absent').length;

  const startedAt = fmtHM(trip?.startedAt);
  const completedAt = fmtHM(trip?.completedAt);

  const badge = {
    idle: { label: 'Por iniciar', className: 'badge' },
    active: { label: 'En curso', className: 'badge-amber' },
    done: { label: 'Completado', className: 'badge-go' },
  }[status];

  function handleClick() {
    if (status === 'done' && trip?.id) {
      navigate(`/chofer/resumen/${trip.id}`);
    } else {
      navigate(`/chofer/recorrido/${route.id}/${shift}`);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-xl border-2 p-3.5 transition-transform active:scale-[0.98] ${
        status === 'active'
          ? 'border-signal-yellow bg-signal-yellow/10'
          : status === 'done'
          ? 'border-go/30 bg-go-light/40'
          : 'border-navy-100 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              status === 'active' ? 'bg-signal-yellow text-navy-900' : status === 'done' ? 'bg-go text-white' : 'bg-navy-800 text-white'
            }`}
          >
            <Icon size={17} />
          </div>
          <div className="min-w-0">
            <p className="font-display font-semibold text-navy-900 leading-tight">{title}</p>
            <p className="text-xs text-navy-400">{subtitle}</p>
          </div>
        </div>
        <span className={`${badge.className} shrink-0`}>{badge.label}</span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-navy-100/70">
        <div className="flex items-center gap-3 text-xs text-navy-500">
          <span className="flex items-center gap-1">
            <Users size={12} /> {total} alumno{total === 1 ? '' : 's'}
          </span>
          {status !== 'idle' && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> {status === 'active' ? `Inició ${startedAt || '—'}` : `${startedAt || '—'} – ${completedAt || '—'}`}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-sm font-semibold text-navy-800 shrink-0">
          {status === 'idle' ? 'Iniciar' : status === 'active' ? 'Continuar' : 'Ver resumen'}
          <ChevronRight size={15} />
        </span>
      </div>

      {status !== 'idle' && total > 0 && (
        <div className="mt-2.5">
          <div className="h-1.5 rounded-full bg-navy-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${status === 'done' ? 'bg-go' : 'bg-signal-yellow'}`}
              style={{ width: `${Math.round((finishedCount / total) * 100)}%` }}
            />
          </div>
          <p className="text-[0.65rem] text-navy-400 mt-1">
            {finishedCount}/{total} {shift === 'morning' ? 'entregados en plantel' : 'bajados en domicilio'}
            {absentCount > 0 && ` · ${absentCount} no asistió`}
          </p>
        </div>
      )}
    </button>
  );
}

/**
 * Tarjeta completa de UNA ruta asignada al operador: sus dos turnos con
 * estado real, la vista previa de la ruta de hoy (lista + mapa) y su
 * actividad reciente. La mayoría de los operadores solo tiene una ruta,
 * pero se soporta más de una (choferes que cubren dos unidades, etc.).
 */
function RouteCard({ route, now, navigate, schoolsById, unitsById, allTrips, index }) {
  const [rosterAll, setRosterAll] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [tripMorning, setTripMorning] = useState(null);
  const [tripAfternoon, setTripAfternoon] = useState(null);
  const [stopsMorning, setStopsMorning] = useState([]);
  const [stopsAfternoon, setStopsAfternoon] = useState([]);
  const [refStops, setRefStops] = useState([]);
  const [showAllStops, setShowAllStops] = useState(false);

  // Roster completo de la ruta: UNA sola consulta, reutilizada para
  // calcular a quién le toca hoy en cada turno (antes se volvía a pedir
  // cada vez que se abría el desplegable de "Lista matutino/vespertino").
  useEffect(() => {
    let cancelled = false;
    setRosterLoading(true);
    Students.listByRoute(route.id)
      .then((all) => {
        if (!cancelled) {
          setRosterAll(all);
          setRosterLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route.id]);

  // Estado real del recorrido de HOY, en vivo — para que el botón diga
  // "Iniciar" / "Continuar" / "Ver resumen" según lo que ya pasó, no
  // solo un par de botones idénticos todo el día.
  useEffect(() => subscribeTodayTrip(route.id, 'morning', setTripMorning), [route.id]);
  useEffect(() => subscribeTodayTrip(route.id, 'afternoon', setTripAfternoon), [route.id]);

  useEffect(() => {
    if (!tripMorning) {
      setStopsMorning([]);
      return undefined;
    }
    return subscribeTripStops(tripMorning.id, setStopsMorning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripMorning?.id]);

  useEffect(() => {
    if (!tripAfternoon) {
      setStopsAfternoon([]);
      return undefined;
    }
    return subscribeTripStops(tripAfternoon.id, setStopsAfternoon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripAfternoon?.id]);

  // Turno "activo" para la previsualización de abajo: el que ya está en
  // curso si hay uno, si no el que toca según la hora del día.
  const activeShift =
    tripMorning?.status === 'in_progress'
      ? 'morning'
      : tripAfternoon?.status === 'in_progress'
      ? 'afternoon'
      : now.getHours() < 13
      ? 'morning'
      : 'afternoon';

  // Último recorrido COMPLETADO de este turno: de ahí sacamos el orden
  // real y las ubicaciones reales capturadas, sin geocodificar nada en
  // vivo desde esta pantalla.
  useEffect(() => {
    let cancelled = false;
    getReferenceTrip(route.id, activeShift)
      .then((ref) => {
        if (!cancelled) setRefStops(ref?.stops || []);
      })
      .catch(() => {
        if (!cancelled) setRefStops([]);
      });
    return () => {
      cancelled = true;
    };
  }, [route.id, activeShift]);

  const today = todayString();
  const morningStudents = useMemo(
    () =>
      rosterAll
        .filter((s) => studentAppliesToday(s, today, 'morning'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rosterAll, today]
  );
  const afternoonStudents = useMemo(
    () =>
      rosterAll
        .filter((s) => studentAppliesToday(s, today, 'afternoon'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rosterAll, today]
  );
  const activeStudents = activeShift === 'morning' ? morningStudents : afternoonStudents;

  // Alumnos del turno activo, en el orden real del último recorrido
  // (si existe) en vez de solo alfabético — así la previsualización se
  // parece a como de verdad se recorre la ruta.
  const orderedActiveStudents = useMemo(() => {
    if (!refStops.length) return activeStudents;
    const byId = new Map(activeStudents.map((s) => [s.id, s]));
    const ordered = [];
    refStops.forEach((rs) => {
      if (byId.has(rs.studentId)) {
        ordered.push(byId.get(rs.studentId));
        byId.delete(rs.studentId);
      }
    });
    return [...ordered, ...[...byId.values()].sort((a, b) => a.name.localeCompare(b.name))];
  }, [refStops, activeStudents]);

  const studentLocById = useMemo(() => {
    const map = {};
    rosterAll.forEach((s) => {
      if (s.geocodedLocation?.lat) map[s.id] = s.geocodedLocation;
    });
    refStops.forEach((s) => {
      if (s.referenceLocation?.lat) map[s.studentId] = s.referenceLocation;
    });
    return map;
  }, [rosterAll, refStops]);

  const mapMarkers = orderedActiveStudents
    .map((s) => ({ id: s.id, name: s.name, loc: studentLocById[s.id] }))
    .filter((m) => m.loc);

  const school = schoolsById[route.schoolId];
  const unit = unitsById[route.unitId];
  const recentTrips = useMemo(
    () => allTrips.filter((t) => t.routeId === route.id).slice(0, 3),
    [allTrips, route.id]
  );
  const visibleStops = showAllStops ? orderedActiveStudents : orderedActiveStudents.slice(0, 4);

  return (
    <div className="card cascade-item" style={cascadeStyle(index + 1, 60)}>
      <div className="mb-3">
        <p className="text-xs font-semibold text-navy-400 uppercase tracking-wide mb-0.5">Tu ruta</p>
        <p className="font-display font-bold text-lg text-navy-900 truncate">{route.name}</p>
        <p className="text-xs text-navy-400 truncate">
          {school?.name || 'Plantel sin asignar'}
          {unit?.plate ? ` · Unidad ${unit.plate}` : ''}
        </p>
      </div>

      <div className="space-y-2.5">
        <ShiftCard
          shift="morning"
          route={route}
          trip={tripMorning}
          stops={stopsMorning}
          studentsCount={morningStudents.length}
          navigate={navigate}
        />
        <ShiftCard
          shift="afternoon"
          route={route}
          trip={tripAfternoon}
          stops={stopsAfternoon}
          studentsCount={afternoonStudents.length}
          navigate={navigate}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-navy-100">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-xs font-semibold text-navy-400 uppercase tracking-wide">
            Ruta de hoy · {activeShift === 'morning' ? 'ida' : 'vuelta'}
          </p>
          <span className="text-xs text-navy-400">
            {orderedActiveStudents.length} parada{orderedActiveStudents.length === 1 ? '' : 's'}
          </span>
        </div>

        <RouteMiniMap markers={mapMarkers} schoolLoc={school?.geocodedLocation} schoolName={school?.name} />

        <div className="mt-3">
          {rosterLoading && <p className="text-sm text-navy-400 py-2">Cargando alumnos…</p>}
          {!rosterLoading && orderedActiveStudents.length === 0 && (
            <p className="text-sm text-navy-400 py-2">Nadie tiene servicio en este turno hoy.</p>
          )}
          {!rosterLoading &&
            visibleStops.map((s, idx) => {
              const status = effectiveStatus(s, new Date());
              const isLast = idx === visibleStops.length - 1;
              return (
                <div key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {!isLast && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-navy-100" />}
                  <span className="relative z-10 w-7 h-7 rounded-full bg-navy-800 text-white text-xs font-display font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-navy-800 truncate">{s.name}</p>
                      {status && status !== 'al_corriente' && (
                        <span className={`${PAYMENT_STATUSES[status].badgeClass} text-[0.6rem] shrink-0`}>
                          {PAYMENT_STATUSES[status].label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-navy-400 truncate">
                      {s.matricula}
                      {s.address ? ` · ${s.address}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>

        {!rosterLoading && orderedActiveStudents.length > 4 && (
          <button
            onClick={() => setShowAllStops((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-navy-600 py-2 rounded-xl border border-navy-100 active:scale-[0.98] transition-transform mt-1"
          >
            {showAllStops ? 'Ver menos' : `Ver ruta completa (+${orderedActiveStudents.length - 4})`}
            <ChevronDown size={13} className={`transition-transform ${showAllStops ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {recentTrips.length > 0 && (
        <div className="mt-4 pt-4 border-t border-navy-100">
          <p className="text-xs font-semibold text-navy-400 uppercase tracking-wide mb-2">Actividad reciente</p>
          <div className="space-y-1">
            {recentTrips.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/chofer/resumen/${t.id}`)}
                className="w-full flex items-center justify-between gap-2 text-sm py-1.5"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'completed' ? 'bg-go' : 'bg-signal-amber'}`} />
                  <span className="text-navy-600 truncate">
                    {fmtDateOnly(t.date)} · {t.shift === 'morning' ? 'Ida' : 'Vuelta'}
                  </span>
                </span>
                <span className="text-xs text-navy-400 shrink-0">
                  {t.status === 'completed' ? 'Completado' : 'En curso'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-navy-400 mt-4 pt-3 border-t border-navy-100">
        ¿Ruta nueva para ti? Consulta cómo se hizo antes:{' '}
        <button
          onClick={() => navigate(`/chofer/referencia/${route.id}/morning`)}
          className="underline font-medium text-navy-600"
        >
          ver ida
        </button>{' '}
        ·{' '}
        <button
          onClick={() => navigate(`/chofer/referencia/${route.id}/afternoon`)}
          className="underline font-medium text-navy-600"
        >
          ver vuelta
        </button>
      </p>
    </div>
  );
}

export default function RouteHome() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [routes, setRoutesState] = useState([]);
  const [schoolsById, setSchoolsById] = useState({});
  const [unitsById, setUnitsById] = useState({});
  const [allTrips, setAllTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError('');
      if (!profile?.staffId) {
        setLoading(false);
        return;
      }
      try {
        const [mine, schools, units, trips] = await Promise.all([
          profile.role === 'nanny' ? Routes.listByNanny(profile.staffId) : Routes.listByDriver(profile.staffId),
          Schools.list(),
          Units.list(),
          profile.role === 'nanny' ? listTripsByNanny(profile.staffId) : listTripsByDriver(profile.staffId),
        ]);
        if (cancelled) return;
        setRoutesState(mine);
        setSchoolsById(Object.fromEntries(schools.map((s) => [s.id, s])));
        setUnitsById(Object.fromEntries(units.map((u) => [u.id, u])));
        setAllTrips(trips);
        setLoading(false);
      } catch (err) {
        // Igual que en AuthContext: sin try/catch, un error aquí dejaba
        // esta pantalla pegada en "Cargando tu ruta…" para siempre.
        console.error('RouteHome load error:', err);
        if (!cancelled) {
          setLoadError(err.message || 'No se pudo cargar tu ruta. Revisa tu conexión e intenta de nuevo.');
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (loading) return <LoadingOverlay show label="Cargando tu ruta…" />;

  if (loadError) {
    return (
      <div className="card text-center mt-10 cascade-item">
        <p className="text-3xl mb-2">⚠️</p>
        <p className="font-display font-semibold text-lg mb-1">No se pudo cargar tu ruta</p>
        <p className="text-navy-400 text-sm mb-4">{loadError}</p>
        <button onClick={() => window.location.reload()} className="btn-admin-primary mx-auto">
          Reintentar
        </button>
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="card text-center mt-10 cascade-item">
        <p className="font-display font-semibold text-lg mb-1">Sin ruta asignada</p>
        <p className="text-navy-400 text-sm">
          Pide al administrador que te asigne una ruta, plantel y unidad.
        </p>
      </div>
    );
  }

  const today = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-5">
      <div className="bg-navy-800 text-white rounded-2xl px-5 py-4 cascade-item">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-navy-300 text-xs capitalize">{today}</p>
            <h1 className="text-xl font-display font-bold">
              {getTimeGreeting()}, {getFirstName(profile?.name)} 👋
            </h1>
            <p className="text-navy-300 text-xs mt-0.5">
              {routes.length} ruta{routes.length === 1 ? '' : 's'} asignada{routes.length === 1 ? '' : 's'} ·{' '}
              {profile?.role === 'nanny' ? 'Nanny' : 'Chofer'}
            </p>
          </div>
          <p className="text-navy-300 text-xs font-display tabular-nums text-right shrink-0 pt-0.5">
            {fmtDateTime24(now)}
          </p>
        </div>
      </div>

      {routes.map((route, i) => (
        <RouteCard
          key={route.id}
          route={route}
          now={now}
          navigate={navigate}
          schoolsById={schoolsById}
          unitsById={unitsById}
          allTrips={allTrips}
          index={i}
        />
      ))}

      <button
        onClick={() => navigate('/chofer/historial')}
        className="w-full flex items-center justify-center gap-2 text-navy-400 text-sm py-2"
      >
        <History size={15} /> Ver recorridos anteriores
      </button>
    </div>
  );
}
