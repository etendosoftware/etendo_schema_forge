import { getDateBounds, toDateParam } from '@/lib/dateRangeBounds';
import { parseCalendarDate } from '@/lib/dateOnly';

/**
 * Filter state of the Not Posted Documents page (ETP-5591): its defaults, its URL form and
 * the backend query it produces. Pure functions, no React, so every rule here is unit-tested
 * on its own.
 *
 * The filters live in the URL (`?document=SI&status=N,E&date=last30`) rather than in component
 * state, which is what makes the toolbar's "Share" button meaningful (it copies the address)
 * and keeps the filters when the user opens a document and comes back with the browser's Back.
 */

/**
 * The statuses the page offers, in the order the design lists them (yellow → orange →
 * red). The design had four; ETP-5591 QA added "Coste no calculado" (`NC`), which the backend
 * had never requested, so goods receipts stuck on an uncalculated cost never appeared. Each one is a URL `token` and the backend `keys` it stands for: "Error" covers both
 * `E` and `C` (Error, no cost), which the backend's own filter option already merges as the
 * value `"E,C"`. That composite value is why the URL does not store backend values: `N,E,C`
 * could not be split back into options.
 *
 * Labels are the page's own i18n keys, in the design's sentence case, not the AD's Title Case
 * translations ("Cuenta No Válida"). The badge tones are the design's.
 *
 * `error: true` marks the statuses the "Todos los errores" shortcut selects: every status that
 * means a posting attempt FAILED, i.e. all but "No contabilizado" (never attempted).
 */
export const STATUS_DEFS = [
  { token: 'N', keys: ['N'], labelKey: 'notPostedStatusUnposted', variant: 'yellow', error: false },
  { token: 'p', keys: ['p'], labelKey: 'postedStatusPeriodClosed', variant: 'orange', error: true },
  { token: 'i', keys: ['i'], labelKey: 'notPostedStatusInvalidAccount', variant: 'red', error: true },
  { token: 'NC', keys: ['NC'], labelKey: 'postedStatusCostNotCalculated', variant: 'red', error: true },
  { token: 'E', keys: ['E', 'C'], labelKey: 'notPostedStatusError', variant: 'red', error: true },
];

/** The status tokens "Todos los errores" stands for. */
export const ERROR_TOKENS = STATUS_DEFS.filter((def) => def.error).map((def) => def.token);

/**
 * Pseudo-option of the status dropdown: ticking it selects every {@link ERROR_TOKENS} status,
 * unticking it clears them. It is never stored in the filters or the URL — it is ticked exactly
 * when all the error statuses are.
 */
export const ALL_ERRORS_TOKEN = 'errors';

/** Whether a status selection includes every error status. */
export function hasAllErrors(statuses) {
  return ERROR_TOKENS.every((token) => statuses.includes(token));
}

/**
 * Applies a change reported by the status dropdown, whose options are the statuses plus the
 * {@link ALL_ERRORS_TOKEN} pseudo-option. Returns the new status tokens in canonical order.
 *
 * @param {string[]} previous the current status tokens (no pseudo-option)
 * @param {string[]} next what the dropdown reported (may include the pseudo-option)
 */
export function applyStatusSelection(previous, next) {
  const hadAll = hasAllErrors(previous);
  const hasAll = next.includes(ALL_ERRORS_TOKEN);
  let tokens = next.filter((token) => token !== ALL_ERRORS_TOKEN);
  if (hasAll && !hadAll) tokens = [...tokens, ...ERROR_TOKENS];
  else if (!hasAll && hadAll) tokens = tokens.filter((token) => !ERROR_TOKENS.includes(token));
  return STATUS_DEFS.map((def) => def.token).filter((token) => tokens.includes(token));
}

const STATUS_BY_TOKEN = new Map(STATUS_DEFS.map((def) => [def.token, def]));
const STATUS_BY_KEY = new Map(STATUS_DEFS.flatMap((def) => def.keys.map((key) => [key, def])));

/** The status definition a row's raw `accountingStatus` key belongs to, or `null`. */
export function statusDefForKey(key) {
  return (key && STATUS_BY_KEY.get(key)) || null;
}

/** The status definition for a URL / filter token, or `null`. */
export function statusDefForToken(token) {
  return STATUS_BY_TOKEN.get(token) || null;
}

const DEFAULT_PRESET = 'last12m';
const DATE_ALL = 'all';
const CUSTOM_RANGE_SEPARATOR = '_';

/** What the page opens with, and what "Limpiar filtros" returns to. */
export function defaultFilters() {
  return { document: null, statuses: [], date: { presetId: DEFAULT_PRESET } };
}

export function isDefaultFilters(filters) {
  return !filters.document
    && filters.statuses.length === 0
    && filters.date?.presetId === DEFAULT_PRESET;
}

function parseDate(raw) {
  if (raw == null) return { presetId: DEFAULT_PRESET };
  if (raw === DATE_ALL) return null;
  const parts = raw.split(CUSTOM_RANGE_SEPARATOR);
  if (parts.length === 2) {
    const from = parseCalendarDate(parts[0]);
    const to = parseCalendarDate(parts[1]);
    if (from && to) return { from, to };
    return { presetId: DEFAULT_PRESET };
  }
  // A preset id; an unknown one resolves to no bounds in `getDateBounds`, so fall back to
  // the default rather than silently showing every date.
  return getDateBounds({ presetId: raw }).from ? { presetId: raw } : { presetId: DEFAULT_PRESET };
}

/** URL search params → filters. Unknown or malformed values fall back to the defaults. */
export function parseFilters(searchParams) {
  const statuses = (searchParams.get('status') || '')
    .split(',')
    .filter((token) => STATUS_BY_TOKEN.has(token));
  return {
    document: searchParams.get('document') || null,
    statuses: [...new Set(statuses)],
    date: parseDate(searchParams.get('date')),
  };
}

function serializeDate(date) {
  if (!date) return DATE_ALL;
  if ('presetId' in date) return date.presetId === DEFAULT_PRESET ? null : date.presetId;
  const from = toDateParam(date.from);
  const to = toDateParam(date.to);
  return from && to ? `${from}${CUSTOM_RANGE_SEPARATOR}${to}` : null;
}

/** Filters → URL search params. Default values are left out, so the bare URL is the default. */
export function serializeFilters(filters) {
  const params = new URLSearchParams();
  if (filters.document) params.set('document', filters.document);
  if (filters.statuses.length > 0) params.set('status', filters.statuses.join(','));
  const date = serializeDate(filters.date);
  if (date) params.set('date', date);
  return params;
}

/**
 * Filters → the rows request's query string. Only the filters that are set are sent; no
 * statuses means the backend's own default set (the four above). Dates are local calendar
 * days (`toDateParam`), never `toISOString()`, which would shift them across UTC.
 */
export function buildRowsQuery(filters) {
  const params = new URLSearchParams();
  if (filters.document) params.set('document', filters.document);
  const keys = filters.statuses.flatMap((token) => statusDefForToken(token)?.keys ?? []);
  if (keys.length > 0) params.set('accountingStatus', keys.join(','));
  const { from, to } = getDateBounds(filters.date);
  const dateFrom = toDateParam(from);
  const dateTo = toDateParam(to);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  return params.toString();
}
