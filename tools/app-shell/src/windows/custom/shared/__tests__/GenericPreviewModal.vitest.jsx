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

import { render, screen, fireEvent } from '@testing-library/react';
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

// ETP-5304 — the tab bar is the regression surface: the guard used to be
// `tabs.length > 0`, which drew a lone, already-active pill for every single-tab
// preview (all document previews build exactly one 'general' tab). It looked
// pressable and switched nothing. Both sides of the new `> 1` guard are pinned
// here, because hiding the bar must NOT take the tab's content with it.
//
// The real tab buttons carry no data-testid, so they are addressed by their
// accessible name (the tab label). Labels and contents below are deliberately
// disjoint strings so a content match can never be mistaken for a label match.
describe('GenericPreviewModal tab bar (ETP-5304)', () => {
  const ONE_TAB = [
    { key: 'general', label: 'Tab one label', content: <p>Body of tab one</p> },
  ];
  const TWO_TABS = [
    { key: 'general', label: 'Tab one label', content: <p>Body of tab one</p> },
    { key: 'history', label: 'Tab two label', content: <p>Body of tab two</p> },
  ];

  const renderModal = (props = {}) => render(
    <GenericPreviewModal title="Test Title" onClose={vi.fn()} {...props} />,
  );

  it('renders no tab bar for a single tab — no pill, no pressable control', () => {
    renderModal({ tabs: ONE_TAB });

    expect(screen.queryByText('Tab one label')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tab one label' })).toBeNull();
    // The close button is the only control left in the panel.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
  });

  it('still renders the single tab content while the bar is hidden', () => {
    renderModal({ tabs: ONE_TAB });

    expect(screen.getByText('Body of tab one')).toBeInTheDocument();
  });

  it('honours initialTab for a single tab even with the bar hidden', () => {
    renderModal({ tabs: ONE_TAB, initialTab: 'general' });

    expect(screen.getByText('Body of tab one')).toBeInTheDocument();
    expect(screen.queryByText('Tab one label')).toBeNull();
  });

  it('renders the tab bar once there is something to switch to', () => {
    renderModal({ tabs: TWO_TABS });

    expect(screen.getByRole('button', { name: 'Tab one label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tab two label' })).toBeInTheDocument();
    // Close button plus one pill per tab.
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('shows the first tab content by default when two tabs are present', () => {
    renderModal({ tabs: TWO_TABS });

    expect(screen.getByText('Body of tab one')).toBeInTheDocument();
    expect(screen.queryByText('Body of tab two')).toBeNull();
  });

  it('switches the rendered content when the second tab is clicked', () => {
    renderModal({ tabs: TWO_TABS });

    fireEvent.click(screen.getByRole('button', { name: 'Tab two label' }));

    expect(screen.getByText('Body of tab two')).toBeInTheDocument();
    expect(screen.queryByText('Body of tab one')).toBeNull();
  });

  it('opens on initialTab and can switch back to the first tab', () => {
    renderModal({ tabs: TWO_TABS, initialTab: 'history' });

    expect(screen.getByText('Body of tab two')).toBeInTheDocument();
    expect(screen.queryByText('Body of tab one')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tab one label' }));

    expect(screen.getByText('Body of tab one')).toBeInTheDocument();
    expect(screen.queryByText('Body of tab two')).toBeNull();
  });

  it('renders neither bar nor content when no tabs are supplied', () => {
    expect(() => renderModal({ tabs: [] })).not.toThrow();

    expect(screen.queryByText('Tab one label')).toBeNull();
    expect(screen.queryByText('Body of tab one')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('defaults to no tabs at all when the prop is omitted', () => {
    expect(() => renderModal()).not.toThrow();

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
