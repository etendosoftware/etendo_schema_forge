import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'RejectQuotationModal.jsx'), 'utf8');

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
        /fetch\(\s*`\$\{entityUrl\}\/\$\{quotationId\}\/action\/rejectQuotation`/,
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
      assert.match(src, /\{ui\(\s*['"]quotationDocumentLabel['"]\s*\)\}\s*:\s*\{documentNo\}/);
    });

    it('uses the Inter font family in the card', () => {
      assert.match(src, /fontFamily:\s*['"]Inter,\s*sans-serif['"]/);
    });

    it('pins the card width to the Figma frame (375px)', () => {
      assert.match(src, /width:\s*375\b/);
    });

    it('renders a required-field asterisk with the semantic destructive role', () => {
      assert.match(src, /asteriskStyle/);
      assert.match(src, /color:\s*'hsl\(var\(--destructive\)\)'/);
    });

    it('borders the typeahead input with a semantic foreground role at 8px radius', () => {
      assert.match(src, /border:\s*['"]1px solid hsl\(var\(--foreground\)\)['"]/);
      assert.match(src, /borderRadius:\s*8\b/);
    });

    it('renders a chevron-down indicator inside the input (replaces magnifying glass)', () => {
      assert.match(src, /chevronIconStyle/);
      assert.doesNotMatch(src, /searchIconStyle/);
    });

    it('uses semantic foreground/card button roles with a 360 radius', () => {
      assert.match(src, /background:\s*['"]hsl\(var\(--foreground\)\)['"]/);
      assert.match(src, /background:\s*['"]hsl\(var\(--card\)\)['"]/);
      assert.match(src, /borderRadius:\s*360\b/);
    });

    it('locks button dimensions to the Figma spec (Cancelar 132×40, Rechazar 191×40)', () => {
      assert.match(src, /btnSecondary\s*=\s*\{[^}]*width:\s*132[^}]*height:\s*40/s);
      assert.match(src, /btnPrimary\s*=\s*\{[^}]*width:\s*191[^}]*height:\s*40/s);
      assert.match(src, /btnPrimaryDisabled\s*=\s*\{[^}]*width:\s*191[^}]*height:\s*40/s);
    });

    it('positions the close button at top:6 right:6 (Figma frame)', () => {
      assert.match(src, /top:\s*6\b[\s\S]*right:\s*6\b/);
    });
  });
});
