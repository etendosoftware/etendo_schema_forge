// @covers e2e/tests/helpers/test.js
// Guardian of the coverage map (ETP-5891). Every mocked spec takes `test` from the shared fixture,
// or its tests record no coverage and the pre-push never relates it to the code it runs. A spec that
// opens pages besides the fixture's own `page` is listed in e2e/mocked-always-run.json, since
// coverage only records that page, and the pre-push then runs it on every app change. And only the
// pre-push narrows the suite: no workflow passes a spec subset, so the PR and the cut run them all.
// The pre-push runs this file before the mocked suite; CI runs it with the rest of the unit tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const E2E = join(ROOT, 'e2e');
const ALWAYS_RUN = join(E2E, 'mocked-always-run.json');

function mockedSpecs(dir = join(E2E, 'tests')) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : mockedSpecs(path);
    return entry.name.endsWith('.mocked.spec.js') ? [path] : [];
  });
}

const specs = mockedSpecs().map((path) => ({ path, name: relative(E2E, path), src: readFileSync(path, 'utf8') }));
const PLAYWRIGHT_IMPORT = /^\s*import\s+[^;]*?\bfrom\s+['"]@playwright\/test['"]/m;
const FIXTURE_IMPORT = /^\s*import\s+[^;]*?\btest\b[^;]*?\bfrom\s+['"](?:\.\.?\/)+(?:[\w-]+\/)*helpers\/test\.js['"]/m;
const EXTRA_PAGE = /\.(?:newPage|newContext)\s*\(/;
const alwaysRun = JSON.parse(readFileSync(ALWAYS_RUN, 'utf8')).specs;

describe('mocked specs record their coverage', () => {
  it('finds the mocked specs', () => {
    assert.ok(specs.length > 100, `only ${specs.length} mocked specs found under e2e/tests`);
  });

  it('every mocked spec takes test from e2e/tests/helpers/test.js, never from @playwright/test', () => {
    const wrong = specs.filter(({ src }) => PLAYWRIGHT_IMPORT.test(src) || !FIXTURE_IMPORT.test(src)).map(({ name }) => name);
    assert.deepEqual(wrong, [], 'import { test, expect } from the relative path to e2e/tests/helpers/test.js instead');
  });
});

describe('only the pre-push narrows the mocked suite', () => {
  const workflows = join(ROOT, '.github', 'workflows');
  const code = (path) => readFileSync(path, 'utf8').split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');

  it('no workflow sets E2E_MOCKED_SPECS or runs the selector', () => {
    const narrowing = readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))
      .filter((name) => /E2E_MOCKED_SPECS|select-mocked-specs/.test(code(join(workflows, name))));
    assert.deepEqual(narrowing, [], 'the PR mini pipeline, the coverage map and the cut must run every mocked spec');
  });

  it('run-e2e-full.sh runs the whole suite when E2E_MOCKED_SPECS is empty', () => {
    const script = code(join(ROOT, 'scripts', 'run-e2e-full.sh'));
    assert.match(script, /read -r -a mocked_specs <<< "\$\{E2E_MOCKED_SPECS:-\}"/);
    assert.match(script, /npx playwright test --project=mocked --project=mocked-serial \$\{mocked_specs\[@\]\+"\$\{mocked_specs\[@\]\}"\}/);
  });
});

describe('e2e/mocked-always-run.json', () => {
  it('lists every mocked spec that opens pages besides the fixture page', () => {
    const listed = new Set(alwaysRun.map(({ file }) => file));
    const missing = specs.filter(({ src, name }) => EXTRA_PAGE.test(src) && !listed.has(name)).map(({ name }) => name);
    assert.deepEqual(missing, [], 'coverage only records the fixture page: add these with the reason');
  });

  it('names existing mocked specs, each with a reason', () => {
    for (const { file, reason } of alwaysRun) {
      assert.match(file, /^tests\/.+\.mocked\.spec\.js$/, `${file}: a path relative to e2e/`);
      assert.ok(existsSync(join(E2E, file)), `${file} does not exist`);
      assert.ok(typeof reason === 'string' && reason.trim(), `${file} has no reason`);
    }
  });
});
