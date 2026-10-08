// @covers scripts/find-tests.js
// @covers scripts/lib/git-env.js
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findFunctionalTests,
  findJavaTests,
  formatReport,
  importMatches,
  javaMatchSources,
  javaPathToFqn,
  main,
  parseCovers,
  pathLiteralMatch,
  parseImportSpecifiers,
  readFileSyncMatch,
  resolveSpecifier,
  resolveTarget,
} from '../find-tests.js';
import { sanitizedGitEnv } from '../lib/git-env.js';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'find-tests.js');

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}

function gitInit(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore', env: sanitizedGitEnv() });
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init', '--no-gpg-sign');
}

describe('resolveTarget', () => {
  let tmp;
  let sfRoot;
  let goRoot;

  before(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'find-tests-target-')));
    sfRoot = join(tmp, 'schema_forge');
    goRoot = join(tmp, 'modules', 'com.etendoerp.go');
    writeTree(sfRoot, { 'tools/app-shell/src/lib/foo.js': 'export const foo = 1;\n' });
    writeTree(goRoot, {
      'src/com/etendoerp/go/rest/Foo.java': 'package com.etendoerp.go.rest;\nclass Foo {}\n',
      'src/com/etendoerp/go/other/Foo.java': 'package com.etendoerp.go.other;\nclass Foo {}\n',
      'src/com/etendoerp/go/rest/Bar.java': 'package com.etendoerp.go.rest;\nclass Bar {}\n',
      'src-util/modulescript/src/com/etendoerp/go/modulescript/SetupScript.java':
        'package com.etendoerp.go.modulescript;\nclass SetupScript {}\n',
      'docs/readme.md': '# go\n',
    });
    writeTree(tmp, { 'outside/x.js': '' });
    gitInit(goRoot);
  });

  after(() => rmSync(tmp, { recursive: true, force: true }));

  const opts = () => ({ sfRoot, goRoot, cwd: tmp });

  it('returns an error for a missing argument', () => {
    assert.deepEqual(resolveTarget('', opts()), { error: 'missing FILE argument' });
  });

  it('resolves a functional path relative to the schema_forge root', () => {
    assert.deepEqual(resolveTarget('tools/app-shell/src/lib/foo.js', opts()), {
      repo: 'functional',
      relPath: 'tools/app-shell/src/lib/foo.js',
    });
  });

  it('resolves an absolute functional path', () => {
    const abs = join(sfRoot, 'tools/app-shell/src/lib/foo.js');
    assert.equal(resolveTarget(abs, opts()).relPath, 'tools/app-shell/src/lib/foo.js');
  });

  it('resolves a dotted class name to its FQN when the class exists', () => {
    assert.deepEqual(resolveTarget('com.etendoerp.go.rest.Bar', opts()), {
      repo: 'go',
      classes: ['com.etendoerp.go.rest.Bar'],
    });
  });

  it('resolves an FQN under src-util and a nested class to its outer file', () => {
    assert.deepEqual(resolveTarget('com.etendoerp.go.modulescript.SetupScript', opts()).classes,
      ['com.etendoerp.go.modulescript.SetupScript']);
    assert.deepEqual(resolveTarget('com.etendoerp.go.rest.Bar.Inner', opts()).classes,
      ['com.etendoerp.go.rest.Bar.Inner']);
  });

  it('returns an error for an FQN with no source file', () => {
    assert.match(resolveTarget('com.etendoerp.go.DoesNotExist', opts()).error,
      /no Java class com\.etendoerp\.go\.DoesNotExist/);
  });

  it('expands a simple class name to every matching FQN under src', () => {
    const result = resolveTarget('Foo', opts());
    assert.equal(result.repo, 'go');
    assert.deepEqual([...result.classes].sort(), [
      'com.etendoerp.go.other.Foo',
      'com.etendoerp.go.rest.Foo',
    ]);
  });

  it('expands a simple class name that lives under src-util/*/src', () => {
    assert.deepEqual(resolveTarget('SetupScript', opts()), {
      repo: 'go',
      classes: ['com.etendoerp.go.modulescript.SetupScript'],
    });
  });

  it('returns an error for a simple class name with no match', () => {
    assert.match(resolveTarget('Nope', opts()).error, /no Java class named Nope/);
  });

  it('maps a Java path under com.etendoerp.go to its FQN', () => {
    assert.deepEqual(resolveTarget('src/com/etendoerp/go/rest/Bar.java', opts()), {
      repo: 'go',
      classes: ['com.etendoerp.go.rest.Bar'],
    });
  });

  it('rejects a non-Java file under com.etendoerp.go', () => {
    assert.match(resolveTarget(join(goRoot, 'docs/readme.md'), opts()).error, /only Java classes/);
  });

  it('returns an error for a path that does not exist', () => {
    assert.equal(resolveTarget('nope/missing.js', opts()).error, 'file not found: nope/missing.js');
  });

  it('returns an error for a file outside both repos', () => {
    assert.match(resolveTarget(join(tmp, 'outside/x.js'), opts()).error, /is not inside schema_forge or com\.etendoerp\.go/);
  });
});

describe('javaPathToFqn', () => {
  it('derives the FQN from a src path', () => {
    assert.equal(javaPathToFqn('src/com/etendoerp/go/rest/Foo.java'), 'com.etendoerp.go.rest.Foo');
  });

  it('derives the FQN from a src-test/src path', () => {
    assert.equal(javaPathToFqn('src-test/src/com/etendoerp/go/FooTest.java'), 'com.etendoerp.go.FooTest');
  });

  it('accepts a nested prefix and backslashes', () => {
    assert.equal(javaPathToFqn('modules\\x\\src\\com\\a\\Foo.java'), 'com.a.Foo');
  });

  it('returns null outside src', () => {
    assert.equal(javaPathToFqn('lib/com/a/Foo.java'), null);
    assert.equal(javaPathToFqn('src/com/a/Foo.kt'), null);
  });
});

describe('parseCovers', () => {
  it('returns every tag in order, stopping at whitespace and Javadoc stars', () => {
    const src = '// @covers a/b.js\n// @covers c/d.jsx\n/**\n * @covers com.x.Foo*/';
    assert.deepEqual(parseCovers(src), ['a/b.js', 'c/d.jsx', 'com.x.Foo']);
  });

  it('returns an empty list when there is no tag', () => {
    assert.deepEqual(parseCovers('import x from "y";'), []);
  });

  it('ignores @covers inside a string literal', () => {
    const src = "const src = '// @covers src/gone.js';\nit('reads @covers tags', () => {});";
    assert.deepEqual(parseCovers(src), []);
  });

  it('ignores @covers mentioned in comment prose', () => {
    assert.deepEqual(parseCovers('// the @covers tag names src/gone.js\n * see @covers x.Y'), []);
  });
});

describe('parseImportSpecifiers', () => {
  it('collects static, side-effect, re-export, dynamic and require specifiers', () => {
    const src = [
      "import Foo from '../Foo.jsx';",
      "import { a, b } from \"@/lib/ab.js\";",
      "import './styles.css';",
      "export { c } from '../c.js';",
      "const d = await import('../d.js');",
      "const e = require('../e.cjs');",
    ].join('\n');
    assert.deepEqual(parseImportSpecifiers(src).sort(), [
      '../Foo.jsx', '../c.js', '../d.js', '../e.cjs', './styles.css', '@/lib/ab.js',
    ]);
  });

  it('does not count vi.mock or jest.mock targets', () => {
    const src = "vi.mock('../Mocked.jsx', () => ({}));\njest.mock('../Other.js');\nimport Real from '../Real.jsx';";
    assert.deepEqual(parseImportSpecifiers(src), ['../Real.jsx']);
  });

  it('deduplicates repeated specifiers', () => {
    const src = "import a from './x.js';\nconst b = require('./x.js');";
    assert.deepEqual(parseImportSpecifiers(src), ['./x.js']);
  });
});

describe('resolveSpecifier', () => {
  const test = 'tools/app-shell/src/lib/__tests__/foo.test.js';

  it('resolves relative specifiers against the test directory', () => {
    assert.equal(resolveSpecifier('../foo.js', test), 'tools/app-shell/src/lib/foo.js');
    assert.equal(resolveSpecifier('./helper', test), 'tools/app-shell/src/lib/__tests__/helper');
  });

  it('expands the @/ alias to tools/app-shell/src', () => {
    assert.equal(resolveSpecifier('@/auth/useApiFetch.js', test), 'tools/app-shell/src/auth/useApiFetch.js');
  });

  it('expands the @generated/ alias to artifacts', () => {
    assert.equal(resolveSpecifier('@generated/sales-order/custom/X.jsx', test), 'artifacts/sales-order/custom/X.jsx');
  });

  it('returns null for a bare package specifier', () => {
    assert.equal(resolveSpecifier('react', test), null);
    assert.equal(resolveSpecifier('@testing-library/react', test), null);
  });
});

describe('importMatches', () => {
  const test = 'src/a/__tests__/t.test.js';

  it('matches when the specifier omits the extension', () => {
    assert.equal(importMatches('../foo', test, 'src/a/foo.jsx'), true);
  });

  it('matches a directory specifier against its index file', () => {
    assert.equal(importMatches('../dir', test, 'src/a/dir/index.js'), true);
    assert.equal(importMatches('../dir/index', test, 'src/a/dir/index.jsx'), true);
  });

  it('matches an aliased specifier', () => {
    assert.equal(importMatches('@/lib/x.js', test, 'tools/app-shell/src/lib/x.js'), true);
  });

  it('does not match a different file or a bare package', () => {
    assert.equal(importMatches('../foo.test', test, 'src/a/foo.js'), false);
    assert.equal(importMatches('../foobar', test, 'src/a/foo.js'), false);
    assert.equal(importMatches('react', test, 'src/a/foo.js'), false);
  });
});

describe('readFileSyncMatch', () => {
  const test = 'artifacts/sales/custom/__tests__/Foo.test.js';
  const target = 'artifacts/sales/custom/Foo.jsx';

  it('returns null when the file never reads source text', () => {
    assert.equal(readFileSyncMatch("const p = join(__dirname, '..', 'Foo.jsx');", test, target), null);
  });

  it('resolves a join() relative to the test directory', () => {
    const src = "const src = readFileSync(join(__dirname, '..', 'Foo.jsx'), 'utf8');";
    assert.equal(readFileSyncMatch(src, test, target), 'readFileSync');
  });

  it('resolves a join() relative to the repo root', () => {
    const src = "readFileSync(join(ROOT, 'artifacts/sales/custom', 'Foo.jsx'))";
    assert.equal(readFileSyncMatch(src, test, target), 'readFileSync');
  });

  it('matches a literal that is a segment-aligned suffix of the target', () => {
    assert.equal(readFileSyncMatch("readFileSync('sales/custom/Foo.jsx')", test, target), 'readFileSync');
  });

  it('reports a basename-only match as readFileSync:basename', () => {
    const src = "const files = ['Foo.jsx'];\nfiles.map((f) => readFileSync(f));";
    assert.equal(readFileSyncMatch(src, test, target), 'readFileSync:basename');
  });

  it('ignores a literal whose directory does not align with the target', () => {
    assert.equal(readFileSyncMatch("readFileSync('purchase/custom/Foo.jsx')", test, target), null);
  });

  it('skips import specifiers that name the target', () => {
    const src = "import Foo from './Foo.jsx';\nreadFileSync(somePath);";
    assert.equal(readFileSyncMatch(src, 'x/Other.test.js', 'y/Foo.jsx'), null);
  });
});

describe('pathLiteralMatch', () => {
  const test = 'artifacts/sales/custom/__tests__/Foo.test.js';
  const target = 'artifacts/sales/custom/Foo.jsx';

  it('matches a join(__dirname, ...) handed to a loader helper', () => {
    const src = "const { helpers } = loadCustomModule(join(__dirname, '..', 'Foo.jsx'), {});";
    assert.equal(pathLiteralMatch(src, test, target), 'path');
  });

  it('matches a path constant later passed to a dynamic import', () => {
    const src = "const MOD = join(__dirname, '..', 'Foo.jsx');\nconst m = await import(MOD);";
    assert.equal(pathLiteralMatch(src, test, target), 'path');
  });

  it('matches a new URL() relative to import.meta.url', () => {
    assert.equal(pathLiteralMatch("await import(new URL('../Foo.jsx', import.meta.url));", test, target), 'path');
  });

  it('matches a bare relative literal that resolves to the target', () => {
    assert.equal(pathLiteralMatch("const P = '../Foo.jsx';\nawait import(P);", test, target), 'path');
  });

  it('does not match a same-named file in another directory', () => {
    const src = "loadCustomModule(join(__dirname, '..', '..', 'purchase', 'Foo.jsx'));\nconst p = 'Foo.jsx';";
    assert.equal(pathLiteralMatch(src, test, target), null);
  });

  it('does not match a vi.mock or jest.mock target', () => {
    assert.equal(pathLiteralMatch("vi.mock('../Foo.jsx');\njest.mock('../Foo.jsx', () => ({}));", test, target), null);
  });

  it('does not match a suffix-only literal without a read (no false positives)', () => {
    assert.equal(pathLiteralMatch("const label = 'sales/custom/Foo.jsx';", test, target), null);
  });
});

describe('javaMatchSources', () => {
  const fqn = 'com.etendoerp.go.rest.Foo';
  const sources = (src) => [...javaMatchSources(src, fqn)].sort();

  it('detects an @covers tag', () => {
    assert.deepEqual(sources('package com.x;\n/** @covers com.etendoerp.go.rest.Foo */\nclass T {}'), ['covers']);
  });

  it('detects a plain import', () => {
    assert.deepEqual(sources('package com.x;\nimport com.etendoerp.go.rest.Foo;\nclass T {}'), ['import']);
  });

  it('detects static imports of a member and of a wildcard', () => {
    assert.deepEqual(sources('package com.x;\nimport static com.etendoerp.go.rest.Foo.bar;'), ['import']);
    assert.deepEqual(sources('package com.x;\nimport static com.etendoerp.go.rest.Foo.*;'), ['import']);
  });

  it('detects a same-package reference to the simple name', () => {
    assert.deepEqual(sources('package com.etendoerp.go.rest;\nclass T { Foo f; }'), ['same-package']);
  });

  it('ignores a class whose name only starts with the simple name', () => {
    assert.deepEqual(sources('package com.x;\nimport com.etendoerp.go.rest.FooBar;'), []);
    assert.deepEqual(sources('package com.etendoerp.go.rest;\nclass T { FooBar f; }'), []);
  });

  it('ignores a reference from another package without an import', () => {
    assert.deepEqual(sources('package com.other;\nclass T { Foo f; }'), []);
  });
});

describe('findFunctionalTests (injected files)', () => {
  let root;
  const target = 'tools/app-shell/src/lib/foo.js';

  before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'find-tests-func-')));
    writeTree(root, {
      'tools/app-shell/src/lib/__tests__/foo.test.js': "import { foo } from '../foo.js';\n",
      'tools/app-shell/src/lib/__tests__/covers.vitest.jsx': '// @covers tools/app-shell/src/lib/foo.js\n',
      'tools/app-shell/test/reads.test.js': "readFileSync(join(ROOT, 'tools/app-shell/src/lib/foo.js'));\n",
      'tools/app-shell/src/lib/__tests__/mocked.vitest.jsx': "vi.mock('../foo.js');\n",
      'tools/app-shell/src/lib/__tests__/loaded.test.js': "loadCustomModule(join(__dirname, '..', 'foo.js'));\n",
      'tools/app-shell/src/lib/helper.js': "import { foo } from './foo.js';\n",
      '.claude/worktrees/x/foo.test.js': '// @covers tools/app-shell/src/lib/foo.js\n',
    });
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('returns covers, import and readFileSync hits ranked by source', () => {
    const files = [
      'tools/app-shell/test/reads.test.js',
      'tools/app-shell/src/lib/__tests__/foo.test.js',
      'tools/app-shell/src/lib/__tests__/covers.vitest.jsx',
      'tools/app-shell/src/lib/__tests__/mocked.vitest.jsx',
      'tools/app-shell/src/lib/__tests__/loaded.test.js',
      'tools/app-shell/src/lib/helper.js',
      '.claude/worktrees/x/foo.test.js',
      'tools/app-shell/src/lib/__tests__/missing.test.js',
    ];
    assert.deepEqual(findFunctionalTests(target, { root, files }), [
      { file: 'tools/app-shell/src/lib/__tests__/covers.vitest.jsx', sources: ['covers'] },
      { file: 'tools/app-shell/src/lib/__tests__/foo.test.js', sources: ['import'] },
      { file: 'tools/app-shell/test/reads.test.js', sources: ['readFileSync'] },
      { file: 'tools/app-shell/src/lib/__tests__/loaded.test.js', sources: ['path'] },
    ]);
  });

  it('returns an empty list when no test references the file', () => {
    assert.deepEqual(findFunctionalTests('tools/app-shell/src/lib/none.js', {
      root,
      files: ['tools/app-shell/src/lib/__tests__/foo.test.js'],
    }), []);
  });
});

describe('findJavaTests (injected files)', () => {
  let root;
  const fqn = 'com.etendoerp.go.rest.Foo';

  before(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'find-tests-go-')));
    writeTree(root, {
      'src-test/src/com/x/ImportTest.java': 'package com.x;\nimport com.etendoerp.go.rest.Foo;\n',
      'src-test/src/com/x/CoversTest.java': 'package com.x;\n/** @covers com.etendoerp.go.rest.Foo */\n',
      'src-test/src/com/etendoerp/go/rest/SamePkgTest.java': 'package com.etendoerp.go.rest;\nclass SamePkgTest { Foo f; }\n',
      'src-test/src/com/etendoerp/go/rest/Foo.java': 'package com.etendoerp.go.rest;\nclass Foo { Foo self; }\n',
      'src-test/src/com/x/UnrelatedTest.java': 'package com.x;\nclass UnrelatedTest {}\n',
    });
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  it('ranks covers, then import, then same-package, and skips the class itself', () => {
    const files = [
      'src-test/src/com/etendoerp/go/rest/SamePkgTest.java',
      'src-test/src/com/x/ImportTest.java',
      'src-test/src/com/x/CoversTest.java',
      'src-test/src/com/etendoerp/go/rest/Foo.java',
      'src-test/src/com/x/UnrelatedTest.java',
    ];
    assert.deepEqual(findJavaTests(fqn, { root, files }), [
      { file: 'src-test/src/com/x/CoversTest.java', sources: ['covers'] },
      { file: 'src-test/src/com/x/ImportTest.java', sources: ['import'] },
      { file: 'src-test/src/com/etendoerp/go/rest/SamePkgTest.java', sources: ['same-package'] },
    ]);
  });
});

describe('formatReport', () => {
  it('says so when nothing was found', () => {
    const out = formatReport({ label: 'a/b.js', repo: 'functional', hits: [], root: '/sf' });
    assert.equal(out, 'find-tests: a/b.js (functional)\n'
      + '  no existing tests found — a new file is justified only if the unit is really uncovered');
  });

  it('lists functional hits with their sources, padded to a common width', () => {
    const out = formatReport({
      label: 'a/b.js',
      repo: 'functional',
      root: '/sf',
      hits: [
        { file: 'x/long-name.test.js', sources: ['covers', 'import'] },
        { file: 'y/s.test.js', sources: ['readFileSync:basename'] },
      ],
    });
    assert.deepEqual(out.split('\n'), [
      'find-tests: a/b.js (functional)',
      '  2 test file(s):',
      '  x/long-name.test.js  [covers, import]',
      '  y/s.test.js          [readFileSync:basename]',
    ]);
  });

  it('labels Java reports com.etendoerp.go and names the root', () => {
    const out = formatReport({
      label: 'com.a.Foo',
      repo: 'go',
      root: '/go',
      hits: [{ file: 'src-test/src/com/a/FooTest.java', sources: ['import'] }],
    });
    assert.match(out, /^find-tests: com\.a\.Foo \(com\.etendoerp\.go\)\n {2}1 test file\(s\) under \/go:/);
  });
});

describe('main', () => {
  it('exits 2 with usage on no argument, too many arguments or --help', (t) => {
    const errors = [];
    t.mock.method(console, 'error', (msg) => errors.push(msg));
    assert.equal(main([]), 2);
    assert.equal(main(['a', 'b']), 2);
    assert.equal(main(['--help']), 2);
    assert.equal(main(['--json']), 2);
    assert.equal(errors.length, 4);
    assert.ok(errors.every((msg) => /^Usage: node scripts\/find-tests\.js/.test(msg)));
  });

  it('exits 2 when the target cannot be resolved', (t) => {
    const errors = [];
    t.mock.method(console, 'error', (msg) => errors.push(msg));
    assert.equal(main(['definitely/not/here.js']), 2);
    assert.deepEqual(errors, ['find-tests: file not found: definitely/not/here.js']);
  });

  describe('against a fixture repo (child process)', () => {
    let tmp;
    let env;

    before(() => {
      tmp = realpathSync(mkdtempSync(join(tmpdir(), 'find-tests-main-')));
      const sf = join(tmp, 'sf');
      writeTree(sf, {
        'src/lib/foo.js': 'export const foo = 1;\n',
        'src/lib/__tests__/foo.test.js': "// @covers src/lib/foo.js\nimport { foo } from '../foo.js';\n",
      });
      gitInit(sf);
      env = { ...process.env, SF_ROOT: sf, GO_ROOT: join(tmp, 'go') };
    });

    after(() => rmSync(tmp, { recursive: true, force: true }));

    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: join(tmp, 'sf'), env, encoding: 'utf8' });

    it('exits 0 and prints the text report', () => {
      const res = run('src/lib/foo.js');
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /find-tests: src\/lib\/foo\.js \(functional\)/);
      assert.match(res.stdout, /src\/lib\/__tests__\/foo\.test\.js\s+\[covers, import\]/);
    });

    it('exits 0 and prints JSON with --json', () => {
      const res = run('src/lib/foo.js', '--json');
      assert.equal(res.status, 0, res.stderr);
      assert.deepEqual(JSON.parse(res.stdout), [{
        target: 'src/lib/foo.js',
        repo: 'functional',
        hits: [{ file: 'src/lib/__tests__/foo.test.js', sources: ['covers', 'import'] }],
      }]);
    });

    it('sets exit code 2 for an unresolvable target', () => {
      const res = run('nope.js');
      assert.equal(res.status, 2);
      assert.match(res.stderr, /find-tests: file not found: nope\.js/);
    });

    it('runs when invoked through a symlink in a path with spaces', () => {
      const dir = join(tmp, 'dir with spaces');
      mkdirSync(dir, { recursive: true });
      const link = join(dir, 'find-tests.js');
      symlinkSync(SCRIPT, link);
      const res = spawnSync(process.execPath, [link, 'src/lib/foo.js'], { cwd: join(tmp, 'sf'), env, encoding: 'utf8' });
      assert.equal(res.status, 0, res.stderr);
      assert.match(res.stdout, /find-tests: src\/lib\/foo\.js \(functional\)/);
    });
  });
});

describe('git environment isolation (pre-push hook)', () => {
  const GIT_KEYS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'];
  const plainGit = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', env: sanitizedGitEnv() }).trim();
  let tmp;
  let decoy;
  let decoyHead;

  // Points GIT_* at `repo` the way a hook environment does, runs fn, then restores the outer env.
  const withGitEnvOf = (repo, fn) => {
    const saved = Object.fromEntries(GIT_KEYS.map((key) => [key, process.env[key]]));
    process.env.GIT_DIR = join(repo, '.git');
    process.env.GIT_WORK_TREE = repo;
    process.env.GIT_INDEX_FILE = join(repo, '.git', 'index');
    try {
      return fn();
    } finally {
      for (const key of GIT_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  };

  before(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'find-tests-gitenv-')));
    decoy = join(tmp, 'decoy');
    writeTree(decoy, { 'README.md': '# decoy\n' });
    plainGit(decoy, 'init', '-q');
    plainGit(decoy, 'add', '-A');
    plainGit(decoy, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'decoy', '--no-gpg-sign');
    decoyHead = plainGit(decoy, 'rev-parse', 'HEAD');
  });

  after(() => rmSync(tmp, { recursive: true, force: true }));

  it('gitInit builds the fixture repo in its own dir even when GIT_DIR points at another repo', () => {
    const fixture = join(tmp, 'fixture-a');
    writeTree(fixture, { 'src/a.js': 'export const a = 1;\n' });
    withGitEnvOf(decoy, () => gitInit(fixture));
    assert.ok(existsSync(join(fixture, '.git')), 'fixture has its own .git');
    assert.equal(plainGit(fixture, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(plainGit(decoy, 'rev-parse', 'HEAD'), decoyHead, 'decoy repo HEAD is unchanged');
  });

  it('find-tests resolves hits in its own root even when GIT_DIR points at another repo', () => {
    const fixture = join(tmp, 'fixture-b');
    writeTree(fixture, {
      'src/lib/foo.js': 'export const foo = 1;\n',
      'src/lib/__tests__/foo.test.js': "// @covers src/lib/foo.js\nimport { foo } from '../foo.js';\n",
    });
    gitInit(fixture);
    const res = withGitEnvOf(decoy, () => spawnSync(process.execPath, [SCRIPT, 'src/lib/foo.js', '--json'], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, SF_ROOT: fixture, GO_ROOT: join(tmp, 'go') },
    }));
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout)[0].hits.map((hit) => hit.file), ['src/lib/__tests__/foo.test.js']);
    assert.equal(plainGit(decoy, 'rev-parse', 'HEAD'), decoyHead, 'decoy repo HEAD is unchanged');
  });
});
