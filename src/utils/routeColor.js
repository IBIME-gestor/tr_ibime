// Le da a cada ruta un color fijo y consistente en toda la app —igual que
// una línea de metro— para identificarla de un vistazo en tablas, badges
// y mapas, sin tener que leer el nombre completo cada vez.
const PALETTE = [
  { bg: 'bg-route-teal/10', text: 'text-route-teal', border: 'border-route-teal/25' },
  { bg: 'bg-route-violet/10', text: 'text-route-violet', border: 'border-route-violet/25' },
  { bg: 'bg-route-coral/10', text: 'text-route-coral', border: 'border-route-coral/25' },
  { bg: 'bg-route-sky/10', text: 'text-route-sky', border: 'border-route-sky/25' },
  { bg: 'bg-route-olive/10', text: 'text-route-olive', border: 'border-route-olive/25' },
  { bg: 'bg-route-pink/10', text: 'text-route-pink', border: 'border-route-pink/25' },
];

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Devuelve las clases de Tailwind (bg/text/border) para pintar esta ruta. */
export function routeColorClasses(routeId) {
  if (!routeId) return null;
  return PALETTE[hashId(routeId) % PALETTE.length];
}
