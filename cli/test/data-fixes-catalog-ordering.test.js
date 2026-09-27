import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Catalog-wide ordering guard for the corrective data-fixes under `cli/src/data-fixes/sql/`.
 *
 * WHY THIS EXISTS — the watermark trap.
 * `run.js` applies, per tenant, only fixes STRICTLY NEWER than the newest fix that tenant has
 * already PROCESSED (APPLIED / MANUALLY_FIXED / SKIPPED_NOT_NEEDED). The skip is a strict `<=`
 * comparison on the file-name timestamp (`fix.timestamp.getTime() <= watermark`) with NO
 * look-back. Consequences:
 *
 *   - A new fix that shares its timestamp with an already-processed fix is skipped SILENTLY on
 *     every tenant that processed the other one — no ledger row, no error, no warning.
 *   - A new fix dated at or before a fix that is already processed anywhere is skipped silently
 *     there too. This is exactly what nearly happened to ETP-5046's R37 subscription backfill:
 *     it was authored as `20260918T120000Z`, the same stamp as develop's
 *     `R38-org-legalentity-pointer`, and had to be re-dated to `20260924T150000Z` before it
 *     reached a shared environment.
 *
 * Renaming a fix is only allowed while it is UNAPPLIED (`sql/README.md` rule 3: applied fixes
 * are immutable). The historical pairs listed in `APPLIED_SHARED_TIMESTAMPS` below were already
 * applied when this guard was written and can therefore never be renamed — they are frozen here
 * by exact file name, so a THIRD file on one of those stamps still fails. Every other fix must
 * carry a unique timestamp: when this test fails, re-date the NEW file (a later stamp than any
 * fix in the catalog), do not extend the allowlist.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');

const R37_BACKFILL = '20260924T150000Z__R37-tenant-subscription-backfill.sql';
/** The newest fix in develop when ETP-5046 merged it; R37 was re-dated to sort after it. */
const NEWEST_DEVELOP_FIX_AT_MERGE = '20260922T130000Z__R39-document-sequence-clear-descriptions.sql';

/**
 * Already-applied fixes that share a timestamp prefix. Immutable (README rule 3), so they are
 * tolerated — by exact file-name set, never by prefix alone. Do NOT add entries for new fixes.
 */
const APPLIED_SHARED_TIMESTAMPS = {
  '20260821T120000Z': [
    '20260821T120000Z__R24-payment-method-cheque-to-recibo.sql',
    '20260821T120000Z__R24-transfer-automatic-withdrawn.sql',
  ],
  '20260826T120000Z': [
    '20260826T120000Z__R26-admin-identity-real-org.sql',
    '20260826T120000Z__R26-tenant-owner-and-personal-role-retrofit.sql',
  ],
  '20260828T120000Z': [
    '20260828T120000Z__R26-acct-rpt-definitions.sql',
    '20260828T120000Z__R28-standard-cost-anchor.sql',
  ],
  '20260902T120000Z': [
    '20260902T120000Z__R31-document-sequence-startno.sql',
    '20260902T120000Z__R33-force-test-mode-selected-backfill.sql',
  ],
  '20260909T120000Z': [
    '20260909T120000Z__R35-acreedor-bp-group-acct-accounts.sql',
    '20260909T120000Z__R35-pricelist-isdefault.sql',
  ],
  '20260910T120000Z': [
    '20260910T120000Z__R36-costing-background-schedule.sql',
    '20260910T120000Z__R36-psd2-bank-statement-schedule-removal.sql',
  ],
  '20260922T120000Z': [
    '20260922T120000Z__R39-ap-invoice-fc-series.sql',
    '20260922T120000Z__R39-elementvalue-operand-backfill.sql',
  ],
};

const WATERMARK_TRAP =
  'run.js skips, per tenant, every fix whose timestamp is <= the newest fix that tenant has ' +
  'already processed (strict watermark, no look-back). A fix that shares a timestamp with, or is ' +
  'dated before, a processed fix is therefore skipped SILENTLY — no ledger row, no error. ' +
  'Re-date the NEW fix to a unique, later timestamp; renaming is allowed only while it is ' +
  'unapplied (sql/README.md rule 3).';

const sqlFiles = readdirSync(SQL_DIR).filter(f => f.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
const prefixOf = (file) => file.split('__')[0];
const tsOf = (file) => parseFixTimestamp(file.slice(0, -'.sql'.length));

/** Group the catalog by timestamp prefix. */
function groupByPrefix(files) {
  const groups = new Map();
  for (const file of files) {
    const prefix = prefixOf(file);
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(file);
  }
  return groups;
}

/** Every shared-prefix group that is not exactly one of the frozen already-applied pairs. */
function sharedPrefixViolations(files) {
  const violations = [];
  for (const [prefix, group] of groupByPrefix(files)) {
    if (group.length < 2) continue;
    const allowed = APPLIED_SHARED_TIMESTAMPS[prefix];
    const sameAsAllowed = allowed
      && allowed.length === group.length
      && allowed.every(f => group.includes(f));
    if (!sameAsAllowed) violations.push(`${prefix}: ${group.join(', ')}`);
  }
  return violations;
}

describe('data-fix catalog — timestamp ordering guard (watermark trap)', () => {
  it('finds a non-trivial catalog', () => {
    assert.ok(sqlFiles.length > 10, `expected the data-fix catalog under ${SQL_DIR}`);
  });

  it('parses a timestamp from every fix file name', () => {
    const unparsable = sqlFiles.filter(f => !(tsOf(f) instanceof Date));
    assert.deepEqual(unparsable, [],
      `fix files without a YYYYMMDDTHHMMSSZ prefix have no watermark position: ${unparsable.join(', ')}`);
  });

  // Frozen, not "after every other fix": later fixes are expected to land after R37, and a guard
  // that failed on them would tell their authors to move an already-applied fix. What must hold
  // forever is that R37 sorts after the newest fix develop carried when ETP-5046 merged.
  it('keeps the R37 subscription backfill after the newest develop fix at merge time', () => {
    assert.ok(sqlFiles.includes(R37_BACKFILL), `${R37_BACKFILL} is missing from the catalog`);
    assert.ok(sqlFiles.includes(NEWEST_DEVELOP_FIX_AT_MERGE),
      `${NEWEST_DEVELOP_FIX_AT_MERGE} is missing from the catalog`);
    assert.ok(tsOf(R37_BACKFILL).getTime() > tsOf(NEWEST_DEVELOP_FIX_AT_MERGE).getTime(),
      `${R37_BACKFILL} must sort after ${NEWEST_DEVELOP_FIX_AT_MERGE}. ${WATERMARK_TRAP}`);
  });

  it('gives every fix a unique timestamp prefix, except the frozen already-applied pairs', () => {
    const violations = sharedPrefixViolations(sqlFiles);
    assert.deepEqual(violations, [],
      `Fix files share a timestamp prefix. ${WATERMARK_TRAP} Shared prefixes: ${violations.join(' | ')}`);
  });

  it('keeps the allowlist honest: every frozen pair still exists and still shares its prefix', () => {
    const groups = groupByPrefix(sqlFiles);
    for (const [prefix, files] of Object.entries(APPLIED_SHARED_TIMESTAMPS)) {
      assert.ok(files.length >= 2, `${prefix}: an allowlist entry must name at least two files`);
      for (const file of files) {
        assert.equal(prefixOf(file), prefix, `${file} is listed under the wrong prefix ${prefix}`);
      }
      assert.deepEqual([...(groups.get(prefix) ?? [])].sort(), [...files].sort(),
        `${prefix}: the allowlisted applied pair no longer matches the catalog. Applied fixes are ` +
        'immutable (sql/README.md rule 3) — they must not be renamed or deleted.');
    }
  });
});

describe('data-fix catalog — the guard rejects what it claims to reject', () => {
  // Synthetic catalogs, so the guard cannot silently regress into a no-op.
  it('accepts a frozen applied pair exactly as listed', () => {
    assert.deepEqual(sharedPrefixViolations(APPLIED_SHARED_TIMESTAMPS['20260922T120000Z']), []);
  });

  it('rejects a THIRD file landing on an already-allowlisted stamp', () => {
    const files = [...APPLIED_SHARED_TIMESTAMPS['20260922T120000Z'], '20260922T120000Z__R40-new.sql'];
    assert.equal(sharedPrefixViolations(files).length, 1);
  });

  it('rejects a NEW file that reuses an allowlisted stamp under a different name', () => {
    const [first] = APPLIED_SHARED_TIMESTAMPS['20260821T120000Z'];
    assert.equal(sharedPrefixViolations([first, '20260821T120000Z__R99-renamed.sql']).length, 1);
  });

  it('rejects the exact collision R37 was re-dated to escape', () => {
    const files = [
      '20260918T120000Z__R37-tenant-subscription-backfill.sql',
      '20260918T120000Z__R38-org-legalentity-pointer.sql',
    ];
    assert.deepEqual(sharedPrefixViolations(files), [`20260918T120000Z: ${files.join(', ')}`]);
    // ...because run.js skips a fix whose timestamp is <= the tenant watermark (strict, no look-back).
    const [a, b] = files.map(f => tsOf(f).getTime());
    assert.ok(a <= b, 'a fix sharing the watermark timestamp is skipped by run.js');
  });
});
