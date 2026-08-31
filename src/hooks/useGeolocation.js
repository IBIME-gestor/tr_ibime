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
