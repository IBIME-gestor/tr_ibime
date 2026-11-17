import { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { setErrorActor } from '../utils/errorLog';
import { setAuditActor } from '../firebase/audit';

/**
 * Autenticación con Google (cuenta institucional) + "auto-alta" del
 * perfil (users/{uid}) la primera vez que alguien entra:
 *
 *  1. Si su correo está en la colección `admins` -> se crea como admin.
 *  2. Si su correo coincide con el de algún documento en `drivers` -> se
 *     crea como operador/nanny, enlazado a ese documento.
 *  3. Si no coincide con nada -> no se le crea perfil y se cierra su sesión.
 *
 * Así el administrador NUNCA tiene que crear cuentas a mano: solo
 * registra el correo institucional del operador en el panel, y la
 * primera vez que esa persona entra con Google, el sistema lo reconoce.
 */
const AuthContext = createContext(null);

// Las familias entran a ver información de sus hijos: por seguridad su sesión se
// cierra sola cada sábado a las 11:00 pm y tienen que volver a iniciarla.
// (Las reglas de Firestore hacen la misma comprobación en el servidor.)
function lastWeeklyCutoff(now = new Date()) {
  const d = new Date(now);
  d.setHours(23, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - 6 + 7) % 7)); // retrocede hasta el sábado
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 7);
  return d.getTime();
}
const signInMsOf = (u) => Date.parse(u?.metadata?.lastSignInTime || '') || 0;
const staleFamilySession = (u) => signInMsOf(u) < lastWeeklyCutoff();
const WEEKLY_MSG = 'Por seguridad, la sesión se cierra cada sábado por la noche. Vuelve a iniciar sesión para ver el seguimiento.';


async function provisionProfile(firebaseUser) {
  const email = (firebaseUser.email || '').toLowerCase();

  // 1) ¿Está en la lista de administradores?
  const adminSnap = await getDoc(doc(db, 'admins', email));
  if (adminSnap.exists()) {
    const data = { role: 'admin', name: firebaseUser.displayName || email, email };
    await setDoc(doc(db, 'users', firebaseUser.uid), data);
    return data;
  }

  // 2) ¿Su correo coincide con algún operador/nanny/cajero dado de alta?
  //    El campo `role` del documento en `drivers` (driver|nanny|cashier)
  //    es el que decide qué permisos recibe.
  const q = query(collection(db, 'drivers'), where('email', '==', email));
  const results = await getDocs(q);
  if (!results.empty) {
    const staffDoc = results.docs[0];
    const rawRole = staffDoc.data().role;
    const staffRole = rawRole === 'nanny' || rawRole === 'cashier' ? rawRole : 'driver';
    const data = {
      role: staffRole,
      staffId: staffDoc.id,
      name: staffDoc.data().name || firebaseUser.displayName,
      email,
    };
    await setDoc(doc(db, 'users', firebaseUser.uid), data);
    return data;
  }

  // 3) ¿Es la cuenta de un alumno o de su tutor (correo registrado en el alumno)?
  //    Entran SOLO al seguimiento. No se les crea perfil en `users`: sus permisos
  //    salen de que su correo verificado coincida con el del alumno (reglas).
  try {
    const [byStudent, byParent] = await Promise.all([
      getDocs(query(collection(db, 'students'), where('studentEmail', '==', email))),
      getDocs(query(collection(db, 'students'), where('parentEmail', '==', email))),
    ]);
    const seen = new Set();
    const students = [...byStudent.docs, ...byParent.docs]
      .filter((d) => !seen.has(d.id) && seen.add(d.id))
      .map((d) => ({ id: d.id, ...d.data() }));
    if (students.length) {
      return { role: 'family', name: firebaseUser.displayName || email, email, students, _ephemeral: true };
    }
  } catch (err) {
    console.error('No se pudo revisar el correo de familia:', err);
  }

  return null; // no autorizado
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // { role, driverId?, name, email }
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setErrorActor(null);
        setAuditActor(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      // IMPORTANTE: todo lo de aquí abajo va en try/catch. Sin esto, un
      // error (permisos, sin conexión, etc.) al leer el perfil dejaba
      // `loading` en true para siempre y la app entera se quedaba
      // pegada en la pantalla de "Cargando…" sin explicación — el bug
      // detrás de "el módulo del operador se queda cargando y no abre".
      try {
        // Cuenta con correo y contraseña que aún no confirma su correo: no accede a datos,
        // solo ve el aviso para confirmarlo.
        if (!firebaseUser.emailVerified) {
          setAuthError('');
          setUser(firebaseUser);
          setProfile({ role: 'unverified', email: (firebaseUser.email || '').toLowerCase(), name: firebaseUser.displayName || '' });
          setLoading(false);
          return;
        }

        const existing = await getDoc(doc(db, 'users', firebaseUser.uid));
        let profileData = existing.exists() ? existing.data() : null;

        if (!profileData) {
          profileData = await provisionProfile(firebaseUser);
        }

        if (!profileData) {
          setAuthError(
            'Este correo no está registrado. Entra con el correo del alumno o con el del tutor tal como se dio de alta en el plantel; si no funciona, pide que lo registren o lo corrijan.'
          );
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        if (profileData.role === 'family' && staleFamilySession(firebaseUser)) {
          setAuthError(WEEKLY_MSG);
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        const who = { uid: firebaseUser.uid, name: profileData.name || firebaseUser.displayName || '', email: firebaseUser.email || '', role: profileData.role };
        setAuthError('');
        setErrorActor(who);
        setAuditActor(who);
        setUser(firebaseUser);
        setProfile(profileData);
        setLoading(false);
      } catch (err) {
        console.error('Error cargando el perfil:', err);
        setAuthError(
          `No se pudo cargar tu perfil (${err.message || 'error desconocido'}). Revisa tu conexión e intenta de nuevo.`
        );
        try { await signOut(auth); } catch { /* ignora */ }
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // Cierre semanal también si la página se queda abierta pasando el sábado 11:00 pm.
  useEffect(() => {
    if (profile?.role !== 'family' || !user) return undefined;
    const id = setInterval(() => {
      if (staleFamilySession(user)) { setAuthError(WEEKLY_MSG); signOut(auth); }
    }, 60000);
    return () => clearInterval(id);
  }, [profile?.role, user]);

  async function loginWithGoogle() {
    setAuthError('');
    const provider = new GoogleAuthProvider();
    // Precarga el dominio institucional en la pantalla de Google para que
    // la persona use su cuenta @ibime.edu.mx (esto NO es seguridad real,
    // solo una ayuda de UX; la seguridad real la da la colección
    // admins/drivers, verificada en el servidor al provisionar el perfil).
    provider.setCustomParameters({ hd: 'ibime.edu.mx' });
    await signInWithPopup(auth, provider);
  }

  // Familias: cualquier cuenta de Google (el correo del alumno o el del tutor),
  // por eso NO se limita al dominio institucional. Si el navegador bloquea la
  // ventana emergente (p. ej. al abrir el enlace desde WhatsApp), se usa redirección.
  async function loginWithGoogleFamily() {
    setAuthError('');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return;
      }
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      throw err;
    }
  }

  // ---- Acceso con correo y contraseña (tutores) ----
  // La cuenta del tutor se crea desde la sesión del alumno (cuenta institucional),
  // y SOLO sirve cuando el tutor confirma su correo con el enlace que se le manda:
  // así nadie puede registrarse con el correo de otra familia.
  const verifyLink = () => ({ url: `${window.location.origin}/seguimiento` });

  async function registerTutorAccount(email, password) {
    const clean = String(email || '').trim().toLowerCase();
    const cred = await createUserWithEmailAndPassword(auth, clean, password);
    await sendEmailVerification(cred.user, verifyLink());
    await signOut(auth); // se regresa al inicio de sesión para que entre con su correo y contraseña
  }

  async function loginWithPassword(email, password) {
    setAuthError('');
    await signInWithEmailAndPassword(auth, String(email || '').trim().toLowerCase(), password);
  }

  async function sendPasswordReset(email) {
    await sendPasswordResetEmail(auth, String(email || '').trim().toLowerCase(), verifyLink());
  }

  async function resendVerification() {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser, verifyLink());
  }

  // «Ya lo verifiqué»: se refresca la cuenta y se vuelve a entrar al seguimiento.
  async function refreshVerification() {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    window.location.reload();
  }

  // Después de que la familia corrige sus datos, se refleja en su sesión sin recargar.
  function patchFamilyStudent(studentId, patch) {
    setProfile((prev) => (prev?.role === 'family'
      ? { ...prev, students: (prev.students || []).map((x) => (x.id === studentId ? { ...x, ...patch } : x)) }
      : prev));
  }

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, loginWithGoogle, loginWithGoogleFamily, registerTutorAccount, loginWithPassword, sendPasswordReset, resendVerification, refreshVerification, patchFamilyStudent, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
