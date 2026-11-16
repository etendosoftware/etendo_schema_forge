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
