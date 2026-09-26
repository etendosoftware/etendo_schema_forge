// @covers scripts/check-test-hygiene.js
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkFile,
  findAssertionlessBlocks,
  findClosingParen,
  formatAnnotation,
  isTestFile,
  isTicketNamed,
  isVitestFile,
  main,
  parseAddedLines,
  parseCoversWithLines,
  parseNameStatus,
} from '../check-test-hygiene.js';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-test-hygiene.js');

describe('isTestFile', () => {
  it('accepts test, vitest and spec files in any JS/TS flavour', () => {
    for (const path of ['a/b.test.js', 'a/b.vitest.jsx', 'e2e/x.spec.js', 'a/b.test.mjs', 'a/b.spec.tsx']) {
      assert.equal(isTestFile(path), true, path);
    }
  });

  it('rejects sources, .claude/ files and node_modules', () => {
    assert.equal(isTestFile('a/b.js'), false);
    assert.equal(isTestFile('a/test.js'), false);
    assert.equal(isTestFile('.claude/worktrees/x/a.test.js'), false);
    assert.equal(isTestFile('tools/app-shell/node_modules/x/a.test.js'), false);
  });
});

describe('isVitestFile', () => {
  it('accepts *.vitest.* anywhere', () => {
    assert.equal(isVitestFile('artifacts/x/__tests__/a.vitest.jsx'), true);
  });

  it('accepts *.spec.* only under tools/app-shell/src', () => {
    assert.equal(isVitestFile('tools/app-shell/src/lib/__tests__/a.spec.js'), true);
    assert.equal(isVitestFile('e2e/tests/flows/a.spec.js'), false);
  });

  it('rejects Node test runner files', () => {
    assert.equal(isVitestFile('tools/app-shell/src/lib/__tests__/a.test.js'), false);
  });
});

describe('isTicketNamed', () => {
  it('flags an ETP key in the basename, with or without a dash, any case', () => {
    assert.equal(isTicketNamed('x/__tests__/etp-1234-foo.test.js'), true);
    assert.equal(isTicketNamed('x/__tests__/Foo.ETP1234.vitest.jsx'), true);
  });

  it('ignores the key in a directory and short numbers', () => {
    assert.equal(isTicketNamed('scripts/etp-4177-tax-migration/foo.test.js'), false);
    assert.equal(isTicketNamed('x/etp-12-foo.test.js'), false);
    assert.equal(isTicketNamed('x/foo.test.js'), false);
  });
});

describe('parseCoversWithLines', () => {
  it('returns each tag with its 1-based line', () => {
    const src = 'import x from "y";\n// @covers a/b.js\n\n/** @covers c/d.jsx */';
    assert.deepEqual(parseCoversWithLines(src), [
      { path: 'a/b.js', line: 2 },
      { path: 'c/d.jsx', line: 4 },
    ]);
  });

  it('returns an empty list without tags', () => {
    assert.deepEqual(parseCoversWithLines('it("x", () => {});'), []);
  });
});

describe('findClosingParen', () => {
  it('returns the index just past the matching parenthesis', () => {
    const src = 'f(a, (b), c) + 1';
    assert.equal(findClosingParen(src, 1), 12);
  });

  it('ignores parentheses inside single, double and template strings', () => {
    const src = "f(')', \"(\", `)`, 'it\\')') end";
    assert.equal(src.slice(0, findClosingParen(src, 1)), "f(')', \"(\", `)`, 'it\\')')");
  });

  it('handles template interpolations that contain calls and strings', () => {
    const src = 'f(`a ${g(")")} b`) end';
    assert.equal(src.slice(0, findClosingParen(src, 1)), 'f(`a ${g(")")} b`)');
  });

  it('ignores parentheses inside line and block comments', () => {
    const src = 'f(a, // )\n /* ) ( */ b) end';
    assert.equal(src.slice(0, findClosingParen(src, 1)), 'f(a, // )\n /* ) ( */ b)');
  });

  it('returns -1 when the call, a string or a comment never closes', () => {
    assert.equal(findClosingParen('f(a, b', 1), -1);
    assert.equal(findClosingParen("f('a)", 1), -1);
    assert.equal(findClosingParen('f(a /* )', 1), -1);
    assert.equal(findClosingParen('f(a // )', 1), -1);
  });
});

describe('findAssertionlessBlocks', () => {
  it('reports a block with no assertion, with its line and name', () => {
    const src = "it('ok', () => {\n  expect(1).toBe(1);\n});\nit('bad', () => {\n  render(<X />);\n});";
    assert.deepEqual(findAssertionlessBlocks(src), [{ line: 4, name: 'bad' }]);
  });

  it('accepts expect helpers and node assert calls', () => {
    const src = [
      "test('helper', () => { expectRow(row, 'x'); });",
      "test('node', () => { assert.equal(a, 1); });",
      "test('chained', async () => { await expect(p).rejects.toThrow(); });",
    ].join('\n');
    assert.deepEqual(findAssertionlessBlocks(src), []);
  });

  it('ignores skip, todo and callback-less blocks', () => {
    const src = [
      "it.skip('skipped', () => { run(); });",
      "it.todo('later');",
      "it('pending');",
    ].join('\n');
    assert.deepEqual(findAssertionlessBlocks(src), []);
  });

  it('reports only/concurrent modifiers and function callbacks', () => {
    const src = "it.only('a', () => { run(); });\ntest.concurrent('b', async function () { run(); });";
    assert.deepEqual(findAssertionlessBlocks(src), [{ line: 1, name: 'a' }, { line: 2, name: 'b' }]);
  });

  it('ignores it/test called as a member of another object', () => {
    assert.deepEqual(findAssertionlessBlocks("suite.it('x', () => { run(); });"), []);
  });

  it('checks the body of it.each(table) and test.each`table`', () => {
    const src = [
      "it.each([[1], [2]])('ok %s', (n) => { expect(n).toBeTruthy(); });",
      "test.each([[1]])('bad %s', (n) => { run(n); });",
      'it.each`',
      '  a    | b',
      '  ${1} | ${2}',
      "`('tagged $a', ({ a }) => { run(a); });",
    ].join('\n');
    assert.deepEqual(findAssertionlessBlocks(src), [
      { line: 2, name: 'bad %s' },
      { line: 3, name: 'tagged $a' },
    ]);
  });

  it('with addedLines, reports only blocks that start on an added line', () => {
    const src = "it('old', () => { run(); });\nit('new', () => { run(); });";
    assert.deepEqual(findAssertionlessBlocks(src, new Set([2])), [{ line: 2, name: 'new' }]);
    assert.deepEqual(findAssertionlessBlocks(src, new Set()), []);
  });

  it('counts an expect() inside a comment as an assertion (heuristic limit)', () => {
    // The heuristic scans the raw body text, so a commented-out expect() hides the finding.
    const src = "it('x', () => {\n  // expect(y)\n  run();\n});";
    assert.deepEqual(findAssertionlessBlocks(src), []);
  });
});

describe('checkFile', () => {
  const exists = (p) => p === 'src/real.js';
  const rules = (findings) => findings.map((f) => f.rule);
  const assertionless = "it('empty', () => {\n  run();\n});\n";

  it('returns nothing for a clean file', () => {
    const src = "// @covers src/real.js\nit('x', () => { expect(1).toBe(1); });";
    assert.deepEqual(checkFile({ path: 'src/__tests__/real.vitest.jsx', status: 'A', src }, exists), []);
  });

  it('flags missing @covers on added and modified files', () => {
    for (const status of ['A', 'M', 'R']) {
      const findings = checkFile({ path: 'src/__tests__/a.test.js', status, src: 'x' }, exists);
      assert.deepEqual(findings, [{
        path: 'src/__tests__/a.test.js',
        line: 1,
        rule: 'missing-covers',
        message: 'test file has no `@covers <repo-relative path>` tag',
      }], status);
    }
  });

  it('flags each @covers that points to a missing path, on its line', () => {
    const src = '// @covers src/real.js\n// @covers src/gone.js';
    const findings = checkFile({ path: 'src/__tests__/a.test.js', status: 'M', src }, exists);
    assert.deepEqual(findings, [{
      path: 'src/__tests__/a.test.js',
      line: 2,
      rule: 'covers-not-found',
      message: '@covers points to a missing path: src/gone.js',
    }]);
  });

  it('flags a ticket name only on added or renamed files', () => {
    const base = { path: 'src/__tests__/etp-1234-foo.test.js', src: '// @covers src/real.js' };
    assert.deepEqual(rules(checkFile({ ...base, status: 'A' }, exists)), ['ticket-named']);
    assert.deepEqual(rules(checkFile({ ...base, status: 'R' }, exists)), ['ticket-named']);
    assert.deepEqual(rules(checkFile({ ...base, status: 'M' }, exists)), []);
  });

  it('checks assertions only in Vitest files', () => {
    const src = `// @covers src/real.js\n${assertionless}`;
    assert.deepEqual(checkFile({ path: 'src/__tests__/a.test.js', status: 'A', src }, exists), []);
    assert.deepEqual(checkFile({ path: 'src/__tests__/a.vitest.jsx', status: 'A', src }, exists), [{
      path: 'src/__tests__/a.vitest.jsx',
      line: 2,
      rule: 'no-assertion',
      message: 'test block has no expect()/assert call: "empty" (heuristic)',
    }]);
  });

  it('checks every block of a new file even when addedLines is given', () => {
    const src = `// @covers src/real.js\n${assertionless}`;
    const findings = checkFile({ path: 'a.vitest.jsx', status: 'A', src, addedLines: new Set([99]) }, exists);
    assert.deepEqual(rules(findings), ['no-assertion']);
  });

  it('checks only added blocks of a modified file', () => {
    const src = `// @covers src/real.js\n${assertionless}${assertionless}`;
    const onlySecond = checkFile({ path: 'a.vitest.jsx', status: 'M', src, addedLines: new Set([5, 6, 7]) }, exists);
    assert.deepEqual(onlySecond.map((f) => f.line), [5]);
    const untouched = checkFile({ path: 'a.vitest.jsx', status: 'M', src, addedLines: new Set([1]) }, exists);
    assert.deepEqual(untouched, []);
  });

  it('omits the block name from the message when it cannot be read', () => {
    const src = '// @covers src/real.js\nit(name, () => { run(); });';
    const [finding] = checkFile({ path: 'a.vitest.jsx', status: 'A', src }, exists);
    assert.equal(finding.message, 'test block has no expect()/assert call (heuristic)');
  });
});

describe('parseNameStatus', () => {
  it('keeps added, modified and renamed test files, using the new path of a rename', () => {
    const out = [
      'A\tsrc/__tests__/a.test.js',
      'M\tsrc/__tests__/b.vitest.jsx',
      'R087\tsrc/__tests__/old.test.js\tsrc/__tests__/new.test.js',
      'D\tsrc/__tests__/gone.test.js',
      'C100\tsrc/__tests__/c.test.js\tsrc/__tests__/copy.test.js',
      'A\tsrc/lib/a.js',
      'A\t.claude/worktrees/x/z.test.js',
      '',
    ].join('\n');
    assert.deepEqual(parseNameStatus(out), [
      { status: 'A', path: 'src/__tests__/a.test.js' },
      { status: 'M', path: 'src/__tests__/b.vitest.jsx' },
      { status: 'R', path: 'src/__tests__/new.test.js' },
    ]);
  });

  it('returns an empty list for empty output', () => {
    assert.deepEqual(parseNameStatus(''), []);
  });
});

describe('parseAddedLines', () => {
  it('expands every hunk header into the added line numbers of the new file', () => {
    const diff = [
      'diff --git a/x b/x',
      '@@ -1,0 +5,3 @@ describe(',
      '+a', '+b', '+c',
      '@@ -10 +20 @@',
      '+d',
      '@@ -3,2 +4,0 @@',
    ].join('\n');
    assert.deepEqual([...parseAddedLines(diff)].sort((a, b) => a - b), [5, 6, 7, 20]);
  });

  it('returns an empty set when nothing was added', () => {
    assert.equal(parseAddedLines('').size, 0);
  });
});

describe('formatAnnotation', () => {
  const finding = { path: 'a.test.js', line: 3, rule: 'missing-covers', message: 'no tag' };

  it('emits a GitHub warning in annotate mode', () => {
    assert.equal(formatAnnotation(finding, 'annotate'),
      '::warning file=a.test.js,line=3,title=test-hygiene/missing-covers::no tag');
  });

  it('emits a GitHub error in block mode', () => {
    assert.equal(formatAnnotation(finding, 'block'),
      '::error file=a.test.js,line=3,title=test-hygiene/missing-covers::no tag');
  });
});

describe('main', () => {
  it('exits 2 with usage when base/head are missing or the mode is unknown', (t) => {
    const errors = [];
    t.mock.method(console, 'error', (msg) => errors.push(msg));
    assert.equal(main([]), 2);
    assert.equal(main(['--base', 'a']), 2);
    assert.equal(main(['--base', 'a', '--head', 'b', '--mode', 'strict']), 2);
    assert.equal(errors.length, 3);
    assert.ok(errors.every((msg) => msg.startsWith('Usage: node scripts/check-test-hygiene.js')));
  });

  describe('against a fixture repo (child process)', () => {
    let tmp;
    let base;
    let dirty;
    let clean;

    const git = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' }).trim();
    const write = (rel, content) => {
      mkdirSync(dirname(join(tmp, rel)), { recursive: true });
      writeFileSync(join(tmp, rel), content);
    };
    const commit = (msg) => {
      git('add', '-A');
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-gpg-sign', '-m', msg);
      return git('rev-parse', 'HEAD');
    };

    before(() => {
      tmp = realpathSync(mkdtempSync(join(tmpdir(), 'test-hygiene-')));
      git('init', '-q');
      write('src/real.js', 'export const x = 1;\n');
      base = commit('base');
      write('src/__tests__/real.test.js', "// @covers src/real.js\nit('x', () => { assert.ok(1); });\n");
      clean = commit('clean');
      write('src/__tests__/etp-1234-bad.test.js', '// no tag\n');
      dirty = commit('dirty');
    });

    after(() => rmSync(tmp, { recursive: true, force: true }));

    const run = (args, extraEnv = {}) => {
      const env = { ...process.env, SF_ROOT: tmp };
      delete env.TEST_HYGIENE_MODE;
      Object.assign(env, extraEnv);
      return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: tmp, env, encoding: 'utf8' });
    };

    it('annotate mode prints warnings and exits 0', () => {
      const res = run(['--base', base, '--head', dirty]);
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /::warning file=src\/__tests__\/etp-1234-bad\.test\.js,line=1,title=test-hygiene\/missing-covers::/);
      assert.match(res.stdout, /title=test-hygiene\/ticket-named::/);
      assert.match(res.stdout, /test-hygiene: 2 changed test file\(s\), 2 finding\(s\) \[mode: annotate\]/);
      assert.match(res.stdout, /See docs\/testing\/test-reuse-policy\.md/);
    });

    it('block mode prints errors and exits 1 when something is found', () => {
      const res = run(['--base', base, '--head', dirty, '--mode', 'block']);
      assert.equal(res.status, 1);
      assert.match(res.stdout, /::error file=src\/__tests__\/etp-1234-bad\.test\.js/);
      assert.doesNotMatch(res.stdout, /::warning/);
    });

    it('takes the mode from TEST_HYGIENE_MODE when no flag is given', () => {
      const res = run(['--base', base, '--head', dirty], { TEST_HYGIENE_MODE: 'block' });
      assert.equal(res.status, 1);
    });

    it('block mode exits 0 when the range is clean', () => {
      const res = run(['--base', base, '--head', clean, '--mode', 'block']);
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /test-hygiene: 1 changed test file\(s\), 0 finding\(s\) \[mode: block\]/);
      assert.doesNotMatch(res.stdout, /See docs/);
    });
  });
});
