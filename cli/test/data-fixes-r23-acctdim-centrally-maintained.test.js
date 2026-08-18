import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R23 corrective data-fix
 * (20260811T120000Z__R23-acctdim-centrally-maintained.sql, ETP-4854, gap K1).
 *
 * `AD_Client.Acctdim_Centrally_Maintained` selects which of two mechanisms
 * `DimensionDisplayUtility` uses to compute accounting-dimension field visibility: flat
 * `C_AcctSchema_Element.IsActive` ('N', the only mechanism Etendo GO's "Dimensiones contables"
 * screen — `GeneralLedgerConfigurationHandler#applyDimensionChanges` — writes to) or the
 * fine-grained `AD_Client.<Dim>_Acctdim_*` matrix ('Y', a classic feature GO never built a screen
 * for). `InitialSetupUtility` hardcodes every new client to 'Y', so this fix flips existing 'Y'
 * clients to 'N', backfilling `C_AcctSchema_Element.isactive` first so the flip does not change
 * what any client currently sees.
 *
 * Live-validated (2026-08-11) against this DB: dry-run across all 16 real tenants -> 14
 * WOULD_APPLY / 2 SKIPPED_NOT_NEEDED (GOClient, QA Testing — already 'N'); a rolled-back
 * transaction against "empresa" confirmed the exact expected before/after state (Org/BPartner/
 * Product elements stay 'Y', CostCenter/Project/User1/User2 flip to 'N'); a real run against
 * "acreedortest" (D94AED60C3E0494AAFD44B8A05BB5CFC) -> APPLIED (5 rows) -> re-run
 * SKIPPED_NOT_NEEDED — kept prior success state.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a live
 * Postgres tenant, so true row-level behavior can only be verified end-to-end with a DB (done
 * above). What is verified deterministically here, without a DB, is the SQL the fix ships: header
 * metadata, tenant isolation, the two-layer idempotency guard, and the per-dimension "effective
 * visibility" formula (IsEnable='Y' AND (Header='Y' OR Lines='Y' OR Breakdown='Y')) for all 7
 * configurable dimensions.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260811T120000Z__R23-acctdim-centrally-maintained.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R23 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R23-acctdim-centrally-maintained');
    assert.equal(fix.gap, 'K1');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description that mentions the flag and the backfill guarantee', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /Acctdim_Centrally_Maintained/i);
    assert.match(fix.description, /C_AcctSchema_Element\.IsActive/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('has a filename whose timestamp prefix is newer than the previous fix (R22)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-11T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260805T140000Z__prev').getTime(),
      'R23 must sort after R22 (the last fix present on this branch)',
    );
  });
});

describe('R23 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to the client row', () => {
    assert.match(normCheck, /ad_client_id = :client_id/);
    assert.match(normCheck, /acctdim_centrally_maintained = 'Y'/);
  });

  it('scopes both @apply statements to :client_id', () => {
    // The backfill UPDATE (c_acctschema_element) and the flag flip (ad_client) must both filter
    // on :client_id — count every occurrence across the whole @apply body.
    const occurrences = (normApply.match(/ad_client_id = :client_id/g) || []).length;
    assert.ok(occurrences >= 8, `expected >= 8 :client_id scopes (7 CTE branches + 1 element WHERE), got ${occurrences}`);
    assert.match(normApply, /WHERE ad_client_id = :client_id\s+AND acctdim_centrally_maintained = 'Y'/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: "1; DROP TABLE ad_client" }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R23 data-fix — backfill covers all 7 configurable dimensions with the effective-visibility formula', () => {
  const dims = [
    ['OO', 'org'],
    ['PJ', 'project'],
    ['BP', 'bpartner'],
    ['PR', 'product'],
    ['CC', 'costcenter'],
    ['U1', 'user1'],
    ['U2', 'user2'],
  ];

  for (const [elementtype, column] of dims) {
    it(`computes the effective flag for ${elementtype} from ${column}_acctdim_isenable AND (header OR lines OR breakdown)`, () => {
      // The first CTE branch (OO) carries an explicit ::varchar(2) cast + AS elementtype alias
      // (so the UNION ALL's column types are pinned); every other branch is a bare `'XX',`.
      assert.match(normApply, new RegExp(`'${elementtype}'(::varchar\\(2\\) AS elementtype)?,`));
      assert.match(
        normApply,
        new RegExp(
          `\\(${column}_acctdim_isenable = 'Y'\\s+AND \\(${column}_acctdim_header = 'Y' OR ${column}_acctdim_lines = 'Y' OR ${column}_acctdim_breakdown = 'Y'\\)\\)`,
        ),
      );
    });
  }

  it('never touches the mandatory Account (AC) element — only the 7 configurable dimensions', () => {
    assert.doesNotMatch(normApply, /'AC',/);
  });
});

describe('R23 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('the @apply backfill UPDATE is guarded by IS DISTINCT FROM (only touches rows that would change)', () => {
    assert.match(
      normApply,
      /e\.isactive IS DISTINCT FROM \(CASE WHEN de\.effective THEN 'Y' ELSE 'N' END\)/i,
    );
  });

  it('the @apply flag flip is guarded on the current value (only fires while still \'Y\')', () => {
    assert.match(normApply, /acctdim_centrally_maintained = 'N'.*WHERE ad_client_id = :client_id\s+AND acctdim_centrally_maintained = 'Y'/is);
  });

  it('@check gates on the exact same predicate the @apply flip guards on', () => {
    assert.match(normCheck, /acctdim_centrally_maintained = 'Y'/);
    assert.match(normApply, /acctdim_centrally_maintained = 'Y'/);
  });
});

describe('R23 data-fix — atomicity (backfill and flag flip must commit together)', () => {
  it('both the c_acctschema_element UPDATE and the ad_client UPDATE live in the SAME @apply section', () => {
    assert.match(normApply, /UPDATE c_acctschema_element/i);
    assert.match(normApply, /UPDATE ad_client/i);
    // The backfill must run BEFORE the flag flip (element rows are keyed off the OLD 'Y'-mode
    // config; flipping first would not change the read, but ordering documents intent and keeps
    // the two statements' comments aligned with what actually executes first).
    const elementIdx = normApply.indexOf('UPDATE c_acctschema_element');
    const clientIdx = normApply.indexOf('UPDATE ad_client');
    assert.ok(elementIdx >= 0 && clientIdx >= 0 && elementIdx < clientIdx,
      'backfill (c_acctschema_element) must precede the flag flip (ad_client) in @apply');
  });
});
