import { useMemo } from 'react';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { clipWeekToLanes, layoutWeekEvents, toDateKey } from './calendarGrid.js';

/** Event lanes rendered per day; a busier day shows one lane less plus "+N more". */
const MAX_VISIBLE_LANES = 3;

/**
 * Rows of one week: the date-number row, one fixed-height row per lane, and a
 * filler row that absorbs the remaining cell height.
 */
const WEEK_ROWS_STYLE = {
  gridTemplateRows: `1.75rem repeat(${MAX_VISIBLE_LANES}, 1.375rem) minmax(0.25rem, 1fr)`,
};

function eventLabel(event) {
  if (event.amount == null) return event.title;
  return `${event.title} · ${formatCurrency(event.currency, event.amount)}`;
}

function eventTooltip(event) {
  return [eventLabel(event), event.subtitle].filter(Boolean).join('\n');
}

function WeekRow({ week, monthDate, events, colorBySource, locale, todayKey }) {
  const ui = useUI();
  const { pieces, overflow, countByCol } = useMemo(() => {
    const segments = layoutWeekEvents(week, events);
    const counts = week.map(() => 0);
    for (const seg of segments) {
      for (let c = seg.startCol; c < seg.startCol + seg.span; c += 1) counts[c] += 1;
    }
    return { ...clipWeekToLanes(segments, MAX_VISIBLE_LANES, week.length), countByCol: counts };
  }, [week, events]);

  return (
    <div className="relative grid grid-cols-7 min-h-[6.5rem] border-b" style={WEEK_ROWS_STYLE}>
      {/* Day backgrounds: one cell per column spanning every row of the week. */}
      {week.map((day, col) => {
        const key = toDateKey(day);
        return (
          <div
            key={key}
            className={cn(
              'border-r',
              day.getMonth() !== monthDate.getMonth() && 'bg-muted/30 text-muted-foreground',
            )}
            style={{ gridColumn: col + 1, gridRow: '1 / -1' }}
            aria-label={`${formatCalendarDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long' })}, ${ui('ucalDayEvents', { n: countByCol[col] })}`}
          >
            <span
              className={cn(
                'm-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                key === todayKey && 'bg-primary text-primary-foreground',
              )}
            >
              {day.getDate()}
            </span>
          </div>
        );
      })}
      {/* Event bars: one element per (visible) segment, spanning its columns. */}
      {pieces.map((piece) => (
        <div
          key={`${piece.event.id}-${piece.startCol}`}
          title={eventTooltip(piece.event)}
          className={cn(
            'z-[1] my-px flex items-center overflow-hidden px-1.5 text-[11px] font-medium leading-tight',
            colorBySource[piece.event.sourceId],
            piece.continuesBefore ? 'rounded-l-none' : 'ml-1 rounded-l',
            piece.continuesAfter ? 'rounded-r-none' : 'mr-1 rounded-r',
          )}
          style={{ gridColumn: `${piece.startCol + 1} / span ${piece.span}`, gridRow: piece.lane + 2 }}
        >
          <span className="truncate">{eventLabel(piece.event)}</span>
        </div>
      ))}
      {overflow.map(({ col, count }) => (
        <span
          key={`more-${col}`}
          className="z-[1] flex items-center px-1.5 text-[11px] text-muted-foreground"
          style={{ gridColumn: col + 1, gridRow: MAX_VISIBLE_LANES + 1 }}
        >
          {ui('andNMore', { n: count })}
        </span>
      ))}
    </div>
  );
}

/**
 * Month grid of the Unified Calendar. Purely presentational: receives the
 * already-filtered events and the colour of each source. Multi-day events are
 * drawn as one continuous bar per week row (see `layoutWeekEvents`).
 */
export default function MonthGrid({ weeks, monthDate, events, colorBySource, locale }) {
  const todayKey = toDateKey(new Date());

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="grid grid-cols-7 border-b">
        {weeks[0].map((day) => (
          <div
            key={toDateKey(day)}
            className="py-2 text-center text-xs font-medium uppercase text-muted-foreground"
          >
            {formatCalendarDate(day, locale, { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div className="grid grid-rows-6 flex-1 border-l">
        {weeks.map((week) => (
          <WeekRow
            key={toDateKey(week[0])}
            week={week}
            monthDate={monthDate}
            events={events}
            colorBySource={colorBySource}
            locale={locale}
            todayKey={todayKey}
          />
        ))}
      </div>
    </div>
  );
}
