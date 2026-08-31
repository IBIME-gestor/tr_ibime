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
 */
export default function StopCard({ stop, actionLabel, onAction, onMarkAbsent, disabled }) {
  const isDone = stop.status === 'boarded' || stop.status === 'delivered';
  const isAbsent = stop.status === 'absent';

  return (
    <div className={`rounded-2xl border-2 p-4 mb-3 ${STATUS_STYLES[stop.status] || STATUS_STYLES.pending}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-semibold text-lg text-navy-900 truncate">
            {stop.order != null ? `${stop.order + 1}. ` : ''}
            {stop.name}
          </p>
          <p className="text-sm text-navy-400">
            Matrícula {stop.matricula} · {STATUS_LABEL[stop.status] || 'Pendiente'}
          </p>
        </div>
        {!isDone && !isAbsent && !disabled && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onMarkAbsent(stop)}
              className="text-xs px-3 py-2 rounded-xl border border-navy-100 text-navy-400"
            >
              No vino
            </button>
            <button
              onClick={() => onAction(stop)}
              className="px-4 py-3 rounded-xl bg-navy-800 text-white font-display font-semibold"
            >
              {actionLabel}
            </button>
          </div>
        )}
        {isDone && <span className="text-2xl">✓</span>}
        {isAbsent && <span className="text-xs text-navy-400 shrink-0">—</span>}
      </div>
    </div>
  );
}
