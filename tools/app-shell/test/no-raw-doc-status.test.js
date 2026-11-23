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
const PURCHASE_ORDER_ACTIONS = join(__dirname, '../../../artifacts/purchase-order/custom/PurchaseOrderActions.jsx');
const OPT_OUT = 'doc-status-ok';

// A line is an offender when it compares with `===`/`!==`/`==`/`!=` (either operand order; the same pattern also matches the `!=` of display expressions such as
// `@DocumentStatus@!='DR'`, but not a lone `=`, so `@DocumentStatus@!='DR'` is NOT flagged — a known gap) a raw
// DR/CO/VO literal AND names a status somewhere on the line, so `statusOf(r) === 'DR'`,
// `'CO' === row.documentStatus` and `row.status !== 'VO'` are caught while a SII state such as
// `aeatsiiEstado === 'CO'` is not. Also flagged: `case 'DR':` and `['DR', ...].includes(` forms.
// Known gaps (documented, not caught): a status compared through an intermediate variable that is
// not named *status* (`const s = row.x; s === 'DR'`), array constants not followed by
// `.includes(`/`.some(` on the same line, and status arguments built by string concatenation.
const LIT = `['"\`](?:DR|CO|VO)['"\`]`;
const CMP = new RegExp(`(?:[!=]==?\\s*${LIT})|(?:${LIT}\\s*[!=]==?)`);
const CASE = new RegExp(`\\bcase\\s+${LIT}\\s*:`);
const ARRAY_INCLUDES = new RegExp(`\\[[^\\]]*${LIT}[^\\]]*\\]\\s*\\.(?:includes|some)\\([^)]*status`, 'i');

export function isRawDocStatusLine(line) {
  if (CASE.test(line)) return true;
  if (ARRAY_INCLUDES.test(line)) return true;
  return CMP.test(line) && /status/i.test(line);
}

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

function scan(source) {
  const raw = source.split('\n');
  const out = [];
  blankComments(source).split('\n').forEach((line, i) => {
    if (!isRawDocStatusLine(line)) return;
    if (raw[i].includes(OPT_OUT) || (raw[i - 1] || '').includes(OPT_OUT)) return;
    out.push(`${i + 1}: ${raw[i].trim()}`);
  });
  return out;
}

describe('no raw docStatus literal comparisons (ETP-6232)', () => {
  it('uses lib/docStatus.js helpers instead', () => {
    const offenders = [];
    for (const file of [...collect(SRC), PURCHASE_ORDER_ACTIONS]) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (ALLOWED.has(rel)) continue;
      for (const o of scan(readFileSync(file, 'utf8'))) offenders.push(`${rel}:${o}`);
    }
    assert.deepEqual(offenders, [], `Raw docStatus comparisons found; use src/lib/docStatus.js:\n${offenders.join('\n')}`);
  });
});

describe('isRawDocStatusLine matcher (self-test)', () => {
  for (const line of [
    "if (row.documentStatus === 'DR') {}",
    "if (data?.documentStatus !== \"CO\") {}",
    "const x = 'CO' === row.docStatus;",
    "rows.some((r) => statusOf(r) === 'DR')",
    "switch (s) { case 'DR': break; }",
    "['DR', 'CO'].includes(row.documentStatus)",
    "const expr = \"@DocumentStatus@!='DR'\";",
  ]) it(`flags ${line}`, () => assert.equal(isRawDocStatusLine(line), true));

  for (const line of [
    "isDraftStatus(row.documentStatus)",
    "{ field: 'documentStatus', operator: 'equals', value: 'CO' }",
    "await post({ docAction: 'CO' })",
    "!['CO', 'AE'].includes(data?.aeatsiiEstado ?? '')",
    "const cls = documentStatus === DOC_STATUS.DRAFT;",
  ]) it(`ignores ${line}`, () => assert.equal(isRawDocStatusLine(line), false));

  it('ignores comments and honours the opt-out via the scan', () => {
    const src = ["// documentStatus === 'DR'", "x = status === 'CO'; // doc-status-ok: fixture"].join('\n');
    assert.deepEqual(scan(src), []);
    assert.equal(scan("x = status === 'CO';").length, 1);
  });
});
