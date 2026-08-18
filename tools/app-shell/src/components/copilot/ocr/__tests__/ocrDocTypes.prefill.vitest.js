/**
 * Guards the two-list contract behind the create-contact pre-fill
 * (ETP-4855 Error 1):
 *
 *   `createPrefilledFrom` names payload keys it wants →
 *   `extractFrom` / `extraHeaderFields` are what actually reach the extraction
 *   schema.
 *
 * A typo on either side fails silently at runtime: the popup just opens with
 * that field empty, which is indistinguishable from the OCR not finding it.
 */
import { OCR_DOC_TYPES } from '../ocrDocTypes.js';
import { buildOcrSchema } from '../buildOcrSchema.js';

describe.each(OCR_DOC_TYPES.map(d => [d.id, d]))('OCR doc type %s — pre-fill mapping', (_id, docType) => {
  const schema = buildOcrSchema(docType);
  const prefillFields = (docType.headerFields || []).filter(f => f.createPrefilledFrom);

  it('sources every pre-filled field from a key the extraction schema emits', () => {
    for (const field of prefillFields) {
      for (const [target, source] of Object.entries(field.createPrefilledFrom)) {
        expect(
          schema.properties[source],
          `${field.key}.createPrefilledFrom.${target} reads '${source}', which the extraction schema never returns`,
        ).toBeDefined();
      }
    }
  });

  it('declares no pre-fill target twice within a field', () => {
    for (const field of prefillFields) {
      const targets = Object.keys(field.createPrefilledFrom);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });
});

describe('purchase-invoice — vendor pre-fill coverage', () => {
  const docType = OCR_DOC_TYPES.find(d => d.id === 'purchase-invoice');
  const vendor = docType.headerFields.find(f => f.key === 'vendor');

  it('pre-fills the identity, address and contact data the popup asks for', () => {
    // Every one of these is a field the user previously had to retype.
    expect(Object.keys(vendor.createPrefilledFrom).sort()).toEqual([
      'address',
      'city',
      'country',
      'etgoEmail',
      'etgoPhone',
      'name',
      'postalCode',
      'taxID',
    ]);
  });

  it('covers the required fields of the contact form that a document can supply', () => {
    // CreateContactModal requires name, taxID and country (plus a category,
    // which no invoice prints). Losing any of these to a rename would put the
    // Save button back out of reach.
    for (const target of ['name', 'taxID', 'country']) {
      expect(vendor.createPrefilledFrom[target]).toBeTruthy();
    }
  });
});
