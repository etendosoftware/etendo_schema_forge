/**
 * @covers tools/app-shell/src/components/copilot/ocr/hasExtractedData.js
 *
 * A blank/corrupt PDF yields valid JSON with every field null. The helper must
 * tell that apart from a real extraction so the review modal never opens empty.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasExtractedData } from '../hasExtractedData.js';
import { OCR_DOC_TYPES } from '../ocrDocTypes.js';

const docType = OCR_DOC_TYPES.find(t => t.id === 'purchase-invoice');

test('all-null payload has no data', () => {
  const payload = { vendor_name: null, tax_id: null, document_no: null, invoice_date: null, line_items: [] };
  assert.equal(hasExtractedData(docType, payload), false);
});

test('missing/non-object payload has no data', () => {
  assert.equal(hasExtractedData(docType, null), false);
  assert.equal(hasExtractedData(docType, undefined), false);
  assert.equal(hasExtractedData(docType, 'x'), false);
});

test('only line items counts as data', () => {
  assert.equal(hasExtractedData(docType, { vendor_name: null, line_items: [{ description: 'x' }] }), true);
});

test('only vendor counts as data', () => {
  assert.equal(hasExtractedData(docType, { vendor_name: 'ACME', line_items: [] }), true);
});

test('second key of an array extractFrom counts as data', () => {
  assert.equal(hasExtractedData(docType, { vendor_name: null, tax_id: 'B123', line_items: null }), true);
});

test('whitespace-only strings are empty', () => {
  const payload = { vendor_name: '   ', tax_id: '\n', document_no: '\t', invoice_date: ' ', line_items: [] };
  assert.equal(hasExtractedData(docType, payload), false);
});

test('keys outside the docType headerFields are ignored', () => {
  assert.equal(hasExtractedData(docType, { vendor_email: 'a@b.c', line_items: [] }), false);
});

test('docType without headerFields only looks at line items', () => {
  assert.equal(hasExtractedData({}, { vendor_name: 'ACME' }), false);
  assert.equal(hasExtractedData(null, { line_items: [{}] }), true);
});
