import { ARRIVAL_WAIT_SECONDS } from '../firebase/trips';
import { useArrivalCountdown, fmtCountdown } from '../utils/countdown';

const STATUS_STYLES = {
  pending: 'bg-white border-navy-100',
  boarded: 'bg-signal-yellow/20 border-signal-yellow',
  delivered: 'bg-go-light border-go',
  absent: 'bg-wait-light border-wait',
};

const STATUS_LABEL = {
  pending: 'Pendiente',
  boarded: 'A bordo',
  delivered: 'Completado',
  absent: 'No asistió',
};

/**
 * Tarjeta táctil grande para un alumno dentro del recorrido.
 * `actionLabel` cambia según el turno: "Recogido" en la mañana,
 * "Bajó" en la tarde. El chofer toca UNA vez, no hay menús ni pasos extra.
 *
 * El nombre siempre va en su propio renglón y los botones abajo, en una
 * fila que se puede envolver (flex-wrap) — así no se aprietan ni se
 * salen de la pantalla en un celular angosto.
 *
 * Si se pasa `onArrive`, aparece el botón "Llegué" para arrancar el
 * contador de espera (visible también para el padre); una vez tocado,
 * ese botón se reemplaza por la cuenta regresiva en vivo.
 */
export default function StopCard({
  stop,
  actionLabel,
  onAction,
  onMarkAbsent,
  onArrive,
  disabled,
  nav,
  phone,
  className = '',
  style,
}) {
  // "Terminado" de verdad es solo cuando ya se entregó (bajó en su domicilio
  // o llegó al plantel). "A bordo" es un estado intermedio: en el recorrido
  // de vuelta todavía falta la acción de "Bajó", así que el botón debe
  // seguir apareciendo.
  const isDone = stop.status === 'delivered';
  const isAbsent = stop.status === 'absent';
  const showActions = !isDone && !isAbsent && !disabled;

  const secondsLeft = useArrivalCountdown(stop.arrivedAt, ARRIVAL_WAIT_SECONDS);
  const timeUp = secondsLeft === 0;

  return (
    <div className={`rounded-2xl border-2 p-4 mb-3 ${STATUS_STYLES[stop.status] || STATUS_STYLES.pending} ${className}`} style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-lg text-navy-900 truncate">
            {stop.order != null ? `${stop.order + 1}. ` : ''}
            {stop.name}
          </p>
          <p className="text-sm text-navy-400">
            Matrícula {stop.matricula} · {STATUS_LABEL[stop.status] || 'Pendiente'}
          </p>
        </div>
        {isDone && <span className="text-2xl shrink-0">✓</span>}
        {isAbsent && <span className="text-xs text-navy-400 shrink-0">—</span>}
      </div>

      {showActions && secondsLeft != null && (
        <div
          className={`mt-2 text-xs font-medium rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 ${
            timeUp ? 'bg-stop-light text-stop' : 'bg-signal-amber/15 text-signal-amber'
          }`}
        >
          ⏱ {timeUp ? 'Tiempo agotado, puedes continuar' : `Esperando · ${fmtCountdown(secondsLeft)}`}
        </div>
      )}

      {showActions && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {nav?.maps && (
            <a
              href={nav.maps}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-2 rounded-xl border border-navy-100 text-navy-600 whitespace-nowrap min-h-[36px] flex items-center"
            >
              📍 Maps
            </a>
          )}
          {nav?.waze && (
            <a
              href={nav.waze}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-2 rounded-xl border border-navy-100 text-navy-600 whitespace-nowrap min-h-[36px] flex items-center"
            >
              🚗 Waze
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="text-xs px-3 py-2 rounded-xl border border-navy-100 text-navy-600 whitespace-nowrap min-h-[36px] flex items-center"
            >
              📞 Llamar
            </a>
          )}
          {onArrive && secondsLeft == null && (
            <button
              onClick={() => onArrive(stop)}
              className="text-xs px-3 py-2 rounded-xl border border-signal-amber text-signal-amber font-semibold whitespace-nowrap min-h-[36px] flex items-center"
            >
              📍 Llegué
            </button>
          )}

          <div className="flex gap-2 ml-auto w-full sm:w-auto">
            <button
              onClick={() => onMarkAbsent(stop)}
              className={`flex-1 sm:flex-none text-xs px-3 py-2 rounded-xl border min-h-[44px] transition-colors ${
                timeUp ? 'border-stop bg-stop text-white font-semibold' : 'border-navy-100 text-navy-400'
              }`}
            >
              No vino
            </button>
            <button
              onClick={() => onAction(stop)}
              className="flex-1 sm:flex-none px-4 py-3 rounded-xl bg-navy-800 text-white font-display font-semibold min-h-[44px] active:scale-[0.97] transition-transform"
            >
              {actionLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
