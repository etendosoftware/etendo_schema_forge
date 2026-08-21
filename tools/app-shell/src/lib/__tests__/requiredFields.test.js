import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getReadOnly,
  getVisible,
  getMissingRequiredDescriptors,
  getMissingRequiredFields,
} from '../requiredFields.js';

// ---------------------------------------------------------------------------
// Realistic fixture — mirrors artifacts/sales-order/generated/web/sales-order/
// HeaderForm.jsx (ETP-4933). All required fields carry a `readOnlyLogic` that
// locks the header once the document is processed.
// ---------------------------------------------------------------------------
const processedLock = (r) => r?.processed === true;

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

describe('getReadOnly', () => {
  it('returns true when field.readOnly is explicitly true', () => {
    const isReadOnly = getReadOnly({});
    assert.equal(isReadOnly({ readOnly: true }), true);
  });

  it('evaluates readOnlyLogic against the current record', () => {
    const isReadOnly = getReadOnly({ processed: true });
    assert.equal(isReadOnly({ readOnlyLogic: processedLock }), true);
  });

  it('returns false when readOnlyLogic evaluates falsy', () => {
    const isReadOnly = getReadOnly({ processed: false });
    assert.equal(isReadOnly({ readOnlyLogic: processedLock }), false);
  });

  it('returns false when neither readOnly nor readOnlyLogic is set', () => {
    const isReadOnly = getReadOnly({});
    assert.equal(isReadOnly({}), false);
  });

  it('fails OPEN when readOnlyLogic throws — a broken closure must never lock a field', () => {
    const isReadOnly = getReadOnly({});
    const throwing = { readOnlyLogic: () => { throw new Error('boom'); } };
    assert.equal(isReadOnly(throwing), false);
  });
});

describe('getVisible', () => {
  it('defaults to visible when displayLogic is absent', () => {
    const isVisible = getVisible({});
    assert.equal(isVisible({}), true);
  });

  it('evaluates displayLogic against the current record', () => {
    const isVisible = getVisible({ showExtra: true });
    assert.equal(isVisible({ displayLogic: (r) => r.showExtra }), true);
    assert.equal(isVisible({ displayLogic: (r) => !r.showExtra }), false);
  });

  it('defaults the record to {} when editing is null/undefined', () => {
    const isVisible = getVisible(undefined);
    assert.equal(isVisible({ displayLogic: (r) => r.showExtra === undefined }), true);
  });

  it('fails OPEN when displayLogic throws — must not vanish a field silently', () => {
    const isVisible = getVisible({});
    const throwing = { displayLogic: () => { throw new Error('boom'); } };
    assert.equal(isVisible(throwing), true);
  });
});

describe('getMissingRequiredDescriptors / getMissingRequiredFields — sales-order fixture', () => {
  it('an empty new record blocks on exactly the 7 fillable required fields', () => {
    const keys = getMissingRequiredFields(SALES_ORDER_FIELDS, {});
    assert.deepEqual(keys.sort(), [...EXPECTED_BLOCKING_KEYS].sort());
  });

  it('returns the full descriptor objects, not just keys', () => {
    const descriptors = getMissingRequiredDescriptors(SALES_ORDER_FIELDS, {});
    assert.equal(descriptors.length, EXPECTED_BLOCKING_KEYS.length);
    const businessPartner = descriptors.find(f => f.key === 'businessPartner');
    assert.equal(businessPartner.label, 'Business Partner');
    assert.equal(businessPartner.column, 'businessPartner');
  });

  it('a processed record ({ processed: true }) blocks on nothing', () => {
    const keys = getMissingRequiredFields(SALES_ORDER_FIELDS, { processed: true });
    assert.deepEqual(keys, []);
  });

  it('filling every fillable required field leaves 0 blocking keys', () => {
    const filled = {
      businessPartner: 'BP-1', orderDate: '2026-08-20', partnerAddress: 'ADDR-1',
      currency: 'USD', priceList: 'PL-1', paymentTerms: 'NET30', warehouse: 'WH-1',
    };
    const keys = getMissingRequiredFields(SALES_ORDER_FIELDS, filled);
    assert.deepEqual(keys, []);
  });
});

describe('getMissingRequiredDescriptors — the four deliberate exclusions', () => {
  it('excludes a field with readOnly: true, even when required and empty', () => {
    const fields = [{ key: 'documentNo', required: true, readOnly: true }];
    assert.deepEqual(getMissingRequiredFields(fields, {}), []);
  });

  it('excludes a field whose readOnlyLogic evaluates true, even when required and empty', () => {
    const fields = [{ key: 'businessPartner', required: true, readOnlyLogic: processedLock }];
    assert.deepEqual(getMissingRequiredFields(fields, { processed: true }), []);
  });

  it('excludes a field whose displayLogic evaluates false, even when required and empty', () => {
    const fields = [{ key: 'extra', required: true, displayLogic: () => false }];
    assert.deepEqual(getMissingRequiredFields(fields, {}), []);
  });

  it("excludes type === 'checkbox' fields, even when required and empty", () => {
    const fields = [{ key: 'active', required: true, type: 'checkbox' }];
    assert.deepEqual(getMissingRequiredFields(fields, {}), []);
  });

  it("excludes section === 'summary' fields, even when required and empty", () => {
    const fields = [{ key: 'grandTotalAmount', required: true, section: 'summary' }];
    assert.deepEqual(getMissingRequiredFields(fields, {}), []);
  });
});

describe('getMissingRequiredDescriptors — emptiness rules', () => {
  const required = { key: 'businessPartner', required: true };

  it('treats null as empty', () => {
    assert.deepEqual(getMissingRequiredFields([required], { businessPartner: null }), ['businessPartner']);
  });

  it('treats undefined as empty', () => {
    assert.deepEqual(getMissingRequiredFields([required], {}), ['businessPartner']);
  });

  it('treats an empty string as empty', () => {
    assert.deepEqual(getMissingRequiredFields([required], { businessPartner: '' }), ['businessPartner']);
  });

  it('treats a whitespace-only string as empty', () => {
    assert.deepEqual(getMissingRequiredFields([required], { businessPartner: '   ' }), ['businessPartner']);
  });

  it('treats a non-empty string as filled', () => {
    assert.deepEqual(getMissingRequiredFields([required], { businessPartner: 'BP-1' }), []);
  });

  it('treats 0 as filled (a falsy-but-present value)', () => {
    const numeric = { key: 'quantity', required: true };
    assert.deepEqual(getMissingRequiredFields([numeric], { quantity: 0 }), []);
  });

  it('treats false as filled (a falsy-but-present value)', () => {
    const boolField = { key: 'someFlag', required: true };
    assert.deepEqual(getMissingRequiredFields([boolField], { someFlag: false }), []);
  });
});

describe('getMissingRequiredDescriptors — non-required fields never block', () => {
  it('a non-required, empty field is never reported', () => {
    const fields = [{ key: 'paymentMethod', required: false }];
    assert.deepEqual(getMissingRequiredFields(fields, {}), []);
  });
});
