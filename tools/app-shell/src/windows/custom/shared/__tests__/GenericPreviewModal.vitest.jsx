vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('../usePreviewAttachment.js', () => ({
  usePreviewAttachment: vi.fn(() => ({
    storedFile: null,
    isBusy: false,
    storeFailed: false,
    storeFile: vi.fn(),
    storeBlob: vi.fn(),
    storeUrl: vi.fn(),
    deleteFile: vi.fn(),
  })),
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
