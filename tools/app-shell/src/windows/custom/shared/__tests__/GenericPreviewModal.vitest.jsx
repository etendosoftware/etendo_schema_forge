vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// ETP-5358 — `usePreviewAttachment.js` was retired by ETP-4315 Phase 9; this mock used to
// target a module `GenericPreviewModal.jsx` no longer imports, so `ManagedLeftPanel`
// (backed by `useMainAttachment.js`) went completely untested here. Mocking the real hook
// lets the tests below exercise the autoFetch-vs-storedFile ordering directly.
const mockUseMainAttachment = vi.fn(() => ({
  storedFile: null,
  storedFileIsStale: false,
  isBusy: false,
  storeFailed: false,
  storeFile: vi.fn(),
  storeBlob: vi.fn(),
  storeUrl: vi.fn(),
  markExisting: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('../useMainAttachment.js', () => ({
  useMainAttachment: (...args) => mockUseMainAttachment(...args),
}));

vi.mock('../attachmentFileTypes.js', () => ({
  ACCEPTED_TYPES: {},
  ACCEPT_ATTR: '.pdf,.png,.jpg',
}));

vi.mock('../PdfViewer.jsx', () => ({
  default: () => <div data-testid="pdf-viewer" />,
}));

vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x" />,
  Upload: () => <span />,
  Trash2: () => <span />,
  Loader2: () => <span />,
  Download: () => <span />,
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GenericPreviewModal, { EmptyPanel } from '../GenericPreviewModal.jsx';

// ── EmptyPanel ────────────────────────────────────────────────────────────────

describe('EmptyPanel', () => {
  it('renders icon and text', () => {
    render(<EmptyPanel icon="📦" text="Nothing here" />);
    expect(screen.getByText('📦')).toBeInTheDocument();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders with any icon and text values', () => {
    render(<EmptyPanel icon="🎉" text="All done" />);
    expect(screen.getByText('🎉')).toBeInTheDocument();
    expect(screen.getByText('All done')).toBeInTheDocument();
  });
});

// ── GenericPreviewModal — actionButtons as function ───────────────────────────

describe('GenericPreviewModal actionButtons', () => {
  it('calls actionButtons function with triggerClose and triggerEdit helpers', () => {
    const actionButtons = vi.fn().mockReturnValue(<button>Action</button>);
    render(
      <GenericPreviewModal
        title="Test Title"
        onClose={vi.fn()}
        actionButtons={actionButtons}
      />,
    );
    expect(actionButtons).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerClose: expect.any(Function),
        triggerEdit: expect.any(Function),
      }),
    );
    expect(screen.getByText('Action')).toBeInTheDocument();
  });

  it('closes instead of freezing when triggerEdit runs without an onEdit prop', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    let helpers = null;
    render(
      <GenericPreviewModal
        title="Test Title"
        onClose={onClose}
        actionButtons={(h) => { helpers = h; return <button>Action</button>; }}
      />,
    );

    helpers.triggerEdit();
    await vi.advanceTimersByTimeAsync(300);

    // Without the fallback the modal animates out but never unmounts,
    // leaving an invisible overlay blocking the page (ETP-5027).
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('calls onEdit when supplied', async () => {
    vi.useFakeTimers();
    const onEdit = vi.fn();
    const onClose = vi.fn();
    let helpers = null;
    render(
      <GenericPreviewModal
        title="Test Title"
        onClose={onClose}
        onEdit={onEdit}
        actionButtons={(h) => { helpers = h; return <button>Action</button>; }}
      />,
    );

    helpers.triggerEdit();
    await vi.advanceTimersByTimeAsync(300);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('renders static ReactNode actionButtons unchanged', () => {
    render(
      <GenericPreviewModal
        title="Test"
        onClose={vi.fn()}
        actionButtons={<button>Static</button>}
      />,
    );
    expect(screen.getByText('Static')).toBeInTheDocument();
  });
});

// ── ManagedLeftPanel — autoFetch vs. storedFile ordering (ETP-5358) ───────────
//
// Two independent readers of the same marked attachment used to race for the left panel:
// usePdfGenerator (via the caller's own `leftPanel`, gated on the cache since the ETP-4315
// 2026-08-18 follow-up) and this component's own `useMainAttachment`. Whichever resolved
// second replaced the other's <PdfViewer>, tearing react-pdf down and remounting it with a
// new blob URL — the flicker reported in ETP-5358. The fix: `autoFetch` is checked BEFORE
// `attachment.storedFile`, so in autoFetch mode the panel is always the caller's own
// `leftPanel`, never this hook's file view — see docs/bug-reports/2026-09-16-etp5358-preview-double-viewer.md.

describe('GenericPreviewModal — ManagedLeftPanel autoFetch ordering (ETP-5358)', () => {
  const baseAttachmentConfig = {
    documentId: 'INV-1',
    tableName: 'C_Invoice',
    storeCondition: true,
    token: 'tok',
    apiBaseUrl: 'https://example.test/sales-invoice',
  };

  it('keeps the caller leftPanel mounted when autoFetch=true, even once storedFile resolves', () => {
    // The exact scenario that used to flicker: a marked attachment already exists (or the
    // auto-store upload just completed) while the caller is in autoFetch mode.
    mockUseMainAttachment.mockReturnValue({
      storedFile: { attachmentId: 'att-1', fileName: 'invoice.pdf', mimeType: 'application/pdf', objectUrl: 'blob:cached' },
      storedFileIsStale: false,
      isBusy: false,
      storeFailed: false,
      storeFile: vi.fn(),
      storeBlob: vi.fn(),
      storeUrl: vi.fn(),
      markExisting: vi.fn(),
      deleteFile: vi.fn(),
    });

    render(
      <GenericPreviewModal
        title="Invoice"
        onClose={vi.fn()}
        leftPanel={<div data-testid="caller-left-panel">Live PDF viewer</div>}
        attachmentConfig={{ ...baseAttachmentConfig, autoFetch: true, sourceBlob: new Blob(['x']) }}
      />,
    );

    // The caller's own viewer must be the one rendered...
    expect(screen.getByTestId('caller-left-panel')).toBeInTheDocument();
    // ...and ManagedLeftPanel's own file view (the second reader that used to win the race
    // and swap the panel) must never mount, regardless of storedFile.
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
  });

  it('still shows its own file view (not the caller leftPanel) when autoFetch=false', () => {
    // Drop-zone windows (purchase-invoice, goods-receipt, return-material-receipt) must be
    // completely unaffected by the ETP-5358 fix — they never set autoFetch, so this branch
    // is the one they still exercise.
    mockUseMainAttachment.mockReturnValue({
      storedFile: { attachmentId: 'att-2', fileName: 'supplier-doc.pdf', mimeType: 'application/pdf', objectUrl: 'blob:supplier' },
      storedFileIsStale: false,
      isBusy: false,
      storeFailed: false,
      storeFile: vi.fn(),
      storeBlob: vi.fn(),
      storeUrl: vi.fn(),
      markExisting: vi.fn(),
      deleteFile: vi.fn(),
    });

    render(
      <GenericPreviewModal
        title="Purchase Invoice"
        onClose={vi.fn()}
        leftPanel={<div data-testid="caller-left-panel">Should not be used</div>}
        attachmentConfig={{ ...baseAttachmentConfig, autoFetch: false }}
      />,
    );

    expect(screen.getByTestId('pdf-viewer')).toBeInTheDocument();
    expect(screen.queryByTestId('caller-left-panel')).not.toBeInTheDocument();
  });

  it('shows the drop zone (not the caller leftPanel) when autoFetch=false and no file is stored yet', () => {
    mockUseMainAttachment.mockReturnValue({
      storedFile: null,
      storedFileIsStale: false,
      isBusy: false,
      storeFailed: false,
      storeFile: vi.fn(),
      storeBlob: vi.fn(),
      storeUrl: vi.fn(),
      markExisting: vi.fn(),
      deleteFile: vi.fn(),
    });

    render(
      <GenericPreviewModal
        title="Purchase Invoice"
        onClose={vi.fn()}
        leftPanel={<div data-testid="caller-left-panel">Should not be used</div>}
        attachmentConfig={{ ...baseAttachmentConfig, autoFetch: false }}
      />,
    );

    expect(screen.getByTestId('preview-drop-zone')).toBeInTheDocument();
    expect(screen.queryByTestId('caller-left-panel')).not.toBeInTheDocument();
  });
});
