import { doc, updateDoc } from 'firebase/firestore';
import { db } from './config';

/**
 * Geocodificación GRATUITA vía Nominatim (OpenStreetMap) — sin costo, sin
 * necesidad de activar facturación en Google Cloud. A cambio de ser
 * gratis, tiene dos límites que hay que respetar:
 *
 *  1. Máximo ~1 solicitud por segundo (política de uso de Nominatim).
 *     Por eso las llamadas van en fila, una tras otra con una pequeña
 *     pausa, nunca en paralelo.
 *  2. La precisión es "a nivel de dirección de texto", no tan exacta
 *     como la ubicación real capturada por GPS. Por eso, siempre que ya
 *     exista una ubicación real capturada en un recorrido anterior
 *     (boardedLocation/deliveredLocation), se prefiere esa sobre la
 *     dirección geocodificada.
 *
 * El resultado se guarda en el propio documento (alumno o plantel) para
 * jamás tener que volver a pedirlo.
 */

let queue = Promise.resolve();
const MIN_INTERVAL_MS = 1100;

function throttledFetch(url) {
  const run = queue.then(async () => {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('Nominatim no respondió correctamente');
    return res.json();
  });
  // Encadena la siguiente llamada solo después de esperar el intervalo,
  // sin importar si esta tuvo éxito o falló.
  queue = run.catch(() => {}).then(
    () => new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS))
  );
  return run;
}

/** Geocodifica una dirección de texto libre. Devuelve {lat, lng} o null. */
export async function geocodeAddress(address) {
  if (!address?.trim()) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    address
  )}`;
  try {
    const results = await throttledFetch(url);
    if (!results?.[0]) return null;
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  } catch {
    return null;
  }
}

/**
 * Resuelve la mejor ubicación disponible para un alumno, en este orden
 * de preferencia:
 *   1. Ubicación real ya capturada en un recorrido anterior (la más
 *      confiable: es donde el chofer realmente lo subió/bajó).
 *   2. Ubicación geocodificada y cacheada previamente en el alumno.
 *   3. Geocodificar su dirección de texto ahora mismo (y cachearla).
 */
export async function resolveStudentLocation(student, realLocation) {
  if (realLocation?.lat) return realLocation;
  if (student.geocodedLocation?.lat) return student.geocodedLocation;
  const loc = await geocodeAddress(student.address);
  if (loc) {
    await updateDoc(doc(db, 'students', student.id), { geocodedLocation: loc });
  }
  return loc;
}

/** Igual que arriba, pero para el plantel (punto fijo de inicio/fin). */
export async function resolveSchoolLocation(school) {
  if (school.geocodedLocation?.lat) return school.geocodedLocation;
  if (!school.address) return null;
  const loc = await geocodeAddress(school.address);
  if (loc) {
    await updateDoc(doc(db, 'schools', school.id), { geocodedLocation: loc });
  }
  return loc;
}
