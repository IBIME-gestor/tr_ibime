import { createContext, useContext, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

/**
 * Autenticación con Google (cuenta institucional) + "auto-alta" del
 * perfil (users/{uid}) la primera vez que alguien entra:
 *
 *  1. Si su correo está en la colección `admins` -> se crea como admin.
 *  2. Si su correo coincide con el de algún documento en `drivers` -> se
 *     crea como chofer/nanny, enlazado a ese documento.
 *  3. Si no coincide con nada -> no se le crea perfil y se cierra su sesión.
 *
 * Así el administrador NUNCA tiene que crear cuentas a mano: solo
 * registra el correo institucional del chofer en el panel, y la
 * primera vez que esa persona entra con Google, el sistema lo reconoce.
 */
const AuthContext = createContext(null);

async function provisionProfile(firebaseUser) {
  const email = (firebaseUser.email || '').toLowerCase();

  // 1) ¿Está en la lista de administradores?
  const adminSnap = await getDoc(doc(db, 'admins', email));
  if (adminSnap.exists()) {
    const data = { role: 'admin', name: firebaseUser.displayName || email, email };
    await setDoc(doc(db, 'users', firebaseUser.uid), data);
    return data;
  }

  // 2) ¿Su correo coincide con algún chofer/nanny dado de alta?
  const q = query(collection(db, 'drivers'), where('email', '==', email));
  const results = await getDocs(q);
  if (!results.empty) {
    const driverDoc = results.docs[0];
    const data = {
      role: 'driver',
      driverId: driverDoc.id,
      name: driverDoc.data().name || firebaseUser.displayName,
      email,
    };
    await setDoc(doc(db, 'users', firebaseUser.uid), data);
    return data;
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
      setAuthError('');
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
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
          'Tu cuenta de Google no tiene acceso todavía. Pide al administrador que registre tu correo institucional en la app.'
        );
        await signOut(auth);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);
      setProfile(profileData);
      setLoading(false);
    });
    return unsub;
  }, []);

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

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
