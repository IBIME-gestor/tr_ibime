import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Todas las credenciales se leen de variables de entorno (.env)
// para que este repositorio pueda subirse a GitHub sin exponer llaves.
// Ver .env.example para la lista de variables requeridas.
//
// NOTA: por ahora NO usamos Firebase Storage (requiere plan de pago
// "Blaze" incluso para uso gratuito). Todo lo que necesitamos —
// Authentication, Firestore y Hosting en Vercel— funciona en el
// plan gratuito "Spark".
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
