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

// ── conversion-rate prefill (useConversionRate) ───────────────────────────────
// The modal seeds its editable rate field from the system exchange rate. The hook is
// mocked with a module-level, per-test-configurable value so every scenario can drive
// { rate, hasRate, loading } deterministically without a network round-trip. A test may
// assign a FUNCTION instead of a plain object, in which case it is invoked with the hook
// args ({ fromCode, toCode, ... }) so a scenario can vary the rate per currency pair
// (the ETP-4504 W1 re-seeding regression). Reset in beforeEach.
let mockConversion = { rate: null, hasRate: false, loading: false };
const conversionCalls = [];
vi.mock('../../shared/useConversionRate.js', () => ({
  useConversionRate: (args) => {
    conversionCalls.push(args);
    return typeof mockConversion === 'function' ? mockConversion(args) : mockConversion;
  },
}));

// Render the dialog inline (no portal). Drop onOpenAutoFocus (Radix-only handler).
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children, onOpenAutoFocus, ...p }) => <div {...p}>{children}</div>,
}));

import { formatCurrency } from '@/lib/formatCurrency.js';
import { todayCalendarISO } from '@/lib/dateOnly.js';
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
    // jest-dom's toHaveTextContent normalizes the DOM's own whitespace (its `normalize()`
    // helper collapses \s+, which in JS also matches the U+00A0 non-breaking space that
    // Intl's es-ES currency formatting inserts before the symbol) but does NOT normalize
    // the expected string passed in — so strip the NBSP here to match on the same terms.
    expect(box).toHaveTextContent(formatCurrency('USD', 110).replace(/ /g, ' '));
  });

  it('updates the receive-amount preview reactively when the rate changes afterwards', () => {
    renderModal();
    selectDest('USD');
    fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.1' } });
    const box = screen.getByTestId('transfer-receive-amount');
    expect(box).toHaveTextContent(formatCurrency('USD', 110).replace(/ /g, ' '));

    fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.2' } });
    expect(box).toHaveTextContent(formatCurrency('USD', 120).replace(/ /g, ' '));
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
      // ETP-5100 — the day is now sent explicitly (see the dedicated describe
      // block below for why). This is an exact-shape assertion, so the new key
      // belongs here too.
      transferDate: todayCalendarISO(),
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

  // ── conversion-rate prefill ─────────────────────────────────────────────────
  // The rate field is seeded from the system exchange rate (useConversionRate) and
  // RE-seeded whenever the currency pair changes, while still staying freely editable.
  describe('conversion-rate prefill', () => {
    // Third currency, so a pair change (EUR→USD ⇒ EUR→GBP) can be exercised.
    const GBP = { id: 'GBP', name: 'Barclays', iban: 'GB29', currencyIso: 'GBP', currentBalance: 0, active: true };

    // jest-dom's toHaveTextContent normalizes the DOM's whitespace but not the expected
    // string, so strip the NBSP that Intl inserts before the currency symbol.
    const money = (iso, value) => formatCurrency(iso, value).replace(/\u00a0/g, ' ');

    beforeEach(() => {
      ACCOUNTS = [SRC, DST, USD, GBP];
      mockConversion = { rate: null, hasRate: false, loading: false };
      conversionCalls.length = 0;
    });

    it('does not render the FX block nor prefill any rate for a same-currency destination', () => {
      // A rate is available from the hook; a same-currency transfer must ignore it entirely.
      mockConversion = { rate: 1.1, hasRate: true, loading: false };
      renderModal();
      selectDest('DST');

      expect(screen.queryByTestId('transfer-fx-block')).not.toBeInTheDocument();
      expect(screen.queryByTestId('transfer-rate')).not.toBeInTheDocument();
      expect(screen.queryByTestId('transfer-rate-missing')).not.toBeInTheDocument();
      // No real (differing) pair was ever requested: every call either lacked a
      // destination currency (nothing selected yet) or carried two matching codes.
      expect(conversionCalls.length).toBeGreaterThan(0);
      expect(
        conversionCalls.every((c) => !c.fromCode || !c.toCode || c.fromCode === c.toCode),
      ).toBe(true);
    });

    it('prefills the rate field with the system rate and previews the destination amount', () => {
      mockConversion = { rate: 1.1, hasRate: true, loading: false };
      renderModal();
      selectDest('USD');

      expect(screen.getByTestId('transfer-fx-block')).toBeInTheDocument();
      expect(screen.getByTestId('transfer-rate')).toHaveValue('1.1');
      // No rate on file hint must not appear when a rate was found.
      expect(screen.queryByTestId('transfer-rate-missing')).not.toBeInTheDocument();

      fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
      const box = screen.getByTestId('transfer-receive-amount');
      expect(box).not.toHaveTextContent('—');
      expect(box).toHaveTextContent(money('USD', 110));
    });

    it('keeps a manually typed rate across re-renders that do not change the currency pair', () => {
      mockConversion = { rate: 1.1, hasRate: true, loading: false };
      renderModal();
      selectDest('USD');
      expect(screen.getByTestId('transfer-rate')).toHaveValue('1.1');

      fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.25' } });
      expect(screen.getByTestId('transfer-rate')).toHaveValue('1.25');

      // Any unrelated state change re-renders the modal; the seeding effect must not re-fire.
      fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '200' } });
      fireEvent.change(screen.getByTestId('transfer-description'), { target: { value: 'Manual' } });

      expect(screen.getByTestId('transfer-rate')).toHaveValue('1.25');
      expect(screen.getByTestId('transfer-receive-amount')).toHaveTextContent(money('USD', 250));
    });

    it('re-seeds the field with the new pair rate when the destination currency changes', () => {
      // Rate varies per pair: EUR→USD = 1.1, EUR→GBP = 0.85.
      mockConversion = ({ fromCode, toCode }) => {
        if (fromCode === 'EUR' && toCode === 'USD') return { rate: 1.1, hasRate: true, loading: false };
        if (fromCode === 'EUR' && toCode === 'GBP') return { rate: 0.85, hasRate: true, loading: false };
        return { rate: null, hasRate: false, loading: false };
      };
      renderModal();

      selectDest('USD');
      expect(screen.getByTestId('transfer-rate')).toHaveValue('1.1');

      selectDest('GBP');
      // ETP-4504 W1 regression guard: the previous pair's rate must not survive the switch.
      expect(screen.getByTestId('transfer-rate')).not.toHaveValue('1.1');
      expect(screen.getByTestId('transfer-rate')).toHaveValue('0.85');

      fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
      expect(screen.getByTestId('transfer-receive-amount')).toHaveTextContent(money('GBP', 85));
    });

    it('clears the rate and omits conversionRate from the payload when switching back to a same-currency destination', async () => {
      mockConversion = ({ toCode }) => (toCode === 'USD'
        ? { rate: 1.1, hasRate: true, loading: false }
        : { rate: null, hasRate: false, loading: false });
      renderModal();

      selectDest('USD');
      expect(screen.getByTestId('transfer-rate')).toHaveValue('1.1');

      selectDest('DST');
      expect(screen.queryByTestId('transfer-fx-block')).not.toBeInTheDocument();
      expect(screen.queryByTestId('transfer-rate')).not.toBeInTheDocument();

      fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
      selectGl();
      fireEvent.click(screen.getByTestId('transfer-confirm'));

      await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
      expect(transfer.mock.calls[0][0]).not.toHaveProperty('conversionRate');
      expect(transfer.mock.calls[0][0]).toMatchObject({ destinationAccountId: 'DST' });
    });

    it('leaves the field empty and shows the missing-rate hint when no rate exists for the pair', () => {
      mockConversion = { rate: null, hasRate: false, loading: false };
      renderModal();
      selectDest('USD');

      expect(screen.getByTestId('transfer-rate')).toHaveValue('');
      expect(screen.getByTestId('transfer-rate-missing')).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
      selectGl();
      // A positive rate is still required, so confirm stays blocked until one is typed.
      expect(screen.getByTestId('transfer-confirm')).toBeDisabled();

      fireEvent.change(screen.getByTestId('transfer-rate'), { target: { value: '1.05' } });
      expect(screen.getByTestId('transfer-confirm')).not.toBeDisabled();
    });

    it('does not flash the missing-rate hint while the rate request is still in flight', () => {
      mockConversion = { rate: null, hasRate: false, loading: true };
      renderModal();
      selectDest('USD');

      expect(screen.getByTestId('transfer-fx-block')).toBeInTheDocument();
      expect(screen.getByTestId('transfer-rate')).toHaveValue('');
      expect(screen.queryByTestId('transfer-rate-missing')).not.toBeInTheDocument();
    });

    it('forwards the prefilled rate in the payload when the user never touches the field', async () => {
      mockConversion = { rate: 1.085, hasRate: true, loading: false };
      renderModal();
      selectDest('USD');
      expect(screen.getByTestId('transfer-rate')).toHaveValue('1.085');

      fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
      selectGl();
      fireEvent.click(screen.getByTestId('transfer-confirm'));

      await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
      expect(transfer.mock.calls[0][0]).toMatchObject({
        destinationAccountId: 'USD',
        amount: '100',
        conversionRate: '1.085',
      });
    });
  });

  // ── transferDate (ETP-5100) ──────────────────────────────────────────────
  //
  // The payload now names the day explicitly. Omitting it let Classic date the
  // transfer with `now()`, i.e. a full wall-clock timestamp written into a
  // column the AD declares as type `Date` — the time is not a datum there, and
  // every other flow in this app sends a date-only value.
  //
  // It is not cosmetic. The movements list orders by `statementdate DESC, line
  // DESC`, so a transfer stamped 23:11 sorted ABOVE a manual movement created
  // later the same day at 00:00 — newest-first visibly broke. With every row on
  // a given day tying on `statementdate`, `line DESC` decides and the order
  // holds again. Sending the day also makes the transfer land on the same date
  // the conversion rate was prefilled for, by contract rather than by
  // coincidence: the modal derives both from the same `rateDate`.
  //
  // `todayCalendarISO()` (not `toISOString().slice(0,10)`) is what the modal
  // uses, and what this asserts: west of UTC the UTC-based form returns
  // YESTERDAY from ~21:00 local onward, which would have re-created the very
  // off-by-one day this ticket fixed, on the write path this time.
  describe('transferDate', () => {
    // Sibling of the conversion-rate block, which leaves these module-level
    // values configured; reset them so this block starts from a known state.
    beforeEach(() => {
      mockConversion = { rate: null, hasRate: false, loading: false };
      conversionCalls.length = 0;
    });

    function confirmSameCurrencyTransfer() {
      renderModal();
      selectDest('DST');
      fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
      selectGl();
      fireEvent.click(screen.getByTestId('transfer-confirm'));
    }

    it('sends the local calendar day in the confirm payload', async () => {
      confirmSameCurrencyTransfer();

      await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
      expect(transfer.mock.calls[0][0]).toMatchObject({ transferDate: todayCalendarISO() });
    });

    it('sends a bare yyyy-MM-dd, never a timestamp', async () => {
      // The whole point of the change: no time component may reach a `Date`
      // column. A `T`, a `Z` or an offset here means the wall-clock stamp is
      // back and the list ordering breaks again.
      confirmSameCurrencyTransfer();

      await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
      expect(transfer.mock.calls[0][0].transferDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('sends the same day the conversion rate was prefilled for', async () => {
      // Both derive from the modal's single `rateDate`, so the booking date and
      // the rate date cannot drift apart.
      mockConversion = { rate: 1.1, hasRate: true, loading: false };
      renderModal();
      selectDest('USD');
      fireEvent.change(screen.getByTestId('transfer-amount'), { target: { value: '100' } });
      selectGl();
      fireEvent.click(screen.getByTestId('transfer-confirm'));

      await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
      const rateRequest = conversionCalls.at(-1);
      expect(transfer.mock.calls[0][0].transferDate).toBe(rateRequest.date);
      expect(transfer.mock.calls[0][0].transferDate).toBe(todayCalendarISO());
    });

    it('is unaffected by a host zone behind UTC late in the day', async () => {
      // Regression guard for the UTC-based "today": on UTC-3 at 23:11 local,
      // `new Date().toISOString().slice(0,10)` yields tomorrow's UTC date, and
      // west of UTC in the small hours it yields yesterday's. `todayCalendarISO`
      // reads local getters, so the answer is the local calendar day either way.
      const originalTz = process.env.TZ;
      process.env.TZ = 'America/Argentina/Buenos_Aires';
      try {
        confirmSameCurrencyTransfer();
        await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
        expect(transfer.mock.calls[0][0].transferDate).toBe(todayCalendarISO());
      } finally {
        process.env.TZ = originalTz;
      }
    });
  });
});
