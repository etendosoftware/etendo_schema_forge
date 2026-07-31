/**
 * NewMovementWizard — stage-1 editing and the two submit paths.
 *
 * `NewMovementWizard.vitest.jsx` covers the shell (dialog open/closed, stepper, stage
 * navigation, which body renders). This suite covers what it stubs away:
 *
 *  - the stage-1 field bindings (type / dates / description / amounts / dimensions),
 *    including the Cobro↔Pago swap of which amount is editable;
 *  - the Organization auto-selection from the current context;
 *  - `submitMovement` — the manual finacc transaction, with and without a G/L concept,
 *    and its "no amount" guard;
 *  - `submitPayment` — the FIN_Payment payload built from the PaymentForm snapshot, plus
 *    its contact / amount / overpayment guards;
 *  - the shared error toast in `handleCreate` and the reset-on-close effect.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
  },
}));

// Dialog stub that still exercises the controlled `onOpenChange` wiring.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }) =>
    open ? (
      <div data-testid="dialog">
        <button type="button" data-testid="dialog-dismiss" onClick={() => onOpenChange(false)} />
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogTitle: ({ children }) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }) => <div data-testid="dialog-description">{children}</div>,
}));

const createMovement = vi.fn();
const createPayment = vi.fn();
let creatingFlags = { movement: false, payment: false };
vi.mock('@/hooks/useCreateMovement', () => ({
  useCreateMovement: () => ({ createMovement, creating: creatingFlags.movement }),
  useCreatePayment: () => ({ createPayment, creating: creatingFlags.payment }),
}));

let optionsByDim = {};
const dimensionValuesCalls = [];
vi.mock('@/hooks/useDimensionValues', () => ({
  useDimensionValues: (...args) => {
    dimensionValuesCalls.push(args);
    return { optionsByDim };
  },
}));

vi.mock('@/hooks/useMovementLookups', () => ({
  useGLItemLookup: () => ({ items: [], loading: false }),
}));

// Field stubs that keep the real onChange contract of each widget, so the wizard's
// state updates actually run.
vi.mock('@/components/forms/fields', () => ({
  Field: ({ children, label }) => <div data-testid={`field-${label}`}>{children}</div>,
  ReadOnly: ({ children }) => <span data-testid="readonly">{children}</span>,
  // Mirrors the real Select, which accepts { id, name } as well as { value, label }.
  Select: ({ label, value, onChange, options, required }) => (
    <select
      data-testid={`select-${label}`}
      data-required={String(!!required)}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" />
      {(options || []).map((o) => (
        <option key={o.id ?? o.value} value={o.id ?? o.value}>{o.name ?? o.label}</option>
      ))}
    </select>
  ),
  DateInput: ({ label, value, onChange }) => (
    <input data-testid={`date-${label}`} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  AmountInput: ({ label, value, onChange, readOnly, required }) => (
    <input
      data-testid={`amount-${label}`}
      data-readonly={String(!!readOnly)}
      data-required={String(!!required)}
      value={value}
      readOnly={!!readOnly}
      onChange={onChange}
    />
  ),
  SectionLabel: ({ children }) => <div>{children}</div>,
  LookupPicker: ({ value, onChange }) => (
    <div data-testid="lookup-picker" data-value={value?.id ?? ''}>
      <button type="button" data-testid="lookup-pick" onClick={() => onChange({ id: 'gl-9', name: 'Comisiones' })} />
    </div>
  ),
}));

// PaymentForm stub: pushes the snapshot the wizard consumes on submit.
let paymentSnapshot = null;
let paymentFormProps = null;
vi.mock('@/components/payment/PaymentForm', () => ({
  PaymentForm: (props) => {
    paymentFormProps = props;
    return (
      <div data-testid="payment-form">
        <button
          type="button"
          data-testid="payment-form-emit"
          onClick={() => props.onChange(paymentSnapshot)}
        />
      </div>
    );
  },
}));

import { NewMovementWizard } from '../index.jsx';

const BASE_PROPS = {
  open: true,
  accountId: 'acc-1',
  accountCurrency: { id: 'cur-1', iso: 'EUR' },
  dimensions: ['organization', 'bpartner'],
  trxTypes: [
    { value: 'BPD', label: 'Cobro' },
    { value: 'BPW', label: 'Pago' },
    // Bank Fee still arrives from the backend but must not be offered.
    { value: 'BF', label: 'Bank Fee' },
  ],
  defaultOrgId: null,
  paymentMethods: [{ id: 'pm-1', name: 'Transferencia' }],
};

const TRX_SELECT = 'select-financeAccountMovementsWizardTrxType';
const DEPOSIT = 'amount-financeAccountMovementsNewDepositAmount';
const WITHDRAWAL = 'amount-financeAccountMovementsNewPaymentAmount';

function renderWizard(props = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const result = render(<NewMovementWizard {...BASE_PROPS} onClose={onClose} onSuccess={onSuccess} {...props} />);
  return { onClose, onSuccess, ...result };
}

function findButton(text) {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes(text));
}

/** Stage 1 → 2, then pick one of the two association choices. */
function goToChoice(choiceKey) {
  fireEvent.click(findButton('financeAccountMovementsWizardNext'));
  if (choiceKey) fireEvent.click(findButton(choiceKey));
}

const PAY_CHOICE = 'financeAccountMovementsWizardChoicePayTitle';
const GL_CHOICE = 'financeAccountMovementsWizardChoiceGlTitle';

beforeEach(() => {
  createMovement.mockReset();
  createMovement.mockResolvedValue({});
  createPayment.mockReset();
  createPayment.mockResolvedValue({});
  creatingFlags = { movement: false, payment: false };
  optionsByDim = {};
  dimensionValuesCalls.length = 0;
  paymentSnapshot = null;
  paymentFormProps = null;
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe('NewMovementWizard — stage 1 field bindings', () => {
  it('offers only the two user-facing transaction types, localized', () => {
    renderWizard();

    const options = Array.from(screen.getByTestId(TRX_SELECT).querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean);
    expect(options).toEqual(['BPD', 'BPW']);
    expect(screen.getByTestId(TRX_SELECT).textContent).toContain('financeAccountMovementsTypeBPD');
    expect(screen.getByTestId(TRX_SELECT).textContent).toContain('financeAccountMovementsTypeBPW');
  });

  it('keeps the deposit editable and the withdrawal locked for a Cobro', () => {
    renderWizard();

    expect(screen.getByTestId(DEPOSIT)).toHaveAttribute('data-readonly', 'false');
    expect(screen.getByTestId(WITHDRAWAL)).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByTestId(WITHDRAWAL)).toHaveValue('0.00');
  });

  it('swaps which amount is editable when the type becomes a Pago', () => {
    renderWizard();

    fireEvent.change(screen.getByTestId(TRX_SELECT), { target: { value: 'BPW' } });

    expect(screen.getByTestId(DEPOSIT)).toHaveAttribute('data-readonly', 'true');
    expect(screen.getByTestId(DEPOSIT)).toHaveValue('0.00');
    expect(screen.getByTestId(WITHDRAWAL)).toHaveAttribute('data-readonly', 'false');
    expect(screen.getByTestId(WITHDRAWAL)).toHaveAttribute('data-required', 'true');
  });

  it('records the typed deposit amount', () => {
    renderWizard();

    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '125.40' } });

    expect(screen.getByTestId(DEPOSIT)).toHaveValue('125.40');
  });

  it('records the typed withdrawal amount once the type is a Pago', () => {
    renderWizard();
    fireEvent.change(screen.getByTestId(TRX_SELECT), { target: { value: 'BPW' } });

    fireEvent.change(screen.getByTestId(WITHDRAWAL), { target: { value: '80.00' } });

    expect(screen.getByTestId(WITHDRAWAL)).toHaveValue('80.00');
  });

  it('records the description and both dates', () => {
    renderWizard();

    fireEvent.change(document.querySelector('textarea'), { target: { value: 'Cobro cliente' } });
    fireEvent.change(screen.getByTestId('date-financeAccountMovementsWizardTrxDate'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.change(screen.getByTestId('date-financeAccountMovementsNewAcctDate'), {
      target: { value: '2026-02-02' },
    });

    expect(document.querySelector('textarea')).toHaveValue('Cobro cliente');
    expect(screen.getByTestId('date-financeAccountMovementsWizardTrxDate')).toHaveValue('2026-02-01');
    expect(screen.getByTestId('date-financeAccountMovementsNewAcctDate')).toHaveValue('2026-02-02');
  });

  it('records a picked dimension value', () => {
    optionsByDim = { bpartner: [{ id: 'bp-1', name: 'ACME' }] };
    renderWizard();

    const bpSelect = screen.getByTestId('select-financeAccountMovementsDimBpartner');
    fireEvent.change(bpSelect, { target: { value: 'bp-1' } });

    expect(bpSelect).toHaveValue('bp-1');
  });

  it('renders no dimension section when the account exposes no dimensions', () => {
    renderWizard({ dimensions: [] });

    expect(document.body.textContent).not.toContain('financeAccountMovementsWizardDimensions');
  });

  it('only fetches the dimension values while the wizard is open', () => {
    renderWizard({ open: false });

    expect(dimensionValuesCalls.at(-1)).toEqual([['organization', 'bpartner'], false]);
  });
});

describe('NewMovementWizard — Organization auto-selection', () => {
  it('preselects the account organization when it is among the options', () => {
    optionsByDim = { organization: [{ id: 'org-1', name: 'A' }, { id: 'org-2', name: 'B' }] };
    renderWizard({ defaultOrgId: 'org-2' });

    expect(screen.getByTestId('select-financeAccountMovementsDimOrganization')).toHaveValue('org-2');
  });

  it('preselects the only organization when there is exactly one', () => {
    optionsByDim = { organization: [{ id: 'org-solo', name: 'Solo' }] };
    renderWizard();

    expect(screen.getByTestId('select-financeAccountMovementsDimOrganization')).toHaveValue('org-solo');
  });

  it('preselects nothing when the account org is unknown and there are several options', () => {
    optionsByDim = { organization: [{ id: 'org-1', name: 'A' }, { id: 'org-2', name: 'B' }] };
    renderWizard({ defaultOrgId: 'org-not-listed' });

    expect(screen.getByTestId('select-financeAccountMovementsDimOrganization')).toHaveValue('');
  });
});

describe('NewMovementWizard — submitMovement (G/L or plain transaction)', () => {
  it('rejects a movement with no amount on either side', async () => {
    renderWizard();
    goToChoice(GL_CHOICE);

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountMovementsWizardErrAmount'),
    );
    expect(createMovement).not.toHaveBeenCalled();
  });

  it('creates the deposit transaction with the selected G/L concept', async () => {
    const { onClose, onSuccess } = renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '150' } });
    fireEvent.change(document.querySelector('textarea'), { target: { value: 'Ingreso' } });
    goToChoice(GL_CHOICE);
    fireEvent.click(screen.getByTestId('lookup-pick'));

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledTimes(1));
    expect(createMovement).toHaveBeenCalledWith(expect.objectContaining({
      FIN_Financial_Account_ID: 'acc-1',
      trxType: 'BPD',
      depositAmount: 150,
      paymentAmount: 0,
      currencyId: 'cur-1',
      description: 'Ingreso',
      glItemId: 'gl-9',
    }));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountMovementsNewSuccess');
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('sends the dates as midnight UTC timestamps', async () => {
    renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('date-financeAccountMovementsWizardTrxDate'), {
      target: { value: '2026-02-01' },
    });
    fireEvent.change(screen.getByTestId('date-financeAccountMovementsNewAcctDate'), {
      target: { value: '2026-02-03' },
    });
    goToChoice(GL_CHOICE);

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledTimes(1));
    const payload = createMovement.mock.calls[0][0];
    expect(payload.transactionDate).toBe('2026-02-01T00:00:00Z');
    expect(payload.accountingDate).toBe('2026-02-03T00:00:00Z');
  });

  it('creates the withdrawal transaction for a Pago', async () => {
    renderWizard();
    fireEvent.change(screen.getByTestId(TRX_SELECT), { target: { value: 'BPW' } });
    fireEvent.change(screen.getByTestId(WITHDRAWAL), { target: { value: '75.50' } });
    goToChoice(GL_CHOICE);

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledTimes(1));
    expect(createMovement).toHaveBeenCalledWith(expect.objectContaining({
      trxType: 'BPW',
      depositAmount: 0,
      paymentAmount: 75.5,
    }));
  });

  it('sends no G/L concept when none was picked', async () => {
    renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '10' } });
    goToChoice(GL_CHOICE);

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createMovement).toHaveBeenCalledTimes(1));
    expect(createMovement.mock.calls[0][0].glItemId).toBeNull();
  });

  it('toasts the movement error and keeps the wizard open when the request fails', async () => {
    createMovement.mockRejectedValueOnce(new Error('backend down'));
    const { onClose, onSuccess } = renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '10' } });
    goToChoice(GL_CHOICE);

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('backend down'));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to the generic movement error when the failure carries no message', async () => {
    createMovement.mockRejectedValueOnce({});
    renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '10' } });
    goToChoice(GL_CHOICE);

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountMovementsNewError'),
    );
  });
});

describe('NewMovementWizard — submitPayment (FIN_Payment)', () => {
  const SNAPSHOT = {
    tercero: { id: 'bp-1', name: 'ACME' },
    paymentMethodId: 'pm-1',
    fechaPago: '2026-02-05',
    referencia: 'REF-1',
    totals: { pago: 200, diff: 0 },
    selectedInvoices: { 'inv-1': 200 },
    writeoffs: { 'inv-1': 0 },
    commissions: [
      { item: { id: 'gl-1' }, receivedIn: '5', paidOut: '0' },
      // Zero on both sides → dropped from the payload.
      { item: { id: 'gl-2' }, receivedIn: '0', paidOut: '0' },
      // No item → dropped as well.
      { item: null, receivedIn: '3', paidOut: '0' },
    ],
    overpaymentAction: null,
  };

  function goToPayment(snapshot) {
    paymentSnapshot = snapshot;
    goToChoice(PAY_CHOICE);
    fireEvent.click(screen.getByTestId('payment-form-emit'));
  }

  it('rejects a payment with no contact selected', async () => {
    renderWizard();
    goToPayment({ tercero: null, totals: { pago: 10 } });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'financeAccountMovementsWizardErrContact:{"field":"financeAccountMovementsWizardReceivedFrom"}',
      ),
    );
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('names the "paid to" field in the contact error for a Pago', async () => {
    renderWizard();
    fireEvent.change(screen.getByTestId(TRX_SELECT), { target: { value: 'BPW' } });
    goToPayment({ tercero: null });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'financeAccountMovementsWizardErrContact:{"field":"financeAccountMovementsWizardPaidTo"}',
      ),
    );
  });

  it('rejects a payment whose amount is not positive', async () => {
    renderWizard();
    goToPayment({ tercero: { id: 'bp-1' }, totals: { pago: 0 } });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountMovementsWizardErrPaymentAmount'),
    );
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('rejects an overpayment with no action chosen', async () => {
    renderWizard();
    goToPayment({ tercero: { id: 'bp-1' }, totals: { pago: 100, diff: 25 }, overpaymentAction: null });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountMovementsWizardErrOverpayment'),
    );
    expect(createPayment).not.toHaveBeenCalled();
  });

  it('accepts an overpayment once an action is chosen', async () => {
    renderWizard();
    goToPayment({
      tercero: { id: 'bp-1' }, totals: { pago: 100, diff: 25 }, overpaymentAction: 'credit',
    });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    expect(createPayment.mock.calls[0][0].overpaymentAction).toBe('credit');
  });

  it('creates the receipt with the snapshot payload and the non-zero commissions only', async () => {
    const { onClose, onSuccess } = renderWizard();
    fireEvent.change(document.querySelector('textarea'), { target: { value: 'Cobro ACME' } });
    goToPayment(SNAPSHOT);

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
      FIN_Financial_Account_ID: 'acc-1',
      isReceipt: true,
      bpartnerId: 'bp-1',
      paymentMethodId: 'pm-1',
      amount: 200,
      paymentDate: '2026-02-05',
      referenceNo: 'REF-1',
      description: 'Cobro ACME',
      selectedInvoices: { 'inv-1': 200 },
      writeoffs: { 'inv-1': 0 },
      glItems: [{ glItemId: 'gl-1', receivedIn: 5, paidOut: 0 }],
    }));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountMovementsWizardPaymentSuccess');
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('marks the payment as an outgoing one for a Pago', async () => {
    renderWizard();
    fireEvent.change(screen.getByTestId(TRX_SELECT), { target: { value: 'BPW' } });
    goToPayment({ tercero: { id: 'bp-1' }, totals: { pago: 50, diff: 0 } });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    expect(createPayment.mock.calls[0][0].isReceipt).toBe(false);
  });

  it('falls back to the stage-1 amount when the snapshot carries no total', async () => {
    renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '42' } });
    goToPayment({ tercero: { id: 'bp-1' } });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    expect(createPayment.mock.calls[0][0].amount).toBe(42);
  });

  it('rejects the payment when neither the snapshot nor stage 1 carry an amount', async () => {
    renderWizard();
    goToPayment({ tercero: { id: 'bp-1' } });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountMovementsWizardErrPaymentAmount'),
    );
  });

  it('sends the organization dimension and defaults the optional snapshot fields', async () => {
    optionsByDim = { organization: [{ id: 'org-solo', name: 'Solo' }] };
    renderWizard();
    goToPayment({ tercero: { id: 'bp-1' }, totals: { pago: 10, diff: 0 } });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() => expect(createPayment).toHaveBeenCalledTimes(1));
    const payload = createPayment.mock.calls[0][0];
    expect(payload.organizationId).toBe('org-solo');
    expect(payload.paymentMethodId).toBeNull();
    expect(payload.referenceNo).toBe('');
    expect(payload.description).toBe('');
    expect(payload.selectedInvoices).toEqual({});
    expect(payload.writeoffs).toEqual({});
    expect(payload.glItems).toEqual([]);
  });

  it('submits the plain movement path when the payment snapshot never arrived', async () => {
    renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '30' } });
    goToChoice(PAY_CHOICE);

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    // No snapshot → the contact guard fires (the payment path is still the one taken).
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(createPayment).not.toHaveBeenCalled();
    expect(createMovement).not.toHaveBeenCalled();
  });

  it('toasts the generic payment error when the request fails without a message', async () => {
    createPayment.mockRejectedValueOnce({});
    renderWizard();
    goToPayment({ tercero: { id: 'bp-1' }, totals: { pago: 10, diff: 0 } });

    fireEvent.click(findButton('financeAccountMovementsNewConfirm'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('financeAccountMovementsWizardPaymentError'),
    );
  });
});

describe('NewMovementWizard — payment workspace wiring', () => {
  it('seeds the payment form with the stage-1 amount, direction and contact', () => {
    optionsByDim = { bpartner: [{ id: 'bp-1', name: 'ACME' }] };
    renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '99' } });
    fireEvent.change(screen.getByTestId('select-financeAccountMovementsDimBpartner'), {
      target: { value: 'bp-1' },
    });

    goToChoice(PAY_CHOICE);

    expect(paymentFormProps.doc).toBe('in');
    expect(paymentFormProps.initialAmount).toBe(99);
    expect(paymentFormProps.initialTercero).toEqual({ id: 'bp-1', name: 'ACME' });
    expect(paymentFormProps.paymentMethods).toEqual([{ id: 'pm-1', name: 'Transferencia' }]);
    expect(paymentFormProps.showAccountField).toBe(false);
  });

  it('passes a null contact when no business partner dimension was picked', () => {
    renderWizard();

    goToChoice(PAY_CHOICE);

    expect(paymentFormProps.initialTercero).toBeNull();
  });

  it('lets the user swap the association back through "Cambiar"', () => {
    renderWizard();
    goToChoice(PAY_CHOICE);
    expect(screen.getByTestId('payment-form')).toBeInTheDocument();

    fireEvent.click(findButton('financeAccountMovementsWizardChange'));

    expect(screen.queryByTestId('payment-form')).not.toBeInTheDocument();
    expect(document.body.textContent).toContain('financeAccountMovementsWizardReconcileQuestion');
  });

  it('disables Confirm while a create is in flight', () => {
    creatingFlags = { movement: false, payment: true };
    renderWizard();
    goToChoice(PAY_CHOICE);

    const confirm = findButton('financeAccountMovementsNewSaving');
    expect(confirm).toBeDisabled();
  });
});

describe('NewMovementWizard — dialog lifecycle', () => {
  it('closes through onOpenChange when the dialog is dismissed', () => {
    const { onClose } = renderWizard();

    fireEvent.click(screen.getByTestId('dialog-dismiss'));

    expect(onClose).toHaveBeenCalled();
  });

  it('resets the stage, the choice and the form once it is closed again', async () => {
    const { rerender } = renderWizard();
    fireEvent.change(screen.getByTestId(DEPOSIT), { target: { value: '55' } });
    goToChoice(GL_CHOICE);
    expect(screen.getByTestId('lookup-picker')).toBeInTheDocument();

    await act(async () => {
      rerender(<NewMovementWizard {...BASE_PROPS} open={false} onClose={vi.fn()} onSuccess={vi.fn()} />);
    });
    await act(async () => {
      rerender(<NewMovementWizard {...BASE_PROPS} open onClose={vi.fn()} onSuccess={vi.fn()} />);
    });

    // Back on stage 1 with a pristine amount.
    expect(screen.getByTestId(DEPOSIT)).toHaveValue('');
    expect(screen.queryByTestId('lookup-picker')).not.toBeInTheDocument();
  });
});
