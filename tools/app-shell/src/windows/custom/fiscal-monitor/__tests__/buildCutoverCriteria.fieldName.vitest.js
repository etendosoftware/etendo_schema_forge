// ETP-5229 #17 — buildCutoverCriteria() gained an optional `fieldName` param
// (previously hardcoded to TBAI_DATE_FIELD) so VerifactuMonitorSection.jsx can
// pass VF_DATE_FIELD ('invoiceDate', same literal value as TBAI's, but a
// distinct named export so the two systems don't silently couple). This file
// unit-tests the pure function directly — no hook/component rendering needed.

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => vi.fn(),
}));

import { buildCutoverCriteria, VF_DATE_FIELD } from '../useFiscalMonitor.js';

describe('buildCutoverCriteria — fieldName param (ETP-5229 #17)', () => {
  it('defaults to the TBAI date field (invoiceDate) when fieldName is omitted (regression check)', () => {
    expect(buildCutoverCriteria('2025-01-15T00:00:00.000Z')).toEqual([
      { fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: '2025-01-15' },
    ]);
  });

  it('uses the given fieldName when passed explicitly (VF_DATE_FIELD)', () => {
    expect(buildCutoverCriteria('2025-01-15T00:00:00.000Z', VF_DATE_FIELD)).toEqual([
      { fieldName: 'invoiceDate', operator: 'greaterOrEqual', value: '2025-01-15' },
    ]);
  });

  it('honors an arbitrary custom fieldName (not just the two known constants)', () => {
    expect(buildCutoverCriteria('2025-01-15T00:00:00.000Z', 'someOtherDateField')).toEqual([
      { fieldName: 'someOtherDateField', operator: 'greaterOrEqual', value: '2025-01-15' },
    ]);
  });

  it('returns [] when cutoverDate is null, regardless of fieldName', () => {
    expect(buildCutoverCriteria(null)).toEqual([]);
    expect(buildCutoverCriteria(null, VF_DATE_FIELD)).toEqual([]);
  });

  it('returns [] when cutoverDate is undefined or empty string, regardless of fieldName', () => {
    expect(buildCutoverCriteria(undefined, VF_DATE_FIELD)).toEqual([]);
    expect(buildCutoverCriteria('', VF_DATE_FIELD)).toEqual([]);
  });

  it('slices the date to yyyy-mm-dd even with a full ISO timestamp, for any fieldName', () => {
    const result = buildCutoverCriteria('2026-06-01T13:45:30.123Z', VF_DATE_FIELD);
    expect(result[0].value).toBe('2026-06-01');
  });
});
