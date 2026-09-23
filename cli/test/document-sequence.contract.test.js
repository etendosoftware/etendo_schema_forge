/**
 * Per-window structural tests for the document-sequence window (ETP-5285).
 *
 * The window shows a FIXED set of six product-defined document series, provisioned by
 * the onboarding dataset. A user must not be able to add a seventh or remove one of the
 * six, and must not be able to rename one — renaming drops the row out of
 * `DocumentSequenceHandler.VISIBLE_SEQUENCE_NAMES` (which matches on `AD_Sequence.Name`)
 * and makes it unreachable, silently and permanently.
 *
 * These tests pin that intent at the CONTRACT level, which is what actually enforces it:
 * `entities.sequence.methods` in decisions.json becomes `apiPrediction.crud.sequence`,
 * which `push-to-neo` writes to `ETGO_SF_ENTITY.ISPOST`/`ISDELETE`, which
 * `NeoCrudHandler` reads through `NeoMethodPolicy.isMethodEnabled` to answer `405` on a
 * POST or DELETE. `window.hideCreate`/`hideDeleteButton` only remove the buttons — they
 * are the affordance half, asserted separately below, and are NOT the guard.
 *
 * What is explicitly NOT tested here (already covered elsewhere):
 *   - contract.json validity            → cli/test/contract-all.test.js
 *   - registry / index.jsx / mockData   → cli/test/wiring-completeness.test.js
 *   - the six-name allowlist itself     → DocumentSequenceHandlerTest (com.etendoerp.go)
 *   - the corrective data-fix           → cli/test/data-fixes-r38-*.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(ROOT, 'artifacts', 'document-sequence');

const decisions = JSON.parse(readFileSync(join(ART, 'decisions.json'), 'utf8'));
const contract = JSON.parse(readFileSync(join(ART, 'contract.json'), 'utf8'));
const crud = contract.apiPrediction.crud.sequence;
const page = readFileSync(
  join(ART, 'generated', 'web', 'document-sequence', 'SequencePage.jsx'), 'utf8');

/** The five fields ETP-5285 fixed as visible, in the ticket's own order. */
const VISIBLE_FIELDS = ['name', 'description', 'prefix', 'startingNo', 'nextAssignedNumber'];

describe('document-sequence — the set of series is fixed (no create, no delete)', () => {
  it('declares a read-plus-update method allowlist in decisions.json', () => {
    assert.deepEqual(
      decisions.entities.sequence.methods,
      ['GET', 'GETBYID', 'PUT', 'PATCH'],
      'the six series are provisioned by the dataset; the window edits them, never adds one',
    );
  });

  it('refuses POST at the API level, not merely in the toolbar', () => {
    // This is the line that becomes ETGO_SF_ENTITY.ISPOST='N' and makes NeoCrudHandler
    // answer 405. `hideCreate` alone would leave the endpoint open.
    assert.equal(crud.post, false);
    assert.ok(!crud.methods.includes('POST'));
  });

  it('refuses DELETE at the API level', () => {
    // Deleting one of the six orphans C_DocType.DocNoSequence_ID and breaks the
    // numbering of every document of that type.
    assert.equal(crud.delete, false);
    assert.ok(!crud.methods.includes('DELETE'));
  });

  it('still allows reading and editing the six series', () => {
    assert.equal(crud.get, true);
    assert.equal(crud.getById, true);
    assert.equal(crud.put, true);
    assert.equal(crud.patch, true);
  });

  it('also removes the create and delete affordances from the UI', () => {
    // Belt and braces: without these the user sees buttons that answer 405.
    assert.equal(decisions.window.hideCreate, true);
    assert.equal(decisions.window.hideDeleteButton, true);
    assert.equal(decisions.entities.sequence.hideDelete, true);
    assert.match(page, /\bhideCreate\b/);
    assert.match(page, /\bhideDeleteButton\b/);
  });
});

describe('document-sequence — exactly the five fields ETP-5285 specified', () => {
  const fields = decisions.entities.sequence.fields;

  it('shows those five in both grid and form, and nothing else', () => {
    const shown = Object.entries(fields)
      .filter(([, f]) => f.grid === true || f.form === true)
      .map(([k]) => k);
    assert.deepEqual(shown.sort(), [...VISIBLE_FIELDS].sort());
  });

  it('orders the grid the way the ticket lists them', () => {
    const byOrder = VISIBLE_FIELDS.map((k) => fields[k].gridOrder);
    assert.deepEqual(byOrder, [1, 2, 3, 4, 5]);
  });

  it('keeps every other field discarded', () => {
    for (const [key, f] of Object.entries(fields)) {
      if (VISIBLE_FIELDS.includes(key)) continue;
      assert.equal(f.visibility, 'discarded', `${key} must stay discarded`);
    }
  });

  it('never re-exposes a field ETP-5285 removed', () => {
    for (const gone of ['suffix', 'incrementBy', 'autoNumbering',
      'restartSequenceEveryYear', 'mask', 'valueFormat']) {
      assert.equal(fields[gone].visibility, 'discarded', `${gone} was removed by ETP-5285`);
      assert.notEqual(fields[gone].grid, true);
      assert.notEqual(fields[gone].form, true);
    }
  });
});

describe('document-sequence — the series name is read-only and displayed translated', () => {
  const name = decisions.entities.sequence.fields.name;

  it('is readOnly, because renaming drops the row out of the handler allowlist', () => {
    assert.equal(name.visibility, 'readOnly');
  });

  it('maps all six canonical AD names to key-shaped i18n keys', () => {
    // `resolveEnumLabelKey` passes a key-shaped `name` through verbatim; anything else
    // is re-derived as `<column><Value>` and would silently miss the locale entry.
    //
    // These values are `AD_Sequence.Name`, so they must stay byte-identical to
    // `DocumentSequenceHandler.VISIBLE_SEQUENCE_NAMES` — the handler filters the list on
    // exactly this string and a mismatch hides the row with no error anywhere. ETP-5364
    // added the sixth, 'AP Invoice'.
    const KEY_SHAPED = /^[a-z][a-zA-Z0-9]*$/;
    assert.equal(name.enumValues.length, 6);
    for (const { value, name: key } of name.enumValues) {
      assert.ok(value.length > 0);
      assert.match(key, KEY_SHAPED, `${key} is not key-shaped`);
    }
    assert.deepEqual(name.enumValues.map((o) => o.value), [
      'Purchase Order',
      'Standard Order',
      'AR Invoice',
      'Factura Rectificativa (Ventas)',
      'AP Invoice',
      'Factura Rectificativa (Compras)',
    ]);
  });

  it('has every label key present in all three locale files', () => {
    // A missing key renders the raw English name in Spanish, with no error anywhere.
    for (const locale of ['en_US', 'es_ES', 'es_AR']) {
      const dict = JSON.parse(readFileSync(
        join(ROOT, 'tools', 'app-shell', 'src', 'locales', `${locale}.json`), 'utf8'));
      for (const { name: key } of name.enumValues) {
        assert.ok(dict.genericLabels[key],
          `${locale}.json is missing genericLabels.${key}`);
      }
    }
  });

  it('translates the Spanish labels to the names the ticket uses', () => {
    const es = JSON.parse(readFileSync(
      join(ROOT, 'tools', 'app-shell', 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
    assert.equal(es.documentSequencePurchaseOrder, 'Pedido de compra');
    assert.equal(es.documentSequenceSalesOrder, 'Pedido de venta');
    assert.equal(es.documentSequenceSalesInvoice, 'Factura de venta');
    assert.equal(es.documentSequenceSalesCorrectiveInvoice, 'Factura de venta rectificativa');
    assert.equal(es.documentSequencePurchaseCorrectiveInvoice, 'Factura de compra rectificativa');
  });
});
