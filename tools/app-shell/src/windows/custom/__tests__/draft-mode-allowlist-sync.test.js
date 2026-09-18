// Guard-rail: keeps every custom window's HARDCODED `keepSaveWhenCompletedFields`
// array in sync with the one declared in its `decisions.json`
// (`window.draftMode.keepSaveWhenCompletedFields`).
//
// Why this test exists (ETP-5273):
//   The allowlist drives `buildCompletedFieldsGate` in
//   tools/app-shell/src/components/contract-ui/saveActions.jsx — the ETP-4839
//   mechanism that decides which header fields may still be saved once a
//   document is Completed. It FAILS CLOSED: any dirty field outside the list
//   disables the whole Save button.
//
//   The value is duplicated in two places that can silently diverge. The
//   generated page renders `draftMode={draftMode}` (the contract value, derived
//   from decisions.json) and only THEN spreads `{...props}`, so the custom
//   window's `index.jsx` override WINS and the contract's value never reaches
//   DetailView. That is how `accountingDate` was added to decisions.json and had
//   no runtime effect at all until the hardcode was updated too.
//
// This is a source-reading test (regex over the .jsx text): it needs no React,
// no jsdom and no vitest, so it runs under plain `node --test` and is picked up
// by the repo-level `npm test` glob `tools/app-shell/src/**/__tests__/*.test.js`.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

// Adding a third window = adding ONE entry here.
const WINDOWS = [
  {
    spec: 'purchase-invoice',
    // Declared as a function argument: getInvoiceDraftMode(ui, { keepSaveWhenCompletedFields: [...] })
    source: 'tools/app-shell/src/windows/custom/purchase-invoice/index.jsx',
  },
  {
    spec: 'goods-receipt',
    // Declared as an inline object-literal property inside the JSX: draftMode={{ ... }}
    source: 'tools/app-shell/src/windows/custom/goods-receipt/index.jsx',
  },
  {
    spec: 'sales-invoice',
    // Declared as a function argument: getInvoiceDraftMode(ui, { ..., keepSaveWhenCompletedFields: [...] })
    source: 'tools/app-shell/src/windows/custom/sales-invoice/index.jsx',
  },
];

// Tolerates both declaration shapes (they are syntactically identical: an object
// property), arbitrary whitespace/newlines, single or double quotes, and a
// trailing comma inside the array.
const ALLOWLIST_RE = /keepSaveWhenCompletedFields\s*:\s*\[([\s\S]*?)\]/g;

function extractHardcodedAllowlist(source, sourcePath) {
  const matches = [...source.matchAll(ALLOWLIST_RE)];
  assert.equal(
    matches.length,
    1,
    `Expected exactly ONE hardcoded \`keepSaveWhenCompletedFields\` array in ${sourcePath}, found ${matches.length}.\n` +
      'More than one means this guard-rail can no longer tell which array reaches DetailView — ' +
      'split the window or extend this test before adding another declaration.',
  );
  const body = matches[0][1].trim();
  if (body === '') return [];
  return body
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map((item) => {
      const quoted = item.match(/^['"`](.*)['"`]$/);
      assert.ok(
        quoted,
        `Non-literal entry ${item} in ${sourcePath}'s keepSaveWhenCompletedFields — ` +
          'this guard-rail only understands plain string literals.',
      );
      return quoted[1];
    });
}

function readDecisionsAllowlist(spec) {
  const path = join(REPO_ROOT, 'artifacts', spec, 'decisions.json');
  const decisions = JSON.parse(readFileSync(path, 'utf8'));
  return decisions?.window?.draftMode?.keepSaveWhenCompletedFields ?? [];
}

describe('draftMode.keepSaveWhenCompletedFields — hardcode vs decisions.json (ETP-5273)', () => {
  for (const { spec, source } of WINDOWS) {
    it(`${spec}: the hardcoded array in index.jsx matches decisions.json exactly`, () => {
      const sourcePath = join(REPO_ROOT, source);
      const hardcoded = extractHardcodedAllowlist(readFileSync(sourcePath, 'utf8'), source);
      const declared = readDecisionsAllowlist(spec);

      assert.deepEqual(
        hardcoded,
        declared,
        [
          '',
          `DRAFT-MODE ALLOWLIST OUT OF SYNC for window "${spec}".`,
          '',
          `  ${source}`,
          `    hardcoded (WINS at runtime): ${JSON.stringify(hardcoded)}`,
          `  artifacts/${spec}/decisions.json -> window.draftMode.keepSaveWhenCompletedFields`,
          `    declared  (NEVER applied here): ${JSON.stringify(declared)}`,
          '',
          'Why this matters: the generated page sets draftMode from the contract and THEN',
          'spreads {...props}, so the index.jsx override wins and the decisions.json value',
          'is silently ignored. Editing only decisions.json changes NOTHING at runtime',
          '(this is bug ETP-5273). keepSaveWhenCompletedFields fails CLOSED: any dirty header',
          'field missing from the effective list disables the Save button on a Completed',
          'document, with no error anywhere.',
          '',
          'Fix: update BOTH places to the same array (order included).',
          '',
        ].join('\n'),
      );
    });
  }
});
