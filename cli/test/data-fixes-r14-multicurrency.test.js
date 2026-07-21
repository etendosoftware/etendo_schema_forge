import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R14 corrective data-fix
 * (20260716T120000Z__R14-payment-method-multicurrency.sql, ETP-4503).
 *
 * The data-fix runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a live
 * Postgres tenant, so true row-level behavior can only be verified end-to-end with a DB. What we can
 * verify deterministically without a DB — and what actually guards the acceptance criteria — is the
 * SQL the fix ships: the header metadata, the tenant isolation, the idempotency guards, the PSD2
 * exception predicate, and that the parametrized SQL inlines safely. Each assertion below is mapped
 * to the plan's acceptance criteria (AC#1..AC#5).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260716T120000Z__R14-payment-method-multicurrency.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R14 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R14-payment-method-multicurrency');
    assert.equal(fix.gap, 'G1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions multicurrency', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /multicurrency/i);
  });

  it('documents the PSD2 bank-transfer exception in the file background', () => {
    assert.match(rawText, /bank-transfer|PSD2/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the previous fix', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-07-16T12:00:00.000Z');
    // Strictly after the last pre-existing fix (20260708T100000Z) so lexical == chronological order.
    assert.ok(ts.getTime() > parseFixTimestamp('20260708T100000Z__prev').getTime());
  });
});

describe('R14 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to :client_id on both tables', () => {
    assert.match(normCheck, /pm\.ad_client_id = :client_id/);
    assert.match(normCheck, /fpm\.ad_client_id = :client_id/);
  });

  it('scopes every @apply UPDATE to :client_id', () => {
    // One :client_id per UPDATE statement (3 statements → at least 3 occurrences).
    const occurrences = (fix.apply.match(/ad_client_id = :client_id/g) || []).length;
    assert.ok(occurrences >= 3, `expected >=3 :client_id scopes, found ${occurrences}`);
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

describe('R14 data-fix — @check idempotency probe (AC#5)', () => {
  it('unions three needed-work branches (template N, non-exception link N, exception link Y)', () => {
    const unions = (fix.check.match(/UNION ALL/gi) || []).length;
    assert.equal(unions, 2, 'three SELECT branches must be joined by two UNION ALL');
  });

  it('detects a method template still multicurrency-OFF (branch a)', () => {
    assert.match(normCheck, /FROM fin_paymentmethod pm .*pm\.payin_ismulticurrency = 'N' OR pm\.payout_ismulticurrency = 'N'/);
  });

  it('detects a non-exception link still OFF, excluding the Bank+PSD2 transfer (branch b)', () => {
    assert.match(normCheck, /FROM fin_finacc_paymentmethod fpm/);
    assert.match(normCheck, /fpm\.payin_ismulticurrency = 'N' OR fpm\.payout_ismulticurrency = 'N'/);
    assert.match(normCheck, /AND NOT \(/);
  });

  it('detects an exception link that is wrongly ON and must be turned OFF (branch c)', () => {
    assert.match(normCheck, /fpm\.payin_ismulticurrency = 'Y' OR fpm\.payout_ismulticurrency = 'Y'/);
  });

  it('limits the probe to a single row (0 rows => SKIPPED_NOT_NEEDED)', () => {
    assert.match(normCheck, /LIMIT 1/);
  });
});

describe('R14 data-fix — @apply effects (AC#1, AC#2, AC#4)', () => {
  it('runs exactly three UPDATE statements', () => {
    const updates = (fix.apply.match(/\bUPDATE\s+fin_/gi) || []).length;
    assert.equal(updates, 3);
  });

  it('effect 1a enables multicurrency on all method templates (no PSD2 exception at template level)', () => {
    assert.match(
      normApply,
      /UPDATE fin_paymentmethod pm SET payin_ismulticurrency = 'Y', payout_ismulticurrency = 'Y'/,
    );
  });

  it('effect 1b enables multicurrency on per-account links, excluding the Bank+PSD2 transfer link', () => {
    assert.match(
      normApply,
      /UPDATE fin_finacc_paymentmethod fpm SET payin_ismulticurrency = 'Y', payout_ismulticurrency = 'Y'/,
    );
    // The enable-links UPDATE carries the exclusion of the Bank+PSD2 transfer link.
    assert.match(normApply, /AND NOT \( EXISTS \( SELECT 1 FROM fin_paymentmethod pm/);
  });

  it('effect 2 disables multicurrency on the transfer link of Bank accounts with active PSD2', () => {
    assert.match(
      normApply,
      /SET payin_ismulticurrency = 'N', payout_ismulticurrency = 'N'/,
    );
  });

  it('every enable UPDATE is guarded so a re-run matches 0 rows (idempotent, AC#5)', () => {
    // Both enable UPDATEs only touch rows still OFF (template pm.* and link fpm.*).
    const enableGuards = (fix.apply.match(
      /(?:\w+\.)?payin_ismulticurrency = 'N' OR (?:\w+\.)?payout_ismulticurrency = 'N'/g) || []).length;
    assert.ok(enableGuards >= 2, `expected >=2 enable guards, found ${enableGuards}`);
  });

  it('the disable UPDATE is guarded so a re-run matches 0 rows (idempotent, AC#5)', () => {
    // The disable effect only touches transfer links still ON (fpm.*).
    const disableGuards = (fix.apply.match(
      /(?:\w+\.)?payin_ismulticurrency = 'Y' OR (?:\w+\.)?payout_ismulticurrency = 'Y'/g) || []).length;
    assert.ok(disableGuards >= 1, `expected >=1 disable guard, found ${disableGuards}`);
  });

  it('stamps updated/updatedby audit columns on every UPDATE', () => {
    const stamped = (fix.apply.match(/updated = now\(\)/g) || []).length;
    assert.equal(stamped, 3);
  });
});

describe('R14 data-fix — transfer identification and PSD2 exception (AC#2, AC#3)', () => {
  it('identifies the transfer method by the PSD2 flag with a name fallback', () => {
    // Present in @check and both link UPDATEs.
    assert.match(
      normApply,
      /pm\.em_psd2_is_bank_transfer = 'Y' OR pm\.name IN \('Transferencia bancaria', 'Transferencia'\)/,
    );
    assert.match(
      normCheck,
      /pm\.em_psd2_is_bank_transfer = 'Y' OR pm\.name IN \('Transferencia bancaria', 'Transferencia'\)/,
    );
  });

  it('scopes the exception to Bank accounts (type = B)', () => {
    assert.match(normApply, /fa\.type = 'B'/);
    assert.match(normCheck, /fa\.type = 'B'/);
  });

  it('treats an account as PSD2-active by connection status CO', () => {
    assert.match(normApply, /fa\.em_psd2_connection_status = 'CO'/);
  });

  it('also treats an account as PSD2-active by an active psd2_finacc_connection row', () => {
    assert.match(
      normApply,
      /FROM psd2_finacc_connection pc .*pc\.connection_status = 'AC' AND pc\.isactive = 'Y'/,
    );
  });

  it('the disable effect requires BOTH the transfer predicate AND the Bank+PSD2 predicate', () => {
    // Effect 2 joins the transfer-method EXISTS and the Bank+PSD2 EXISTS with AND — so a
    // non-transfer link, or a transfer link on a non-PSD2 / non-Bank account, is never disabled
    // (AC#3: a Bank account without PSD2 keeps its transfer link ON).
    const effect2 = normApply.slice(normApply.indexOf("SET payin_ismulticurrency = 'N'"));
    assert.match(effect2, /em_psd2_is_bank_transfer = 'Y'/);
    assert.match(effect2, /fa\.type = 'B'/);
    assert.match(effect2, /em_psd2_connection_status = 'CO'/);
  });
});
