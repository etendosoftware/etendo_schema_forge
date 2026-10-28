// The `test` every mocked spec imports (ETP-5891). With no E2E_COVERAGE_DIR it is Playwright's own
// `test`, untouched. With it, each test records which app source files its page executed: V8 JS
// coverage from Chromium, mapped back through the hidden source maps of the E2E bundle
// (E2E_COVERAGE_DIST, the `dist-e2e` folder the suite is served from). One JSON file per test
// lands in E2E_COVERAGE_DIR; scripts/e2e-coverage-map.mjs folds them into a file → specs map.
//
// A function counts when V8 saw it called at least once; its source file is where the source map
// places the function's first character. Code that only runs at module top level is invisible
// here (bundling merges it into the chunk's own top-level function), so a file whose only
// executed code is top-level does not appear in the map, and a change to it falls back to the
// whole suite. Each result also carries the test's outcome.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base } from '@playwright/test';
import { SourceMapConsumer } from 'source-map-js';

export * from '@playwright/test';

const COVERAGE_DIR = process.env.E2E_COVERAGE_DIR;
const DIST = process.env.E2E_COVERAGE_DIST;
const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// One parsed source map per bundle chunk, per worker.
const chunks = new Map();

function chunk(pathname) {
  if (chunks.has(pathname)) return chunks.get(pathname);
  let info = null;
  try {
    const file = join(DIST, pathname);
    const code = readFileSync(file, 'utf8');
    const map = JSON.parse(readFileSync(`${file}.map`, 'utf8'));
    const lineStarts = [0];
    for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) lineStarts.push(i + 1);
    const mapDir = dirname(file);
    info = { consumer: new SourceMapConsumer(map), lineStarts, mapDir };
  } catch {
    info = null;
  }
  chunks.set(pathname, info);
  return info;
}

function lineAndColumn(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo] };
}

// The source file of a function, by its chunk and offset: every test of a worker runs the same
// bundle, so each function is mapped once instead of once per test.
const sourceOf = new Map();

function sourceFile(info, pathname, offset) {
  const key = `${pathname}:${offset}`;
  if (!sourceOf.has(key)) {
    const original = info.consumer.originalPositionFor(lineAndColumn(info.lineStarts, offset));
    sourceOf.set(key, original.source ? relative(REPO_DIR, resolve(info.mapDir, original.source)) : null);
  }
  return sourceOf.get(key);
}

function executedSourceFiles(entries) {
  const files = new Set();
  for (const entry of entries) {
    const { pathname } = new URL(entry.url);
    if (!pathname.endsWith('.js')) continue;
    const info = chunk(pathname);
    if (!info) continue;
    for (const fn of entry.functions) {
      const range = fn.ranges[0];
      if (!range || range.count === 0) continue;
      const file = sourceFile(info, pathname, range.startOffset);
      if (file) files.add(file);
    }
  }
  return [...files].sort();
}

export const test = COVERAGE_DIR && DIST
  ? base.extend({
      page: async ({ page }, use, testInfo) => {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
        await use(page);
        let entries = [];
        try {
          entries = await page.coverage.stopJSCoverage();
        } catch {
          // The test closed its page; nothing to record.
        }
        mkdirSync(COVERAGE_DIR, { recursive: true });
        // One file per test: a retry overwrites it, so the last attempt's outcome is the one kept.
        // A test that did not pass may have stopped early, so the map treats its coverage as partial.
        writeFileSync(join(COVERAGE_DIR, `${testInfo.testId}.json`), JSON.stringify({
          spec: relative(REPO_DIR, testInfo.file),
          title: testInfo.titlePath.slice(1).join(' › '),
          status: testInfo.status,
          files: executedSourceFiles(entries),
        }));
      },
    })
  : base;
