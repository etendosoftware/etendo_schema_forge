import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateBackendError } from '../backendErrors.js';

/**
 * ETP-5468 — `backendError.foreignDraftReconciliation`.
 *
 * ReconciliationDraftGuard (com.etendoerp.go) refuses to undo a reconciliation while another
 * draft reconciliation of the account holds unconfirmed matches, with the message
 * `Reconciliation <documentNo> is an unconfirmed draft that already holds matched movements.
 * Review it before undoing a reconciliation on this account.` The SPA must translate it with the
 * document number interpolated, and must not over-match neighbouring messages.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', '..', 'locales');
const KEY = 'backendError.foreignDraftReconciliation';

const PREFIX = 'Reconciliation ';
const SUFFIX = ' is an unconfirmed draft that already holds matched movements.'
  + ' Review it before undoing a reconciliation on this account.';

function rawFor(documentNo) {
  return PREFIX + documentNo + SUFFIX;
}

function loadLabels(locale) {
  const json = JSON.parse(readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8'));
  return json.genericLabels;
}

/** Same shape as `useUI()`: returns the key when missing, interpolates `{param}` placeholders. */
function translatorFor(dictionary) {
  return (key, params = {}) => {
    let text = dictionary[key] ?? key;
    Object.keys(params).forEach((p) => {
      text = text.replace(`{${p}}`, params[p]);
    });
    return text;
  };
}

describe('backendError.foreignDraftReconciliation — locale keys (ETP-5468)', () => {
  for (const locale of ['en_US', 'es_ES', 'es_AR']) {
    it(`${locale} declares the key with a {documentNo} placeholder`, () => {
      const labels = loadLabels(locale);
      assert.equal(typeof labels[KEY], 'string', `${KEY} missing in ${locale}`);
      assert.match(labels[KEY], /\{documentNo\}/);
    });
  }

  it('en_US text is exactly the backend message skeleton', () => {
    assert.equal(loadLabels('en_US')[KEY], rawFor('{documentNo}'));
  });

  it('es_ES and es_AR are real translations, not the English text', () => {
    for (const locale of ['es_ES', 'es_AR']) {
      const text = loadLabels(locale)[KEY];
      assert.doesNotMatch(text, /unconfirmed draft/);
      assert.match(text, /conciliaci[oó]n/i);
    }
  });
});

describe('translateBackendError — foreign draft reconciliation matcher (ETP-5468)', () => {
  const es = translatorFor(loadLabels('es_ES'));
  const ar = translatorFor(loadLabels('es_AR'));
  const en = translatorFor(loadLabels('en_US'));

  it('translates to es_ES interpolating the document number', () => {
    assert.equal(
      translateBackendError(rawFor('1000123'), es),
      loadLabels('es_ES')[KEY].replace('{documentNo}', '1000123'),
    );
    assert.match(translateBackendError(rawFor('1000123'), es), /^La conciliación 1000123 es un borrador/);
  });

  it('translates to es_AR interpolating the document number', () => {
    assert.match(translateBackendError(rawFor('REC-7'), ar), /^La conciliación REC-7 es un borrador/);
  });

  it('round-trips in en_US (same text back)', () => {
    assert.equal(translateBackendError(rawFor('REC-7'), en), rawFor('REC-7'));
  });

  it('keeps a document number that contains spaces intact', () => {
    assert.match(translateBackendError(rawFor('REC 2026/07'), es), /La conciliación REC 2026\/07 es/);
  });

  it('tolerates surrounding whitespace', () => {
    assert.match(translateBackendError(`  ${rawFor('55')}  `, es), /^La conciliación 55 es/);
  });

  it('returns the original message when the translation key is missing (guard)', () => {
    assert.equal(translateBackendError(rawFor('55'), (k) => k), rawFor('55'));
  });

  it('does not match an empty document number', () => {
    const raw = rawFor('');
    assert.equal(translateBackendError(raw, es), raw);
  });

  it('does not match a message with only the prefix', () => {
    const raw = 'Reconciliation 55 could not be processed.';
    assert.equal(translateBackendError(raw, es), raw);
  });

  it('does not match a message with only the suffix', () => {
    const raw = `Statement 55${SUFFIX}`;
    assert.equal(translateBackendError(raw, es), raw);
  });

  it('does not match a near-miss suffix (truncated sentence)', () => {
    const raw = 'Reconciliation 55 is an unconfirmed draft that already holds matched movements.';
    assert.equal(translateBackendError(raw, es), raw);
  });
});

describe('foreign draft skeleton stays in sync with ReconciliationDraftGuard.java (ETP-5468)', () => {
  // Sibling runtime module checkout; skipped when it is not cloned next to schema_forge.
  const javaPath = join(__dirname, '..', '..', '..', '..', '..', '..', 'modules',
    'com.etendoerp.go', 'src', 'com', 'etendoerp', 'go', 'schemaforge',
    'ReconciliationDraftGuard.java');

  it('prefix and suffix match the Java constants', { skip: !existsSync(javaPath) }, () => {
    const src = readFileSync(javaPath, 'utf8');
    assert.match(src, /MSG_FOREIGN_DRAFT_PREFIX = "Reconciliation ";/);
    assert.ok(src.includes('" is an unconfirmed draft that already holds matched movements."'));
    assert.ok(src.includes('+ " Review it before undoing a reconciliation on this account."'));
  });
});
