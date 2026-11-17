import { CalendarClock } from 'lucide-react';
import { todayInput, scheduleError } from '../utils/schedule';

/** ¿Cuándo debe aparecer el aviso? Ahora, o programado para un día y hora. */
export default function ScheduleField({ value, onChange }) {
  const err = scheduleError(value);
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-2">
      <p className="admin-label flex items-center gap-1.5"><CalendarClock size={14} /> ¿Cuándo debe aparecer?</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="radio" checked={value.mode === 'now'} onChange={() => set({ mode: 'now' })} /> Ahora</label>
        <label className="flex items-center gap-2"><input type="radio" checked={value.mode === 'later'} onChange={() => set({ mode: 'later' })} /> Programarlo para un día y hora</label>
      </div>
      {value.mode === 'later' && (
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            <input type="date" className="admin-input" min={todayInput()} value={value.date} onChange={(e) => set({ date: e.target.value })} />
            <input type="time" className="admin-input" value={value.time} onChange={(e) => set({ time: e.target.value })} />
          </div>
          <p className="text-[11px] text-navy-400">
            Se queda guardado y aparece ese día a esa hora; desde entonces se muestra cada vez que abran la app, como cualquier aviso.
          </p>
          {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
      )}
    </div>
  );
}
