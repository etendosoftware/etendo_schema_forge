// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxMessages.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxFilters.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxPage.jsx
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..');
const locales = Object.fromEntries(['en_US', 'es_ES', 'es_AR'].map((l) => [
  l, JSON.parse(readFileSync(join(here, '..', '..', '..', '..', 'locales', `${l}.json`), 'utf8')),
]));

// Every `invoiceInbox*` key literal in the window's sources, plus the shared generic labels the
// window reads through `ui()`.
const sources = readdirSync(dir).filter((f) => /\.(js|jsx)$/.test(f)).map((f) => readFileSync(join(dir, f), 'utf8'));
const inboxKeys = [...new Set(sources.flatMap((src) => [...src.matchAll(/['"`](invoiceInbox[A-Za-z]+)['"`]/g)].map((m) => m[1])))];
const DISCARD_KEYS = [
  'invoiceInboxDiscardTitleOne', 'invoiceInboxDiscardTitleMany', 'invoiceInboxDiscardBodyOne', 'invoiceInboxDiscardBodyMany',
  'invoiceInboxDiscardInProgress', 'invoiceInboxDiscarding', 'invoiceInboxDiscardedOne', 'invoiceInboxDiscardedMany',
  'invoiceInboxDiscardPartial', 'invoiceInboxDiscardFailed', 'invoiceInboxDiscardReasonNotDiscardable',
  'invoiceInboxDiscardReasonNotFound', 'invoiceInboxDiscardReasonOrg', 'invoiceInboxDiscardReasonAccess',
  'invoiceInboxDiscardReasonFeatureDisabled', 'invoiceInboxDiscardReasonGeneric', 'invoiceInboxDiscardedAt',
  'invoiceInboxRowActionSoon',
];
const SHARED_KEYS = ['comingSoon', 'copy', 'close', 'retry', 'refresh'];

describe('Invoice Inbox locale keys', () => {
  it('finds the keys the window uses', () => {
    assert.ok(inboxKeys.length > 40, `expected many keys, found ${inboxKeys.length}`);
  });

  // "Resultado de tus cargas" (result panel, batch filter chip, stay notice).
  const RESULT_KEYS = [
    'invoiceInboxResultTitle', 'invoiceInboxResultAria', 'invoiceInboxResultReadingTitle', 'invoiceInboxResultReadingHint',
    'invoiceInboxResultMixed', 'invoiceInboxResultDoneOne', 'invoiceInboxResultDoneMany', 'invoiceInboxResultDoneWithErrors',
    'invoiceInboxResultAllGoodHint', 'invoiceInboxResultReasonLine', 'invoiceInboxResultHandled', 'invoiceInboxResultGone',
    'invoiceInboxResultLoadError',
    'invoiceInboxUploadStayNotice',
  ];

  it('the removed batch-filter keys are gone from the locales and the sources', () => {
    for (const key of ['invoiceInboxResultViewBatch', 'invoiceInboxResultViewErrors', 'invoiceInboxFilterThisBatch', 'invoiceInboxFilterThisBatchErrors', 'invoiceInboxFilterBatchClear', 'invoiceInboxResultDismiss']) {
      assert.ok(!inboxKeys.includes(key), `${key} is still used by the sources`);
      for (const json of Object.values(locales)) assert.equal(json.genericLabels[key], undefined, `${key} still in a locale`);
    }
  });

  it('the window sources use the 14 result-panel keys', () => {
    assert.equal(RESULT_KEYS.length, 14);
    for (const key of RESULT_KEYS) assert.ok(inboxKeys.includes(key), `${key} is not used by the window sources`);
  });

  for (const [locale, json] of Object.entries(locales)) {
    it(`${locale} has the 14 result-panel keys`, () => {
      assert.deepEqual(RESULT_KEYS.filter((k) => !json.genericLabels[k]), []);
    });
  }

  it('es_AR uses voseo and es_ES does not, in the result-panel texts', () => {
    assert.match(locales.es_AR.genericLabels.invoiceInboxResultReadingHint, /Podés/);
    assert.match(locales.es_AR.genericLabels.invoiceInboxResultAllGoodHint, /Revisalas/);
    assert.match(locales.es_ES.genericLabels.invoiceInboxResultReadingHint, /Puedes/);
    assert.match(locales.es_ES.genericLabels.invoiceInboxResultAllGoodHint, /Revísalas/);
    for (const key of RESULT_KEYS) {
      assert.doesNotMatch(locales.es_ES.genericLabels[key], /\b(Podés|Revisalas|confirmalas|Tenés|Querés)\b/, key);
    }
  });

  for (const [locale, json] of Object.entries(locales)) {
    it(`${locale} defines every genericLabels key the window uses, non-empty`, () => {
      const missing = [...inboxKeys, ...SHARED_KEYS].filter((k) => typeof json.genericLabels?.[k] !== 'string' || !json.genericLabels[k].trim());
      assert.deepEqual(missing, []);
    });

    it(`${locale} has the "Invoice Inbox" menu label`, () => {
      assert.ok(json.menus?.['Invoice Inbox'], 'menus["Invoice Inbox"] missing');
    });
  }

  it('the parameterised messages keep the same placeholders in every locale', () => {
    const placeholders = (s) => [...String(s).matchAll(/\{\{?\s*(\w+)\s*\}?\}/g)].map((m) => m[1]).sort();
    for (const key of inboxKeys) {
      const base = placeholders(locales.en_US.genericLabels[key]);
      for (const locale of ['es_ES', 'es_AR']) {
        assert.deepEqual(placeholders(locales[locale].genericLabels[key]), base, `${locale}.${key}`);
      }
    }
  });

  for (const [locale, json] of Object.entries(locales)) {
    it(`${locale} defines the ${DISCARD_KEYS.length} discard keys, used by the sources, non-empty`, () => {
      const missing = DISCARD_KEYS.filter((k) => typeof json.genericLabels?.[k] !== 'string' || !json.genericLabels[k].trim());
      assert.deepEqual(missing, []);
      assert.deepEqual(DISCARD_KEYS.filter((k) => !inboxKeys.includes(k)), []);
    });
  }

  it('the discard texts keep the same placeholders in every locale', () => {
    const placeholders = (s) => [...String(s).matchAll(/\{\{?\s*(\w+)\s*\}?\}/g)].map((m) => m[1]).sort();
    for (const key of DISCARD_KEYS) {
      for (const locale of ['es_ES', 'es_AR']) {
        assert.deepEqual(placeholders(locales[locale].genericLabels[key]), placeholders(locales.en_US.genericLabels[key]), `${locale}.${key}`);
      }
    }
  });

  it('no discard dialog body mentions a 30-day retention', () => {
    for (const [locale, json] of Object.entries(locales)) {
      for (const k of ['invoiceInboxDiscardBodyOne', 'invoiceInboxDiscardBodyMany']) {
        assert.doesNotMatch(json.genericLabels[k], /30/, `${locale}.${k}`);
      }
    }
  });

  it('es_ES texts the user reads', () => {
    const g = locales.es_ES.genericLabels;
    assert.equal(g.invoiceInboxDiscardTitleOne, '¿Descartar esta factura?');
    assert.match(g.invoiceInboxDiscardTitleMany, /¿Descartar \{+\s*count\s*\}+ facturas\?/);
    assert.match(g.invoiceInboxErrorForeignReceiver, /La factura no está emitida a tu empresa/);
  });
});
