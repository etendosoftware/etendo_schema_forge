import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix } from '../src/data-fixes/parse-fix.js';
import { formatReportDetail } from '../src/data-fixes/run.js';

/**
 * Whole-catalog regression guard for the optional `@report` section introduced in ETP-4761
 * (parse-fix.js / run.js). QA gap this closes: the existing parse-fix tests only exercise
 * synthetic in-memory snippets (a fix "with report" / "without report" built by hand); nothing
 * asserted that EVERY pre-existing `.sql` fix in the real catalog — the ones actually executed by
 * the runner — parses with an EMPTY `@report` (so `run.js`'s `if (fix.report) {...}` guard never
 * fires for them and `detail` stays `null` on APPLIED exactly as before this feature existed).
 * A single catalog file with a stray `-- @report` marker (e.g. a copy-paste from R19) would
 * silently change that fix's ledger `detail` on every future apply — this test would catch it.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIXES_WITH_REPORT = new Set([
  '20260803T160000Z__R19-locator-inventory-status',
  // R24 retires the "Cheque" payment method: DELETE when nothing references it, otherwise
  // isactive='N'. Its @report lists the tenants where Cheque survived and the reference counts
  // that blocked the delete — exactly the "skipped part of its own work" case this section exists
  // for. See cli/test/data-fixes-r24-payment-method-cheque-to-recibo.test.js.
  '20260821T120000Z__R24-payment-method-cheque-to-recibo',
  // R26 (ETP-4877) can't mechanically resolve a tenant with zero is_client_admin holders (owner
  // detection has nothing to act on) or a personal-role name collision — @report surfaces both
  // for manual review instead of silently doing nothing.
  '20260826T120000Z__R26-tenant-owner-and-personal-role-retrofit',
  // R27 (ETP-4877) never deactivates a legacy Finance/Sales/Purchasing/Inventory clone that is
  // still in real use — @report lists any such role found, for manual review.
  '20260826T121500Z__R27-deactivate-r16-duplicate-roles',
  // R28 backfills AD_User.Email for tenant owners; its @report lists any owner whose username
  // could not be resolved to an active ETGO_Account by either the exact or suffix-stripped
  // branch — same "flag, don't guess" pattern as R19. See
  // cli/test/data-fixes-r28-owner-email-backfill.test.js.
  '20260827T120000Z__R28-owner-email-backfill',
  // R31 backfills C_Glitem/C_Glitem_Acct for pre-ETP-5020 subaccounts; its @report lists every
  // subaccount whose composed "<name> <code>" GL Item name would exceed C_Glitem.Name's 60-char
  // limit (gap N2) and was therefore skipped rather than truncated — same "flag, don't guess"
  // pattern as R19/R28. See cli/test/data-fixes-r31-glitem-subaccount-backfill.test.js.
  '20260901T140000Z__R31-glitem-subaccount-backfill',
  // R32 resyncs C_Glitem.Name for already-linked GL Items whose composed name went stale (gap N3);
  // its @report lists every row this run actually renamed — subaccount code/name plus old_name ->
  // new_name — read back from the temp table @apply fills from its own UPDATE ... RETURNING, since
  // the pre-apply name is gone by the time @report runs. Operator visibility, not a "skipped work"
  // flag: empty on a clean re-run. See cli/test/data-fixes-r32-glitem-name-resync.test.js.
  '20260902T090000Z__R32-glitem-name-resync',
]);

async function loadCatalogFiles() {
  const files = (await readdir(SQL_DIR)).filter((f) => f.endsWith('.sql'));
  const out = [];
  for (const file of files) {
    const fixId = basename(file, '.sql');
    const text = await readFile(join(SQL_DIR, file), 'utf8');
    out.push({ fixId, fix: parseFix(text, fixId) });
  }
  return out;
}

describe('data-fixes catalog — @report is opt-in and backward compatible', () => {
  it('has at least one fix WITH @report (R19, R24, R28) so this guard is not vacuous', async () => {
    const catalog = await loadCatalogFiles();
    const withReport = catalog.filter(({ fix }) => fix.report.length > 0);
    assert.ok(withReport.length >= 1, 'expected at least one fix with a non-empty @report section');
    assert.deepEqual(
      withReport.map(({ fixId }) => fixId).sort(),
      [...FIXES_WITH_REPORT].sort(),
    );
  });

  it('every OTHER catalog fix parses with an empty @report (unaffected by the new section)', async () => {
    const catalog = await loadCatalogFiles();
    const withoutReport = catalog.filter(({ fixId }) => !FIXES_WITH_REPORT.has(fixId));
    assert.ok(withoutReport.length > 0, 'sanity: catalog must contain pre-existing fixes to check');
    for (const { fixId, fix } of withoutReport) {
      assert.equal(fix.report, '', `${fixId}: expected empty @report (pre-existing fix, no behavior change)`);
    }
  });

  it('reproduces the runner\'s exact "no @report" gate: falsy fix.report never reaches formatReportDetail', async () => {
    // Mirrors run.js applyFix(): `if (fix.report) { ... detail = formatReportDetail(...) }`.
    // For every fix without @report, detail must stay null — never call formatReportDetail at all,
    // and if it somehow were called with no rows, it would still return null (belt-and-suspenders).
    const catalog = await loadCatalogFiles();
    for (const { fixId, fix } of catalog.filter(({ fixId: id }) => !FIXES_WITH_REPORT.has(id))) {
      let detail = null;
      if (fix.report) {
        detail = formatReportDetail([]); // would only run for a fix that HAS a report; never true here
      }
      assert.equal(detail, null, `${fixId}: detail must stay null with no @report section`);
    }
  });
});
