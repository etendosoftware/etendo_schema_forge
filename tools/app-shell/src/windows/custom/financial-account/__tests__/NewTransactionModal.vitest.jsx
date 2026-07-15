// Unit tests for the "Nueva transacción (GL item)" modal (ETP-4500).
// Focus: amount → deposit/payment mapping per direction, dimension visibility,
// Save-enabled validity gate, the createMovement payload, and the success /
// error paths. Mocks are declared before imports (Vitest hoists vi.mock).

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

// createMovement is the single side effect under test — a shared spy so each
// test can drive success / rejection and assert the payload.
const createMovement = vi.fn();
const updateMovement = vi.fn();
let creatingFlag = false;
vi.mock('@/hooks/useCreateMovement', () => ({
  useCreateMovement: () => ({ createMovement, creating: creatingFlag }),
  useUpdateMovement: () => ({ updateMovement, updating: false }),
}));

vi.mock('@/hooks/useMovementLookups', () => ({
  useGLItemLookup: () => ({ results: [], loading: false }),
  useBPartnerLookup: () => ({ results: [], loading: false }),
  useDimensionLookup: () => ({ results: [], loading: false }),
}));

// Icons → no-ops.
vi.mock('lucide-react', () => ({
  X: () => null,
  Check: () => null,
  ArrowDown: () => null,
  ArrowUp: () => null,
  BarChart3: () => null,
}));

// Radix Dialog — render children only while open, so the closed-state test is
// meaningful. DialogContent forwards data-testid (tx-new-modal).
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog-root">{children}</div> : null),
  DialogContent: ({ children, 'data-testid': dtid }) => <div data-testid={dtid}>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
}));

// Field primitives → lightweight stubs that expose the testids + callbacks.
// ChipSelect resolves a deterministic { id, name } keyed off its `testId`, so
// payload assertions can distinguish the GL item, the contact and each dimension.
vi.mock('@/components/forms/fields', () => ({
  Field: ({ label, children }) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
  DateInput: ({ value, onChange, 'data-testid': dtid }) => (
    <input data-testid={dtid} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  ),
  AmountInput: ({ value, onChange, onBlur, 'data-testid': dtid }) => (
    <input data-testid={dtid} value={value ?? ''} onChange={onChange} onBlur={onBlur} />
  ),
  ChipSelect: ({ value, onChange, testId }) => (
    <div>
      <span data-testid={`${testId}-value`}>{value?.id ?? ''}</span>
      <button
        type="button"
        data-testid={`${testId}-pick`}
        onClick={() => onChange({ id: `${testId}-id`, name: `${testId}-name` })}>
        pick
      </button>
      <button type="button" data-testid={`${testId}-clear`} onClick={() => onChange(null)}>clear</button>
    </div>
  ),
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayISO } from '@/components/payment/paymentData';
import { NewTransactionModal } from '../NewTransactionModal.jsx';

const CURRENCY = { id: 'cur-1', iso: 'USD' };

function renderModal(overrides = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const props = {
    open: true,
    accountId: 'acc-1',
    accountName: 'BBVA',
    accountCurrency: CURRENCY,
    dimensions: [],
    onClose,
    onSuccess,
    ...overrides,
  };
  const utils = render(<NewTransactionModal {...props} />);
  return { onClose, onSuccess, ...utils };
}

// Picks the required fields (GL item + a valid amount) to make the form valid.
async function makeValid(user, amount = '100') {
  await user.click(screen.getByTestId('tx-glitem-pick'));
  await user.type(screen.getByTestId('tx-amount'), amount);
}

describe('NewTransactionModal — rendering & validity', () => {
  beforeEach(() => {
    createMovement.mockReset();
    createMovement.mockResolvedValue({ id: 'mov-1' });
    creatingFlag = false;
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('tx-new-modal')).not.toBeInTheDocument();
  });

  it('renders the modal shell and core fields when open', () => {
    renderModal();
    expect(screen.getByTestId('tx-new-modal')).toBeInTheDocument();
    expect(screen.getByTestId('tx-dir-in')).toBeInTheDocument();
    expect(screen.getByTestId('tx-dir-out')).toBeInTheDocument();
    expect(screen.getByTestId('tx-amount')).toBeInTheDocument();
    expect(screen.getByTestId('tx-description')).toBeInTheDocument();
    expect(screen.getByTestId('tx-new-save')).toBeInTheDocument();
  });

  it('disables Save until a GL item and a positive amount are set', async () => {
    const user = userEvent.setup();
    renderModal();
    const save = screen.getByTestId('tx-new-save');
    expect(save).toBeDisabled();

    // GL item alone is not enough — amount is still empty (0).
    await user.click(screen.getByTestId('tx-glitem-pick'));
    expect(save).toBeDisabled();

    // A zero amount does not satisfy amount > 0.
    await user.type(screen.getByTestId('tx-amount'), '0');
    expect(save).toBeDisabled();

    // A positive amount unlocks Save.
    await user.clear(screen.getByTestId('tx-amount'));
    await user.type(screen.getByTestId('tx-amount'), '100');
    expect(save).toBeEnabled();
  });

  it('formats the amount to European 2-decimals on blur ("20" → "20,00")', async () => {
    const user = userEvent.setup();
    renderModal();
    const amount = screen.getByTestId('tx-amount');
    await user.type(amount, '20');
    await user.tab(); // blur
    expect(amount).toHaveValue('20,00');
  });
});

describe('NewTransactionModal — direction → amount mapping', () => {
  beforeEach(() => {
    createMovement.mockReset();
    createMovement.mockResolvedValue({ id: 'mov-1' });
    creatingFlag = false;
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('maps the amount to paymentAmount (deposit 0) for the default "out" direction', async () => {
    const user = userEvent.setup();
    renderModal();
    await makeValid(user, '150');
    await user.click(screen.getByTestId('tx-new-save'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledOnce());
    const payload = createMovement.mock.calls[0][0];
    expect(payload.trxType).toBe('BPW');
    expect(payload.paymentAmount).toBe(150);
    expect(payload.depositAmount).toBe(0);
  });

  it('maps the amount to depositAmount (payment 0) when "Entrada" is selected', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId('tx-dir-in'));
    await makeValid(user, '150');
    await user.click(screen.getByTestId('tx-new-save'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledOnce());
    const payload = createMovement.mock.calls[0][0];
    expect(payload.trxType).toBe('BPD');
    expect(payload.depositAmount).toBe(150);
    expect(payload.paymentAmount).toBe(0);
  });
});

describe('NewTransactionModal — dimension visibility', () => {
  beforeEach(() => {
    createMovement.mockReset();
    createMovement.mockResolvedValue({ id: 'mov-1' });
    creatingFlag = false;
  });

  it('always shows Contacto and hides all optional dimensions when none are enabled', () => {
    renderModal({ dimensions: [] });
    expect(screen.getByTestId('tx-contact-pick')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-dim-costcenter-pick')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tx-dim-project-pick')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tx-dim-product-pick')).not.toBeInTheDocument();
  });

  it('shows only the optional dimensions listed in the `dimensions` prop', () => {
    renderModal({ dimensions: ['project', 'costcenter'] });
    expect(screen.getByTestId('tx-contact-pick')).toBeInTheDocument();
    expect(screen.getByTestId('tx-dim-project-pick')).toBeInTheDocument();
    expect(screen.getByTestId('tx-dim-costcenter-pick')).toBeInTheDocument();
    expect(screen.queryByTestId('tx-dim-product-pick')).not.toBeInTheDocument();
  });
});

describe('NewTransactionModal — createMovement payload', () => {
  beforeEach(() => {
    createMovement.mockReset();
    createMovement.mockResolvedValue({ id: 'mov-1' });
    creatingFlag = false;
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('builds the full payload from account, direction, GL item, contact and dimensions', async () => {
    const user = userEvent.setup();
    renderModal({ dimensions: ['project', 'costcenter', 'product'] });

    await user.click(screen.getByTestId('tx-glitem-pick'));
    await user.type(screen.getByTestId('tx-amount'), '250');
    await user.type(screen.getByTestId('tx-description'), 'Bank fee');
    await user.click(screen.getByTestId('tx-contact-pick'));
    await user.click(screen.getByTestId('tx-dim-project-pick'));
    await user.click(screen.getByTestId('tx-dim-costcenter-pick'));
    await user.click(screen.getByTestId('tx-dim-product-pick'));

    await user.click(screen.getByTestId('tx-new-save'));
    await waitFor(() => expect(createMovement).toHaveBeenCalledOnce());

    const payload = createMovement.mock.calls[0][0];
    const today = todayISO();
    expect(payload).toMatchObject({
      FIN_Financial_Account_ID: 'acc-1',
      trxType: 'BPW',
      transactionDate: `${today}T00:00:00Z`,
      accountingDate: `${today}T00:00:00Z`,
      paymentAmount: 250,
      depositAmount: 0,
      currencyId: 'cur-1',
      description: 'Bank fee',
      glItemId: 'tx-glitem-id',
      bpartnerId: 'tx-contact-id',
      costcenterId: 'tx-dim-costcenter-id',
      projectId: 'tx-dim-project-id',
      productId: 'tx-dim-product-id',
    });
  });

  it('sends null for optional ids that were left unset', async () => {
    const user = userEvent.setup();
    renderModal({ dimensions: [] });
    await makeValid(user, '100');
    await user.click(screen.getByTestId('tx-new-save'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledOnce());
    const payload = createMovement.mock.calls[0][0];
    expect(payload.bpartnerId).toBeNull();
    expect(payload.costcenterId).toBeNull();
    expect(payload.projectId).toBeNull();
    expect(payload.productId).toBeNull();
    expect(payload.glItemId).toBe('tx-glitem-id');
  });
});

describe('NewTransactionModal — success & error paths', () => {
  beforeEach(() => {
    createMovement.mockReset();
    creatingFlag = false;
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('on success fires toast.success, onSuccess and onClose', async () => {
    createMovement.mockResolvedValue({ id: 'mov-1' });
    const user = userEvent.setup();
    const { onClose, onSuccess } = renderModal();
    await makeValid(user, '100');
    await user.click(screen.getByTestId('tx-new-save'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxNewSuccess'));
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('on failure fires toast.error and does NOT close or call onSuccess', async () => {
    createMovement.mockRejectedValue(new Error('Backend refused'));
    const user = userEvent.setup();
    const { onClose, onSuccess } = renderModal();
    await makeValid(user, '100');
    await user.click(screen.getByTestId('tx-new-save'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Backend refused'));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('NewTransactionModal — Guardar vs Confirmar', () => {
  beforeEach(() => {
    createMovement.mockReset().mockResolvedValue({ id: 'mov-1' });
    updateMovement.mockReset().mockResolvedValue({ id: 'mov-1' });
    creatingFlag = false;
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('Guardar creates a Draft (process: false)', async () => {
    const user = userEvent.setup();
    renderModal();
    await makeValid(user, '100');
    await user.click(screen.getByTestId('tx-new-save'));
    await waitFor(() => expect(createMovement).toHaveBeenCalledOnce());
    expect(createMovement.mock.calls[0][0].process).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxNewSuccess');
  });

  it('Confirmar creates AND processes (process: true)', async () => {
    const user = userEvent.setup();
    renderModal();
    await makeValid(user, '100');
    await user.click(screen.getByTestId('tx-new-confirm'));
    await waitFor(() => expect(createMovement).toHaveBeenCalledOnce());
    expect(createMovement.mock.calls[0][0].process).toBe(true);
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxConfirmSuccess');
  });
});

describe('NewTransactionModal — edit mode', () => {
  const EDIT_MOVEMENT = {
    id: 'mov-9',
    trxType: 'BPW',
    date: '2026-07-01T00:00:00Z',
    depositAmount: 0,
    withdrawalAmount: 30,
    description: 'Old note',
    glItemId: 'gl-9',
    glItem: 'Capital social',
    bpartnerId: 'bp-9',
    contact: 'ACME',
    projectId: 'pr-9',
    costcenterId: 'cc-9',
    productId: 'prod-9',
    dimensions: { project: 'Proj', costcenter: 'CC', product: 'Prod' },
  };

  beforeEach(() => {
    createMovement.mockReset().mockResolvedValue({ id: 'mov-1' });
    updateMovement.mockReset().mockResolvedValue({ id: 'mov-9' });
    creatingFlag = false;
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it('prefills from the movement and updates it (not create) on Guardar', async () => {
    const user = userEvent.setup();
    renderModal({ movement: EDIT_MOVEMENT, dimensions: ['project', 'costcenter', 'product'] });

    // Prefilled — no picking needed; Save is enabled straight away.
    expect(screen.getByTestId('tx-glitem-value')).toHaveTextContent('gl-9');
    await user.click(screen.getByTestId('tx-new-save'));

    await waitFor(() => expect(updateMovement).toHaveBeenCalledOnce());
    expect(createMovement).not.toHaveBeenCalled();
    expect(updateMovement.mock.calls[0][0]).toMatchObject({
      id: 'mov-9',
      trxType: 'BPW',
      paymentAmount: 30,
      depositAmount: 0,
      glItemId: 'gl-9',
      bpartnerId: 'bp-9',
      projectId: 'pr-9',
      costcenterId: 'cc-9',
      productId: 'prod-9',
      process: false,
    });
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxEditSuccess');
  });
});
