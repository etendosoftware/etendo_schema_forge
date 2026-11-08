// @covers tools/app-shell/src/components/contract-ui/saveGateAttempts.js
// @covers tools/app-shell/src/components/contract-ui/saveActions.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ETP-5278 — the existing-record toolbar Save of a window with `onAfterExistingSave` defers its
// "saved" toast until that follow-up write has finished (single, truthful toast), and stays
// disabled while the window reports a save-related operation in flight (`saveBusy`) — the two
// halves of the fix for QA's CP-6/CP-7 (success toast then error toast; Save re-enabled mid-write,
// letting a second role save overlap the first).

vi.mock('@/hooks/useEntity', () => ({
  showSaveSuccessToast: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { toast } from 'sonner';
import { showSaveSuccessToast } from '@/hooks/useEntity';
import { renderSaveActions, handlePostSaveNavigation, isFormCalculating } from '../saveActions.jsx';
import { registerPending } from '@/lib/formPendingWork.js';
import { subscribeSaveGateAttempts, notifySaveGateAttempt } from '../saveGateAttempts.js';

const ui = (key) => key;

function existingRecordParams(overrides = {}) {
  return {
    hook: {
      isSaving: false,
      handleSave: vi.fn(() => Promise.resolve({ id: 'rec-1' })),
      primeSaved: vi.fn(),
      children: [],
    },
    isDirty: true,
    flushPendingLines: vi.fn(() => Promise.resolve(true)),
    data: { id: 'rec-1' },
    isNew: false,
    navigate: vi.fn(),
    windowName: 'user',
    ui,
    onAfterCreate: null,
    onAfterExistingSave: null,
    onAfterSave: null,
    token: 'tok',
    apiBaseUrl: '/api',
    saveBtnCls: '',
    draftMode: null,
    blockSaveForBalance: false,
    saveGate: {},
    ...overrides,
  };
}

function clickSave(params) {
  render(<>{renderSaveActions(params)}</>);
  fireEvent.click(screen.getByTestId('action-save'));
}

describe('existing-record Save with onAfterExistingSave — deferred single toast (ETP-5278)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves silently and shows the success toast only after the hook resolved', async () => {
    let resolveHook;
    const onAfterExistingSave = vi.fn(() => new Promise((resolve) => { resolveHook = resolve; }));
    const params = existingRecordParams({ onAfterExistingSave });
    clickSave(params);

    await waitFor(() => expect(onAfterExistingSave).toHaveBeenCalledWith({ id: 'rec-1' }, { token: 'tok', apiBaseUrl: '/api' }));
    expect(params.hook.handleSave).toHaveBeenCalledWith({ silent: true });
    // The follow-up write is still running: no "saved" toast yet.
    expect(showSaveSuccessToast).not.toHaveBeenCalled();

    resolveHook(undefined);
    await waitFor(() => expect(showSaveSuccessToast).toHaveBeenCalledWith(false, false, ui));
  });

  it('shows no success toast when the hook reports { ok: false } — its own error toast is the only feedback', async () => {
    const onAfterExistingSave = vi.fn(() => Promise.resolve({ ok: false }));
    clickSave(existingRecordParams({ onAfterExistingSave }));

    await waitFor(() => expect(onAfterExistingSave).toHaveBeenCalled());
    await Promise.resolve();
    expect(showSaveSuccessToast).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('treats { ok: true } as success', async () => {
    const onAfterExistingSave = vi.fn(() => Promise.resolve({ ok: true }));
    clickSave(existingRecordParams({ onAfterExistingSave }));

    await waitFor(() => expect(showSaveSuccessToast).toHaveBeenCalledTimes(1));
  });

  it('reports a throwing hook with the generic follow-up toast and no success toast (the record itself did save)', async () => {
    const onAfterExistingSave = vi.fn(() => Promise.reject(new Error('boom')));
    clickSave(existingRecordParams({ onAfterExistingSave }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('savedButFollowUpActionFailed'));
    expect(showSaveSuccessToast).not.toHaveBeenCalled();
  });

  it('does not run the hook nor toast when the save itself failed', async () => {
    const onAfterExistingSave = vi.fn();
    const params = existingRecordParams({ onAfterExistingSave });
    params.hook.handleSave = vi.fn(() => Promise.resolve(null));
    clickSave(params);

    await waitFor(() => expect(params.hook.handleSave).toHaveBeenCalled());
    await Promise.resolve();
    expect(onAfterExistingSave).not.toHaveBeenCalled();
    expect(showSaveSuccessToast).not.toHaveBeenCalled();
  });

  it('keeps the non-deferred behaviour for windows without onAfterExistingSave (handleSave shows its own toast)', async () => {
    const params = existingRecordParams();
    clickSave(params);

    await waitFor(() => expect(params.hook.handleSave).toHaveBeenCalledWith({ silent: false }));
    expect(showSaveSuccessToast).not.toHaveBeenCalled();
  });

  it('handlePostSaveNavigation without deferSaveToast never shows the toast itself', async () => {
    const onAfterExistingSave = vi.fn(() => Promise.resolve(undefined));
    await handlePostSaveNavigation({ id: 'rec-1' }, {
      isNew: false, onAfterExistingSave, navigate: vi.fn(), windowName: 'user', hook: {}, ui,
    });

    expect(onAfterExistingSave).toHaveBeenCalled();
    expect(showSaveSuccessToast).not.toHaveBeenCalled();
  });
});

describe('existing-record Save — saveBusy (ETP-5278)', () => {
  it('is disabled and shows the spinner while the window reports saveBusy, even though the form is dirty', () => {
    render(<>{renderSaveActions(existingRecordParams({ saveBusy: true }))}</>);

    const button = screen.getByTestId('action-save');
    expect(button).toBeDisabled();
    expect(screen.getByTestId('Loader2__fa3275')).toBeInTheDocument();
  });

  it('is enabled again once saveBusy clears', () => {
    render(<>{renderSaveActions(existingRecordParams({ saveBusy: false }))}</>);

    expect(screen.getByTestId('action-save')).not.toBeDisabled();
    expect(screen.queryByTestId('Loader2__fa3275')).not.toBeInTheDocument();
  });
});


// ETP-5680 follow-up — Save while a custom form component still has a result in flight (the
// product watcher's `/defaults?productType=` request). The scope is `hook.handleChange`.
describe('Save while the form is calculating', () => {
  const withScope = (overrides = {}) => {
    const params = existingRecordParams(overrides);
    params.hook.handleChange = () => {};
    return params;
  };
  const newRecord = (overrides = {}) => withScope({ isNew: true, isDocumentReadOnly: false, isProcessed: false, ...overrides });

  it('disables the existing-record Save with the spinner and the calculating tooltip, then re-enables it', () => {
    const params = withScope();
    render(<>{renderSaveActions(params)}</>);
    expect(screen.getByTestId('action-save')).not.toBeDisabled();

    let release;
    act(() => { release = registerPending(params.hook.handleChange); });
    const button = screen.getByTestId('action-save');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'saveCalculating');
    expect(screen.getByTestId('Loader2__fa3275')).toBeInTheDocument();

    act(() => release());
    expect(screen.getByTestId('action-save')).not.toBeDisabled();
    expect(screen.queryByTestId('Loader2__fa3275')).not.toBeInTheDocument();
  });

  it('gates the new-record Save the same way', () => {
    const params = newRecord();
    render(<>{renderSaveActions(params)}</>);
    let release;
    act(() => { release = registerPending(params.hook.handleChange); });
    expect(screen.getByTestId('action-save')).toBeDisabled();
    expect(screen.getByTestId('Loader2__fa3275')).toBeInTheDocument();
    act(() => release());
    expect(screen.getByTestId('action-save')).not.toBeDisabled();
  });

  it('gates both draftMode buttons (Save Draft and Confirm)', () => {
    const params = withScope({ draftMode: { enabled: true, label: 'process' } });
    render(<>{renderSaveActions(params)}</>);
    let release;
    act(() => { release = registerPending(params.hook.handleChange); });
    expect(screen.getByTestId('action-save-draft')).toBeDisabled();
    expect(screen.getByTestId('action-save')).toBeDisabled();
    act(() => release());
    expect(screen.getByTestId('action-save')).not.toBeDisabled();
  });

  it('stays disabled until every pending registration is released', () => {
    const params = withScope();
    render(<>{renderSaveActions(params)}</>);
    let releaseA; let releaseB;
    act(() => { releaseA = registerPending(params.hook.handleChange); releaseB = registerPending(params.hook.handleChange); });
    act(() => releaseA());
    expect(screen.getByTestId('action-save')).toBeDisabled();
    act(() => releaseB());
    expect(screen.getByTestId('action-save')).not.toBeDisabled();
  });

  it('keeps an existing gate reason instead of the calculating one', () => {
    const params = withScope({ saveGate: { blocked: true, title: 'saveMissingRequired' } });
    render(<>{renderSaveActions(params)}</>);
    act(() => { registerPending(params.hook.handleChange); });
    expect(screen.getByTestId('action-save')).toHaveAttribute('title', 'saveMissingRequired');
  });

  it('ignores pending work of another form instance and an unrelated change', () => {
    const params = withScope();
    render(<>{renderSaveActions(params)}</>);
    act(() => { registerPending(() => {}); });
    expect(screen.getByTestId('action-save')).not.toBeDisabled();
    expect(screen.queryByTestId('Loader2__fa3275')).not.toBeInTheDocument();
  });

  it('isFormCalculating reads the same scope for non-component callers (auto-save on blur)', () => {
    const hook = { handleChange: () => {} };
    expect(isFormCalculating(hook)).toBe(false);
    const release = registerPending(hook.handleChange);
    expect(isFormCalculating(hook)).toBe(true);
    release();
    expect(isFormCalculating(hook)).toBe(false);
    expect(isFormCalculating(undefined)).toBe(false);
  });
});

// ETP-5513 — a blocked Save/Confirm is disabled, so it can never be clicked; hovering,
// focusing or pressing it reports the fields it is blocked on, so the header form can
// reveal a required field hidden behind "Show more details".
describe('blocked Save reports the attempt (ETP-5513)', () => {
  const blocked = { blocked: true, title: 'saveMissingRequired', missingAttr: 'paymentTerms,currency,priceList' };
  let seen;
  let unsubscribe;
  beforeEach(() => {
    seen = [];
    unsubscribe = subscribeSaveGateAttempts((keys) => seen.push(keys));
  });
  afterEach(() => unsubscribe());

  it.each([
    ['hover', (el) => fireEvent.pointerEnter(el)],
    ['press', (el) => fireEvent.pointerDown(el)],
    ['focus', (el) => fireEvent.focus(el)],
  ])('%s on the blocked button reports its missing fields', (_name, act) => {
    render(<>{renderSaveActions(existingRecordParams({ saveGate: blocked }))}</>);
    const button = screen.getByTestId('action-save');
    expect(button).toBeDisabled();
    act(button.parentElement);
    expect(seen).toEqual([['paymentTerms', 'currency', 'priceList']]);
  });

  it('reports nothing when the gate is not blocking', () => {
    render(<>{renderSaveActions(existingRecordParams())}</>);
    fireEvent.pointerEnter(screen.getByTestId('action-save'));
    expect(seen).toEqual([]);
  });

  it('notifySaveGateAttempt ignores empty input and trims keys', () => {
    notifySaveGateAttempt('');
    notifySaveGateAttempt(undefined);
    notifySaveGateAttempt(' a , b ,');
    expect(seen).toEqual([['a', 'b']]);
  });
});
