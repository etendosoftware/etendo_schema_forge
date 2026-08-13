import { describe, it, expect } from 'vitest';
import {
  formatIsoToClassicDate,
  deriveIsSOTrx,
  deriveRoleFlags,
  resolveDateFromRecord,
  buildSelectorContext,
  buildHeaderSelectorContext,
  buildLineSelectorContext,
} from '../selectorContext.js';

describe('formatIsoToClassicDate', () => {
  it('converts ISO date to DD-MM-YYYY', () => {
    expect(formatIsoToClassicDate('2026-05-12')).toBe('12-05-2026');
  });

  it('handles date with time portion', () => {
    expect(formatIsoToClassicDate('2026-05-12T10:30:00Z')).toBe('12-05-2026');
  });

  it('returns null for empty string', () => {
    expect(formatIsoToClassicDate('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(formatIsoToClassicDate(null)).toBeNull();
  });

  it('returns null for non-date string', () => {
    expect(formatIsoToClassicDate('not-a-date')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(formatIsoToClassicDate(undefined)).toBeNull();
  });
});

describe('deriveIsSOTrx', () => {
  it('returns Y for sales', () => {
    expect(deriveIsSOTrx('sales')).toBe('Y');
  });

  it('returns N for purchases', () => {
    expect(deriveIsSOTrx('purchases')).toBe('N');
  });

  it('returns null for unknown category', () => {
    expect(deriveIsSOTrx('inventory')).toBeNull();
  });

  it('returns null for null', () => {
    expect(deriveIsSOTrx(null)).toBeNull();
  });
});

describe('deriveRoleFlags', () => {
  it('returns isCustomer for sales', () => {
    expect(deriveRoleFlags('sales')).toEqual({ isCustomer: 'Y' });
  });

  it('returns isVendor for purchases', () => {
    expect(deriveRoleFlags('purchases')).toEqual({ isVendor: 'Y' });
  });

  it('returns empty for unknown category', () => {
    expect(deriveRoleFlags('inventory')).toEqual({});
  });
});

describe('resolveDateFromRecord', () => {
  it('returns first found field', () => {
    const record = { orderDate: '2026-05-12' };
    expect(resolveDateFromRecord(record, ['invoiceDate', 'orderDate'])).toBe('2026-05-12');
  });

  it('returns null when no fields exist', () => {
    expect(resolveDateFromRecord({}, ['invoiceDate', 'orderDate'])).toBeNull();
  });

  it('returns null for null record', () => {
    expect(resolveDateFromRecord(null, ['invoiceDate'])).toBeNull();
  });

  it('prefers first field over second', () => {
    const record = { invoiceDate: '2026-01-01', orderDate: '2026-05-12' };
    expect(resolveDateFromRecord(record, ['invoiceDate', 'orderDate'])).toBe('2026-01-01');
  });
});

describe('buildSelectorContext', () => {
  it('maps dependsOn to filter param from record', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'header',
      field: {
        column: 'C_BPartner_Location_ID',
        dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' },
      },
      record: { businessPartner: 'BP-001' },
    });
    expect(result).toEqual({ C_BPartner_ID: 'BP-001' });
  });

  it('maps dependsOn from parent record when not in current record', () => {
    const result = buildSelectorContext({
      windowCategory: 'purchases',
      entityName: 'header',
      field: {
        column: 'C_BPartner_Location_ID',
        dependsOn: { field: 'businessPartner', filterKey: 'C_BPartner_ID' },
      },
      record: {},
      parentRecord: { businessPartner: 'BP-002' },
    });
    expect(result).toEqual({ C_BPartner_ID: 'BP-002' });
  });

  it('derives isSOTrx for priceList from window category', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'header',
      field: { column: 'M_PriceList_ID' },
    });
    expect(result).toEqual({ isSOTrx: 'Y' });
  });

  it('derives isSOTrx=N for purchase priceList', () => {
    const result = buildSelectorContext({
      windowCategory: 'purchases',
      entityName: 'header',
      field: { column: 'M_PriceList_ID' },
    });
    expect(result).toEqual({ isSOTrx: 'N' });
  });

  it('processes context.required from field metadata', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'lines',
      field: {
        column: 'C_Tax_ID',
        context: {
          required: [
            { param: 'IsSOTrx', source: 'windowCategory' },
            { param: 'DateInvoiced', source: 'parentField', field: 'invoiceDate', fallbackField: 'orderDate', format: 'DD-MM-YYYY' },
          ],
          optional: [
            { param: 'priceList', source: 'parentField', field: 'priceList' },
          ],
        },
      },
      parentRecord: {
        invoiceDate: '2026-05-12',
        priceList: 'PL-001',
      },
    });
    expect(result).toEqual({
      IsSOTrx: 'Y',
      isSOTrx: 'Y',
      DateInvoiced: '12-05-2026',
      priceList: 'PL-001',
    });
  });

  it('falls back to orderDate when invoiceDate is missing', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'lines',
      field: {
        column: 'C_Tax_ID',
        context: {
          required: [
            { param: 'DateInvoiced', source: 'parentField', field: 'invoiceDate', fallbackField: 'orderDate', format: 'DD-MM-YYYY' },
          ],
        },
      },
      parentRecord: { orderDate: '2026-03-01' },
    });
    expect(result.DateInvoiced).toBe('01-03-2026');
  });

  it('adds parentId for child entities', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'lines',
      field: { column: 'C_Tax_ID' },
      parentId: 'HDR-123',
    });
    expect(result.parentId).toBe('HDR-123');
  });

  it('returns empty object when no context can be resolved', () => {
    const result = buildSelectorContext({
      windowCategory: null,
      entityName: 'header',
      field: { column: 'C_Tax_ID' },
      record: {},
    });
    expect(result).toEqual({});
  });

  it('maps dependsOn from context.required field source', () => {
    const result = buildSelectorContext({
      windowCategory: 'purchases',
      entityName: 'header',
      field: {
        column: 'C_BPartner_Location_ID',
        context: {
          required: [
            { param: 'C_BPartner_ID', source: 'field', field: 'businessPartner' },
          ],
        },
      },
      record: { businessPartner: 'BP-VENDOR' },
    });
    expect(result).toEqual({ C_BPartner_ID: 'BP-VENDOR' });
  });

  it('handles optional windowCategory flags', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'header',
      field: {
        column: 'C_BPartner_Location_ID',
        context: {
          required: [
            { param: 'C_BPartner_ID', source: 'field', field: 'businessPartner' },
          ],
          optional: [
            { param: 'isCustomer', source: 'windowCategory' },
          ],
        },
      },
      record: { businessPartner: 'BP-001' },
    });
    expect(result).toEqual({
      C_BPartner_ID: 'BP-001',
      isCustomer: 'Y',
    });
  });

  it('handles recommended context entries as non-required selector params', () => {
    const result = buildSelectorContext({
      windowCategory: 'purchases',
      entityName: 'lines',
      field: {
        column: 'C_Tax_ID',
        context: {
          required: [
            { param: 'IsSOTrx', source: 'windowCategory' },
          ],
          recommended: [
            { param: 'priceList', source: 'parentField', field: 'priceList' },
            { param: 'C_BPartner_Location_ID', source: 'parentField', field: 'partnerAddress' },
          ],
        },
      },
      parentRecord: {
        priceList: 'PL-PURCHASE',
        partnerAddress: 'LOC-VENDOR',
      },
    });
    expect(result).toEqual({
      IsSOTrx: 'N',
      isSOTrx: 'N',
      priceList: 'PL-PURCHASE',
      C_BPartner_Location_ID: 'LOC-VENDOR',
    });
  });

  it('derives C_BPartner_ID via default heuristic from record (no context, no dependsOn)', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'header',
      field: { column: 'C_BPartner_Location_ID' },
      record: { businessPartner: 'BP-REC' },
    });
    expect(result).toEqual({ C_BPartner_ID: 'BP-REC' });
  });

  it('derives C_BPartner_ID via default heuristic from parent record fallback', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'header',
      field: { column: 'C_BPartner_Location_ID' },
      record: {},
      parentRecord: { businessPartner: 'BP-PARENT' },
    });
    expect(result).toEqual({ C_BPartner_ID: 'BP-PARENT' });
  });

  it('dual-writes isSOTrx and IsSOTrx for lowercase isSOTrx windowCategory param', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'lines',
      field: {
        column: 'C_Tax_ID',
        context: {
          required: [
            { param: 'isSOTrx', source: 'windowCategory' },
          ],
        },
      },
    });
    expect(result).toEqual({ isSOTrx: 'Y', IsSOTrx: 'Y' });
  });

  it('does not fall back to record for required priceList parentField', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'lines',
      field: {
        column: 'M_PriceList_ID',
        context: {
          required: [
            { param: 'priceList', source: 'parentField', field: 'priceList' },
          ],
        },
      },
      record: { priceList: 'PL-FROM-RECORD' },
    });
    expect(result).toEqual({});
  });

  it('falls back to record for a generic required parentField when no parent record', () => {
    const result = buildSelectorContext({
      windowCategory: 'sales',
      entityName: 'lines',
      field: {
        column: 'C_Tax_ID',
        context: {
          required: [
            { param: 'someParam', source: 'parentField', field: 'someField' },
          ],
        },
      },
      record: { someField: 'SOME-VALUE' },
    });
    expect(result).toEqual({ someParam: 'SOME-VALUE' });
  });
});

describe('buildHeaderSelectorContext', () => {
  it('returns isSOTrx and isCustomer for sales', () => {
    expect(buildHeaderSelectorContext('sales')).toEqual({
      isSOTrx: 'Y',
      isCustomer: 'Y',
    });
  });

  it('returns isSOTrx and isVendor for purchases', () => {
    expect(buildHeaderSelectorContext('purchases')).toEqual({
      isSOTrx: 'N',
      isVendor: 'Y',
    });
  });

  it('returns empty for unknown category', () => {
    expect(buildHeaderSelectorContext(null)).toEqual({});
  });
});

describe('buildLineSelectorContext', () => {
  it('builds full line context from header record', () => {
    const result = buildLineSelectorContext({
      windowCategory: 'sales',
      parentId: 'HDR-001',
      headerRecord: {
        invoiceDate: '2026-05-12',
        priceList: 'PL-SALES',
        partnerAddress: 'LOC-001',
      },
    });
    expect(result).toEqual({
      parentId: 'HDR-001',
      isSOTrx: 'Y',
      IsSOTrx: 'Y',
      DateInvoiced: '12-05-2026',
      priceList: 'PL-SALES',
      C_BPartner_Location_ID: 'LOC-001',
    });
  });

  it('falls back to orderDate when invoiceDate is missing', () => {
    const result = buildLineSelectorContext({
      windowCategory: 'purchases',
      parentId: 'HDR-002',
      headerRecord: {
        orderDate: '2026-03-01',
        priceList: 'PL-PURCHASE',
      },
    });
    expect(result).toEqual({
      parentId: 'HDR-002',
      isSOTrx: 'N',
      IsSOTrx: 'N',
      DateInvoiced: '01-03-2026',
      priceList: 'PL-PURCHASE',
    });
  });

  it('handles empty header record', () => {
    const result = buildLineSelectorContext({
      windowCategory: 'sales',
      parentId: 'HDR-003',
      headerRecord: {},
    });
    expect(result).toEqual({
      parentId: 'HDR-003',
      isSOTrx: 'Y',
      IsSOTrx: 'Y',
    });
  });

  it('handles null header record', () => {
    const result = buildLineSelectorContext({
      windowCategory: 'sales',
      parentId: 'HDR-004',
      headerRecord: null,
    });
    expect(result).toEqual({
      parentId: 'HDR-004',
      isSOTrx: 'Y',
      IsSOTrx: 'Y',
    });
  });
});
