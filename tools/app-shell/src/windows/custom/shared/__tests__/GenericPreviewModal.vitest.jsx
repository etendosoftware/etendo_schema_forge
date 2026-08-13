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
