/**
 * ETP-6080 — reports that open the interactive view when the `dynamic-reports` flag is on.
 * Balance Sheet joins when its story lands (plan decision Q4). ETP-6084: Trial Balance joined, with its own
 * contract-declared columns, filters and totals (`tree: 'chart'`).
 */
export const DYNAMIC_REPORT_IDS = Object.freeze(new Set(['profit-loss', 'report-trial-balance']));

/** True when `reportId` has an interactive view and the flag is on. */
export function opensDynamicView(reportId, flagOn) {
  return Boolean(flagOn) && DYNAMIC_REPORT_IDS.has(reportId);
}

/** Result reports, whose tree adds up to income − expenses: they get the KPI strip on top. */
export const RESULT_REPORT_IDS = Object.freeze(new Set(['profit-loss']));
