// Banner + modal for "post the unreconciled statement remainder to a G/L item".
//
// The decision logic itself lives in reconciliationDifferenceMath.js and is covered by the
// node:test suite next door; this file covers only what the user SEES and can press:
//   - the banner is hidden / shown / shown-but-blocked purely from `info`
//   - the amounts rendered are the canonical formatCurrency output (never a hand-rolled formatter)
//   - "Dejar pendiente" is a pure UI dismissal (no payload, no data change)
//   - the modal cannot be confirmed without an accounting concept
//   - the modal has NO editable amount field — by design, since the server recomputes the
//     remainder and ignores anything the client sends
//
// Mocks BEFORE imports.

// Radix <Dialog> relies on Pointer Capture + scrollIntoView, neither implemented by jsdom (same
// polyfill block as ReconciliationSplitPanel.vitest.jsx).
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

// i18n mock: echoes the KEY (so no test hardcodes Spanish/English copy) and appends the
// interpolation vars.
//
// The append is the whole point. Real locale keys carry their `{placeholder}`s in the locale VALUE,
// not in the key name, so a plain key echo renders NOTHING of what the call site passed — a test
// asserting on the formatted amount would silently pass against a component that forgot it.
// Serializing the vars into the output makes the rendered amount assertable, and `uiCalls` keeps
// the raw (key, vars) pairs for exact-value assertions.
const uiCalls = [];
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    uiCalls.push({ key, vars });
    if (!vars) return key;
    const interpolated = key.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    const rendered = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(' ');
    return `${interpolated} [${rendered}]`;
  },
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

// The accounting-concept picker: lightweight stub exposing the REAL options from useLookup('') as
// buttons so a test can pick a SPECIFIC concept by id (same stub style as
// ReconciliationSplitPanel.multiCurrency.vitest.jsx).
vi.mock('@/components/forms/fields', () => ({
  ChipSelect: ({ value, onChange, useLookup, testId, placeholder }) => {
    const { results } = useLookup('');
    return (
      <div>
        <span data-testid={`${testId}-value`}>{value?.id ?? ''}</span>
        <span data-testid={`${testId}-placeholder`}>{placeholder}</span>
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            data-testid={`${testId}-option-${r.id}`}
            onClick={() => onChange(r)}
          >
            {r.name}
          </button>
        ))}
        <button
          type="button"
          data-testid={`${testId}-clear`}
          onClick={() => onChange(null)}
        >
          clear
        </button>
      </div>
    );
  },
}));

const glItems = [
  { id: 'GL-1', name: 'Comisiones bancarias' },
  { id: 'GL-2', name: 'Diferencias de cambio' },
];
vi.mock('@/hooks/useMovementLookups', () => ({
  useGLItemLookup: () => ({ results: glItems, loading: false }),
}));

import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  DifferenceBanner,
  DifferenceModal,
  differenceState,
} from '@/components/contract-ui/ReconciliationDifference.jsx';

// ── Fixtures ────────────────────────────────────────────────────────────────
// The acceptance scenario: a 12,50 € statement line matched against 12,00 €, 0,50 € left over.

const PARTIAL_LINE = {
  id: 'LP1',
  amount: 12.5,
  reconcileStatus: 'PARTIAL',
  reconciledAmount: 12,
  pendingAmount: 0.5,
  remainderLineId: 'LP1-rem',
};

const INFO_VISIBLE = differenceState({ line: PARTIAL_LINE, amountTolerance: 5 });
const INFO_HIDDEN = differenceState({ line: PARTIAL_LINE, amountTolerance: 0 });

// The canonical formatter's real output — never a loose regex, which would also pass with the old
// en-US / no-grouping bug (CLAUDE.md § Currency & Amount Formatting).
const REMAINDER_TEXT = formatCurrency('EUR', 0.5);
const TOTAL_TEXT = formatCurrency('EUR', 12.5);
const MATCHED_TEXT = formatCurrency('EUR', 12);

const bannerProps = (overrides = {}) => ({
  info: INFO_VISIBLE,
  currency: 'EUR',
  onDismiss: vi.fn(),
  onPost: vi.fn(),
  ...overrides,
});

const modalProps = (overrides = {}) => ({
  open: true,
  info: INFO_VISIBLE,
  currency: 'EUR',
  defaultGlItem: null,
  busy: false,
  onConfirm: vi.fn(),
  onClose: vi.fn(),
  ...overrides,
});

/**
 * Banner + modal wired the way `ReconciliationSplitPanel` wires them: the modal starts CLOSED and
 * the banner's button opens it.
 *
 * Rendering both with the modal already open is not a valid harness — Radix's Dialog puts
 * `pointer-events: none` on everything outside the dialog, so the banner button would be
 * unclickable for reasons that have nothing to do with the component under test.
 */
function BannerAndModal({ defaultGlItem = null, onConfirm = () => {} }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DifferenceBanner {...bannerProps({ onPost: () => setOpen(true) })} />
      <DifferenceModal
        {...modalProps({ open, defaultGlItem, onConfirm, onClose: () => setOpen(false) })} />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  uiCalls.length = 0;
});

/** The (key, vars) pair of the last `ui(key, ...)` call, for exact interpolation assertions. */
const lastUiCall = (key) => [...uiCalls].reverse().find((c) => c.key === key);

// ═══════════════════════════════════════════════════════════════════════════
// DifferenceBanner
// ═══════════════════════════════════════════════════════════════════════════

describe('DifferenceBanner — visibility', () => {
  it('sanity-checks the fixtures the rest of the suite leans on', () => {
    expect(INFO_VISIBLE).toMatchObject({ visible: true, reason: null });
    expect(INFO_HIDDEN.visible).toBe(false);
    // `blocked` was removed from the contract: the missing-concept case is handled by the modal's
    // own confirm gate, not by disabling the banner.
    expect(INFO_VISIBLE).not.toHaveProperty('blocked');
  });

  it('renders nothing when info.visible is false', () => {
    render(<DifferenceBanner {...bannerProps({ info: INFO_HIDDEN })} />);
    expect(screen.queryByTestId('recon-difference-banner')).toBeNull();
  });

  it('renders nothing when info is missing entirely', () => {
    render(<DifferenceBanner {...bannerProps({ info: null })} />);
    expect(screen.queryByTestId('recon-difference-banner')).toBeNull();
  });

  it('renders the banner when info.visible is true', () => {
    render(<DifferenceBanner {...bannerProps()} />);
    expect(screen.getByTestId('recon-difference-banner')).toBeInTheDocument();
  });
});

describe('DifferenceBanner — copy', () => {
  // The banner is a SINGLE line: the remainder, and nothing else. The design's subtitle ("El
  // extracto es de X y ya has conciliado Y con Mov. Z") was dropped because all three figures are
  // already on screen — the line total in the left panel, the reconciled amount and progress in the
  // ReconciledOperationsSection row rendered right below, whose render condition is the same one
  // that shows this banner. The full arithmetic lives in the modal's breakdown.
  it('states the remainder in the title, formatted through formatCurrency', () => {
    render(<DifferenceBanner {...bannerProps()} />);
    const banner = screen.getByTestId('recon-difference-banner');
    expect(banner.textContent).toContain('financeReconcileDiffBannerTitle');
    expect(banner.textContent).toContain(REMAINDER_TEXT);
    // Exact interpolation: the canonical formatter's output, not a stray toFixed().
    expect(lastUiCall('financeReconcileDiffBannerTitle').vars)
      .toEqual({ amount: REMAINDER_TEXT });
    // The remainder is the ONLY amount the title interpolates.
    expect(Object.keys(lastUiCall('financeReconcileDiffBannerTitle').vars)).toEqual(['amount']);
  });

  it('renders exactly one line of copy — the title — plus the two action labels', () => {
    render(<DifferenceBanner {...bannerProps()} />);
    const banner = screen.getByTestId('recon-difference-banner');

    // Every i18n key the banner is allowed to ask for.
    expect(uiCalls.map((c) => c.key).sort()).toEqual([
      'financeReconcileDiffAction',
      'financeReconcileDiffBannerTitle',
      'financeReconcileDiffLeavePending',
    ]);
    // Exactly one <p>: the title. A reinstated subtitle would add a second.
    expect(banner.querySelectorAll('p')).toHaveLength(1);
  });

  it('does NOT repeat the line total or the matched amount already shown elsewhere', () => {
    render(<DifferenceBanner {...bannerProps()} />);
    const banner = screen.getByTestId('recon-difference-banner');

    expect(banner.textContent).not.toContain(TOTAL_TEXT);
    expect(banner.textContent).not.toContain(MATCHED_TEXT);
    // The three removed i18n keys must not come back.
    for (const key of [
      'financeReconcileDiffBannerBody',
      'financeReconcileDiffBannerMovement',
      'financeReconcileDiffBannerMovementUnknown',
    ]) {
      expect(banner.textContent).not.toContain(key);
      expect(lastUiCall(key)).toBeUndefined();
    }
  });

  it('ignores a stray matchedTxn prop — the movement reference is gone', () => {
    // Guards the prop removal: an old call site still passing it must change nothing on screen.
    render(<DifferenceBanner
      {...bannerProps()}
      matchedTxn={{ transactionId: 'T1', documentNo: '1000034' }} />);
    const banner = screen.getByTestId('recon-difference-banner');
    expect(banner.textContent).not.toContain('1000034');
    expect(banner.querySelectorAll('p')).toHaveLength(1);
  });

  it('renders an absolute amount for an outflow remainder (no stray minus sign)', () => {
    const outflow = differenceState({
      line: { ...PARTIAL_LINE, amount: -12.5, reconciledAmount: -12, pendingAmount: -0.5 },
      amountTolerance: 5,
    });
    render(<DifferenceBanner {...bannerProps({ info: outflow })} />);
    const banner = screen.getByTestId('recon-difference-banner');
    expect(banner.textContent).toContain(REMAINDER_TEXT);
    expect(banner.textContent).not.toContain(`-${REMAINDER_TEXT}`);
  });
});

describe('DifferenceBanner — actions', () => {
  it('"Dejar pendiente" calls onDismiss with no payload — it changes no data', async () => {
    const user = userEvent.setup();
    const props = bannerProps();
    render(<DifferenceBanner {...props} />);

    await user.click(screen.getByTestId('recon-difference-dismiss'));

    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(props.onPost).not.toHaveBeenCalled();
  });

  it('the primary action opens the modal via onPost', async () => {
    const user = userEvent.setup();
    const props = bannerProps();
    render(<DifferenceBanner {...props} />);

    await user.click(screen.getByTestId('recon-difference-open'));

    expect(props.onPost).toHaveBeenCalledTimes(1);
    expect(props.onDismiss).not.toHaveBeenCalled();
  });

  // The banner's action is NEVER disabled — the concept is chosen inside the modal, and the
  // backend accepts whatever the modal sends. Disabling the banner because the ACCOUNT has no
  // default concept was the earlier behaviour and was wrong: it turned a solvable choice into a
  // dead end. The real guard now lives on the modal's confirm (see "confirm gating" below).
  it('keeps the primary action ENABLED — the concept is chosen in the modal', async () => {
    const user = userEvent.setup();
    const props = bannerProps();
    render(<DifferenceBanner {...props} />);

    const open = screen.getByTestId('recon-difference-open');
    expect(open).toBeEnabled();
    expect(open).not.toHaveAttribute('disabled');

    await user.click(open);
    expect(props.onPost).toHaveBeenCalledTimes(1);
  });

  it('does not render a "configure a concept" explanation in the banner', () => {
    render(<DifferenceBanner {...bannerProps()} />);
    // The whole i18n key was removed with the gate; assert no stale copy survives.
    expect(screen.getByTestId('recon-difference-banner').textContent)
      .not.toContain('financeReconcileDiffNoConcept');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DifferenceModal
// ═══════════════════════════════════════════════════════════════════════════

describe('DifferenceModal — breakdown', () => {
  it('is not rendered while closed', () => {
    render(<DifferenceModal {...modalProps({ open: false })} />);
    expect(screen.queryByTestId('recon-difference-dialog')).toBeNull();
  });

  // NOTE: `.textContent` + toContain, never toHaveTextContent — formatCurrency joins the amount and
  // the symbol with a NBSP (U+00A0), and jest-dom normalizes whitespace in the ELEMENT but not in
  // the expected string, so toHaveTextContent(formatCurrency(...)) never matches.
  it('shows the statement / matched / difference rows with formatCurrency output', () => {
    render(<DifferenceModal {...modalProps()} />);

    expect(screen.getByTestId('recon-difference-row-statement').textContent)
      .toContain(TOTAL_TEXT);
    expect(screen.getByTestId('recon-difference-row-matched').textContent)
      .toContain(MATCHED_TEXT);
    expect(screen.getByTestId('recon-difference-row-difference').textContent)
      .toContain(REMAINDER_TEXT);
  });

  it('repeats the remainder in the modal description', () => {
    render(<DifferenceModal {...modalProps()} />);
    const description = screen.getByTestId('DialogDescription__recon-difference');
    expect(description.textContent).toContain('financeReconcileDiffModalBody');
    expect(description.textContent).toContain(REMAINDER_TEXT);
    expect(lastUiCall('financeReconcileDiffModalBody').vars)
      .toEqual({ amount: REMAINDER_TEXT });
  });

  it('has NO editable amount field — the amount is fixed and lives in the breakdown', () => {
    render(<DifferenceModal {...modalProps()} />);
    const dialog = screen.getByTestId('recon-difference-dialog');

    // No input carries the amount, and the only free-text field is the description.
    const inputs = within(dialog).getAllByRole('textbox');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toBe(screen.getByTestId('recon-difference-description'));
    expect(inputs[0]).toHaveValue('');
    for (const input of inputs) {
      expect(input.value).not.toContain('0,50');
    }
    // The figure is rendered as read-only text instead.
    expect(screen.getByTestId('recon-difference-row-difference').textContent)
      .toContain(REMAINDER_TEXT);
  });

  it('renders zeros rather than crashing when info is missing', () => {
    render(<DifferenceModal {...modalProps({ info: null })} />);
    expect(screen.getByTestId('recon-difference-row-difference').textContent)
      .toContain(formatCurrency('EUR', 0));
  });
});

describe('DifferenceModal — confirm gating', () => {
  // The end-to-end shape of the corrected behaviour: an account with NO configured difference
  // concept still gets an enabled banner action, and the gate lands on the modal's confirm — where
  // the user can actually resolve it by picking a concept.
  it('an account with no default concept: banner enabled, modal confirm gated, then resolvable',
    async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      render(<BannerAndModal defaultGlItem={null} onConfirm={onConfirm} />);

      // The banner offers the action even though the account configured no concept.
      expect(screen.getByTestId('recon-difference-open')).toBeEnabled();
      await user.click(screen.getByTestId('recon-difference-open'));

      // ...and the gate lands here, where the user can actually resolve it.
      const confirm = screen.getByTestId('recon-difference-confirm');
      expect(confirm).toBeDisabled();
      expect(screen.getByTestId('recon-difference-concept-value')).toHaveTextContent('');

      await user.click(screen.getByTestId('recon-difference-concept-option-GL-1'));
      expect(confirm).toBeEnabled();

      await user.click(confirm);
      expect(onConfirm).toHaveBeenCalledWith({ glItemId: 'GL-1', description: '' });
    });

  it('disables confirm until an accounting concept is chosen', async () => {
    const user = userEvent.setup();
    const props = modalProps();
    render(<DifferenceModal {...props} />);

    const confirm = screen.getByTestId('recon-difference-confirm');
    expect(confirm).toBeDisabled();

    await user.click(screen.getByTestId('recon-difference-concept-option-GL-1'));
    expect(confirm).toBeEnabled();
  });

  it('preselects the account default, so confirm is available immediately', () => {
    render(<DifferenceModal {...modalProps({ defaultGlItem: glItems[1] })} />);

    expect(screen.getByTestId('recon-difference-concept-value')).toHaveTextContent('GL-2');
    expect(screen.getByTestId('recon-difference-confirm')).toBeEnabled();
  });

  it('re-disables confirm when the chosen concept is cleared', async () => {
    const user = userEvent.setup();
    render(<DifferenceModal {...modalProps({ defaultGlItem: glItems[0] })} />);

    const confirm = screen.getByTestId('recon-difference-confirm');
    expect(confirm).toBeEnabled();

    await user.click(screen.getByTestId('recon-difference-concept-clear'));
    expect(confirm).toBeDisabled();
  });

  it('disables both footer buttons while the request is in flight', () => {
    render(<DifferenceModal {...modalProps({ defaultGlItem: glItems[0], busy: true })} />);

    expect(screen.getByTestId('recon-difference-confirm')).toBeDisabled();
    expect(screen.getByTestId('recon-difference-cancel')).toBeDisabled();
  });
});

describe('DifferenceModal — confirm payload', () => {
  it('passes the chosen concept and the typed description — and no amount', async () => {
    const user = userEvent.setup();
    const props = modalProps();
    render(<DifferenceModal {...props} />);

    await user.click(screen.getByTestId('recon-difference-concept-option-GL-2'));
    await user.type(screen.getByTestId('recon-difference-description'), 'Comisión banco');
    await user.click(screen.getByTestId('recon-difference-confirm'));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).toHaveBeenCalledWith({
      glItemId: 'GL-2',
      description: 'Comisión banco',
    });
    // The component must not smuggle an amount into the payload: the server recomputes it.
    expect(Object.keys(props.onConfirm.mock.calls[0][0]).sort())
      .toEqual(['description', 'glItemId']);
  });

  it('trims the description and sends an empty string when it is blank', async () => {
    const user = userEvent.setup();
    const props = modalProps({ defaultGlItem: glItems[0] });
    render(<DifferenceModal {...props} />);

    await user.type(screen.getByTestId('recon-difference-description'), '   ');
    await user.click(screen.getByTestId('recon-difference-confirm'));

    expect(props.onConfirm).toHaveBeenCalledWith({ glItemId: 'GL-1', description: '' });
  });

  it('cancel closes without confirming', async () => {
    const user = userEvent.setup();
    const props = modalProps({ defaultGlItem: glItems[0] });
    render(<DifferenceModal {...props} />);

    await user.click(screen.getByTestId('recon-difference-cancel'));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});

describe('DifferenceModal — re-seeding on reopen', () => {
  it('clears a previous run description and re-applies the account default', async () => {
    const user = userEvent.setup();
    const props = modalProps({ defaultGlItem: glItems[0] });
    const { rerender } = render(<DifferenceModal {...props} />);

    await user.click(screen.getByTestId('recon-difference-concept-option-GL-2'));
    await user.type(screen.getByTestId('recon-difference-description'), 'stale note');
    expect(screen.getByTestId('recon-difference-concept-value')).toHaveTextContent('GL-2');

    // Close, then reopen for the next line.
    rerender(<DifferenceModal {...props} open={false} />);
    rerender(<DifferenceModal {...props} open />);

    expect(screen.getByTestId('recon-difference-description')).toHaveValue('');
    expect(screen.getByTestId('recon-difference-concept-value')).toHaveTextContent('GL-1');
  });
});
