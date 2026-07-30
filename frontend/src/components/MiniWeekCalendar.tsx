import type { CalendarEvent } from '../types/domain';
import { WEEKDAYS } from '../types/domain';

const PX_PER_MINUTE = 1.1;

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface MiniWeekCalendarProps {
  weekDays: Date[];
  classesByDay: Map<string, CalendarEvent[]>;
  onSelectClass: (id: number) => void;
}

const MiniWeekCalendar = ({ weekDays, classesByDay, onSelectClass }: MiniWeekCalendarProps) => {
  const timed = weekDays.flatMap((d) => (classesByDay.get(toKey(d)) || []).filter((c) => c.start_time && c.end_time));
  if (timed.length === 0) return null;

  const starts = timed.map((c) => toMinutes(c.start_time!));
  const ends = timed.map((c) => toMinutes(c.end_time!));
  const dayStart = Math.max(0, Math.floor(Math.min(...starts) / 60) * 60 - 30);
  const dayEnd = Math.min(24 * 60, Math.ceil(Math.max(...ends) / 60) * 60 + 30);
  const totalMinutes = dayEnd - dayStart;
  const hourTicks = Array.from({ length: Math.floor(totalMinutes / 60) + 1 }, (_, i) => dayStart + i * 60).filter((m) => m <= dayEnd);
  const todayKey = toKey(new Date());

  return (
    <div className="card p-4 overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[52px_repeat(7,1fr)] gap-1 mb-2">
          <div />
          {weekDays.map((d) => {
            const key = toKey(d);
            const isToday = key === todayKey;
            return (
              <div key={key} className={`text-center py-1.5 rounded-lg ${isToday ? 'bg-accent/10' : ''}`}>
                <p className={`text-[10px] uppercase font-medium ${isToday ? 'text-accent' : 'text-muted'}`}>{WEEKDAYS[(d.getDay() + 6) % 7].short}</p>
                <p className={`text-sm font-semibold ${isToday ? 'text-accent' : 'text-ink'}`}>{d.getDate()}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-[52px_repeat(7,1fr)] gap-1 max-h-[420px] overflow-y-auto custom-scrollbar">
          <div className="relative" style={{ height: totalMinutes * PX_PER_MINUTE }}>
            {hourTicks.map((m) => (
              <span
                key={m}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted"
                style={{ top: (m - dayStart) * PX_PER_MINUTE }}
              >
                {String(Math.floor(m / 60)).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          {weekDays.map((d) => {
            const key = toKey(d);
            const dayClasses = (classesByDay.get(key) || []).filter((c) => c.start_time && c.end_time);
            return (
              <div
                key={key}
                className="relative rounded-lg bg-surface-2/50 border border-line"
                style={{
                  height: totalMinutes * PX_PER_MINUTE,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${60 * PX_PER_MINUTE - 1}px, rgb(var(--line)) ${60 * PX_PER_MINUTE - 1}px, rgb(var(--line)) ${60 * PX_PER_MINUTE}px)`,
                }}
              >
                {dayClasses.map((c) => {
                  const start = toMinutes(c.start_time!);
                  const end = toMinutes(c.end_time!);
                  const top = Math.max(0, (start - dayStart) * PX_PER_MINUTE);
                  const height = Math.max(16, (end - start) * PX_PER_MINUTE);
                  const cancelled = c.status === 'cancelled';
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectClass(c.id)}
                      title={`${c.discipline_name} · ${c.start_time?.slice(0, 5)}–${c.end_time?.slice(0, 5)}${cancelled ? ' (cancelada)' : ''}`}
                      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-left border overflow-hidden hover:brightness-95 transition-all ${cancelled ? 'opacity-50' : ''}`}
                      style={{ top, height, backgroundColor: `${c.color}1a`, borderColor: `${c.color}40` }}
                    >
                      <p className={`text-[10px] font-semibold leading-tight truncate ${cancelled ? 'line-through' : ''}`} style={{ color: c.color }}>
                        {c.discipline_name}
                      </p>
                      <p className="text-[9px] text-muted leading-tight truncate">{c.start_time?.slice(0, 5)}–{c.end_time?.slice(0, 5)}</p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MiniWeekCalendar;
