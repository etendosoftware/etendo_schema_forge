// @covers tools/app-shell/src/lib/backendErrors.js
// @covers tools/app-shell/src/locales/en_US.json
// @covers tools/app-shell/src/locales/es_ES.json
// @covers tools/app-shell/src/locales/es_AR.json
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateBackendError } from '../backendErrors.js';

/**
 * ETP-5471 — `backendError.statementBankConnectedNotCreatable`.
 *
 * BankStatementsHandler (?action=create / import / preview) and BankStatementWriteGuardHandler
 * (generic importedBankStatements / bankStatementLines writes) in com.etendoerp.go refuse a
 * manual statement on a bank-connected account with a 409 carrying the English text below. The
 * SPA matches it by EXACT text (after trim) in BACKEND_ERROR_MAP, so the key must resolve in every
 * locale and the text must stay byte-for-byte in sync with the Java constant.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', '..', 'locales');
const KEY = 'backendError.statementBankConnectedNotCreatable';
// ETP-6151 — with flag `psd2-statement-import-settings` on, the bank-connected delete refusal is
// gone and the delete refusal a connected account can still raise is the posted one, which must
// stay a separate key. With the flag off the original refusal (and its key) is live again.
const DELETE_KEY = 'backendError.statementPostedNotDeletable';
const RAW = 'This account is synchronized with the bank; statements cannot be created or imported manually.';
const DELETE_RAW = 'The statement is posted. Unpost it before deleting it.';

function loadLabels(locale) {
  const json = JSON.parse(readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8'));
  return json.genericLabels;
}

/** Same shape as `useUI()`: returns the key itself when the dictionary has no entry. */
function translatorFor(dictionary) {
  return (key) => dictionary[key] ?? key;
}

describe('backendError.statementBankConnectedNotCreatable — locale keys (ETP-5471)', () => {
  for (const locale of ['en_US', 'es_ES', 'es_AR']) {
    it(`${locale} declares a non-empty value for the key`, () => {
      const value = loadLabels(locale)[KEY];
      assert.equal(typeof value, 'string', `${KEY} missing in ${locale}`);
      assert.notEqual(value.trim(), '');
    });
  }

  it('en_US text is exactly the backend message', () => {
    assert.equal(loadLabels('en_US')[KEY], RAW);
  });

  it('es_ES and es_AR are real translations, not the English text', () => {
    for (const locale of ['es_ES', 'es_AR']) {
      const text = loadLabels(locale)[KEY];
      assert.notEqual(text, RAW);
      assert.doesNotMatch(text, /synchronized with the bank/);
      assert.match(text, /extractos/i);
    }
  });

  it('is a different sentence from the posted (not-deletable) refusal', () => {
    for (const locale of ['en_US', 'es_ES', 'es_AR']) {
      const labels = loadLabels(locale);
      assert.notEqual(labels[KEY], labels[DELETE_KEY]);
    }
  });
});

describe('translateBackendError — bank-connected create/import refusal (ETP-5471)', () => {
  it('maps the exact backend text to the statementBankConnectedNotCreatable key', () => {
    const requested = [];
    const t = (key) => {
      requested.push(key);
      return `translated:${key}`;
    };
    assert.equal(translateBackendError(RAW, t), `translated:${KEY}`);
    assert.ok(requested.includes(KEY));
  });

  it('translates to es_ES', () => {
    const es = translatorFor(loadLabels('es_ES'));
    assert.equal(translateBackendError(RAW, es), loadLabels('es_ES')[KEY]);
  });

  it('translates to es_AR', () => {
    const ar = translatorFor(loadLabels('es_AR'));
    assert.equal(translateBackendError(RAW, ar), loadLabels('es_AR')[KEY]);
  });

  it('round-trips in en_US (same text back)', () => {
    const en = translatorFor(loadLabels('en_US'));
    assert.equal(translateBackendError(RAW, en), RAW);
  });

  it('tolerates surrounding whitespace', () => {
    const es = translatorFor(loadLabels('es_ES'));
    assert.equal(translateBackendError(`  ${RAW}\n`, es), loadLabels('es_ES')[KEY]);
  });

  it('returns the original message when the translation key is missing (guard)', () => {
    assert.equal(translateBackendError(RAW, (k) => k), RAW);
  });

  it('does not match a near-miss (truncated sentence)', () => {
    const es = translatorFor(loadLabels('es_ES'));
    const raw = 'This account is synchronized with the bank; statements cannot be created.';
    assert.equal(translateBackendError(raw, es), raw);
  });

  it('keeps the posted (not-deletable) refusal on its own key', () => {
    const es = translatorFor(loadLabels('es_ES'));
    assert.equal(translateBackendError(DELETE_RAW, es), loadLabels('es_ES')[DELETE_KEY]);
  });
});

/**
 * ETP-6151 — a bank-connected account no longer refuses a statement delete outright: the backend
 * reactivates and deletes a processed bank statement in one step, refusing only a posted one (or
 * one with matched lines) — behind the flag `psd2-statement-import-settings`. The posted refusal and
 * the re-import notice both delete confirmations show must resolve in every locale the tab ships
 * in; the former refusal and its key stay live for the flag-off state.
 */
describe('statement delete on a bank-connected account — locale keys (ETP-6151)', () => {
  const LOCALES = ['en_US', 'es_ES', 'es_AR'];
  const NOTICE = 'financeAccountStatementsDeleteBankReimportNotice';
  const NOTICE_NO_DATE = 'financeAccountStatementsDeleteBankReimportNoticeNoDate';
  const REMOVED_KEY = 'backendError.statementBankConnectedNotDeletable';
  const REMOVED_RAW = 'Statements from a bank-connected account cannot be deleted.';

  for (const locale of LOCALES) {
    for (const key of [DELETE_KEY, NOTICE, NOTICE_NO_DATE]) {
      it(`${locale} declares a non-empty ${key}`, () => {
        const value = loadLabels(locale)[key];
        assert.equal(typeof value, 'string');
        assert.ok(value.trim().length > 0);
      });
    }

    // useUI replaces only the FIRST `{date}` (String.replace with a string pattern), so a second
    // one would render literally; and the date-less sentence must carry none at all.
    it(`${locale} interpolates the date exactly once in the dated notice, never in the other`, () => {
      const labels = loadLabels(locale);
      assert.equal(labels[NOTICE].split('{date}').length - 1, 1);
      assert.doesNotMatch(labels[NOTICE_NO_DATE], /\{[^}]*\}/);
    });

    it(`${locale} still declares the flag-off bank-connected delete refusal`, () => {
      const value = loadLabels(locale)[REMOVED_KEY];
      assert.equal(typeof value, 'string');
      assert.ok(value.trim().length > 0);
    });
  }

  for (const locale of ['es_ES', 'es_AR']) {
    it(`${locale} translates the posted refusal and both notices`, () => {
      const en = loadLabels('en_US');
      const labels = loadLabels(locale);
      for (const key of [DELETE_KEY, NOTICE, NOTICE_NO_DATE]) {
        assert.notEqual(labels[key], en[key], `${locale}.${key} is untranslated`);
      }
    });
  }

  it('translates the posted refusal to es_AR', () => {
    const ar = translatorFor(loadLabels('es_AR'));
    assert.equal(translateBackendError(DELETE_RAW, ar), loadLabels('es_AR')[DELETE_KEY]);
  });

  it('still maps the flag-off bank-connected refusal text to its own key', () => {
    const t = (key) => `translated:${key}`;
    assert.equal(translateBackendError(REMOVED_RAW, t), `translated:${REMOVED_KEY}`);
  });
});

describe('bank-connected refusal text stays in sync with BankStatementsHandler.java (ETP-5471)', () => {
  // Sibling runtime module checkout; skipped when it is not cloned next to schema_forge.
  const javaPath = join(__dirname, '..', '..', '..', '..', '..', '..', 'modules',
    'com.etendoerp.go', 'src', 'com', 'etendoerp', 'go', 'schemaforge',
    'BankStatementsHandler.java');

  it('the Java constant carries exactly the mapped text', { skip: !existsSync(javaPath) }, () => {
    const src = readFileSync(javaPath, 'utf8');
    assert.match(src, /MSG_STATEMENT_BANK_CONNECTED_NOT_CREATABLE\s*=/);
    assert.ok(src.includes(`"${RAW}"`), 'the Java message was reworded without updating BACKEND_ERROR_MAP');
  });
});
