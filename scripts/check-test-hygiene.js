#!/usr/bin/env node
// CI check for the reuse-first test protocol (docs/testing/test-reuse-policy.md).
// Runs on the test files a PR adds or modifies:
//   1. missing `@covers`
//   2. `@covers` pointing to a path that does not exist
//   3. a NEW test file named after a ticket (etp-?\d{4})
//   4. heuristic: a new Vitest `it`/`test` block with no assertion
//
// Usage:
//   node scripts/check-test-hygiene.js --base <sha> --head <sha> [--mode annotate|block]
//
// Mode (flag or TEST_HYGIENE_MODE env): `annotate` emits ::warning and exits 0;
// `block` emits ::error and exits 1 when anything is found.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coversOnLine } from './find-tests.js';

const ROOT = process.env.SF_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TEST_FILE_RE = /\.(test|vitest|spec)\.[cm]?[jt]sx?$/;
const TICKET_NAME_RE = /etp-?\d{4}/i;
const ASSERTION_RE = /\b(expect|assert)\w*\s*[.(]/;
const TEST_CALL_RE = /(^|[^\w.$])(it|test)((?:\.(?:only|skip|concurrent|fails))*)\s*\(/g;
const EACH_CALL_RE = /(^|[^\w.$])(it|test)\.each\s*(\(|`)/g;

export function isTestFile(path) {
  return TEST_FILE_RE.test(path) && !path.startsWith('.claude/') && !path.includes('/node_modules/');
}

/** Vitest runs `*.vitest.*` everywhere and `*.spec.*` under tools/app-shell/src. */
export function isVitestFile(path) {
  return /\.vitest\.[cm]?[jt]sx?$/.test(path)
    || (/^tools\/app-shell\/src\//.test(path) && /\.spec\.[cm]?[jt]sx?$/.test(path));
}

export function isTicketNamed(path) {
  return TICKET_NAME_RE.test(posix.basename(path));
}

/** Every `@covers <path>` with its 1-based line number. */
export function parseCoversWithLines(src) {
  const out = [];
  src.split('\n').forEach((line, index) => {
    const path = coversOnLine(line);
    if (path) out.push({ path, line: index + 1 });
  });
  return out;
}

/**
 * Index just past the parenthesis that closes the one at `openIndex`.
 * Skips string, template and comment content; good enough for test files.
 */
export function findClosingParen(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      i = src.indexOf('\n', i);
      if (i < 0) return -1;
    } else if (ch === '/' && next === '*') {
      i = src.indexOf('*/', i + 2);
      if (i < 0) return -1;
      i += 1;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(src, i);
      if (i < 0) return -1;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function skipString(src, start) {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i += 1) {
    if (src[i] === '\\') { i += 1; continue; }
    if (src[i] === quote) return i;
    if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
      const close = findClosingBrace(src, i + 1);
      if (close < 0) return -1;
      i = close;
    }
  }
  return -1;
}

function findClosingBrace(src, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(src, i);
      if (i < 0) return -1;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i += 1) if (src[i] === '\n') starts.push(i + 1);
  return starts;
}

function lineOf(starts, index) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * `it`/`test` blocks whose body has no expect…/assert… call.
 * `.todo` and `.skip` blocks are ignored. With `addedLines`, only blocks that
 * start on an added line are reported (a modified file's untouched blocks are
 * Part 2 debt, not this PR's).
 */
export function findAssertionlessBlocks(src, addedLines = null) {
  const found = [];
  const starts = lineStarts(src);
  const collect = (re, isEach) => {
    for (const m of src.matchAll(re)) {
      const modifiers = isEach ? '' : m[3];
      if (/\.skip/.test(modifiers)) continue;
      const callStart = m.index + m[1].length;
      let open = src.indexOf('(', callStart);
      if (isEach) {
        // it.each(table)(name, fn) / it.each`table`(name, fn): the body is the second call.
        const tableEnd = m[3] === '`' ? skipString(src, src.indexOf('`', callStart)) + 1 : findClosingParen(src, open);
        if (tableEnd <= 0) continue;
        open = src.indexOf('(', tableEnd);
      }
      if (open < 0) continue;
      const close = findClosingParen(src, open);
      if (close < 0) continue;
      const line = lineOf(starts, callStart);
      if (addedLines && !addedLines.has(line)) continue;
      const args = src.slice(open + 1, close - 1);
      // `it('name')` with no callback is a todo, not an empty test.
      if (!/=>|function\b/.test(args)) continue;
      if (ASSERTION_RE.test(args)) continue;
      const name = (args.match(/^\s*(['"`])((?:\\.|(?!\1).)*)\1/) || [])[2] ?? '';
      found.push({ line, name });
    }
  };
  collect(TEST_CALL_RE, false);
  collect(EACH_CALL_RE, true);
  return found.sort((a, b) => a.line - b.line);
}

/**
 * Pure core: findings for one changed test file.
 * @param {object} file { path, status: 'A'|'M'|'R', src, addedLines?: Set<number> }
 * @param {(path: string) => boolean} pathExists repo-relative existence check
 */
export function checkFile({ path, status, src, addedLines = null }, pathExists) {
  const findings = [];
  const isNew = status === 'A' || status === 'R';
  const covers = parseCoversWithLines(src);

  if (covers.length === 0) {
    findings.push({ path, line: 1, rule: 'missing-covers', message: 'test file has no `@covers <repo-relative path>` tag' });
  }
  for (const { path: covered, line } of covers) {
    if (!pathExists(covered)) {
      findings.push({ path, line, rule: 'covers-not-found', message: `@covers points to a missing path: ${covered}` });
    }
  }
  if (isNew && isTicketNamed(path)) {
    findings.push({ path, line: 1, rule: 'ticket-named', message: 'new test file is named after a ticket; name it by behavior (the ticket goes in the commit message)' });
  }
  if (isVitestFile(path)) {
    for (const { line, name } of findAssertionlessBlocks(src, isNew ? null : addedLines)) {
      findings.push({ path, line, rule: 'no-assertion', message: `test block has no expect()/assert call${name ? `: "${name}"` : ''} (heuristic)` });
    }
  }
  return findings;
}

export function formatAnnotation(finding, mode) {
  const level = mode === 'block' ? 'error' : 'warning';
  return `::${level} file=${finding.path},line=${finding.line},title=test-hygiene/${finding.rule}::${finding.message}`;
}

/** `git diff --name-status` output → [{ path, status }] for test files. */
export function parseNameStatus(output) {
  return output.split('\n').filter(Boolean).map((row) => {
    const parts = row.split('\t');
    const status = parts[0][0];
    const path = parts[parts.length - 1];
    return { status, path };
  }).filter(({ status, path }) => ['A', 'M', 'R'].includes(status) && isTestFile(path));
}

/** `git diff -U0` output → the set of added line numbers in the new file. */
export function parseAddedLines(diff) {
  const lines = new Set();
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    for (let i = 0; i < count; i += 1) lines.add(start + i);
  }
  return lines;
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function parseArgs(argv) {
  const opts = { mode: process.env.TEST_HYGIENE_MODE || 'annotate' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') opts.base = argv[++i];
    else if (argv[i] === '--head') opts.head = argv[++i];
    else if (argv[i] === '--mode') opts.mode = argv[++i];
  }
  return opts;
}

export function main(argv) {
  const { base, head, mode } = parseArgs(argv);
  if (!base || !head || !['annotate', 'block'].includes(mode)) {
    console.error('Usage: node scripts/check-test-hygiene.js --base <sha> --head <sha> [--mode annotate|block]');
    return 2;
  }
  const range = `${base}...${head}`;
  const pathExists = (p) => existsSync(join(ROOT, p));

  let files;
  let findings;
  try {
    files = parseNameStatus(git(['diff', '--name-status', '-M', range]));
    findings = files.flatMap(({ path, status }) => {
      const src = git(['show', `${head}:${path}`]);
      const addedLines = status === 'M' ? parseAddedLines(git(['diff', '-U0', range, '--', path])) : null;
      return checkFile({ path, status, src, addedLines }, pathExists);
    });
  } catch (error) {
    // A git failure (shallow clone, missing ref) is an infrastructure problem, not a
    // finding: it must not fail the job while the check is annotate-only.
    const level = mode === 'block' ? 'error' : 'warning';
    const reason = String(error.stderr || error.message).trim().split('\n')[0];
    console.log(`::${level} title=test-hygiene/git-error::could not read the diff ${range}: ${reason}`);
    return mode === 'block' ? 1 : 0;
  }

  for (const finding of findings) console.log(formatAnnotation(finding, mode));
  console.log(`test-hygiene: ${files.length} changed test file(s), ${findings.length} finding(s) [mode: ${mode}]`);
  if (findings.length) console.log('See docs/testing/test-reuse-policy.md');
  return findings.length && mode === 'block' ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
