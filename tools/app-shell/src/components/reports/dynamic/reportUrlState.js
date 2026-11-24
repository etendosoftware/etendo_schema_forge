import { parseCalendarDate, todayCalendarISO } from '@/lib/dateOnly.js';

/**
 * ETP-6239 — the interactive reports' selections in the URL, so F5, a bookmark or a shared link
 * restores them. Engine-level and pure (state ⇄ query string): nothing here names a report. What a
 * report persists is derived from its own definition (`report.parameters`, the contract's):
 *
 *   - `orgId`                    when it declares an org parameter;
 *   - `dateFrom` + `dateTo`      when it declares both as date parameters (written and read as a pair);
 *   - each picker                every visible `search` parameter on a selector the panel offers
 *                                (`PICKER_SELECTORS`), its ids comma-joined;
 *   - `columns`                  when it declares a `columns` parameter (Mes / Trimestre);
 *   - `compare`                  when it declares `compareTo`;
 *   - `splitBy`                  when it declares `splitBy`.
 *
 * ETP-6084: a chart-tree report also persists `groupBy`, its option toggles and `compareMovements` (see `chartSpec`).
 *
 * Only what differs from the default is written, so an untouched period stays out and tomorrow still
 * opens on "1 January to today". The URL is user input: every value is checked and an invalid one is
 * ignored (its default stays). Names of picked items are NOT in the URL (they would be unchecked text
 * shown as a label and printed in the export header): the view resolves them by id.
 */

export const PICKER_SELECTORS = Object.freeze(['bpartner', 'product', 'product-all', 'project', 'costcenter', 'account']);
const ENUMS = {
  compare: ['same-last-year', 'previous'],
  columns: ['month', 'quarter'], // 'total' is the default, never written
  splitBy: ['org', 'bpartner', 'product'],
};
const ID = /^[A-Za-z0-9_-]{1,64}$/;
// Mirrors ReportSelectorsServlet MAX_IDS: the `ids` lookup resolves at most this many, so a filter holds at most this many.
export const MAX_PICKER_IDS = 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The controls `report` offers (the panel shows exactly these, and the URL persists exactly these):
 * ETP-6084: Columnas (month / quarter, ETP-6293) has its own marker, the `columns` parameter, apart from the
 * comparison (`compareTo`): a report can offer the comparison without the period columns. The split is `splitBy`.
 */
export function reportOffers(report) {
  const has = (name) => (report?.parameters || []).some((p) => p.name === name);
  return { columns: has('columns'), compare: has('compareTo'), splitBy: has('splitBy') };
}

/**
 * ETP-6084: what a chart-tree report adds to the URL: its option toggles (with their defaults), the grouping (the
 * values it accepts) and "Comparar también movimientos". Empty for any other report, so the P&L's URL is unchanged.
 */
function chartSpec(report) {
  const params = report?.parameters || [];
  if (report?.tree !== 'chart') return { toggles: [], groupBy: null, movements: false };
  const declared = params.find((p) => p.name === 'groupBy');
  const values = declared && (declared.options ?? params.filter((p) => p.groupByValue).map((p) => ({ value: p.groupByValue }))).map((o) => o.value).filter(Boolean);
  return {
    toggles: params.filter((p) => p.type === 'toggle' && !p.hidden && p.name !== 'compareTo').map((p) => ({ name: p.name, default: p.default === true || p.default === 'true' })),
    groupBy: values ?? null,
    movements: (report.amountColumns || []).some((a) => a.compare === 'optional'),
  };
}

/** What `report` persists, derived from its parameters. */
export function urlStateSpec(report) {
  const params = report?.parameters || [];
  const has = (name) => params.some((p) => p.name === name);
  const isDate = (name) => params.some((p) => p.name === name && p.type === 'date');
  return {
    org: has('orgId'),
    period: isDate('dateFrom') && isDate('dateTo'),
    pickers: params.filter((p) => p.type === 'search' && !p.hidden && PICKER_SELECTORS.includes(p.selector)).map((p) => ({ name: p.name, selector: p.selector })),
    controls: Object.entries(reportOffers(report)).filter(([, on]) => on).map(([key]) => key),
    chart: chartSpec(report),
  };
}

/** Every query-string key `report` owns: what a write clears (and sets back when it differs from the default). */
export function reportUrlKeys(report) {
  const spec = urlStateSpec(report);
  const { toggles, groupBy, movements } = spec.chart;
  return [...(spec.org ? ['orgId'] : []), ...(spec.period ? ['dateFrom', 'dateTo'] : []), ...spec.controls, ...spec.pickers.map((p) => p.name),
    ...(groupBy ? ['groupBy'] : []), ...toggles.map((t) => t.name), ...(movements ? ['compareMovements'] : []),
    // `_display_*` names are neither written nor read (see above); listing them only lets a write drop one an old link carried.
    ...spec.pickers.map((p) => `_display_${p.name}`)];
}

/** A real calendar day `yyyy-MM-dd` (2026-02-30 is not one), or null. */
function validDay(raw) {
  if (!DATE.test(raw ?? '')) return null;
  const d = parseCalendarDate(raw);
  return d && todayCalendarISO(d) === raw ? raw : null;
}

/**
 * The view state patch a query string carries for `report`: only valid values. `orgIds` is the list
 * the org picker can offer; a restored org outside it (unknown, or `0`/`*`) is ignored, so a link
 * can never point the report at an org the user cannot choose.
 */
export function readReportUrlState(search, report, { orgIds = [] } = {}) {
  const spec = urlStateSpec(report);
  const q = new URLSearchParams(search || '');
  return {
    ...readOrg(q, spec, orgIds),
    ...readPeriod(q, spec),
    ...readControls(q, spec, orgIds),
    ...readPickers(q, spec),
    ...readChartOptions(q, spec),
  };
}

function readOrg(q, spec, orgIds) {
  const orgId = q.get('orgId');
  return spec.org && orgId && ID.test(orgId) && new Set(orgIds).has(orgId) ? { orgId } : {};
}

/** A period is both bounds, in order; half of one or a reversed one is ignored as a whole. */
function readPeriod(q, spec) {
  if (!spec.period) return {};
  const from = validDay(q.get('dateFrom'));
  const to = validDay(q.get('dateTo'));
  return from && to && from <= to ? { dateFrom: from, dateTo: to } : {};
}

function readControls(q, spec, orgIds) {
  const patch = {};
  for (const key of spec.controls) {
    const v = q.get(key);
    if (ENUMS[key].includes(v)) patch[key] = v;
  }
  // The Organización split only exists for a role that reaches more than one org (the panel hides it otherwise).
  if (patch.splitBy === 'org' && orgIds.length <= 1) delete patch.splitBy;
  return patch;
}

function readPickers(q, spec) {
  const patch = {};
  for (const { name } of spec.pickers) {
    // A list beyond the cap keeps its first MAX_PICKER_IDS; an invalid id drops the whole value.
    const ids = [...new Set((q.get(name) || '').split(',').filter(Boolean))].slice(0, MAX_PICKER_IDS);
    if (ids.length && ids.every((id) => ID.test(id))) patch[name] = ids.join(',');
  }
  return patch;
}

function readChartOptions(q, spec) {
  const patch = {};
  const { toggles, groupBy, movements } = spec.chart;
  const group = q.get('groupBy');
  if (groupBy && group && groupBy.includes(group)) patch.groupBy = group;
  for (const t of toggles) if (['true', 'false'].includes(q.get(t.name))) patch[t.name] = q.get(t.name) === 'true';
  if (movements && q.get('compareMovements') === 'true') patch.compareMovements = true;
  return patch;
}

/**
 * The query string for `state`: the current `search` with this report's keys replaced by those that
 * differ from `defaults` (`{ orgId, dateFrom, dateTo }`; an empty state date is simply not written).
 * Keys that are not the report's (`report`, `category`) are left as they are.
 */
export function writeReportUrlState(search, state, report, defaults = {}) {
  const spec = urlStateSpec(report);
  const q = new URLSearchParams(search || '');
  for (const key of reportUrlKeys(report)) q.delete(key);
  const put = (key, value, def = '') => { if (value && value !== def) q.set(key, value); };
  if (spec.org) put('orgId', state.orgId, defaults.orgId);
  if (periodDiffersFromDefault(spec, state, defaults)) {
    q.set('dateFrom', state.dateFrom);
    q.set('dateTo', state.dateTo);
  }
  for (const key of spec.controls) put(key, state[key], key === 'columns' ? 'total' : '');
  for (const { name } of spec.pickers) put(name, state[name]);
  if (spec.chart.groupBy) put('groupBy', state.groupBy);
  for (const t of spec.chart.toggles) if (t.name in state && Boolean(state[t.name]) !== t.default) q.set(t.name, String(Boolean(state[t.name])));
  if (spec.chart.movements && state.compareMovements) q.set('compareMovements', 'true');
  const out = q.toString();
  return out ? `?${out}` : '';
}

/** Both bounds set and not the defaults: the only case in which the period is written. */
function periodDiffersFromDefault(spec, state, defaults) {
  if (!spec.period || !state.dateFrom || !state.dateTo) return false;
  return !(state.dateFrom === defaults.dateFrom && state.dateTo === defaults.dateTo);
}
