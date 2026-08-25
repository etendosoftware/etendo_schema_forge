import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFormValidity, getBlockingRequiredFields, fieldsSignature } from '../useFormValidity.js';

const processedLock = (r) => r?.processed === true;

// Same fixture as requiredFields.test.js, mirroring the real sales-order HeaderForm.
const SALES_ORDER_FIELDS = [
  { key: 'businessPartner', column: 'businessPartner', label: 'Business Partner', type: 'search', required: true, readOnlyLogic: processedLock },
  { key: 'documentNo', column: 'documentNo', label: 'Document No.', type: 'text', required: true, readOnly: true },
  { key: 'orderDate', column: 'orderDate', label: 'Order Date', type: 'date', required: true, readOnlyLogic: processedLock },
  { key: 'partnerAddress', column: 'partnerAddress', label: 'Partner Address', type: 'dependent', required: true, readOnlyLogic: processedLock },
  { key: 'currency', column: 'currency', label: 'Currency', type: 'selector', required: true, readOnlyLogic: processedLock },
  { key: 'priceList', column: 'priceList', label: 'Price List', type: 'selector', required: true, readOnlyLogic: processedLock },
  { key: 'paymentTerms', column: 'paymentTerms', label: 'Payment Terms', type: 'selector', required: true, readOnlyLogic: processedLock },
  { key: 'paymentMethod', column: 'paymentMethod', label: 'Payment Method', type: 'selector', required: false, readOnlyLogic: processedLock },
  { key: 'warehouse', column: 'warehouse', label: 'Warehouse', type: 'search', required: true, readOnlyLogic: processedLock },
  { key: 'grandTotalAmount', column: 'grandTotalAmount', label: 'Grand Total', type: 'amount', required: true, section: 'summary' },
  { key: 'summedLineAmount', column: 'summedLineAmount', label: 'Total Lines', type: 'amount', required: true, section: 'summary' },
];

const EXPECTED_BLOCKING_KEYS = [
  'businessPartner', 'orderDate', 'partnerAddress', 'currency', 'priceList', 'paymentTerms', 'warehouse',
];

describe('getBlockingRequiredFields — new record (skipUnchangedInvalid: false)', () => {
  it('scenario 1: a new empty form blocks on all 7 fillable required fields', () => {
    const blocking = getBlockingRequiredFields({ fields: SALES_ORDER_FIELDS, values: {}, changedKeys: new Set() });
    expect(blocking.map(f => f.key).sort()).toEqual([...EXPECTED_BLOCKING_KEYS].sort());
  });

  it('scenario 2: filling the last required field clears the block', () => {
    const almostComplete = {
      businessPartner: 'BP-1', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
      currency: 'USD', priceList: 'PL-1', paymentTerms: 'NET30', warehouse: '',
    };
    const stillBlocking = getBlockingRequiredFields({ fields: SALES_ORDER_FIELDS, values: almostComplete, changedKeys: new Set() });
    expect(stillBlocking.map(f => f.key)).toEqual(['warehouse']);

    const complete = { ...almostComplete, warehouse: 'WH-1' };
    const cleared = getBlockingRequiredFields({ fields: SALES_ORDER_FIELDS, values: complete, changedKeys: new Set() });
    expect(cleared).toEqual([]);
  });

  it('scenario 3: clearing a previously-filled required field blocks again', () => {
    const complete = {
      businessPartner: 'BP-1', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
      currency: 'USD', priceList: 'PL-1', paymentTerms: 'NET30', warehouse: 'WH-1',
    };
    expect(getBlockingRequiredFields({ fields: SALES_ORDER_FIELDS, values: complete, changedKeys: new Set() })).toEqual([]);

    const cleared = { ...complete, currency: '' };
    const blocking = getBlockingRequiredFields({ fields: SALES_ORDER_FIELDS, values: cleared, changedKeys: new Set() });
    expect(blocking.map(f => f.key)).toEqual(['currency']);
  });

  it('scenario 4: an existing record whose data satisfies every required field is valid', () => {
    const existingRecord = {
      id: 'so-1', businessPartner: 'BP-1', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
      currency: 'USD', priceList: 'PL-1', paymentTerms: 'NET30', warehouse: 'WH-1',
    };
    expect(getBlockingRequiredFields({ fields: SALES_ORDER_FIELDS, values: existingRecord, changedKeys: new Set() })).toEqual([]);
  });

  it('scenario 5: a confirmation-modal extra required field, left empty, still blocks', () => {
    const modalFields = [
      { key: 'confirmationNote', required: true, type: 'text' },
      { key: 'confirmationDate', required: true, type: 'date' },
    ];
    const blocking = getBlockingRequiredFields({
      fields: modalFields,
      values: { confirmationDate: '2026-08-20', confirmationNote: '' },
      changedKeys: new Set(['confirmationDate']),
    });
    expect(blocking.map(f => f.key)).toEqual(['confirmationNote']);
  });
});

describe('getBlockingRequiredFields — legacy record (skipUnchangedInvalid: true)', () => {
  it('scenario 6a: an empty required field the user never touched does NOT block', () => {
    const legacyRecord = {
      id: 'so-legacy', businessPartner: 'BP-1', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
      currency: 'USD', priceList: '', paymentTerms: 'NET30', warehouse: 'WH-1',
    };
    const blocking = getBlockingRequiredFields({
      fields: SALES_ORDER_FIELDS,
      values: legacyRecord,
      changedKeys: new Set(['orderDate']), // touched an unrelated field
      skipUnchangedInvalid: true,
    });
    expect(blocking).toEqual([]);
  });

  it('scenario 6b: the same empty field DOES block once the user touches it', () => {
    const legacyRecord = {
      id: 'so-legacy', businessPartner: 'BP-1', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
      currency: 'USD', priceList: '', paymentTerms: 'NET30', warehouse: 'WH-1',
    };
    const blocking = getBlockingRequiredFields({
      fields: SALES_ORDER_FIELDS,
      values: legacyRecord,
      changedKeys: new Set(['priceList']),
      skipUnchangedInvalid: true,
    });
    expect(blocking.map(f => f.key)).toEqual(['priceList']);
  });

  it('returns [] when changedKeys is missing under skipUnchangedInvalid', () => {
    const legacyRecord = { businessPartner: '' };
    const blocking = getBlockingRequiredFields({
      fields: [{ key: 'businessPartner', required: true }],
      values: legacyRecord,
      changedKeys: undefined,
      skipUnchangedInvalid: true,
    });
    expect(blocking).toEqual([]);
  });

  it('returns [] when changedKeys is not a Set (no .has method) under skipUnchangedInvalid', () => {
    const legacyRecord = { businessPartner: '' };
    const blocking = getBlockingRequiredFields({
      fields: [{ key: 'businessPartner', required: true }],
      values: legacyRecord,
      changedKeys: ['businessPartner'], // plain array, no .has
      skipUnchangedInvalid: true,
    });
    expect(blocking).toEqual([]);
  });
});

describe('getBlockingRequiredFields — defaults', () => {
  it('defaults fields to [] when not an array', () => {
    expect(getBlockingRequiredFields({ fields: null, values: {} })).toEqual([]);
  });

  it('defaults skipUnchangedInvalid to false', () => {
    const blocking = getBlockingRequiredFields({ fields: [{ key: 'x', required: true }], values: {} });
    expect(blocking.map(f => f.key)).toEqual(['x']);
  });
});

describe('fieldsSignature', () => {
  it('is order-insensitive', () => {
    const a = [{ key: 'a', required: true }, { key: 'b', required: false }];
    const b = [{ key: 'b', required: false }, { key: 'a', required: true }];
    expect(fieldsSignature(a)).toEqual(fieldsSignature(b));
  });

  it('changes when a required flag flips', () => {
    const before = [{ key: 'a', required: false }];
    const after = [{ key: 'a', required: true }];
    expect(fieldsSignature(before)).not.toEqual(fieldsSignature(after));
  });

  it('changes when a field is added or removed', () => {
    const a = [{ key: 'a', required: true }];
    const b = [{ key: 'a', required: true }, { key: 'b', required: true }];
    expect(fieldsSignature(a)).not.toEqual(fieldsSignature(b));
  });

  it('handles a non-array input gracefully', () => {
    expect(fieldsSignature(null)).toEqual('');
    expect(fieldsSignature(undefined)).toEqual('');
  });
});

describe('useFormValidity (reactive wrapper)', () => {
  it('reports isValid: false with the blocking keys and descriptors for an empty new form', () => {
    const { result } = renderHook(() => useFormValidity({
      fields: SALES_ORDER_FIELDS,
      values: {},
      changedKeys: new Set(),
    }));
    expect(result.current.isValid).toBe(false);
    expect(result.current.missingRequired.sort()).toEqual([...EXPECTED_BLOCKING_KEYS].sort());
    expect(result.current.missingRequiredFields).toHaveLength(EXPECTED_BLOCKING_KEYS.length);
  });

  it('reports isValid: true once the record satisfies every required field', () => {
    const { result, rerender } = renderHook(
      ({ values }) => useFormValidity({ fields: SALES_ORDER_FIELDS, values, changedKeys: new Set() }),
      {
        initialProps: {
          values: {
            businessPartner: '', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
            currency: 'USD', priceList: 'PL-1', paymentTerms: 'NET30', warehouse: 'WH-1',
          },
        },
      },
    );
    expect(result.current.isValid).toBe(false);
    rerender({
      values: {
        businessPartner: 'BP-1', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
        currency: 'USD', priceList: 'PL-1', paymentTerms: 'NET30', warehouse: 'WH-1',
      },
    });
    expect(result.current.isValid).toBe(true);
    expect(result.current.missingRequired).toEqual([]);
  });

  it('honours skipUnchangedInvalid: an untouched legacy field does not invalidate', () => {
    const { result } = renderHook(() => useFormValidity({
      fields: SALES_ORDER_FIELDS,
      values: {
        id: 'so-legacy', businessPartner: 'BP-1', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
        currency: 'USD', priceList: '', paymentTerms: 'NET30', warehouse: 'WH-1',
      },
      changedKeys: new Set(['orderDate']),
      skipUnchangedInvalid: true,
    }));
    expect(result.current.isValid).toBe(true);
    expect(result.current.missingRequired).toEqual([]);
  });
});
