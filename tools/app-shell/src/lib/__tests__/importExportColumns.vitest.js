import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateCsv } from '@etendosoftware/app-shell-core/lib/import/buildTemplateCsv.js';
import { mapColumns } from '@etendosoftware/app-shell-core/lib/import/mapColumns.js';
import { resolveCodedValue } from '../codedValue.js';
// Imported for their side effect: each descriptor registers its own export hints. A module's
// side effect runs ONCE, so the registration cannot be recovered by re-importing after
// `clearExportHints` — the shipped hints are snapshotted below and restored by the tests that
// need them, which keeps those tests independent of execution order.
import '@/windows/custom/contacts/contactsImportDescriptor.js';
import '@/windows/custom/product/productImportDescriptor.js';
import {
  buildExportColumns,
  buildExportValueMaps,
  clearExportHints,
  exportSourceKeyForField,
  getExportHints,
  registerExportHints,
  serializeExportColumns,
} from '../importExportColumns.js';

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'artifacts');

/** The real `window.import` block a window ships, so the tests bind to production config. */
function loadImportConfig(spec) {
  const decisions = JSON.parse(readFileSync(join(artifactsDir, spec, 'decisions.json'), 'utf8'));
  return decisions.window.import;
}

/** Stands in for ListView's `importFieldLabel` in an English session. */
const englishHeaderFor = (field) => field.label || field.target;

const SHIPPED_HINTS = { contacts: getExportHints('contacts'), product: getExportHints('product') };

/** Restores one window's real registration after `beforeEach` wiped the registry. */
function useShippedHints(spec) {
  registerExportHints(spec, SHIPPED_HINTS[spec]);
}

beforeEach(() => {
  clearExportHints();
});

describe('exportSourceKeyForField', () => {
  it('reads a plain field straight off the list row', () => {
    expect(exportSourceKeyForField({ target: 'name' })).toBe('name');
  });

  it('reads a foreign key through its $_identifier label, not its raw id', () => {
    expect(exportSourceKeyForField({ target: 'uOM', matchEntity: 'UOM' })).toBe('uOM$_identifier');
    expect(exportSourceKeyForField({ target: 'country', type: 'foreignKey' })).toBe('country$_identifier');
  });

  it('leaves a child-entity field sourceless — the header list row does not carry it', () => {
    expect(exportSourceKeyForField({ target: 'city', headerScope: 'contact' })).toBe('');
  });

  it('lets headerScope win over matchEntity, since the child row is absent either way', () => {
    expect(exportSourceKeyForField({ target: 'country', matchEntity: 'Country', headerScope: 'contact' })).toBe('');
  });

  it('honours an explicit sourceKeys override above every other rule', () => {
    const sourceKeys = { category: 'businessPartnerCategory$_identifier', city: 'someKey' };
    expect(exportSourceKeyForField({ target: 'category' }, sourceKeys)).toBe('businessPartnerCategory$_identifier');
    expect(exportSourceKeyForField({ target: 'city', headerScope: 'contact' }, sourceKeys)).toBe('someKey');
  });

  it('treats a null override as "the row has no value", not as a missing entry', () => {
    expect(exportSourceKeyForField({ target: 'name' }, { name: null })).toBe('');
  });
});

describe('buildExportColumns', () => {
  it('emits one column per import field, in template order', () => {
    const config = loadImportConfig('contacts');
    expect(buildExportColumns(config)).toHaveLength(config.fields.length);
  });

  it('returns nothing when the window declares no import fields', () => {
    expect(buildExportColumns(null)).toEqual([]);
    expect(buildExportColumns({ spec: 'x' })).toEqual([]);
  });

  it('applies the hints registered for the config spec only', () => {
    registerExportHints('product', { sourceKeys: { category: 'productCategory$_identifier' } });
    const fields = [{ target: 'category', aliases: ['categoria'] }];
    expect(buildExportColumns({ spec: 'product', fields })[0].key).toBe('productCategory$_identifier');
    expect(buildExportColumns({ spec: 'contacts', fields })[0].key).toBe('category');
  });

  it('marks date fields so the backend reformats them to dd-MM-yyyy', () => {
    const columns = buildExportColumns({ spec: 'x', fields: [{ target: 'a', type: 'date' }, { target: 'b' }] });
    expect(columns.map((c) => c.type)).toEqual(['date', '']);
  });

  it('writes the header in the session language, not the field\'s first Spanish alias', () => {
    const fields = [{ target: 'name', aliases: ['nombre comercial'], label: 'Commercial Name' }];
    expect(buildExportColumns({ spec: 'x', fields })[0].label).toBe('nombre comercial');
    expect(buildExportColumns({ spec: 'x', fields }, { headerFor: englishHeaderFor })[0].label)
      .toBe('Commercial Name');
  });

  it('keeps the template\'s required marker, which mapColumns strips again on re-import', () => {
    const fields = [{ target: 'taxID', aliases: ['cif/nif'], required: true }];
    expect(buildExportColumns({ spec: 'x', fields })[0].label).toBe('cif/nif *');
  });
});

describe('serializeExportColumns', () => {
  it('joins columns into the key:Label[:type]|… spec NeoCsvExportService parses', () => {
    expect(serializeExportColumns([
      { key: 'name', label: 'nombre comercial', type: '' },
      { key: 'importDate', label: 'fecha', type: 'date' },
    ])).toBe('name:nombre comercial|importDate:fecha:date');
  });

  it('emits a sourceless column as a bare separator, which the backend renders empty', () => {
    expect(serializeExportColumns([{ key: '', label: 'ciudad', type: '' }])).toBe(':ciudad');
  });

  it('strips the spec separators from a label, which would otherwise shift every later column', () => {
    expect(serializeExportColumns([{ key: 'a', label: 'x:y|z', type: '' }])).toBe('a:x y z');
  });
});

describe('buildExportValueMaps', () => {
  it('keys the map by the column source key, which is what the backend sees on the row', () => {
    registerExportHints('product', {
      sourceKeys: { category: 'productCategory$_identifier' },
      valueLabels: { productType: { I: 'Articulo' }, category: { x: 'X' } },
    });
    const fields = [{ target: 'productType' }, { target: 'category' }];
    const config = { spec: 'product', fields };
    expect(buildExportValueMaps(config, buildExportColumns(config))).toEqual({
      productType: { I: 'Articulo' },
      'productCategory$_identifier': { x: 'X' },
    });
  });

  it('returns null when the window maps nothing, so the query param is left off', () => {
    expect(buildExportValueMaps({ spec: 'nope', fields: [{ target: 'a' }] }, [{ key: 'a' }])).toBeNull();
    registerExportHints('x', { sourceKeys: { a: 'b' } });
    expect(buildExportValueMaps({ spec: 'x', fields: [{ target: 'a' }] }, [{ key: 'b' }])).toBeNull();
  });

  it('skips a sourceless column — there is no value to translate', () => {
    registerExportHints('contacts', { valueLabels: { city: { a: 'b' } } });
    const fields = [{ target: 'city', headerScope: 'contact' }];
    const config = { spec: 'contacts', fields };
    expect(buildExportValueMaps(config, buildExportColumns(config))).toBeNull();
  });
});

// The reason the labels are derived from the descriptor's synonym tables rather than from an AD
// `$_identifier`: every word the export writes must be one the import accepts. Asserting it
// against `resolveCodedValue` is what makes that structural instead of a coincidence.
describe('every exported label re-imports', () => {
  it.each(['contacts', 'product'])('%s', (spec) => {
    const { valueLabels } = SHIPPED_HINTS[spec];
    expect(Object.keys(valueLabels).length).toBeGreaterThan(0);

    for (const [target, labels] of Object.entries(valueLabels)) {
      for (const [raw, label] of Object.entries(labels)) {
        // The label the export writes must resolve, and to the SAME code the raw value means —
        // a label that resolved to a different code would silently rewrite the record.
        const viaLabel = resolveCodedValue(label, ACCEPTED_BY_TARGET[target]);
        expect(viaLabel.status, `${target}: ${label}`).toBe('resolved');
        const viaRaw = resolveCodedValue(raw, ACCEPTED_BY_TARGET[target]);
        if (viaRaw.status === 'resolved') {
          expect(viaLabel.code, `${target}: ${raw} -> ${label}`).toBe(viaRaw.code);
        }
      }
    }
  });
});

// The synonym tables are private to each descriptor, so the round-trip assertion above restates
// them. They are asserted to still resolve, so a drift here fails rather than silently weakening
// the check.
const ACCEPTED_BY_TARGET = {
  etgoIsperson: {
    Y: ['Persona', 'Persona fisica', 'Fisica', 'Particular', 'Individuo', 'Person', 'Si', 'True'],
    N: ['Empresa', 'Persona juridica', 'Juridica', 'Sociedad', 'Compania', 'Company', 'Organizacion', 'No', 'False'],
  },
  oBTIKTaxIDKey: {
    1: ['NIF', 'CIF', 'CIF/NIF', 'NIF/CIF'],
    2: ['NOI'],
    3: ['Pasaporte', 'Passport'],
    4: ['Documento oficial de identificacion expedido por el pais', 'Documento oficial de identificacion', 'Documento oficial'],
    5: ['Certificado de residencia fiscal', 'Certificado de residencia'],
    6: ['Otro documento probatorio', 'Otro documento'],
    7: ['No Censado'],
  },
  productType: {
    I: ['Articulo', 'Item', 'Producto', 'Bien'],
    S: ['Servicio', 'Service'],
    E: ['Gasto', 'Expense', 'Expense type'],
    R: ['Recurso', 'Resource'],
    O: ['Online'],
  },
};

// The export exists to close the export -> edit -> import loop, which only holds while its
// headers are the ones the import template hands out. The template writer lives in
// app-shell-core and can change without this repo noticing (it already grew a required marker,
// a localized header and a collision pass), so assert the two against each other rather than
// against a hardcoded string.
describe('header parity with the import template (app-shell-core)', () => {
  const locales = [
    ['a Spanish session (no resolver)', undefined],
    ['an English session', englishHeaderFor],
  ];

  it.each(
    ['contacts', 'product'].flatMap((spec) => locales.map(([name, headerFor]) => [spec, name, headerFor])),
  )('%s matches buildTemplateCsv in %s', (spec, _name, headerFor) => {
    const config = loadImportConfig(spec);
    const headers = buildExportColumns(config, { headerFor }).map((c) => c.label);
    expect(headers.join(',')).toBe(
      buildTemplateCsv(config.fields, { headerFor, includeExampleRow: false }),
    );
  });

  // The point of matching the template is that the file can be edited and sent back. A header
  // the matcher does not recognize would fail silently: the column simply maps to null and the
  // user is asked to map it by hand.
  it.each(
    ['contacts', 'product'].flatMap((spec) => locales.map(([name, headerFor]) => [spec, name, headerFor])),
  )('%s re-imports its own exported headers in %s', (spec, _name, headerFor) => {
    const config = loadImportConfig(spec);
    // ImportDialog widens each field's aliases with the localized header before matching; the
    // export relies on that same step, so reproduce it here.
    const headers = buildExportColumns(config, { headerFor }).map((c) => c.label);
    const bare = buildExportColumns(
      { ...config, fields: config.fields.map((f) => ({ ...f, required: false })) },
      { headerFor },
    ).map((c) => c.label);
    const localizedFields = config.fields.map((field, i) => ({
      ...field, aliases: [...(field.aliases ?? []), bare[i]],
    }));
    const { mapping, unmappedTargets } = mapColumns(headers, localizedFields);
    expect(unmappedTargets).toEqual([]);
    expect(headers.map((h) => mapping[h])).toEqual(config.fields.map((f) => f.target));
  });
});

// Guards the two real windows against a rename on either side of the import/list divide: a
// column whose source key stops existing exports silently as an empty cell, which is exactly
// the failure a user would only notice after editing and re-importing the file.
describe('the shipped windows resolve their sources', () => {
  it('contacts: business-partner fields resolve, contact-scoped ones stay empty', () => {
    useShippedHints('contacts');
    const config = loadImportConfig('contacts');
    const columns = buildExportColumns(config);
    const byTarget = Object.fromEntries(config.fields.map((f, i) => [f.target, columns[i].key]));
    expect(byTarget.name).toBe('name');
    expect(byTarget.taxID).toBe('taxID');
    expect(byTarget.etgoIsperson).toBe('etgoIsperson');
    expect(byTarget.oBTIKTaxIDKey).toBe('oBTIKTaxIDKey');
    expect(byTarget.category).toBe('businessPartnerCategory$_identifier');
    // ETP-4997 — the child-scoped columns are no longer empty: BusinessPartnerHandler attaches
    // the primary contact person and address under `etgoChildData`, and the export addresses
    // them by dotted path (which NeoCsvExportService resolves into nested values).
    for (const target of ['email', 'firstName', 'lastName', 'phone', 'position', 'address', 'city', 'postal', 'country', 'region']) {
      expect(byTarget[target], target).toBe(`etgoChildData.${target}`);
    }
  });

  // The dotted path has to survive serialization intact — only ':' and '|' are the spec's
  // separators, so a '.' must NOT be sanitized away.
  it('contacts: dotted child paths survive the columns spec', () => {
    useShippedHints('contacts');
    const config = loadImportConfig('contacts');
    const spec = serializeExportColumns(buildExportColumns(config));
    expect(spec).toContain('etgoChildData.city:');
    expect(spec).toContain('etgoChildData.email:');
  });

  it('product: every field resolves to a key the product list row carries', () => {
    useShippedHints('product');
    const config = loadImportConfig('product');
    const columns = buildExportColumns(config);
    expect(Object.fromEntries(config.fields.map((f, i) => [f.target, columns[i].key]))).toEqual({
      searchKey: 'searchKey',
      name: 'name',
      description: 'description',
      productType: 'productType',
      uOM: 'uOM$_identifier',
      salesPrice: 'eTGOSalePrice',
      purchasePrice: 'eTGOPurchasePrice',
      category: 'productCategory$_identifier',
    });
  });
});
