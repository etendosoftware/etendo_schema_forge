import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
