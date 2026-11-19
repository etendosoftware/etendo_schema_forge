/**
 * Pure helpers of `DateTimeField` (date-time-field.jsx), kept apart so `node --test` can run them
 * (same split as app-shell-core's `date-field.jsx` → `lib/dateMask.js`).
 *
 * The value contract is a WALL-CLOCK string, `yyyy-MM-ddTHH:mm` (seconds optional on input,
 * always `:00` on output) — the NeoDateFormat convention (ETP-5100). Nothing here goes through
 * `new Date(string)` or UTC: the text is split and rebuilt, so the minute shown is the minute
 * stored, whatever the viewer's timezone.
 *
 * The date part follows the locale pattern of DateField (`getDatePattern`, `formatDateInput`,
 * `parseDateInput` from app-shell-core `lib/dateMask.js`), so `es-ES` reads `19/11/2026 14:20`.
 */
import { formatDateInput, parseDateInput } from '@etendosoftware/app-shell-core/lib/dateMask.js';

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** `{ date: 'yyyy-MM-dd', time: 'HH:mm' }` of a wall-clock value, or null. */
export function splitWallClock(value) {
  const m = typeof value === 'string' ? WALL_CLOCK_RE.exec(value.trim()) : null;
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` } : null;
}

/** `yyyy-MM-ddTHH:mm:00` from a `yyyy-MM-dd` day and an `HH:mm` time, or null. */
export function joinWallClock(date, time) {
  const t = TIME_RE.exec(time ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !t) return null;
  return `${date}T${pad2(t[1])}:${t[2]}:00`;
}

/** The day of a `yyyy-MM-dd` string in the locale pattern (`19/11/2026`). */
function formatDatePart(isoDate, pattern) {
  const [y, m, d] = isoDate.split('-');
  const parts = { day: d, month: m, year: y };
  return pattern.order.map((seg) => parts[seg]).join(pattern.sep);
}

/** Display text of a wall-clock value: `dd/MM/yyyy HH:mm` (locale date order); '' when empty. */
export function formatDateTimeText(value, pattern) {
  const parts = splitWallClock(value);
  return parts ? `${formatDatePart(parts.date, pattern)} ${parts.time}` : '';
}

/**
 * Masks typed text to `<date> HH:mm`: only digits are kept (at most 12), the date separators and
 * the space and colon are inserted as the user types, so the separators never have to be typed.
 */
export function maskDateTimeInput(raw, pattern) {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 12);
  const datePart = formatDateInput(digits.slice(0, 8), pattern);
  const timeDigits = digits.slice(8);
  if (!timeDigits) return datePart;
  const time = timeDigits.length > 2 ? `${timeDigits.slice(0, 2)}:${timeDigits.slice(2)}` : timeDigits;
  return `${datePart} ${time}`;
}

/**
 * Parses typed text. `{ ok: true, value: '' }` when empty, `{ ok: true, value:
 * 'yyyy-MM-ddTHH:mm:00' }` for a real day and a valid 24h time, `{ ok: false }` otherwise.
 */
export function parseDateTimeText(text, pattern) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { ok: true, value: '' };
  const [datePart, timePart, ...rest] = trimmed.split(/\s+/);
  if (rest.length || !timePart) return { ok: false };
  const date = parseDateInput(datePart, pattern);
  if (!date.ok || !date.iso) return { ok: false };
  const value = joinWallClock(date.iso, timePart);
  return value ? { ok: true, value } : { ok: false };
}

/** Whether wall-clock `value` is later than wall-clock `max` (to the minute). Null-safe. */
export function isAfterMax(value, max) {
  const a = splitWallClock(value);
  const b = splitWallClock(max);
  if (!a || !b) return false;
  return `${a.date}T${a.time}` > `${b.date}T${b.time}`;
}

/** The browser's current minute as a wall-clock value (fallback "now" when no `max` is given). */
export function localNowWallClock(reference = new Date()) {
  return `${reference.getFullYear()}-${pad2(reference.getMonth() + 1)}-${pad2(reference.getDate())}`
    + `T${pad2(reference.getHours())}:${pad2(reference.getMinutes())}:00`;
}

/** Placeholder of the field: the locale date hint plus ` hh:mm` (`dd/mm/aaaa hh:mm`). */
export function buildDateTimePlaceholder(pattern, localeStr) {
  const yearLabel = String(localeStr || '').toLowerCase().startsWith('es') ? 'aaaa' : 'yyyy';
  const labels = { day: 'dd', month: 'mm', year: yearLabel };
  return `${pattern.order.map((seg) => labels[seg]).join(pattern.sep)} hh:mm`;
}
