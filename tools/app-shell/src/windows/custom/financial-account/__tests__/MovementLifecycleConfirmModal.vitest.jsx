// Unit tests for MovementLifecycleConfirmModal (ETP-4500 follow-up) — the
// Movimientos-side wrapper around the generic LifecycleConfirmModal, added
// for full parity with PaymentLifecycleConfirmModal. Simpler prop contract
// than the Payments wrapper (no `dir`, no `data` object — `reconciled`/
// `posted` are passed in directly as booleans by MovementRowKebab) and only
// two conditional items (no itemTransaccion/hasTransaction — the movement
// itself IS the transaction). Mirrors the depth of
// PaymentLifecycleConfirmModal.vitest.jsx's coverage: title, the 3 sub/
// warning tiers (Both/ReconciledOnly/PostedOnly), item visibility,
// confirmIcon, fixed testIdPrefix and cancelLabel.

// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  RotateCcw: (props) => (
    <span data-testid="icon-rotate-ccw" data-width={props.width} data-stroke-width={props.strokeWidth} />
  ),
  Trash2: (props) => (
    <span data-testid="icon-trash2" data-width={props.width} data-stroke-width={props.strokeWidth} />
  ),
}));

// --- Imports ---

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MovementLifecycleConfirmModal from '../MovementLifecycleConfirmModal.jsx';

// --- Tests ---

describe('MovementLifecycleConfirmModal — title', () => {
  it('shows the plain reactivate title when not reconciled', () => {
    render(
      <MovementLifecycleConfirmModal action="reactivate" reconciled={false} posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('financeAccountTxConfirmReactivateTitle')).toBeInTheDocument();
  });

  it('shows the reconciled-specific reactivate title when reconciled', () => {
    render(
      <MovementLifecycleConfirmModal action="reactivate" reconciled posted={false} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('financeAccountTxConfirmReactivateTitleReconciled')).toBeInTheDocument();
  });

  it('shows the same delete title regardless of reconciled', () => {
    const { rerender } = render(
      <MovementLifecycleConfirmModal action="delete" reconciled={false} posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('financeAccountTxConfirmDeleteTitle')).toBeInTheDocument();

    rerender(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('financeAccountTxConfirmDeleteTitle')).toBeInTheDocument();
  });
});

describe('MovementLifecycleConfirmModal — 3-tier sub/warning key derivation', () => {
  describe('tier: reconciled && posted -> "Both" keys', () => {
    it.each([
      ['reactivate', 'financeAccountTxConfirmReactivateSubBoth', 'financeAccountTxConfirmWarningBoth'],
      ['delete', 'financeAccountTxConfirmDeleteSubBoth', 'financeAccountTxConfirmWarningBoth'],
    ])('action=%s -> sub=%s, warning=%s', (action, expectedSub, expectedWarning) => {
      render(
        <MovementLifecycleConfirmModal action={action} reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
      );
      expect(screen.getByText(expectedSub)).toBeInTheDocument();
      expect(screen.getByText(expectedWarning)).toBeInTheDocument();
    });
  });

  describe('tier: reconciled only (posted=false) -> "ReconciledOnly" keys', () => {
    it.each([
      ['reactivate', 'financeAccountTxConfirmReactivateSubReconciledOnly', 'financeAccountTxConfirmWarningReconciledOnly'],
      ['delete', 'financeAccountTxConfirmDeleteSubReconciledOnly', 'financeAccountTxConfirmWarningReconciledOnly'],
    ])('action=%s -> sub=%s, warning=%s', (action, expectedSub, expectedWarning) => {
      render(
        <MovementLifecycleConfirmModal action={action} reconciled posted={false} onConfirm={vi.fn()} onClose={vi.fn()} />,
      );
      expect(screen.getByText(expectedSub)).toBeInTheDocument();
      expect(screen.getByText(expectedWarning)).toBeInTheDocument();
    });
  });

  describe('tier: posted only (reconciled=false) -> "PostedOnly" keys', () => {
    it.each([
      ['reactivate', 'financeAccountTxConfirmReactivateSubPostedOnly', 'financeAccountTxConfirmWarningPostedOnly'],
      ['delete', 'financeAccountTxConfirmDeleteSubPostedOnly', 'financeAccountTxConfirmWarningPostedOnly'],
    ])('action=%s -> sub=%s, warning=%s', (action, expectedSub, expectedWarning) => {
      render(
        <MovementLifecycleConfirmModal action={action} reconciled={false} posted onConfirm={vi.fn()} onClose={vi.fn()} />,
      );
      expect(screen.getByText(expectedSub)).toBeInTheDocument();
      expect(screen.getByText(expectedWarning)).toBeInTheDocument();
    });
  });
});

describe('MovementLifecycleConfirmModal — item visibility (Conciliación / Asiento only, no Transacción)', () => {
  it('shows both items when reconciled && posted', () => {
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('reactivarItem1Title.')).toBeInTheDocument();
    expect(screen.getByText('reactivarItem3Title.')).toBeInTheDocument();
    // No Transacción item exists on the Movimientos wrapper.
    expect(screen.queryByText('reactivarItem2Title.')).not.toBeInTheDocument();
  });

  it('shows only Conciliación when reconciled and not posted', () => {
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted={false} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('reactivarItem1Title.')).toBeInTheDocument();
    expect(screen.queryByText('reactivarItem3Title.')).not.toBeInTheDocument();
  });

  it('shows only Asiento when posted and not reconciled', () => {
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled={false} posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByText('reactivarItem1Title.')).not.toBeInTheDocument();
    expect(screen.getByText('reactivarItem3Title.')).toBeInTheDocument();
  });
});

describe('MovementLifecycleConfirmModal — confirmIcon', () => {
  it('renders RotateCcw (width 15, strokeWidth 2.2) for action="reactivate"', () => {
    render(
      <MovementLifecycleConfirmModal action="reactivate" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    const icon = screen.getByTestId('icon-rotate-ccw');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-width', '15');
    expect(icon).toHaveAttribute('data-stroke-width', '2.2');
    expect(screen.queryByTestId('icon-trash2')).not.toBeInTheDocument();
  });

  it('renders Trash2 (width 15, strokeWidth 2.2) for action="delete"', () => {
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    const icon = screen.getByTestId('icon-trash2');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-width', '15');
    expect(icon).toHaveAttribute('data-stroke-width', '2.2');
    expect(screen.queryByTestId('icon-rotate-ccw')).not.toBeInTheDocument();
  });

  it('renders the icon inside the accept button, alongside the confirm label', () => {
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    const acceptButton = screen.getByTestId('movement-confirm-accept');
    expect(acceptButton).toContainElement(screen.getByTestId('icon-trash2'));
    expect(acceptButton).toHaveTextContent('financeAccountTxConfirmDeleteBtn');
  });
});

describe('MovementLifecycleConfirmModal — fixed testIdPrefix and cancelLabel', () => {
  it('uses the fixed "movement-confirm" testIdPrefix', () => {
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('movement-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('movement-confirm-close')).toBeInTheDocument();
    expect(screen.getByTestId('movement-confirm-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('movement-confirm-accept')).toBeInTheDocument();
  });

  it('uses the "financeAccountTxNewCancel" i18n key for the cancel label (not the payments\' "cancel" key)', () => {
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('financeAccountTxNewCancel')).toBeInTheDocument();
    expect(screen.queryByText('cancel')).not.toBeInTheDocument();
  });
});

describe('MovementLifecycleConfirmModal — confirm/reactivate button label', () => {
  it('uses financeAccountTxConfirmReactivateBtn for action="reactivate"', () => {
    render(
      <MovementLifecycleConfirmModal action="reactivate" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('financeAccountTxConfirmReactivateBtn')).toBeInTheDocument();
  });

  it('uses financeAccountTxConfirmDeleteBtn for action="delete"', () => {
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('financeAccountTxConfirmDeleteBtn')).toBeInTheDocument();
  });
});

describe('MovementLifecycleConfirmModal — callback passthrough', () => {
  it('calls onConfirm when the Accept button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={onConfirm} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByTestId('movement-confirm-accept'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the Cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByTestId('movement-confirm-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the header close (X) button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <MovementLifecycleConfirmModal action="delete" reconciled posted onConfirm={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByTestId('movement-confirm-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
