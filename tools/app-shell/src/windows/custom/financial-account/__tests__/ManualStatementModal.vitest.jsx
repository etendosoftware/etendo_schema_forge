import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

// Pass-through dialog: skip Radix portal/animation, render children when open.
// The real component closes via the dialog X / Escape, both routed through
// onOpenChange(false). With Radix mocked away there is no X to click, so we
// capture the *main* modal's onOpenChange and invoke it to simulate a close
// request (which triggers the discard-confirm flow when dirty). The component
// renders the main Dialog first, then the discard Dialog; we reset a per-render
// counter via a microtask so the first Dialog of each render pass is the main.
let requestMainClose = null;
let dialogIdx = 0;
let resetScheduled = false;
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children, onOpenChange }) => {
    const idx = dialogIdx;
    dialogIdx += 1;
    if (!resetScheduled) {
      resetScheduled = true;
      queueMicrotask(() => { dialogIdx = 0; resetScheduled = false; });
    }
    if (idx === 0) {
      requestMainClose = () => onOpenChange?.(false);
      return open ? <div data-testid="manual-modal">{children}</div> : null;
    }
    return open ? <div>{children}</div> : null;
  },
  DialogContent: ({ children }) => <div>{children}</div>,
}));

// Stub the date field with a native date input that forwards the test id and
// emits the ISO value through onChange (the real component emits "YYYY-MM-DD").
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange, 'data-testid': dataTestId }) => (
    <input type="date" value={value || ''} data-testid={dataTestId}
      onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

const createStatement = vi.fn();
const creatingRef = { value: false };
vi.mock('@/hooks/useCreateStatement', () => ({
  useCreateStatement: () => ({ createStatement, creating: creatingRef.value, error: null }),
}));

const updateStatement = vi.fn();
vi.mock('@/hooks/useStatementActions', () => ({
  useStatementActions: () => ({
    updateStatement, processStatement: vi.fn(), deleteStatement: vi.fn(), busy: false, error: null,
  }),
}));

// Edit mode loads the draft's lines; default to an empty, settled list.
const linesRef = { value: [], loading: false };
vi.mock('@/hooks/useBankStatementLines', () => ({
  useBankStatementLines: () => ({ lines: linesRef.value, loading: linesRef.loading, reload: vi.fn() }),
}));

// The per-line BP / G/L Item lookups hit the network via useAuth; stub them out.
vi.mock('@/hooks/useMovementLookups', () => ({
  useBPartnerLookup: () => ({ results: [], loading: false }),
  useGLItemLookup: () => ({ results: [], loading: false }),
}));

import { ManualStatementModal } from '../ManualStatementModal.jsx';

function renderModal(overrides = {}) {
  const props = {
    open: true,
    accountId: 'acc-1',
    accountCurrency: 'EUR',
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  };
  return { ...render(<ManualStatementModal {...props} />), props };
}

// Every row is always inline-editable; inputs share their testids across rows,
// so scope a single editable row before reading its cells.
function firstEditRow() {
  return screen.getAllByTestId('manual-line-editrow')[0];
}

// Fills the (first) always-editable starter row with a complete set of values.
async function fillFirstLine(user, { ref = 'REF-1', contact, desc, out, in: amountIn } = {}) {
  const row = within(firstEditRow());
  if (ref != null) await user.type(row.getByTestId('manual-line-ref'), ref);
  if (contact != null) await user.type(row.getByTestId('manual-line-contactname'), contact);
  if (desc != null) await user.type(row.getByTestId('manual-line-description'), desc);
  if (out != null) {
    await user.clear(row.getByTestId('manual-line-out'));
    await user.type(row.getByTestId('manual-line-out'), out);
  }
  if (amountIn != null) {
    await user.clear(row.getByTestId('manual-line-in'));
    await user.type(row.getByTestId('manual-line-in'), amountIn);
  }
}

describe('ManualStatementModal', () => {
  beforeEach(() => {
    createStatement.mockReset().mockResolvedValue({ id: 'stmt-1', name: 'X', lineCount: 1 });
    updateStatement.mockReset().mockResolvedValue({ id: 'stmt-1', name: 'X', lineCount: 1 });
    toastSuccess.mockReset();
    toastError.mockReset();
    creatingRef.value = false;
    linesRef.value = [];
    linesRef.loading = false;
  });

  it('renders the header fields and one always-editable starter row when open', () => {
    renderModal();
    expect(screen.getByTestId('manual-statement-name')).toBeInTheDocument();
    expect(screen.getByTestId('manual-statement-trxdate')).toBeInTheDocument();
    // No CTA — the table is shown immediately with a single editable starter row.
    expect(screen.queryByTestId('manual-statement-add-lines')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('manual-line-editrow')).toHaveLength(1);
    expect(screen.getAllByTestId('manual-line-in')).toHaveLength(1);
  });

  it('does not render when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('manual-modal')).not.toBeInTheDocument();
  });

  it('every row is inline-editable — there is no display row or edit pencil', () => {
    renderModal();
    expect(screen.queryAllByTestId('manual-line-row')).toHaveLength(0);
    expect(screen.queryByTestId('manual-line-edit')).not.toBeInTheDocument();
    // The editable cells are present from the start.
    const row = within(firstEditRow());
    expect(row.getByTestId('manual-line-ref')).toBeInTheDocument();
    expect(row.getByTestId('manual-line-description')).toBeInTheDocument();
    expect(row.getByTestId('manual-line-date')).toBeInTheDocument();
  });

  it('adds a new editable row when clicking "Add line"', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getAllByTestId('manual-line-editrow')).toHaveLength(1);
    await user.click(screen.getByTestId('action-add-line'));
    expect(screen.getAllByTestId('manual-line-editrow')).toHaveLength(2);
  });

  it('removes a line when clicking its delete button', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByTestId('action-add-line'));
    expect(screen.getAllByTestId('manual-line-editrow')).toHaveLength(2);
    await user.click(screen.getAllByTestId('manual-line-remove')[0]);
    expect(screen.getAllByTestId('manual-line-editrow')).toHaveLength(1);
  });

  it('blocks saving with a blank name and surfaces an error toast', async () => {
    const user = userEvent.setup();
    renderModal();
    await fillFirstLine(user, { ref: 'REF-1', in: '100' });
    await user.click(screen.getByTestId('manual-statement-save'));
    expect(toastError).toHaveBeenCalledWith('financeAccountStatementsManualErrorName');
    expect(createStatement).not.toHaveBeenCalled();
  });

  it('blocks saving when there is no usable line (only the blank starter row)', async () => {
    const user = userEvent.setup();
    renderModal();
    // The starter row is blank, so it counts as 0 usable lines.
    await user.type(screen.getByTestId('manual-statement-name'), 'Extracto manual');
    await user.click(screen.getByTestId('manual-statement-save'));
    expect(toastError).toHaveBeenCalledWith('financeAccountStatementsManualErrorLines');
    expect(createStatement).not.toHaveBeenCalled();
  });

  it('blocks saving an incomplete line (missing Reference No) with an error toast', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByTestId('manual-statement-name'), 'Extracto manual');
    // An amount makes the row non-blank, but the missing Reference No keeps it incomplete.
    await fillFirstLine(user, { ref: null, in: '100' });
    await user.click(screen.getByTestId('manual-statement-save'));
    expect(toastError).toHaveBeenCalledWith('financeAccountStatementsManualErrorIncompleteLine');
    expect(createStatement).not.toHaveBeenCalled();
  });

  it('posts the header + non-blank lines and reports success', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.type(screen.getByTestId('manual-statement-name'), 'Extracto manual');
    await fillFirstLine(user, { ref: 'REF-1', contact: 'Acme', in: '3500,00' });
    await user.click(screen.getByTestId('manual-statement-save'));

    await waitFor(() => expect(createStatement).toHaveBeenCalledTimes(1));
    const payload = createStatement.mock.calls[0][0];
    expect(payload.accountId).toBe('acc-1');
    expect(payload.name).toBe('Extracto manual');
    expect(payload.transactionDate).toMatch(/T00:00:00Z$/);
    expect(payload.importDate).toMatch(/T00:00:00Z$/);
    expect(payload).toHaveProperty('fileName');
    expect(payload).toHaveProperty('notes');
    // Primary action saves AND processes.
    expect(payload.process).toBe(true);
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0].bpartnerName).toBe('Acme');
    // Spanish "3500,00" is parsed to a plain Number.
    expect(payload.lines[0].in).toBe(3500);
    expect(payload.lines[0].out).toBe(0);
    // FK fields default to null when no lookup item was chosen.
    expect(payload.lines[0].bpartnerId).toBeNull();
    expect(payload.lines[0].glItemId).toBeNull();
    expect(payload.lines[0].reference).toBe('REF-1');

    expect(toastSuccess).toHaveBeenCalledWith('financeAccountStatementsManualSuccess');
    expect(props.onSuccess).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it('renders the per-line description input and includes it in the saved payload', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByTestId('manual-statement-name'), 'Extracto manual');

    // The editable line row exposes a Descripción input.
    const descInput = within(firstEditRow()).getByTestId('manual-line-description');
    expect(descInput).toBeInTheDocument();

    await fillFirstLine(user, { ref: 'REF-1', desc: 'Comisión banco', in: '100' });
    await user.click(screen.getByTestId('manual-statement-save'));

    await waitFor(() => expect(createStatement).toHaveBeenCalledTimes(1));
    const payload = createStatement.mock.calls[0][0];
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0].description).toBe('Comisión banco');
  });

  it('saves as a draft (process=false) from the split menu', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByTestId('manual-statement-name'), 'Extracto manual');
    await fillFirstLine(user, { ref: 'REF-1', in: '50' });

    await user.click(screen.getByTestId('manual-statement-save-split'));
    await user.click(screen.getByTestId('manual-statement-save-draft'));

    await waitFor(() => expect(createStatement).toHaveBeenCalledTimes(1));
    expect(createStatement.mock.calls[0][0].process).toBe(false);
  });

  it('shows an error toast when the backend call fails', async () => {
    createStatement.mockRejectedValueOnce(new Error('HTTP 500'));
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByTestId('manual-statement-name'), 'Extracto manual');
    await fillFirstLine(user, { ref: 'REF-1', in: '10' });
    await user.click(screen.getByTestId('manual-statement-save'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('financeAccountStatementsManualError'));
  });

  it('closes directly (no discard prompt) when nothing was changed', () => {
    const { props } = renderModal();
    // A pristine modal closes immediately without the discard prompt.
    act(() => { requestMainClose(); });
    expect(screen.queryByTestId('manual-discard-overlay')).not.toBeInTheDocument();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('asks to discard before closing when there are unsaved changes', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.type(screen.getByTestId('manual-statement-name'), 'Algo');
    // Closing the dialog (X / Escape → onOpenChange) triggers the discard flow.
    act(() => { requestMainClose(); });
    expect(screen.getByTestId('manual-discard-overlay')).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('discards and closes when confirming the discard prompt', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.type(screen.getByTestId('manual-statement-name'), 'Algo');
    act(() => { requestMainClose(); });
    await user.click(screen.getByTestId('manual-discard-confirm'));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('keeps the modal open when choosing "keep editing"', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await user.type(screen.getByTestId('manual-statement-name'), 'Algo');
    act(() => { requestMainClose(); });
    await user.click(screen.getByTestId('manual-discard-keep'));
    expect(screen.queryByTestId('manual-discard-overlay')).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('manual-statement-name')).toHaveValue('Algo');
  });

  describe('edit mode', () => {
    const STATEMENT = {
      id: 'st-9', name: 'Extracto mayo', documentNo: '1000025',
      transactionDate: '2026-05-10T00:00:00Z', importDate: '2026-05-11T00:00:00Z',
      fileName: 'mayo.csv', notes: 'Notas',
    };

    it('hydrates the header + lines from the draft into editable rows and updates on save', async () => {
      linesRef.value = [{
        id: 'ln-1', date: '2026-05-09T00:00:00Z', reference: 'REF9', description: '',
        bpartnerName: 'Acme', bpartnerId: 'bp-1', bpartnerFkName: 'Acme S.L.',
        glItemId: 'gl-1', glItemName: 'Comisiones', in: 250, out: 0,
      }];
      const user = userEvent.setup();
      const { props } = renderModal({ statement: STATEMENT });

      // Header is seeded from the statement.
      expect(screen.getByTestId('manual-statement-name')).toHaveValue('Extracto mayo');
      // The draft line is hydrated into an editable row (no read-only display row).
      const row = within(firstEditRow());
      expect(row.getByTestId('manual-line-ref')).toHaveValue('REF9');
      expect(row.getByTestId('manual-line-contactname')).toHaveValue('Acme');

      await user.click(screen.getByTestId('manual-statement-save'));

      await waitFor(() => expect(updateStatement).toHaveBeenCalledTimes(1));
      expect(createStatement).not.toHaveBeenCalled();
      const payload = updateStatement.mock.calls[0][0];
      expect(payload.id).toBe('st-9');
      expect(payload.name).toBe('Extracto mayo');
      expect(payload.process).toBe(true);
      expect(payload.lines).toHaveLength(1);
      expect(payload.lines[0].bpartnerId).toBe('bp-1');
      expect(payload.lines[0].glItemId).toBe('gl-1');
      expect(payload.lines[0].in).toBe(250);
      expect(props.onSuccess).toHaveBeenCalled();
      // Editing reports "updated", not "created".
      expect(toastSuccess).toHaveBeenCalledWith('financeAccountStatementsManualUpdateSuccess');
      expect(toastSuccess).not.toHaveBeenCalledWith('financeAccountStatementsManualSuccess');
    });
  });
});
