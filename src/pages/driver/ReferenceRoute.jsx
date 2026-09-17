import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Printer } from 'lucide-react';
import { Routes as RoutesService } from '../../firebase/services';
import { getReferenceTrip } from '../../firebase/trips';
import { getCurrentLocation } from '../../hooks/useGeolocation';
import { weekdayName, fmtCoords } from '../../utils/dates';
import { numberedIcon } from '../../utils/mapIcons';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function navUrls(lat, lng) {
  return {
    maps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}

/**
 * Pensada para cuando a un operador lo asignan a una ruta que no conoce:
 * trae el ÚLTIMO recorrido completado de esa ruta/turno (sin importar
 * quién lo haya manejado) y deja navegar parada por parada, respetando
 * el orden real con el que se hizo ese día. No permite marcar nada —
 * es solo de referencia. El recorrido de HOY se sigue haciendo, como
 * siempre, desde "Iniciar recorrido" en la pantalla principal.
 */
export default function ReferenceRoute() {
  const { routeId, shift } = useParams();
  const [route, setRoute] = useState(null);
  const [reference, setReference] = useState(undefined); // undefined = cargando, null = no hay
  const [activeStop, setActiveStop] = useState(null);
  const [myLocation, setMyLocation] = useState(null);

  useEffect(() => {
    async function load() {
      const r = await RoutesService.get(routeId);
      setRoute(r);
      const ref = await getReferenceTrip(routeId, shift);
      setReference(ref);
    }
    load();
    // El mapa abre centrado donde está el operador ahorita, no en un
    // centro de ciudad genérico — así ve de inmediato dónde está él
    // respecto a las paradas.
    getCurrentLocation().then(setMyLocation);
  }, [routeId, shift]);

  const withLocation = useMemo(
    () => (reference?.stops || []).filter((s) => s.referenceLocation?.lat),
    [reference]
  );

  const center = myLocation
    ? [myLocation.lat, myLocation.lng]
    : withLocation[0]?.referenceLocation
    ? [withLocation[0].referenceLocation.lat, withLocation[0].referenceLocation.lng]
    : [19.4326, -99.1332]; // último recurso: sin GPS y sin puntos guardados

  if (reference === undefined) {
    return <p className="text-center text-navy-400 mt-10">Buscando el recorrido más reciente…</p>;
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/chofer" className="text-navy-400 text-sm underline">← Volver</Link>
        {withLocation.length > 0 && (
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-sm font-medium text-navy-600 underline">
            <Printer size={14} /> Imprimir mapa
          </button>
        )}
      </div>
      <div>
        <p className="text-navy-400 text-sm">Ruta de referencia</p>
        <h1 className="text-xl font-display font-bold text-navy-900">
          {route?.name || 'Ruta'} · {shift === 'morning' ? 'Ida' : 'Vuelta'}
        </h1>
      </div>

      {!reference && (
        <div className="card text-center">
          <p className="text-navy-400 text-sm">
            Todavía no hay ningún recorrido guardado de esta ruta/turno para usar de referencia.
            En cuanto alguien la corra una vez, aquí quedará disponible para el siguiente operador.
          </p>
        </div>
      )}

      {reference && (
        <div className="route-print">
          <p className="text-sm text-navy-400 print:hidden">
            Basado en el recorrido del {reference.trip.date}. Toca "Navegar" en cada parada, en
            orden, para ir abriendo Maps una por una — así respetas la secuencia real con la que
            se atendió esta ruta.
          </p>
          <p className="hidden print:block text-sm text-navy-600 mb-2">
            {route?.name} · {shift === 'morning' ? 'Ida (matutino)' : 'Vuelta (vespertino)'} ·
            basado en el recorrido del {reference.trip.date}
          </p>

          {withLocation.length > 0 && (
            <div className="card p-0 overflow-hidden print:shadow-none print:border print:border-navy-200" style={{ height: 320 }}>
              <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {myLocation && (
                  <Marker position={[myLocation.lat, myLocation.lng]} icon={numberedIcon('•', '#152238')}>
                    <Popup>Tu ubicación</Popup>
                  </Marker>
                )}
                {withLocation.map((s) => (
                  <Marker
                    key={s.id}
                    position={[s.referenceLocation.lat, s.referenceLocation.lng]}
                    icon={numberedIcon(s.order + 1)}
                    eventHandlers={{ click: () => setActiveStop(s.id) }}
                  >
                    <Popup>
                      <div className="text-xs leading-relaxed">
                        <p className="font-semibold">{s.order + 1}. {s.name}</p>
                        <p>Matrícula: {s.matricula}</p>
                        <p>{weekdayName(reference.trip.date)} · {reference.trip.date}</p>
                        <p className="text-navy-400">{fmtCoords(s.referenceLocation.lat, s.referenceLocation.lng)}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}

          {/* Nomenclatura: en pantalla ya se ve en las tarjetas de abajo;
              al imprimir, este es el legado que acompaña al mapa. */}
          <div className="hidden print:block mt-3">
            <p className="text-xs font-semibold text-navy-600 mb-1">Nomenclatura</p>
            {reference.stops.map((s) => (
              <p key={s.id} className="text-xs text-navy-700">
                {s.order + 1}. {s.name} — matrícula {s.matricula}
                {s.referenceLocation?.lat ? '' : ' (sin ubicación guardada)'}
              </p>
            ))}
          </div>

          <div className="print:hidden">
            {reference.stops.map((s) => (
              <div
                key={s.id}
                className={`rounded-2xl border-2 p-4 mb-3 ${
                  activeStop === s.id ? 'border-navy-800' : 'border-navy-100'
                } bg-white`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-lg text-navy-900 truncate">
                      {s.order + 1}. {s.name}
                    </p>
                    <p className="text-sm text-navy-400">Matrícula {s.matricula}</p>
                  </div>
                  {s.referenceLocation?.lat ? (
                    <div className="flex gap-2 shrink-0">
                      <a
                        href={navUrls(s.referenceLocation.lat, s.referenceLocation.lng).maps}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setActiveStop(s.id)}
                        className="px-3 py-3 rounded-xl bg-navy-800 text-white font-display font-semibold whitespace-nowrap"
                      >
                        📍 Maps
                      </a>
                      <a
                        href={navUrls(s.referenceLocation.lat, s.referenceLocation.lng).waze}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setActiveStop(s.id)}
                        className="px-3 py-3 rounded-xl border border-navy-100 text-navy-600 font-display font-semibold whitespace-nowrap"
                      >
                        🚗 Waze
                      </a>
                    </div>
                  ) : (
                    <span className="text-xs text-navy-400 shrink-0">Sin ubicación guardada</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
