// @covers tools/app-shell/src/windows/custom/shared/invoiceFollowUp.js
//
// The invoice windows' follow-up config is only i18n keys: a key missing from a catalog is
// SILENT (the translator echoes it back and the modal shows `followUpCreateShipmentLabel`).
// So every key each config can render is resolved against the three catalogs, and the
// `{count}` interpolation the modal feeds into the descriptions is checked to survive.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { SALES_INVOICE_FOLLOW_UP, PURCHASE_INVOICE_FOLLOW_UP } from '../invoiceFollowUp.js';
import enUS from '../../../../locales/en_US.json' with { type: 'json' };
import esES from '../../../../locales/es_ES.json' with { type: 'json' };
import esAR from '../../../../locales/es_AR.json' with { type: 'json' };

const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };
const CONFIGS = { 'sales-invoice': SALES_INVOICE_FOLLOW_UP, 'purchase-invoice': PURCHASE_INVOICE_FOLLOW_UP };

const OPTION_KEY_FIELDS = ['titleKey', 'buttonLabelKey', 'labelKey', 'descriptionKey', 'descriptionOneKey', 'actionLabelKey', 'badgeKey'];

function renderedKeys(config) {
  const keys = [config.questionKey, config.summary.documentLabelKey, config.summary.dateLabelKey];
  for (const option of Object.values(config.options)) {
    for (const field of OPTION_KEY_FIELDS) if (option[field]) keys.push(option[field]);
  }
  return keys.filter(Boolean);
}

for (const [window, config] of Object.entries(CONFIGS)) {
  describe(`${window} follow-up config`, () => {
    // The spec builds the action URL and the `<spec>:document-created` event, so it must be a
    // real spec name (= artifact directory), never a display name or PascalCase.
    it('targets an existing spec (artifact directory)', () => {
      assert.ok(existsSync(new URL(`../../../../../../../artifacts/${config.spec}/decisions.json`, import.meta.url)));
    });

    for (const [locale, dictionary] of Object.entries(LOCALES)) {
      it(`${locale} translates every key the modal and the button can render`, () => {
        const labels = dictionary.genericLabels;
        const missing = renderedKeys(config).filter(key => typeof labels[key] !== 'string' || labels[key] === '');
        assert.deepEqual(missing, []);
      });

      // The modal title asks («¿Gestionar envío?») while the topbar button names the action
      // («Gestionar envío»): two distinct keys, so the button never inherits the «?».
      it(`${locale} words the modal title as a question and the button label without one`, () => {
        const labels = dictionary.genericLabels;
        for (const option of Object.values(config.options)) {
          assert.notEqual(option.titleKey, option.buttonLabelKey);
          assert.match(labels[option.titleKey], /\?$/);
          assert.doesNotMatch(labels[option.buttonLabelKey], /\?/);
        }
      });

      it(`${locale} keeps the {count} placeholder only in the plural description`, () => {
        const labels = dictionary.genericLabels;
        for (const option of Object.values(config.options)) {
          assert.match(labels[option.descriptionKey], /\{count\}/);
          assert.doesNotMatch(labels[option.descriptionOneKey], /\{count\}/);
        }
      });
    }
  });
}
