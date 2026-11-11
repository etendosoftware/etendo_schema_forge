// @covers tools/app-shell/src/components/contract-ui/ResettableAmountInput.jsx
//
// The always-visible amount input with a reset (↻) button: the line grid's in-place «A remesar»
// cell (commit on blur) and the document picker's amount column (live onChange). Rendered with the
// real MaskedAmountInput, validateBoundedAmount and formatCurrency; i18n echoes the key and params.
import { act, fireEvent, render, screen } from '@testing-library/react';

const mockUi = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

import { ResettableAmountInput, boundedAmountMessage } from '../ResettableAmountInput.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';

// The canonical money output (instance separators, NBSP before the symbol) — never hand-written.
const EUR_100 = formatCurrency('EUR', 100);
const OVER_MAX = `boundedAmountExceedsMax:${JSON.stringify({ max: EUR_100 })}`;

const input = () => screen.getByTestId('amt-input');
const resetButton = () => screen.queryByTestId('amt-reset');

function type(value) {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value } });
}

async function typeAndBlur(value) {
  type(value);
  await act(async () => { fireEvent.blur(input()); });
}

function renderCommitMode(props = {}) {
  const onCommit = vi.fn().mockResolvedValue(undefined);
  const onInvalid = vi.fn();
  const utils = render(
    <ResettableAmountInput
      value="40"
      resetValue={100}
      max={100}
      currency="EUR"
      onCommit={onCommit}
      onInvalid={onInvalid}
      ariaLabel="toRemit"
      data-testid="amt"
      {...props} />,
  );
  return { ...utils, onCommit, onInvalid };
}

describe('boundedAmountMessage', () => {
  it('is empty without an error', () => {
    expect(boundedAmountMessage(mockUi, null, 100, 'EUR')).toBe('');
  });

  it('formats the maximum in the currency for the over-the-maximum refusal', () => {
    expect(boundedAmountMessage(mockUi, 'boundedAmountExceedsMax', -100, 'EUR')).toBe(OVER_MAX);
  });

  it('translates the other refusals without params', () => {
    expect(boundedAmountMessage(mockUi, 'boundedAmountZero', 100, 'EUR')).toBe('boundedAmountZero');
  });
});

describe('ResettableAmountInput — commit on blur', () => {
  it('shows the stored value, labelled, without an error', () => {
    renderCommitMode();
    expect(input()).toHaveAttribute('aria-label', 'toRemit');
    expect(input().value).toMatch(/^40(,00)?$/);
    expect(input()).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByTestId('amt-error')).toBeNull();
  });

  it('commits a valid, changed amount as a number', async () => {
    const { onCommit, onInvalid } = renderCommitMode();
    await typeAndBlur('60,5');
    expect(onCommit).toHaveBeenCalledWith(60.5);
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it('does not commit an unchanged amount', async () => {
    const { onCommit, onInvalid } = renderCommitMode();
    await typeAndBlur('40');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it.each([
    ['over the maximum', '150', OVER_MAX],
    ['zero', '0', 'boundedAmountZero'],
    ['empty', '', 'boundedAmountRequired'],
    ['negative against a positive maximum', '-5', 'boundedAmountSignMismatch'],
  ])('refuses an amount %s: onInvalid, no commit, the draft stays, aria-invalid', async (_label, typed, message) => {
    const { onCommit, onInvalid } = renderCommitMode();
    await typeAndBlur(typed);
    expect(onInvalid).toHaveBeenCalledWith(message);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAttribute('aria-describedby', 'amt-error');
    expect(screen.getByTestId('amt-error').textContent).toBe(message);
    expect(screen.getByTestId('amt')).toHaveAttribute('title', message);
  });

  it('keeps the refused text on screen', async () => {
    renderCommitMode();
    await typeAndBlur('150');
    expect(input().value).toMatch(/^150(,00)?$/);
  });

  it('the reset commits the reset value', async () => {
    const { onCommit } = renderCommitMode();
    expect(resetButton()).toHaveAttribute('aria-label', `resetAmountTo:${JSON.stringify({ amount: EUR_100 })}`);
    await act(async () => { fireEvent.click(resetButton()); });
    expect(onCommit).toHaveBeenCalledWith(100);
  });

  it('the reset does not bubble to the row', async () => {
    const onRowClick = vi.fn();
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRowClick}>
        <ResettableAmountInput value="40" resetValue={100} max={100} onCommit={onCommit} data-testid="amt" />
      </div>,
    );
    await act(async () => { fireEvent.click(resetButton()); });
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('hides the reset when the value already equals the reset value', () => {
    renderCommitMode({ value: '100.00' });
    expect(resetButton()).toBeNull();
  });

  it('hides the reset without a reset value, or when disabled', () => {
    const { unmount } = renderCommitMode({ resetValue: undefined });
    expect(resetButton()).toBeNull();
    unmount();
    renderCommitMode({ disabled: true });
    expect(resetButton()).toBeNull();
    expect(input()).toBeDisabled();
  });

  it('accepts any non-zero amount without a maximum', async () => {
    const { onCommit, onInvalid } = renderCommitMode({ max: undefined });
    await typeAndBlur('5000');
    expect(onCommit).toHaveBeenCalledWith(5000);
    expect(onInvalid).not.toHaveBeenCalled();
  });
});

describe('ResettableAmountInput — live onChange', () => {
  function renderLive(props = {}) {
    const onChange = vi.fn();
    const utils = render(
      <ResettableAmountInput value="40" resetValue={100} max={100} currency="EUR" onChange={onChange} data-testid="amt" {...props} />,
    );
    return { ...utils, onChange };
  }

  it('reports every keystroke as the clean value', () => {
    const { onChange } = renderLive();
    type('6');
    type('60,5');
    expect(onChange).toHaveBeenNthCalledWith(1, '6');
    expect(onChange).toHaveBeenNthCalledWith(2, '60.5');
  });

  it('the reset reports the reset value as a string', () => {
    const { onChange } = renderLive();
    fireEvent.click(resetButton());
    expect(onChange).toHaveBeenCalledWith('100');
  });

  it('shows the error of an invalid value the parent holds', () => {
    renderLive({ value: '150' });
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('amt-error')).toHaveTextContent('boundedAmountExceedsMax');
  });

  it('a blur never commits anything in live mode', async () => {
    const onInvalid = vi.fn();
    const { onChange } = renderLive({ onInvalid });
    await typeAndBlur('60');
    expect(onChange).toHaveBeenCalledWith('60');
    expect(onInvalid).not.toHaveBeenCalled();
  });
});

// Repro (ETP-6148 round 3 review): `commit()` awaited `onCommit` inside try/finally with no catch,
// and the blur / reset handlers call it without awaiting, so a rejecting `onCommit` escaped as an
// unhandled promise rejection. The documented behaviour: the rejection is caught (the caller is
// the one that tells the user, e.g. InlineLinesPanel's own toast), and the draft is dropped, so the
// input shows the stored `value` again.
describe('ResettableAmountInput — a rejected commit', () => {
  let unhandled;
  const onUnhandled = (reason) => { unhandled.push(reason); };
  beforeEach(() => {
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
  });
  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });
  // Lets a pending rejection reach the process-level handler before asserting on it.
  const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

  it('is caught on blur, and the input shows the stored value again', async () => {
    const onCommit = vi.fn().mockRejectedValue(new Error('PATCH failed'));
    renderCommitMode({ onCommit });
    await typeAndBlur('60');
    await act(async () => { await flush(); });
    expect(onCommit).toHaveBeenCalledWith(60);
    expect(unhandled).toEqual([]);
    expect(input()).not.toHaveValue('60');
    expect(input()).not.toHaveAttribute('aria-invalid');
  });

  it('is caught on reset too', async () => {
    const onCommit = vi.fn().mockRejectedValue(new Error('PATCH failed'));
    renderCommitMode({ onCommit });
    await act(async () => { fireEvent.click(resetButton()); });
    await act(async () => { await flush(); });
    expect(onCommit).toHaveBeenCalledWith(100);
    expect(unhandled).toEqual([]);
    expect(resetButton()).toBeInTheDocument();
  });
});
