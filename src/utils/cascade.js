/**
 * Delay para el efecto "cascada" (usar junto con la clase CSS
 * .cascade-item) al pintar listas. Se limita a maxMs para que listas
 * largas (cientos/miles de filas) no tarden una eternidad en terminar
 * de aparecer — a partir de cierto punto entran junto con las demás.
 */
export function cascadeStyle(index, stepMs = 30, maxMs = 380) {
  return { animationDelay: `${Math.min(index * stepMs, maxMs)}ms` };
}
