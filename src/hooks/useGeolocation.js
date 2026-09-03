/**
 * Captura la ubicación GPS en el momento exacto de un evento
 * (subida/bajada de un alumno, llegada al colegio, etc).
 * Se pide bajo demanda (no en segundo plano) para respetar batería y permisos.
 */
export function getCurrentLocation(options = {}) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => resolve(null), // si el chofer niega el permiso, seguimos sin bloquear el flujo
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000, ...options }
    );
  });
}

/**
 * Sigue la posición del chofer en segundo plano MIENTRAS el recorrido está
 * activo (para el mapa en vivo del padre de familia). A diferencia de
 * getCurrentLocation, este SÍ corre de forma continua con watchPosition,
 * pero el llamador debe throttlear cada cuánto se escribe a Firestore
 * (no cada evento del GPS) para no gastar cuota ni batería.
 *
 * Devuelve una función `stop()` para cancelar el watch (llamarla siempre
 * en el cleanup del efecto / al finalizar el recorrido).
 */
export function watchLocation(onUpdate, options = {}) {
  if (!('geolocation' in navigator)) {
    return () => {};
  }
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    },
    () => {
      /* si el chofer niega/pierde el permiso, simplemente dejamos de
         recibir actualizaciones; no interrumpimos el recorrido */
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000, ...options }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
