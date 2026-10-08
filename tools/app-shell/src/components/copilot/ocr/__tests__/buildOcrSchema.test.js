/**
 * @covers tools/app-shell/src/components/copilot/ocr/buildOcrSchema.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOcrSchema } from '../buildOcrSchema.js';
import { OCR_DOC_TYPES } from '../ocrDocTypes.js';

describe('buildOcrSchema', () => {
  it('returns null for a missing doc type', () => {
    assert.equal(buildOcrSchema(null), null);
    assert.equal(buildOcrSchema(undefined), null);
  });

  it('emits a strict object schema (additionalProperties=false)', () => {
    const schema = buildOcrSchema({ headerFields: [{ extractFrom: 'foo', kind: 'text' }] });
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ['foo']);
  });

  it('maps each kind to the right JSON type, all nullable', () => {
    const schema = buildOcrSchema({
      headerFields: [
        { extractFrom: 't', kind: 'text' },
        { extractFrom: 'n', kind: 'number' },
        { extractFrom: 'd', kind: 'date' },
        { extractFrom: 'e', kind: 'entity' },
      ],
    });
    assert.deepEqual(schema.properties.t.type, ['string', 'null']);
    assert.deepEqual(schema.properties.n.type, ['number', 'null']);
    assert.deepEqual(schema.properties.d.type, ['string', 'null']);
    assert.deepEqual(schema.properties.e.type, ['string', 'null']);
  });

  it('expands array extractFrom into multiple properties', () => {
    const schema = buildOcrSchema({
      headerFields: [{ extractFrom: ['vendor_name', 'tax_id'], kind: 'entity' }],
    });
    assert.ok(schema.properties.vendor_name);
    assert.ok(schema.properties.tax_id);
    assert.deepEqual(schema.required.sort(), ['tax_id', 'vendor_name']);
  });

  it('emits a line_items array when lineColumns are present', () => {
    const schema = buildOcrSchema({
      headerFields: [{ extractFrom: 'document_no', kind: 'text' }],
      lineColumns: [
        { extractFrom: 'description', kind: 'text' },
        { extractFrom: 'quantity', kind: 'number' },
      ],
    });
    assert.equal(schema.properties.line_items.type, 'array');
    assert.equal(schema.properties.line_items.items.type, 'object');
    assert.deepEqual(
      schema.properties.line_items.items.required.sort(),
      ['description', 'quantity'],
    );
    assert.ok(schema.required.includes('line_items'));
  });

  it('omits line_items when neither lineColumns nor extraLineFields are set', () => {
    const schema = buildOcrSchema({
      headerFields: [{ extractFrom: 'foo', kind: 'text' }],
    });
    assert.equal(schema.properties.line_items, undefined);
    assert.ok(!schema.required.includes('line_items'));
  });

  it('appends extraHeaderFields and extraLineFields using their `name`', () => {
    const schema = buildOcrSchema({
      headerFields: [{ extractFrom: 'foo', kind: 'text' }],
      extraHeaderFields: [{ name: 'vendor_phone', kind: 'text' }],
      lineColumns: [{ extractFrom: 'qty', kind: 'number' }],
      extraLineFields: [{ name: 'tax_rate', kind: 'number' }],
    });
    assert.ok(schema.properties.vendor_phone);
    assert.ok(schema.properties.line_items.items.properties.tax_rate);
  });

  it('deduplicates property names if two fields share the same key', () => {
    const schema = buildOcrSchema({
      headerFields: [
        { extractFrom: 'foo', kind: 'text' },
        { extractFrom: 'foo', kind: 'number' },
      ],
    });
    assert.equal(schema.required.filter(k => k === 'foo').length, 1);
  });
});

describe('buildOcrSchema — purchase-invoice doc type', () => {
  const docType = OCR_DOC_TYPES.find(d => d.id === 'purchase-invoice');
  const schema = buildOcrSchema(docType);

  it('covers every field the descriptor relies on', () => {
    // Header fields the descriptor reads from `safe.*`.
    for (const key of ['vendor_name', 'tax_id', 'document_no', 'invoice_date']) {
      assert.ok(schema.properties[key], `missing header field: ${key}`);
    }
    // Line item fields the descriptor reads from each `line.*`.
    const lineItem = schema.properties.line_items.items;
    for (const key of ['description', 'quantity', 'unit_price', 'tax_label', 'tax_rate']) {
      assert.ok(lineItem.properties[key], `missing line field: ${key}`);
    }
  });

  it('matches the OpenAI strict-schema contract (no extra props, all required)', () => {
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.required.length, Object.keys(schema.properties).length);
    const lineItem = schema.properties.line_items.items;
    assert.equal(lineItem.additionalProperties, false);
    assert.equal(lineItem.required.length, Object.keys(lineItem.properties).length);
  });

  it('emits a nested nullable object field with a strict shape and a nullable enum', () => {
    const schema = buildOcrSchema({
      extraHeaderFields: [{
        name: 'receiver',
        kind: 'object',
        description: 'party',
        properties: [
          { name: 'tax_id_raw', kind: 'text', description: 'raw' },
          { name: 'tax_id_type', kind: 'text', enum: ['vat', 'unknown'] },
        ],
      }],
    });
    const receiver = schema.properties.receiver;
    assert.deepEqual(receiver.type, ['object', 'null']);
    assert.equal(receiver.description, 'party');
    assert.equal(receiver.additionalProperties, false);
    assert.deepEqual(receiver.required, ['tax_id_raw', 'tax_id_type']);
    assert.deepEqual(receiver.properties.tax_id_type.enum, ['vat', 'unknown', null]);
    assert.deepEqual(schema.required, ['receiver']);
  });

  it('the purchase-invoice doc type requests issuer and receiver, keeping vendor_name and tax_id', () => {
    const doc = OCR_DOC_TYPES.find(t => t.id === 'purchase-invoice');
    const schema = buildOcrSchema(doc);
    for (const party of ['issuer', 'receiver']) {
      assert.deepEqual(schema.properties[party].required, ['name', 'tax_id_raw', 'tax_id_label', 'tax_id_type']);
      assert.ok(schema.required.includes(party));
    }
    // Removing this wiring would silently disable the receiver tax id check.
    assert.equal(doc.validateExtraction, 'receiverTaxId');
    assert.ok(schema.properties.vendor_name);
    assert.ok(schema.properties.tax_id);
  });
});
