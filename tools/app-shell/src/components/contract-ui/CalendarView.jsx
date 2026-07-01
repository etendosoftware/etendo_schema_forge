import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Max event pills to show per cell before collapsing into "+ N more". */
const MAX_VISIBLE_EVENTS = 2;

/**
 * Default color palette for events that don't specify a color.
 * Keyed by event.type; falls back to the first entry.
 */
const TYPE_COLORS = {
  default: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  absence: 'bg-rose-100 text-rose-800 hover:bg-rose-200',
  task: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  activity: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  meeting: 'bg-violet-100 text-violet-800 hover:bg-violet-200',
};

function colorForEvent(event) {
  if (event.color) return event.color;
  return TYPE_COLORS[event.type] ?? TYPE_COLORS.default;
}

/** Return a Date string in YYYY-MM-DD for comparison (local time). */
function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build the 6-row x 7-col grid of dates for a given month.
 * Each entry is a Date. The grid always starts on Monday and may include
 * trailing/leading dates from adjacent months.
 */
function buildCalendarGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  // getDay() returns 0=Sun..6=Sat. We want Mon=0..Sun=6.
  const startDow = (firstOfMonth.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startDow);

  const rows = [];
  let cursor = new Date(startDate);
  for (let r = 0; r < 6; r++) {
    const week = [];
    for (let c = 0; c < 7; c++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push(week);
  }
  return rows;
}

/**
 * Index events by date key for O(1) lookup.
 * Multi-day events (date..endDate) are duplicated across every day they span.
 */
const MS_PER_DAY = 86400000;

function indexEventSpan(evt, map) {
  const start = new Date(evt.date);
  const end = evt.endDate ? new Date(evt.endDate) : start;
  if (end < start) return;
  // Upper bound on calendar-day iterations; the real terminator is `cursor > end`
  // in the body. Computed up-front so the loop counter (i), not `end`, drives
  // the loop condition.
  const maxIters = Math.ceil((end - start) / MS_PER_DAY) + 2;
  const cursor = new Date(start);
  for (let i = 0; i < maxIters; i++) {
    if (cursor > end) break;
    const key = toDateKey(cursor);
    if (!map[key]) map[key] = [];
    map[key].push(evt);
    cursor.setDate(cursor.getDate() + 1);
  }
}

export function indexEvents(events) {
  const map = {};
  for (const evt of events) {
    indexEventSpan(evt, map);
  }
  return map;
}

/**
 * CalendarView -- a monthly calendar grid for displaying events.
 *
 * @param {Object} props
 * @param {Array}  props.events        Array of event objects { id, title, date, endDate?, color?, type? }
 * @param {Function} props.onDateClick Called with a Date when a date cell is clicked
 * @param {Function} props.onEventClick Called with the event object when an event pill is clicked
 * @param {Date}   props.month         Date representing the displayed month (defaults to today)
 * @param {Function} props.onMonthChange Called with a new Date when the user navigates months
 */
export function CalendarView({
  events = [],
  onDateClick,
  onEventClick,
  month,
  onMonthChange,
}) {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);

  // Controlled or uncontrolled month state
  const [internalMonth, setInternalMonth] = useState(
    () => month ?? new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const displayMonth = month ?? internalMonth;
  const year = displayMonth.getFullYear();
  const mo = displayMonth.getMonth();

  const changeMonth = useCallback(
    (delta) => {
      const next = new Date(year, mo + delta, 1);
      if (onMonthChange) {
        onMonthChange(next);
      } else {
        setInternalMonth(next);
      }
    },
    [year, mo, onMonthChange],
  );

  const grid = useMemo(() => buildCalendarGrid(year, mo), [year, mo]);
  const eventIndex = useMemo(() => indexEvents(events), [events]);

  return (
    <div className="w-full select-none">
      {/* Header: navigation + month/year label */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          data-testid="Button__936aad">
          <ChevronLeft className="h-5 w-5" data-testid="ChevronLeft__936aad" />
        </Button>

        <h2 className="text-lg font-semibold">
          {MONTH_NAMES[mo]} {year}
        </h2>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => changeMonth(1)}
          aria-label="Next month"
          data-testid="Button__936aad">
          <ChevronRight className="h-5 w-5" data-testid="ChevronRight__936aad" />
        </Button>
      </div>
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>
      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-t border-l">
        {grid.flat().map((date) => {
          const key = toDateKey(date);
          const isToday = key === todayKey;
          const isCurrentMonth = date.getMonth() === mo;
          const dayEvents = eventIndex[key] ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
          const overflow = dayEvents.length - MAX_VISIBLE_EVENTS;

          return (
            <button
              type="button"
              key={key}
              onClick={() => onDateClick?.(date)}
              className={cn(
                'relative flex flex-col items-start p-1.5 min-h-[5rem] border-b border-r text-left',
                'transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
              )}
              aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''}` : ''}`}
            >
              {/* Date number */}
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                  isToday && 'bg-primary text-primary-foreground',
                )}
              >
                {date.getDate()}
              </span>
              {/* Event pills */}
              <div className="mt-0.5 flex flex-col gap-0.5 w-full overflow-hidden">
                {visible.map((evt) => (
                  <span
                    key={evt.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick?.(evt);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onEventClick?.(evt);
                      }
                    }}
                    className={cn(
                      'truncate rounded px-1 py-0.5 text-[10px] leading-tight font-medium cursor-pointer',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      colorForEvent(evt),
                    )}
                    title={evt.title}
                  >
                    {evt.title}
                  </span>
                ))}
                {overflow > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1 py-0 h-4 w-fit"
                    data-testid="Badge__936aad">
                    + {overflow} more
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
