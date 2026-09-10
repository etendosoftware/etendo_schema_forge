import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static contract for the Standard-cost replacement for retired R18.
 *
 * R18 seeded Average-cost (`costtype='AVA'`) rows. The replacement must seed Standard-cost
 * anchors instead, keep tenant isolation/idempotency, and use the approved value fallback:
 * existing product price first, then literal 1. Row-level behavior still needs a live DB run;
 * this suite pins the SQL invariants that are cheap and deterministic in CI.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260828T120000Z__R28-standard-cost-anchor.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

function loadFix() {
  assert.ok(
    existsSync(FIX_PATH),
    `${FIX_FILE} must exist as the Standard-cost replacement for retired R18`,
  );
  const rawText = readFileSync(FIX_PATH, 'utf8');
  return { rawText, fix: parseFix(rawText, FIX_ID) };
}

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

describe('R28 data-fix — Standard-cost anchor metadata', () => {
  it('parses as the expected SQL fix', () => {
    const { fix } = loadFix();
    assert.equal(fix.id, 'R28-standard-cost-anchor');
    assert.equal(fix.type, 'sql');
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /Standard/i);
    assert.match(fix.description, /cost/i);
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });
});

describe('R28 data-fix — Standard, never Average', () => {
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

describe('R28 data-fix — tenant isolation and idempotency', () => {
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
    assert.match(normApply, /NOT EXISTS \(\s*SELECT 1 FROM m_costing/i);
    assert.match(normApply, /c\.isactive = 'Y'/i);
    assert.match(normApply, /costtype IN \('STA', 'ST'\)/i);
  });
});

describe('R28 data-fix — fallback cost source', () => {
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
