// @covers tools/app-shell/src/components/copilot/ocr/ocrDocTypes.js
/**
 * Guards the contract behind the review modals and the create-contact pre-fill
 * (ETP-4855 Error 1):
 *
 *   the keys the application READS from the extraction (`extractFrom`, `createPrefilledFrom`,
 *   the line columns) must be keys the extraction schema EMITS.
 *
 * Since ETP-5715 the schema is no longer built here: it lives once on the server, in the OCR
 * configuration both the application and the MCP read (`ocr-config.json` in com.etendoerp.go,
 * served by `GET /sws/neo/ocrconfig`). So the guard reads that file. It runs when the module
 * is checked out next to this repo (the layout of a development machine and of the module's
 * own CI) and is skipped, not failed, when it is not.
 *
 * A typo on either side fails silently at runtime: the popup just opens with
 * that field empty, which is indistinguishable from the OCR not finding it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OCR_DOC_TYPES } from '../ocrDocTypes.js';

// __dirname is this folder: schema_forge/tools/app-shell/src/components/copilot/ocr/__tests__.
const CONFIG_PATH = resolve(
  __dirname,
  '../../../../../../../../modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/ocr/ocr-config.json',
);
const moduleConfig = existsSync(CONFIG_PATH)
  ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  : null;
const describeWithModule = moduleConfig ? describe : describe.skip;

function schemaOf(docTypeId) {
  return moduleConfig.docTypes.find(d => d.id === docTypeId).schema;
}

describeWithModule.each(OCR_DOC_TYPES.map(d => [d.id, d]))('OCR doc type %s — pre-fill mapping', (_id, docType) => {
  const schema = schemaOf(docType.id);
  const prefillFields = (docType.headerFields || []).filter(f => f.createPrefilledFrom);

  it('is declared in the server OCR configuration', () => {
    expect(moduleConfig.docTypes.map(d => d.id)).toContain(docType.id);
  });

  it('reads only header keys the extraction schema emits', () => {
    const keys = (docType.headerFields || []).flatMap(f => [].concat(f.extractFrom || []));
    for (const key of keys) {
      expect(schema.properties[key], `header field reads '${key}', which the schema never returns`).toBeDefined();
    }
    // Read outside the declared fields: the receiver check, the legacy issuer id, the lines.
    expect(schema.properties.receiver.properties.tax_id_raw).toBeDefined();
    expect(schema.properties.issuer.properties.tax_id_raw).toBeDefined();
    expect(schema.properties.tax_id).toBeDefined();
  });

  it('reads only line keys the extraction schema emits, tax_rate included', () => {
    const lineProps = schema.properties.line_items.items.properties;
    const keys = [...(docType.lineColumns || []).map(c => c.extractFrom), 'tax_rate'];
    for (const key of keys) {
      expect(lineProps[key], `line column reads '${key}', which the schema never returns`).toBeDefined();
    }
  });

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
