// @covers scripts/check-window-docs.js
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeWindowDocChanges,
  formatWindowDocReport,
  windowFromChangedPath,
} from '../check-window-docs.js';
import { isolatedGitEnv } from './isolatedGitEnv.js';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-window-docs.js');

describe('windowFromChangedPath', () => {
  it('maps artifacts and custom window folders to the kebab-case window name', () => {
    assert.equal(windowFromChangedPath('artifacts/sales-order/contract.json'), 'sales-order');
    assert.equal(windowFromChangedPath('tools/app-shell/src/windows/custom/businessPartner/Form.jsx'),
      'business-partner');
  });

  it('ignores tests, the shared custom folder and files outside a window', () => {
    for (const path of ['artifacts/sales-order/__tests__/a.test.js',
      'tools/app-shell/src/windows/custom/shared/useThing.js',
      'tools/app-shell/src/windows/custom/index.js',
      'scripts/check-window-docs.js']) {
      assert.equal(windowFromChangedPath(path), null, path);
    }
  });
});

describe('analyzeWindowDocChanges and formatWindowDocReport', () => {
  it('reports a changed window whose guide did not change, and says whether to create or update it', () => {
    const analysis = analyzeWindowDocChanges(
      ['artifacts/sales-order/contract.json', 'artifacts/no-doc-window/contract.json',
        'docs/generated-custom-windows/sales-order.md'],
      { rootDir: join(tmpdir(), 'no-such-schema-forge-root') });
    assert.deepEqual(analysis.missingWindows.map((entry) => entry.windowName), ['no-doc-window']);
    assert.match(formatWindowDocReport(analysis),
      /- no-doc-window: Create docs\/generated-custom-windows\/no-doc-window\.md/);
  });

  it('passes when nothing window-specific changed', () => {
    const analysis = analyzeWindowDocChanges(['README.md']);
    assert.equal(formatWindowDocReport(analysis), 'No window-specific changes detected.');
  });
});

// The CLI as CI runs it: from scripts/ in a checkout, with no SF_ROOT. It once resolved the repo
// one level too high, so every run failed with "not a git repository" and posted that as a warning.
describe('check-window-docs CLI', () => {
  let repo;
  const git = (...args) => execFileSync('git', args, { cwd: repo, env: isolatedGitEnv(), encoding: 'utf8' }).trim();
  const commitFile = (path, content) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
    git('add', path);
    git('commit', '-q', '-m', `change ${path}`);
    return git('rev-parse', 'HEAD');
  };
  const run = (base, head) => {
    const env = isolatedGitEnv();
    delete env.SF_ROOT;
    return spawnSync(process.execPath, [join(repo, 'scripts', 'check-window-docs.js'), '--base', base, '--head', head],
      { cwd: repo, env, encoding: 'utf8' });
  };

  before(() => {
    // realpath: the script only runs as a CLI when argv[1] equals its own resolved path.
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'window-docs-repo-')));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    mkdirSync(join(repo, 'scripts'));
    copyFileSync(SCRIPT, join(repo, 'scripts', 'check-window-docs.js'));
    git('add', '.');
    git('commit', '-q', '-m', 'initial');
  });

  after(() => rmSync(repo, { recursive: true, force: true }));

  it('finds the repository it lives in and flags a window changed without its guide', () => {
    const base = git('rev-parse', 'HEAD');
    const head = commitFile('artifacts/sales-order/contract.json', '{}');
    const result = run(base, head);
    assert.doesNotMatch(result.stderr, /not a git repository/);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /- sales-order: Create docs\/generated-custom-windows\/sales-order\.md/);
  });

  it('passes once the guide changes in the same range', () => {
    const base = git('rev-parse', 'HEAD~1');
    const head = commitFile('docs/generated-custom-windows/sales-order.md', '# Sales order');
    const result = run(base, head);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Window doc freshness check passed\./);
  });
});
