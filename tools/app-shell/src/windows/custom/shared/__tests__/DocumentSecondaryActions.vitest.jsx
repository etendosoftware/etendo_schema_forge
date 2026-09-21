/**
 * Unit tests for the shared DocumentSecondaryActions group (ETP-5260).
 *
 * Covers the two contracts the ticket depends on:
 *   1. Internal render order is always Copy link -> Clone -> Send (AC #5,
 *      "consistent order across every document").
 *   2. Each button's visibility gate (showCopyLink / clone / showSend) works
 *      independently, so a window can opt out of any of the three.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/contract-ui/CopyRecordLinkButton', () => ({
  default: (props) => <button {...props} data-testid="stub-copy-link" />,
}));

vi.mock('../CloneButton.jsx', () => ({
  default: ({ onClick, title }) => (
    <button data-testid="stub-clone" title={title} onClick={onClick} />
  ),
}));

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  SendDocumentButton: ({ onClick }) => (
    <button data-testid="stub-send" onClick={onClick} />
  ),
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: ({ onClose, onCloned }) => (
    <div data-testid="stub-clone-modal">
      <button data-testid="stub-clone-modal-confirm" onClick={() => onCloned('new-id-1')}>confirm</button>
      <button data-testid="stub-clone-modal-close" onClick={onClose}>close</button>
    </div>
  ),
}));

import DocumentSecondaryActions from '../DocumentSecondaryActions.jsx';

function renderActions(props = {}) {
  return render(
    <MemoryRouter>
      <DocumentSecondaryActions
        recordId="123"
        data={{ id: '123' }}
        windowName="purchase-order"
        apiBaseUrl="/sws/neo/purchase-order"
        token="test-token"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DocumentSecondaryActions', () => {
  it('renders nothing when recordId is not provided', () => {
    const { container } = render(
      <MemoryRouter>
        <DocumentSecondaryActions recordId={null} windowName="purchase-order" />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only Copy link by default (clone and send both default off)', () => {
    renderActions();
    expect(screen.getByTestId('stub-copy-link')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-clone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stub-send')).not.toBeInTheDocument();
  });

  it('renders Copy link, Clone and Send in that DOM order when all three are enabled', () => {
    const { container } = renderActions({ clone: true, showSend: true, onSendClick: vi.fn() });
    const testIds = Array.from(container.querySelectorAll('[data-testid]'))
      .map(el => el.getAttribute('data-testid'))
      .filter(id => ['stub-copy-link', 'stub-clone', 'stub-send'].includes(id));
    expect(testIds).toEqual(['stub-copy-link', 'stub-clone', 'stub-send']);
  });

  // ── Visibility gates ────────────────────────────────────────────────────

  it('hides Copy link when showCopyLink is false', () => {
    renderActions({ showCopyLink: false });
    expect(screen.queryByTestId('stub-copy-link')).not.toBeInTheDocument();
  });

  it('hides Clone when clone is false (default)', () => {
    renderActions();
    expect(screen.queryByTestId('stub-clone')).not.toBeInTheDocument();
  });

  it('shows Clone when clone is true', () => {
    renderActions({ clone: true });
    expect(screen.getByTestId('stub-clone')).toBeInTheDocument();
  });

  it('shows Clone when clone is an override object', () => {
    renderActions({ clone: { cloneActionName: 'cloneOrder' } });
    expect(screen.getByTestId('stub-clone')).toBeInTheDocument();
  });

  it('hides Send when showSend is false (default)', () => {
    renderActions();
    expect(screen.queryByTestId('stub-send')).not.toBeInTheDocument();
  });

  it('shows Send when showSend is true', () => {
    renderActions({ showSend: true, onSendClick: vi.fn() });
    expect(screen.getByTestId('stub-send')).toBeInTheDocument();
  });

  it('calls onSendClick when Send is clicked (does not open a local modal itself)', async () => {
    const user = userEvent.setup();
    const onSendClick = vi.fn();
    renderActions({ showSend: true, onSendClick });
    await user.click(screen.getByTestId('stub-send'));
    expect(onSendClick).toHaveBeenCalledTimes(1);
  });

  // ── Clone flow ──────────────────────────────────────────────────────────

  it('opens the clone modal when Clone is clicked', async () => {
    const user = userEvent.setup();
    renderActions({ clone: true });
    expect(screen.queryByTestId('stub-clone-modal')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('stub-clone'));
    expect(screen.getByTestId('stub-clone-modal')).toBeInTheDocument();
  });

  it('closes the clone modal without navigating when the modal reports close', async () => {
    const user = userEvent.setup();
    renderActions({ clone: true });
    await user.click(screen.getByTestId('stub-clone'));
    await user.click(screen.getByTestId('stub-clone-modal-close'));
    expect(screen.queryByTestId('stub-clone-modal')).not.toBeInTheDocument();
  });

  it('uses the titleKey override for the Clone button tooltip when provided', () => {
    renderActions({ clone: { titleKey: 'customCloneTitle' } });
    expect(screen.getByTestId('stub-clone')).toHaveAttribute('title', 'customCloneTitle');
  });

  it('falls back to the default cloneOrderBtn title key when no titleKey override is given', () => {
    renderActions({ clone: true });
    expect(screen.getByTestId('stub-clone')).toHaveAttribute('title', 'cloneOrderBtn');
  });

  it('calls the custom onCloned override instead of the default navigation when provided', async () => {
    const user = userEvent.setup();
    const onCloned = vi.fn();
    renderActions({ clone: { onCloned } });
    await user.click(screen.getByTestId('stub-clone'));
    await user.click(screen.getByTestId('stub-clone-modal-confirm'));
    expect(onCloned).toHaveBeenCalledWith('new-id-1');
    // the modal itself is dismissed after a successful clone
    expect(screen.queryByTestId('stub-clone-modal')).not.toBeInTheDocument();
  });

  // ETP-5260 — this default-navigate branch (no `onCloned` override, no
  // `routePrefix`) is what purchase-order/purchase-invoice/sales-order/
  // sales-quotation all rely on for their "jump straight to the new record"
  // clone UX (mirroring the pre-ETP-5260 inline behaviour each window used to
  // hand-roll). It was previously exercised only per-window (e.g.
  // PurchaseInvoiceTopbar.vitest.jsx's now-removed clone tests) and had no
  // coverage at the shared-component level.
  it('navigates to /{windowName}/{newId} by default when clone.onCloned is not provided', async () => {
    function LocationDisplay() {
      return <div data-testid="location">{useLocation().pathname}</div>;
    }

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/purchase-order/123']}>
        <DocumentSecondaryActions
          recordId="123"
          data={{ id: '123' }}
          windowName="purchase-order"
          apiBaseUrl="/sws/neo/purchase-order"
          token="test-token"
          clone
        />
        <LocationDisplay />
      </MemoryRouter>,
    );

    await user.click(screen.getByTestId('stub-clone'));
    await user.click(screen.getByTestId('stub-clone-modal-confirm'));

    expect(screen.getByTestId('location')).toHaveTextContent('/purchase-order/new-id-1');
    expect(screen.queryByTestId('stub-clone-modal')).not.toBeInTheDocument();
  });
});
