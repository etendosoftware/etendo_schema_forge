import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, inlineParams } from '../src/data-fixes/parse-fix.js';
import { loadRetiredList, verifyRetiredList, loadCatalogWithRetirement } from '../src/data-fixes/run.js';

/**
 * Static contract for the unified, M_Transaction-sourced Standard-cost anchor fix (ETP-5142).
 *
 * R33 supersedes R28 (Shipment/Receipt only) by sourcing `needed_products` directly from
 * `m_transaction` and joining back to whichever of the 5 document families
 * (Shipment/Receipt, Physical Inventory, Internal Movement, Internal Consumption,
 * Manufacturing/Production) the populated line-FK resolves to.
 *
 * Only 2 of the 5 branches (Shipment/Receipt and Physical Inventory) have live gap data on the
 * dev DB to validate row-level behavior against (done separately, in rolled-back transactions —
 * see the file's own header + `tenant-remediation-knowledge.md`, 2026-09-03 entries). Internal
 * Movement, Internal Consumption, and Manufacturing/Production have ZERO live rows anywhere —
 * this suite is the ONLY safety net for those 3 branches until real data exists, per
 * `.claude/agents/tenant-fixer.md`'s "needs it / doesn't need it / re-run = skipped" mandate and
 * this fix's own `@risk: high`. It pins structural SQL invariants only; it cannot and does not
 * claim to prove row-level correctness for the 3 untested branches.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20260903T120000Z__R33-standard-cost-anchor-unified.sql';
const FIX_PATH = join(SQL_DIR, FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');
const RETIRED_R28_ID = '20260828T120000Z__R28-standard-cost-anchor';

function loadFix() {
  assert.ok(existsSync(FIX_PATH), `${FIX_FILE} must exist as the unified successor to R28`);
  const rawText = readFileSync(FIX_PATH, 'utf8');
  return { rawText, fix: parseFix(rawText, FIX_ID) };
}

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function sha256Of(fixId) {
  const text = await readFile(join(SQL_DIR, `${fixId}.sql`), 'utf-8');
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

describe('R33 data-fix — metadata', () => {
  it('parses as the expected SQL fix', () => {
    const { fix } = loadFix();
    assert.equal(fix.id, 'R33-standard-cost-anchor-unified');
    assert.equal(fix.gap, 'J2');
    assert.equal(fix.type, 'sql');
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /Standard/i);
    assert.match(fix.description, /M_Transaction/i);
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('sources needed_products from m_transaction directly, not from a per-doctype line table', () => {
    const { fix } = loadFix();
    const normCheck = norm(fix.check);
    assert.match(normCheck, /FROM m_transaction t/i);
  });
});

describe('R33 data-fix — Standard, never Average', () => {
  it('inserts M_Costing rows using Standard cost type STA', () => {
    const { fix } = loadFix();
    const normApply = norm(fix.apply);
    assert.match(normApply, /INSERT INTO m_costing/i);
    assert.match(normApply, /costtype/i);
    assert.match(normApply, /'STA'/);
  });

  it('does not reference Average cost type AVA in executable sections', () => {
    const { fix } = loadFix();
    const executableSql = norm(`${fix.check}\n${fix.apply}`);
    assert.doesNotMatch(executableSql, /'AVA'|\bAVA\b/i);
  });
});

describe('R33 data-fix — all 5 document families are joined and scoped', () => {
  const families = [
    {
      name: 'Shipment/Receipt',
      lineFk: 'm_inoutline_id',
      lineTable: 'm_inoutline',
      lineAlias: 'iol',
      headerTable: 'm_inout',
      headerAlias: 'io',
    },
    {
      name: 'Physical Inventory',
      lineFk: 'm_inventoryline_id',
      lineTable: 'm_inventoryline',
      lineAlias: 'invl',
      headerTable: 'm_inventory',
      headerAlias: 'inv',
    },
    {
      name: 'Internal Movement',
      lineFk: 'm_movementline_id',
      lineTable: 'm_movementline',
      lineAlias: 'movl',
      headerTable: 'm_movement',
      headerAlias: 'mov',
    },
    {
      name: 'Internal Consumption',
      lineFk: 'm_internal_consumptionline_id',
      lineTable: 'm_internal_consumptionline',
      lineAlias: 'icl',
      headerTable: 'm_internal_consumption',
      headerAlias: 'ic',
    },
    {
      name: 'Manufacturing/Production',
      lineFk: 'm_productionline_id',
      lineTable: 'm_productionline',
      lineAlias: 'prl',
      headerTable: 'm_production',
      headerAlias: 'prod',
    },
  ];

  for (const fam of families) {
    it(`joins ${fam.name} (${fam.lineTable} -> ${fam.headerTable}) in both @check and @apply`, () => {
      const { fix } = loadFix();
      for (const section of [norm(fix.check), norm(fix.apply)]) {
        assert.match(
          section,
          new RegExp(`JOIN ${fam.lineTable}\\b`, 'i'),
          `${fam.name}: expected a join to ${fam.lineTable}`,
        );
        assert.match(
          section,
          new RegExp(`t\\.${fam.lineFk}`, 'i'),
          `${fam.name}: expected m_transaction.${fam.lineFk} to be referenced`,
        );
        assert.match(
          section,
          new RegExp(`JOIN ${fam.headerTable}\\b`, 'i'),
          `${fam.name}: expected a join to ${fam.headerTable}`,
        );
      }
    });
  }

  it('gates candidacy on at least one of the 5 line-FKs being populated', () => {
    const { fix } = loadFix();
    const normCheck = norm(fix.check);
    for (const fam of families) {
      assert.match(normCheck, new RegExp(`t\\.${fam.lineFk} IS NOT NULL`, 'i'));
    }
  });

  it('deliberately excludes C_ProjectIssue transactions (not one of the 5 traced families)', () => {
    const { fix } = loadFix();
    const executableSql = norm(`${fix.check}\n${fix.apply}`);
    assert.doesNotMatch(executableSql, /c_projectissue/i);
  });
});

describe('R33 data-fix — isactive filters on every joined header/line table (review fix 1)', () => {
  const aliases = ['iol', 'io', 'invl', 'inv', 'movl', 'mov', 'icl', 'ic', 'prl', 'prp', 'prod'];

  for (const alias of aliases) {
    it(`filters ${alias}.isactive = 'Y' in both @check and @apply`, () => {
      const { fix } = loadFix();
      for (const section of [norm(fix.check), norm(fix.apply)]) {
        assert.match(
          section,
          new RegExp(`${alias}\\.isactive\\s*=\\s*'Y'`, 'i'),
          `expected ${alias}.isactive = 'Y' to be present`,
        );
      }
    });
  }
});

describe('R33 data-fix — needed_date gate uses the real computed date, not raw movementdate (review fix 2)', () => {
  it('gates on needed_date <= now(), not a bare movementdate <= now() short-circuit', () => {
    const { fix } = loadFix();
    for (const section of [norm(fix.check), norm(fix.apply)]) {
      assert.match(section, /needed_date\s*<=\s*now\(\)/i, 'expected the needed_date gate');
      assert.doesNotMatch(
        section,
        /\bt\.movementdate\s*<=\s*now\(\)/i,
        'a bare t.movementdate <= now() gate would wrongly admit a transaction whose real ' +
          'needed_date (trxprocessdate) is still in the future',
      );
    }
  });

  it('computes needed_date via the documented per-tenant/per-TrxType CASE formula', () => {
    const { fix } = loadFix();
    for (const section of [norm(fix.check), norm(fix.apply)]) {
      assert.match(section, /backdatedtrxsfixed\s*=\s*'Y'\s+THEN\s+t\.movementdate/i);
      assert.match(section, /inventory_type\s+IN\s*\('O',\s*'C'\)\s+THEN\s+t\.movementdate/i);
      assert.match(section, /ELSE\s+COALESCE\(t\.trxprocessdate,\s*t\.movementdate\)/i);
    }
  });

  it('splits candidacy into a dated CTE and a date-gated CTE (no inline duplication of the CASE)', () => {
    const { fix } = loadFix();
    for (const section of [norm(fix.check), norm(fix.apply)]) {
      assert.match(section, /candidate_trx_dated AS/i);
      assert.match(section, /\bcandidate_trx AS \(/i);
      assert.match(section, /SELECT \* FROM candidate_trx_dated WHERE needed_date <= now\(\)/i);
    }
  });
});

describe('R33 data-fix — excludes only the true self-healing InventoryOpening case', () => {
  it('excludes inventory_type=\'O\' rows ONLY when the line already carries a real cost', () => {
    const { fix } = loadFix();
    for (const section of [norm(fix.check), norm(fix.apply)]) {
      assert.match(
        section,
        /NOT \(\s*inv\.inventory_type\s*=\s*'O'\s+AND\s+invl\.cost IS NOT NULL\s+AND\s+invl\.cost\s*<>\s*0\s*\)/i,
      );
    }
  });

  it('does NOT blanket-exclude every inventory_type=\'O\' row (a null/zero-cost Opening line still needs the anchor)', () => {
    const { fix } = loadFix();
    for (const section of [norm(fix.check), norm(fix.apply)]) {
      assert.doesNotMatch(section, /NOT \(\s*inv\.inventory_type\s*=\s*'O'\s*\)/i);
    }
  });

  it('does not exclude InventoryClosing (inventory_type=\'C\') — it is never self-healing', () => {
    const { fix } = loadFix();
    for (const section of [norm(fix.check), norm(fix.apply)]) {
      assert.doesNotMatch(section, /NOT \([^)]*inventory_type\s*=\s*'C'/i);
    }
  });
});

describe('R33 data-fix — tenant isolation and idempotency', () => {
  it('scopes both @check and @apply to :client_id', () => {
    const { fix } = loadFix();
    assert.match(norm(fix.check), /ad_client_id = :client_id/i);
    assert.match(norm(fix.apply), /ad_client_id = :client_id/i);
  });

  it('keeps the runner bind token safely inlineable and leaves no bind token behind', () => {
    const { fix } = loadFix();
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('guards inserts with NOT EXISTS on existing Standard or legacy Standard M_Costing rows', () => {
    const { fix } = loadFix();
    const normApply = norm(fix.apply);
    assert.match(normApply, /NOT EXISTS \(\s*SELECT 1\s*FROM m_costing/i);
    assert.match(normApply, /c\.isactive = 'Y'/i);
    assert.match(normApply, /costtype IN \('STA', 'ST'\)/i);
  });

  it('collapses multiple stuck transactions for the same (product, cost org) to one anchor', () => {
    const { fix } = loadFix();
    const normApply = norm(fix.apply);
    assert.match(normApply, /DISTINCT ON \(ct\.m_product_id, ct\.cost_org_id\)/i);
  });
});

describe('R33 data-fix — fallback cost source', () => {
  it('uses product price as the first fallback source', () => {
    const { fix } = loadFix();
    const normApply = norm(fix.apply);
    assert.match(normApply, /m_productprice/i);
    assert.match(normApply, /pricestd/i);
  });

  it('falls back to literal 1 when no product price exists', () => {
    const { fix } = loadFix();
    const normApply = norm(fix.apply);
    assert.match(normApply, /COALESCE\([^)]*pricestd[^)]*,\s*1\s*\)/i);
  });
});

describe('R33 data-fix — R28 retirement wiring (ETP-5142)', () => {
  it('retired.json lists R28 as retired, superseded by R33, with a real sha256 checksum', async () => {
    const retired = await loadRetiredList();
    assert.ok(retired.has(RETIRED_R28_ID), 'retired.json must list R28 as retired');
    const entry = retired.get(RETIRED_R28_ID);
    assert.equal(typeof entry.checksum, 'string');
    assert.equal(entry.checksum.length, 64, 'sha256 hex digest is 64 chars');
    assert.equal(entry.retiredBy, 'ETP-5142');
    assert.deepEqual(entry.supersededBy, [FIX_ID]);
  });

  it('the recorded R28 checksum matches R28\'s live, untouched file', async () => {
    const retired = await loadRetiredList();
    assert.equal(retired.get(RETIRED_R28_ID).checksum, await sha256Of(RETIRED_R28_ID));
  });

  it('verifyRetiredList accepts the R28 entry against the real catalog', async () => {
    const [catalog, retired] = await Promise.all([
      loadCatalogWithRetirement().then((c) => c.map(({ fixId }) => ({ fixId }))),
      loadRetiredList(),
    ]);
    const retiredIds = await verifyRetiredList(catalog, retired);
    assert.ok(retiredIds.has(RETIRED_R28_ID));
  });

  it('loadCatalogWithRetirement flags R28 as retired and R33 as active', async () => {
    const catalog = await loadCatalogWithRetirement();
    const r28 = catalog.find((f) => f.fixId === RETIRED_R28_ID);
    const r33 = catalog.find((f) => f.fixId === FIX_ID);
    assert.ok(r28, 'R28 must still be present in the catalog (immutable, never removed)');
    assert.equal(r28.retired, true, 'R28 must be flagged retired');
    assert.ok(r33, 'R33 must be present in the catalog');
    assert.equal(r33.retired, false, 'R33 itself must not be retired');
  });

  it('R28\'s own file stays byte-for-byte untouched (immutability)', async () => {
    const liveChecksum = await sha256Of(RETIRED_R28_ID);
    const retired = await loadRetiredList();
    // A mismatch here means someone edited the immutable R28 file after retirement —
    // verifyRetiredList would already throw for this, but assert it directly too so this
    // suite fails with an unambiguous message rather than relying on a different describe block.
    assert.equal(liveChecksum, retired.get(RETIRED_R28_ID).checksum);
  });
});
