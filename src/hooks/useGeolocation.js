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
      () => resolve(null), // si el operador niega el permiso, seguimos sin bloquear el flujo
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0, ...options }
    );
  });
}

/**
 * Sigue la posición del operador en segundo plano MIENTRAS el recorrido está
 * activo (para el mapa en vivo del padre de familia). A diferencia de
 * getCurrentLocation, este SÍ corre de forma continua con watchPosition,
 * pero el llamador debe throttlear cada cuánto se escribe a Firestore
 * (no cada evento del GPS) para no gastar cuota ni batería.
 *
 * Devuelve una función `stop()` para cancelar el watch (llamarla siempre
 * en el cleanup del efecto / al finalizar el recorrido).
 */
export function watchLocation(onUpdate, options = {}) {
  const { onError, ...geoOptions } = options;
  if (!('geolocation' in navigator)) {
    if (onError) onError({ code: 0, message: 'unsupported' });
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
    (err) => {
      /* no interrumpimos el recorrido; solo se avisa al llamador para que
         le muestre al operador que su ubicación no se está enviando */
      if (onError) onError(err);
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000, ...geoOptions }
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
