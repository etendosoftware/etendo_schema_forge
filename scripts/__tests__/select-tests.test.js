// @covers scripts/select-tests.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  globToRegExp,
  groupOf,
  parseGlobPatterns,
  planLines,
  resolveToFile,
  selectTests,
  summary,
} from '../select-tests.js';

/** selectTests over an in-memory repo: { path: text }. */
function select(tree, changed) {
  return selectTests({ changed, files: Object.keys(tree), readText: (rel) => tree[rel] ?? null });
}

const tests = (selection) => [...selection.tests].sort();
const whole = (selection) => [...selection.whole].sort();

describe('groupOf', () => {
  it('places each unit test file in the group `make test-all-coverage` runs it in', () => {
    assert.equal(groupOf('cli/test/generator.test.js'), 'cli');
    assert.equal(groupOf('tools/app-shell/src/hooks/__tests__/useThing.test.js'), 'appshell');
    assert.equal(groupOf('tools/app-shell/src/__tests__/top.test.js'), 'appshell');
    assert.equal(groupOf('tools/app-shell/test/router.test.js'), 'appshell-test');
    assert.equal(groupOf('artifacts/contacts/__tests__/contract.test.js'), 'artifacts');
    assert.equal(groupOf('scripts/__tests__/find-tests.test.js'), 'scripts');
    assert.equal(groupOf('tools/app-shell/src/components/Grid.vitest.jsx'), 'vitest');
    assert.equal(groupOf('tools/app-shell/src/Grid.spec.js'), 'vitest');
  });

  it('leaves out what no group runs', () => {
    assert.equal(groupOf('tools/app-shell/src/hooks/__tests__/useEntity-helpers.test.js'), null);
    assert.equal(groupOf('e2e/tests/login.mocked.spec.js'), null);
    assert.equal(groupOf('tools/app-shell/src/hooks/useThing.js'), null);
  });
});

describe('resolveToFile', () => {
  const files = new Set(['tools/app-shell/src/lib/format.js', 'tools/app-shell/src/ui/index.jsx', 'artifacts/contacts/contract.json']);

  it('resolves relative paths and the @/ and @generated/ aliases, with or without extension', () => {
    assert.equal(resolveToFile('../lib/format', 'tools/app-shell/src/hooks/useThing.js', files), 'tools/app-shell/src/lib/format.js');
    assert.equal(resolveToFile('@/ui', 'tools/app-shell/src/App.jsx', files), 'tools/app-shell/src/ui/index.jsx');
    assert.equal(resolveToFile('@generated/contacts/contract.json', 'tools/app-shell/src/App.jsx', files), 'artifacts/contacts/contract.json');
  });

  it('returns null for packages and paths that do not exist', () => {
    assert.equal(resolveToFile('react', 'tools/app-shell/src/App.jsx', files), null);
    assert.equal(resolveToFile('./missing', 'tools/app-shell/src/App.jsx', files), null);
  });
});

describe('import.meta.glob', () => {
  it('reads single and array patterns and drops negations', () => {
    const src = "const a = import.meta.glob('./locales/*.json');\nconst b = import.meta.glob(['@generated/*/contract.json', '!**/skip.json']);";
    assert.deepEqual(parseGlobPatterns(src), ['./locales/*.json', '@generated/*/contract.json']);
  });

  it('turns a glob into an anchored regular expression', () => {
    assert.ok(globToRegExp('artifacts/*/contract.json').test('artifacts/contacts/contract.json'));
    assert.ok(!globToRegExp('artifacts/*/contract.json').test('artifacts/a/b/contract.json'));
    assert.ok(globToRegExp('src/**/*.json').test('src/a/b/c.json'));
    assert.ok(globToRegExp('src/**/*.json').test('src/c.json'));
    assert.ok(globToRegExp('core.{es,en}.json').test('core.en.json'));
    assert.ok(!globToRegExp('core.{es,en}.json').test('core.fr.json'));
  });
});

describe('selectTests', () => {
  const tree = {
    'tools/app-shell/src/lib/format.js': 'export const f = 1;',
    'tools/app-shell/src/lib/unused.js': 'export const u = 1;',
    'tools/app-shell/src/hooks/useThing.js': "import { f } from '../lib/format';",
    'tools/app-shell/src/hooks/__tests__/useThing.test.js': "import x from '../useThing.js';",
    'tools/app-shell/src/components/Grid.vitest.jsx': "import { f } from '@/lib/format';",
    'tools/app-shell/src/components/Other.vitest.jsx': "import React from 'react';",
    'tools/app-shell/src/hooks/useContracts.js': "const all = import.meta.glob('@generated/*/contract.json');",
    'tools/app-shell/src/hooks/useContracts.vitest.js': "import c from './useContracts';",
    'artifacts/contacts/contract.json': '{}',
    'artifacts/contacts/decisions.json': '{}',
    'artifacts/contacts/__tests__/decisions.test.js':
      "const d = readFileSync(join(__dirname, '..', 'other.json'));",
    'artifacts/contacts/fixture.json': '{}',
    'artifacts/contacts/__tests__/fixture.test.js':
      "import { readFileSync } from 'node:fs';\nconst d = readFileSync(join(__dirname, '..', 'fixture.json'));",
    'cli/src/templates/page.hbs': '<div/>',
    'cli/test/gen.test.js': "import g from '../src/gen.js';",
    'cli/src/gen.js': 'export default 1;',
    'schemas/window.schema.json': '{}',
    'docs/guide.md': '# guide',
    'e2e/tests/login.mocked.spec.js': "import x from '../helpers';",
  };

  it('selects a changed unit test itself', () => {
    const s = select(tree, ['cli/test/gen.test.js']);
    assert.deepEqual(tests(s), ['cli/test/gen.test.js']);
    assert.deepEqual(whole(s), []);
  });

  it('follows imports transitively, through relative paths and aliases', () => {
    const s = select(tree, ['tools/app-shell/src/lib/format.js']);
    assert.deepEqual(tests(s), [
      'tools/app-shell/src/components/Grid.vitest.jsx',
      'tools/app-shell/src/hooks/__tests__/useThing.test.js',
    ]);
  });

  it('follows import.meta.glob patterns to the files they match', () => {
    const s = select(tree, ['artifacts/contacts/contract.json']);
    assert.deepEqual(tests(s), ['tools/app-shell/src/hooks/useContracts.vitest.js']);
  });

  it('selects a test that reads the changed file as text', () => {
    const s = select(tree, ['artifacts/contacts/fixture.json']);
    assert.deepEqual(tests(s), ['artifacts/contacts/__tests__/fixture.test.js']);
  });

  it('lists a code module no test reaches as untested and runs nothing for it', () => {
    const s = select(tree, ['tools/app-shell/src/lib/unused.js']);
    assert.deepEqual(tests(s), []);
    assert.deepEqual(whole(s), []);
    assert.deepEqual(s.untested, ['tools/app-shell/src/lib/unused.js']);
  });

  it('falls back to the tests of the window for a non-code artifact file nothing depends on', () => {
    const s = select(tree, ['artifacts/contacts/decisions.json']);
    assert.deepEqual(tests(s), [
      'artifacts/contacts/__tests__/decisions.test.js',
      'artifacts/contacts/__tests__/fixture.test.js',
    ]);
    assert.match(s.reasons[0], /^fallback: artifacts\/contacts\/decisions\.json/);
  });

  it('falls back to the cli group, or to every group outside a known area', () => {
    assert.deepEqual(whole(select(tree, ['cli/src/templates/page.hbs'])), ['cli']);
    assert.equal(select(tree, ['schemas/window.schema.json']).whole.size, 6);
  });

  it('runs every group on a dependency or tooling change, and only vitest on its config', () => {
    assert.equal(select(tree, ['package-lock.json']).whole.size, 6);
    assert.equal(select(tree, ['.githooks/pre-push']).whole.size, 6);
    assert.deepEqual(whole(select(tree, ['tools/app-shell/vitest.config.js'])), ['vitest']);
  });

  it('ignores docs, Playwright files and deleted files', () => {
    const s = select(tree, ['docs/guide.md', 'e2e/tests/login.mocked.spec.js', 'cli/src/removed.js']);
    assert.deepEqual(tests(s), []);
    assert.deepEqual(whole(s), []);
    assert.deepEqual(s.untested, []);
  });

  it('does not list single tests of a group that runs whole', () => {
    const s = select(tree, ['cli/test/gen.test.js', 'cli/src/templates/page.hbs']);
    assert.deepEqual(tests(s), []);
    assert.deepEqual(whole(s), ['cli']);
  });
});

describe('plan output', () => {
  const selection = {
    whole: new Set(['cli']),
    tests: new Set(['tools/app-shell/src/components/Grid.vitest.jsx']),
    reasons: ['whole group: Makefile → cli'],
    untested: ['tools/app-shell/src/lib/unused.js'],
  };

  it('writes one TSV line per test, and `*` for a whole group, in group order', () => {
    assert.deepEqual(planLines(selection), ['cli\t*', 'vitest\ttools/app-shell/src/components/Grid.vitest.jsx']);
  });

  it('summarizes the selected share per group, the reasons and the untested modules', () => {
    const files = ['cli/test/a.test.js', 'cli/test/b.test.js', 'tools/app-shell/src/components/Grid.vitest.jsx',
      'tools/app-shell/src/components/Other.vitest.jsx'];
    const lines = summary(selection, files);
    assert.equal(lines[0], 'select-tests: 3/4 unit test files (cli 2/2, appshell 0/0, appshell-test 0/0, '
      + 'artifacts 0/0, scripts 0/0, vitest 1/2)');
    assert.deepEqual(lines.slice(1), ['  whole group: Makefile → cli',
      '  untested (no unit test reaches it): tools/app-shell/src/lib/unused.js']);
  });
});
