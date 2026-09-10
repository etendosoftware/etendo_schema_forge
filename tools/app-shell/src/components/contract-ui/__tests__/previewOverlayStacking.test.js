import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (...p) => readFileSync(join(__dirname, '..', '..', '..', ...p), 'utf8');

const selectionToolbar = src('components', 'contract-ui', 'SelectionToolbar.jsx');
const previewModal = src('windows', 'custom', 'shared', 'GenericPreviewModal.jsx');
const invoicePreview = src('windows', 'custom', 'shared', 'InvoicePreview.jsx');
const documentPreview = src('components', 'contract-ui', 'DocumentPreview.jsx');

/**
 * The stacking order between the list's selection pill, the preview, and the modals the preview
 * opens. Three components have to agree for it to work, and the last time one of them moved on its
 * own it took two releases to notice: ETP-4972 raised the preview above the pill, and the payment,
 * SIF and send modals it opens quietly began rendering behind it (reported on ETP-4895).
 *
 * The scale these pin is documented in docs/ui-design-guidelines.md.
 */
describe('preview overlay stacking', () => {
  it('keeps the selection pill on the Navigation tier, where an overlay can cover it', () => {
    // It portals to document.body, so at the overlay tier it would paint over a same-tier modal
    // no matter what the modal does — which is exactly how this went wrong.
    assert.match(selectionToolbar, /className="pointer-events-none fixed z-40"/);
    assert.doesNotMatch(selectionToolbar, /className="pointer-events-none fixed z-50"/);
  });

  it('keeps the preview on the Overlay tier, not above it', () => {
    assert.match(previewModal, /className=\{`fixed inset-0 z-50 bg-foreground\/30/);
    // z-[60] is the dropdown-in-modal tier: above every modal, including the ones below.
    assert.doesNotMatch(previewModal, /fixed inset-0 z-\[60\]/);
  });

  it('keeps the document preview on the Overlay tier too', () => {
    // It carried the identical ETP-4972 workaround, so it would have grown the identical bug the
    // first time anything was opened from it.
    assert.doesNotMatch(documentPreview, /className="[^"]*z-\[60\]/);
    assert.match(documentPreview, /className="fixed inset-0 bg-foreground\/30 z-50 transition-opacity"/);
  });

  // Same tier as the preview, so what puts them on top is being rendered after it. Moving any of
  // them above the preview in this fragment would put them back underneath.
  it('renders the modals the preview opens after the preview itself', () => {
    const previewIdx = invoicePreview.indexOf('<GenericPreviewModal');
    assert.ok(previewIdx > -1, 'the preview must be rendered here');
    for (const modal of ['showPaymentModal', 'showSifModal', 'showSendModal']) {
      const idx = invoicePreview.indexOf(`{p.${modal} && (`);
      assert.ok(idx > -1, `${modal} must be rendered here`);
      assert.ok(idx > previewIdx, `${modal} must be rendered after the preview, or it stacks below it`);
    }
  });
});
