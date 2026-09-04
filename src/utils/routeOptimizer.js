/**
 * Optimización de orden de paradas SIN costo: usa distancia en línea
 * recta (fórmula de Haversine), no tráfico ni calles reales. Es una
 * aproximación — normalmente muy buena para ordenar paradas de una
 * colonia/zona (que no vayan de un lado a otro dando vueltas), aunque no
 * es tan precisa como Google Directions con tráfico en vivo (esa opción
 * de pago quedó descartada por ahora).
 *
 * La escuela se trata como PUNTO FIJO:
 *  - Turno de ida (mañana):  las paradas terminan en la escuela.
 *  - Turno de vuelta (tarde): las paradas empiezan en la escuela.
 */

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function totalDistance(order, points, anchor, anchorPosition) {
  const seq = anchorPosition === 'start' ? [anchor, ...order] : [...order, anchor];
  let sum = 0;
  for (let i = 1; i < seq.length; i++) {
    sum += haversineKm(points[seq[i - 1]], points[seq[i]]);
  }
  return sum;
}

/** Vecino más cercano, arrancando o terminando en el punto fijo (escuela). */
function nearestNeighbor(ids, points, anchor, anchorPosition) {
  const remaining = new Set(ids);
  const order = [];
  let current = anchor;

  if (anchorPosition === 'end') {
    // Sin punto de partida fijo: arrancamos desde la parada más lejana a
    // la escuela (heurística simple y razonable para un camino abierto).
    let farthest = null;
    let farthestDist = -1;
    remaining.forEach((id) => {
      const d = haversineKm(points[id], anchor);
      if (d > farthestDist) { farthestDist = d; farthest = id; }
    });
    current = points[farthest];
    order.push(farthest);
    remaining.delete(farthest);
  }

  while (remaining.size > 0) {
    let closest = null;
    let closestDist = Infinity;
    remaining.forEach((id) => {
      const d = haversineKm(current, points[id]);
      if (d < closestDist) { closestDist = d; closest = id; }
    });
    order.push(closest);
    remaining.delete(closest);
    current = points[closest];
  }

  return order;
}

/** Mejora 2-opt: intercambia tramos si eso acorta la distancia total. */
function twoOptImprove(order, points, anchor, anchorPosition, maxIterations = 200) {
  let best = order;
  let bestDist = totalDistance(best, points, anchor, anchorPosition);
  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const dist = totalDistance(candidate, points, anchor, anchorPosition);
        if (dist < bestDist - 1e-6) {
          best = candidate;
          bestDist = dist;
          improved = true;
        }
      }
    }
  }
  return { order: best, distanceKm: bestDist };
}

/**
 * @param {Array<{id:string, lat:number, lng:number}>} stops
 * @param {{lat:number,lng:number}} anchor  Ubicación de la escuela
 * @param {'start'|'end'} anchorPosition
 * @returns {{ order: string[], distanceKm: number }}
 */
export function optimizeStopOrder(stops, anchor, anchorPosition) {
  const points = {};
  stops.forEach((s) => { points[s.id] = { lat: s.lat, lng: s.lng }; });
  const ids = stops.map((s) => s.id);

  if (ids.length <= 1) {
    return { order: ids, distanceKm: 0 };
  }

  const initial = nearestNeighbor(ids, points, anchor, anchorPosition);
  return twoOptImprove(initial, points, anchor, anchorPosition);
}
