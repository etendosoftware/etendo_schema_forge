// ETP-5034 — the full-pane state shown when a detail route's record cannot be loaded.
//
// The i18n mock returns the key verbatim, so these assertions pin WHICH message the variant
// selects without hardcoding any user-visible English (see CLAUDE.md § i18n).

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecordUnavailable from '../RecordUnavailable.jsx';

describe('RecordUnavailable', () => {
  it('renders the not-found message by default', () => {
    render(<RecordUnavailable />);

    const pane = screen.getByTestId('record-unavailable');
    expect(pane).toBeInTheDocument();
    expect(pane).toHaveAttribute('data-variant', 'notFound');
    expect(screen.getByText('recordNotFoundTitle')).toBeInTheDocument();
    expect(screen.getByText('recordNotFoundBody')).toBeInTheDocument();
    expect(screen.queryByText('recordLoadFailedTitle')).not.toBeInTheDocument();
  });

  it('renders the not-found message for an explicit notFound variant', () => {
    render(<RecordUnavailable variant="notFound" />);

    expect(screen.getByTestId('record-unavailable')).toHaveAttribute('data-variant', 'notFound');
    expect(screen.getByText('recordNotFoundTitle')).toBeInTheDocument();
  });

  it('renders the transport-error message for variant="error"', () => {
    render(<RecordUnavailable variant="error" />);

    expect(screen.getByTestId('record-unavailable')).toHaveAttribute('data-variant', 'error');
    expect(screen.getByText('recordLoadFailedTitle')).toBeInTheDocument();
    expect(screen.getByText('recordLoadFailedBody')).toBeInTheDocument();
    expect(screen.queryByText('recordNotFoundTitle')).not.toBeInTheDocument();
  });

  it('renders the back action when onBack is provided', () => {
    render(<RecordUnavailable onBack={vi.fn()} />);

    const back = screen.getByTestId('record-unavailable-back');
    expect(back).toBeInTheDocument();
    expect(back).toHaveTextContent('backToList');
  });

  it('calls onBack when the back action is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<RecordUnavailable variant="error" onBack={onBack} />);

    await user.click(screen.getByTestId('record-unavailable-back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the back action when no onBack is given', () => {
    render(<RecordUnavailable />);

    expect(screen.queryByTestId('record-unavailable-back')).not.toBeInTheDocument();
  });

  it('tags the icon so a spec can assert the variant visually', () => {
    render(<RecordUnavailable variant="error" />);

    expect(screen.getByTestId('record-unavailable-icon')).toBeInTheDocument();
  });

  // ETP-5034 (review cycle) — `data-testid` is an explicitly declared prop, not rest-spread.
  // It used to be neither: `financial-account/index.jsx` passed data-testid="record-unavailable"
  // and the attribute was dropped on the floor. It only LOOKED harmless because the default
  // happens to be the same string.
  describe('data-testid', () => {
    it('defaults to the stable record-unavailable selector', () => {
      render(<RecordUnavailable />);

      expect(screen.getByTestId('record-unavailable')).toBeInTheDocument();
    });

    it('forwards a caller-supplied value to the root element', () => {
      render(<RecordUnavailable data-testid="account-unavailable" />);

      const pane = screen.getByTestId('account-unavailable');
      expect(pane).toBeInTheDocument();
      expect(pane).toHaveAttribute('data-variant', 'notFound');
      expect(
        screen.queryByTestId('record-unavailable'),
        'a custom id REPLACES the default rather than adding a second root'
      ).not.toBeInTheDocument();
    });

    it('keeps the child test ids stable when the root id is overridden', () => {
      render(<RecordUnavailable data-testid="account-unavailable" onBack={vi.fn()} />);

      expect(screen.getByTestId('record-unavailable-icon')).toBeInTheDocument();
      expect(screen.getByTestId('record-unavailable-back')).toBeInTheDocument();
    });
  });
});
