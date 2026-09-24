import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-5398 guardrail — action/confirmation modals share one button palette.
 *
 * Design tokens carry a ROLE. `--card` is a surface, `--muted` is a background,
 * `--status-info-*` is a banner. Using one outside its role does not throw and does not
 * warn: it renders content that is simply invisible, so it ships. This has now happened
 * three times on the same four files — ETP-4554 mapped Figma greys onto `--card`/`--muted`
 * during the hex-to-token migration, ETP-5378 fixed one file, and ETP-5398 found the
 * remaining three (a Clone button at ~1.07:1 contrast that users read as disabled).
 *
 * The second recurring defect is expressing "disabled" with `opacity` on the fill. Each
 * modal picked its own value, so the same `#1D4ED8` rendered as two visibly different
 * blues depending on which modal you were looking at — reported as "two different blues"
 * when no second blue token ever existed.
 *
 * This test pins both rules at the declaration level, which is the only thing that keeps
 * the next hand-rolled modal from drifting back out again.
 *
 * Canonical palette: tools/app-shell/src/components/contract-ui/modal-styles.js
 * Normative contract: docs/plans/2026-09-24-ETP-5398-action-modal-design-contract.md
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

const MUTED_FOREGROUND = 'hsl(var(--muted-foreground))';

const MODALS = [
  {
    name: 'QuotationConfirmModal',
    file: join('artifacts', 'sales-quotation', 'custom', 'QuotationConfirmModal.jsx'),
    primary: 'btnPrimary',
    primaryDisabled: 'btnPrimaryDisabled',
    cancel: 'btnSecondary',
    // The unselected OptionCard icon still paints itself with `--muted`, a background
    // token, so it is invisible. It sits in the radio-card SELECTION palette, which
    // ETP-5398 deliberately left alone (changing a selection affordance is a design
    // decision the ticket does not make). Reported for follow-up; delete this allowance
    // when that lands.
    allowsMutedAsText: true,
  },
  {
    name: 'SendToEvaluationModal',
    file: join('artifacts', 'sales-quotation', 'custom', 'SendToEvaluationModal.jsx'),
    primary: 'btnPrimary',
    primaryDisabled: 'btnPrimaryDisabled',
    cancel: 'btnSecondary',
  },
  {
    name: 'RejectQuotationModal',
    file: join('artifacts', 'sales-quotation', 'custom', 'RejectQuotationModal.jsx'),
    primary: 'btnPrimary',
    primaryDisabled: 'btnPrimaryDisabled',
    cancel: 'btnSecondary',
    // This modal is the one that declares the palette as literals rather than spreading
    // MODAL_STYLES, and it legitimately keeps `--icon-secondary` for two DECORATIVE icons
    // (the typeahead chevron and the input's clear button). Its own test pins that count.
    allowsIconSecondary: true,
  },
  {
    name: 'CloneReceiptModal',
    file: join('artifacts', 'goods-receipt', 'custom', 'GoodsReceiptActions.jsx'),
    primary: 'cloneBtnPrimary',
    primaryDisabled: 'cloneBtnPrimaryDisabled',
    cancel: 'cloneBtnCancel',
  },
];

/**
 * Source with comments removed. The files document their token choices in prose that
 * quotes the very token names asserted below, so reading the raw text would let a comment
 * satisfy — or defeat — an assertion about real code.
 */
function readCode(file) {
  return readFileSync(join(REPO_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * The object literal assigned to `const <name> = { ... }`, brace-balanced.
 * Throws when the declaration is missing or never closes, so a renamed constant fails
 * loudly here instead of silently skipping every assertion about it.
 */
function declarationOf(code, name) {
  const start = code.search(new RegExp(`const\\s+${name}\\s*=\\s*\\{`));
  assert.notEqual(start, -1, `expected a "const ${name} = { ... }" declaration`);

  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced object literal in declaration of ${name}`);
}

describe('ETP-5398 — action modal style contract', () => {
  for (const modal of MODALS) {
    describe(modal.name, () => {
      const code = readCode(modal.file);

      it('fills the primary button with the foreground role', () => {
        // Either spread from the canonical object, or spelled out with the same token.
        const decl = declarationOf(code, modal.primary);
        assert.match(decl, /MODAL_STYLES\.btnSaveEnabled|background:\s*'hsl\(var\(--foreground\)\)'/);
      });

      it('fills the disabled primary with the control-border role', () => {
        const decl = declarationOf(code, modal.primaryDisabled);
        assert.match(decl, /MODAL_STYLES\.btnSaveDisabled|background:\s*'hsl\(var\(--border-control\)\)'/);
      });

      it('gives the cancel button a card fill and a visible control border', () => {
        const decl = declarationOf(code, modal.cancel);
        if (/MODAL_STYLES\.btnCancel/.test(decl)) return;
        assert.match(decl, /background:\s*'hsl\(var\(--card\)\)'/);
        assert.match(decl, /border:\s*'1px solid hsl\(var\(--border-control\)\)'/);
      });

      it('never uses a status token as a button fill', () => {
        // `--status-info-bg` is a banner background: under a `--card` label it renders at
        // about 1.07:1. `--status-info-fg` is the blue this ticket removes. The banner
        // itself still uses both, legitimately — that is why this is scoped to buttons.
        for (const name of [modal.primary, modal.primaryDisabled, modal.cancel]) {
          assert.doesNotMatch(declarationOf(code, name), /background:\s*'?var\(--status-/);
        }
      });

      it('expresses the disabled primary by swapping the style object, not by opacity', () => {
        // `{ ...btnPrimary, opacity: loading ? 0.6 : 1 }` is the shape that produced the
        // ticket's "two different blues". `opacity` on a spinner is still fine.
        const spreadWithOpacity = new RegExp(`\\.\\.\\.\\s*${modal.primary}\\b[^}]*opacity:`);
        assert.doesNotMatch(code, spreadWithOpacity);
      });

      it('never paints a border with the card surface token', () => {
        // A border in the colour of the surface it sits on does not render at all.
        assert.doesNotMatch(code, /border[A-Za-z]*:\s*'[\d.]+px solid hsl\(var\(--card\)\)'/);
      });

      it('colours the close icon with the muted-foreground role', () => {
        // The role explicitly tuned for WCAG AA. `--icon-secondary` (decorative) and
        // `--text-disabled` both made the X read as too faint to find.
        assert.ok(
          code.includes(MUTED_FOREGROUND),
          `expected the close icon to use ${MUTED_FOREGROUND}`,
        );
        assert.doesNotMatch(code, /--text-disabled/);
        if (!modal.allowsIconSecondary) assert.doesNotMatch(code, /--icon-secondary/);
      });

      it('never uses a background token as a text colour', () => {
        if (modal.allowsMutedAsText) return;
        assert.doesNotMatch(code, /color:\s*'hsl\(var\(--muted\)\)'/);
      });
    });
  }
});
