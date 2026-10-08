// @covers tools/app-shell/src/components/contract-ui/useReconciliationConversion.js
// @covers tools/app-shell/src/components/contract-ui/ReconciliationConversionSection.jsx
//
// The bank-rate conversion block of the reconciliation payment-method modal, in isolation from
// ReconciliationSplitPanel: the hook (state on top of recomputed defaults, the footer's
// exchange-difference notice, payload fields, resets) through renderHook, and the section it feeds
// through a small harness that wires the two together exactly as PaymentMethodModal does. The REAL
// MaskedAmountInput is used, so the (clean, parsed) contract between the input and the hook
// handlers is exercised, not assumed.
//
// The panel-level wiring (modal open rules, picker hidden, payload, footer, write-off exclusion)
// lives in ReconciliationSplitPanel.multiCurrency.vitest.jsx.
//
// Reference scenario (docs/generated-custom-windows/financial-account.md, "Bank-rate conversion
// block"): EUR account, 27,87 € line, one USD invoice with 40,91 USD outstanding at ≈ 0,680286.

// Echoes the key and serializes the interpolation vars, so the amounts the call site passed are
// assertable without hardcoding any locale copy.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    if (!vars) return key;
    const rendered = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(' ');
    return `${key} [${rendered}]`;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReconciliationConversion } from '@/components/contract-ui/useReconciliationConversion.js';
import { ReconciliationConversionSection } from '@/components/contract-ui/ReconciliationConversionSection.jsx';
import { formatCurrency, formatPlainDecimal } from '@/lib/formatCurrency';

// ── Fixtures ────────────────────────────────────────────────────────────────────

const CAND_USD = {
  id: 'C-USD', kind: 'invoice', currency: 'USD', invoiceId: 'inv-1', scheduleId: 'sch-1',
  amount: 40.91, pendingBalance: 40.91, amountBase: 27.83, baseCurrency: 'EUR', rate: 0.680286,
};
const CAND_EUR = {
  id: 'C-EUR', kind: 'invoice', currency: 'EUR', invoiceId: 'inv-2', scheduleId: 'sch-2',
  amount: 20, pendingBalance: 20,
};
// An existing-transaction candidate: never part of the conversion, whatever its currency.
const CAND_TX = { id: 'TX1', currency: 'USD', amount: 5, pendingBalance: 5, rate: 0.68 };
// The greedy-reset probe: two USD invoices at different own rates against a 10 € line.
const PROBE_A = {
  id: 'A', kind: 'invoice', currency: 'USD', invoiceId: 'inv-a', scheduleId: 'sch-a',
  amount: 10, pendingBalance: 10, amountBase: 6, rate: 0.6,
};
const PROBE_B = {
  id: 'B', kind: 'invoice', currency: 'USD', invoiceId: 'inv-b', scheduleId: 'sch-b',
  amount: 10, pendingBalance: 10, amountBase: 8, rate: 0.8,
};

/** Hook arguments for the reference scenario. */
function args(overrides = {}) {
  return {
    invoiceMode: true,
    isReconciledLine: false,
    candidates: [CAND_USD],
    selectedOpIds: new Set(['C-USD']),
    accountCurrency: 'EUR',
    lineAmount: 27.87,
    windowReadOnly: false,
    ...overrides,
  };
}

function renderConversion(overrides = {}) {
  return renderHook((props) => useReconciliationConversion(props), {
    initialProps: args(overrides),
  });
}

const DEFAULT_PAYLOAD = {
  actualPayment: '40.91', conversionRate: '0.681252', convertedAmount: '27.87',
};

/** The footer notice as the echoing i18n mock renders it: named gain/loss, unsigned EUR amount. */
const gainNotice = (amount) =>
  `financeReconcileBarFxGainAtBankRate [amount=${formatCurrency('EUR', amount)}]`;
const lossNotice = (amount) =>
  `financeReconcileBarFxLossAtBankRate [amount=${formatCurrency('EUR', amount)}]`;

// ── Hook ────────────────────────────────────────────────────────────────────────

describe('useReconciliationConversion', () => {
  describe('when the conversion does not apply', () => {
    it('sends no conversion fields and announces nothing for a mixed selection', () => {
      const { result } = renderConversion({
        candidates: [CAND_USD, CAND_EUR],
        selectedOpIds: new Set(['C-USD', 'C-EUR']),
      });
      expect(result.current.eligible).toBe(false);
      expect(result.current.active).toBe(false);
      expect(result.current.valid).toBe(true);
      expect(result.current.payloadFields).toBeNull();
      // The footer keeps the panel's own totals: the hook only ever contributes the notice.
      expect(result.current.footer).toEqual({ fxNotice: null });
    });

    it('stays off for a same-currency selection', () => {
      const { result } = renderConversion({
        candidates: [CAND_EUR], selectedOpIds: new Set(['C-EUR']),
      });
      expect(result.current.eligible).toBe(false);
      expect(result.current.fields.invoiceCurrency).toBeNull();
    });

    it('stays off outside invoice mode and on a reconciled line', () => {
      expect(renderConversion({ invoiceMode: false }).result.current.eligible).toBe(false);
      expect(renderConversion({ isReconciledLine: true }).result.current.eligible).toBe(false);
    });

    it('is eligible but inactive when the selected invoice has nothing outstanding', () => {
      const { result } = renderConversion({
        candidates: [{ ...CAND_USD, pendingBalance: 0, amount: 0 }],
      });
      expect(result.current.eligible).toBe(true);
      expect(result.current.active).toBe(false);
      // An inactive conversion never blocks the confirm, never reaches the payload, never notifies.
      expect(result.current.valid).toBe(true);
      expect(result.current.payloadFields).toBeNull();
      expect(result.current.footer.fxNotice).toBeNull();
    });

    it('ignores selected candidates that are not invoices', () => {
      const { result } = renderConversion({
        candidates: [CAND_TX], selectedOpIds: new Set(['TX1']),
      });
      expect(result.current.eligible).toBe(false);
    });

    it('stays off while the candidates have not loaded or the line has no amount', () => {
      expect(renderConversion({ candidates: undefined }).result.current.eligible).toBe(false);
      const noLine = renderConversion({ lineAmount: undefined }).result.current;
      expect(noLine.eligible).toBe(false);
      expect(noLine.fields.statementAmount).toBe(0);
    });
  });

  describe('defaults (Classic parity)', () => {
    it('pays everything outstanding, books the statement amount and derives the rate', () => {
      const { result } = renderConversion();
      const { fields } = result.current;
      expect(result.current.eligible).toBe(true);
      expect(result.current.active).toBe(true);
      expect(result.current.valid).toBe(true);
      expect(fields).toMatchObject({
        isReceipt: true,
        invoiceCurrency: 'USD',
        accountCurrency: 'EUR',
        statementAmount: 27.87,
        outstanding: 40.91,
        actual: 40.91,
        rate: 0.681252,
        converted: 27.87,
        remainder: 0,
        errors: { actual: false, rate: false, converted: false },
      });
      // Classic parity: no deviation, reference rate or gain/loss figure in the modal.
      for (const removed of ['deviation', 'reference', 'fxDifference', 'fxOutcome']) {
        expect(fields).not.toHaveProperty(removed);
      }
      expect(result.current.payloadFields).toEqual(DEFAULT_PAYLOAD);
    });
  });

  // The footer keeps the panel's invoice-rate totals; the hook only adds what reconciling at the
  // bank rate WOULD book with the default figures (|line pending| − Σ invoice-rate value), named as
  // the gain or loss it is for the line's direction, with an unsigned amount.
  describe('footer exchange-difference notice', () => {
    it('announces the 0,04 € GAIN the default conversion would book on a receipt', () => {
      const { result } = renderConversion();
      expect(result.current.footer).toEqual({ fxNotice: gainNotice(0.04) });
    });

    it('names the same +0,04 € a LOSS on a payment line, and sends unsigned figures', () => {
      const { result } = renderConversion({
        lineAmount: -27.87,
        candidates: [{ ...CAND_USD, amount: -40.91, pendingBalance: -40.91, amountBase: -27.83 }],
      });
      expect(result.current.fields.isReceipt).toBe(false);
      expect(result.current.footer.fxNotice).toBe(lossNotice(0.04));
      expect(result.current.payloadFields).toEqual(DEFAULT_PAYLOAD);
    });

    it('names a negative difference on a payment line a GAIN (the bank took less)', () => {
      // 27,80 € paid for invoices worth 27,83 € at their own rate.
      const { result } = renderConversion({
        lineAmount: -27.8,
        candidates: [{ ...CAND_USD, amount: -40.91, pendingBalance: -40.91, amountBase: -27.83 }],
      });
      expect(result.current.footer.fxNotice).toBe(gainNotice(0.03));
    });

    it('shows the large figure of a gross mismatch before the modal is opened (10 USD vs 1.000 €)', () => {
      const { result } = renderConversion({
        lineAmount: 1000,
        candidates: [{ ...CAND_USD, amount: 10, pendingBalance: 10, amountBase: 9, rate: 0.9 }],
      });
      // 1.000 € collected against 10 USD worth 9 € at the invoice rate.
      expect(result.current.footer.fxNotice).toBe(gainNotice(991));
    });

    it('names a negative difference on a receipt a LOSS (probe A + B against a 10 € line)', () => {
      // Defaults pay all 20 USD (6 € + 8 € at the invoices' rates) for the 10 € the bank sent.
      const { result } = renderConversion({
        lineAmount: 10, candidates: [PROBE_A, PROBE_B], selectedOpIds: new Set(['A', 'B']),
      });
      expect(result.current.footer.fxNotice).toBe(lossNotice(4));
    });

    it('shows nothing when the gap is negligible', () => {
      // At 0,681252 the invoice is worth exactly what the bank sent.
      const { result } = renderConversion({ candidates: [{ ...CAND_USD, rate: 0.681252 }] });
      expect(result.current.footer.fxNotice).toBeNull();
      expect(result.current.payloadFields).toEqual(DEFAULT_PAYLOAD);
    });

    it('shows nothing when a candidate lacks its rate, and still sends the three fields', () => {
      const { result } = renderConversion({ candidates: [{ ...CAND_USD, rate: undefined }] });
      expect(result.current.active).toBe(true);
      expect(result.current.footer.fxNotice).toBeNull();
      expect(result.current.payloadFields).toEqual(DEFAULT_PAYLOAD);
    });

    it('shows nothing when only one of several selected invoices lacks its rate', () => {
      const { result } = renderConversion({
        lineAmount: 10,
        candidates: [PROBE_A, { ...PROBE_B, rate: undefined }],
        selectedOpIds: new Set(['A', 'B']),
      });
      expect(result.current.active).toBe(true);
      expect(result.current.footer.fxNotice).toBeNull();
    });

    // A rate of 0 (or negative) is an unknown rate, not a free invoice: measured against it the
    // whole line would read as an exchange gain.
    for (const rate of [0, -1]) {
      it(`treats a candidate rate of ${rate} as unknown: no notice, payload intact`, () => {
        const { result } = renderConversion({ candidates: [{ ...CAND_USD, rate }] });
        expect(result.current.active).toBe(true);
        expect(result.current.footer.fxNotice).toBeNull();
        expect(result.current.valid).toBe(true);
        // The conversion itself does not depend on the invoice rate: the three fields still go.
        expect(result.current.payloadFields).toEqual(DEFAULT_PAYLOAD);
      });
    }

    it('never follows the modal edits', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onActualChange('21.34', 21.34));
      expect(result.current.footer.fxNotice).toBe(gainNotice(0.04));
      act(() => result.current.handlers.onConvertedChange('27', 27));
      expect(result.current.footer.fxNotice).toBe(gainNotice(0.04));
      act(() => result.current.handlers.onRateChange('0.5', 0.5));
      expect(result.current.footer.fxNotice).toBe(gainNotice(0.04));
    });
  });

  describe('edits', () => {
    it('editing the amount keeps the converted amount pinned and re-derives the rate', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onActualChange('21.34', 21.34));
      expect(result.current.fields.actual).toBe(21.34);
      expect(result.current.fields.converted).toBe(27.87);
      expect(result.current.fields.rate).toBe(1.305998);
      expect(result.current.payloadFields).toEqual({
        actualPayment: '21.34', conversionRate: '1.305998', convertedAmount: '27.87',
      });
    });

    it('rounds a typed amount HALF_UP to cents before deriving anything (40,905 → 40,91)', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onActualChange('40.905', 40.905));
      expect(result.current.fields.actual).toBe(40.91);
      expect(result.current.fields.rate).toBe(0.681252);
      expect(result.current.payloadFields.actualPayment).toBe('40.91');
    });

    it('editing the rate exposes the typed text and sends it verbatim', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onRateChange('0.68125', 0.68125));
      expect(result.current.fields.rate).toBe('0.68125');
      expect(result.current.fields.converted).toBe(27.87);
      expect(result.current.payloadFields.conversionRate).toBe('0.68125');
    });

    it('editing the converted amount re-derives the rate and leaves a remainder', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onConvertedChange('27', 27));
      expect(result.current.fields.rate).toBe(0.659985);
      expect(result.current.fields.remainder).toBe(0.87);
    });

    it('a converted amount over the line is invalid', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onConvertedChange('27.88', 27.88));
      expect(result.current.valid).toBe(false);
      expect(result.current.fields.errors.converted).toBe(true);
    });

    it('a cleared converted amount is invalid on its own field only, and leaves no remainder', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onConvertedChange('', null));
      expect(result.current.valid).toBe(false);
      expect(result.current.fields.errors).toEqual({ actual: false, rate: false, converted: true });
      expect(result.current.fields.actual).toBe(40.91);
      expect(result.current.fields.rate).toBe(0.681252);
      expect(result.current.fields.remainder).toBe(0);
    });

    it('a negative amount keeps the other figures and hides the remainder', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onConvertedChange('27', 27));
      expect(result.current.fields.remainder).toBe(0.87);

      act(() => result.current.handlers.onActualChange('-5', -5));
      expect(result.current.fields).toMatchObject({
        actual: -5, rate: 0.659985, converted: 27,
        errors: { actual: true, rate: false, converted: false },
        remainder: 0,
      });
      // The footer notice comes from the defaults, so an invalid form does not touch it.
      expect(result.current.footer.fxNotice).toBe(gainNotice(0.04));
    });

    it('a zero rate keeps the other figures and hides the remainder', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onConvertedChange('27', 27));
      act(() => result.current.handlers.onRateChange('0', 0));
      expect(result.current.fields).toMatchObject({
        actual: 40.91, rate: '0', converted: 27,
        errors: { actual: false, rate: true, converted: false },
        remainder: 0,
      });
      // The converted amount is the anchor meanwhile: the next amount re-derives the rate from it.
      act(() => result.current.handlers.onActualChange('21.34', 21.34));
      expect(result.current.fields.rate).toBe(1.26523);
      expect(result.current.valid).toBe(true);
    });

    it('a rate of 1 is accepted: a pegged pair confirms with converted == amount', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onRateChange('1', 1));
      expect(result.current.fields.errors.rate).toBe(false);
      // 40,91 × 1 exceeds the 27,87 € line — that is the converted field's error, not the rate's.
      expect(result.current.fields.errors.converted).toBe(true);
      act(() => result.current.handlers.onActualChange('27.87', 27.87));
      expect(result.current.valid).toBe(true);
      expect(result.current.payloadFields).toEqual({
        actualPayment: '27.87', conversionRate: '1', convertedAmount: '27.87',
      });
    });

    it('reset() drops every edit and goes back to the defaults', () => {
      const { result } = renderConversion();
      act(() => result.current.handlers.onActualChange('21.34', 21.34));
      act(() => result.current.reset());
      expect(result.current.fields.actual).toBe(40.91);
      expect(result.current.fields.rate).toBe(0.681252);
      expect(result.current.payloadFields).toEqual(DEFAULT_PAYLOAD);
    });
  });

  describe('read-only access tier', () => {
    it('drops the edits when the tier switches on, and they do not come back when it lifts', () => {
      const { result, rerender } = renderConversion();
      act(() => result.current.handlers.onActualChange('21.34', 21.34));
      expect(result.current.fields.actual).toBe(21.34);

      rerender(args({ windowReadOnly: true }));
      expect(result.current.fields.actual).toBe(40.91);
      expect(result.current.payloadFields).toEqual(DEFAULT_PAYLOAD);

      rerender(args({ windowReadOnly: false }));
      expect(result.current.fields.actual).toBe(40.91);
    });

    it('keeps the edits across re-renders while the tier does not change', () => {
      const { result, rerender } = renderConversion();
      act(() => result.current.handlers.onActualChange('21.34', 21.34));
      rerender(args());
      expect(result.current.fields.actual).toBe(21.34);
    });
  });

  describe('edits are tied to the selection they were made for', () => {
    it('keeps an edit across a re-render with an equivalent selection', () => {
      const { result, rerender } = renderConversion();
      act(() => result.current.handlers.onActualChange('21.34', 21.34));
      // New array / set identities, same line, ids and outstanding amounts.
      rerender(args({ candidates: [{ ...CAND_USD }], selectedOpIds: new Set(['C-USD']) }));
      expect(result.current.fields.actual).toBe(21.34);
    });

    it('falls back to fresh defaults when the outstanding amount changes', () => {
      const { result, rerender } = renderConversion();
      act(() => result.current.handlers.onActualChange('21.34', 21.34));
      rerender(args({ candidates: [{ ...CAND_USD, amount: 30, pendingBalance: 30 }] }));
      expect(result.current.fields.actual).toBe(30);
      expect(result.current.fields.converted).toBe(27.87);
    });

    it('falls back to fresh defaults on another line amount', () => {
      const { result, rerender } = renderConversion();
      act(() => result.current.handlers.onConvertedChange('20', 20));
      rerender(args({ lineAmount: 25 }));
      expect(result.current.fields.converted).toBe(25);
      expect(result.current.fields.actual).toBe(40.91);
    });

    it('an edit after a selection change starts from the new defaults', () => {
      const { result, rerender } = renderConversion();
      act(() => result.current.handlers.onConvertedChange('20', 20));
      rerender(args({ lineAmount: 25 }));
      act(() => result.current.handlers.onActualChange('20', 20));
      // Converted pinned to the NEW line (25), not to the stale 20.
      expect(result.current.fields.converted).toBe(25);
      expect(result.current.fields.rate).toBe(1.25);
    });
  });
});

// ── Section ─────────────────────────────────────────────────────────────────────

/** Wires the hook into the section exactly as PaymentMethodModal does. */
function Harness(props) {
  const conversion = useReconciliationConversion(props);
  return (
    <>
      <ReconciliationConversionSection conversion={conversion} />
      <output data-testid="harness-payload">{JSON.stringify(conversion.payloadFields)}</output>
      <output data-testid="harness-valid">{String(conversion.valid)}</output>
    </>
  );
}

function renderSection(overrides = {}) {
  return render(<Harness {...args(overrides)} />);
}

/** toHaveTextContent normalizes the element's whitespace (the NBSP before €), not the expectation. */
const ws = (text) => text.replace(/\s+/g, ' ');
const input = (id) => screen.getByTestId(`recon-conversion-${id}-input`);
const payload = () => JSON.parse(screen.getByTestId('harness-payload').textContent);
/** What PaymentMethodModal reads to enable Confirmar. */
const valid = () => screen.getByTestId('harness-valid').textContent === 'true';

/**
 * Classic parity: the section offers no advisory about the chosen rate — no action of any kind, no
 * alert. Only the statement, the three fields and (when relevant) the remainder hint.
 */
function expectNoAdvisory() {
  const section = screen.getByTestId('recon-conversion-section');
  expect(within(section).queryByRole('button')).not.toBeInTheDocument();
  expect(within(section).queryByRole('alert')).not.toBeInTheDocument();
}

/**
 * Classic parity: the modal shows no invoice reference rate and no gain/loss row — that cue lives
 * only in the panel footer's notice.
 */
function expectNoReferenceBlock() {
  for (const id of ['recon-conversion-reference', 'recon-conversion-reference-rate',
    'recon-conversion-fx-difference']) {
    expect(screen.queryByTestId(id)).not.toBeInTheDocument();
  }
}

describe('ReconciliationConversionSection', () => {
  it('renders nothing when the conversion does not apply', () => {
    renderSection({ candidates: [CAND_EUR], selectedOpIds: new Set(['C-EUR']) });
    expect(screen.queryByTestId('recon-conversion-section')).not.toBeInTheDocument();
    expect(payload()).toBeNull();
  });

  it('renders nothing without a conversion object', () => {
    render(<ReconciliationConversionSection conversion={null} />);
    expect(screen.queryByTestId('recon-conversion-section')).not.toBeInTheDocument();
  });

  it('shows the statement amount as a disabled field, and the three prefilled figures', () => {
    renderSection();
    const statement = screen.getByTestId('recon-conversion-statement');
    expect(statement.tagName).toBe('INPUT');
    expect(statement).toHaveValue(formatCurrency(undefined, 27.87));
    expect(statement).toBeDisabled();
    expect(screen.getByText('financeReconcileConversionStatement [currency=EUR]')).toBeInTheDocument();
    expect(input('actual')).toHaveValue(formatCurrency(undefined, 40.91));
    expect(input('rate')).toHaveValue(formatPlainDecimal(0.681252));
    expect(input('converted')).toHaveValue(formatCurrency(undefined, 27.87));
  });

  it('labels the amount "to collect" on a receipt, with both currencies on the rate', () => {
    renderSection();
    expect(screen.getByText('financeReconcileConversionActualReceipt [currency=USD]')).toBeInTheDocument();
    expect(screen.getByText('financeReconcileConversionRate [from=USD to=EUR]')).toBeInTheDocument();
    expect(screen.getByText('financeReconcileConversionConverted [currency=EUR]')).toBeInTheDocument();
  });

  it('shows the unsigned pending amount in the statement field on a payment line', () => {
    renderSection({
      lineAmount: -27.87,
      candidates: [{ ...CAND_USD, amount: -40.91, pendingBalance: -40.91 }],
    });
    expect(screen.getByTestId('recon-conversion-statement')).toHaveValue(formatCurrency(undefined, 27.87));
    expect(screen.getByTestId('recon-conversion-statement')).toBeDisabled();
  });

  it('shows the pending remainder, not the full line, for a PARTIAL line', () => {
    // The panel passes the PARTIAL line's pending amount (12,50 of a 100 € line) as lineAmount.
    renderSection({ lineAmount: 12.5 });
    expect(screen.getByTestId('recon-conversion-statement')).toHaveValue(formatCurrency(undefined, 12.5));
    expect(input('converted')).toHaveValue(formatCurrency(undefined, 12.5));
  });

  it('labels the amount "to pay" on a payment line', () => {
    renderSection({
      lineAmount: -27.87,
      candidates: [{ ...CAND_USD, amount: -40.91, pendingBalance: -40.91 }],
    });
    expect(screen.getByText('financeReconcileConversionActualPayment [currency=USD]')).toBeInTheDocument();
    expect(screen.queryByText(/financeReconcileConversionActualReceipt/)).not.toBeInTheDocument();
  });

  // Whatever the candidates' own rates — gain, loss, negligible, missing or 0 — the modal never
  // renders a reference rate or a gain/loss row.
  for (const [label, overrides] of [
    ['a receipt gain', {}],
    ['a payment loss', { lineAmount: -27.87, candidates: [{ ...CAND_USD, amount: -40.91, pendingBalance: -40.91 }] }],
    ['a negligible difference', { candidates: [{ ...CAND_USD, rate: 0.681252 }] }],
    ['a missing invoice rate', { candidates: [{ ...CAND_USD, rate: undefined }] }],
    ['an invoice rate of 0', { candidates: [{ ...CAND_USD, rate: 0 }] }],
  ]) {
    it(`renders no reference rate and no gain/loss row for ${label}`, () => {
      renderSection(overrides);
      expect(screen.getByTestId('recon-conversion-section')).toBeInTheDocument();
      expectNoReferenceBlock();
      expect(screen.queryByText(/financeReconcileConversion(FxGain|FxLoss|ReferenceRate)/)).not.toBeInTheDocument();
    });
  }

  it('still sends the three fields for a candidate rate of 0, before and after an edit', () => {
    renderSection({ candidates: [{ ...CAND_USD, rate: 0 }] });
    expect(input('rate')).toHaveValue(formatPlainDecimal(0.681252));
    expect(valid()).toBe(true);
    expect(payload()).toEqual(DEFAULT_PAYLOAD);

    fireEvent.change(input('actual'), { target: { value: '21,34' } });
    expectNoReferenceBlock();
    expect(payload()).toEqual({
      actualPayment: '21.34', conversionRate: '1.305998', convertedAmount: '27.87',
    });
  });

  it('a partial payment re-derives the rate; a ~92 % gap from the invoice rate raises no warning', () => {
    renderSection();
    fireEvent.change(input('actual'), { target: { value: '21,34' } });

    expect(input('rate')).toHaveValue(formatPlainDecimal(1.305998));
    expect(input('converted')).toHaveValue(formatCurrency(undefined, 27.87));
    expectNoReferenceBlock();
    expectNoAdvisory();
    expect(valid()).toBe(true);
    expect(payload()).toEqual({
      actualPayment: '21.34', conversionRate: '1.305998', convertedAmount: '27.87',
    });
  });

  it('a large deviation (27,75 € line vs 78,26 USD) shows no warning and stays confirmable (Classic parity)', () => {
    // 27,75 / 78,26 = 0,354587 against an invoice rate of 0,680286.
    renderSection({
      lineAmount: 27.75,
      candidates: [{ ...CAND_USD, amount: 78.26, pendingBalance: 78.26, amountBase: 53.24 }],
    });
    expect(input('rate')).toHaveValue(formatPlainDecimal(0.354587));
    // Nothing compares it with the invoice rate inside the modal.
    expectNoReferenceBlock();
    expectNoAdvisory();
    expect(valid()).toBe(true);
    expect(payload()).toEqual({
      actualPayment: '78.26', conversionRate: '0.354587', convertedAmount: '27.75',
    });
  });

  it('rounds a typed amount to cents: 40,905 is shown, derived and sent as 40,91', () => {
    renderSection();
    fireEvent.change(input('actual'), { target: { value: '21' } });
    fireEvent.change(input('actual'), { target: { value: '40,905' } });
    expect(input('actual')).toHaveValue(formatCurrency(undefined, 40.91));
    expect(input('rate')).toHaveValue(formatPlainDecimal(0.681252));
    expect(payload().actualPayment).toBe('40.91');
  });

  it('keeps a rate typed with a decimal comma as typed and sends it dot-decimal', () => {
    renderSection();
    fireEvent.change(input('rate'), { target: { value: '0,68125' } });
    expect(input('rate')).toHaveValue('0,68125');
    expect(payload().conversionRate).toBe('0.68125');
    expect(payload().convertedAmount).toBe('27.87');
  });

  it('flags an amount above the outstanding total, naming the maximum', () => {
    renderSection();
    fireEvent.change(input('actual'), { target: { value: '50' } });
    expect(screen.getByTestId('recon-conversion-actual-error')).toHaveTextContent(ws(
      `financeReconcileConversionActualError [max=${formatCurrency('USD', 40.91)}]`));
    expect(screen.getByTestId('recon-conversion-actual-error')).toHaveAttribute('role', 'alert');
  });

  it('accepts a rate of 1: a pegged pair confirms as typed', () => {
    renderSection();
    fireEvent.change(input('rate'), { target: { value: '1' } });
    expect(screen.queryByTestId('recon-conversion-rate-error')).not.toBeInTheDocument();
    // 40,91 × 1 is over the line — the converted field says so, not the rate.
    expect(screen.getByTestId('recon-conversion-converted-error')).toBeInTheDocument();

    fireEvent.change(input('actual'), { target: { value: '27,87' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(payload()).toEqual({
      actualPayment: '27.87', conversionRate: '1', convertedAmount: '27.87',
    });
  });

  it('flags a rate of 0', () => {
    renderSection();
    fireEvent.change(input('rate'), { target: { value: '0' } });
    expect(screen.getByTestId('recon-conversion-rate-error'))
      .toHaveTextContent('financeReconcileConversionRateError');
  });

  it('flags a converted amount one cent over the line, naming the statement amount', () => {
    renderSection();
    fireEvent.change(input('converted'), { target: { value: '27,88' } });
    expect(screen.getByTestId('recon-conversion-converted-error')).toHaveTextContent(ws(
      `financeReconcileConversionConvertedError [max=${formatCurrency('EUR', 27.87)}]`));
    expect(screen.queryByTestId('recon-conversion-actual-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recon-conversion-rate-error')).not.toBeInTheDocument();
  });

  // A blank / zero / negative value in ONE field only changes that field: the other two keep their
  // figures and stay error-free, and the next valid edit derives from the anchor as usual.
  describe('an unusable value leaves the other two fields alone', () => {
    const DEFAULT_DISPLAY = {
      actual: formatCurrency(undefined, 40.91),
      rate: formatPlainDecimal(0.681252),
      converted: formatCurrency(undefined, 27.87),
    };

    /** Only `field` is in error; the other two show their default figures. */
    function expectOnlyInError(field) {
      expect(screen.getByTestId(`recon-conversion-${field}-error`)).toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      for (const other of ['actual', 'rate', 'converted'].filter((f) => f !== field)) {
        expect(input(other)).toHaveValue(DEFAULT_DISPLAY[other]);
      }
      // A remainder derived from an invalid form is hidden.
      expect(screen.queryByTestId('recon-conversion-remainder')).not.toBeInTheDocument();
    }

    for (const typed of ['', '0', '-5']) {
      it(`amount "${typed}": rate and converted untouched; the next amount re-derives the rate`, () => {
        renderSection();
        fireEvent.change(input('actual'), { target: { value: typed } });
        expectOnlyInError('actual');

        // Converted anchor kept: 27,87 / 21,34.
        fireEvent.change(input('actual'), { target: { value: '21,34' } });
        expect(input('rate')).toHaveValue(formatPlainDecimal(1.305998));
        expect(input('converted')).toHaveValue(DEFAULT_DISPLAY.converted);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    }

    for (const typed of ['', '0', '-0,5']) {
      it(`rate "${typed}": amount and converted untouched; the next amount re-derives the rate`, () => {
        renderSection();
        fireEvent.change(input('rate'), { target: { value: typed } });
        expectOnlyInError('rate');

        // The converted amount is the anchor meanwhile: 27,87 / 21,34.
        fireEvent.change(input('actual'), { target: { value: '21,34' } });
        expect(input('rate')).toHaveValue(formatPlainDecimal(1.305998));
        expect(input('converted')).toHaveValue(DEFAULT_DISPLAY.converted);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(payload().conversionRate).toBe('1.305998');
      });
    }

    for (const typed of ['', '0', '-5']) {
      it(`converted "${typed}": amount and rate untouched; the next amount recomputes the converted amount`, () => {
        renderSection();
        fireEvent.change(input('converted'), { target: { value: typed } });
        expectOnlyInError('converted');

        // The rate is the anchor meanwhile: round2(21,34 × 0,681252) = 14,54.
        fireEvent.change(input('actual'), { target: { value: '21,34' } });
        expect(input('rate')).toHaveValue(DEFAULT_DISPLAY.rate);
        expect(input('converted')).toHaveValue(formatCurrency(undefined, 14.54));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    }
  });

  it('hides the remainder while the amount is negative, and brings it back', () => {
    renderSection();
    fireEvent.change(input('converted'), { target: { value: '27' } });
    expect(screen.getByTestId('recon-conversion-remainder')).toBeInTheDocument();

    fireEvent.change(input('actual'), { target: { value: '-5' } });
    expect(screen.queryByTestId('recon-conversion-remainder')).not.toBeInTheDocument();

    fireEvent.change(input('actual'), { target: { value: '40,91' } });
    expect(screen.getByTestId('recon-conversion-remainder')).toBeInTheDocument();
  });

  it('hides the remainder while the rate is 0, and brings it back', () => {
    renderSection();
    fireEvent.change(input('converted'), { target: { value: '27' } });
    fireEvent.change(input('rate'), { target: { value: '0' } });
    expect(screen.queryByTestId('recon-conversion-remainder')).not.toBeInTheDocument();
    expect(input('converted')).toHaveValue(formatCurrency(undefined, 27));

    // round2(40,91 × 0,66 = 27,0006) = 27,00 → 0,87 € still on the line.
    fireEvent.change(input('rate'), { target: { value: '0,66' } });
    expect(screen.getByTestId('recon-conversion-remainder')).toHaveTextContent(ws(
      `financeReconcileConversionRemainder [amount=${formatCurrency('EUR', 0.87)}]`));
  });

  it('shows the remainder hint when the converted amount is lowered', () => {
    renderSection();
    fireEvent.change(input('converted'), { target: { value: '27' } });
    expect(screen.getByTestId('recon-conversion-remainder')).toHaveTextContent(ws(
      `financeReconcileConversionRemainder [amount=${formatCurrency('EUR', 0.87)}]`));
  });
});
