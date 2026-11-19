// @covers artifacts/remittance/custom/RemittanceProcessConfirmModal.jsx
//
// The window's `processConfirmModal`: DetailView routes «Reactivar» (style primary-danger) here
// because reactivating deletes the payments the process created. Rendered through the real
// shared ConfirmDialog. A rejected `onConfirm` is translated through the real backendErrors.js.
//
// Keys echo back, except the backend refusal keys used below, so the messageKeys route of
// translateBackendError (which treats `t(key) === key` as "untranslated") can be observed.
const mockDictionary = {
  'backendError.remittanceNotProcessed': 'T:notProcessed',
  'backendError.remittanceReactivateFailed': 'T:reactivateFailed {detail}',
};
const mockUi = (key, params) => {
  let text = mockDictionary[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value);
  return text;
};
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
// ETP-6247 — «Confirmar» is routed to its own dialog; stubbed here to observe the routing and the
// props it receives (the dialog itself has its own suite, RemittanceConfirmDialog.vitest.jsx).
vi.mock('@generated/remittance/custom/RemittanceConfirmDialog.jsx', () => ({
  default: (props) => (
    <div data-testid="confirm-dialog-stub" data-record={props.record?.id} data-api={props.apiBaseUrl} data-process={props.process?.name}>
      <button type="button" data-testid="confirm-dialog-stub-close" onClick={() => props.onClose()}>close</button>
      <button type="button" data-testid="confirm-dialog-stub-refresh" onClick={() => props.onRefresh()}>refresh</button>
    </div>
  ),
}));

vi.mock('@generated/remittance/custom/RemittanceSentDialog.jsx', () => ({
  default: (props) => <div data-testid="sent-dialog-stub" data-record={props.record?.id} />,
}));
vi.mock('@generated/remittance/custom/RemittanceCollectDialog.jsx', () => ({
  default: (props) => <div data-testid="collect-dialog-stub" data-record={props.record?.id} data-api={props.apiBaseUrl} />,
}));
vi.mock('@generated/remittance/custom/RemittanceReturnDialog.jsx', () => ({
  default: (props) => (
    <div data-testid="return-dialog-stub" data-record={props.record?.id} data-api={props.apiBaseUrl}>
      <button type="button" data-testid="return-dialog-stub-refresh" onClick={() => props.onRefresh()}>refresh</button>
      <button type="button" data-testid="return-dialog-stub-close" onClick={() => props.onClose()}>close</button>
    </div>
  ),
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import RemittanceProcessConfirmModal from '@generated/remittance/custom/RemittanceProcessConfirmModal.jsx';

beforeEach(() => {
  vi.clearAllMocks();
});

const REACTIVATE = { name: 'reactivate', label: 'reactivate', style: 'primary-danger' };

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const confirmButton = (label) => screen.getByRole('button', { name: label });

describe('RemittanceProcessConfirmModal', () => {
  it('words a reactivation as a warning: its own title, body and confirm label', () => {
    render(<RemittanceProcessConfirmModal process={REACTIVATE} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('remittanceReactivateConfirmTitle')).toBeInTheDocument();
    expect(screen.getByText('remittanceReactivateConfirmBody')).toBeInTheDocument();
    expect(confirmButton('reactivate')).toBeInTheDocument();
    expect(confirmButton('cancel')).toBeInTheDocument();
  });

  it('warns that the bank already has the file ONLY when the remittance is Enviada al banco (SB), keeping the base text', () => {
    const { unmount } = render(<RemittanceProcessConfirmModal process={REACTIVATE} record={{ id: 'rem-1', remittanceStatus: 'SB' }} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('remittance-reactivate-sent-warning')).toHaveTextContent('remittanceReactivateSentWarning');
    expect(screen.getByText('remittanceReactivateConfirmBody')).toBeInTheDocument();
    unmount();
    render(<RemittanceProcessConfirmModal process={REACTIVATE} record={{ id: 'rem-1', remittanceStatus: 'PR' }} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('remittance-reactivate-sent-warning')).toBeNull();
    expect(screen.getByText('remittanceReactivateConfirmBody')).toBeInTheDocument();
  });

  it('recognises the reactivation by its columnName too', () => {
    render(<RemittanceProcessConfirmModal process={{ columnName: 'reactivate' }} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('remittanceReactivateConfirmTitle')).toBeInTheDocument();
  });

  it('falls back to a generic confirmation for any other process', () => {
    render(<RemittanceProcessConfirmModal process={{ name: 'process' }} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('remittanceReactivateConfirmTitle')).toBeNull();
    expect(screen.queryByText('remittanceReactivateConfirmBody')).toBeNull();
    expect(screen.getByRole('heading', { name: 'confirm' })).toBeInTheDocument();
    expect(confirmButton('confirm')).toBeInTheDocument();
  });

  it('runs onConfirm and shows busy while it is in flight', async () => {
    const pending = deferred();
    const onConfirm = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    render(<RemittanceProcessConfirmModal process={REACTIVATE} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(confirmButton('reactivate'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirmButton('reactivate')).toBeDisabled();
    expect(confirmButton('cancel')).toBeDisabled();

    await act(async () => { pending.resolve(); await pending.promise; });
    expect(confirmButton('reactivate')).not.toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on cancel without confirming', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<RemittanceProcessConfirmModal process={REACTIVATE} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(confirmButton('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on Escape when idle', () => {
    const onClose = vi.fn();
    render(<RemittanceProcessConfirmModal process={REACTIVATE} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape while the process is running', () => {
    const pending = deferred();
    const onClose = vi.fn();
    render(<RemittanceProcessConfirmModal process={REACTIVATE} onConfirm={() => pending.promise} onClose={onClose} />);
    fireEvent.click(confirmButton('reactivate'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// developer-3's fix: an `onConfirm` that still throws (handleProcess reports its own refusals, so
// this is the unexpected path) is shown as a toast instead of escaping as an unhandled rejection.
describe('RemittanceProcessConfirmModal — a rejected onConfirm', () => {
  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };

  beforeEach(() => {
    unhandled.length = 0;
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  const rejectWith = (props) => vi.fn(() => Promise.reject(Object.assign(new Error(props.message ?? ''), props)));

  async function confirmAndSettle(onConfirm) {
    render(<RemittanceProcessConfirmModal process={REACTIVATE} onConfirm={onConfirm} onClose={vi.fn()} />);
    await act(async () => { fireEvent.click(confirmButton('reactivate')); });
    // Give a stray rejection a macrotask to surface before asserting there was none.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }

  it('toasts the refusal translated by its messageKeys, whatever language the prose is in', async () => {
    await confirmAndSettle(rejectWith({ message: 'La remesa no está procesada.', messageKeys: ['ETGO_RemittanceNotProcessed'] }));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('T:notProcessed');
  });

  it('fills a parameterized refusal from messageParams', async () => {
    await confirmAndSettle(rejectWith({
      message: 'raw', messageKeys: ['ETGO_RemittanceReactivateFailed'], messageParams: { detail: 'CAUSE-42' },
    }));
    expect(toast.error).toHaveBeenCalledWith('T:reactivateFailed CAUSE-42');
  });

  it('shows the backend text when the parameterized refusal arrives without its param', async () => {
    const message = 'No se pudo reactivar: el pago 1001 está conciliado.';
    await confirmAndSettle(rejectWith({ message, messageKeys: ['ETGO_RemittanceReactivateFailed'] }));
    expect(toast.error).toHaveBeenCalledWith(message);
  });

  it('falls back to actionFailed when the error carries neither keys nor text', async () => {
    await confirmAndSettle(rejectWith({}));
    expect(toast.error).toHaveBeenCalledWith('actionFailed');
  });

  it('falls back to actionFailed for a rejection that is not an Error at all', async () => {
    await confirmAndSettle(vi.fn(() => Promise.reject(undefined)));
    expect(toast.error).toHaveBeenCalledWith('actionFailed');
  });

  it('leaves the busy state, so the user can retry or cancel', async () => {
    const onConfirm = rejectWith({});
    await confirmAndSettle(onConfirm);
    expect(confirmButton('reactivate')).not.toBeDisabled();
    expect(confirmButton('cancel')).not.toBeDisabled();
    await act(async () => { fireEvent.click(confirmButton('reactivate')); });
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('lets nothing escape as an unhandled rejection', async () => {
    await confirmAndSettle(rejectWith({ message: 'boom' }));
    expect(unhandled).toEqual([]);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('does not toast when onConfirm succeeds', async () => {
    await confirmAndSettle(vi.fn().mockResolvedValue(undefined));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

// ETP-6247 — `processOverrides.confirm` declares `confirmModal`, so DetailView routes «Confirmar»
// here too; it gets its own dialog, and «Reactivar» keeps its confirmation.
describe('RemittanceProcessConfirmModal — routing', () => {
  const CONFIRM = { name: 'confirm', label: 'confirm', confirmModal: true };

  it('routes `confirm` to RemittanceConfirmDialog with the record, the API base and the callbacks', () => {
    const onClose = vi.fn();
    const onRefresh = vi.fn();
    const onConfirm = vi.fn();
    render(
      <RemittanceProcessConfirmModal process={CONFIRM} record={{ id: 'rem-1' }} apiBaseUrl="/sws/neo/remittance"
        onConfirm={onConfirm} onClose={onClose} onRefresh={onRefresh} />,
    );
    const stub = screen.getByTestId('confirm-dialog-stub');
    expect(stub).toHaveAttribute('data-record', 'rem-1');
    expect(stub).toHaveAttribute('data-api', '/sws/neo/remittance');
    expect(stub).toHaveAttribute('data-process', 'confirm');
    // Not the generic confirmation.
    expect(screen.queryByText('remittanceReactivateConfirmTitle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'confirm' })).toBeNull();
    fireEvent.click(screen.getByTestId('confirm-dialog-stub-refresh'));
    fireEvent.click(screen.getByTestId('confirm-dialog-stub-close'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The dialog runs the action itself: DetailView's handleProcess is not used.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps the reactivate confirmation (no confirm dialog)', () => {
    render(<RemittanceProcessConfirmModal process={REACTIVATE} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('confirm-dialog-stub')).toBeNull();
    expect(screen.getByText('remittanceReactivateConfirmTitle')).toBeInTheDocument();
  });

  it('routes «Devolver» (returnLines) to its own dialog, which posts the action itself', () => {
    const onRefresh = vi.fn();
    const onConfirm = vi.fn();
    render(
      <RemittanceProcessConfirmModal process={{ name: 'returnLines', confirmModal: true }} record={{ id: 'rem-1' }} apiBaseUrl="/sws/neo/remittance"
        onConfirm={onConfirm} onClose={vi.fn()} onRefresh={onRefresh} />,
    );
    expect(screen.getByTestId('return-dialog-stub')).toHaveAttribute('data-record', 'rem-1');
    expect(screen.queryByTestId('confirm-dialog-stub')).toBeNull();
    fireEvent.click(screen.getByTestId('return-dialog-stub-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('«Devolver» forwards onClose, and neither «Confirmar» nor the generic confirmation shows with it', () => {
    const onClose = vi.fn();
    render(
      <RemittanceProcessConfirmModal process={{ name: 'returnLines', confirmModal: true }} record={{ id: 'rem-1' }} apiBaseUrl="/api"
        onConfirm={vi.fn()} onClose={onClose} onRefresh={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('return-dialog-stub-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('confirm-dialog-stub')).toBeNull();
    expect(screen.queryByRole('button', { name: 'confirm' })).toBeNull();
  });

  it('an unknown process name falls to the generic confirmation, never to the return or confirm dialogs', () => {
    render(<RemittanceProcessConfirmModal process={{ name: 'somethingElse' }} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('return-dialog-stub')).toBeNull();
    expect(screen.queryByTestId('confirm-dialog-stub')).toBeNull();
    expect(screen.getByRole('button', { name: 'confirm' })).toBeInTheDocument();
  });

  it('routes «Marcar como cobrada» (markCollected) to its own dialog, which posts the action itself', () => {
    const onConfirm = vi.fn();
    render(<RemittanceProcessConfirmModal process={{ name: 'markCollected', confirmModal: true }} record={{ id: 'rem-1' }} apiBaseUrl="/sws/neo/remittance" onConfirm={onConfirm} onClose={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByTestId('collect-dialog-stub')).toHaveAttribute('data-record', 'rem-1');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('routes «Pasar a Enviada al banco» (markSent) to its own dialog, which posts the action itself', () => {
    const onConfirm = vi.fn();
    render(<RemittanceProcessConfirmModal process={{ name: 'markSent', confirmModal: true }} record={{ id: 'rem-1' }} onConfirm={onConfirm} onClose={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.getByTestId('sent-dialog-stub')).toHaveAttribute('data-record', 'rem-1');
    expect(screen.queryByText('remittanceReactivateConfirmTitle')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
