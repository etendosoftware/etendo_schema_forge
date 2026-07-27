import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceRoot = join(__dirname, '..', '..');
const onboardingRoot = join(sourceRoot, 'pages', 'onboarding');
const retiredFiles = ['onboardingApi.js', 'onboardingState.js', 'onboardingSso.js', 'passwordPolicy.js'];
const retiredImport = /(?:from\s*|import\s*\()\s*['"][^'"]*(?:onboardingApi|onboardingState|onboardingSso|passwordPolicy)(?:\.js)?['"]/;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe('onboarding Core ownership boundary (ETP-4584)', () => {
  it('does not restore the retired consumer wrappers', () => {
    for (const file of retiredFiles) {
      assert.equal(existsSync(join(onboardingRoot, file)), false, `${file} must stay in etendo-go-core`);
    }
  });

  it('does not import a retired consumer onboarding wrapper', () => {
    for (const file of sourceFiles(sourceRoot)) {
      assert.doesNotMatch(readFileSync(file, 'utf8'), retiredImport, file);
    }
  });
});
