// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxMessages.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxFilters.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxPage.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxReviewModel.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxConfirmModel.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewDrawer.jsx
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

  // Review panel (ETP-6050): the invoiceInboxReview* keys.
  describe('review panel keys', () => {
    const placeholders = (s) => [...String(s).matchAll(/\{\{?\s*(\w+)\s*\}?\}/g)].map((m) => m[1]).sort();
    const reviewKeys = Object.keys(locales.en_US.genericLabels).filter((k) => k.startsWith('invoiceInboxReview'));

    it('there are 80+ review keys in en_US and the sources use them', () => {
      assert.ok(reviewKeys.length >= 80, `found ${reviewKeys.length}`);
      const usedReview = inboxKeys.filter((k) => k.startsWith('invoiceInboxReview'));
      assert.ok(usedReview.length >= 70, `sources use ${usedReview.length}`);
      assert.deepEqual(usedReview.filter((k) => !reviewKeys.includes(k)), []);
    });

    for (const locale of ['es_ES', 'es_AR']) {
      it(`${locale} defines exactly the review keys of en_US, non-empty, with the same placeholders`, () => {
        const g = locales[locale].genericLabels;
        const own = Object.keys(g).filter((k) => k.startsWith('invoiceInboxReview'));
        assert.deepEqual(own.sort(), [...reviewKeys].sort());
        for (const key of reviewKeys) {
          assert.ok(String(g[key]).trim(), `${locale}.${key} empty`);
          assert.deepEqual(placeholders(g[key]), placeholders(locales.en_US.genericLabels[key]), `${locale}.${key}`);
        }
      });
    }

    it('the singular variants carry no count placeholder and the plural ones do, in every locale', () => {
      for (const json of Object.values(locales)) {
        const g = json.genericLabels;
        for (const key of ['invoiceInboxReviewVendorAmbiguousTitleOne', 'invoiceInboxReviewProductAmbiguousTagOne', 'invoiceInboxReviewPendingOne']) {
          assert.deepEqual(placeholders(g[key]), [], key);
        }
        for (const key of ['invoiceInboxReviewVendorAmbiguousTitle', 'invoiceInboxReviewProductAmbiguousTag', 'invoiceInboxReviewPendingMany']) {
          assert.deepEqual(placeholders(g[key]), ['count'], key);
        }
      }
    });

    it('the Spanish singular texts read as the design does', () => {
      for (const l of ['es_ES', 'es_AR']) {
        assert.equal(locales[l].genericLabels.invoiceInboxReviewVendorAmbiguousTitleOne, 'Etendo AI propone 1 proveedor');
        assert.equal(locales[l].genericLabels.invoiceInboxReviewProductAmbiguousTagOne, '1 producto posible');
      }
    });

    it('es_ES review texts have no voseo', () => {
      for (const key of reviewKeys) {
        assert.doesNotMatch(locales.es_ES.genericLabels[key], /\b(Podés|Tenés|Querés|Revisalas|vos)\b/, key);
      }
    });
  });
});

// ETP-6050 S2: editing, autosave, line discount, resolution of vendor / product (31 new keys).
describe('review panel editing keys (S2)', () => {
  const placeholders = (s) => [...String(s).matchAll(/\{\{?\s*(\w+)\s*\}?\}/g)].map((m) => m[1]).sort();
  const S2_KEYS = [
    'invoiceInboxReviewColDiscount', 'invoiceInboxReviewLineDiscountDetail',
    'invoiceInboxSaveSaving', 'invoiceInboxSaveSaved', 'invoiceInboxSaveReloadedTitle',
    'invoiceInboxSaveErrorStale', 'invoiceInboxSaveErrorNotEditable', 'invoiceInboxSaveErrorNotReviewable',
    'invoiceInboxSaveErrorNotValid', 'invoiceInboxSaveErrorInvalidValue', 'invoiceInboxSaveErrorTooManyLines',
    'invoiceInboxSaveErrorLineNotFound', 'invoiceInboxSaveErrorUnknownVendor', 'invoiceInboxSaveErrorUnknownProduct',
    'invoiceInboxSaveErrorUnknownCategory', 'invoiceInboxSaveErrorUnknownUom', 'invoiceInboxSaveErrorTooLarge',
    'invoiceInboxSaveErrorAccess', 'invoiceInboxSaveErrorGeneric',
    'invoiceInboxReviewProductMatchManual', 'invoiceInboxReviewVendorLinkedManual',
    'invoiceInboxReviewProductCategory', 'invoiceInboxReviewProductUom', 'invoiceInboxReviewProductNewRequired',
    'invoiceInboxReviewProductCreateNewButton', 'invoiceInboxReviewVendorCreateNewButton',
    'invoiceInboxReviewFieldEmail', 'invoiceInboxReviewFieldPhone', 'invoiceInboxReviewLinesRequired',
    'invoiceInboxReviewReferenceTooLong', 'invoiceInboxReviewDateRawHint',
  ];

  it('lists 31 distinct keys', () => {
    assert.equal(new Set(S2_KEYS).size, 31);
  });

  for (const [locale, json] of Object.entries(locales)) {
    it(`${locale} defines every S2 key, non-empty`, () => {
      assert.deepEqual(S2_KEYS.filter((k) => !String(json.genericLabels[k] ?? '').trim()), []);
    });
  }

  it('the S2 texts keep the same placeholders in every locale', () => {
    for (const key of S2_KEYS) {
      const base = placeholders(locales.en_US.genericLabels[key]);
      for (const locale of ['es_ES', 'es_AR']) assert.deepEqual(placeholders(locales[locale].genericLabels[key]), base, `${locale}.${key}`);
    }
    assert.deepEqual(placeholders(locales.en_US.genericLabels.invoiceInboxReviewReferenceTooLong), ['max']);
    assert.deepEqual(placeholders(locales.en_US.genericLabels.invoiceInboxReviewDateRawHint), ['date']);
  });

  it('every key the editor can show for a refusal exists (the model maps codes to these)', async () => {
    const { SAVE_ERROR_LABEL_KEYS } = await import('../invoiceInboxReviewModel.js');
    for (const key of Object.values(SAVE_ERROR_LABEL_KEYS)) {
      for (const [locale, json] of Object.entries(locales)) assert.ok(json.genericLabels[key], `${locale}.${key}`);
    }
  });

  it('the sources use the S2 keys (a key nothing reads is dead text)', () => {
    assert.deepEqual(S2_KEYS.filter((k) => !inboxKeys.includes(k)), []);
  });

  it('es_ES S2 texts have no voseo', () => {
    for (const key of S2_KEYS) {
      assert.doesNotMatch(locales.es_ES.genericLabels[key], /\b(Podés|Tenés|Querés|vos)\b/, key);
    }
  });
});


// ETP-6050 S2 addenda: tax by id, validator codes, line-based tax rows, unknown names (6 more keys).
describe('review panel keys added with the tax selector and the line codes (S2 addenda)', () => {
  const placeholders = (s) => [...String(s).matchAll(/\{\{?\s*(\w+)\s*\}?\}/g)].map((m) => m[1]).sort();
  const ADDENDA_KEYS = [
    'invoiceInboxReviewNameUnknown', 'invoiceInboxReviewTotalTaxLine', 'invoiceInboxReviewQuantityMissingError',
    'invoiceInboxReviewPriceMissingError', 'invoiceInboxSaveErrorUnknownTax', 'invoiceInboxReviewTaxPlaceholder',
  ];

  for (const [locale, json] of Object.entries(locales)) {
    it(`${locale} defines the ${ADDENDA_KEYS.length} addenda keys, non-empty`, () => {
      assert.deepEqual(ADDENDA_KEYS.filter((k) => !String(json.genericLabels[k] ?? '').trim()), []);
    });
  }

  it('the sources read every addenda key (a key nothing reads is dead text)', () => {
    const readViaModel = new Set(['invoiceInboxSaveErrorUnknownTax']);
    assert.deepEqual(ADDENDA_KEYS.filter((k) => !inboxKeys.includes(k) && !readViaModel.has(k)), []);
    assert.ok(inboxKeys.includes('invoiceInboxSaveErrorUnknownTax'), 'mapped from the unknown_tax code');
  });

  it('the line-based tax row keeps the same {rate} and {base} placeholders as the document-based one, in every locale', () => {
    for (const [locale, json] of Object.entries(locales)) {
      assert.deepEqual(placeholders(json.genericLabels.invoiceInboxReviewTotalTaxLine), ['base', 'rate'], locale);
      assert.deepEqual(placeholders(json.genericLabels.invoiceInboxReviewTotalTax), ['base', 'rate'], locale);
    }
  });

  it('the other addenda texts carry no placeholder', () => {
    for (const [locale, json] of Object.entries(locales)) {
      for (const key of ADDENDA_KEYS.filter((k) => k !== 'invoiceInboxReviewTotalTaxLine')) {
        assert.deepEqual(placeholders(json.genericLabels[key]), [], `${locale}.${key}`);
      }
    }
  });

  it('es_ES has no voseo and es_AR uses it in the two "missing" errors', () => {
    const voseo = /\b(Podés|Tenés|Querés|Indicá|Elegí|vos)\b/;
    for (const key of ADDENDA_KEYS) assert.doesNotMatch(locales.es_ES.genericLabels[key], voseo, key);
    assert.match(locales.es_AR.genericLabels.invoiceInboxReviewQuantityMissingError, /Indicá/);
    assert.match(locales.es_AR.genericLabels.invoiceInboxReviewPriceMissingError, /Indicá/);
  });

  it('the Spanish texts are translated (not the English ones left in place)', () => {
    for (const locale of ['es_ES', 'es_AR']) {
      for (const key of ADDENDA_KEYS) {
        assert.notEqual(locales[locale].genericLabels[key], locales.en_US.genericLabels[key], `${locale}.${key}`);
      }
    }
  });
});

// ETP-6051: confirm texts (dialog, toast, refusal reasons, banners).
describe('confirm keys', () => {
  const placeholders = (s) => [...String(s).matchAll(/\{\{?\s*(\w+)\s*\}?\}/g)].map((m) => m[1]).sort();
  const confirmKeys = Object.keys(locales.en_US.genericLabels).filter((k) => /^invoiceInbox(Confirm|Bulk)/.test(k) || k === 'invoiceInboxConfirming');
  const messages = readFileSync(join(dir, 'invoiceInboxMessages.js'), 'utf8');
  const reviewModel = readFileSync(join(dir, 'invoiceInboxReviewModel.js'), 'utf8');

  it('there are confirm keys and the sources use them', () => {
    assert.ok(confirmKeys.length >= 30, `found ${confirmKeys.length}`);
    assert.deepEqual(inboxKeys.filter((k) => /^invoiceInboxConfirm/.test(k) && !confirmKeys.includes(k)), []);
  });

  for (const locale of ['es_ES', 'es_AR']) {
    it(`${locale} defines exactly the confirm keys of en_US with the same placeholders`, () => {
      const g = locales[locale].genericLabels;
      const own = Object.keys(g).filter((k) => /^invoiceInbox(Confirm|Bulk)/.test(k) || k === 'invoiceInboxConfirming');
      assert.deepEqual(own.sort(), [...confirmKeys].sort());
      for (const key of confirmKeys) {
        assert.ok(String(g[key]).trim(), `${locale}.${key} empty`);
        assert.deepEqual(placeholders(g[key]), placeholders(locales.en_US.genericLabels[key]), `${locale}.${key}`);
      }
    });
  }

  it('every confirm error code has a translated reason and a translated panel message, in the three locales', () => {
    const reasonKeys = [...messages.matchAll(/:\s*'(invoiceInboxConfirmReason[A-Za-z]+)'/g)].map((m) => m[1]);
    const errorKeys = [...reviewModel.matchAll(/:\s*'(invoiceInboxConfirmError[A-Za-z]+)'/g)].map((m) => m[1]);
    assert.ok(reasonKeys.length >= 10 && errorKeys.length >= 6);
    for (const [locale, json] of Object.entries(locales)) {
      for (const key of [...reasonKeys, ...errorKeys, 'invoiceInboxConfirmReasonSeveral', 'invoiceInboxConfirmReasonGeneric', 'invoiceInboxSaveErrorNotConfirmable']) {
        assert.ok(String(json.genericLabels[key] ?? '').trim(), `${locale}.${key}`);
      }
    }
  });

  it('price_list_tax_included says what to do (use a price list without taxes included)', () => {
    assert.match(locales.es_ES.genericLabels.invoiceInboxConfirmErrorPriceListTax, /sin impuestos incluidos/);
    assert.match(locales.es_AR.genericLabels.invoiceInboxConfirmErrorPriceListTax, /sin impuestos incluidos/);
    assert.match(locales.en_US.genericLabels.invoiceInboxConfirmErrorPriceListTax, /without tax included/i);
  });

  it('the failure-identifier texts exist in the three locales; es_AR uses voseo and es_ES does not where they address the user', () => {
    const keys = Object.keys(locales.en_US.genericLabels).filter((k) => /^invoiceInboxConfirm(Detail|Step)/.test(k));
    assert.equal(keys.length, 17);
    for (const locale of Object.keys(locales)) {
      for (const key of keys) assert.ok(String(locales[locale].genericLabels[key] ?? '').trim(), `${locale}.${key}`);
    }
    assert.match(locales.es_AR.genericLabels.invoiceInboxConfirmDetailCompletionError, /intentá.*contactá/);
    assert.match(locales.es_ES.genericLabels.invoiceInboxConfirmDetailCompletionError, /inténtalo.*contacta/);
    for (const key of keys) assert.doesNotMatch(locales.es_ES.genericLabels[key], /\b(Podés|Tenés|Querés|Corregí|confirmá|intentá|contactá)\b/, key);
  });

  it('es_AR confirm texts use voseo where they address the user and es_ES does not', () => {
    for (const key of confirmKeys) {
      assert.doesNotMatch(locales.es_ES.genericLabels[key], /\b(Podés|Tenés|Querés|Cambiá|Revisá|usá|intentá)\b/, key);
    }
    assert.match(locales.es_AR.genericLabels.invoiceInboxConfirmErrorPriceListTax, /Cambiá/);
  });

  it('the new-product name label key exists in the three locales and is not the generic product label', () => {
    for (const [locale, json] of Object.entries(locales)) {
      const label = json.genericLabels.invoiceInboxReviewProductName;
      assert.ok(String(label ?? '').trim(), `${locale}.invoiceInboxReviewProductName`);
    }
    assert.equal(locales.es_ES.genericLabels.invoiceInboxReviewProductName, 'Nombre del producto');
    assert.equal(locales.en_US.genericLabels.invoiceInboxReviewProductName, 'Product name');
    assert.ok(inboxKeys.includes('invoiceInboxReviewProductName'));
  });

  it('the duplicate notice says the invoice cannot be confirmed until resolved, in the three locales', () => {
    assert.match(locales.es_ES.genericLabels.invoiceInboxReviewDuplicateBody, /no se puede confirmar hasta resolverlo/);
    assert.match(locales.es_AR.genericLabels.invoiceInboxReviewDuplicateBody, /no se puede confirmar hasta resolverlo/);
    assert.match(locales.en_US.genericLabels.invoiceInboxReviewDuplicateBody, /cannot be confirmed until this is resolved/);
  });

  it('the ISO-labelled total key carries its {currency} placeholder in the three locales', () => {
    for (const [locale, json] of Object.entries(locales)) {
      assert.match(json.genericLabels.invoiceInboxConfirmTotalCurrency, /\{currency\}/, locale);
    }
  });
});
