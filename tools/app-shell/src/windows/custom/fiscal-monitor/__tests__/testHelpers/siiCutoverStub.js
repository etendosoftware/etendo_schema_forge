// Shared stub for the `SII_DATE_FIELD` / `buildCutoverCriteria` pair exported
// by `../../useFiscalMonitor.js`, used by the SiiMonitorSection vi.mock
// factories.
//
// ETP-5432 #9 — real implementation stubbed here rather than imported: none
// of the suites that import this helper pass earliestCutoverDate, so []
// (no-op) is always correct. Mirrors the Verifactu stub pattern in
// `testHelpers/verifactuCutoverStub.js`.
//
// Extracted (ETP-5432, GitHub Copilot DUPLICATED_BLOCK review on PR #1676)
// after the same 6-line block was pasted verbatim into all five
// SiiMonitorSection.*.vitest.jsx suites instead of being shared.
//
// Plain, side-effect-free named exports: safe to import into a vi.mock(...)
// factory without vi.hoisted — ES module imports are resolved before the
// (hoisted) factory function is ever invoked, and Vitest explicitly supports
// referencing imported bindings from inside a mock factory.
export function buildCutoverCriteria(cutoverDate, fieldName = 'invoiceDate') {
  return cutoverDate
    ? [{ fieldName, operator: 'greaterOrEqual', value: cutoverDate.slice(0, 10) }]
    : [];
}

export const SII_DATE_FIELD = 'invoiceDate';
