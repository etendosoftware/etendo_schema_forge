#!/usr/bin/env node
/**
 * window-leak-budget.js — a "ratchet" guard for window/entity-specific literals that
 * leak into the GENERIC contract-ui components (DetailView.jsx, DataTable.jsx, ...).
 *
 * Same philosophy as method-budget.js (per user request): do NOT fail just because
 * leaks exist today. Freeze a baseline of how many there are now and fail ONLY IF the
 * count GROWS. As we declarativize leaks (move `=== 'contact'`, `'custom:sif'`,
 * `'internal-consumption-product'` ... into contract/metadata) the number drops and
 * we lock in the win with --update. The target is 0, reached gradually with no rush.
 *
 *   - current == baseline  -> OK
 *   - current  > baseline  -> FAIL (a new window literal was hardcoded)
 *   - current  < baseline  -> OK + nudge (run --update to lower the baseline)
 *
 * Findings inside comments are ignored (a comment describing a removed branch is not a
 * leak). String/JSX literals are kept — that is exactly where the leaks live.
 *
 * Usage:
 *   node cli/src/window-leak-budget.js            # check, exit 1 if it grew
 *   node cli/src/window-leak-budget.js --list     # enumerate every finding (file:line)
 *   node cli/src/window-leak-budget.js --update    # lower the baseline after paying debt
 *   node cli/src/window-leak-budget.js --json
 *
 * Config: cli/window-leak-budget.json (committed).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
const CONFIG_PATH = join(__dirname, '..', 'window-leak-budget.json');

/**
 * Per-char step inside a quoted literal (`string` / `char` / `template`). The quote
 * char is always kept; a backslash escape consumes the next char too; the closing
 * quote returns to `code`. `state: undefined` means "stay in the current state".
 */
function stepQuoted(c, next, quote) {
  if (c === '\\') return { i: 2, out: c + (next ?? '') };
  return { i: 1, out: c, state: c === quote ? 'code' : undefined };
}

/**
 * Per-state handlers for {@link stripCommentsKeepStrings}. Each returns how many chars
 * to advance (`i`), what to append (`out`), and the next `state` (undefined = unchanged).
 * Comment bytes become spaces so line/column numbers stay aligned for reporting.
 */
const STRIP_STEPS = {
  code(c, next) {
    if (c === '/' && next === '/') return { i: 2, out: '  ', state: 'line' };
    if (c === '/' && next === '*') return { i: 2, out: '  ', state: 'block' };
    if (c === '"') return { i: 1, out: c, state: 'string' };
    if (c === '\'') return { i: 1, out: c, state: 'char' };
    if (c === '`') return { i: 1, out: c, state: 'template' };
    return { i: 1, out: c };
  },
  line(c) {
    if (c === '\n') return { i: 1, out: c, state: 'code' };
    return { i: 1, out: ' ' };
  },
  block(c, next) {
    if (c === '*' && next === '/') return { i: 2, out: '  ', state: 'code' };
    return { i: 1, out: c === '\n' ? '\n' : ' ' };
  },
  string: (c, next) => stepQuoted(c, next, '"'),
  char: (c, next) => stepQuoted(c, next, '\''),
  template: (c, next) => stepQuoted(c, next, '`'),
};

/**
 * Strip line and block comments while KEEPING string/char literals intact (the leaks
 * are string literals). Comment bytes are replaced with spaces so line/column numbers
 * are preserved for accurate reporting.
 */
export function stripCommentsKeepStrings(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  let state = 'code'; // code | line | block | string | char | template
  while (i < n) {
    const step = STRIP_STEPS[state](source[i], source[i + 1]);
    out += step.out;
    i += step.i;
    if (step.state) state = step.state;
  }
  return out;
}

function listFiles(dir, extensions) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      result.push(...listFiles(full, extensions));
      continue;
    }
    if (extensions.includes(extname(entry.name))) result.push(full);
  }
  return result.sort((a, b) => a.localeCompare(b));
}

/** Scan one source string, returning [{ line, match, pattern }] (comments ignored). */
export function findLeaksInSource(source, patterns) {
  const clean = stripCommentsKeepStrings(source);
  const lines = clean.split('\n');
  const findings = [];
  for (const p of patterns) {
    // Patterns come exclusively from the committed cli/window-leak-budget.json (a
    // version-controlled, developer-authored config — never user, request, or network
    // input). They are short, anchored, linear expressions with no nested quantifiers,
    // so dynamic construction here carries no ReDoS risk. // NOSONAR
    const re = new RegExp(p, 'g'); // NOSONAR: trusted committed config, no untrusted input

    lines.forEach((text, idx) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        findings.push({ line: idx + 1, match: m[0].trim(), pattern: p });
        if (m.index === re.lastIndex) re.lastIndex += 1;
      }
    });
  }
  return findings;
}

export function scan(config, opts = {}) {
  const root = opts.root || ROOT;
  const extensions = config.extensions || ['.js', '.jsx'];
  const findings = [];
  for (const rel of config.paths) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const files = statSync(abs).isDirectory() ? listFiles(abs, extensions) : [abs];
    for (const file of files) {
      const hits = findLeaksInSource(readFileSync(file, 'utf8'), config.patterns);
      for (const h of hits) findings.push({ file: file.replace(`${root}/`, ''), ...h });
    }
  }
  return findings;
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) throw new Error(`Config not found: ${CONFIG_PATH}`);
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

/** Status glyph: ✗ grew, ↓ improved, ✓ at baseline. */
function statusVerb(current, baseline) {
  if (current > baseline) return '✗';
  if (current < baseline) return '↓';
  return '✓';
}

function printReport(findings, current, baseline, { asJson, list }) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ baseline, current, findings }, null, 2)}\n`);
    return;
  }
  if (list || current > baseline) {
    for (const f of findings) {
      process.stdout.write(`  • ${f.file}:${f.line}  ${f.match}\n`);
    }
    if (findings.length) process.stdout.write('\n');
  }
  process.stdout.write(`  ${statusVerb(current, baseline)}  window-literal leaks in contract-ui: ${current} (baseline ${baseline})\n`);
}

function main() {
  const args = process.argv.slice(2);
  const update = args.includes('--update');
  const asJson = args.includes('--json');
  const list = args.includes('--list');
  const config = loadConfig();
  const findings = scan(config);
  const current = findings.length;
  const baseline = config.baseline;

  printReport(findings, current, baseline, { asJson, list });

  if (current < baseline && update) {
    config.baseline = current;
    writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
    process.stdout.write(`\n  Lowered baseline ${baseline} → ${current}. Commit cli/window-leak-budget.json.\n`);
    process.exit(0);
  }

  if (current > baseline) {
    process.stderr.write(`\nFAIL: window-specific leaks grew (${current} > ${baseline}).\n`);
    process.stderr.write('A generic component must not learn new window/entity literals. Move it to contract/metadata\n');
    process.stderr.write('(see docs/reports/contract-ui-churn-analysis.md §8). The goal is 0 — but it must never go UP.\n');
    process.exit(1);
  }

  if (current < baseline && !update) {
    process.stdout.write('\n  Leaks decreased — run `node cli/src/window-leak-budget.js --update` to lock in the lower baseline.\n');
  }
  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
