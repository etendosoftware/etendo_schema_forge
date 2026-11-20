/**
 * ETP-6080 — reports that open the interactive view when the `dynamic-reports` flag is on.
 * ETP-6084: Trial Balance joined, with its own contract-declared columns, filters and totals (`tree: 'chart'`).
 * ETP-6083: Balance Sheet joined: a balance at a date on the period tree, all from its contract (`dateFrom.role`, `dateTo.shortcuts`,
 * `compareTo.compareModes`, `accountLevel` options with `maxIndent`, `balanceCheck`).
 */
import { DYNAMIC_REPORTS, DYNAMIC_BALANCE_REPORTS } from '@/lib/flags/flag-keys.js';

/** Each interactive report and the flag that opens it: the P&L on `dynamic-reports`, the two balances on their own. */
const REPORT_FLAG = Object.freeze({
  'profit-loss': DYNAMIC_REPORTS,
  'report-trial-balance': DYNAMIC_BALANCE_REPORTS,
  'balance-sheet': DYNAMIC_BALANCE_REPORTS,
});

export const DYNAMIC_REPORT_IDS = Object.freeze(new Set(Object.keys(REPORT_FLAG)));

/**
 * Reports that need a descriptor carrying `tree: 'chart'` (core that forwards it): against an older core the
 * descriptor lacks it and the view would open broken, so they keep the old viewer.
 */
const NEEDS_CHART_TREE = Object.freeze(new Set(['report-trial-balance']));

/** True when `reportId` has an interactive view and its flag is on. `flags`: flag key → on; `report` is its descriptor. */
export function opensDynamicView(reportId, flags, report = null) {
  if (!DYNAMIC_REPORT_IDS.has(reportId) || !flags?.[REPORT_FLAG[reportId]]) return false;
  return !NEEDS_CHART_TREE.has(reportId) || report?.tree === 'chart';
}

/** Result reports, whose tree adds up to income − expenses: they get the KPI strip on top. */
export const RESULT_REPORT_IDS = Object.freeze(new Set(['profit-loss']));
