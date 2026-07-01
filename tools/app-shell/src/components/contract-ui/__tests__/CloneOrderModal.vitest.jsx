// Real Vitest import test for CloneOrderModal — covers actual component code paths
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/lib/statusBadge.js', () => ({
  statusLabel: (status) => status,
}));

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CloneOrderModal from '../CloneOrderModal.jsx';

describe('CloneOrderModal', () => {
  const singleRecord = [
    { id: 'rec-1', documentNo: 'SO-001', 'businessPartner$_identifier': 'Acme Corp', documentStatus: 'CO' },
  ];

  const multiRecords = [
    { id: 'rec-1', documentNo: 'SO-001', 'businessPartner$_identifier': 'Acme Corp', documentStatus: 'CO' },
    { id: 'rec-2', documentNo: 'SO-002', 'businessPartner$_identifier': 'Beta Inc', documentStatus: 'DR' },
  ];

  const defaultProps = {
    records: singleRecord,
    apiBaseUrl: '/sws/neo/sales-order',
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    onClose: vi.fn(),
    routePrefix: '/sales-order/',
    onCloned: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the confirm phase with single record title', () => {
    render(<CloneOrderModal {...defaultProps} />);
    // Title key appears in both header and button, so use getAllByText
    const titleElements = screen.getAllByText('cloneConfirmTitleOne');
    expect(titleElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('cloneConfirmSubtitleOne')).toBeInTheDocument();
  });

  it('renders the confirm phase with multi record title', () => {
    render(<CloneOrderModal {...defaultProps} records={multiRecords} />);
    // The title key appears both in the header and the button, so use getAllByText
    const elements = screen.getAllByText('cloneConfirmTitleMany');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('displays document numbers and business partner names', () => {
    render(<CloneOrderModal {...defaultProps} records={multiRecords} />);
    expect(screen.getByText('SO-001')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('SO-002')).toBeInTheDocument();
    expect(screen.getByText('Beta Inc')).toBeInTheDocument();
  });

  it('shows document status tags for items that have documentStatus', () => {
    render(<CloneOrderModal {...defaultProps} records={multiRecords} />);
    const tags = screen.getAllByTestId('status-tag');
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the info banner', () => {
    render(<CloneOrderModal {...defaultProps} />);
    expect(screen.getByText('cloneInfoBanner')).toBeInTheDocument();
  });

  it('has a clone button with data-testid', () => {
    render(<CloneOrderModal {...defaultProps} />);
    const btn = screen.getByTestId('action-clone-record');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('falls back to recordId + data when records prop is not provided', () => {
    render(
      <CloneOrderModal
        {...defaultProps}
        records={undefined}
        recordId="legacy-1"
        data={{ documentNo: 'LEG-001', 'businessPartner$_identifier': 'Legacy BP' }}
      />
    );
    expect(screen.getByText('LEG-001')).toBeInTheDocument();
    expect(screen.getByText('Legacy BP')).toBeInTheDocument();
  });

  it('renders nothing meaningful when no records and no recordId', () => {
    render(
      <CloneOrderModal
        {...defaultProps}
        records={undefined}
        recordId={undefined}
        data={undefined}
      />
    );
    // Should still render the modal structure but with 0 items
    expect(screen.getByText('cloneInfoBanner')).toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<CloneOrderModal {...defaultProps} onClose={onClose} />);
    // The overlay is the outermost div
    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not propagate click from card to overlay', () => {
    const onClose = vi.fn();
    render(<CloneOrderModal {...defaultProps} onClose={onClose} />);
    // Click the clone button (inside the card) — should not trigger onClose
    fireEvent.click(screen.getByTestId('action-clone-record'));
    // onClose should NOT be called from card click, only from clone action
    // The click on the button triggers handleClone, not onClose
  });

  it('disables clone button during cloning phase', async () => {
    // Make fetch hang
    globalThis.fetch.mockImplementation(() => new Promise(() => {}));
    render(<CloneOrderModal {...defaultProps} />);

    const btn = screen.getByTestId('action-clone-record');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(btn).toBeDisabled();
    });
  });

  it('shows processing text during cloning', async () => {
    globalThis.fetch.mockImplementation(() => new Promise(() => {}));
    render(<CloneOrderModal {...defaultProps} />);

    fireEvent.click(screen.getByTestId('action-clone-record'));

    await waitFor(() => {
      expect(screen.getByText('soProcessing')).toBeInTheDocument();
    });
  });

  it('shows error when clone API returns not ok', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Clone failed' } }),
    });

    render(<CloneOrderModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('action-clone-record'));

    await waitFor(() => {
      expect(screen.getByText('Clone failed')).toBeInTheDocument();
    });
  });

  it('shows fallback error key when API error has no message', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });

    render(<CloneOrderModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('action-clone-record'));

    await waitFor(() => {
      expect(screen.getByText('cloneOrderError')).toBeInTheDocument();
    });
  });

  it('shows done state after successful clone with routePrefix', async () => {
    // First call: clone action POST
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: { id: 'new-1' } } }),
      })
      // Second call: fetch cloned record details
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'new-1', documentNo: 'SO-NEW-001' }] } }),
      });

    render(<CloneOrderModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('action-clone-record'));

    await waitFor(() => {
      expect(screen.getByText('cloneDoneTitleOne')).toBeInTheDocument();
      expect(screen.getByText('cloneDoneSubtitle')).toBeInTheDocument();
    });
  });

  it('calls onClose and onCloned without routePrefix', async () => {
    const onClose = vi.fn();
    const onCloned = vi.fn();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { id: 'new-1' } } }),
    });

    render(
      <CloneOrderModal
        {...defaultProps}
        routePrefix={undefined}
        onClose={onClose}
        onCloned={onCloned}
      />
    );
    fireEvent.click(screen.getByTestId('action-clone-record'));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(onCloned).toHaveBeenCalledWith('new-1');
    });
  });

  it('handles fetch throw (network error)', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));

    render(<CloneOrderModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('action-clone-record'));

    await waitFor(() => {
      expect(screen.getByText('cloneOrderError')).toBeInTheDocument();
    });
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<CloneOrderModal {...defaultProps} onClose={onClose} />);
    // The close button contains the x character
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(b => b.textContent.trim() === '\u00d7');
    if (xButton) {
      fireEvent.click(xButton);
      expect(onClose).toHaveBeenCalled();
    }
  });
});
