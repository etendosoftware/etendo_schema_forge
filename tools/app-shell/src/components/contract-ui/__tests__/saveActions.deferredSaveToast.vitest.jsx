import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { showSaveSuccessToast } from '@/hooks/useEntity';
import { renderSaveActions, handlePostSaveNavigation } from '../saveActions.jsx';

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
