import { addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Registro de errores de la app (lo que se vería en la consola con F12).
 *
 * Captura, de papás, operadores, nannies, cajeros y admin:
 *   - errores no controlados de la página (window.onerror)
 *   - promesas rechazadas sin atender (unhandledrejection)
 *   - fallos de pantalla de React (ver components/ErrorBoundary.jsx)
 *   - console.error (p. ej. fallos de permisos o de conexión con Firebase)
 *
 * Cada error se guarda en `clientErrors` (se ve en Admin → Soporte → Errores).
 * Para cuidar escrituras y privacidad:
 *   - el mismo error se manda UNA sola vez por sesión (dedupe por huella)
 *   - máximo 15 errores por sesión
 *   - se quitan parámetros de URL, tokens y números largos (matrículas, teléfonos)
 *   - NUNCA se guarda nombre ni matrícula de un alumno
 *   - cada registro trae `expireAt` (45 días) para la política TTL de Firestore
 */

export const ERROR_RETENTION_DAYS = 45;
const MAX_PER_SESSION = 15;
const SESSION_ID = Math.random().toString(36).slice(2, 10);

const actor = { uid: '', name: '', email: '', role: '' };
const seen = new Set();
let sent = 0;
let failures = 0;
let busy = false;

/** La llama AuthContext al iniciar/cerrar sesión. */
export function setErrorActor(next) {
  actor.uid = next?.uid || '';
  actor.name = next?.name || '';
  actor.email = next?.email || '';
  actor.role = next?.role || '';
}

const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /^The above error occurred/i,
  /Loading chunk .* failed/i, // se resuelve recargando; ruido de despliegues
  /AbortError/i,
  /\[object Event\]/i,
];

function sanitize(text, max) {
  return String(text ?? '')
    // URLs: se quita todo lo que va después de ? o #
    .replace(/(https?:\/\/[^\s?#)'"]+)[?#][^\s)'"]*/g, '$1')
    // enlaces privados del portal del operador
    .replace(/\/operador\/[^\s/?#)'"]+/g, '/operador/…')
    // números largos: matrículas, teléfonos
    .replace(/\b\d{6,}\b/g, '#')
    .slice(0, max);
}

function safeRoute() {
  try {
    return sanitize(
      window.location.pathname
        .split('/')
        .map((seg) => (seg.length >= 24 && /^[\w-]+$/.test(seg) ? ':id' : seg))
        .join('/'),
      120
    );
  } catch {
    return '';
  }
}

function currentRole() {
  if (actor.role) return actor.role;
  const p = window.location.pathname;
  if (p.startsWith('/seguimiento')) return 'parent';
  if (p.startsWith('/operador/')) return 'portal';
  return 'anon';
}

function deviceLabel() {
  const ua = navigator.userAgent || '';
  const os = /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux' : 'Otro';
  const browser = /EdgA?\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /FBAN|FBAV|Instagram|Line\//.test(ua) ? 'App integrada (FB/IG)'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Otro';
  const ver = ua.match(/(?:Chrome|CriOS|Firefox|FxiOS|Version|EdgA?)\/(\d+)/);
  return `${os} · ${browser}${ver ? ` ${ver[1]}` : ''}`;
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Registra un error. Nunca lanza ni bloquea: si algo falla, se calla
 * (un registro de errores no debe causar más errores).
 */
export function reportError({ message, stack, source = 'window', extra = '', filename = '' }) {
  if (busy) return;
  busy = true;
  try {
    if (failures >= 3 || sent >= MAX_PER_SESSION) return;
    const msg = sanitize(message, 300);
    if (!msg || IGNORE.some((re) => re.test(msg))) return;
    if (/(chrome|moz|safari)-extension:/.test(`${stack || ''}${filename || ''}`)) return;

    const st = sanitize(stack, 1500);
    const route = safeRoute();
    const topFrame = (st.split('\n').find((l) => /\bat\b|@/.test(l)) || '').trim().slice(0, 120);
    const fingerprint = hash(`${source}|${msg}|${route}|${topFrame}`);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    sent += 1;

    addDoc(collection(db, 'clientErrors'), {
      fingerprint,
      message: msg,
      stack: st,
      source,
      route,
      role: currentRole(),
      uid: actor.uid,
      actorName: actor.name.slice(0, 80),
      actorEmail: actor.email.slice(0, 100),
      device: deviceLabel(),
      online: navigator.onLine !== false,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      sessionId: SESSION_ID,
      extra: sanitize(extra, 200),
      status: 'open',
      createdAt: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + ERROR_RETENTION_DAYS * 86400000),
    }).catch(() => {
      failures += 1;
    });
  } catch {
    /* un registro de errores nunca debe romper la app */
  } finally {
    busy = false;
  }
}

function describe(arg) {
  if (arg instanceof Error) return arg.code ? `${arg.code}: ${arg.message}` : arg.message;
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object') {
    if (arg.message) return arg.code ? `${arg.code}: ${arg.message}` : String(arg.message);
    try { return JSON.stringify(arg).slice(0, 200); } catch { return '[objeto]'; }
  }
  return String(arg);
}

/** Se llama una vez al arrancar la app (solo en producción). */
export function initErrorLog() {
  if (typeof window === 'undefined' || window.__errorLogInit) return;
  window.__errorLogInit = true;
  if (!import.meta.env.PROD) return; // en desarrollo la consola ya basta

  window.addEventListener('error', (e) => {
    // Los errores de carga de imágenes/scripts llegan sin e.error: se ignoran.
    if (!e.error && !e.message) return;
    reportError({
      message: e.message || e.error?.message,
      stack: e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}`,
      source: 'window',
      filename: e.filename,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    reportError({ message: describe(r), stack: r?.stack, source: 'promise' });
  });

  const original = console.error;
  console.error = (...args) => {
    original.apply(console, args);
    try {
      const err = args.find((a) => a instanceof Error);
      reportError({
        message: args.map(describe).join(' ').slice(0, 300),
        stack: err?.stack,
        source: 'console',
      });
    } catch {
      /* ignora */
    }
  };
}
