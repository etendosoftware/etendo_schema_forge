/**
 * Pure month-grid helpers for the Unified Calendar PoC.
 *
 * Every date-only value is parsed with `parseCalendarDate`, so a `yyyy-MM-dd`
 * string is never read as UTC midnight and shifted a day back west of UTC.
 */
import { parseCalendarDate } from '@/lib/dateOnly.js';

/** `yyyy-MM-dd` key of a local Date. */
export function toDateKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** First day of the month containing `date`. */
export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/**
 * 6 x 7 grid of local Dates for the month of `monthDate`, starting on Monday.
 * Leading/trailing cells belong to the adjacent months.
 */
export function buildMonthGrid(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const weeks = [];
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(new Date(year, month, 1 - startDow + w * 7 + d));
    }
    weeks.push(week);
  }
  return weeks;
}

/** `{ from, to }` local Dates covering every cell of the grid (inclusive). */
export function gridRange(weeks) {
  const last = weeks[weeks.length - 1];
  return { from: weeks[0][0], to: last[last.length - 1] };
}

/** True when the event's [date, endDate] span overlaps [from, to] (all inclusive). */
export function eventOverlapsRange(event, from, to) {
  const start = parseCalendarDate(event.date);
  if (!start) return false;
  const end = parseCalendarDate(event.endDate) ?? start;
  return start <= to && end >= from;
}

/**
 * Whole calendar days from `a` to `b` (local Dates). Computed on the UTC
 * projection of each local calendar day, so a DST change in between cannot
 * turn 23 or 25 hours into a wrong day count.
 */
export function calendarDayDiff(a, b) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

function lowestFreeLane(occupied, cols) {
  let lane = 0;
  while (cols.some((col) => occupied[col].has(lane))) lane += 1;
  return lane;
}

/**
 * Lays out the events of one week row, Google-Calendar style.
 *
 * Every event that overlaps the week becomes ONE segment, clipped to the week:
 *   { event, startCol, span, lane, continuesBefore, continuesAfter }
 * `startCol` is 0..6 (Monday first), `span` the number of columns it covers,
 * `continuesBefore/After` tell whether the real event extends past the week edge.
 *
 * Lanes: multi-day events are placed first (earliest start, then longest
 * overall, then longest within the week) and keep the same lane on every day
 * they cover; single-day events then fill the lowest free lane of their day.
 * So a single-day event can never push a spanning bar down on one of its days.
 */
export function layoutWeekEvents(week, events) {
  const weekStart = week[0];
  const lastCol = week.length - 1;
  const spanning = [];
  const single = [];

  for (const event of events) {
    const start = parseCalendarDate(event.date);
    if (!start) continue;
    const parsedEnd = parseCalendarDate(event.endDate);
    const end = parsedEnd && parsedEnd > start ? parsedEnd : start;
    const fromCol = calendarDayDiff(weekStart, start);
    const toCol = calendarDayDiff(weekStart, end);
    if (toCol < 0 || fromCol > lastCol) continue;
    const startCol = Math.max(0, fromCol);
    const endCol = Math.min(lastCol, toCol);
    const item = {
      event,
      startCol,
      span: endCol - startCol + 1,
      continuesBefore: fromCol < 0,
      continuesAfter: toCol > lastCol,
      fromCol,
      totalDays: toCol - fromCol + 1,
    };
    (item.totalDays > 1 ? spanning : single).push(item);
  }

  spanning.sort((a, b) => a.fromCol - b.fromCol || b.totalDays - a.totalDays || b.span - a.span);

  const occupied = week.map(() => new Set());
  const segments = [];
  for (const { fromCol, totalDays, ...segment } of [...spanning, ...single]) {
    const cols = Array.from({ length: segment.span }, (_, i) => segment.startCol + i);
    const lane = lowestFreeLane(occupied, cols);
    cols.forEach((col) => occupied[col].add(lane));
    segments.push({ ...segment, lane });
  }
  return segments;
}

/**
 * Counts how many segments cover each day column of a week.
 */
function countSegmentsPerDay(segments, columns) {
  const perDay = Array.from({ length: columns }, () => 0);
  for (const seg of segments) {
    for (let c = seg.startCol; c < seg.startCol + seg.span; c += 1) perDay[c] += 1;
  }
  return perDay;
}

/**
 * Cuts one segment into the pieces visible under the per-day lane limit, and
 * counts every day it is hidden on into `hidden`. A cut edge is marked as
 * continuing, like a week edge.
 */
function splitSegmentIntoVisiblePieces(seg, laneLimit, hidden) {
  const pieces = [];
  const end = seg.startCol + seg.span;
  let runStart = null;
  // One step past the segment end closes the last open run.
  for (let c = seg.startCol; c <= end; c += 1) {
    const visible = c < end && seg.lane < laneLimit[c];
    if (c < end && !visible) hidden[c] += 1;
    if (visible && runStart === null) runStart = c;
    if (!visible && runStart !== null) {
      pieces.push({
        ...seg,
        startCol: runStart,
        span: c - runStart,
        continuesBefore: runStart > seg.startCol || seg.continuesBefore,
        continuesAfter: c < end || seg.continuesAfter,
      });
      runStart = null;
    }
  }
  return pieces;
}

/**
 * Applies the per-day lane limit to a week layout.
 *
 * A day with at most `maxLanes` events shows them all; a day with more shows
 * `maxLanes - 1` lanes and a "+N more" marker in the last one, where N counts
 * every hidden event of that day, spanning bars included. A segment visible on
 * some of its days and hidden on others is cut into visible pieces; a cut edge
 * is marked as continuing so it renders square, like a week edge.
 *
 * Returns { pieces: segment[], overflow: [{ col, count }] }.
 */
export function clipWeekToLanes(segments, maxLanes, columns = 7) {
  const perDay = countSegmentsPerDay(segments, columns);
  const laneLimit = perDay.map((count) => (count > maxLanes ? maxLanes - 1 : maxLanes));
  const hidden = Array.from({ length: columns }, () => 0);
  const pieces = [];

  for (const seg of segments) {
    pieces.push(...splitSegmentIntoVisiblePieces(seg, laneLimit, hidden));
  }

  const overflow = hidden
    .map((count, col) => ({ col, count }))
    .filter(({ count }) => count > 0);
  return { pieces, overflow };
}
