/**
 * ETP-6365 — Currency Conversion: pure helpers (no React, no `@/` imports, so `node --test` can
 * load them). Wall-clock datetimes, rate formatting inputs, the history period bounds, the NEO
 * criteria of the history list and its grouping.
 *
 * ## Datetimes are server-local WALL CLOCK
 *
 * NEO answers `validFromDate` / `validToDate` as `yyyy-MM-ddTHH:mm:ss` with no offset
 * (NeoDateFormat convention, ETP-5100): the wall clock of the Etendo server. They are read and
 * written as TEXT here — never through `new Date(string)`, whose UTC/local reinterpretation
 * would shift the minute (or the day) by the viewer's offset. Ordering two such strings is a
 * plain string comparison: the format is fixed-width and big-endian.
 */

/** A validity end at or after this year means "no end date" (the open range, `9999-12-31`). */
export const OPEN_END_YEAR = 2999;

/** Rows per currency the history shows until the user asks for all of them. */
export const RECENT_ROWS_PER_CURRENCY = 3;

/** Upper bound of one history read; the history is grouped client-side from a single read. */
export const HISTORY_MAX_ROWS = 5000;

/** `etgoRateStatus` values (computed by the backend). */
export const RATE_STATUS = Object.freeze({ CURRENT: 'CURRENT', POSTED: 'POSTED', UNUSED: 'UNUSED' });

/** Period filter ids of the history. */
export const PERIODS = Object.freeze(['last30', 'thisMonth', 'thisYear', 'custom']);
export const DEFAULT_PERIOD = 'last30';

/** Origin filter ids of the history. `auto` is `sMFCRSynced = true`. */
export const ORIGINS = Object.freeze(['all', 'auto', 'manual']);

/** Status filter ids of the history (`all` plus every `RATE_STATUS`). */
export const STATUSES = Object.freeze(['all', RATE_STATUS.CURRENT, RATE_STATUS.UNUSED, RATE_STATUS.POSTED]);

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Splits a wall-clock string into its numeric parts, ignoring any trailing fraction or zone.
 *
 * @param {string|null|undefined} raw
 * @returns {{year:number,month:number,day:number,hour:number,minute:number}|null}
 */
export function parseWallClock(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(WALL_CLOCK_RE);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? 0),
    minute: Number(m[5] ?? 0),
  };
}

/** `yyyy-MM-ddTHH:mm:00` from parts — the format sent to NEO. */
export function toWallClock({ year, month, day, hour = 0, minute = 0 }) {
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00`;
}

/** `yyyy-MM-dd` part of a wall-clock value (or of a date-only value). */
export function wallClockDate(raw) {
  const p = parseWallClock(raw);
  return p ? `${p.year}-${pad2(p.month)}-${pad2(p.day)}` : '';
}

/** `HH:mm` part of a wall-clock value. */
export function wallClockTime(raw) {
  const p = parseWallClock(raw);
  return p ? `${pad2(p.hour)}:${pad2(p.minute)}` : '';
}

/** `dd/MM/yyyy` of a wall-clock (or date-only) value; '' when unparseable. */
export function formatWallClockDate(raw) {
  const p = parseWallClock(raw);
  return p ? `${pad2(p.day)}/${pad2(p.month)}/${p.year}` : '';
}

/** `dd/MM/yyyy HH:mm` of a wall-clock value; '' when unparseable. */
export function formatWallClock(raw) {
  const p = parseWallClock(raw);
  return p ? `${formatWallClockDate(raw)} ${pad2(p.hour)}:${pad2(p.minute)}` : '';
}

/**
 * The browser's current minute as a wall-clock string (seconds dropped), the default of
 * "Válido desde". Built from LOCAL getters, never `toISOString()` (UTC).
 *
 * @param {Date} [reference]
 */
export function nowWallClock(reference = new Date()) {
  return toWallClock({
    year: reference.getFullYear(),
    month: reference.getMonth() + 1,
    day: reference.getDate(),
    hour: reference.getHours(),
    minute: reference.getMinutes(),
  });
}

/** True when the validity end is missing or is the open range (year >= {@link OPEN_END_YEAR}). */
export function isOpenEnded(validTo) {
  const p = parseWallClock(validTo);
  return !p || p.year >= OPEN_END_YEAR;
}

/**
 * The "Válido hasta" text of a history row.
 *
 * - open range (or none) → `null` (the caller shows «—»);
 * - automatic (downloaded, `sMFCRSynced`) row whose end is stored at `00:00` of a day on or
 *   after its start → that day at `23:59`. The downloader stores each daily range closing at
 *   00:00 of the same day (`17/11 00:00 → 17/11 00:00`), which reads as a zero-length range;
 *   the range really covers the whole day, so it is shown as `17/11/2026 23:59`;
 * - anything else → the stored end as is (manual ranges are closed at `start − 1 minute` by
 *   the server, e.g. `18/11/2026 14:29`).
 *
 * @param {{validFromDate?: string, validToDate?: string, sMFCRSynced?: boolean}} row
 * @returns {string|null}
 */
export function displayValidTo(row) {
  if (!row || isOpenEnded(row.validToDate)) return null;
  const to = parseWallClock(row.validToDate);
  if (row.sMFCRSynced === true && to.hour === 0 && to.minute === 0
      && wallClockDate(row.validToDate) >= wallClockDate(row.validFromDate)) {
    return `${formatWallClockDate(row.validToDate)} 23:59`;
  }
  return formatWallClock(row.validToDate);
}

function calendarISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysISO(iso, days) {
  const p = parseWallClock(iso);
  if (!p) return null;
  // Local-time constructor: rolls month/year over and is DST-immune.
  return calendarISO(new Date(p.year, p.month - 1, p.day + days));
}

/**
 * Datetime bounds `[from, to)` of a history period, as wall-clock strings. A day is
 * `[D 00:00, D+1 00:00)`, so the end of a range is the START of the day after its last day.
 *
 * @param {string} period one of {@link PERIODS}
 * @param {{from?: string, to?: string}} [custom] `yyyy-MM-dd` days of the custom range
 * @param {Date} [reference] "today"
 * @returns {{from: string|null, to: string|null}}
 */
export function periodBounds(period, custom = {}, reference = new Date()) {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  const todayIso = calendarISO(reference);
  let fromIso = null;
  let toIso = null;
  if (period === 'last30') {
    fromIso = addDaysISO(todayIso, -29);
    toIso = addDaysISO(todayIso, 1);
  } else if (period === 'thisMonth') {
    fromIso = calendarISO(new Date(y, m, 1));
    toIso = calendarISO(new Date(y, m + 1, 1));
  } else if (period === 'thisYear') {
    fromIso = calendarISO(new Date(y, 0, 1));
    toIso = calendarISO(new Date(y + 1, 0, 1));
  } else if (period === 'custom') {
    fromIso = custom.from ? wallClockDate(custom.from) || null : null;
    toIso = custom.to ? addDaysISO(custom.to, 1) : null;
  }
  return {
    from: fromIso ? `${fromIso}T00:00:00` : null,
    to: toIso ? `${toIso}T00:00:00` : null,
  };
}

/**
 * NEO criteria of the history list. Only FORWARD rows are listed (`currency` = the
 * organization currency); the inverse row of each period is never shown, its value is the
 * forward row's `divideRateBy`. Every filter is a real column, so it runs in the backend.
 *
 * @param {object} filters
 * @param {string|null} filters.orgCurrencyId
 * @param {string|null} [filters.currencyId] `toCurrency` filter (null = all)
 * @param {string} [filters.origin] one of {@link ORIGINS}
 * @param {string} [filters.status] one of {@link STATUSES}
 * @param {{from: string|null, to: string|null}} [filters.bounds] from {@link periodBounds}
 * @returns {Array<object>}
 */
export function buildHistoryCriteria({ orgCurrencyId, currencyId, origin = 'all', status = 'all', bounds }) {
  const criteria = [];
  if (orgCurrencyId) criteria.push({ fieldName: 'currency', operator: 'equals', value: orgCurrencyId });
  if (currencyId) criteria.push({ fieldName: 'toCurrency', operator: 'equals', value: currencyId });
  if (origin === 'auto') criteria.push({ fieldName: 'sMFCRSynced', operator: 'equals', value: true });
  if (origin === 'manual') criteria.push({ fieldName: 'sMFCRSynced', operator: 'equals', value: false });
  if (status && status !== 'all') criteria.push({ fieldName: 'etgoRateStatus', operator: 'equals', value: status });
  if (bounds?.from) criteria.push({ fieldName: 'validFromDate', operator: 'greaterOrEqual', value: bounds.from });
  if (bounds?.to) criteria.push({ fieldName: 'validFromDate', operator: 'lessThan', value: bounds.to });
  return criteria;
}

/** Query string of the history read: every matching forward row, newest first. */
export function buildHistoryQuery(criteria) {
  const params = new URLSearchParams({
    _startRow: '0',
    _endRow: String(HISTORY_MAX_ROWS),
    _sortBy: '-validFromDate',
  });
  if (criteria?.length) params.set('criteria', JSON.stringify(criteria));
  return params.toString();
}

/** Whether the hover actions (Modificar / Eliminar) apply: manual and not locked by accounting. */
export function isEditableRate(row) {
  return Boolean(row) && row.sMFCRSynced !== true && row.etgoUsedInAccounting !== true;
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Groups forward rows by destination currency, in the order of `currencyOrder` (the "Vigentes
 * hoy" cards) and then by ISO code. Inside each group the rows are newest first; `visible` is
 * the slice to render: the {@link RECENT_ROWS_PER_CURRENCY} most recent unless `showAll`, then
 * ordered by `sort` (`{key, direction}`).
 *
 * @param {Array<object>} rows
 * @param {object} [opts]
 * @param {string[]} [opts.currencyOrder] currency ids in display order
 * @param {boolean} [opts.showAll]
 * @param {{key: string, direction: 'asc'|'desc'}} [opts.sort]
 * @returns {Array<{currencyId: string, identifier: string, rows: object[], visible: object[]}>}
 */
export function groupRatesByCurrency(rows, { currencyOrder = [], showAll = false, sort } = {}) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const id = row.toCurrency;
    if (!groups.has(id)) groups.set(id, { currencyId: id, identifier: row['toCurrency$_identifier'] ?? '', rows: [] });
    groups.get(id).rows.push(row);
  }
  const rank = (id) => {
    const i = currencyOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const ordered = [...groups.values()].sort((a, b) => (rank(a.currencyId) - rank(b.currencyId))
    || a.identifier.localeCompare(b.identifier));
  for (const group of ordered) {
    group.rows.sort((a, b) => compareValues(b.validFromDate, a.validFromDate));
    const slice = showAll ? [...group.rows] : group.rows.slice(0, RECENT_ROWS_PER_CURRENCY);
    if (sort?.key) {
      const sign = sort.direction === 'asc' ? 1 : -1;
      slice.sort((a, b) => sign * compareValues(a[sort.key], b[sort.key]));
    }
    group.visible = slice;
  }
  return ordered;
}

/** Whether any group has more rows than the recent slice shows. */
export function hasHiddenRows(groups) {
  return (groups ?? []).some((g) => g.rows.length > RECENT_ROWS_PER_CURRENCY);
}
