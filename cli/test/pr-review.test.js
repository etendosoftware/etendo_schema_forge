import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectDuplicatedBlocks,
  analyzeChangedFiles,
  summarizeReview,
  renderReviewBody,
  reviewPullRequest,
} from '../src/pr-review.js';

function makeDiff(path, body) {
  return `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -0,0 +1,12 @@
${body}`;
}

describe('detectDuplicatedBlocks', () => {
  it('flags duplicated added blocks across files', () => {
    const block = [
      '+const normalized = input.trim();',
      '+const parsed = JSON.parse(normalized);',
      '+const customerId = parsed.customerId;',
      '+const orderId = parsed.orderId;',
      '+const total = Number(parsed.total);',
      '+return { customerId, orderId, total };',
    ].join('\n');

    const diff = [
      makeDiff('tools/a.js', block),
      makeDiff('tools/b.js', block),
    ].join('\n');

    const findings = detectDuplicatedBlocks(diff);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, 'DUPLICATED_BLOCK');
    assert.equal(findings[0].severity, 'blocker');
    assert.equal(findings[0].locations.length, 2);
    assert.deepEqual(findings[0].locations.map((location) => location.path), ['tools/a.js', 'tools/b.js']);
  });

  it('ignores short repeated snippets', () => {
    const shortBlock = [
      '+const id = row.id;',
      '+return id;',
    ].join('\n');

    const diff = [
      makeDiff('tools/a.js', shortBlock),
      makeDiff('tools/b.js', shortBlock),
    ].join('\n');

    assert.deepEqual(detectDuplicatedBlocks(diff), []);
  });

  it('ignores duplicated blocks in artifact files', () => {
    const block = [
      '+"key": "cancel",',
      '+"label": "Cancel",',
      '+"labelKey": "cancel",',
      '+"destructive": true,',
      '+"visibleWhenStatus": "CO",',
      '+"documentAction": "CL"',
    ].join('\n');

    const diff = [
      makeDiff('artifacts/sales-invoice/decisions.json', block),
      makeDiff('artifacts/sales-invoice/contract.json', block),
    ].join('\n');

    assert.deepEqual(detectDuplicatedBlocks(diff), []);
  });

  it('ignores duplicated blocks in generated dependency lockfiles', () => {
    const block = [
      '+      "version": "4.59.0",',
      '+      "resolved": "https://registry.npmjs.org/pkg/-/pkg-4.59.0.tgz",',
      '+      "integrity": "sha512-test",',
      '+      "cpu": [',
      '+        "x64"',
      '+      ]',
    ].join('\n');

    const diff = [
      makeDiff('package-lock.json', block),
      makeDiff('tools/app-shell/package-lock.json', block),
    ].join('\n');

    assert.deepEqual(detectDuplicatedBlocks(diff), []);
  });

  it('ignores duplicated blocks in the generated AD metadata cache', () => {
    const block = [
      '+      "AD_Client_ID": "0",',
      '+      "AD_Org_ID": "0",',
      '+      "IsActive": "Y",',
      '+      "Created": "2026-01-01",',
      '+      "CreatedBy": "100",',
      '+      "Updated": "2026-01-01"',
    ].join('\n');

    const diff = [
      makeDiff('cli/cache/ad-snapshot.json', block),
      makeDiff('cli/cache/ad-snapshot.json', block),
    ].join('\n');

    assert.deepEqual(detectDuplicatedBlocks(diff), []);
  });

  it('still flags the same duplicated block when it lands in real source (skip is path-scoped, not a blanket disable)', () => {
    const block = [
      '+      "AD_Client_ID": "0",',
      '+      "AD_Org_ID": "0",',
      '+      "IsActive": "Y",',
      '+      "Created": "2026-01-01",',
      '+      "CreatedBy": "100",',
      '+      "Updated": "2026-01-01"',
    ].join('\n');

    // The cli/cache/ copy is silently dropped; the two real source copies must still
    // collide. This proves the skip only removes cli/cache/ runs from the comparison,
    // rather than disabling duplication detection for the whole diff.
    const diff = [
      makeDiff('cli/cache/ad-snapshot.json', block),
      makeDiff('tools/app-shell/src/foo.js', block),
      makeDiff('tools/app-shell/src/bar.js', block),
    ].join('\n');

    const findings = detectDuplicatedBlocks(diff);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].code, 'DUPLICATED_BLOCK');
    assert.equal(findings[0].severity, 'blocker');
    assert.deepEqual(
      findings[0].locations.map((location) => location.path),
      ['tools/app-shell/src/foo.js', 'tools/app-shell/src/bar.js'],
    );
  });
});

describe('analyzeChangedFiles', () => {
  it('classifies architecture blockers and warnings', () => {
    const findings = analyzeChangedFiles({
      changedFiles: [
        'src/new-feature.js',
        'src/legacy.js',
        'package.json',
        '.env.production',
        'rules-curated.json',
      ],
      newSourceFiles: ['src/new-feature.js'],
      newTestFiles: [],
      fileContents: {
        'src/legacy.js': 'const lib = require("lib");\nmodule.exports = lib;\n',
        '.env.production': 'SECRET_KEY=top-secret\n',
      },
      packageJsonChanges: [{
        path: 'package.json',
        dependencies: ['left-pad'],
      }],
    });

    assert.ok(findings.some((finding) => finding.code === 'MISSING_TESTS' && finding.severity === 'blocker'));
    assert.ok(findings.some((finding) => finding.code === 'COMMONJS_USAGE' && finding.severity === 'blocker'));
    assert.ok(findings.some((finding) => finding.code === 'ENV_FILE_COMMITTED' && finding.severity === 'blocker'));
    assert.ok(findings.some((finding) => finding.code === 'WRONG_DIRECTORY' && finding.severity === 'blocker'));
    assert.ok(findings.some((finding) => finding.code === 'NEW_DEPENDENCY' && finding.severity === 'warning'));
  });

  it('does not flag comments that merely mention ESM re-exports', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['packages/apps-sdk/src/index.js'],
      newSourceFiles: [],
      newTestFiles: [],
      fileContents: {
        'packages/apps-sdk/src/index.js': '// Public API re-exports.\nexport { createShellClient } from "./shellClient.js";\n',
      },
      packageJsonChanges: [],
      addedLineContents: {
        'packages/apps-sdk/src/index.js': ['// Public API re-exports.'],
      },
    });

    assert.ok(!findings.some((finding) => finding.code === 'COMMONJS_USAGE'));
  });

  it('does not flag block comments that mention CommonJS exports', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['packages/apps-sdk/src/index.js'],
      newSourceFiles: [],
      newTestFiles: [],
      fileContents: {
        'packages/apps-sdk/src/index.js': '/* module.exports is mentioned only in docs */\nexport { createShellClient } from "./shellClient.js";\n',
      },
      packageJsonChanges: [],
      addedLineContents: {
        'packages/apps-sdk/src/index.js': ['/* module.exports is mentioned only in docs */'],
      },
    });

    assert.ok(!findings.some((finding) => finding.code === 'COMMONJS_USAGE'));
  });

  it('does not flag generated contract snapshots as large files', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'pr-review-large-contract-'));
    const previousCwd = process.cwd();

    try {
      process.chdir(repoDir);
      mkdirSync(join(repoDir, 'artifacts', 'contacts'), { recursive: true });
      writeFileSync(join(repoDir, 'artifacts', 'contacts', 'contract.json'), 'x'.repeat(513000));
      writeFileSync(join(repoDir, 'artifacts', 'contacts', 'contract.prev.json'), 'x'.repeat(513000));
      writeFileSync(join(repoDir, 'artifacts', 'contacts', 'contract.mcp.json'), 'x'.repeat(513000));

      const findings = analyzeChangedFiles({
        changedFiles: [
          'artifacts/contacts/contract.json',
          'artifacts/contacts/contract.prev.json',
          'artifacts/contacts/contract.mcp.json',
        ],
        newSourceFiles: [],
        newTestFiles: [],
        fileContents: {},
        packageJsonChanges: [],
      });

      assert.ok(!findings.some((finding) => finding.code === 'LARGE_FILE'));
    } finally {
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('does not flag the generated AD metadata cache as a large file', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'pr-review-large-cache-'));
    const previousCwd = process.cwd();

    try {
      process.chdir(repoDir);
      mkdirSync(join(repoDir, 'cli', 'cache'), { recursive: true });
      writeFileSync(join(repoDir, 'cli', 'cache', 'ad-snapshot.json'), 'x'.repeat(513000));

      const findings = analyzeChangedFiles({
        changedFiles: ['cli/cache/ad-snapshot.json'],
        newSourceFiles: [],
        newTestFiles: [],
        fileContents: {},
        packageJsonChanges: [],
      });

      assert.ok(!findings.some((finding) => finding.code === 'LARGE_FILE'));
    } finally {
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('does not flag frozen data-fix SQL migrations as large files', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'pr-review-large-datafix-'));
    const previousCwd = process.cwd();

    try {
      process.chdir(repoDir);
      mkdirSync(join(repoDir, 'cli', 'src', 'data-fixes', 'sql'), { recursive: true });
      writeFileSync(
        join(repoDir, 'cli', 'src', 'data-fixes', 'sql', '20260612T120000Z__R1-chart-of-accounts.sql'),
        'x'.repeat(513000),
      );

      const findings = analyzeChangedFiles({
        changedFiles: ['cli/src/data-fixes/sql/20260612T120000Z__R1-chart-of-accounts.sql'],
        newSourceFiles: [],
        newTestFiles: [],
        fileContents: {},
        packageJsonChanges: [],
      });

      assert.ok(!findings.some((finding) => finding.code === 'LARGE_FILE'));
    } finally {
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('still flags a large file under a non-skipped path (size gate is path-scoped)', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'pr-review-large-control-'));
    const previousCwd = process.cwd();

    try {
      process.chdir(repoDir);
      mkdirSync(join(repoDir, 'cli', 'cache'), { recursive: true });
      mkdirSync(join(repoDir, 'tools', 'app-shell', 'src'), { recursive: true });
      // Same oversized payload under both a skipped and a non-skipped path: only the
      // non-skipped one must be reported, proving the skip is scoped to cli/cache/.
      writeFileSync(join(repoDir, 'cli', 'cache', 'ad-snapshot.json'), 'x'.repeat(513000));
      writeFileSync(join(repoDir, 'tools', 'app-shell', 'src', 'huge.js'), 'x'.repeat(513000));

      const findings = analyzeChangedFiles({
        changedFiles: ['cli/cache/ad-snapshot.json', 'tools/app-shell/src/huge.js'],
        newSourceFiles: [],
        newTestFiles: [],
        fileContents: {},
        packageJsonChanges: [],
      });

      const largeFile = findings.find((finding) => finding.code === 'LARGE_FILE');
      assert.ok(largeFile, 'expected a LARGE_FILE finding for the non-skipped path');
      assert.equal(largeFile.severity, 'blocker');
      assert.match(largeFile.details, /tools\/app-shell\/src\/huge\.js/);
      assert.doesNotMatch(largeFile.details, /cli\/cache\/ad-snapshot\.json/);
    } finally {
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('summarizeReview', () => {
  it('requests changes when blockers exist', () => {
    const summary = summarizeReview([
      { code: 'DUPLICATED_BLOCK', severity: 'blocker', title: 'Duplicate block', details: 'Repeated block found.' },
      { code: 'NEW_DEPENDENCY', severity: 'warning', title: 'New dependency', details: 'Dependency added.' },
    ]);

    assert.equal(summary.decision, 'request_changes');
    assert.equal(summary.blockers.length, 1);
    assert.equal(summary.warnings.length, 1);
  });

  it('renders a stable markdown body', () => {
    const body = renderReviewBody({
      decision: 'comment',
      blockers: [],
      warnings: [
        { code: 'NEW_DEPENDENCY', severity: 'warning', title: 'New dependency', details: 'Dependency added.' },
      ],
    });

    assert.match(body, /Copilot PR Review/);
    assert.match(body, /Warnings/);
    assert.match(body, /Dependency added\./);
  });
});

describe('reviewPullRequest', () => {
  it('uses the merge base so only files introduced by the PR head are blocked', () => {
    const originalCwd = process.cwd();
    const repoDir = mkdtempSync(join(tmpdir(), 'pr-review-'));

    try {
      execFileSync('git', ['init', '-b', 'develop'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });

      writeFileSync(join(repoDir, 'shared.txt'), 'base\n');
      execFileSync('git', ['add', 'shared.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'base'], { cwd: repoDir });

      execFileSync('git', ['checkout', '-b', 'epic/ETP-3504'], { cwd: repoDir });
      writeFileSync(join(repoDir, 'base-only.txt'), 'changed on epic\n');
      execFileSync('git', ['add', 'base-only.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'epic change'], { cwd: repoDir });

      execFileSync('git', ['checkout', '-b', 'feature/ETP-3775'], { cwd: repoDir });
      writeFileSync(join(repoDir, 'feature-only.txt'), 'changed on feature\n');
      execFileSync('git', ['add', 'feature-only.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'feature change'], { cwd: repoDir });

      execFileSync('git', ['checkout', 'epic/ETP-3504'], { cwd: repoDir });
      writeFileSync(join(repoDir, 'epic-after-branch.txt'), 'changed on epic after feature branch\n');
      execFileSync('git', ['add', 'epic-after-branch.txt'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'later epic change'], { cwd: repoDir });

      execFileSync('git', ['checkout', 'feature/ETP-3775'], { cwd: repoDir });

      const baseSha = execFileSync('git', ['rev-parse', 'epic/ETP-3504'], { cwd: repoDir, encoding: 'utf8' }).trim();
      const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();

      process.chdir(repoDir);
      const result = reviewPullRequest(baseSha, headSha);

      assert.deepEqual(result.changedFiles, ['feature-only.txt']);
    } finally {
      process.chdir(originalCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('analyzeChangedFiles string-literal safety', () => {
  it('does not block string literals that merely mention require or secret markers', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['cli/test/pr-review.test.js'],
      newSourceFiles: [],
      newTestFiles: ['cli/test/pr-review.test.js'],
      fileContents: {
        'cli/test/pr-review.test.js': "const fixture = 'module.exports = lib; SECRET_KEY=top-secret; const lib = require(\"lib\");';\n",
      },
      packageJsonChanges: [],
      addedLineContents: {
        'cli/test/pr-review.test.js': ["const fixture = 'module.exports = lib; SECRET_KEY=top-secret; const lib = require(\"lib\");';"],
      },
    });

    assert.ok(!findings.some((finding) => finding.code === 'COMMONJS_USAGE'));
    assert.ok(!findings.some((finding) => finding.code === 'POTENTIAL_SECRET'));
  });

  it('does not block secret markers inside a multi-line JSDoc comment block', () => {
    const docBlock = [
      '/**',
      ' * Requires:',
      ' *   - E2E_USE_MOCK=0 E2E_PASSWORD=<password>',
      ' */',
      "export const run = () => {};",
    ];
    const findings = analyzeChangedFiles({
      changedFiles: ['e2e/tests/flows/contacts-integration.spec.js'],
      newSourceFiles: [],
      newTestFiles: ['e2e/tests/flows/contacts-integration.spec.js'],
      fileContents: {
        'e2e/tests/flows/contacts-integration.spec.js': `${docBlock.join('\n')}\n`,
      },
      packageJsonChanges: [],
      addedLineContents: {
        'e2e/tests/flows/contacts-integration.spec.js': docBlock,
      },
    });

    assert.ok(!findings.some((finding) => finding.code === 'POTENTIAL_SECRET'));
  });
});
