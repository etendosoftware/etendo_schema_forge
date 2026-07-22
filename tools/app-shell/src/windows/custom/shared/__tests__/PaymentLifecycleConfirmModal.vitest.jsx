// Unit tests for PaymentLifecycleConfirmModal (ETP-4500) — the Cobros/Pagos
// wrapper around the generic LifecycleConfirmModal. Covers the 3-tier
// title/sub/warning key derivation (reconciled > hasTransaction (deposited,
// via DEPOSITED_STATUSES) > Draft/fallback) across dir x action, item
// visibility (Conciliación/Transacción/Asiento), the `posted := hasTransaction`
// derivation (deliberately NOT `data.posted === 'Y'` — see the source's own
// comment), confirmIcon (RotateCcw/Trash2), the data=null/undefined fallback,
// and callback passthrough.

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
import PaymentLifecycleConfirmModal from '../PaymentLifecycleConfirmModal.jsx';

// --- Fixture statuses (real FIN_Payment.Status search_keys) ---

// Reconciled (also deposited — RPPC is a member of DEPOSITED_STATUSES too).
const RECONCILED = 'RPPC';
// Deposited but NOT reconciled — any of RPR/RDNC/PPM/PWNC/RPAE would do; RPR
// picked as the representative, with a couple more exercised explicitly below.
const DEPOSITED_NOT_RECONCILED = 'RPR';
// Never deposited (Draft) — not a member of DEPOSITED_STATUSES.
const DRAFT = 'RPAP';

// --- Tests ---

describe('PaymentLifecycleConfirmModal — title key derivation (reconciled x dir x action)', () => {
  const cases = [
    // dir, action, status, expectedTitleKey
    ['in', 'delete', DRAFT, 'paymentConfirmDeleteTitleIn'],
    ['in', 'delete', DEPOSITED_NOT_RECONCILED, 'paymentConfirmDeleteTitleIn'],
    ['in', 'delete', RECONCILED, 'paymentConfirmDeleteTitleIn'],
    ['out', 'delete', DRAFT, 'paymentConfirmDeleteTitleOut'],
    ['out', 'delete', DEPOSITED_NOT_RECONCILED, 'paymentConfirmDeleteTitleOut'],
    ['out', 'delete', RECONCILED, 'paymentConfirmDeleteTitleOut'],
    ['in', 'reactivate', DEPOSITED_NOT_RECONCILED, 'paymentConfirmReactivateTitleIn'],
    ['in', 'reactivate', RECONCILED, 'paymentConfirmReactivateTitleInReconciled'],
    ['out', 'reactivate', DEPOSITED_NOT_RECONCILED, 'paymentConfirmReactivateTitleOut'],
    ['out', 'reactivate', RECONCILED, 'paymentConfirmReactivateTitleOutReconciled'],
  ];

  it.each(cases)(
    'dir=%s action=%s status=%s -> title=%s',
    (dir, action, status, expectedTitleKey) => {
      render(
        <PaymentLifecycleConfirmModal
          dir={dir}
          action={action}
          data={{ status, posted: 'N' }}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText(expectedTitleKey)).toBeInTheDocument();
    },
  );
});

describe('PaymentLifecycleConfirmModal — 3-tier sub/warning key derivation', () => {
  describe('tier 1: reconciled (status=RPPC) — always wins regardless of dir/action', () => {
    it.each([
      ['in', 'delete', 'paymentConfirmDeleteSubInReconciled', 'reactivarWarningIn'],
      ['out', 'delete', 'paymentConfirmDeleteSubOutReconciled', 'reactivarWarningOut'],
      ['in', 'reactivate', 'reactivarInSub', 'reactivarWarningIn'],
      ['out', 'reactivate', 'reactivarOutSub', 'reactivarWarningOut'],
    ])('dir=%s action=%s -> sub=%s, warning=%s', (dir, action, expectedSub, expectedWarning) => {
      render(
        <PaymentLifecycleConfirmModal
          dir={dir}
          action={action}
          data={{ status: RECONCILED, posted: 'N' }}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText(expectedSub)).toBeInTheDocument();
      expect(screen.getByText(expectedWarning)).toBeInTheDocument();
    });
  });

  describe('tier 2: deposited but not reconciled (hasTransaction=true, reconciled=false)', () => {
    it.each([
      ['in', 'delete', 'paymentConfirmDeleteSubIn', 'paymentConfirmWarningPostedIn'],
      ['out', 'delete', 'paymentConfirmDeleteSubOut', 'paymentConfirmWarningPostedOut'],
      ['in', 'reactivate', 'paymentConfirmReactivateSubIn', 'paymentConfirmWarningPostedIn'],
      ['out', 'reactivate', 'paymentConfirmReactivateSubOut', 'paymentConfirmWarningPostedOut'],
    ])('dir=%s action=%s -> sub=%s, warning=%s', (dir, action, expectedSub, expectedWarning) => {
      render(
        <PaymentLifecycleConfirmModal
          dir={dir}
          action={action}
          data={{ status: DEPOSITED_NOT_RECONCILED, posted: 'N' }}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText(expectedSub)).toBeInTheDocument();
      expect(screen.getByText(expectedWarning)).toBeInTheDocument();
    });

    it.each(['RDNC', 'PPM', 'PWNC', 'RPAE'])(
      'status=%s (also a deposited, non-reconciled code) behaves the same as RPR',
      (status) => {
        render(
          <PaymentLifecycleConfirmModal
            dir="in"
            action="delete"
            data={{ status, posted: 'N' }}
            onConfirm={vi.fn()}
            onClose={vi.fn()}
          />,
        );
        expect(screen.getByText('paymentConfirmDeleteSubIn')).toBeInTheDocument();
        expect(screen.getByText('paymentConfirmWarningPostedIn')).toBeInTheDocument();
      },
    );
  });

  describe('tier 3: Draft — never deposited (reconciled=false, hasTransaction=false)', () => {
    it.each([
      ['in', 'paymentConfirmDeleteSubInDraft'],
      ['out', 'paymentConfirmDeleteSubOutDraft'],
    ])('dir=%s delete -> sub=%s, warning=paymentConfirmWarning', (dir, expectedSub) => {
      render(
        <PaymentLifecycleConfirmModal
          dir={dir}
          action="delete"
          data={{ status: DRAFT, posted: 'N' }}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByText(expectedSub)).toBeInTheDocument();
      expect(screen.getByText('paymentConfirmWarning')).toBeInTheDocument();
    });
  });
});

describe('PaymentLifecycleConfirmModal — item visibility (Conciliación/Transacción/Asiento)', () => {
  it('shows all three items when reconciled (status=RPPC)', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={{ status: RECONCILED, posted: 'N' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('reactivarItem1Title.')).toBeInTheDocument();
    expect(screen.getByText('reactivarItem2Title.')).toBeInTheDocument();
    expect(screen.getByText('reactivarItem3Title.')).toBeInTheDocument();
  });

  it('shows Transacción + Asiento but not Conciliación when deposited-not-reconciled', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={{ status: DEPOSITED_NOT_RECONCILED, posted: 'N' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByText('reactivarItem1Title.')).not.toBeInTheDocument();
    expect(screen.getByText('reactivarItem2Title.')).toBeInTheDocument();
    expect(screen.getByText('reactivarItem3Title.')).toBeInTheDocument();
  });

  it('shows no items for a Draft payment', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={{ status: DRAFT, posted: 'N' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByText('reactivarItem1Title.')).not.toBeInTheDocument();
    expect(screen.queryByText('reactivarItem2Title.')).not.toBeInTheDocument();
    expect(screen.queryByText('reactivarItem3Title.')).not.toBeInTheDocument();
  });
});

describe('PaymentLifecycleConfirmModal — posted derivation is tied to hasTransaction, NOT the literal data.posted flag', () => {
  it('shows the Asiento item for a deposited-not-reconciled payment even when data.posted is "N"', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={{ status: DEPOSITED_NOT_RECONCILED, posted: 'N' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('reactivarItem3Title.')).toBeInTheDocument();
  });

  it('shows the Asiento item for a reconciled payment even when data.posted is "N"', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={{ status: RECONCILED, posted: 'N' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('reactivarItem3Title.')).toBeInTheDocument();
  });

  it('hides the Asiento item for a Draft payment even when data.posted is literally "Y"', () => {
    // Regression guard: `posted` is derived from DEPOSITED_STATUSES.has(status),
    // never from the literal data.posted flag.
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={{ status: DRAFT, posted: 'Y' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByText('reactivarItem3Title.')).not.toBeInTheDocument();
  });
});

describe('PaymentLifecycleConfirmModal — confirmIcon', () => {
  it('renders RotateCcw (width 15, strokeWidth 2.2) for action="reactivate"', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="reactivate" data={{ status: DEPOSITED_NOT_RECONCILED, posted: 'N' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    const icon = screen.getByTestId('icon-rotate-ccw');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-width', '15');
    expect(icon).toHaveAttribute('data-stroke-width', '2.2');
    expect(screen.queryByTestId('icon-trash2')).not.toBeInTheDocument();
  });

  it('renders Trash2 (width 15, strokeWidth 2.2) for action="delete"', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={{ status: DRAFT, posted: 'N' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    const icon = screen.getByTestId('icon-trash2');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-width', '15');
    expect(icon).toHaveAttribute('data-stroke-width', '2.2');
    expect(screen.queryByTestId('icon-rotate-ccw')).not.toBeInTheDocument();
  });

  it('renders the icon inside the accept button, alongside the confirm label', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={{ status: DRAFT, posted: 'N' }} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    const acceptButton = screen.getByTestId('payment-confirm-accept');
    expect(acceptButton).toContainElement(screen.getByTestId('icon-trash2'));
    expect(acceptButton).toHaveTextContent('paymentConfirmDeleteBtn');
  });
});

describe('PaymentLifecycleConfirmModal — data=null/undefined fallback', () => {
  it.each([null, undefined])('renders without crashing, Draft-tier (reconciled=false/no items) when data is %s', (data) => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={data} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('payment-confirm-modal')).toBeInTheDocument();
    expect(screen.queryByText('reactivarItem1Title.')).not.toBeInTheDocument();
    expect(screen.queryByText('reactivarItem2Title.')).not.toBeInTheDocument();
    expect(screen.queryByText('reactivarItem3Title.')).not.toBeInTheDocument();
    expect(screen.getByText('paymentConfirmDeleteSubInDraft')).toBeInTheDocument();
    expect(screen.getByText('paymentConfirmWarning')).toBeInTheDocument();
  });
});

describe('PaymentLifecycleConfirmModal — callback passthrough and fixed testIdPrefix', () => {
  it('uses the fixed "payment-confirm" testIdPrefix', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={null} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByTestId('payment-confirm-modal')).toBeInTheDocument();
    expect(screen.getByTestId('payment-confirm-close')).toBeInTheDocument();
    expect(screen.getByTestId('payment-confirm-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('payment-confirm-accept')).toBeInTheDocument();
  });

  it('uses the "cancel" i18n key for the cancel label', () => {
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={null} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when the Accept button is clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={null} onConfirm={onConfirm} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByTestId('payment-confirm-accept'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the Cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={null} onConfirm={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByTestId('payment-confirm-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the header close (X) button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <PaymentLifecycleConfirmModal dir="in" action="delete" data={null} onConfirm={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByTestId('payment-confirm-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
