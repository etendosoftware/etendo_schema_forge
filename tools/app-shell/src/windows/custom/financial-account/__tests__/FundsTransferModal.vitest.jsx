import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// i18n → identity so assertions can match on the key.
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

// Accounts list backing the source prefill + destination options.
let ACCOUNTS = [];
vi.mock('@/hooks/useFinancialAccounts.js', () => ({
  useFinancialAccounts: () => ({ accounts: ACCOUNTS }),
}));

const transfer = vi.fn();
let transferring = false;
vi.mock('@/hooks/useCreateMovement', () => ({
  useFundsTransfer: () => ({ transfer, transferring }),
}));

vi.mock('@/hooks/useMovementLookups', () => ({
  useGLItemLookup: () => ({ results: [{ id: 'GL1', name: 'Internal transfers' }], loading: false }),
}));

// Render the dialog inline (no portal). Drop onOpenAutoFocus (Radix-only handler).
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children, onOpenAutoFocus, ...p }) => <div {...p}>{children}</div>,
}));

import { formatCurrency } from '@/lib/formatCurrency.js';
import { FundsTransferModal } from '../FundsTransferModal.jsx';

const SRC = { id: 'SRC', name: 'BBVA', iban: 'ES91', currencyIso: 'EUR', currentBalance: 1000, active: true };
const DST = { id: 'DST', name: 'Santander', iban: 'ES80', currencyIso: 'EUR', currentBalance: 0, active: true };
const USD = { id: 'USD', name: 'Chase', iban: 'US64', currencyIso: 'USD', currentBalance: 0, active: true };

function renderModal(props = {}) {
  return render(
    <FundsTransferModal sourceAccountId="SRC" onClose={vi.fn()} onSuccess={vi.fn()} {...props} />,
  );
}

// Open the dropdown — focus the search input (shown until a value is chosen) or, once a value is
// selected, click its chip to re-enter typing mode — then pick the option.
function selectDest(id) {
  const input = screen.queryByTestId('transfer-dest-search');
  if (input) fireEvent.focus(input);
  else fireEvent.click(screen.getByTestId('transfer-dest-chip'));
  fireEvent.click(screen.getByTestId(`transfer-dest-option-${id}`));
}

// GL item is required; same open-then-pick flow.
function selectGl() {
  const input = screen.queryByTestId('transfer-gl-search');
  if (input) fireEvent.focus(input);
  else fireEvent.click(screen.getByTestId('transfer-gl-chip'));
  fireEvent.click(screen.getByTestId('transfer-gl-option-GL1'));
}

describe('FundsTransferModal', () => {
  beforeEach(() => {
    ACCOUNTS = [SRC, DST, USD];
    transferring = false;
    transfer.mockReset();
    transfer.mockResolvedValue({});
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('prefills the read-only source card with its available balance', () => {
    renderModal();
    expect(screen.getByTestId('funds-transfer-modal')).toBeInTheDocument();
    expect(screen.getByText('BBVA')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-available')).toBeInTheDocument();
  });

  it('does not auto-open the destination dropdown on mount', () => {
    renderModal();
    expect(screen.queryByTestId('transfer-dest-popover')).not.toBeInTheDocument();
  });

  it('offers the other org accounts as destinations (source excluded)', () => {
    renderModal();
    fireEvent.focus(screen.getByTestId('transfer-dest-search'));
    expect(screen.getByTestId('transfer-dest-option-DST')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-dest-option-USD')).toBeInTheDocument();
    expect(screen.queryByTestId('transfer-dest-option-SRC')).not.toBeInTheDocument();
  });

  it('filters the destination list via its search box', () => {
    renderModal();
    fireEvent.focus(screen.getByTestId('transfer-dest-search'));
    fireEvent.change(screen.getByTestId('transfer-dest-search'), { target: { value: 'Chase' } });
    expect(screen.getByTestId('transfer-dest-option-USD')).toBeInTheDocument();
    expect(screen.queryByTestId('transfer-dest-option-DST')).not.toBeInTheDocument();
  });

  it('shows the selected destination as a clearable chip', () => {
    renderModal();
    selectDest('DST');
    expect(screen.getByTestId('transfer-dest-chip')).toBeInTheDocument();
  });

  it('keeps confirm disabled until destination, amount and GL item are set', () => {
    renderModal();
    const confirm = screen.getByTestId('transfer-confirm');
    expect(confirm).toBeDisabled();
    selectDest('DST');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    expect(confirm).toBeDisabled(); // GL item is required
    selectGl();
    expect(confirm).not.toBeDisabled();
  });

  it('reveals both bank-fee fields (source + destination) only when Bank Fee is checked', () => {
    renderModal();
    expect(screen.queryByTestId('transfer-bankfee-from')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transfer-bankfee-to')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('checkbox-transfer-bankfee'));
    expect(screen.getByTestId('transfer-bankfee-from')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-bankfee-to')).toBeInTheDocument();
  });

  it('shows the currency-conversion block only when the destination currency differs', () => {
    renderModal();
    selectDest('DST');
    expect(screen.queryByTestId('transfer-fx-block')).not.toBeInTheDocument();
    selectDest('USD');
    expect(screen.getByTestId('transfer-fx-block')).toBeInTheDocument();
    expect(screen.getByTestId('transfer-rate')).toBeInTheDocument();
  });

  it('no longer renders the removed "Conversión de divisa" (financeAccountTransferFx) label', () => {
    renderModal();
    selectDest('USD');
    expect(screen.getByTestId('transfer-fx-block')).toBeInTheDocument();
    // i18n is mocked as identity ((key) => key), so the removed key would surface verbatim.
    expect(screen.queryByText('financeAccountTransferFx')).not.toBeInTheDocument();
  });

  it('still shows the source/destination currency badges inline with the rate input', () => {
    renderModal();
    selectDest('USD');
    const fxBlock = screen.getByTestId('transfer-fx-block');
    // CurrencyBadge renders the ISO as its text content (no dedicated role/testid reaches the DOM).
    expect(within(fxBlock).getByText('EUR')).toBeInTheDocument();
    expect(within(fxBlock).getByText('USD')).toBeInTheDocument();
    expect(within(fxBlock).getByTestId('transfer-rate')).toBeInTheDocument();
  });

  it('shows the em-dash placeholder in the receive-amount preview until amount and rate are both valid', () => {
    renderModal();
    selectDest('USD');
    const box = screen.getByTestId('transfer-receive-amount');
    expect(box).toHaveTextContent('—');

    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    expect(box).toHaveTextContent('—'); // rate still empty

    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '0' } });
    expect(box).toHaveTextContent('—'); // rate present but not > 0
  });

  it('shows the computed, currency-formatted receive amount once amount and rate are valid', () => {
    renderModal();
    selectDest('USD');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.1' } });
    const box = screen.getByTestId('transfer-receive-amount');
    expect(box).toHaveTextContent(formatCurrency('USD', 110));
  });

  it('updates the receive-amount preview reactively when the rate changes afterwards', () => {
    renderModal();
    selectDest('USD');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.1' } });
    const box = screen.getByTestId('transfer-receive-amount');
    expect(box).toHaveTextContent(formatCurrency('USD', 110));

    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.2' } });
    expect(box).toHaveTextContent(formatCurrency('USD', 120));
  });

  it('does not render the receive-amount preview for a same-currency transfer', () => {
    renderModal();
    selectDest('DST');
    expect(screen.queryByTestId('transfer-fx-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transfer-receive-amount')).not.toBeInTheDocument();
  });

  it('wires the i18n label + formatted value as both title and aria-label on the receive-amount preview', () => {
    renderModal();
    selectDest('USD');
    const box = screen.getByTestId('transfer-receive-amount');
    // Before amount/rate are valid, receiveAmount is null → formatCurrency renders '—'.
    const expectedLabel = `financeAccountTransferReceiveAmount: ${formatCurrency('USD', null)}`;
    expect(box).toHaveAttribute('title', expectedLabel);
    expect(box).toHaveAttribute('aria-label', expectedLabel);
  });

  it('keeps the full untruncated value in title/aria-label even for the truncated receive box', () => {
    renderModal();
    selectDest('USD');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.1' } });
    const box = screen.getByTestId('transfer-receive-amount');
    const expectedLabel = `financeAccountTransferReceiveAmount: ${formatCurrency('USD', 110)}`;
    expect(box).toHaveAttribute('title', expectedLabel);
    expect(box).toHaveAttribute('aria-label', expectedLabel);
  });

  it('shares the row equally with the rate input (flex-1) and still clips overflow instead of growing the modal', () => {
    renderModal();
    selectDest('USD');
    const box = screen.getByTestId('transfer-receive-amount');
    expect(box.className).toContain('min-w-0');
    expect(box.className).toContain('flex-1');
    expect(box.className).toContain('overflow-hidden');
    // 50/50 sizing regression guard: the rate input beside it must carry the same
    // flex-basis classes so the row stays evenly split instead of one side dominating.
    const rateInput = screen.getByTestId('transfer-rate');
    expect(rateInput.className).toContain('min-w-0');
    expect(rateInput.className).toContain('flex-1');
  });

  it('does not crash and still exposes the full value via title for an extremely large amount', () => {
    renderModal();
    selectDest('USD');
    fireEvent.change(screen.getByTestId('transfer-amount'), {
      target: { value: '50000000000000000000000000' },
    });
    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.1' } });

    const box = screen.getByTestId('transfer-receive-amount');
    expect(box).toBeInTheDocument();

    const hugeReceiveAmount = 50000000000000000000000000 * 1.1;
    const expectedLabel = `financeAccountTransferReceiveAmount: ${formatCurrency('USD', hugeReceiveAmount)}`;
    expect(box).toHaveAttribute('title', expectedLabel);
    expect(box).toHaveAttribute('aria-label', expectedLabel);
    // The box itself must still carry the min-w-0/overflow-hidden classes that clip the
    // visible text — the huge value must not be allowed to expand the box (and modal) width,
    // even though its allotted width is now an equal flex-1 share instead of a small fixed chip.
    expect(box.className).toContain('min-w-0');
    expect(box.className).toContain('overflow-hidden');
  });

  it('the modal body wrapper has min-w-0 so it cannot force the dialog wider than its own max-width (grid-item overflow guard)', () => {
    // Regression guard for a real, reproduced-in-browser bug: DialogContent renders as
    // `display: grid` (Radix primitive), which makes its direct child — this body wrapper —
    // a grid item. Grid items default to `min-width: auto`, meaning they refuse to shrink
    // below their content's min-content width. A long value deep inside (e.g. the
    // receive-amount preview with a huge typed amount, covered above) can then inflate this
    // whole wrapper past the dialog's own `max-w-[600px]`, and only the dialog's rightmost
    // sliver gets visually clipped — cropping every row uniformly ("Disponible" → "Dispon...",
    // "GBP" → "GB", "Transferir" → "Transfe", etc.), even though the inner box already had its
    // own overflow-hidden/truncate guard. jsdom does not compute real CSS box layout, so this
    // cannot reproduce the visual overflow itself — it asserts the structural guard (`min-w-0`
    // on this wrapper) that prevents it. Do not remove this class from the wrapper.
    renderModal();
    const modal = screen.getByTestId('funds-transfer-modal');
    const bodyWrapper = modal.children[1];
    // Sanity check we grabbed the body wrapper (not the header or footer) before asserting on it.
    expect(within(bodyWrapper).getByTestId('transfer-amount')).toBeInTheDocument();
    expect(bodyWrapper.className).toContain('min-w-0');
  });

  it('allows a transfer above the source balance (Classic permits overdrawing)', () => {
    renderModal();
    selectDest('DST');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '5000' } });
    selectGl();
    expect(screen.queryByTestId('transfer-balance-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('transfer-confirm')).not.toBeDisabled();
  });

  it('posts the expected payload and reports success on confirm', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    renderModal({ onClose, onSuccess });
    selectDest('DST');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    selectGl();
    fireEvent.click(screen.getByTestId('transfer-confirm'));

    await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
    expect(transfer).toHaveBeenCalledWith({
      sourceAccountId: 'SRC',
      destinationAccountId: 'DST',
      amount: '100',
      description: 'financeAccountTransferDescriptionDefault',
      bankFee: false,
      glItemId: 'GL1',
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('forwards the conversion rate on a multi-currency transfer', async () => {
    renderModal();
    selectDest('USD');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.1' } });
    selectGl();
    fireEvent.click(screen.getByTestId('transfer-confirm'));

    await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
    expect(transfer.mock.calls[0][0]).toMatchObject({
      destinationAccountId: 'USD',
      amount: '100',
      conversionRate: '1.1',
    });
  });

  it('forwards both bank fees (source + destination) when Bank Fee is checked', async () => {
    renderModal();
    selectDest('DST');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    selectGl();
    fireEvent.click(screen.getByTestId('checkbox-transfer-bankfee'));
    fireEvent.change(screen.getByTestId('transfer-bankfee-from'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('transfer-bankfee-to'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('transfer-confirm'));

    await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
    expect(transfer.mock.calls[0][0]).toMatchObject({
      bankFee: true,
      bankFeeFrom: '5',
      bankFeeTo: '3',
    });
  });
});
