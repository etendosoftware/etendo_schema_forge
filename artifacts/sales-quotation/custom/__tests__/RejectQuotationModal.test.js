import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'RejectQuotationModal.jsx'), 'utf8');
// Comment-stripped view, used by the visual-spec assertions below. Those assert on
// declared style values, and the file documents its Figma mapping in prose right
// above the style objects — prose that quotes token names. Reading the raw source
// there would let a comment satisfy (or defeat) an assertion about real code.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

describe('RejectQuotationModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function RejectQuotationModal/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /from\s+['"]@\/i18n['"]/);
    assert.match(src, /useUI\(\)/);
  });

  describe('reject reasons fetch', () => {
    it('builds the selectors URL targeting C_Reject_Reason_ID', () => {
      assert.match(src, /\/quotation\/selectors\/C_Reject_Reason_ID/);
    });

    it('uses a search-typeahead input (regression: was a native select)', () => {
      assert.match(src, /<input/);
      assert.doesNotMatch(src, /<select\b/);
    });

    it('filters the loaded reasons by query (case-insensitive)', () => {
      assert.match(src, /toLowerCase/);
      assert.match(src, /filteredReasons/);
    });

    it('shows a no-results placeholder when the query has no matches', () => {
      assert.match(src, /rejectReasonNoResults/);
    });
  });

  describe('inline create flow', () => {
    it('imports CreateRejectReasonModal sub-modal', () => {
      assert.match(src, /import\s+CreateRejectReasonModal\s+from\s+['"]\.\/CreateRejectReasonModal['"]/);
    });

    it('renders a "+ Crear razón" button via the createRejectReason key', () => {
      assert.match(src, /\+\s*\{ui\(\s*['"]createRejectReason['"]\s*\)\}/);
    });

    it('renders the sub-modal via createPortal when triggered', () => {
      assert.match(src, /showCreate\s*&&\s*createPortal\(\s*<CreateRejectReasonModal/);
    });

    it('seeds the sub-modal with the typed query only when nothing is selected (regression: pre-filled the selected reason name)', () => {
      assert.match(src, /initialName=\{selected\s*\?\s*['"]{2}\s*:\s*query\}/);
      assert.doesNotMatch(src, /initialName=\{query\}/);
    });

    it('appends the created reason to the cached list and preselects it', () => {
      assert.match(src, /handleCreated/);
      assert.match(src, /handleSelect\(created\)/);
    });
  });

  describe('confirm action', () => {
    it('POSTs to the rejectQuotation action endpoint', () => {
      assert.match(
        src,
        /apiFetch\(\s*`\$\{entityUrl\}\/\$\{quotationId\}\/action\/rejectQuotation`/,
      );
    });

    it('sends the selected reason as { rejectReason }', () => {
      assert.match(src, /JSON\.stringify\(\s*\{\s*rejectReason:\s*selected\.id/);
    });

    it('disables the confirm button until a reason is selected', () => {
      assert.match(src, /const\s+canSubmit\s*=\s*!loading\s*&&\s*!!selected/);
      assert.match(src, /disabled=\{!canSubmit\}/);
    });

    it('reloads the page on success', () => {
      assert.match(src, /window\.location\.reload\(\)/);
    });
  });

  describe('i18n compliance', () => {
    it('does not hardcode English copy', () => {
      assert.doesNotMatch(src, /['"`](Reject quotation|Rejection reason|Choose a reason|Search reasons|Create reason)['"`]/);
    });

    it('renders the title via the rejectQuotationTitle key', () => {
      assert.match(src, /ui\(\s*['"]rejectQuotationTitle['"]\s*\)/);
    });

    it('renders the search placeholder via the rejectReasonSearchPlaceholder key', () => {
      assert.match(src, /ui\(\s*['"]rejectReasonSearchPlaceholder['"]\s*\)/);
    });

    it('uses the rejectQuotationError key when surfacing backend failures', () => {
      assert.match(src, /ui\(\s*['"]rejectQuotationError['"]\s*\)/);
    });
  });

  describe('Figma redesign — visual spec', () => {
    it('renders the document subtitle via quotationDocumentLabel + documentNo (regression: was "#" separator)', () => {
      assert.match(code, /\{ui\(\s*['"]quotationDocumentLabel['"]\s*\)\}\s*:\s*\{documentNo\}/);
    });

    it('uses the Inter font family in the card', () => {
      assert.match(code, /fontFamily:\s*['"]Inter,\s*sans-serif['"]/);
    });

    it('pins the card width to the Figma frame (375px)', () => {
      assert.match(code, /cardStyle\s*=\s*\{[^}]*width:\s*375\b/);
    });

    it('renders a required-field asterisk with the semantic destructive role', () => {
      assert.match(code, /asteriskStyle/);
      assert.match(code, /color:\s*'hsl\(var\(--destructive\)\)'/);
    });

    // ---------------------------------------------------------------------
    // Neutral-grey token mapping (ETP-5378).
    //
    // WARNING to anyone "restoring" an older expectation here: the previous
    // version of this block asserted the input border was
    // `1px solid hsl(var(--foreground))`. That was pinning a BUG, not a spec.
    // ETP-4554 migrated this file off raw colour literals and mapped every
    // neutral grey in the Figma frame onto the wrong semantic role — the input
    // border's light grey became `--foreground`, which is near-black, so the
    // field rendered with a heavy black outline the design never had. The spec
    // was written against that broken output and then froze it in place.
    //
    // ETP-5378 corrected the mapping against the Figma frame. The roles below
    // are the corrected ones; do not widen them back toward `--foreground`.
    // ---------------------------------------------------------------------

    it('borders the typeahead input with the control-border role at 8px radius (regression: ETP-4554 mapped this grey to --foreground)', () => {
      assert.match(code, /inputStyle\s*=\s*\{[^}]*border:\s*'1px solid hsl\(var\(--border-control\)\)'/);
      assert.match(code, /inputStyle\s*=\s*\{[^}]*borderRadius:\s*8\b/);
    });

    it('borders the dropdown with the same control-border role', () => {
      assert.match(code, /dropdownStyle\s*=\s*\{[^}]*border:\s*'1px solid hsl\(var\(--border-control\)\)'/);
    });

    it('never uses the near-black foreground role as a structural border', () => {
      // The single assertion that would have caught the ETP-4554 mis-mapping.
      assert.doesNotMatch(code, /border(Top|Bottom|Left|Right)?:\s*'[\d.]+px solid hsl\(var\(--foreground\)\)'/);
    });

    it('uses the muted-foreground role for the placeholder and the 12px helper text', () => {
      assert.match(code, /::placeholder\s*\{\s*color:\s*hsl\(var\(--muted-foreground\)\)/);
      assert.match(code, /noResultsStyle\s*=\s*\{[^}]*color:\s*'hsl\(var\(--muted-foreground\)\)'/);
    });

    it('uses the subtle-border role for list dividers', () => {
      assert.match(code, /createOptionStyle\s*=\s*\{[^}]*borderBottom:\s*'1px solid hsl\(var\(--border-subtle\)\)'/);
    });

    it('strokes the decorative icons with the secondary-icon role', () => {
      // ETP-5398 dropped this count from 2 to 1: the close ("x") SVG moved to
      // `--muted-foreground` (see the test below). What stays on the secondary-icon
      // role is the input's chevron SVG, plus the clear ("x") button inside the input.
      assert.equal((code.match(/stroke="hsl\(var\(--icon-secondary\)\)"/g) || []).length, 1);
      assert.match(code, /chevronIconStyle[\s\S]{0,160}stroke="hsl\(var\(--icon-secondary\)\)"/);
      assert.match(code, /clearBtnStyle\s*=\s*\{[^}]*color:\s*'hsl\(var\(--icon-secondary\)\)'/);
    });

    it('strokes the close button with the muted-foreground role (ETP-5398)', () => {
      // The ticket's item 3: `--icon-secondary` made the X read as too faint.
      // `--muted-foreground` is the role explicitly tuned for WCAG AA.
      assert.match(code, /stroke="hsl\(var\(--muted-foreground\)\)"/);
      assert.doesNotMatch(code, /closeBtnStyle\s*=\s*\{[^}]*color:\s*'hsl\(var\(--icon-secondary\)\)'/);
    });

    it('renders a chevron-down indicator inside the input (replaces magnifying glass)', () => {
      assert.match(code, /chevronIconStyle/);
      assert.doesNotMatch(code, /searchIconStyle/);
    });

    it('uses semantic button roles with a 360 radius', () => {
      // Primary = foreground fill with card-coloured label; secondary = card fill
      // with a control-border outline.
      assert.match(code, /btnPrimary\s*=\s*\{[^}]*background:\s*'hsl\(var\(--foreground\)\)'[^}]*color:\s*'hsl\(var\(--card\)\)'/);
      assert.match(code, /btnSecondary\s*=\s*\{[^}]*border:\s*'1px solid hsl\(var\(--border-control\)\)'[^}]*background:\s*'hsl\(var\(--card\)\)'/);
      assert.match(code, /borderRadius:\s*360\b/);
    });

    it('fills the disabled primary button with the control-border role, not the card surface (ETP-5378)', () => {
      // ETP-4554 gave the disabled fill `--card`, the same role as its own label,
      // so the button rendered as an empty gap next to "Cancelar".
      assert.match(code, /btnPrimaryDisabled\s*=\s*\{[^}]*background:\s*'hsl\(var\(--border-control\)\)'/);
      assert.doesNotMatch(code, /btnPrimaryDisabled\s*=\s*\{[^}]*background:\s*'hsl\(var\(--card\)\)'/);
    });

    it('locks button dimensions to the Figma spec (Cancelar 132×40, Rechazar 191×40)', () => {
      assert.match(code, /btnSecondary\s*=\s*\{[^}]*width:\s*132[^}]*height:\s*40/s);
      assert.match(code, /btnPrimary\s*=\s*\{[^}]*width:\s*191[^}]*height:\s*40/s);
      assert.match(code, /btnPrimaryDisabled\s*=\s*\{[^}]*width:\s*191[^}]*height:\s*40/s);
    });

    it('positions the close button at top:6 right:6 (Figma frame)', () => {
      assert.match(code, /closeBtnStyle\s*=\s*\{[^}]*top:\s*6\b[^}]*right:\s*6\b/s);
    });
  });
});
