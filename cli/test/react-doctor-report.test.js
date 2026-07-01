import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  sevCount,
  computeAvgScore,
  buildMarkdownReport,
  buildCsvRows,
  relativizePath,
  sanitizeReport,
} from '../src/react-doctor-report.js';

// A small, POSIX-absolute fixture shaped like the real react-doctor payload.
function makeData() {
  return {
    schemaVersion: 1,
    mode: 'x',
    ok: true,
    directory: '/repo',
    diff: null,
    summary: { errorCount: 2, warningCount: 3, score: 50, scoreLabel: 'Poor' },
    projects: [
      {
        directory: '/repo/tools/a',
        project: { projectName: '@x/a', rootDirectory: '/repo/tools/a', sourceFileCount: 10 },
        score: { score: 80, label: 'Good' },
        diagnostics: [
          {
            filePath: 'src/App.jsx',
            plugin: 'react-doctor',
            rule: 'no-x',
            severity: 'error',
            message: 'bad | thing',
            line: 3,
            column: 1,
            category: 'Correctness',
            help: 'long help text',
          },
          {
            filePath: 'src/b.js',
            plugin: 'deslop',
            rule: 'unused',
            severity: 'warning',
            message: 'w',
            line: 0,
            column: 0,
            category: 'Maintainability',
            help: 'help2',
          },
        ],
      },
      {
        directory: '/repo/tools/b',
        project: { projectName: '@x/b', rootDirectory: '/repo/tools/b', sourceFileCount: 5 },
        score: { score: 40, label: 'Bad' },
        diagnostics: [
          {
            filePath: 'src/c.js',
            plugin: 'react-doctor',
            rule: 'no-y',
            severity: 'error',
            message: 'm',
            line: 1,
            column: 1,
            category: 'A11y',
            help: 'h',
          },
          {
            filePath: 'src/d.js',
            plugin: 'react-doctor',
            rule: 'no-z',
            severity: 'warning',
            message: 'w2',
            line: 2,
            column: 1,
            category: 'Perf',
            help: 'h',
          },
          {
            filePath: 'src/e.js',
            plugin: 'react-doctor',
            rule: 'no-z',
            severity: 'warning',
            message: 'w3',
            line: 4,
            column: 1,
            category: 'Perf',
            help: 'h',
          },
        ],
      },
    ],
    diagnostics: [
      { severity: 'error', plugin: 'react-doctor', rule: 'no-x', category: 'Correctness', message: 'bad | thing', filePath: 'src/App.jsx', line: 3 },
      { severity: 'error', plugin: 'react-doctor', rule: 'no-y', category: 'A11y', message: 'm', filePath: 'src/c.js', line: 1 },
      { severity: 'warning', plugin: 'deslop', rule: 'unused', category: 'Maintainability', message: 'w', filePath: 'src/b.js', line: 0 },
      { severity: 'warning', plugin: 'react-doctor', rule: 'no-z', category: 'Perf', message: 'w2', filePath: 'src/d.js', line: 2 },
      { severity: 'warning', plugin: 'react-doctor', rule: 'no-z', category: 'Perf', message: 'w3', filePath: 'src/e.js', line: 4 },
    ],
  };
}

const ISO = '2026-07-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// sevCount
// ---------------------------------------------------------------------------

test('sevCount counts errors and warnings', () => {
  const diags = [
    { severity: 'error' },
    { severity: 'error' },
    { severity: 'warning' },
  ];
  assert.deepEqual(sevCount(diags), { error: 2, warning: 1 });
});

test('sevCount returns zeros for an empty array', () => {
  assert.deepEqual(sevCount([]), { error: 0, warning: 0 });
});

test('sevCount returns zeros when called with no argument (default param)', () => {
  assert.deepEqual(sevCount(), { error: 0, warning: 0 });
});

test('sevCount handles other severities gracefully without dropping the base counts', () => {
  const result = sevCount([
    { severity: 'error' },
    { severity: 'info' },
    { severity: 'warning' },
  ]);
  // Base keys are always present; extra severities are tallied under their own key.
  assert.equal(result.error, 1);
  assert.equal(result.warning, 1);
  assert.equal(result.info, 1);
});

// ---------------------------------------------------------------------------
// computeAvgScore
// ---------------------------------------------------------------------------

test('computeAvgScore rounds the mean of project scores', () => {
  assert.equal(computeAvgScore([{ score: { score: 80 } }, { score: { score: 61 } }]), 71);
});

test('computeAvgScore returns 0 for an empty array', () => {
  assert.equal(computeAvgScore([]), 0);
});

test('computeAvgScore returns 0 when called with no argument', () => {
  assert.equal(computeAvgScore(), 0);
});

test('computeAvgScore treats a missing score.score as 0', () => {
  // (80 + 0) / 2 = 40
  assert.equal(computeAvgScore([{ score: { score: 80 } }, { score: {} }]), 40);
  // Missing score object entirely also counts as 0: (60 + 0) / 2 = 30
  assert.equal(computeAvgScore([{ score: { score: 60 } }, {}]), 30);
});

// ---------------------------------------------------------------------------
// relativizePath
// ---------------------------------------------------------------------------

test('relativizePath relativizes an absolute path under root', () => {
  assert.equal(relativizePath('/repo/tools/x', '/repo'), path.join('tools', 'x'));
  assert.equal(relativizePath('/repo/tools/x', '/repo'), 'tools/x');
});

test('relativizePath returns "." for the root itself', () => {
  assert.equal(relativizePath('/repo', '/repo'), '.');
});

test('relativizePath returns an already-relative string unchanged', () => {
  assert.equal(relativizePath('src/App.jsx', '/repo'), 'src/App.jsx');
});

test('relativizePath passes through non-string values unchanged', () => {
  assert.equal(relativizePath(null, '/repo'), null);
  assert.equal(relativizePath(undefined, '/repo'), undefined);
  assert.equal(relativizePath(42, '/repo'), 42);
});

// ---------------------------------------------------------------------------
// sanitizeReport
// ---------------------------------------------------------------------------

test('sanitizeReport drops the top-level diagnostics array', () => {
  const result = sanitizeReport(makeData(), '/repo');
  assert.ok(!('diagnostics' in result), 'top-level diagnostics should be removed');
});

test('sanitizeReport relativizes top-level and per-project absolute paths', () => {
  const result = sanitizeReport(makeData(), '/repo');
  assert.equal(result.directory, '.');
  assert.equal(result.projects[0].directory, 'tools/a');
  assert.equal(result.projects[0].project.rootDirectory, 'tools/a');
  assert.equal(result.projects[1].directory, 'tools/b');
  assert.equal(result.projects[1].project.rootDirectory, 'tools/b');
});

test('sanitizeReport keeps only error-severity diagnostics per project', () => {
  const result = sanitizeReport(makeData(), '/repo');
  const p0 = result.projects[0];
  const p1 = result.projects[1];
  assert.equal(p0.diagnostics.length, 1);
  assert.ok(p0.diagnostics.every((d) => d.severity === 'error'));
  assert.equal(p1.diagnostics.length, 1);
  assert.ok(p1.diagnostics.every((d) => d.severity === 'error'));
});

test('sanitizeReport strips the help field from kept diagnostics', () => {
  const result = sanitizeReport(makeData(), '/repo');
  for (const p of result.projects) {
    for (const d of p.diagnostics) {
      assert.ok(!('help' in d), 'help should be stripped from kept diagnostics');
    }
  }
});

test('sanitizeReport adds per-project severityCounts reflecting ORIGINAL counts', () => {
  const result = sanitizeReport(makeData(), '/repo');
  // Project a: 1 error + 1 warning originally.
  assert.deepEqual(result.projects[0].severityCounts, { error: 1, warning: 1 });
  // Project b: 1 error + 2 warnings originally.
  assert.deepEqual(result.projects[1].severityCounts, { error: 1, warning: 2 });
});

test('sanitizeReport preserves summary and score untouched', () => {
  const data = makeData();
  const result = sanitizeReport(data, '/repo');
  assert.deepEqual(result.summary, { errorCount: 2, warningCount: 3, score: 50, scoreLabel: 'Poor' });
  assert.deepEqual(result.projects[0].score, { score: 80, label: 'Good' });
  assert.deepEqual(result.projects[1].score, { score: 40, label: 'Bad' });
});

test('sanitizeReport does not mutate the input object', () => {
  const data = makeData();
  sanitizeReport(data, '/repo');
  // Top-level diagnostics still present on the original.
  assert.ok(Array.isArray(data.diagnostics));
  assert.equal(data.diagnostics.length, 5);
  // Original per-project warnings and help fields survive.
  assert.equal(data.projects[0].diagnostics.length, 2);
  assert.ok(data.projects[0].diagnostics.some((d) => d.severity === 'warning'));
  assert.equal(data.projects[0].diagnostics[0].help, 'long help text');
  // Original absolute paths are untouched.
  assert.equal(data.directory, '/repo');
  assert.equal(data.projects[0].directory, '/repo/tools/a');
  assert.equal(data.projects[0].project.rootDirectory, '/repo/tools/a');
});

// ---------------------------------------------------------------------------
// buildMarkdownReport
// ---------------------------------------------------------------------------

test('buildMarkdownReport header contains date, average, workspaces and totals', () => {
  const md = buildMarkdownReport(makeData(), ISO);
  assert.ok(md.includes(`- **Date**: ${ISO}`));
  // avg of 80 and 40 = 60
  assert.ok(md.includes('- **Average score**: 60/100'));
  assert.ok(md.includes('- **Workspaces scanned**: 2'));
  // Totals come from the FULL top-level diagnostics: 2 errors, 3 warnings.
  assert.ok(md.includes('- **Total errors**: 2'));
  assert.ok(md.includes('- **Total warnings**: 3'));
});

test('buildMarkdownReport lists a per-workspace row for each project', () => {
  const md = buildMarkdownReport(makeData(), ISO);
  assert.ok(md.includes('| @x/a | 80 | Good | 10 | 1 | 1 |'));
  assert.ok(md.includes('| @x/b | 40 | Bad | 5 | 1 | 2 |'));
});

test('buildMarkdownReport lists error rows and escapes pipes in messages', () => {
  const md = buildMarkdownReport(makeData(), ISO);
  assert.ok(md.includes('## Errors (must fix)'));
  // "bad | thing" must have its pipe escaped as "\|".
  assert.ok(md.includes('| src/App.jsx | react-doctor/no-x | 3 | bad \\| thing |'));
  assert.ok(md.includes('| src/c.js | react-doctor/no-y | 1 | m |'));
});

test('buildMarkdownReport shows _None_ when there are no errors', () => {
  const data = makeData();
  data.diagnostics = data.diagnostics.filter((d) => d.severity !== 'error');
  const md = buildMarkdownReport(data, ISO);
  // The Errors section should render _None_.
  const section = md.slice(md.indexOf('## Errors (must fix)'));
  assert.ok(section.includes('_None_'));
});

// ---------------------------------------------------------------------------
// buildCsvRows
// ---------------------------------------------------------------------------

test('buildCsvRows emits one row per project plus a final __average__ row', () => {
  const csv = buildCsvRows(makeData().projects, ISO);
  const rows = csv.trimEnd().split('\n');
  assert.equal(rows.length, 3);
  assert.equal(rows[0], `${ISO},@x/a,80,10,1,1`);
  assert.equal(rows[1], `${ISO},@x/b,40,5,1,2`);
  // Average row: timestamp,__average__,avgScore,,errors,warnings
  // avg score = 60; totals across projects = 2 errors, 3 warnings.
  assert.equal(rows[2], `${ISO},__average__,60,,2,3`);
});

test('buildCsvRows average row uses computeAvgScore', () => {
  const projects = makeData().projects;
  const csv = buildCsvRows(projects, ISO);
  const avgRow = csv.trimEnd().split('\n').at(-1);
  const expectedAvg = computeAvgScore(projects);
  assert.ok(avgRow.startsWith(`${ISO},__average__,${expectedAvg},`));
});

test('buildCsvRows handles an empty project list (only the average row)', () => {
  const csv = buildCsvRows([], ISO);
  const rows = csv.trimEnd().split('\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0], `${ISO},__average__,0,,0,0`);
});
