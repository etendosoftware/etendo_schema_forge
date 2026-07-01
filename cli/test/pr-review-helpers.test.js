import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  REVIEW_MARKER,
  detectDuplicatedBlocks,
  analyzeChangedFiles,
  summarizeReview,
  renderReviewBody,
} from '../src/pr-review.js';

// ---------------------------------------------------------------------------
// REVIEW_MARKER constant
// ---------------------------------------------------------------------------

describe('REVIEW_MARKER', () => {
  it('is an HTML comment string', () => {
    assert.ok(REVIEW_MARKER.startsWith('<!--'));
    assert.ok(REVIEW_MARKER.endsWith('-->'));
  });
});

// ---------------------------------------------------------------------------
// summarizeReview — edge cases not in main test
// ---------------------------------------------------------------------------

describe('summarizeReview edge cases', () => {
  it('returns clean when no findings', () => {
    const summary = summarizeReview([]);
    assert.equal(summary.decision, 'clean');
    assert.equal(summary.blockers.length, 0);
    assert.equal(summary.warnings.length, 0);
  });

  it('returns comment when only warnings exist', () => {
    const summary = summarizeReview([
      { code: 'NEW_DEPENDENCY', severity: 'warning', title: 'New dep', details: 'Added dep' },
    ]);
    assert.equal(summary.decision, 'comment');
    assert.equal(summary.blockers.length, 0);
    assert.equal(summary.warnings.length, 1);
  });

  it('sorts findings alphabetically by code', () => {
    const summary = summarizeReview([
      { code: 'WRONG_DIRECTORY', severity: 'blocker', title: 'Wrong dir', details: '' },
      { code: 'COMMONJS_USAGE', severity: 'blocker', title: 'CJS', details: '' },
      { code: 'NEW_DEPENDENCY', severity: 'warning', title: 'Dep', details: '' },
    ]);
    assert.equal(summary.blockers[0].code, 'COMMONJS_USAGE');
    assert.equal(summary.blockers[1].code, 'WRONG_DIRECTORY');
  });
});

// ---------------------------------------------------------------------------
// renderReviewBody — edge cases not in main test
// ---------------------------------------------------------------------------

describe('renderReviewBody edge cases', () => {
  it('renders clean outcome message', () => {
    const body = renderReviewBody({ decision: 'clean', blockers: [], warnings: [] });
    assert.match(body, /Clean/);
    assert.match(body, /No duplicate blocks or architecture violations/);
    assert.ok(body.includes(REVIEW_MARKER));
  });

  it('renders request_changes outcome with blockers', () => {
    const body = renderReviewBody({
      decision: 'request_changes',
      blockers: [{ code: 'DUPLICATED_BLOCK', severity: 'blocker', title: 'Dup', details: 'Found dup' }],
      warnings: [],
    });
    assert.match(body, /Request changes/);
    assert.match(body, /Blocking findings must be resolved/);
    assert.match(body, /Found dup/);
  });

  it('includes location info when present', () => {
    const body = renderReviewBody({
      decision: 'request_changes',
      blockers: [{
        code: 'DUPLICATED_BLOCK',
        severity: 'blocker',
        title: 'Dup',
        details: 'Duplicate block',
        locations: [
          { path: 'src/a.js', startLine: 1, endLine: 10 },
          { path: 'src/b.js', startLine: 5, endLine: 15 },
        ],
      }],
      warnings: [],
    });
    assert.match(body, /src\/a\.js:1-10/);
    assert.match(body, /src\/b\.js:5-15/);
  });
});

// ---------------------------------------------------------------------------
// analyzeChangedFiles — MISSING_TESTS edge cases
// ---------------------------------------------------------------------------

describe('analyzeChangedFiles — MISSING_TESTS', () => {
  it('does NOT flag when new test files accompany new source files', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['src/feature.js', 'src/__tests__/feature.test.js'],
      newSourceFiles: ['src/feature.js'],
      newTestFiles: ['src/__tests__/feature.test.js'],
      fileContents: {},
      packageJsonChanges: [],
    });
    assert.ok(!findings.some((f) => f.code === 'MISSING_TESTS'));
  });

  it('flags when new source files have no new test files', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['src/feature.js'],
      newSourceFiles: ['src/feature.js'],
      newTestFiles: [],
      fileContents: {},
      packageJsonChanges: [],
    });
    assert.ok(findings.some((f) => f.code === 'MISSING_TESTS'));
  });

  it('truncates source file list after 10 entries', () => {
    const sources = Array.from({ length: 15 }, (_, i) => `src/file${i}.js`);
    const findings = analyzeChangedFiles({
      changedFiles: sources,
      newSourceFiles: sources,
      newTestFiles: [],
      fileContents: {},
      packageJsonChanges: [],
    });
    const missingTests = findings.find((f) => f.code === 'MISSING_TESTS');
    assert.ok(missingTests);
    assert.match(missingTests.details, /and 5 more/);
  });
});

// ---------------------------------------------------------------------------
// analyzeChangedFiles — POTENTIAL_SECRET detection
// ---------------------------------------------------------------------------

describe('analyzeChangedFiles — POTENTIAL_SECRET', () => {
  it('detects secret patterns in non-string code', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['config/setup.js'],
      newSourceFiles: [],
      newTestFiles: [],
      fileContents: {
        'config/setup.js': 'const API_KEY = process.env.MY_KEY;\n',
      },
      packageJsonChanges: [],
    });
    assert.ok(findings.some((f) => f.code === 'POTENTIAL_SECRET'));
  });
});

// ---------------------------------------------------------------------------
// analyzeChangedFiles — ENV_FILE_COMMITTED
// ---------------------------------------------------------------------------

describe('analyzeChangedFiles — ENV_FILE_COMMITTED', () => {
  it('flags .env files but NOT .env.example', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['.env', '.env.local', '.env.example'],
      newSourceFiles: [],
      newTestFiles: [],
      fileContents: {},
      packageJsonChanges: [],
    });
    const envFinding = findings.find((f) => f.code === 'ENV_FILE_COMMITTED');
    assert.ok(envFinding, 'should flag .env files');
    assert.match(envFinding.details, /\.env/);
    assert.match(envFinding.details, /\.env\.local/);
    assert.doesNotMatch(envFinding.details, /\.env\.example/);
  });
});

// ---------------------------------------------------------------------------
// analyzeChangedFiles — WRONG_DIRECTORY
// ---------------------------------------------------------------------------

describe('analyzeChangedFiles — WRONG_DIRECTORY', () => {
  it('flags test files outside test directories', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['src/utils.test.js'],
      newSourceFiles: [],
      newTestFiles: [],
      fileContents: {},
      packageJsonChanges: [],
    });
    assert.ok(findings.some((f) => f.code === 'WRONG_DIRECTORY'));
  });

  it('does not flag test files inside __tests__/', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['src/__tests__/utils.test.js'],
      newSourceFiles: [],
      newTestFiles: [],
      fileContents: {},
      packageJsonChanges: [],
    });
    assert.ok(!findings.some((f) => f.code === 'WRONG_DIRECTORY'));
  });

  it('flags artifact-pattern files outside artifacts/', () => {
    const findings = analyzeChangedFiles({
      changedFiles: ['schema-raw.json'],
      newSourceFiles: [],
      newTestFiles: [],
      fileContents: {},
      packageJsonChanges: [],
    });
    assert.ok(findings.some((f) => f.code === 'WRONG_DIRECTORY'));
  });
});

// ---------------------------------------------------------------------------
// detectDuplicatedBlocks — additional edge cases
// ---------------------------------------------------------------------------

describe('detectDuplicatedBlocks edge cases', () => {
  it('returns empty array for empty diff', () => {
    assert.deepEqual(detectDuplicatedBlocks(''), []);
  });

  it('does not flag a single occurrence of a block', () => {
    const block = Array.from({ length: 8 }, (_, i) => `+const v${i} = ${i};`).join('\n');
    const diff = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -0,0 +1,8 @@
${block}`;
    assert.deepEqual(detectDuplicatedBlocks(diff), []);
  });

  it('respects custom minLines parameter', () => {
    const block = ['+const a = 1;', '+const b = 2;', '+const c = 3;'].join('\n');
    const diff = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -0,0 +1,3 @@
${block}
diff --git a/src/b.js b/src/b.js
--- a/src/b.js
+++ b/src/b.js
@@ -0,0 +1,3 @@
${block}`;
    // Default minLines=6, should not flag
    assert.deepEqual(detectDuplicatedBlocks(diff), []);
    // With minLines=3, should flag
    const findings = detectDuplicatedBlocks(diff, { minLines: 3 });
    assert.equal(findings.length, 1);
  });
});
