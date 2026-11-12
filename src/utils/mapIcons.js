import L from 'leaflet';

/**
 * Marcador circular con un número (o símbolo) adentro. En los mapas de
 * recorridos el número es el ORDEN REAL en que se recogió/bajó a cada
 * alumno (ver utils/tripOrder.js), no su posición en la lista, para que el
 * mapa impreso se lea como el recorrido que de verdad se hizo.
 * Los colores llevan significado: amarillo = pendiente/propuesto,
 * verde = ya atendido.
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

/* ------------------------------------------------------------------ */
/*  Dibujos (SVG como texto) — se reutilizan en los mapas de Leaflet y  */
/*  en la línea del recorrido de la vista del padre de familia.         */
/* ------------------------------------------------------------------ */

/** Camioncito escolar de lado. Alto = ancho × 0.625. */
export function busSvg(width = 58) {
  const height = Math.round(width * 0.625);
  return `<svg width="${width}" height="${height}" viewBox="0 0 64 40" fill="none" aria-hidden="true">
    <path d="M3 9a4 4 0 0 1 4-4h36a5 5 0 0 1 4.6 3L53 18h6a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#FFC93C" stroke="#152238" stroke-width="2" stroke-linejoin="round"/>
    <rect x="8" y="10" width="7" height="8" rx="1.2" fill="#E3EEFF" stroke="#152238" stroke-width="1.2"/>
    <rect x="17" y="10" width="7" height="8" rx="1.2" fill="#E3EEFF" stroke="#152238" stroke-width="1.2"/>
    <rect x="26" y="10" width="7" height="8" rx="1.2" fill="#E3EEFF" stroke="#152238" stroke-width="1.2"/>
    <rect x="35" y="10" width="7" height="8" rx="1.2" fill="#E3EEFF" stroke="#152238" stroke-width="1.2"/>
    <path d="M44.5 10h2.4l3.4 8h-5.8z" fill="#E3EEFF" stroke="#152238" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M3 24.5h59" stroke="#152238" stroke-width="2"/>
    <circle cx="17" cy="32" r="5.2" fill="#152238" stroke="#fff" stroke-width="1.6"/>
    <circle cx="17" cy="32" r="1.8" fill="#D5DCE8"/>
    <circle cx="49" cy="32" r="5.2" fill="#152238" stroke="#fff" stroke-width="1.6"/>
    <circle cx="49" cy="32" r="1.8" fill="#D5DCE8"/>
  </svg>`;
}

/** Banderita verde de salida (el asta queda en x=8, la base en y=40). */
export function startFlagSvg(size = 34, pole = '#152238') {
  return `<svg width="${size}" height="${Math.round(size * 42 / 34)}" viewBox="0 0 34 42" fill="none" aria-hidden="true">
    <path d="M8 4v36" stroke="${pole}" stroke-width="3" stroke-linecap="round"/>
    <path d="M9.5 5h20l-5 7.5 5 7.5h-20z" fill="#2E7D57" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="8" cy="40" r="3" fill="${pole}" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
}

/** Bandera de cuadros de meta (mismas medidas que la de salida). */
export function finishFlagSvg(size = 34, pole = '#152238') {
  const cells = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      cells.push(
        `<rect x="${10 + c * 5}" y="${6 + r * 5}" width="5" height="5" fill="${(r + c) % 2 ? '#fff' : '#152238'}"/>`
      );
    }
  }
  return `<svg width="${size}" height="${Math.round(size * 42 / 34)}" viewBox="0 0 34 42" fill="none" aria-hidden="true">
    <path d="M8 4v36" stroke="${pole}" stroke-width="3" stroke-linecap="round"/>
    ${cells.join('')}
    <rect x="10" y="6" width="20" height="15" stroke="#152238" stroke-width="1.4"/>
    <circle cx="8" cy="40" r="3" fill="${pole}" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
}

const SHADOW = 'filter:drop-shadow(0 2px 3px rgba(14,22,38,.4));';

/**
 * Camioncito escolar para el mapa del padre de familia y la flota en vivo
 * — de un vistazo se entiende que es el transporte, no un lugar.
 */
export function busIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker">
      <span class="bus-marker-pulse"></span>
      <span style="position:relative;display:block;${SHADOW}">${busSvg(58)}</span>
    </div>`,
    iconSize: [58, 36],
    iconAnchor: [29, 30],
    popupAnchor: [0, -28],
  });
}

/**
 * Banderita verde de SALIDA: marca el punto donde arrancó el recorrido.
 * El ancla queda en la base del asta, que es el punto real en el mapa.
 */
export function startFlagIcon() {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;${SHADOW}">${startFlagSvg(34)}</span>`,
    iconSize: [34, 42],
    iconAnchor: [8, 40],
    popupAnchor: [10, -34],
  });
}

/** Bandera de cuadros de META: marca el punto donde se cerró el recorrido. */
export function finishFlagIcon() {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;${SHADOW}">${finishFlagSvg(34)}</span>`,
    iconSize: [34, 42],
    iconAnchor: [8, 40],
    popupAnchor: [10, -34],
  });
}
