/**
 * ETP-5315 — grid bulk-select Reactivate for Purchase Order.
 *
 * Source-reading test, mirroring the convention already used for
 * BulkPurchaseOrderMoreMenu.test.js in this same directory: vitest's include
 * glob is scoped to `tools/app-shell/src/**`, so a `.vitest.jsx` render test
 * placed under `artifacts/` (where this component lives, alongside its
 * sales-order counterpart OrderReactivateBulkAction.jsx) is never picked up.
 * `BulkDocumentAction` itself already has full render/behavioral coverage
 * (tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx),
 * so this file only needs to prove the thin wrapper wires the right contract.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseOrderReactivateBulkAction.jsx'), 'utf8');

describe('PurchaseOrderReactivateBulkAction source (ETP-5315)', () => {
  it('exports PurchaseOrderReactivateBulkAction as the default component', () => {
    assert.match(src, /export default function PurchaseOrderReactivateBulkAction/);
  });

  it('imports BulkDocumentAction and useUI', () => {
    assert.match(src, /import\s+BulkDocumentAction\s+from\s+'@\/components\/contract-ui\/BulkDocumentAction'/);
    assert.match(src, /import\s+\{\s*useUI\s*\}\s+from\s+'@\/i18n'/);
  });

  it('blocks the RE action for a row with hasLinkedDocuments via the cannotReactivateLinkedDocs key', () => {
    assert.match(src, /action === 'RE' && row\.hasLinkedDocuments/);
    assert.match(src, /return ui\('cannotReactivateLinkedDocs'\)/);
  });

  it('allows every other case (falls through to return true)', () => {
    assert.match(src, /return true;/);
  });

  it('renders BulkDocumentAction with a custom buildActions, its own rowFilter, and the reactivateBulk labelKey', () => {
    assert.match(src, /<BulkDocumentAction\b/);
    assert.match(src, /buildActions=\{buildReactivateActions\}/);
    assert.match(src, /rowFilter=\{rowFilter\}/);
    assert.match(src, /labelKey="reactivateBulk"/);
  });

  // ETP-5315 QA fix (medium) — this component used to share the same labelKey
  // as the sibling CO-only BulkDocumentAction (buildInOutActions) rendered right
  // next to it in PurchaseOrderBulkActions (index.jsx). For a mixed DR+CO-unlinked
  // selection both buttons rendered simultaneously with the identical "Confirmar"/
  // "Confirm" label — indistinguishable even though one books and the other
  // reactivates. Guard against ever reusing the collided key again — matched only
  // against the rendered JSX block (not the file's prose comments, which legitimately
  // reference the sibling's own untouched labelKey by name).
  it('never reuses the collided labelKey on the rendered <BulkDocumentAction> (would collide with the sibling CO-only one)', () => {
    const jsxBlock = src.match(/return\s*\(\s*<BulkDocumentAction[\s\S]*?\/>\s*\);/);
    assert.ok(jsxBlock, 'could not locate the rendered <BulkDocumentAction /> block');
    assert.doesNotMatch(jsxBlock[0], /labelKey="confirmBulk"/);
  });

  // ETP-5315 review fix (blocker) — purchase-order renders BOTH the
  // pre-existing CO-only `<BulkDocumentAction buildActions={buildInOutActions}>`
  // AND this component alongside it. BulkDocumentAction's DEFAULT buildActions
  // (used when none is passed) adds a 'CO' option whenever any selected row
  // is DR, so without a custom buildActions here, any draft-containing
  // selection would render TWO "Confirmar" buttons. buildReactivateActions
  // must never offer 'CO' and must offer 'RE' only when a reactivatable
  // (CO, not linked) row is present.
  describe('buildReactivateActions (ETP-5315 review fix — no overlap with the CO-only BulkDocumentAction)', () => {
    function extractBuildActions(source) {
      const re = /const buildReactivateActions = \(rows\) => \{[\s\S]*?\n\};/;
      const m = source.match(re);
      assert.ok(m, 'could not locate the buildReactivateActions function body');
      return m[0];
    }

    function evaluate(rows) {
      const block = extractBuildActions(src);
      // eslint-disable-next-line no-new-func -- deliberately eval'ing the literal source under test
      const fn = new Function('rows', `${block}\nreturn buildReactivateActions(rows);`);
      return fn(rows);
    }

    it('never includes a CO option (that stays exclusively the other BulkDocumentAction\'s job)', () => {
      assert.doesNotMatch(extractBuildActions(src), /value:\s*'CO'/);
    });

    it('offers nothing for an all-draft selection', () => {
      const actions = evaluate([
        { documentStatus: 'DR', hasLinkedDocuments: false },
        { documentStatus: 'DR', hasLinkedDocuments: false },
      ]);
      assert.deepEqual(actions, []);
    });

    it('offers RE for a selection with a completed row that has no linked documents', () => {
      const actions = evaluate([
        { documentStatus: 'DR', hasLinkedDocuments: false },
        { documentStatus: 'CO', hasLinkedDocuments: false },
      ]);
      assert.deepEqual(actions, [{ value: 'RE', labelKey: 'reactivate' }]);
    });

    it('offers nothing when every completed row already has linked documents', () => {
      const actions = evaluate([
        { documentStatus: 'CO', hasLinkedDocuments: true },
      ]);
      assert.deepEqual(actions, []);
    });

    it('falls back to docStatus when documentStatus is absent', () => {
      const actions = evaluate([
        { docStatus: 'CO', hasLinkedDocuments: false },
      ]);
      assert.deepEqual(actions, [{ value: 'RE', labelKey: 'reactivate' }]);
    });
  });
});
