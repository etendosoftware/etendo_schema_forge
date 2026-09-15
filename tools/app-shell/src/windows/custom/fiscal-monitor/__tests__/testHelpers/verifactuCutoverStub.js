// Shared stub for the `VF_DATE_FIELD` / `buildCutoverCriteria` pair exported by
// `../../useFiscalMonitor.js`, used by the VerifactuMonitorSection vi.mock factories.
//
// ETP-5229 #17 — real implementation stubbed here rather than imported: none of
// the suites that spread this helper pass earliestCutoverDate, so [] (no-op) is
// always correct. Mirrors the TBAI stub in TbaiMonitorSection.vitest.jsx.
//
// Plain, side-effect-free module: safe to import into a vi.mock(...) factory
// without vi.hoisted, since ES module imports are hoisted ahead of vi.mock calls.
export const verifactuCutoverStub = {
  VF_DATE_FIELD: 'invoiceDate',
  buildCutoverCriteria: (cutoverDate, fieldName = 'invoiceDate') => (cutoverDate
    ? [{ fieldName, operator: 'greaterOrEqual', value: cutoverDate.slice(0, 10) }]
    : []),
};

// Full replacement for `../../useFiscalMonitor.js` shared by every
// VerifactuMonitorSection vi.mock(...) factory. Extracted here (ETP-5229) after
// Copilot re-flagged the identical 9-line vi.mock(...) block itself as a
// DUPLICATED_BLOCK across the three suites once VF_DATE_FIELD/
// buildCutoverCriteria were already deduped. None of the three suites override
// any of these keys per-test, so a single shared object is safe.
export const verifactuFiscalMonitorMock = {
  VF_SPEC: 'monitor-verifactu',
  VF_ACEPTADAS_ENTITY: 'facturasAceptadas',
  VF_PARCIAL_ENTITY: 'facturasParcialmenteAceptadas',
  VF_RECHAZADAS_ENTITY: 'facturasRechazadas',
  VF_INVALIDAS_ENTITY: 'facturasInvalidas',
  ...verifactuCutoverStub,
};
