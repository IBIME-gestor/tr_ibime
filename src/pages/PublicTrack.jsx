import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Home, Navigation, Sun, Sunset, Pencil, LogOut, Check, Bell, Search, Eye, EyeOff, X as XIcon } from 'lucide-react';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { NOTICE_TYPES, listNoticesForEmail, listReadIdsForEmail, markNoticeRead } from '../firebase/familyNotices';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { normalizePhone } from '../utils/phone';
import {
  subscribePublicTracking,
  TRIP_ALERT_TYPES,
  ARRIVAL_WAIT_SECONDS,
  LIVE_LOCATION_INTERVAL_MS,
} from '../firebase/trips';
import LoadingOverlay from '../components/LoadingOverlay';
import { useArrivalCountdown, fmtCountdown } from '../utils/countdown';
import { startFlagIcon, finishFlagIcon, busSvg, startFlagSvg, finishFlagSvg } from '../utils/mapIcons';
import AnimatedBus from '../components/AnimatedBus';
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

// Turno según la hora: de 5:00 a 8:30 «Camino a IBIME» y de 13:30 a 19:25
// «Camino a casa». Fuera de esas horas se deja el más cercano (y se puede cambiar a mano).
const SHIFT_TITLE = { morning: 'Camino a IBIME', afternoon: 'Camino a casa' };
function autoShift(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= 5 * 60 && m <= 8 * 60 + 30) return 'morning';
  if (m >= 13 * 60 + 30 && m <= 19 * 60 + 25) return 'afternoon';
  return null;
}
const defaultShift = () => autoShift() || (new Date().getHours() < 12 ? 'morning' : 'afternoon');

// Si hoy el alumno va a taller (salida de las 17:30), su recorrido de la tarde es el del taller.
function routeForShift(kid, shift) {
  if (!kid) return '';
  const hoy = new Date().getDay();
  if (shift === 'afternoon' && kid.tallerRouteId && (kid.tallerDias || []).map(Number).includes(hoy)) return kid.tallerRouteId;
  return kid.routeId || '';
}

// Administración: últimas consultas (matrícula o correo) en este equipo.
const ADMIN_SAVED_KEY = 'ibime_seguimiento_admin';
const readAdminSaved = () => { try { return JSON.parse(localStorage.getItem(ADMIN_SAVED_KEY) || '[]'); } catch { return []; } };
const writeAdminSaved = (list) => { try { localStorage.setItem(ADMIN_SAVED_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ } return list; };

// Contraseña: mínimo 8 caracteres, una mayúscula, una minúscula, un símbolo y sin espacios.
const PW_RULES = [
  { k: 'len', label: 'Mínimo 8 caracteres', test: (p) => p.length >= 8 },
  { k: 'up', label: 'Una letra mayúscula', test: (p) => /\p{Lu}/u.test(p) },
  { k: 'low', label: 'Una letra minúscula', test: (p) => /\p{Ll}/u.test(p) },
  { k: 'sym', label: 'Un símbolo (por ejemplo ! # $ % & * @)', test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
  { k: 'sp', label: 'Sin espacios', test: (p) => p.length > 0 && !/\s/.test(p) },
];
const pwValid = (p) => PW_RULES.every((r) => r.test(p));
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Campo de contraseña con «ojito» para ver lo escrito.
function PasswordInput({ value, onChange, placeholder, autoComplete, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value.replace(/\s/g, ''))}
        placeholder={placeholder} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false}
        className="w-full rounded-xl border border-navy-100 pl-3 pr-11 py-3 text-base text-navy-900" />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-navy-400">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

const PARENTESCOS = ['Madre', 'Padre', 'Tutor(a)', 'Abuelo(a)', 'Tío(a)', 'Hermano(a)', 'Otro'];
const firstName = (n) => titleCase(n).split(' ')[0] || '';

/* ------------------------------------------------------------------ */
/*  Mapa                                                                */
/* ------------------------------------------------------------------ */

/** Si la persona mueve el mapa con el dedo, dejamos de seguir al transporte. */
function StopFollowOnDrag({ onDrag }) {
  useMapEvents({ dragstart: onDrag });
  return null;
}

/** Encuadra el transporte y las banderas la primera vez que hay datos. */
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
  const { user, profile, loading, authError, loginWithGoogleFamily, registerTutorAccount, loginWithPassword, sendPasswordReset, resendVerification, refreshVerification, patchFamilyStudent, logout } = useAuth();
  const isFamily = profile?.role === 'family';
  const isAdmin = profile?.role === 'admin';
  const myEmail = (user?.email || '').toLowerCase();

  const [kidId, setKidId] = useState('');
  const [shift, setShift] = useState(defaultShift);
  const [tracking, setTracking] = useState(null);
  const [trackingLoaded, setTrackingLoaded] = useState(false);
  const [firstSeenMs, setFirstSeenMs] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [follow, setFollow] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const mapRef = useRef(null);

  // Hijos(as) ligados al correo con el que entró (cuenta del alumno o del tutor).
  const [adminKids, setAdminKids] = useState([]); // administración: alumnos encontrados por matrícula o correo
  const kids = useMemo(
    () => [...(isFamily ? profile.students || [] : isAdmin ? adminKids : [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [isFamily, isAdmin, profile, adminKids]
  );
  const kid = kids.find((k) => k.id === kidId) || kids[0] || null;
  const trackingRouteId = routeForShift(kid, shift);
  const student = kid ? { matricula: kid.matricula, name: kid.name || '', routeId: trackingRouteId } : null;

  // Reloj ligero: refresca "actualizado hace…" y las estimaciones sin
  // tocar la red.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // El turno cambia solo en las horas de cada recorrido (5:00 y 13:30), sin pisar
  // lo que la persona eligió a mano mientras no cambie la franja.
  const lastAuto = useRef(autoShift());
  useEffect(() => {
    const id = setInterval(() => {
      const a = autoShift();
      if (a !== lastAuto.current) {
        lastAuto.current = a;
        if (a) setShift(a);
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Se suscribe al recorrido de hoy de la ruta del alumno, en el turno elegido.
  // Cambiar de turno cambia la suscripción al instante.
  //
  // Para cuidar la cuota diaria de lecturas de Firestore (cada actualización de la
  // ubicación cuenta como una lectura por persona que mira):
  //  · se pausa sola cuando la pantalla se oculta o se cambia de pestaña/app;
  //  · se pausa tras 20 min seguidos viendo en vivo (pestañas olvidadas), con un
  //    botón para seguir viendo.
  const [pageVisible, setPageVisible] = useState(typeof document === 'undefined' ? true : !document.hidden);
  const [livePaused, setLivePaused] = useState(false);
  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    setTracking(null);
    setFirstSeenMs(null);
    setFollow(true);
    setLivePaused(false);
    setTrackingLoaded(!(kid && trackingRouteId));
  }, [trackingRouteId, kid?.matricula, shift]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!kid || !trackingRouteId || !pageVisible || livePaused) return undefined;
    const unsub = subscribePublicTracking(trackingRouteId, shift, (t) => {
      setTracking(t);
      setTrackingLoaded(true);
      setFirstSeenMs((prev) => prev ?? Date.now());
    });
    const autoPause = setTimeout(() => setLivePaused(true), 20 * 60 * 1000);
    return () => { unsub(); clearTimeout(autoPause); };
  }, [trackingRouteId, kid?.matricula, shift, pageVisible, livePaused]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogin() {
    setLoginBusy(true); setLoginError('');
    try { await loginWithGoogleFamily(); } catch (err) {
      console.error(err);
      setLoginError('No pudimos abrir el inicio de sesión de Google. Intenta de nuevo o abre esta página en tu navegador (Chrome o Safari).');
    }
    setLoginBusy(false);
  }

  // Edición de los datos del tutor (solo se guarda en Ruta Segura).
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', parentesco: '', phone: '', tutorEmail: '', createPw: false, pw: '', pw2: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  function openEdit() {
    setForm({
      name: titleCase(kid?.familiarResponsable),
      parentesco: kid?.parentesco || '',
      phone: String(kid?.telefono || kid?.parentContact || '').replace(/^\+52/, ''),
      tutorEmail: String(kid?.parentEmail || ''),
      createPw: false, pw: '', pw2: '',
    });
    setFormError(''); setSavedMsg(''); setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (name.length < 3) { setFormError('Escribe el nombre completo del tutor.'); return; }
    let phone = '';
    if (form.phone.trim()) {
      const tel = normalizePhone(form.phone);
      if (tel.status !== 'ok') { setFormError('El teléfono debe tener 10 dígitos.'); return; }
      phone = tel.phone;
    }

    // El correo del tutor y su contraseña solo se registran desde la cuenta del alumno.
    const canSetTutorEmail = isStudentAccount;
    const tutorEmail = form.tutorEmail.trim().toLowerCase();
    if (canSetTutorEmail && tutorEmail) {
      if (!isEmail(tutorEmail)) { setFormError('Escribe un correo de tutor válido.'); return; }
      if (tutorEmail === myEmail) { setFormError('El correo del tutor debe ser distinto al de la cuenta del alumno.'); return; }
    }
    const wantsPw = canSetTutorEmail && form.createPw;
    if (wantsPw) {
      if (!tutorEmail) { setFormError('Escribe el correo del tutor para crearle una contraseña.'); return; }
      if (!pwValid(form.pw)) { setFormError('La contraseña no cumple con todos los requisitos.'); return; }
      if (form.pw !== form.pw2) { setFormError('Las contraseñas no coinciden.'); return; }
    }

    setSaving(true); setFormError('');
    try {
      const patch = {
        familiarResponsable: name,
        parentesco: form.parentesco,
        telefono: phone,
        parentContact: phone,
        ...(canSetTutorEmail && tutorEmail ? { parentEmail: tutorEmail } : {}),
      };
      // 1) Se guardan los datos con la sesión del alumno (también liga el correo del tutor).
      await updateDoc(doc(db, 'students', kid.id), { ...patch, familyUpdatedAt: serverTimestamp(), familyUpdatedByEmail: myEmail });
      patchFamilyStudent(kid.id, patch);

      // 2) Si se creó contraseña, se crea la cuenta del tutor y se le manda confirmar su correo.
      if (wantsPw) {
        try {
          await registerTutorAccount(tutorEmail, form.pw);
          setEditing(false);
          setPwEmail(tutorEmail);
          setRegisteredMsg(`Listo. Guardamos los datos y creamos el acceso para ${tutorEmail}. Te enviamos un correo para confirmarlo: ábrelo y después inicia sesión aquí abajo con ese correo y tu contraseña.`);
          setSaving(false);
          return; // la sesión del alumno se cerró: se muestra el inicio de sesión con correo y contraseña
        } catch (err) {
          if (err?.code === 'auth/email-already-in-use') {
            setEditing(false);
            setSavedMsg('Datos guardados. Ese correo ya tiene una contraseña creada: el tutor puede entrar con ella, o usar «Olvidé mi contraseña» en el inicio de sesión.');
            setSaving(false);
            return;
          }
          throw err;
        }
      }
      setEditing(false);
      setSavedMsg('Listo, tus datos quedaron actualizados en Ruta Segura.');
    } catch (err) {
      console.error(err);
      setFormError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    }
    setSaving(false);
  }

  /* ---------------- Avisos para la familia ---------------- */
  const [view, setView] = useState('seguimiento'); // seguimiento | avisos
  const [notices, setNotices] = useState([]);
  const [readIds, setReadIds] = useState(new Set());
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticeError, setNoticeError] = useState('');

  async function loadNotices() {
    if (!isFamily || !myEmail) return;
    setNoticesLoading(true); setNoticeError('');
    try {
      const [list, reads] = await Promise.all([listNoticesForEmail(myEmail), listReadIdsForEmail(myEmail)]);
      setNotices(list.sort((a, b) => (tsMs(b.publishAt) || tsMs(b.createdAt) || 0) - (tsMs(a.publishAt) || tsMs(a.createdAt) || 0)));
      setReadIds(reads);
    } catch (err) {
      console.error(err);
      setNoticeError('No pudimos cargar los avisos. Intenta de nuevo en un momento.');
    }
    setNoticesLoading(false);
  }
  // Se cargan al entrar y cada 5 minutos, para que la pestaña muestre cuántos avisos nuevos hay.
  useEffect(() => {
    if (!isFamily) return undefined;
    loadNotices();
    const id = setInterval(() => { if (!document.hidden) loadNotices(); }, 10 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFamily, myEmail]);

  async function openNotice(n) {
    if (readIds.has(n.id)) return;
    setReadIds((prev) => new Set([...prev, n.id]));
    try { await markNoticeRead(n.id, myEmail); } catch (err) { console.warn('No se pudo marcar como leído:', err?.message); }
  }
  // Los avisos programados aparecen cuando llega su día y hora.
  const visibleNotices = notices.filter((n) => !tsMs(n.publishAt) || tsMs(n.publishAt) <= now);
  const unreadCount = visibleNotices.filter((n) => !readIds.has(n.id)).length;

  /* ---------------- Administración: ver como lo ve la familia ---------------- */
  const [adminQuery, setAdminQuery] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminSaved, setAdminSaved] = useState(readAdminSaved);

  async function adminFind(value) {
    const v = String(value || '').trim();
    if (!v) return;
    setAdminBusy(true); setAdminError('');
    try {
      let docs = [];
      if (v.includes('@')) {
        const em = v.toLowerCase();
        const [a, b] = await Promise.all([
          getDocs(query(collection(db, 'students'), where('studentEmail', '==', em))),
          getDocs(query(collection(db, 'students'), where('parentEmail', '==', em))),
        ]);
        docs = [...a.docs, ...b.docs];
      } else {
        const queries = [getDocs(query(collection(db, 'students'), where('matricula', '==', v)))];
        if (/^\d+$/.test(v)) queries.push(getDocs(query(collection(db, 'students'), where('matricula', '==', Number(v)))));
        docs = (await Promise.all(queries)).flatMap((r) => r.docs);
      }
      const seen = new Set();
      const list = docs.filter((d) => !seen.has(d.id) && seen.add(d.id)).map((d) => ({ id: d.id, ...d.data() }));
      if (!list.length) { setAdminError('No se encontró ningún alumno con esa matrícula o correo.'); return; }
      setAdminKids(list);
      setKidId(list[0].id);
      setEditing(false);
      setAdminSaved(writeAdminSaved([{ q: v, name: list[0].name || v }, ...readAdminSaved().filter((x) => x.q !== v)].slice(0, 6)));
      setAdminQuery('');
    } catch (err) {
      console.error(err);
      setAdminError('No se pudo consultar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setAdminBusy(false);
    }
  }

  // Acceso con correo y contraseña (tutores)
  const [pwEmail, setPwEmail] = useState('');
  const [pwValue, setPwValue] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [registeredMsg, setRegisteredMsg] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

  async function handlePasswordLogin(e) {
    e.preventDefault();
    if (!isEmail(pwEmail.trim()) || !pwValue) { setLoginError('Escribe tu correo y tu contraseña.'); return; }
    setPwBusy(true); setLoginError(''); setRegisteredMsg('');
    try { await loginWithPassword(pwEmail, pwValue); } catch (err) {
      console.error(err);
      const c = err?.code || '';
      setLoginError(c === 'auth/too-many-requests'
        ? 'Demasiados intentos. Espera unos minutos o usa «Olvidé mi contraseña».'
        : 'Correo o contraseña incorrectos.');
    }
    setPwBusy(false);
  }

  async function handleForgot() {
    if (!isEmail(pwEmail.trim())) { setLoginError('Escribe tu correo arriba y vuelve a tocar «Olvidé mi contraseña».'); return; }
    setPwBusy(true); setLoginError('');
    try { await sendPasswordReset(pwEmail); setResetSent(true); } catch (err) {
      console.error(err);
      setLoginError('No pudimos enviar el correo. Intenta de nuevo en unos minutos.');
    }
    setPwBusy(false);
  }

  async function handleResendVerification() {
    setVerifyBusy(true); setVerifyMsg('');
    try { await resendVerification(); setVerifyMsg('Te mandamos otro correo. Revisa también tu carpeta de spam.'); } catch (err) {
      console.error(err);
      setVerifyMsg('No pudimos reenviarlo todavía. Espera un momento e inténtalo otra vez.');
    }
    setVerifyBusy(false);
  }

  // Quién es quien entró y cómo saludarle.
  const isParentAccount = !!kid && String(kid.parentEmail || '').toLowerCase() === myEmail;
  const isStudentAccount = !!kid && String(kid.studentEmail || '').toLowerCase() === myEmail;
  const tutorName = titleCase(kid?.familiarResponsable);
  const missingInfo = !!kid && (!tutorName || !kid.parentesco || !(kid.telefono || kid.parentContact));

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

  // Posición del transporte sobre la línea (0 = salida, 1 = meta).
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
  const shiftTitle = SHIFT_TITLE[shift];
  const childName = titleCase(student?.name);

  const status = (() => {
    if (!trackingLoaded) return { tone: 'idle', pill: 'Consultando…', headline: 'Un momento…', sub: '' };
    if (student && !student.routeId) {
      return {
        tone: 'idle',
        pill: 'Sin ruta',
        headline: `${childName} aún no tiene una ruta asignada`,
        sub: 'Comunícate con el plantel para que le asignen su ruta de transporte.',
      };
    }

    if (!tracking) {
      return {
        tone: 'idle',
        pill: 'Aún no sale',
        headline: `El recorrido «${shiftTitle}» todavía no inicia`,
        sub: 'No necesitas recargar: esta pantalla se actualiza sola en cuanto el transporte salga.',
      };
    }
    if (!myStop) {
      return {
        tone: 'idle',
        pill: 'Sin parada hoy',
        headline: `${childName} no aparece en el recorrido «${shiftTitle}» de hoy`,
        sub: 'Puede que hoy no tenga servicio en este turno. Prueba con el otro turno o confirma con el plantel.',
      };
    }
    if (myStop.status === 'absent') {
      return {
        tone: 'idle',
        pill: 'No abordó',
        headline: `Hoy ${childName} no abordó el transporte`,
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
        sub: at ? `Llegaron a las ${fmtClock(at)}.` : 'El transporte ya llegó al plantel.',
      };
    }
    if (shift === 'morning' && myStop.status === 'boarded') {
      const at = tsMs(myStop.boardedAt) || tsMs(myStop.resolvedAt);
      return {
        tone: 'go',
        pill: 'A bordo',
        headline: `${childName} ya va en el transporte`,
        sub: `${at ? `Subió a las ${fmtClock(at)}. ` : ''}El transporte sigue su recorrido rumbo al plantel.`,
      };
    }
    if (waitingForMe) {
      return {
        tone: 'wait',
        pill: 'Esperando',
        headline:
          shift === 'morning'
            ? arrivalTimeUp
              ? 'El transporte ya no puede esperar más'
              : '¡El transporte ya llegó a tu parada!'
            : arrivalTimeUp
            ? 'El transporte ya no puede esperar más'
            : '¡El transporte ya llegó a tu casa!',
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
      sub: `${beforeText} Es un estimado: el transporte puede traer un poco de retraso.`,
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
      <LoadingOverlay show={loading || loginBusy} label={loginBusy ? 'Abriendo Google…' : 'Cargando…'} />

      <header className="bg-navy-800 text-white">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/ibime-shield.png" alt="" className="w-9 h-9" />
          <div className="leading-tight flex-1 min-w-0">
            <p className="font-display font-semibold">Ruta Segura</p>
            <p className="text-navy-100 text-xs">Seguimiento del transporte escolar</p>
          </div>
          {user && !isAdmin && (
            <button type="button" onClick={logout} className="flex items-center gap-1.5 text-xs text-navy-100 border border-white/20 rounded-full px-3 py-1.5">
              <LogOut size={13} /> Salir
            </button>
          )}
          {isAdmin && (
            <a href="/admin" className="text-xs text-navy-100 border border-white/20 rounded-full px-3 py-1.5">Volver al panel</a>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* Sin sesión: entrar con el correo del alumno o del tutor */}
        {!loading && !user && (
          <section className="card space-y-3">
            <div>
              <h1 className="font-display font-bold text-lg text-navy-900">¿Dónde va el transporte?</h1>
              <p className="text-sm text-navy-400 mt-0.5">
                Entra con el correo de tu hijo(a) o con el tuyo, el que registraron en el plantel, y verás su recorrido en vivo.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogin}
              disabled={loginBusy}
              className="w-full flex items-center justify-center gap-3 rounded-xl border-2 border-navy-100 px-6 py-3.5 font-display font-semibold text-navy-800 active:scale-[0.98] hover:border-navy-600 disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l6-6C34.9 5.5 29.7 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.3-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13.5 24 13.5c3.1 0 5.9 1.2 8 3.1l6-6C34.9 6.5 29.7 4.5 24 4.5c-7.4 0-13.8 4.2-17 10.3z" />
                <path fill="#4CAF50" d="M24 44.5c5.6 0 10.7-1.9 14.6-5.2l-6.7-5.7c-2 1.5-4.7 2.4-7.9 2.4-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.9 40.3 16.4 44.5 24 44.5z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.7 5.7C41.5 36 44.5 30.6 44.5 24c0-1.2-.1-2.4-.3-3.5z" />
              </svg>
              Entrar con Google (cuenta institucional)
            </button>
            <div className="flex items-center gap-3 text-xs text-navy-300"><span className="flex-1 h-px bg-navy-100" />o con correo y contraseña<span className="flex-1 h-px bg-navy-100" /></div>
            {registeredMsg && (
              <p className="text-sm rounded-xl bg-go/10 border border-go px-3 py-2.5 text-navy-800 flex gap-2"><Check size={16} className="shrink-0 mt-0.5" /> {registeredMsg}</p>
            )}
            <form onSubmit={handlePasswordLogin} className="space-y-2">
              <input type="email" value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} placeholder="Correo del tutor" autoComplete="username"
                className="w-full rounded-xl border border-navy-100 px-3 py-3 text-base text-navy-900" />
              <PasswordInput value={pwValue} onChange={setPwValue} placeholder="Contraseña" autoComplete="current-password" />
              <button type="submit" disabled={pwBusy || !pwEmail.trim() || !pwValue}
                className="w-full rounded-xl bg-navy-800 text-white px-6 py-3 font-display font-semibold disabled:opacity-50">
                {pwBusy ? 'Entrando…' : 'Entrar con correo y contraseña'}
              </button>
              {resetSent ? (
                <p className="text-xs text-navy-600">Si ese correo tiene una contraseña creada, te enviamos un enlace para cambiarla.</p>
              ) : (
                <button type="button" onClick={handleForgot} disabled={pwBusy} className="text-xs underline text-navy-600">Olvidé mi contraseña</button>
              )}
            </form>
            {(authError || loginError) && <p className="text-stop text-sm">{authError || loginError}</p>}
            <p className="text-xs text-navy-400">
              <b>Primera vez:</b> entra con Google usando la cuenta institucional del alumno (@ibime.edu.mx). Ahí, en «Editar información», puedes registrar el correo del tutor y crearle una contraseña para que también entre con ella. Por seguridad, la sesión se cierra cada sábado por la noche.
            </p>
          </section>
        )}

        {/* Correo y contraseña creados, pero el correo aún no se confirma */}
        {user && profile?.role === 'unverified' && (
          <section className="card space-y-3">
            <p className="font-display font-bold text-navy-900">Confirma tu correo</p>
            <p className="text-sm text-navy-600">
              Enviamos un enlace a <b>{profile.email}</b>. Ábrelo desde ese correo (revisa también spam) y después toca «Ya lo confirmé».
            </p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={refreshVerification} className="w-full rounded-xl bg-navy-800 text-white py-3 font-display font-semibold">Ya lo confirmé</button>
              <button type="button" onClick={handleResendVerification} disabled={verifyBusy} className="w-full rounded-xl border border-navy-100 py-3 text-navy-600 font-medium disabled:opacity-50">
                {verifyBusy ? 'Enviando…' : 'Reenviar correo'}
              </button>
              <button type="button" onClick={logout} className="text-xs underline text-navy-500">Usar otro correo</button>
            </div>
            {verifyMsg && <p className="text-xs text-navy-600">{verifyMsg}</p>}
          </section>
        )}

        {/* Sesión del personal: esta pantalla es para familias */}
        {user && profile && !isFamily && !isAdmin && profile.role !== 'unverified' && (
          <section className="card space-y-2 text-sm text-navy-600">
            <p>Entraste con una cuenta del personal. El seguimiento es para familias.</p>
            <a href={profile.role === 'admin' ? '/admin' : '/chofer'} className="underline text-navy-800 font-medium">Ir a mi panel</a>
          </section>
        )}

        {/* Administración: se ve el seguimiento igual que lo ve la familia */}
        {isAdmin && (
          <section className="card space-y-3">
            <div>
              <p className="font-display font-bold text-navy-900">Vista de administración</p>
              <p className="text-xs text-navy-400 mt-0.5">Escribe una matrícula o un correo (de alumno o tutor) para ver el seguimiento como lo ve la familia.</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); adminFind(adminQuery); }} className="flex gap-2">
              <input value={adminQuery} onChange={(e) => setAdminQuery(e.target.value)} placeholder="Matrícula o correo" autoComplete="off"
                className="flex-1 min-w-0 rounded-xl border border-navy-100 px-3 py-2.5 text-base" />
              <button type="submit" disabled={adminBusy || !adminQuery.trim()} className="px-4 rounded-xl bg-navy-800 text-white disabled:opacity-50" aria-label="Buscar"><Search size={17} /></button>
            </form>
            {adminError && <p className="text-stop text-sm">{adminError}</p>}
            {adminSaved.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {adminSaved.map((x) => (
                  <button key={x.q} type="button" onClick={() => adminFind(x.q)} className="text-xs rounded-full border border-navy-100 bg-white px-3 py-1.5 text-navy-700">
                    {firstName(x.name) || x.q} <span className="text-navy-300">· {x.q.length > 18 ? `${x.q.slice(0, 16)}…` : x.q}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Pestañas de la familia */}
        {isFamily && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-navy-100" role="tablist" aria-label="Sección">
            {[['seguimiento', 'Seguimiento', Navigation], ['avisos', 'Avisos', Bell]].map(([k, label, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k}
                onClick={() => { setView(k); if (k === 'avisos') loadNotices(); }}
                className={`relative flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${view === k ? 'bg-navy-800 text-white' : 'text-navy-600'}`}>
                <Icon size={16} /> {label}
                {k === 'avisos' && unreadCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-stop text-white text-[10px] font-bold flex items-center justify-center">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Avisos */}
        {isFamily && view === 'avisos' && (
          <section className="space-y-3">
            {noticeError && <p className="text-stop text-sm">{noticeError}</p>}
            {noticesLoading && !notices.length && <p className="text-sm text-navy-400">Cargando avisos…</p>}
            {!noticesLoading && !noticeError && !visibleNotices.length && (
              <div className="card text-center text-sm text-navy-400 py-8">Por ahora no tienes avisos. Aquí verás recordatorios y avisos del plantel.</div>
            )}
            {visibleNotices.map((n) => {
              const unread = !readIds.has(n.id);
              const at = tsMs(n.publishAt) || tsMs(n.createdAt);
              return (
                <article key={n.id} onClick={() => openNotice(n)}
                  className={`card space-y-1.5 cursor-pointer ${unread ? 'border-2 border-signal-yellow bg-signal-yellow/10' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-xl leading-none" aria-hidden="true">{NOTICE_TYPES[n.type]?.icon || '📢'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-semibold text-navy-900 leading-tight">{n.title}</p>
                      <p className="text-xs text-navy-400">{NOTICE_TYPES[n.type]?.label || 'Aviso'}{at ? ` · ${new Date(at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : ''}</p>
                    </div>
                    {unread && <span className="text-[10px] font-bold uppercase bg-stop text-white rounded-full px-2 py-0.5">Nuevo</span>}
                  </div>
                  <p className="text-sm text-navy-700 whitespace-pre-line">{n.body}</p>
                </article>
              );
            })}
          </section>
        )}

        {(isFamily ? view === 'seguimiento' : isAdmin) && kid && (
          <>
            {/* Varios hijos ligados al mismo correo */}
            {kids.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                {kids.map((k) => {
                  const active = k.id === kid.id;
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => { setKidId(k.id); setEditing(false); setSavedMsg(''); }}
                      className={`flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full border-2 text-sm font-medium transition-colors ${
                        active ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-100 bg-white text-navy-700'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-bold ${active ? 'bg-signal-yellow text-navy-900' : 'bg-navy-50 text-navy-600'}`}>
                        {titleCase(k.name).charAt(0) || '?'}
                      </span>
                      <span className="truncate max-w-[9rem]">{firstName(k.name) || k.matricula}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Saludo */}
            {isAdmin ? (
              <section className="card space-y-1 text-sm">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-400 uppercase tracking-wide"><Eye size={13} /> Así lo ve la familia</p>
                <p className="font-display font-bold text-navy-900">{titleCase(kid.name)} <span className="text-navy-400 font-normal">· {kid.matricula}</span></p>
                <p className="text-navy-600">Tutor(a): {tutorName || 'sin registrar'}{kid.parentesco ? ` (${kid.parentesco})` : ''}</p>
                <p className="text-xs text-navy-400 break-all">Correo tutor: {kid.parentEmail || '—'} · Correo alumno: {kid.studentEmail || '—'}</p>
              </section>
            ) : (
            <section className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {isParentAccount ? (
                    tutorName ? (
                      <>
                        <p className="font-display font-bold text-lg text-navy-900">¡Hola, {firstName(tutorName)}!</p>
                        <p className="text-sm text-navy-500">
                          {kid.parentesco ? `${kid.parentesco} de ` : 'Tutor(a) de '}{firstName(kid.name)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-display font-bold text-lg text-navy-900">¡Hola!</p>
                        <p className="text-sm text-navy-500">Aún no tenemos registrado tu nombre como tutor(a) de {firstName(kid.name)}.</p>
                      </>
                    )
                  ) : (
                    <>
                      <p className="font-display font-bold text-lg text-navy-900">¡Hola, {firstName(kid.name)}!</p>
                      <p className="text-sm text-navy-500">
                        {tutorName ? `Tutor(a) registrado(a): ${tutorName}${kid.parentesco ? ` (${kid.parentesco})` : ''}` : 'Aún no hay un tutor(a) registrado(a).'}
                      </p>
                    </>
                  )}
                </div>
                {!editing && (
                  <button type="button" onClick={openEdit} className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-navy-600 border border-navy-100 rounded-full px-3 py-1.5">
                    <Pencil size={12} /> Editar información
                  </button>
                )}
              </div>

              {missingInfo && !editing && (
                <p className="text-xs rounded-lg bg-signal-yellow/20 border border-signal-yellow px-3 py-2 text-navy-800">
                  Falta información del tutor(a). Si algo está mal o incompleto, tócalo en «Editar información» para corregirlo.
                </p>
              )}
              {savedMsg && !editing && (
                <p className="text-xs rounded-lg bg-go/10 border border-go px-3 py-2 text-navy-800 flex items-center gap-1.5"><Check size={13} /> {savedMsg}</p>
              )}

              {editing && (
                <form onSubmit={saveEdit} className="space-y-3 pt-1">
                  <label className="block text-xs text-navy-500">Nombre del tutor(a)
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 rounded-xl border border-navy-100 px-3 py-2.5 text-base text-navy-900" autoComplete="name" />
                  </label>
                  <label className="block text-xs text-navy-500">Parentesco
                    <select value={form.parentesco} onChange={(e) => setForm({ ...form, parentesco: e.target.value })} className="w-full mt-1 rounded-xl border border-navy-100 px-3 py-2.5 text-base text-navy-900 bg-white">
                      <option value="">Elige…</option>
                      {PARENTESCOS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs text-navy-500">Teléfono de contacto (10 dígitos)
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="55 1234 5678" className="w-full mt-1 rounded-xl border border-navy-100 px-3 py-2.5 text-base text-navy-900" />
                  </label>

                  {isStudentAccount ? (
                    <>
                      <label className="block text-xs text-navy-500">Correo del tutor(a)
                        <input type="email" value={form.tutorEmail} onChange={(e) => setForm({ ...form, tutorEmail: e.target.value })} placeholder="tutor@ejemplo.com" autoComplete="off"
                          className="w-full mt-1 rounded-xl border border-navy-100 px-3 py-2.5 text-base text-navy-900" />
                      </label>
                      <label className="flex items-start gap-2 text-sm text-navy-700">
                        <input type="checkbox" checked={form.createPw} onChange={(e) => setForm({ ...form, createPw: e.target.checked, pw: '', pw2: '' })} className="mt-1 accent-navy-800" />
                        <span>Crear una contraseña para que el tutor entre con su correo<span className="block text-xs text-navy-400">Podrá entrar con correo y contraseña, además de la cuenta del alumno.</span></span>
                      </label>
                      {form.createPw && (
                        <div className="space-y-2 rounded-xl bg-navy-50 p-3">
                          <PasswordInput value={form.pw} onChange={(v) => setForm({ ...form, pw: v })} placeholder="Contraseña" autoComplete="new-password" />
                          <PasswordInput value={form.pw2} onChange={(v) => setForm({ ...form, pw2: v })} placeholder="Confirmar contraseña" autoComplete="new-password" />
                          <ul className="text-xs space-y-0.5">
                            {PW_RULES.map((r) => {
                              const ok = r.test(form.pw);
                              return (
                                <li key={r.k} className={`flex items-center gap-1.5 ${ok ? 'text-go' : 'text-navy-400'}`}>
                                  {ok ? <Check size={12} /> : <XIcon size={12} />} {r.label}
                                </li>
                              );
                            })}
                            <li className={`flex items-center gap-1.5 ${form.pw2 && form.pw === form.pw2 ? 'text-go' : 'text-navy-400'}`}>
                              {form.pw2 && form.pw === form.pw2 ? <Check size={12} /> : <XIcon size={12} />} Las contraseñas coinciden
                            </li>
                          </ul>
                          <p className="text-xs text-navy-500">Al guardar enviaremos un correo al tutor para confirmar su dirección, y regresarás al inicio de sesión.</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-navy-400">Correo con el que entraste: <b>{myEmail}</b></p>
                  )}
                  {formError && <p className="text-stop text-sm">{formError}</p>}
                  <p className="text-xs text-navy-400">Estos cambios solo se actualizan en Ruta Segura; no modifican tus datos en el plantel ni en otros sistemas.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2.5 rounded-xl border border-navy-100 text-navy-600 font-medium">Cancelar</button>
                    <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-navy-800 text-white font-display font-semibold disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
                  </div>
                </form>
              )}
            </section>
            )}
          </>
        )}

        {(isFamily ? view === 'seguimiento' : isAdmin) && student && (
          <>
            {/* Turno */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-navy-100" role="tablist" aria-label="Turno">
              {[
                { k: 'morning', label: 'Camino a IBIME', Icon: Sun },
                { k: 'afternoon', label: 'Camino a casa', Icon: Sunset },
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

              {livePaused && (
                <button type="button" onClick={() => setLivePaused(false)}
                  className="mt-3 w-full rounded-xl bg-signal-yellow text-navy-900 font-display font-semibold py-2.5 text-sm">
                  Pausado para ahorrar datos · Toca para seguir viendo en vivo
                </button>
              )}
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
                    ? `${total} paradas en este recorrido. El transporte aún no atiende la primera.`
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
                      <AnimatedBus position={completed ? null : liveLoc} at={liveMs} follow={follow}>
                        <Popup>Transporte escolar</Popup>
                      </AnimatedBus>
                    </MapContainer>

                    <div className="absolute top-3 left-3 z-[1000] rounded-full bg-white/95 shadow px-3 py-1.5 text-xs font-medium flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${liveIsStale || completed ? 'bg-wait' : 'bg-go'}`} />
                      {completed
                        ? 'Recorrido terminado'
                        : liveIsStale
                        ? `Última ubicación ${fmtAgo(liveMs, now)} · ${fmtClock(liveMs)}`
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
                        <Navigation size={13} /> Seguir al transporte
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-navy-100 bg-white p-5 text-center">
                    <span
                      className="inline-block opacity-60"
                      dangerouslySetInnerHTML={{ __html: busSvg(64) }}
                    />
                    <p className="text-sm text-navy-600 mt-2">El transporte todavía no comparte su ubicación.</p>
                    <p className="text-xs text-navy-400 mt-0.5">En cuanto la comparta, lo verás moverse aquí.</p>
                  </div>
                )}

                {liveIsStale && !completed && (
                  <p className="text-xs text-navy-600 bg-white border border-navy-100 rounded-xl px-3 py-2 mt-2">
                    El transporte no ha enviado su ubicación desde las {fmtClock(liveMs)} (hace {Math.round((now - liveMs) / 60000)} min).
                    Puede ser una zona sin señal o que el teléfono del operador esté con la pantalla apagada; el
                    mapa se actualiza solo cuando regrese. Lo último registrado de {childName || 'tu hijo(a)'} es lo
                    que ves arriba.
                    {now - liveMs >= 10 * 60 * 1000 && ' Si necesitas confirmar algo, comunícate con el plantel.'}
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
                    <dd className="font-medium text-navy-800">{shiftTitle}</dd>
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
