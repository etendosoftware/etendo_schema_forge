import { describe, it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildTemplateCsv } from '@etendosoftware/app-shell-core/lib/import/buildTemplateCsv.js';
import { mapColumns } from '@etendosoftware/app-shell-core/lib/import/mapColumns.js';
import { parseDelimited } from '@etendosoftware/app-shell-core/lib/import/parseDelimited.js';
import { validateRow } from '@etendosoftware/app-shell-core/lib/import/validateRows.js';
import { buildOperations } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import '../contacts/contactsImportDescriptor.js';
import '../product/productImportDescriptor.js';

/**
 * ETP-4995 (P0), end to end: download the template the import popup itself hands out, fill
 * it in WITHOUT deleting any column, and import it.
 *
 * This is the acceptance criterion that was actually broken in production — the template
 * carried a "clave nif pais residencia" column whose empty cell overwrote a mandatory
 * default, so every row failed and the only workaround was deleting the column. Each
 * individual piece had passing tests; nothing exercised the whole path, which is exactly
 * where the bug lived.
 *
 * The import config is read from the GENERATED contract rather than from decisions.json, so
 * this also covers the generator's own `required` backfill: AD-mandatory columns that the
 * descriptor defaults (etgoIsperson, productType, uOM) must NOT come back as required, or
 * validateRow rejects the untouched template all over again.
 */
function importConfigFor(window) {
  // Walk up from the cwd to the repo root. Not `import.meta.url` (Vite serves test modules
  // under a /@fs prefix, which is not a real filesystem path) and not a fixed relative path
  // (the cwd differs between `npx vitest --root tools/app-shell` from the repo root and
  // `npm run vitest` from inside tools/app-shell).
  let dir = process.cwd();
  while (!existsSync(resolve(dir, 'artifacts', window, 'contract.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not locate artifacts/${window}/contract.json from ${process.cwd()}`);
    dir = parent;
  }
  const path = resolve(dir, 'artifacts', window, 'contract.json');
  return JSON.parse(readFileSync(path, 'utf8')).frontendContract.window.import;
}

/** Mirrors ImportDialog's own renameRowKeys: raw headers → target-keyed row. */
function renameRowKeys(row, mapping) {
  const renamed = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (target) renamed[target] = row[header];
  }
  return renamed;
}

function fillTemplate(config, values) {
  const headerLine = buildTemplateCsv(config.fields);
  const headers = headerLine.split(',');
  const cells = headers.map((h) => values[h.trim()] ?? '');
  return { headerLine, csv: `${headerLine}\n${cells.join(',')}` };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ETP-4995 — the downloaded CSV template round-trips', () => {
  it('maps every template header back onto its own field, for both windows', () => {
    for (const window of ['contacts', 'product']) {
      const config = importConfigFor(window);
      const headers = buildTemplateCsv(config.fields).split(',').map((h) => h.trim());
      const { mapping, unmappedTargets } = mapColumns(headers, config.fields);
      const unmappedHeaders = Object.entries(mapping).filter(([, target]) => !target).map(([h]) => h);
      assert.deepEqual(unmappedHeaders, [], `${window}: template headers that map to nothing`);
      assert.deepEqual(unmappedTargets, [], `${window}: fields with no template column`);
    }
  });

  it('imports a contacts template filled in without deleting any column', async () => {
    const config = importConfigFor('contacts');
    const { csv } = fillTemplate(config, {
      'nombre comercial': 'Acme Iberia SL',
      email: 'contacto@acme.example',
      telefono: '+34 910 000 001',
      'cif/nif': 'B12345678',
    });

    const { headers, rows } = parseDelimited(csv);
    const { mapping } = mapColumns(headers, config.fields);
    const row = renameRowKeys(rows[0], mapping);

    // The empty "clave nif pais residencia" cell is present and blank — the exact shape
    // that used to fail every row.
    assert.equal(row.oBTIKTaxIDKey, '');

    const requiredTargets = config.fields.filter((f) => f.required).map((f) => f.target);
    const emailTargets = config.fields.filter((f) => f.isEmail).map((f) => f.target);
    const { valid, errors } = validateRow(row, { requiredTargets, emailTargets });
    assert.deepEqual(errors, [], 'template row must pass preview validation');
    assert.ok(valid);

    const ops = await buildOperations(row, {
      spec: 'contacts', entity: 'businessPartner', descriptorName: 'contacts', token: 'tok-template',
      targets: config.fields.map((f) => f.target),
    });
    const bp = ops.find((op) => op.entity === 'businessPartner');
    assert.equal(bp.body.oBTIKTaxIDKey, '1');   // AD default, not ''
    assert.equal(bp.body.etgoIsperson, 'N');    // AD default, not ''
    assert.equal(bp.body.name, 'Acme Iberia SL');
    assert.equal(bp.body.searchKey, 'Acme Iberia SL');
  });

  // The import deliberately demands more than AD does: C_BPartner.TaxID is NOT mandatory in
  // the dictionary (ismandatory='N'), but a contact imported in bulk without a tax id is not
  // useful, so `decisions.json` declares it required. An explicit flag also survives the
  // generator's AD backfill, which would otherwise mark it optional.
  it('rejects a contacts row with no CIF/NIF, even though AD does not require it', () => {
    const config = importConfigFor('contacts');
    const requiredTargets = config.fields.filter((f) => f.required).map((f) => f.target);
    assert.ok(requiredTargets.includes('taxID'), 'taxID must be declared required');

    const { errors } = validateRow(
      { name: 'Sin NIF S.L.', taxID: '' },
      { requiredTargets, emailTargets: [] },
    );
    assert.deepEqual(errors.map((e) => e.target), ['taxID']);

    assert.deepEqual(
      validateRow({ name: 'Con NIF S.L.', taxID: 'B12345678' }, { requiredTargets, emailTargets: [] }).errors,
      [],
    );
  });

  it('imports a product template filled in without deleting any column', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (url.includes('/product/defaults')
      ? { ok: true, json: async () => ({ defaults: { uOM: 'UOM-DEFAULT' } }) }
      : { ok: true, json: async () => ({ items: [] }) })));

    const config = importConfigFor('product');
    const { csv } = fillTemplate(config, {
      codigo: 'P-001',
      nombre: 'Widget',
      descripcion: 'A widget',
    });

    const { headers, rows } = parseDelimited(csv);
    const { mapping } = mapColumns(headers, config.fields);
    const row = renameRowKeys(rows[0], mapping);

    assert.equal(row.productType, '');
    assert.equal(row.uOM, '');

    const requiredTargets = config.fields.filter((f) => f.required).map((f) => f.target);
    assert.deepEqual(validateRow(row, { requiredTargets }).errors, []);

    const ops = await buildOperations(row, {
      spec: 'product', entity: 'product', descriptorName: 'product', token: 'tok-template-product',
      targets: config.fields.map((f) => f.target),
    });
    assert.equal(ops.length, 1); // no price columns filled → product only
    assert.equal(ops[0].body.productType, 'I');
    assert.equal(ops[0].body.uOM, 'UOM-DEFAULT');
  });
});
