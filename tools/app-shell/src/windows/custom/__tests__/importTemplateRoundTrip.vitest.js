import { describe, it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildTemplateCsv } from '@etendosoftware/app-shell-core/lib/import/buildTemplateCsv.js';
import { mapColumns } from '@etendosoftware/app-shell-core/lib/import/mapColumns.js';
import { parseDelimited } from '@etendosoftware/app-shell-core/lib/import/parseDelimited.js';
import { validateRow } from '@etendosoftware/app-shell-core/lib/import/validateRows.js';
import { buildOperations } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import {
  BANK_STATEMENT_IMPORT_FIELDS,
  bankStatementFieldLabel,
} from '../financial-account/bankStatementImportFields.js';
// The template's own example amounts are asserted through the canonical parser, not by eye:
// `'0,00'` has to be a ZERO to the rule, not merely a non-blank cell.
import { parseStatementAmount } from '../financial-account/statementAmount.js';
import {
  applyStatementMapping,
  buildStatementCreatePayload,
  buildStatementEntries,
  buildStatementMapping,
  localizeFields,
  validateStatementRow,
} from '../financial-account/bankStatementImportPipeline.js';
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

/**
 * The template is no longer a bare header line: ETP-4996 added a required-column marker
 * ("cif/nif *") and a sample data row. Parsing it with the same parser a real upload goes
 * through is what keeps this test honest about the file the dialog actually hands out.
 */
function parseTemplate(config) {
  return parseDelimited(buildTemplateCsv(config.fields));
}

/**
 * Fill the template keyed by TARGET rather than by header text, so the fixture does not
 * have to restate the header spelling (marker included) that the template happens to use.
 */
function fillTemplate(config, valuesByTarget) {
  const { headers } = parseTemplate(config);
  const { mapping } = mapColumns(headers, config.fields);
  const cells = headers.map((h) => valuesByTarget[mapping[h]] ?? '');
  return { headerLine: headers.join(','), csv: `${headers.join(',')}\n${cells.join(',')}` };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ETP-4995 — the downloaded CSV template round-trips', () => {
  it('maps every template header back onto its own field, for both windows', () => {
    for (const window of ['contacts', 'product']) {
      const config = importConfigFor(window);
      const { headers } = parseTemplate(config);
      const { mapping, unmappedTargets } = mapColumns(headers, config.fields);
      const unmappedHeaders = Object.entries(mapping).filter(([, target]) => !target).map(([h]) => h);
      assert.deepEqual(unmappedHeaders, [], `${window}: template headers that map to nothing`);
      assert.deepEqual(unmappedTargets, [], `${window}: fields with no template column`);
    }
  });

  // ETP-4996. The marker is what tells the user which columns are mandatory; it must not
  // survive into matching, or the template the dialog hands out would fail to map its own
  // required columns — the ETP-4995 blocker, reintroduced by the fix for it.
  it('marks exactly the required columns, and the marker never breaks the mapping', () => {
    for (const window of ['contacts', 'product']) {
      const config = importConfigFor(window);
      const { headers } = parseTemplate(config);
      const { mapping } = mapColumns(headers, config.fields);
      const requiredTargets = config.fields.filter((f) => f.required).map((f) => f.target);
      const markedTargets = headers.filter((h) => h.trim().endsWith('*')).map((h) => mapping[h]);
      assert.deepEqual(markedTargets.sort(), requiredTargets.sort(), `${window}: marked columns`);
    }
  });

  // The sample row must survive the CSV round-trip byte-for-byte. `csvField` prepends an
  // apostrophe to any value starting with = + - @ to neutralize spreadsheet formula
  // injection (CWE-1236) — correct, and it silently mangles our own example: a phone
  // declared as "+34 910 000 001" came back as "'+34 910 000 001". The guard is not the
  // bug; an example that trips it is.
  it('ships example values that survive CSV serialization unchanged, for both windows', () => {
    for (const window of ['contacts', 'product']) {
      const config = importConfigFor(window);
      const { headers, rows } = parseTemplate(config);
      const { mapping } = mapColumns(headers, config.fields);
      const row = renameRowKeys(rows[0], mapping);
      for (const field of config.fields) {
        if (field.example == null || field.example === '') continue;
        assert.equal(row[field.target], field.example,
          `${window}: example for "${field.target}" did not round-trip`);
      }
    }
  });

  // The sample row we ship has to be a row that actually imports. A template whose own
  // example fails validation teaches the user the wrong format.
  it('ships a sample row that passes validation, for both windows', () => {
    for (const window of ['contacts', 'product']) {
      const config = importConfigFor(window);
      const { headers, rows } = parseTemplate(config);
      assert.equal(rows.length, 1, `${window}: expected exactly one sample row`);
      const { mapping } = mapColumns(headers, config.fields);
      const row = renameRowKeys(rows[0], mapping);
      const requiredTargets = config.fields.filter((f) => f.required).map((f) => f.target);
      const emailTargets = config.fields.filter((f) => f.isEmail).map((f) => f.target);
      const numericTargets = config.fields.filter((f) => f.isNumeric).map((f) => f.target);
      const { errors } = validateRow(row, { requiredTargets, emailTargets, numericTargets });
      assert.deepEqual(errors, [], `${window}: sample row must validate`);
    }
  });

  it('imports a contacts template filled in without deleting any column', async () => {
    const config = importConfigFor('contacts');
    const { csv } = fillTemplate(config, {
      name: 'Acme Iberia SL',
      etgoEmail: 'contacto@acme.example',
      etgoPhone: '+34 910 000 001',
      taxID: 'B12345678',
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
      searchKey: 'P-001',
      name: 'Widget',
      description: 'A widget',
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

/**
 * ETP-4954 — the same round trip for the bank-statement import.
 *
 * Statements are not a ListView window (they import from a modal inside the financial
 * account's detail), so there is no `artifacts/<window>/contract.json → window.import` block
 * to read: the descriptor is a JS module and is imported directly. Everything else is the
 * identical path a real upload takes — `buildTemplateCsv` writes the file the modal hands
 * out, `parseDelimited` reads it back, `mapColumns` auto-matches it, and `validateStatementRow`
 * (generic checks + the registered `bank-statement` amount rule) validates the sample row.
 *
 * The round trip is the whole reason the template is usable: download it, fill it in, upload
 * it back, and nothing has to be mapped by hand.
 */
describe('ETP-4954 — the bank-statement CSV template round-trips', () => {
  const FIELDS = BANK_STATEMENT_IMPORT_FIELDS;

  it('maps every template header back onto its own field', () => {
    const { headers } = parseDelimited(buildTemplateCsv(FIELDS));
    const { mapping, unmappedTargets } = mapColumns(headers, FIELDS);
    assert.deepEqual(
      Object.entries(mapping).filter(([, target]) => !target).map(([h]) => h),
      [],
      'template headers that map to nothing',
    );
    assert.deepEqual(unmappedTargets, [], 'fields with no template column');
    // And each header lands on the field it was written for, not merely on *some* field.
    assert.deepEqual(Object.values(mapping), FIELDS.map((f) => f.target));
  });

  // Only the date is mandatory. A blank reference is stored as `**`, exactly as the manual
  // form and the pre-ETP-4954 importer already did — marking it required in the template
  // would invent a constraint neither flow has.
  it('marks exactly the date column as required, and the marker never breaks the mapping', () => {
    const { headers } = parseDelimited(buildTemplateCsv(FIELDS));
    const { mapping } = mapColumns(headers, FIELDS);
    const markedHeaders = headers.filter((h) => h.trim().endsWith('*'));
    assert.deepEqual(markedHeaders.map((h) => mapping[h]), ['date']);
  });

  it('ships example values that survive CSV serialization unchanged', () => {
    const { headers, rows } = parseDelimited(buildTemplateCsv(FIELDS));
    const { mapping } = mapColumns(headers, FIELDS);
    const row = renameRowKeys(rows[0], mapping);
    for (const field of FIELDS) {
      assert.equal(row[field.target], field.example,
        `example for "${field.target}" did not round-trip`);
    }
    // "Cliente Ejemplo, S.L." carries the delimiter — the quoting has to survive it, or the
    // template's own sample row shifts every column to its right.
    assert.equal(row.bpartnerName, 'Cliente Ejemplo, S.L.');
  });

  // A template whose own example fails validation teaches the user the wrong format. Note
  // the sample amounts (`150,00` out / `0,00` in) are exactly the shape the amount rule
  // accepts: one side above zero, neither side below it.
  it('ships a sample row that passes the full statement validation', () => {
    const { headers, rows } = parseDelimited(buildTemplateCsv(FIELDS));
    assert.equal(rows.length, 1, 'expected exactly one sample row');
    const { mapping } = mapColumns(headers, FIELDS);
    const row = renameRowKeys(rows[0], mapping);
    assert.deepEqual(validateStatementRow(row, (k) => k).errors, []);
  });

  /**
   * ETP-4954 (product decision) — the template must stay importable under the "exactly one
   * side" clause, which is the ETP-4995 class of bug all over again.
   *
   * The rule now reads: at least one amount above zero, no amount below zero, and NEVER both
   * sides filled. The template's own sample row ships `out: '150,00'` and `in: '0,00'` — TWO
   * NON-BLANK amount cells. If the clause were ever implemented as "reject a row whose two
   * amount cells are both non-blank" rather than "both above zero", the file the dialog itself
   * hands the user would come back rejected on upload, with no column to delete to fix it.
   *
   * The test above already asserts the sample row validates clean; this one pins WHY it is
   * allowed to, and names the message that must not appear — otherwise a future rewrite could
   * satisfy "errors is empty" while quietly moving the boundary.
   */
  it('keeps the sample row importable under the exactly-one-side rule, explicit zero and all', () => {
    const out = FIELDS.find((f) => f.target === 'out');
    const inn = FIELDS.find((f) => f.target === 'in');
    // The shape being pinned: one side above zero, the other an EXPLICIT zero (not blank).
    assert.equal(out.example, '150,00');
    assert.equal(inn.example, '0,00');
    assert.notEqual(inn.example, '', 'the sample row must keep an explicit zero, not a blank');
    assert.ok(parseStatementAmount(out.example) > 0);
    assert.equal(parseStatementAmount(inn.example), 0);

    const { headers, rows } = parseDelimited(buildTemplateCsv(FIELDS));
    const { mapping } = mapColumns(headers, FIELDS);
    const row = renameRowKeys(rows[0], mapping);
    const { valid, errors } = validateStatementRow(row, (k) => k);
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
    // Named explicitly: an "exactly one side" clause that counted non-blank cells instead of
    // positive amounts would flag the template's own row here.
    const messages = errors.map((e) => e.message);
    assert.ok(!messages.includes('financeAccountStatementsImportErrorBothAmounts'));
    assert.ok(!messages.some((m) => /not in both/i.test(m)));
  });

  // And the row that would be rejected, straight from the same template shape — so the pin
  // above is a real boundary and not a vacuous truth about any row at all.
  it('would reject the same sample row if its zero were replaced by an amount', () => {
    const { headers, rows } = parseDelimited(buildTemplateCsv(FIELDS));
    const { mapping } = mapColumns(headers, FIELDS);
    const row = { ...renameRowKeys(rows[0], mapping), in: '30,00' };
    const { valid, errors } = validateStatementRow(row, (k) => k);
    assert.equal(valid, false);
    assert.deepEqual(errors.map((e) => e.target), ['out', 'in']);
  });

  it('turns the sample row into a sendable payload line', () => {
    const { headers, rows } = parseDelimited(buildTemplateCsv(FIELDS));
    const { mapping } = mapColumns(headers, FIELDS);
    const entries = buildStatementEntries(applyStatementMapping(rows, mapping), (k) => k);
    const payload = buildStatementCreatePayload({
      accountId: 'acc-1', file: { name: 'plantilla.csv' }, entries, name: 'plantilla',
    });
    assert.equal(payload.lines.length, 1);
    assert.deepEqual(payload.lines[0], {
      date: '2026-08-01T00:00:00Z',
      reference: 'REF-001',
      description: 'Transferencia recibida',
      bpartnerName: 'Cliente Ejemplo, S.L.',
      bpartnerId: null,
      glItemId: null,
      in: 0,
      out: 150,
    });
  });

  // The template the modal actually hands out carries SESSION-LANGUAGE headers (resolved
  // through the very `financeAccountStatementsManualCol*` keys the line grid uses), and the
  // upload is mapped against `localizeFields(ui)`. That pair has to close the loop too, or a
  // template downloaded in Spanish cannot be uploaded back.
  it('round-trips a template written with session-language headers', () => {
    const LOCALIZED = {
      financeAccountStatementsManualColDate: 'Fecha valor',
      financeAccountStatementsManualColReference: 'Referencia bancaria',
      financeAccountStatementsManualColDesc: 'Concepto',
      financeAccountStatementsManualColContactName: 'Tercero',
      financeAccountStatementsManualColOut: 'Cargo',
      financeAccountStatementsManualColIn: 'Abono',
    };
    const ui = (key) => LOCALIZED[key] ?? key;

    const csv = buildTemplateCsv(FIELDS, { headerFor: bankStatementFieldLabel(ui) });
    const { headers, rows } = parseDelimited(csv);
    assert.deepEqual(headers, ['Fecha valor *', 'Referencia bancaria', 'Concepto', 'Tercero', 'Cargo', 'Abono']);

    const { mapping, unmappedTargets } = buildStatementMapping(headers, ui);
    assert.deepEqual(Object.values(mapping), FIELDS.map((f) => f.target));
    assert.deepEqual(unmappedTargets, []);

    const row = renameRowKeys(rows[0], mapping);
    assert.deepEqual(validateStatementRow(row, ui).errors, []);
  });
});

/**
 * ETP-4954 — the same round trip ACROSS LANGUAGES.
 *
 * The template's headers are resolved in the SESSION language, so a template is downloaded in
 * one language and uploaded back in whatever language the session happens to be then. Measured
 * before the fix: a template downloaded by an English session and re-uploaded by a Spanish one
 * auto-matched 2 of its 6 columns — `Date *`, `Contact name`, `Out` and `In` all came back
 * unmapped, because only the Spanish labels were declared as aliases. The reverse direction
 * happened to work, which is what made the gap asymmetric and easy to miss.
 *
 * `BANK_STATEMENT_IMPORT_FIELDS` therefore carries EVERY locale's label in its `aliases`, not
 * just the active session's. Locale dictionaries are lazy-loaded one locale at a time
 * (ETP-4300), so the labels cannot be gathered at runtime; they are static in the descriptor,
 * and this suite is the only thing standing between a renamed label and a silently broken round
 * trip. It reads the shipped locale files directly and derives both the locale list and the
 * header strings from them — nothing here restates a label, so renaming
 * `financeAccountStatementsManualColOut` in any locale file fails these tests.
 */
describe('ETP-4954 — the bank-statement template round-trips across languages', () => {
  const FIELDS = BANK_STATEMENT_IMPORT_FIELDS;

  /**
   * Locate `src/locales` the same way `importConfigFor` locates `artifacts/`: walk up from the
   * cwd, which differs between `npx vitest --root tools/app-shell` run from the repo root and
   * `npm run vitest` run from inside `tools/app-shell`.
   */
  function localesDir() {
    let dir = process.cwd();
    for (;;) {
      for (const candidate of ['src/locales', 'tools/app-shell/src/locales']) {
        const path = resolve(dir, candidate, 'en_US.json');
        if (existsSync(path)) return dirname(path);
      }
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`could not locate src/locales from ${process.cwd()}`);
      dir = parent;
    }
  }

  /** Every shipped locale, derived from the directory rather than from a hardcoded list. */
  function shippedLocales() {
    const dir = localesDir();
    return readdirSync(dir)
      .filter((file) => /^[a-z]{2}_[A-Z]{2}\.json$/.test(file))
      .sort()
      .map((file) => ({
        locale: file.replace(/\.json$/, ''),
        dict: JSON.parse(readFileSync(resolve(dir, file), 'utf8')),
      }));
  }

  /** A `useUI()`-shaped translator backed by a real locale dictionary. */
  const uiFor = (dict) => (key) => dict.genericLabels?.[key] ?? key;

  const LOCALES = shippedLocales();

  it('ships the three locales these tests reason about', () => {
    assert.ok(LOCALES.length >= 3, `expected at least 3 locale files, found ${LOCALES.length}`);
    assert.deepEqual(
      LOCALES.map((l) => l.locale).filter((l) => ['en_US', 'es_ES', 'es_AR'].includes(l)),
      ['en_US', 'es_AR', 'es_ES'],
    );
  });

  // The drift guard. Matching is done against the RAW descriptor, never against
  // `localizeFields(ui)`: the latter injects the session's own label as an alias and would
  // mask exactly the omission this test exists to catch.
  it('declares every locale label of every field as an alias', () => {
    for (const { locale, dict } of LOCALES) {
      const headerFor = bankStatementFieldLabel(uiFor(dict));
      for (const field of FIELDS) {
        const header = headerFor(field);
        assert.notEqual(header, field.labelKey,
          `${locale}: no translation for "${field.labelKey}"`);
        const { mapping } = mapColumns([header], FIELDS);
        assert.equal(mapping[header], field.target,
          `${locale}: header "${header}" (${field.labelKey}) does not map back to "${field.target}" `
          + '— add it to BANK_STATEMENT_IMPORT_FIELDS.aliases');
      }
    }
  });

  // And the locale's six headers together must map one-to-one: a field can only claim one
  // column, so an alias shared with an earlier field would steal it and leave another unmapped.
  it('maps each locale\'s full header set one-to-one onto the fields', () => {
    for (const { locale, dict } of LOCALES) {
      const headerFor = bankStatementFieldLabel(uiFor(dict));
      const headers = FIELDS.map(headerFor);
      const { mapping, unmappedTargets } = mapColumns(headers, FIELDS);
      assert.deepEqual(Object.values(mapping), FIELDS.map((f) => f.target),
        `${locale}: each header must land on its own field`);
      assert.deepEqual(unmappedTargets, [], `${locale}: fields with no column`);
    }
  });

  // The full matrix: every (download locale, session locale) pair, through the real path — the
  // template the modal hands out, `parseDelimited` reading it back, `buildStatementMapping`
  // auto-matching it against the session's localized fields.
  it('round-trips the template for every download-locale / session-locale pair', () => {
    let pairs = 0;
    for (const download of LOCALES) {
      const csv = buildTemplateCsv(FIELDS, { headerFor: bankStatementFieldLabel(uiFor(download.dict)) });
      const { headers } = parseDelimited(csv);
      for (const session of LOCALES) {
        const where = `downloaded in ${download.locale}, uploaded in ${session.locale}`;
        const { mapping, unmappedTargets } = buildStatementMapping(headers, uiFor(session.dict));
        assert.deepEqual(
          Object.entries(mapping).filter(([, target]) => !target).map(([header]) => header),
          [],
          `${where}: template headers that map to nothing`,
        );
        assert.deepEqual(unmappedTargets, [], `${where}: fields with no template column`);
        assert.deepEqual(Object.values(mapping), FIELDS.map((f) => f.target),
          `${where}: each header must land on the field it was written for`);
        pairs += 1;
      }
    }
    assert.equal(pairs, LOCALES.length ** 2, 'every locale pair must be exercised');
    assert.ok(pairs >= 9, `expected at least the 3x3 matrix, ran ${pairs} pairs`);
  });

  // The example values are locale-independent (`01/08/2026`, `150,00`), so a template's sample
  // row has to survive the crossing too: it must still land on the right targets AND still
  // validate under the other session's rules.
  it('keeps the example row importable when the session language differs', () => {
    for (const download of LOCALES) {
      const csv = buildTemplateCsv(FIELDS, { headerFor: bankStatementFieldLabel(uiFor(download.dict)) });
      const { headers, rows } = parseDelimited(csv);
      for (const session of LOCALES) {
        const where = `downloaded in ${download.locale}, uploaded in ${session.locale}`;
        const sessionUi = uiFor(session.dict);
        const { mapping } = buildStatementMapping(headers, sessionUi);
        const row = renameRowKeys(rows[0], mapping);
        for (const field of FIELDS) {
          assert.equal(row[field.target], field.example,
            `${where}: example for "${field.target}" did not survive the crossing`);
        }
        assert.deepEqual(validateStatementRow(row, sessionUi).errors, [],
          `${where}: the sample row must still validate`);
      }
    }
  });
});

/**
 * ETP-4954 (QA return) — the template's SAMPLE ROW is translated too, not just its headers.
 *
 * `TemplateLinks` used to hand the RAW descriptor to `buildTemplateCsv`/`buildTemplateXlsx`, so
 * the headers came out in the session language while the example row underneath them stayed
 * Spanish — an English session downloaded `Date, Reference No., Description, Contact name, Out,
 * In` over `2026-08-01, REF-001, Transferencia recibida, Cliente Ejemplo S.L., 150,00, 0,00`.
 * Each field now carries an `exampleKey` and `localizeFields` resolves it, so the whole file
 * speaks one language.
 *
 * Everything below goes through `localizeFields(ui)` — the same call `TemplateLinks` makes —
 * rather than through the raw descriptor, because the raw descriptor is precisely what the bug
 * was. And it re-runs the ETP-4995 round trip on the localized file: the dialog must never hand
 * out a template it cannot itself import, and that now has three locales to stay true in.
 */
describe('ETP-4954 — the template sample row is localized and still round-trips', () => {
  const FIELDS = BANK_STATEMENT_IMPORT_FIELDS;

  function localesDir() {
    let dir = process.cwd();
    for (;;) {
      for (const candidate of ['src/locales', 'tools/app-shell/src/locales']) {
        const path = resolve(dir, candidate, 'en_US.json');
        if (existsSync(path)) return dirname(path);
      }
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`could not locate src/locales from ${process.cwd()}`);
      dir = parent;
    }
  }

  function shippedLocales() {
    const dir = localesDir();
    return readdirSync(dir)
      .filter((file) => /^[a-z]{2}_[A-Z]{2}\.json$/.test(file))
      .sort()
      .map((file) => ({
        locale: file.replace(/\.json$/, ''),
        dict: JSON.parse(readFileSync(resolve(dir, file), 'utf8')),
      }));
  }

  const uiFor = (dict) => (key) => dict.genericLabels?.[key] ?? key;
  const LOCALES = shippedLocales();

  /** The localized template, parsed back and keyed by target — the file the user receives. */
  function templateRowFor(dict) {
    const ui = uiFor(dict);
    const fields = localizeFields(ui);
    const { headers, rows } = parseDelimited(buildTemplateCsv(fields, { headerFor: bankStatementFieldLabel(ui) }));
    const { mapping } = mapColumns(headers, fields);
    return { ui, fields, headers, mapping, row: renameRowKeys(rows[0], mapping) };
  }

  it('declares an exampleKey on every field, translated in every shipped locale', () => {
    for (const field of FIELDS) {
      assert.ok(field.exampleKey, `${field.target}: missing exampleKey`);
    }
    for (const { locale, dict } of LOCALES) {
      for (const field of FIELDS) {
        const value = uiFor(dict)(field.exampleKey);
        assert.notEqual(value, field.exampleKey,
          `${locale}: no translation for "${field.exampleKey}"`);
        assert.notEqual(value, '', `${locale}: empty example for "${field.target}"`);
      }
    }
  });

  it('writes the session language\'s example values into the file, not the descriptor defaults', () => {
    for (const { locale, dict } of LOCALES) {
      const { row } = templateRowFor(dict);
      for (const field of FIELDS) {
        assert.equal(row[field.target], uiFor(dict)(field.exampleKey),
          `${locale}: example for "${field.target}" is not the locale's own value`);
      }
    }
  });

  it('hands an English session an English sample row', () => {
    // The concrete regression QA reported: English headers over Spanish sample data.
    const en = LOCALES.find((l) => l.locale === 'en_US');
    const { row } = templateRowFor(en.dict);
    assert.equal(row.description, 'Incoming transfer');
    assert.equal(row.bpartnerName, 'Example Customer Ltd');
    assert.notEqual(row.description, 'Transferencia recibida');
  });

  it('keeps the date example ISO and IDENTICAL in every locale, on purpose', () => {
    // Deliberate divergence from the rest of the row: the parser reads every SEPARATED date
    // day-first, so a localized `08/01/2026` would teach an English reader to fill the column
    // in a format the importer then reads as 8 January. ISO is unambiguous everywhere and the
    // parser accepts it — so this one value must NOT follow the session language.
    const dates = LOCALES.map(({ locale, dict }) => [locale, templateRowFor(dict).row.date]);
    for (const [locale, date] of dates) {
      assert.equal(date, '2026-08-01', `${locale}: the date example must stay ISO`);
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${locale}: the date example must stay ISO-shaped`);
      assert.ok(!date.includes('/'), `${locale}: a separated date would be read day-first`);
    }
    assert.equal(new Set(dates.map(([, d]) => d)).size, 1,
      'the date example must be the same string in every locale');
  });

  it('DOES localize the amount examples — es uses the decimal comma, en the decimal point', () => {
    // The counterpart to the date: amounts are read by `parseStatementAmount`, which handles
    // both conventions, so here the sample row must show the reader their own.
    const byLocale = Object.fromEntries(LOCALES.map(({ locale, dict }) => [locale, templateRowFor(dict).row]));
    assert.equal(byLocale.en_US.out, '150.00');
    assert.equal(byLocale.en_US.in, '0.00');
    assert.equal(byLocale.es_ES.out, '150,00');
    assert.equal(byLocale.es_ES.in, '0,00');
    assert.equal(byLocale.es_AR.out, '150,00');
    assert.equal(byLocale.es_AR.in, '0,00');
    assert.ok(new Set(LOCALES.map(({ dict }) => templateRowFor(dict).row.out)).size > 1,
      'the amount example must differ between locales, unlike the date');
  });

  it('parses every locale\'s amount examples to the same numbers', () => {
    for (const { locale, dict } of LOCALES) {
      const { row } = templateRowFor(dict);
      assert.equal(parseStatementAmount(row.out), 150, `${locale}: out example`);
      assert.equal(parseStatementAmount(row.in), 0, `${locale}: in example`);
    }
  });

  it('auto-maps 6/6 columns of its own localized template, in every locale', () => {
    for (const { locale, dict } of LOCALES) {
      const { headers } = templateRowFor(dict);
      assert.equal(headers.length, FIELDS.length, `${locale}: template column count`);
      const { mapping, unmappedTargets } = buildStatementMapping(headers, uiFor(dict));
      assert.deepEqual(
        Object.entries(mapping).filter(([, target]) => !target).map(([h]) => h),
        [],
        `${locale}: template headers that map to nothing`,
      );
      assert.deepEqual(unmappedTargets, [], `${locale}: fields with no template column`);
      assert.deepEqual(Object.values(mapping), FIELDS.map((f) => f.target),
        `${locale}: each header must land on its own field`);
    }
  });

  it('ships a localized sample row that validates clean, in every locale', () => {
    // The ETP-4995 class of bug: the dialog handing out a file it cannot itself import. A
    // localized example row is a NEW way to reintroduce it — a translated amount the parser
    // cannot read, or a translated date the day-first reader rejects, would fail here.
    for (const { locale, dict } of LOCALES) {
      const { row, ui } = templateRowFor(dict);
      const { valid, errors } = validateStatementRow(row, ui);
      assert.deepEqual(errors, [], `${locale}: the localized sample row must validate`);
      assert.equal(valid, true, `${locale}: the localized sample row must be valid`);
    }
  });

  it('turns every locale\'s sample row into the identical sendable payload line', () => {
    // Different text in, same numbers out: the localization is presentation only and must not
    // change a single value that reaches the backend.
    for (const { locale, dict } of LOCALES) {
      const ui = uiFor(dict);
      const fields = localizeFields(ui);
      const { headers, rows } = parseDelimited(
        buildTemplateCsv(fields, { headerFor: bankStatementFieldLabel(ui) }),
      );
      const { mapping } = mapColumns(headers, fields);
      const entries = buildStatementEntries(applyStatementMapping(rows, mapping), ui);
      const payload = buildStatementCreatePayload({
        accountId: 'acc-1', file: { name: 'plantilla.csv' }, entries, name: 'plantilla',
      });
      assert.equal(payload.lines.length, 1, `${locale}: one line`);
      assert.equal(payload.lines[0].date, '2026-08-01T00:00:00Z', `${locale}: date`);
      assert.equal(payload.lines[0].out, 150, `${locale}: out`);
      assert.equal(payload.lines[0].in, 0, `${locale}: in`);
      assert.equal(payload.lines[0].description, ui('financeAccountStatementsImportExampleDesc'),
        `${locale}: description`);
    }
  });

  it('round-trips a localized template across every download-locale / session-locale pair', () => {
    // The cross-language matrix, re-run on the LOCALIZED file: a template downloaded in one
    // language must still auto-map and validate when uploaded by a session in another.
    let pairs = 0;
    for (const download of LOCALES) {
      const { headers, rows } = (() => {
        const ui = uiFor(download.dict);
        const fields = localizeFields(ui);
        return parseDelimited(buildTemplateCsv(fields, { headerFor: bankStatementFieldLabel(ui) }));
      })();
      for (const session of LOCALES) {
        const where = `downloaded in ${download.locale}, uploaded in ${session.locale}`;
        const sessionUi = uiFor(session.dict);
        const { mapping, unmappedTargets } = buildStatementMapping(headers, sessionUi);
        assert.deepEqual(unmappedTargets, [], `${where}: fields with no template column`);
        assert.deepEqual(Object.values(mapping), FIELDS.map((f) => f.target),
          `${where}: each header must land on the field it was written for`);
        const row = renameRowKeys(rows[0], mapping);
        assert.deepEqual(validateStatementRow(row, sessionUi).errors, [],
          `${where}: the localized sample row must still validate`);
        pairs += 1;
      }
    }
    assert.equal(pairs, LOCALES.length ** 2, 'every locale pair must be exercised');
    assert.ok(pairs >= 9, `expected at least the 3x3 matrix, ran ${pairs} pairs`);
  });

  it('leaves the raw descriptor untouched — localizeFields must not mutate it', () => {
    const before = FIELDS.map((f) => f.example);
    for (const { dict } of LOCALES) templateRowFor(dict);
    assert.deepEqual(FIELDS.map((f) => f.example), before,
      'localizeFields must return new objects, not edit the shared descriptor');
  });
});
