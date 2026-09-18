import L from 'leaflet';

/**
 * Marcador circular con un número (o símbolo) adentro — para que el mapa
 * impreso muestre "1, 2, 3…" en el mismo orden que la lista de alumnos
 * debajo, en vez de todos los pines iguales sin poder distinguirlos.
 */
export function numberedIcon(n, color = '#FFC93C') {
  const textColor = color === '#FFC93C' ? '#152238' : '#fff';
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 26px; height: 26px; border-radius: 50%;
      background: ${color}; color: ${textColor};
      display: flex; align-items: center; justify-content: center;
      font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 12px;
      border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    ">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

/**
 * Ícono del plantel (punto fijo de inicio/fin de ruta) para las
 * previsualizaciones de mapa — distinto a los numerados de alumnos para
 * que se distinga de un vistazo cuál pin es la escuela.
 */
export function schoolIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width: 30px; height: 30px; border-radius: 8px;
      background: #152238; display: flex; align-items: center; justify-content: center;
      border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      transform: rotate(45deg);
    ">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFC93C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(-45deg);">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>
      </svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 22],
    popupAnchor: [0, -20],
  });
}

/**
 * Ícono de camión escolar para el mapa del padre de familia, en vez del
 * pin genérico de Leaflet — de un vistazo se entiende que es el camión,
 * no un lugar. El wrapper con id fijo es lo que anima suavemente el
 * movimiento entre actualizaciones de GPS (ver animateMarkerMove).
 */
export function busIcon() {
  return L.divIcon({
    className: '',
    html: `<div id="bus-marker-inner" style="
      width: 38px; height: 38px; border-radius: 50%;
      background: #152238; display: flex; align-items: center; justify-content: center;
      border: 3px solid #FFC93C; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      transition: transform 0.3s ease-out;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFC93C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
        <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
        <circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>
      </svg>
    </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}
