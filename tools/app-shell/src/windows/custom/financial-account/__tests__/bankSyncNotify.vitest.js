// @covers tools/app-shell/src/windows/custom/financial-account/bankSyncNotify.js
const toastMock = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

import {
  notifyBankSyncError,
  notifyBankSyncResult,
  translateBankSyncMessage,
} from '../bankSyncNotify.js';

// `ui` that knows every label (renders it with a marker), so a translation is distinguishable
// from the raw input; `missingUi` returns the key, i.e. the label is missing from the dictionary.
const ui = (key) => `T:${key}`;
const missingUi = (key) => key;

const LOCK_PROSE = 'Could not acquire the bank sync lock';
const DUP_PROSE = 'Could not verify whether 3 transactions were already imported; they were skipped.';
const NO_CONNECTION = 'No active bank connection found for financial account %s. Connect the account first.';

beforeEach(() => {
  Object.values(toastMock).forEach((fn) => fn.mockReset());
});

function onlyToast(kind) {
  Object.entries(toastMock).forEach(([name, fn]) => {
    if (name !== kind) expect(fn, `toast.${name}`).not.toHaveBeenCalled();
  });
  expect(toastMock[kind]).toHaveBeenCalledTimes(1);
  return toastMock[kind].mock.calls[0][0];
}

describe('notifyBankSyncResult', () => {
  it('announces IN_PROGRESS with our own wording, never the bridge message', () => {
    notifyBankSyncResult({ status: 'IN_PROGRESS', message: 'A sync is already running' }, ui);
    expect(onlyToast('info')).toBe('T:financeAccountsBankSyncInProgress');
  });

  it('shows an ERROR with the translated bridge message', () => {
    notifyBankSyncResult({ status: 'ERROR', message: NO_CONNECTION }, ui);
    expect(onlyToast('error')).toBe('T:backendError.psd2NoActiveConnection');
  });

  it('falls back to the generic sync-error text for an ERROR without a message', () => {
    notifyBankSyncResult({ status: 'ERROR' }, ui);
    expect(onlyToast('error')).toBe('T:financeAccountsBankConnectionSyncError');
  });

  it('shows a WARNING with toast.warning, keeping an unmapped message verbatim', () => {
    notifyBankSyncResult({ status: 'WARNING', message: 'Range too long' }, ui);
    expect(onlyToast('warning')).toBe('Range too long');
  });

  it('falls back to the sync-done text for a WARNING without a message', () => {
    notifyBankSyncResult({ status: 'WARNING' }, ui);
    expect(onlyToast('warning')).toBe('T:financeAccountsBankConnectionSyncDone');
  });

  it('shows OK as a success with its message', () => {
    notifyBankSyncResult({ status: 'OK', message: 'Done fine' }, ui);
    expect(onlyToast('success')).toBe('Done fine');
  });

  it.each([
    ['a missing status', {}],
    ['a null result', null],
    ['an undefined result', undefined],
  ])('treats %s as a success with the sync-done text', (_label, result) => {
    notifyBankSyncResult(result, ui);
    expect(onlyToast('success')).toBe('T:financeAccountsBankConnectionSyncDone');
  });
});

describe('notifyBankSyncResult — BANK_SYNC_DUPLICATE_CHECK_FAILED', () => {
  it.each([
    ['WARNING', 'warning'],
    ['ERROR', 'error'],
  ])('a %s carrying the code shows the code text with toast.%s, never the English prose', (status, kind) => {
    notifyBankSyncResult({ status, code: 'BANK_SYNC_DUPLICATE_CHECK_FAILED', message: DUP_PROSE }, ui);
    expect(onlyToast(kind)).toBe('T:backendError.bankSyncDuplicateCheckFailed');
    expect(toastMock[kind]).not.toHaveBeenCalledWith(DUP_PROSE);
  });

  it('a message mapped word for word still wins over the code', () => {
    notifyBankSyncResult({ status: 'ERROR', code: 'BANK_SYNC_DUPLICATE_CHECK_FAILED', message: NO_CONNECTION }, ui);
    expect(onlyToast('error')).toBe('T:backendError.psd2NoActiveConnection');
  });

  it('the code alone, with no message, still gets its text', () => {
    notifyBankSyncResult({ status: 'WARNING', code: 'BANK_SYNC_DUPLICATE_CHECK_FAILED' }, ui);
    expect(onlyToast('warning')).toBe('T:backendError.bankSyncDuplicateCheckFailed');
  });
});

describe('notifyBankSyncError', () => {
  it('shows the timeout label for the BANK_CONNECTION_TIMEOUT sentinel', () => {
    notifyBankSyncError(new Error('BANK_CONNECTION_TIMEOUT'), ui);
    expect(onlyToast('error')).toBe('T:financeAccountsBankConnectionTimeout');
  });

  it('still shows the timeout label, not the raw sentinel, when that label is missing', () => {
    notifyBankSyncError(new Error('BANK_CONNECTION_TIMEOUT'), missingUi);
    expect(onlyToast('error')).toBe('financeAccountsBankConnectionTimeout');
  });

  it('translates BANK_SYNC_LOCK_UNAVAILABLE by its code, not by its English prose', () => {
    const err = Object.assign(new Error(LOCK_PROSE), { code: 'BANK_SYNC_LOCK_UNAVAILABLE' });
    notifyBankSyncError(err, ui);
    expect(onlyToast('error')).toBe('T:backendError.bankSyncLockUnavailable');
  });

  it('shows the generic sync-error text for an error with no message', () => {
    notifyBankSyncError(new Error(''), ui);
    expect(onlyToast('error')).toBe('T:financeAccountsBankConnectionSyncError');
  });

  it('shows the generic sync-error text for a null error', () => {
    notifyBankSyncError(null, ui);
    expect(onlyToast('error')).toBe('T:financeAccountsBankConnectionSyncError');
  });
});

describe('translateBankSyncMessage', () => {
  it.each([
    [null, null],
    [undefined, undefined],
    ['', undefined],
    ['', ''],
  ])('returns nothing to say for message %j and code %j', (message, code) => {
    expect(translateBankSyncMessage(message, code, ui)).toBeFalsy();
  });

  it('translates a code with no message to its generic text', () => {
    expect(translateBankSyncMessage(null, 'BANK_SYNC_LOCK_UNAVAILABLE', ui))
      .toBe('T:backendError.bankSyncLockUnavailable');
  });

  it('never surfaces a bare code: an unknown code with no message yields null (caller text)', () => {
    expect(translateBankSyncMessage(null, 'SOMETHING_ELSE', ui)).toBeNull();
  });

  it('never surfaces a bare code: a known code whose label is missing yields null', () => {
    expect(translateBankSyncMessage(null, 'BANK_SYNC_LOCK_UNAVAILABLE', missingUi)).toBeNull();
  });

  it('the backend message wins over an unknown code', () => {
    expect(translateBankSyncMessage('The bank said no', 'SOMETHING_ELSE', ui)).toBe('The bank said no');
  });

  it('a mapped backend message wins over the code', () => {
    expect(translateBankSyncMessage(NO_CONNECTION, 'BANK_SYNC_LOCK_UNAVAILABLE', ui))
      .toBe('T:backendError.psd2NoActiveConnection');
  });
});
