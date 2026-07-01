import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..', '..');
const enRoot = JSON.parse(
  readFileSync(
    join(repoRoot, 'node_modules', '@etendosoftware', 'app-shell-core', 'src', 'locales', 'en_US.json'),
    'utf8',
  ),
);
const esRoot = JSON.parse(
  readFileSync(
    join(repoRoot, 'node_modules', '@etendosoftware', 'app-shell-core', 'src', 'locales', 'es_ES.json'),
    'utf8',
  ),
);
const en = enRoot.genericLabels;
const es = esRoot.genericLabels;

const REQUIRED_KEYS = [
  'statusRejected',
  'rejectQuotation',
  'rejectQuotationTitle',
  'rejectQuotationDesc',
  'rejectQuotationConfirm',
  'rejectQuotationError',
  'rejectReasonLabel',
  'rejectReasonSearchPlaceholder',
  'rejectReasonNoResults',
  'createRejectReason',
  'createRejectReasonTitle',
  'rejectReasonNameLabel',
  'rejectReasonNamePlaceholder',
  'rejectReasonCreateConfirm',
  'rejectReasonCreateError',
];

describe('reject-flow i18n keys (ETP-3873)', () => {
  for (const key of REQUIRED_KEYS) {
    it(`en_US.json defines '${key}' with non-empty value`, () => {
      assert.ok(key in en, `missing ${key} in en_US.json`);
      assert.equal(typeof en[key], 'string');
      assert.ok(en[key].trim().length > 0, `empty translation for ${key} in en_US.json`);
    });

    it(`es_ES.json defines '${key}' with non-empty value`, () => {
      assert.ok(key in es, `missing ${key} in es_ES.json`);
      assert.equal(typeof es[key], 'string');
      assert.ok(es[key].trim().length > 0, `empty translation for ${key} in es_ES.json`);
    });
  }

  it('exposes CJ in the statuses block of both locales', () => {
    assert.ok(enRoot.statuses?.CJ?.label, 'en_US.json statuses.CJ.label missing');
    assert.ok(esRoot.statuses?.CJ?.label, 'es_ES.json statuses.CJ.label missing');
  });

  it('translates statusRejected differently in en vs es (sanity: not copy-pasted)', () => {
    assert.notEqual(
      en.statusRejected,
      es.statusRejected,
      'statusRejected must be translated, not copy-pasted across locales',
    );
  });
});
