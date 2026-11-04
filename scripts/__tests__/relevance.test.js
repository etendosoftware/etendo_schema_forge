// @covers .githooks/lib/relevance.sh
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.githooks', 'lib', 'relevance.sh');

/** Runs one relevance function with the changed files on stdin. */
function run(fn, files) {
  const out = spawnSync('bash', ['-c', `. "${LIB}"; ${fn}`], { input: files.join('\n'), encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout.trim();
}

const SPEC = 'e2e/tests/flows/platform/account-session-cookie.mocked.spec.js';
const EVERYTHING = 'npm testid tests regen xml pw-mocked pw-integration';
const OTHER_SPEC = 'e2e/tests/flows/sales/sales-order-confirm-idempotency.mocked.spec.js';

describe('relevance_checks', () => {
  it('runs nothing for docs alone', () => {
    assert.equal(run('relevance_checks', ['docs/guide.md', 'README.md']), '');
  });

  it('treats a dependency change as one that can break the tests and the app', () => {
    assert.equal(run('relevance_checks', ['package.json']), 'npm tests pw-mocked pw-integration');
    assert.equal(run('relevance_checks', ['package-lock.json']), 'npm tests regen xml pw-mocked pw-integration');
  });

  it('runs only the mocked suite for a changed mocked spec', () => {
    assert.equal(run('relevance_checks', [SPEC]), 'pw-mocked');
  });

  it('runs nothing for the agent configuration and its mirrors', () => {
    for (const path of ['.claude/agents/helper.md', '.claude/settings.json', '.codex/agents/helper.toml',
      '.omp/agents/helper.md', '.opencode/agents/helper.md', '.agents/skills/helper/SKILL.md']) {
      assert.equal(run('relevance_checks', [path]), '', path);
    }
  });

  it('runs only the unit tests for workflows, scripts and Claude hooks', () => {
    for (const path of ['.github/workflows/mini-pipeline.yml', 'scripts/back-merge-main.sh', 'scripts/select-tests.js',
      '.claude/hooks/block-push-no-verify.sh']) {
      assert.equal(run('relevance_checks', [path]), 'tests', path);
    }
  });

  it('runs everything for the hooks and the scripts that run the pre-push suites', () => {
    for (const path of ['.githooks/pre-push', 'run-sonar.sh', 'scripts/run-e2e-full.sh', 'scripts/run-remote-prepush.sh',
      'unknown/file.txt']) {
      assert.equal(run('relevance_checks', [path]), EVERYTHING, path);
    }
  });

  it('keeps the checks of the rest of a change next to a workflow or an agent mirror', () => {
    assert.equal(run('relevance_checks', [SPEC, '.github/workflows/mini-pipeline.yml', '.codex/agents/helper.toml']),
      'tests pw-mocked');
  });
});

describe('relevance_mocked_whole', () => {
  it('says why the mocked suite runs whole for a file no check knows or the hooks tooling', () => {
    assert.equal(run('relevance_mocked_whole', [SPEC, 'unknown/file.txt']), 'a changed file matches no known check');
    for (const tooling of ['.githooks/pre-push', 'run-sonar.sh', 'scripts/run-e2e-full.sh']) {
      assert.equal(run('relevance_mocked_whole', [SPEC, tooling]), "the change touches the hooks' own tooling", tooling);
    }
  });

  it('leaves UI source, e2e files, dependencies and tooling around them to the coverage selector', () => {
    assert.equal(run('relevance_mocked_whole', [SPEC, OTHER_SPEC, 'tools/app-shell/src/App.jsx', 'e2e/playwright.config.js',
      'e2e/tests/helpers/auth.js', 'e2e/quarantine.json', 'package.json', 'artifacts/orders/contract.json',
      '.github/workflows/mini-pipeline.yml', 'scripts/back-merge-main.sh', '.codex/agents/helper.toml', 'docs/guide.md']), '');
    assert.equal(run('relevance_mocked_whole', []), '');
  });
});
