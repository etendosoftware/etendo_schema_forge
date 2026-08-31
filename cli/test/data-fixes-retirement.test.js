import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  loadCatalog,
  loadRetiredList,
  verifyRetiredList,
  loadCatalogWithRetirement,
} from '../src/data-fixes/run.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const RETIRED_R16_ID = '20260727T114306Z__R16-tenant-roles-and-webhook-access';
const RETIRED_R18_ID = '20260803T140000Z__R18-stuck-average-cost-anchor';

async function sha256Of(fixId) {
  const text = await readFile(join(SQL_DIR, `${fixId}.sql`), 'utf-8');
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

describe('loadRetiredList (ETP-4877)', () => {
  it('loads the real retired.json and finds the R16 entry', async () => {
    const retired = await loadRetiredList();
    assert.ok(retired.has(RETIRED_R16_ID), 'retired.json must list R16 as retired');
    const entry = retired.get(RETIRED_R16_ID);
    assert.equal(typeof entry.checksum, 'string');
    assert.equal(entry.checksum.length, 64, 'sha256 hex digest is 64 chars');
    assert.equal(entry.retiredBy, 'ETP-4877');
  });

  it('loads the real retired.json and finds the R18 Average-cost anchor entry', async () => {
    const retired = await loadRetiredList();
    assert.ok(retired.has(RETIRED_R18_ID), 'retired.json must list R18 as retired');
    const entry = retired.get(RETIRED_R18_ID);
    assert.equal(typeof entry.checksum, 'string');
    assert.equal(entry.checksum.length, 64, 'sha256 hex digest is 64 chars');
    assert.match(entry.reason, /Average/i);
    assert.match(entry.reason, /Standard/i);
  });
});

describe('verifyRetiredList (ETP-4877) — a retired fix is genuinely never evaluated', () => {
  it('accepts a retired fix whose live file checksum matches the recorded one', async () => {
    const checksum = await sha256Of(RETIRED_R16_ID);
    const catalog = [{ fixId: RETIRED_R16_ID }, { fixId: 'some-other-fix' }];
    const retired = new Map([[RETIRED_R16_ID, { fixId: RETIRED_R16_ID, checksum }]]);
    const retiredIds = await verifyRetiredList(catalog, retired);
    assert.ok(retiredIds.has(RETIRED_R16_ID));
    assert.equal(retiredIds.size, 1);
  });

  it('leaves an unretired fix unaffected — empty retired list is a no-op', async () => {
    const catalog = [{ fixId: RETIRED_R16_ID }, { fixId: 'some-other-fix' }];
    const retiredIds = await verifyRetiredList(catalog, new Map());
    assert.equal(retiredIds.size, 0);
  });

  it('fails loudly on a checksum mismatch, never silently skipping the wrong file', async () => {
    const catalog = [{ fixId: RETIRED_R16_ID }];
    const retired = new Map([
      [RETIRED_R16_ID, { fixId: RETIRED_R16_ID, checksum: '0'.repeat(64) }],
    ]);
    await assert.rejects(
      () => verifyRetiredList(catalog, retired),
      /checksum mismatch for retired fix/,
    );
  });

  it('fails loudly when a retired fixId is missing from the catalog (removed/renamed file)', async () => {
    const retired = new Map([
      ['20260101T000000Z__does-not-exist', { fixId: '20260101T000000Z__does-not-exist', checksum: '0'.repeat(64) }],
    ]);
    await assert.rejects(
      () => verifyRetiredList([{ fixId: 'unrelated-fix' }], retired),
      /not in the \.sql catalog/,
    );
  });

  it('is a pure no-op with an empty catalog and empty retired map', async () => {
    const retiredIds = await verifyRetiredList([], new Map());
    assert.equal(retiredIds.size, 0);
  });
});

describe('loadCatalogWithRetirement (ETP-4877) — end-to-end against the real catalog', () => {
  it('flags exactly the retired.json entries as .retired, and nothing else', async () => {
    const catalog = await loadCatalogWithRetirement();
    const retiredFixIds = catalog.filter(f => f.retired).map(f => f.fixId);
    assert.deepEqual(retiredFixIds, [RETIRED_R16_ID, RETIRED_R18_ID]);

    const unretiredSample = catalog.find(f => f.fixId !== RETIRED_R16_ID);
    assert.ok(unretiredSample, 'catalog must contain at least one non-retired fix to compare against');
    assert.equal(unretiredSample.retired, false);
  });

  it('every catalog fix from loadCatalog() is still present after retirement flagging (no fixes dropped)', async () => {
    const [plain, withRetirement] = await Promise.all([loadCatalog(), loadCatalogWithRetirement()]);
    assert.equal(withRetirement.length, plain.length);
    assert.deepEqual(
      withRetirement.map(f => f.fixId).sort(),
      plain.map(f => f.fixId).sort(),
    );
  });
});
