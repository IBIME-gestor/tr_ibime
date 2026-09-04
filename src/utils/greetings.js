/**
 * Pequeños detalles de calidez para el operador (chofer/nanny): un saludo
 * según la hora real del día al entrar, y una despedida acorde al turno
 * que acaba de terminar. La idea es que la app se sienta humana, no solo
 * funcional.
 */

export function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Solo el primer nombre — "Josué Daniel Figueroa Jain" -> "Josué". */
export function getFirstName(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

/**
 * Despedida al cerrar el recorrido: por turno, no por hora del reloj
 * (un chofer podría cerrar su vuelta un poco después de la hora "normal"
 * y el mensaje debe seguir correspondiendo a que ya volvió a casa).
 */
export function getFarewellMessage(shift) {
  return shift === 'afternoon' ? 'Ten un buen camino a casa' : 'Ten un excelente día';
}
