import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R29 corrective data-fix
 * (20260831T120000Z__R29-transfer-link-multicurrency.sql, ETP-5084).
 *
 * R29 finishes the "multicurrency ON by default" baseline that R14 started, dropping R14's
 * bank-transfer exception: a PIS transfer converts the invoice amount to the account currency before
 * instructing the bank, so a cross-currency transfer is supported and the transfer link is
 * multicurrency like every other payment method. R14 itself is retired (see
 * data-fixes-retirement.test.js) rather than edited, because it is already applied and immutable.
 *
 * Row-level behavior needs a live tenant. What is verifiable without a DB is the SQL the fix ships:
 * header metadata, tenant isolation, the idempotency guards, and — the point of the whole fix — that
 * it never writes 'N' and carries no transfer-method predicate at all. Mirrors the
 * data-fixes-r24-transfer-automatic-withdrawn.test.js precedent.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260831T120000Z__R29-transfer-link-multicurrency.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R29 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R29-transfer-link-multicurrency');
    // Same gap as R14, which it supersedes: payment-method config defaults.
    assert.equal(fix.gap, 'G1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description naming what it enables and that there is no exception', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /multicurrency/i);
    assert.match(fix.description, /NO bank-transfer exception/i);
  });

  it('explains WHY in the file background, and names the fix it supersedes', () => {
    assert.match(rawText, /ETP-5084/);
    assert.match(rawText, /R14-payment-method-multicurrency/);
    // The reason the ETP-4503 premise no longer holds. Matched loosely: the SQL comments are
    // hard-wrapped, so the phrase can straddle a newline + '-- ' continuation.
    assert.match(norm(rawText), /converted to the -- account currency|converted to the account currency/);
  });

  it('has non-empty @check and @apply sections and no @report', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(!fix.report, 'R29 repairs every matching row, so it has nothing to report');
  });

  it('sorts after R28, so lexical order == chronological order', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-31T12:00:00.000Z');
    assert.ok(ts.getTime()
      > parseFixTimestamp('20260828T120000Z__R26-acct-rpt-definitions').getTime());
  });
});

describe('R29 data-fix — tenant isolation', () => {
  it('scopes both @check branches to :client_id', () => {
    const occurrences = (fix.check.match(/ad_client_id = :client_id/g) || []).length;
    assert.equal(occurrences, 2, 'both @check branches must be tenant-scoped');
  });

  it('scopes every @apply UPDATE to :client_id', () => {
    const occurrences = (fix.apply.match(/ad_client_id = :client_id/g) || []).length;
    assert.equal(occurrences, 2, 'both UPDATEs must be tenant-scoped');
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE fin_paymentmethod' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R29 data-fix — @check idempotency probe', () => {
  it('unions the two needed-work branches (template still N, link still N)', () => {
    const unions = (fix.check.match(/UNION ALL/gi) || []).length;
    assert.equal(unions, 1, 'two SELECT branches joined by one UNION ALL');
  });

  it('detects a method template still single-currency in either direction', () => {
    assert.match(normCheck,
      /FROM fin_paymentmethod pm .*\(pm\.payin_ismulticurrency = 'N' OR pm\.payout_ismulticurrency = 'N'\)/);
  });

  it('detects a per-account link still single-currency in either direction', () => {
    assert.match(normCheck,
      /FROM fin_finacc_paymentmethod fpm .*\(fpm\.payin_ismulticurrency = 'N' OR fpm\.payout_ismulticurrency = 'N'\)/);
  });

  it('limits the probe to a single row (0 rows => SKIPPED_NOT_NEEDED)', () => {
    assert.match(normCheck, /LIMIT 1/);
  });
});

describe('R29 data-fix — @apply effects', () => {
  it('runs exactly two UPDATE statements', () => {
    const updates = (fix.apply.match(/\bUPDATE\s+fin_/gi) || []).length;
    assert.equal(updates, 2);
  });

  it('enables both multicurrency columns on the method template', () => {
    assert.match(normApply,
      /UPDATE fin_paymentmethod pm SET payin_ismulticurrency = 'Y', payout_ismulticurrency = 'Y'/);
  });

  it('enables both multicurrency columns on every per-account link', () => {
    assert.match(normApply,
      /UPDATE fin_finacc_paymentmethod fpm SET payin_ismulticurrency = 'Y', payout_ismulticurrency = 'Y'/);
  });

  /**
   * The entire point of R29 versus R14: no row is ever turned OFF. This is what makes it safe to run
   * alongside a tenant where an administrator has since made a deliberate single-currency choice,
   * and what stops it from reintroducing the ETP-4503 exception.
   */
  it('never sets a multicurrency column to N', () => {
    // Only the SET clauses are inspected: an `= 'N'` inside a WHERE is the idempotency guard
    // ("still single-currency?"), which is required — it is an assignment to 'N' that would be
    // the bug. A naive /SET [^;]*= 'N'/ would run past the SET and match that guard.
    const setClauses = normApply.match(/SET .*?(?= WHERE )/g) || [];
    assert.equal(setClauses.length, 2, 'expected one SET clause per UPDATE');
    for (const clause of setClauses) {
      assert.doesNotMatch(clause, /_ismulticurrency = 'N'/, `SET clause turns multicurrency off: ${clause}`);
      assert.match(clause, /payin_ismulticurrency = 'Y'/);
      assert.match(clause, /payout_ismulticurrency = 'Y'/);
    }
  });

  /**
   * R14/R15/R24 all need the fragile `em_psd2_is_bank_transfer='Y' OR name IN (...)` predicate to
   * single out the transfer method. R29 treats every method identically, so that predicate — and the
   * seed-vs-live divergence it exists to work around — is simply absent.
   */
  it('carries no transfer-method predicate at all, because it excludes nothing', () => {
    assert.doesNotMatch(fix.apply, /em_psd2_is_bank_transfer/);
    assert.doesNotMatch(fix.check, /em_psd2_is_bank_transfer/);
    assert.doesNotMatch(fix.apply, /Transferencia/);
    assert.doesNotMatch(fix.check, /Transferencia/);
  });

  it('does not look at the account type or its PSD2 connection state either', () => {
    assert.doesNotMatch(fix.apply, /psd2_finacc_connection/);
    assert.doesNotMatch(fix.check, /psd2_finacc_connection/);
    assert.doesNotMatch(fix.apply, /em_psd2_connection_status/);
    assert.doesNotMatch(fix.check, /em_psd2_connection_status/);
  });

  it('guards both UPDATEs on the current value, so a re-run is a no-op', () => {
    const guards = (fix.apply.match(/= 'N' OR/g) || []).length;
    assert.equal(guards, 2, 'each UPDATE must be guarded on the row still being N');
  });

  it('stamps the audit columns the way the other fixes do', () => {
    assert.match(normApply, /updated = now\(\), updatedby = '0'/);
  });
});
