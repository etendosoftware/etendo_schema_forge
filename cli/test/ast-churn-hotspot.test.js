import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve('cli/src/ast-churn-hotspot.js');

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
}

test('summary ranks recent AST churn and reports branch delta', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'ast-churn-hotspot-'));
  try {
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    writeFileSync(path.join(repo, 'sample.jsx'), 'export function Sample() {\n  return <div />;\n}\n');
    git(repo, 'add', 'sample.jsx');
    git(repo, 'commit', '-qm', 'initial');
    const base = git(repo, 'rev-parse', 'HEAD').trim();
    writeFileSync(path.join(repo, 'sample.jsx'), 'export function Sample() {\n  return <section><span /></section>;\n}\n');
    git(repo, 'add', 'sample.jsx');
    git(repo, 'commit', '-qm', 'change sample');

    const output = execFileSync('node', [script, '--repo', repo, '--file', 'sample.jsx', '--since', '2000-01-01', '--days', '15', '--base-ref', base, '--summary'], { encoding: 'utf8' });
    assert.match(output, /AST churn hotspot ranking/);
    assert.match(output, /Sample/);
    assert.match(output, /base:/);
    assert.match(output, /\+\d+ \/ -\d+ lines/);

    const unavailable = execFileSync('node', [script, '--repo', repo, '--file', 'sample.jsx', '--since', '2000-01-01', '--days', '15', '--base-ref', 'missing-ref', '--summary'], { encoding: 'utf8' });
    assert.match(unavailable, /unavailable for missing-ref/);

    const htmlPath = path.join(repo, 'heatmap.html');
    execFileSync('node', [script, '--repo', repo, '--file', 'sample.jsx', '--since', '2000-01-01', '--days', '15', '--base-ref', base, '--out-html', htmlPath], { encoding: 'utf8' });
    const html = readFileSync(htmlPath, 'utf8');
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /class="number"/);
    assert.match(html, /AST churn heatmap/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
