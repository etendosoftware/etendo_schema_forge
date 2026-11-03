/**
 * ETP-6080 — reports that open the interactive view when the `dynamic-reports` flag is on.
 * Balance Sheet and Trial Balance join when their stories land (plan decision Q4).
 */
export const DYNAMIC_REPORT_IDS = Object.freeze(new Set(['profit-loss']));

/** True when `reportId` has an interactive view and the flag is on. */
export function opensDynamicView(reportId, flagOn) {
  return Boolean(flagOn) && DYNAMIC_REPORT_IDS.has(reportId);
}
