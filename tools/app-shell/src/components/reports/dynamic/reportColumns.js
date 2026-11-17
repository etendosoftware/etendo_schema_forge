import { formatCalendarDate, formatCalendarMonthShort, formatCalendarQuarterShort } from '@/lib/dateOnly.js';
import { buildPeriodValues, EXPORT_MAX_BUCKETS } from '@etendosoftware/schema-forge-cli/src/report-periods.js';
import { comparedRanges, serializePeriods } from './dynamicDates.js';

/**
 * ETP-6239 — the columns of the interactive report: one group per period (bucket 0, the range,
 * last), each `Importe` alone or with `Comparado`, `Var. €` and `Var. %`. Pure, so it is unit-tested
 * apart from the table.
 */

/** The panel's comparison value → the engine's mode (`cells[i][mode]`, `visible[mode]`). */
const MODES = { '': 'none', 'same-last-year': 'sly', previous: 'prev' };
export const modeOf = (compare) => MODES[compare] ?? 'none';

export const COLUMN_GRAINS = Object.freeze(['total', 'month', 'quarter']);
/** Periods the screen and the PDF show besides the range; Excel / CSV print every one. */
export const SCREEN_PERIODS = Object.freeze({ month: 6, quarter: 4 });
/**
 * Excel / CSV refusal: asks the server's own validator (core report-periods.js, D5), so the cap can
 * never drift from it. `plan` is `periodBuckets(range, grain)`.
 */
export function exportTooLong(plan, grain) {
  if (!plan) return false;
  try {
    buildPeriodValues(serializePeriods(plan.buckets), { maxBuckets: EXPORT_MAX_BUCKETS, capRange: true, grain, hiddenCount: plan.hiddenCount });
    return false;
  } catch {
    // Any refusal is a 400 from the server (a very long range also trips its request-size check, INVALID_PERIODS).
    return true;
  }
}

const COLUMNS_WITH_COMPARISON = ['current', 'compared', 'variation', 'variationPct'];

/**
 * The column groups of a result. `periods` are the answer's (`{idx, dateFrom, dateTo, partial}`),
 * `grain` the `columns` the answer was asked with. Each group: `pos` (its index in `row.cells`),
 * `label` (short, `*` when partial), `partial`, `current` (its range), `compared` (the range the
 * comparison reads, null without one), `comparedLabel` (what Comparado is compared against: the
 * compared month / quarter's short label, or for the Total group and Total mode the compared
 * range's dates; '' without a comparison) and `columns` (the sub-columns it shows).
 */
export function columnModel({ periods, grain, mode, locale, quarterPrefix, totalLabel }) {
  const lang = (locale || 'en_US').replace('_', '-');
  const short = (p) => (grain === 'quarter' ? formatCalendarQuarterShort(p.dateFrom, quarterPrefix) : formatCalendarMonthShort(p.dateFrom, lang));
  const comparedLabelOf = (p, compared) => {
    if (!compared) return '';
    if (grain === 'total' || p.idx === 0) return `${formatCalendarDate(compared.from, lang)} – ${formatCalendarDate(compared.to, lang)}`;
    return short({ dateFrom: compared.from });
  };
  const groups = (periods || []).map((p, pos) => {
    const partialMark = p.partial ? '*' : '';
    const label = p.idx === 0 ? totalLabel : `${short(p)}${partialMark}`;
    const compared = mode === 'none' ? null : comparedRanges(p, grain)[mode];
    return {
      pos,
      label,
      partial: Boolean(p.partial),
      current: { from: p.dateFrom, to: p.dateTo },
      compared,
      comparedLabel: comparedLabelOf(p, compared),
      columns: mode === 'none' ? ['current'] : COLUMNS_WITH_COMPARISON,
    };
  });
  // The range's total goes last on screen ("se agrega al final la columna de total"); `pos` still indexes `row.cells`.
  return [...groups.slice(1), ...groups.slice(0, 1)];
}

/** How many table columns after Concepto the groups take. */
export const columnCount = (groups) => groups.reduce((n, g) => n + g.columns.length, 0);

/** A row (or a split part) without `cells` — the answer of a request with no `periods` — as one cell. */
const cellsOf = (r) => r.cells ?? [{
  amount: r.amount,
  sly: { amount: r.amount_ref, variationAmount: r.variationAmount, variationPct: r.variationPct, trend: r.trend },
  prev: { amount: r.amount_ref, variationAmount: r.variationAmount, variationPct: r.variationPct, trend: r.trend },
}];

/** One cell as the table reads it for a mode: the amount, and the compared amount with its variation. */
export function cellParts(row, pos, mode) {
  const cell = cellsOf(row)[pos];
  const ref = mode === 'none' ? null : cell?.[mode];
  return { amount: cell?.amount ?? 0, compared: ref?.amount ?? 0, variationAmount: ref?.variationAmount, variationPct: ref?.variationPct, trend: ref?.trend };
}

/**
 * The tree rows a comparison mode shows: `visible[mode]` rows, each parented to its nearest ancestor
 * visible in that mode (`parentIds[mode]`), with the top-level fields (`amount`, `amount_ref`, the
 * variation) read from the mode's `cells[0]`, so the KPIs and the bars need no change. Switching
 * mode is this, never a new request.
 */
export function rowsForMode(rows, mode) {
  return (rows || []).filter((r) => r.visible?.[mode] ?? true).map((r) => {
    const first = cellParts(r, 0, mode);
    return {
      ...r,
      cells: cellsOf(r),
      parentId: r.parentIds ? r.parentIds[mode] : r.parentId,
      amount: first.amount,
      amount_ref: first.compared,
      variationAmount: first.variationAmount,
      variationPct: first.variationPct,
      trend: first.trend,
    };
  });
}
