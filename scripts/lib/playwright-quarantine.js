// Quarantine of flaky mocked Playwright tests (ETP-5695). e2e/quarantine.json lists the tests that
// every gating run (pre-push, CI) leaves out while their flakiness is fixed; run-e2e-full.sh still
// runs them in a separate, non-blocking pass. Policy: docs/testing/flaky-tests.md.
//
// e2e/playwright.config.js turns the list into the `grepInvert` / `grep` of the mocked projects.
// Playwright matches those against "<project> <file relative to testDir> <describe…> <test>",
// joined by spaces, so an entry names exactly one test of one file.
//
//   node scripts/lib/playwright-quarantine.js count     number of quarantined tests
//   node scripts/lib/playwright-quarantine.js check     problems in the list (exit 1 if any),
//                                                       expired entries as warnings
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'e2e');
export const QUARANTINE_FILE = join(E2E_DIR, 'quarantine.json');
export const MAX_DAYS = 14;
const FIELDS = ['file', 'title', 'reason', 'ticket', 'since', 'until'];
const DAY_MS = 24 * 60 * 60 * 1000;

export function loadQuarantine(path = QUARANTINE_FILE) {
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(data.tests) ? data.tests : [];
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The grep for the listed tests, or null when the list is empty. */
export function quarantinePattern(entries) {
  if (!entries.length) return null;
  const alternatives = entries.map(({ file, title }) => {
    const path = file.replace(/^tests\//, ''); // the config's testDir is ./tests
    const titlePath = title.split(' › ').map((part) => escape(part.trim())).join('\\s');
    // Only tags (@…) may follow the title, so "X" does not also take "X again".
    return `(?:^|\\s)${escape(path)}\\s(?:.*\\s)?${titlePath}(?:$|\\s@)`;
  });
  return new RegExp(alternatives.join('|'));
}

function parseDay(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text ?? '') ? Date.parse(`${text}T00:00:00Z`) : NaN;
}

function readSpecFile(file) {
  const path = join(E2E_DIR, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Problems with one entry. `readSpec(path relative to e2e/)` returns the spec's text, or null when
 * it does not exist; injectable for tests. A renamed or deleted test would match nothing and sit in
 * the list unnoticed, so every part of the title must still appear in the file.
 */
export function entryProblems(entry, readSpec = readSpecFile) {
  const problems = FIELDS.filter((field) => !String(entry[field] ?? '').trim())
    .map((field) => `missing "${field}"`);
  if (entry.file && !/^tests\/.+\.mocked\.spec\.js$/.test(entry.file)) {
    problems.push('"file" must be a mocked spec under tests/');
  } else if (entry.file) {
    const source = readSpec(entry.file);
    if (source == null) {
      problems.push(`${entry.file} does not exist`);
    } else if (entry.title && !entry.title.split(' › ').every((part) => source.includes(part.trim()))) {
      problems.push(`title not found in ${entry.file} (renamed or removed?)`);
    }
  }
  if (entry.ticket && !/^ETP-\d+$/.test(entry.ticket)) problems.push('"ticket" must be an ETP-NNNN key');
  const since = parseDay(entry.since);
  const until = parseDay(entry.until);
  if (entry.since && Number.isNaN(since)) problems.push('"since" must be YYYY-MM-DD');
  if (entry.until && Number.isNaN(until)) problems.push('"until" must be YYYY-MM-DD');
  if (!Number.isNaN(since) && !Number.isNaN(until)) {
    if (until < since) problems.push('"until" is before "since"');
    if (until - since > MAX_DAYS * DAY_MS) problems.push(`quarantine longer than ${MAX_DAYS} days`);
  }
  return problems;
}

/** Entries whose `until` is before `today` (YYYY-MM-DD). */
export function expiredEntries(entries, today) {
  const now = parseDay(today);
  return entries.filter((entry) => parseDay(entry.until) < now);
}

const label = (entry) => `${entry.file} › ${entry.title}`;

export function main(argv, { today = new Date().toISOString().slice(0, 10), path = QUARANTINE_FILE } = {}) {
  const entries = loadQuarantine(path);
  if (argv[0] === 'count') {
    console.log(entries.length);
    return 0;
  }
  if (argv[0] === 'check') {
    let failed = false;
    for (const entry of entries) {
      for (const problem of entryProblems(entry)) {
        console.log(`quarantine: ${label(entry)}: ${problem}`);
        failed = true;
      }
    }
    for (const entry of expiredEntries(entries, today)) {
      console.log(`quarantine: WARNING ${label(entry)} expired on ${entry.until} (${entry.ticket}): fix it or remove it`);
    }
    return failed ? 1 : 0;
  }
  console.error('usage: playwright-quarantine.js count|check');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
