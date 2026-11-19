import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-6232 guardrail — document status is never compared against a raw literal.
 *
 * `documentStatus === 'DR'` copied across files means a rule such as "editable only
 * in draft" diverges silently when an edge status (VO, UE, IP) appears. Use the
 * helpers in `src/lib/docStatus.js` (isDraftStatus / isCompletedStatus / isVoidedStatus / isEditableStatus).
 *
 * Way out, deliberately visible in a diff: a `doc-status-ok: <reason>` comment on the
 * line or directly above it.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');
const OPT_OUT = 'doc-status-ok';

// `<something mentioning status> ===|!== 'DR'|'CO'|'VO'` (either operand order).
const CODE = `(['"\`])(?:DR|CO|VO)\\1`;
const RAW = new RegExp(
  `(?:[Ss]tatus\\w*\\)?\\s*[!=]==?\\s*${CODE})|(?:${CODE}\\s*[!=]==?\\s*[\\w.?]*[Ss]tatus)`,
);

const ALLOWED = new Set([
  'lib/docStatus.js',
]);

function collect(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules' || entry === 'locales') continue;
      collect(full, acc);
      continue;
    }
    if (!/\.jsx?$/.test(entry) || /\.(test|vitest)\.jsx?$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

describe('no raw docStatus literal comparisons (ETP-6232)', () => {
  it('uses lib/docStatus.js helpers instead', () => {
    const offenders = [];
    for (const file of collect(SRC)) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (ALLOWED.has(rel)) continue;
      const raw = readFileSync(file, 'utf8').split('\n');
      blankComments(raw.join('\n')).split('\n').forEach((line, i) => {
        if (!RAW.test(line)) return;
        if (raw[i].includes(OPT_OUT) || (raw[i - 1] || '').includes(OPT_OUT)) return;
        offenders.push(`${rel}:${i + 1}: ${raw[i].trim()}`);
      });
    }
    assert.deepEqual(offenders, [], `Raw docStatus comparisons found; use src/lib/docStatus.js:\n${offenders.join('\n')}`);
  });
});
