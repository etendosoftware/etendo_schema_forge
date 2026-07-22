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

// --- Tests ---

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
