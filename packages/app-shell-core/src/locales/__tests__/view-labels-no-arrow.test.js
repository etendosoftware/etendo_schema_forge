import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..');

const es = JSON.parse(readFileSync(join(localesDir, 'es_ES.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(localesDir, 'en_US.json'), 'utf8'));

// The 5 "view document" labels fixed in ETP-4312. The arrow glyph now comes from
// code (an SVG in ConfirmResultModal or a literal " →" appended in JSX), never
// from the translatable label itself.
const VIEW_KEYS = ['soViewInvoice', 'poViewInvoice', 'soViewShipment', 'poViewReceipt', 'sqViewOrder'];

// Labels that legitimately keep a "→" glyph baked into the translation (call-to-action
// buttons whose arrow is part of the copy, not a separate code-rendered glyph).
// Discovered by scanning genericLabels for "→" — keep this list in sync if the
// design changes. Any genericLabels value with "→" NOT in this list is a regression.
const ARROW_ALLOWLIST = new Set([
  'statusChangedTo',
  'createPayment',
  'createCredit',
  'viewInvoice',
  'viewExistingInvoice',
  'viewArrow',
  'viewPaymentArrow',
  'soConfirmAction',
  'soConfirmActionShipment',
  'soConfirmActionInvoice',
  'soConfirmActionBoth',
  'soCreateDocsBtn',
  'sqConfirmActionOrder',
  'poConfirmAction',
  'poConfirmActionReceipt',
  'poConfirmActionInvoice',
  'poConfirmActionBoth',
  'cloneOrderAction',
  'cloneReceiptAction',
  'viewPurchaseReturn',
  'cloneInvoiceAction',
  'fiscal.onboarding.skipped.hint',
  'fiscal.onboarding.confirm.subtitle',
  'fiscal.onboarding.confirm.subtitle.bold',
  'goodsReceipt.confirmModal.viewInvoice',
]);

describe('view-document labels carry no arrow (ETP-4312)', () => {
  describe('ES/EN parity — all 5 keys exist in both locales', () => {
    for (const key of VIEW_KEYS) {
      it(`${key} exists in es_ES and en_US`, () => {
        assert.equal(typeof es.genericLabels[key], 'string', `${key} missing in es_ES`);
        assert.equal(typeof en.genericLabels[key], 'string', `${key} missing in en_US`);
      });
    }
  });

  describe('the 5 view keys contain no "→" glyph', () => {
    for (const key of VIEW_KEYS) {
      it(`es_ES.${key} has no arrow`, () => {
        assert.doesNotMatch(es.genericLabels[key], /→/, `es_ES.${key} = ${JSON.stringify(es.genericLabels[key])}`);
      });
      it(`en_US.${key} has no arrow`, () => {
        assert.doesNotMatch(en.genericLabels[key], /→/, `en_US.${key} = ${JSON.stringify(en.genericLabels[key])}`);
      });
    }
  });

  describe('no unexpected arrow-bearing genericLabels (allowlist guard)', () => {
    for (const [locale, dict] of [['es_ES', es], ['en_US', en]]) {
      it(`${locale}: every "→" label is in the allowlist`, () => {
        const offenders = Object.entries(dict.genericLabels)
          .filter(([k, v]) => typeof v === 'string' && v.includes('→') && !ARROW_ALLOWLIST.has(k))
          .map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
        assert.deepEqual(
          offenders,
          [],
          `Unexpected arrow-bearing labels in ${locale} (add to allowlist if intentional, or move arrow to code):\n${offenders.join('\n')}`,
        );
      });
    }
  });
});
