// @covers scripts/lib/playwright-quarantine.js
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  entryProblems,
  expiredEntries,
  loadQuarantine,
  main,
  quarantinePattern,
} from '../lib/playwright-quarantine.js';

const SPEC = 'tests/flows/sales/quotation.mocked.spec.js';
const TITLE = 'Sales Quotation (ETP-4027) › B: confirming "Crear Pedido" POSTs to Convertquotation';
const SOURCE = `test.describe('Sales Quotation (ETP-4027)', () => {
  test('B: confirming "Crear Pedido" POSTs to Convertquotation', async () => {});
});`;
const ENTRY = { file: SPEC, title: TITLE, reason: 'fails one run in five', ticket: 'ETP-5800', since: '2026-10-13', until: '2026-10-27' };
const readSpec = (file) => (file === SPEC ? SOURCE : null);

/** The string Playwright's grep tests: project, file relative to testDir, describes, test. */
const grepTarget = (project, file, title) => [project, file, ...title.split(' › ')].join(' ');

describe('quarantinePattern', () => {
  const pattern = quarantinePattern([ENTRY]);

  it('matches the listed test in either mocked project', () => {
    assert.ok(pattern.test(grepTarget('mocked', 'flows/sales/quotation.mocked.spec.js', TITLE)));
    assert.ok(pattern.test(grepTarget('mocked-serial', 'flows/sales/quotation.mocked.spec.js', TITLE)));
  });

  it('matches it under an outer describe and with tags after the title', () => {
    const target = `mocked flows/sales/quotation.mocked.spec.js Outer ${TITLE.split(' › ').join(' ')} @slow`;
    assert.ok(pattern.test(target));
  });

  it('leaves out the same title in another file and a longer title that starts the same', () => {
    assert.ok(!pattern.test(grepTarget('mocked', 'flows/sales/other.mocked.spec.js', TITLE)));
    assert.ok(!pattern.test(grepTarget('mocked', 'flows/sales/quotation.mocked.spec.js', `${TITLE} again`)));
  });

  it('is null for an empty list', () => {
    assert.equal(quarantinePattern([]), null);
  });
});

describe('entryProblems', () => {
  it('accepts a complete entry whose test exists', () => {
    assert.deepEqual(entryProblems(ENTRY, readSpec), []);
  });

  it('reports missing fields and malformed values', () => {
    const problems = entryProblems({ file: 'tests/x.spec.js', title: '', ticket: '5800', since: '13/10/2026' }, readSpec);
    assert.deepEqual(problems, [
      'missing "title"', 'missing "reason"', 'missing "until"',
      '"file" must be a mocked spec under tests/',
      '"ticket" must be an ETP-NNNN key',
      '"since" must be YYYY-MM-DD',
    ]);
  });

  it('caps a quarantine at 14 days and rejects an end before the start', () => {
    assert.deepEqual(entryProblems({ ...ENTRY, until: '2026-10-28' }, readSpec), ['quarantine longer than 14 days']);
    assert.deepEqual(entryProblems({ ...ENTRY, until: '2026-10-12' }, readSpec), ['"until" is before "since"']);
  });

  it('reports a spec that is gone and a test that was renamed', () => {
    assert.deepEqual(entryProblems({ ...ENTRY, file: 'tests/gone.mocked.spec.js' }, readSpec),
      ['tests/gone.mocked.spec.js does not exist']);
    assert.deepEqual(entryProblems({ ...ENTRY, title: 'Sales Quotation (ETP-4027) › B: renamed' }, readSpec),
      [`title not found in ${SPEC} (renamed or removed?)`]);
  });
});

describe('expiredEntries', () => {
  it('lists the entries whose end date has passed', () => {
    assert.deepEqual(expiredEntries([ENTRY], '2026-10-27'), []);
    assert.deepEqual(expiredEntries([ENTRY], '2026-10-28'), [ENTRY]);
  });
});

describe('main', () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), 'quarantine-')); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  function run(argv, tests, today = '2026-10-20') {
    const path = join(dir, 'quarantine.json');
    writeFileSync(path, JSON.stringify({ tests }));
    const lines = [];
    const original = console.log;
    console.log = (line) => lines.push(String(line));
    try {
      return { code: main(argv, { today, path }), lines };
    } finally {
      console.log = original;
    }
  }

  it('counts the quarantined tests', () => {
    assert.deepEqual(run(['count'], [ENTRY, ENTRY]), { code: 0, lines: ['2'] });
  });

  it('fails the check on a broken entry and only warns about an expired one', () => {
    const broken = run(['check'], [{ ...ENTRY, ticket: '' }]);
    assert.equal(broken.code, 1);
    const expired = run(['check'], [{ ...ENTRY, file: 'tests/flows/accounting/calendar.mocked.spec.js', title: 'Calendar' }], '2026-11-01');
    assert.match(expired.lines.at(-1), /WARNING .* expired on 2026-10-27 \(ETP-5800\)/);
  });
});

describe("the repository's quarantine list", () => {
  it('has only complete entries for tests that exist', () => {
    for (const entry of loadQuarantine()) {
      assert.deepEqual(entryProblems(entry), [], `${entry.file} › ${entry.title}`);
    }
  });
});
