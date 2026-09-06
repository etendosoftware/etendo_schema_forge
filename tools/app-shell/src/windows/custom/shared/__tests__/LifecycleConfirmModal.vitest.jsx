// Unit tests for the generic, "dumb" LifecycleConfirmModal (ETP-4500). It
// replaces the deleted per-domain ReactivarModal/MovementConfirmModal and is
// reused by both financial-account movements and Cobros/Pagos payments via
// domain-specific wrapper components (MovementRowKebab, PaymentLifecycleConfirmModal).

// --- Imports ---

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LifecycleConfirmModal from '../LifecycleConfirmModal.jsx';

// --- Helpers ---

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const BASE_PROPS = {
  title: 'Some title',
  sub: 'Some sub',
  confirmLabel: 'Confirm it',
  cancelLabel: 'Cancel it',
  warning: 'Be careful',
  itemConciliacion: ['Conciliación title', 'Conciliación desc'],
  itemAsiento: ['Asiento title', 'Asiento desc'],
};

/**
 * ETP-5111 — the conditional body. `warning` became optional (`warning?: string`) so a
 * confirmation for a record with NOTHING to undo can omit the yellow box; the items list is
 * guarded independently; and the padded body wrapper itself is guarded too, because with both
 * halves hidden it still left ~24px of dead space between the subtitle and the footer.
 *
 * This is a SHARED/platform surface — `ReconciliationSplitPanel`, `BankConnectionDeleteConfirmModal`
 * and `PaymentLifecycleConfirmModal` all render through it — so the "no other dialog changed"
 * claim is asserted here rather than left resting on a manual read.
 *
 * The body wrapper's presence is asserted STRUCTURALLY (how many blocks the card contains) rather
 * than by matching inline styles: the card holds header + [body] + footer, so "no third block" is
 * exactly the dead-space fix and nothing else.
 */
describe('LifecycleConfirmModal — conditional body (ETP-5111)', () => {
  const NO_ITEM_PROPS = {
    title: 'T', sub: 'S', confirmLabel: 'OK', cancelLabel: 'No',
  };

  /** header + optional body + footer. */
  function cardBlockCount() {
    return screen.getByTestId('lifecycle-confirm-modal').firstElementChild.children.length;
  }

  it('omits the yellow warning box when no warning is given', () => {
    render(
      <LifecycleConfirmModal
        {...NO_ITEM_PROPS}
        reconciled={false}
        posted={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // The subtitle and the buttons still render — only the warning is gone.
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
    expect(screen.queryByText('Be careful')).not.toBeInTheDocument();
  });

  it('drops the padded body wrapper entirely when there is neither an item nor a warning', () => {
    render(
      <LifecycleConfirmModal
        {...NO_ITEM_PROPS}
        reconciled={false}
        posted={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Header + footer only. A surviving empty wrapper is the ~24px dead space this guards.
    expect(cardBlockCount()).toBe(2);
  });

  it('keeps the body when there is a warning but no items', () => {
    render(
      <LifecycleConfirmModal
        {...NO_ITEM_PROPS}
        warning="Be careful"
        reconciled={false}
        posted={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Be careful')).toBeInTheDocument();
    expect(cardBlockCount()).toBe(3);
  });

  it('keeps the body when there are items but no warning', () => {
    render(
      <LifecycleConfirmModal
        {...NO_ITEM_PROPS}
        itemAsiento={['Asiento title', 'Asiento desc']}
        reconciled={false}
        posted
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Asiento title.')).toBeInTheDocument();
    expect(screen.queryByText('Be careful')).not.toBeInTheDocument();
    expect(cardBlockCount()).toBe(3);
  });

  /**
   * The regression guard for every EXISTING consumer. All three pass a real warning string and at
   * least one item, which is the pre-ETP-5111 shape — so the dialog they render must be byte-for-
   * byte what it was: both halves present, inside one body block. If someone later inverts a guard
   * (`!warning`, or `items.length === 0`), this fails even though the new draft case still works.
   */
  it('regression: a consumer passing both a warning and items renders exactly as before', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled
        posted
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Conciliación title.')).toBeInTheDocument();
    expect(screen.getByText('Asiento title.')).toBeInTheDocument();
    expect(screen.getByText('Be careful')).toBeInTheDocument();
    expect(cardBlockCount()).toBe(3);
  });

  // `explicitItems` is the other way in (ReconciliationSplitPanel uses it), and it must satisfy the
  // items guard the same way the flag-derived list does.
  it('counts an explicit items list towards the body guard', () => {
    render(
      <LifecycleConfirmModal
        {...NO_ITEM_PROPS}
        items={[['Explicit title', 'Explicit desc']]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Explicit title.')).toBeInTheDocument();
    expect(cardBlockCount()).toBe(3);
  });
});

describe('LifecycleConfirmModal', () => {
  it('renders the given title, sub, warning and labels', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled={false}
        posted={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Some title')).toBeInTheDocument();
    expect(screen.getByText('Some sub')).toBeInTheDocument();
    expect(screen.getByText('Be careful')).toBeInTheDocument();
    expect(screen.getByText('Cancel it')).toBeInTheDocument();
    expect(screen.getByText('Confirm it')).toBeInTheDocument();
  });

  it('renders neither item when reconciled and posted are both false', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled={false}
        posted={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Conciliación title')).not.toBeInTheDocument();
    expect(screen.queryByText('Asiento title')).not.toBeInTheDocument();
  });

  it('renders only itemConciliacion when reconciled=true and posted=false', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled
        posted={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Conciliación title.')).toBeInTheDocument();
    expect(screen.getByText('Conciliación desc')).toBeInTheDocument();
    expect(screen.queryByText('Asiento title.')).not.toBeInTheDocument();
  });

  it('renders only itemAsiento when posted=true and reconciled=false', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled={false}
        posted
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Asiento title.')).toBeInTheDocument();
    expect(screen.getByText('Asiento desc')).toBeInTheDocument();
    expect(screen.queryByText('Conciliación title.')).not.toBeInTheDocument();
  });

  it('renders both items when reconciled=true and posted=true', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled
        posted
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Conciliación title.')).toBeInTheDocument();
    expect(screen.getByText('Asiento title.')).toBeInTheDocument();
  });

  it('uses the default "lifecycle-confirm" testIdPrefix for all 4 test ids when omitted', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled={false}
        posted={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('lifecycle-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-confirm-close')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-confirm-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-confirm-accept')).toBeInTheDocument();
  });

  it('builds all 4 test ids from a custom testIdPrefix', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled={false}
        posted={false}
        testIdPrefix="movement-confirm"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('movement-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('movement-confirm-close')).toBeInTheDocument();
    expect(screen.getByTestId('movement-confirm-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('movement-confirm-accept')).toBeInTheDocument();
  });

  it('calls onClose when the header close (X) button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <LifecycleConfirmModal {...BASE_PROPS} reconciled={false} posted={false} onConfirm={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByTestId('lifecycle-confirm-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the footer Cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <LifecycleConfirmModal {...BASE_PROPS} reconciled={false} posted={false} onConfirm={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByTestId('lifecycle-confirm-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when the Accept button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <LifecycleConfirmModal {...BASE_PROPS} reconciled={false} posted={false} onConfirm={onConfirm} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByTestId('lifecycle-confirm-accept'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('disables the Accept button and shows an ellipsis while onConfirm is pending, then reverts', async () => {
    const { promise, resolve } = deferred();
    const onConfirm = vi.fn(() => promise);
    render(
      <LifecycleConfirmModal {...BASE_PROPS} reconciled={false} posted={false} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    const acceptButton = screen.getByTestId('lifecycle-confirm-accept');
    await userEvent.click(acceptButton);

    await waitFor(() => expect(acceptButton).toBeDisabled());
    expect(acceptButton).toHaveTextContent('…');
    expect(screen.queryByText('Confirm it')).not.toBeInTheDocument();

    resolve();

    await waitFor(() => expect(acceptButton).not.toBeDisabled());
    expect(acceptButton).toHaveTextContent('Confirm it');
  });

  it('ignores extra clicks while a confirm is already in-flight (no duplicate onConfirm calls)', async () => {
    const { promise, resolve } = deferred();
    const onConfirm = vi.fn(() => promise);
    render(
      <LifecycleConfirmModal {...BASE_PROPS} reconciled={false} posted={false} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    const acceptButton = screen.getByTestId('lifecycle-confirm-accept');
    await userEvent.click(acceptButton);
    await waitFor(() => expect(acceptButton).toBeDisabled());
    // The button is disabled — a further click is a no-op because the DOM
    // button element itself is disabled (userEvent respects `disabled`).
    await userEvent.click(acceptButton);

    resolve();
    await waitFor(() => expect(acceptButton).not.toBeDisabled());

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('resets loading state even when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <LifecycleConfirmModal {...BASE_PROPS} reconciled={false} posted={false} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    // handleConfirm awaits onConfirm() with only a `finally` (no catch), so
    // the click handler's own returned promise rejects once the finally runs
    // — internal to the component's onClick binding, unreachable from here.
    // Swallow the resulting process-level unhandledRejection for the
    // duration of this test; the finally/reset behavior is still exercised.
    const ignoreExpectedRejection = () => {};
    process.on('unhandledRejection', ignoreExpectedRejection);
    try {
      const acceptButton = screen.getByTestId('lifecycle-confirm-accept');
      await userEvent.click(acceptButton);

      await waitFor(() => expect(acceptButton).not.toBeDisabled());
      expect(acceptButton).toHaveTextContent('Confirm it');
    } finally {
      process.removeListener('unhandledRejection', ignoreExpectedRejection);
    }
  });
});

describe('LifecycleConfirmModal — hasTransaction / itemTransaccion', () => {
  const ITEM_PROPS = {
    ...BASE_PROPS,
    itemConciliacion: ['ItemConciliacion', 'descConciliacion'],
    itemTransaccion: ['ItemTransaccion', 'descTransaccion'],
    itemAsiento: ['ItemAsiento', 'descAsiento'],
  };

  // All 8 combinations of reconciled x hasTransaction x posted must map to the
  // right subset of items, in the fixed order Conciliación, Transacción, Asiento.
  const combos = [
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ];

  it.each(combos)(
    'reconciled=%s hasTransaction=%s posted=%s renders exactly the matching items in Conciliación/Transacción/Asiento order',
    (reconciled, hasTransaction, posted) => {
      render(
        <LifecycleConfirmModal
          {...ITEM_PROPS}
          reconciled={reconciled}
          hasTransaction={hasTransaction}
          posted={posted}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      if (reconciled) {
        expect(screen.getByText('ItemConciliacion.')).toBeInTheDocument();
      } else {
        expect(screen.queryByText('ItemConciliacion.')).not.toBeInTheDocument();
      }
      if (hasTransaction) {
        expect(screen.getByText('ItemTransaccion.')).toBeInTheDocument();
      } else {
        expect(screen.queryByText('ItemTransaccion.')).not.toBeInTheDocument();
      }
      if (posted) {
        expect(screen.getByText('ItemAsiento.')).toBeInTheDocument();
      } else {
        expect(screen.queryByText('ItemAsiento.')).not.toBeInTheDocument();
      }

      // DOM order check — whichever items are present must appear in the
      // fixed order Conciliación, Transacción, Asiento (never rearranged).
      const text = document.body.textContent;
      const positions = [
        reconciled ? text.indexOf('ItemConciliacion') : -1,
        hasTransaction ? text.indexOf('ItemTransaccion') : -1,
        posted ? text.indexOf('ItemAsiento') : -1,
      ].filter((i) => i !== -1);
      const sorted = [...positions].sort((a, b) => a - b);
      expect(positions).toEqual(sorted);
    },
  );

  it('renders no Transacción item when hasTransaction is true but itemTransaccion is not provided', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled={false}
        posted={false}
        hasTransaction
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('Asiento title.')).not.toBeInTheDocument();
    expect(screen.queryByText('Conciliación title.')).not.toBeInTheDocument();
  });
});

// The explicit `items` list (ETP-4502) lets callers whose consequences don't map onto the
// Conciliación/Transacción/Asiento triad — e.g. the bank-reconciliation Desconciliar / Reactivar
// cartel — pass a ready-made bullet list instead of the flags.
describe('LifecycleConfirmModal — explicit items list', () => {
  const FLAGGED_PROPS = {
    ...BASE_PROPS,
    itemConciliacion: ['ItemConciliacion', 'descConciliacion'],
    itemTransaccion: ['ItemTransaccion', 'descTransaccion'],
    itemAsiento: ['ItemAsiento', 'descAsiento'],
  };

  it('renders exactly the given items, in the given order', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        items={[['First', 'first desc'], ['Second', 'second desc'], ['Third', 'third desc']]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('First.')).toBeInTheDocument();
    expect(screen.getByText('first desc')).toBeInTheDocument();
    expect(screen.getByText('Second.')).toBeInTheDocument();
    expect(screen.getByText('Third.')).toBeInTheDocument();

    const text = screen.getByTestId('lifecycle-confirm-modal').textContent;
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
    expect(text.indexOf('Second')).toBeLessThan(text.indexOf('Third'));
  });

  it('takes precedence over the reconciled/hasTransaction/posted flag-driven items', () => {
    render(
      <LifecycleConfirmModal
        {...FLAGGED_PROPS}
        reconciled
        hasTransaction
        posted
        items={[['Only this one', 'only desc']]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Only this one.')).toBeInTheDocument();
    // Every flag is on, yet none of the triad slots is rendered.
    expect(screen.queryByText('ItemConciliacion.')).not.toBeInTheDocument();
    expect(screen.queryByText('ItemTransaccion.')).not.toBeInTheDocument();
    expect(screen.queryByText('ItemAsiento.')).not.toBeInTheDocument();
  });

  it('renders no bullets for an explicit empty list, even with the flags on', () => {
    render(
      <LifecycleConfirmModal
        {...FLAGGED_PROPS}
        reconciled
        hasTransaction
        posted
        items={[]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText('ItemConciliacion.')).not.toBeInTheDocument();
    expect(screen.queryByText('ItemTransaccion.')).not.toBeInTheDocument();
    expect(screen.queryByText('ItemAsiento.')).not.toBeInTheDocument();
    // Title / sub / warning / buttons are unaffected by an empty bullet list.
    expect(screen.getByText('Some title')).toBeInTheDocument();
    expect(screen.getByText('Be careful')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-confirm-accept')).toBeInTheDocument();
  });

  it('falls back to the flag-driven items when `items` is omitted (2 existing callers unaffected)', () => {
    render(
      <LifecycleConfirmModal
        {...FLAGGED_PROPS}
        reconciled
        posted
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('ItemConciliacion.')).toBeInTheDocument();
    expect(screen.getByText('ItemAsiento.')).toBeInTheDocument();
  });
});

describe('LifecycleConfirmModal — confirmIcon', () => {
  it('renders nothing extra in the accept button when confirmIcon is omitted (defaults to null)', () => {
    render(
      <LifecycleConfirmModal {...BASE_PROPS} reconciled={false} posted={false} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    const acceptButton = screen.getByTestId('lifecycle-confirm-accept');
    // Only the label text node — no extra child element rendered before it.
    expect(acceptButton).toHaveTextContent('Confirm it');
    expect(acceptButton.querySelector('[data-testid="confirm-icon"]')).toBeNull();
  });

  it('renders the given confirmIcon inside the accept button, before the label', () => {
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled={false}
        posted={false}
        confirmIcon={<span data-testid="confirm-icon">ICON</span>}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const acceptButton = screen.getByTestId('lifecycle-confirm-accept');
    const icon = screen.getByTestId('confirm-icon');
    expect(acceptButton).toContainElement(icon);
    expect(acceptButton).toHaveTextContent('ICONConfirm it');
  });

  it('keeps confirmIcon visible while loading (only the label text toggles to the ellipsis)', async () => {
    const { promise, resolve } = deferred();
    const onConfirm = vi.fn(() => promise);
    render(
      <LifecycleConfirmModal
        {...BASE_PROPS}
        reconciled={false}
        posted={false}
        confirmIcon={<span data-testid="confirm-icon">ICON</span>}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    const acceptButton = screen.getByTestId('lifecycle-confirm-accept');
    await userEvent.click(acceptButton);

    await waitFor(() => expect(acceptButton).toBeDisabled());
    expect(screen.getByTestId('confirm-icon')).toBeInTheDocument();
    expect(acceptButton).toHaveTextContent('ICON…');

    resolve();
    await waitFor(() => expect(acceptButton).not.toBeDisabled());
    expect(screen.getByTestId('confirm-icon')).toBeInTheDocument();
    expect(acceptButton).toHaveTextContent('ICONConfirm it');
  });
});
