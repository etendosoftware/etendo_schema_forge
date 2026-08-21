// ETP-4940 — regression coverage for the kebab-menu ("more actions")
// documentAction path (Complete/Void/Reactivate/etc. for windows that don't
// use draftMode). Before this fix, `runDocumentAction` called
// `docAction.execute` directly with zero dirty-state check: an edit made
// without clicking Save first was silently discarded, the action running
// against the last-persisted value. `runDocumentAction` now runs
// `maybeSaveBeforeConfirm` (detailViewHelpers.jsx) first, gated on
// `hook.isDirtyHeader`.
//
// Only `../DetailView.jsx` is mocked (DetailMoreActionsMenu's one heavy
// import, needed only for the trivial `resolveHideMoreMenu` pure function).
// `../detailViewHelpers.jsx` — where `maybeSaveBeforeConfirm` actually lives
// — is imported for real, per the precedent in detailViewHelpers.vitest.js
// ("pulling DetailView.jsx in here would put it back into this file's
// dependency closure").

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DetailMoreActionsMenu } from '../DetailMoreActionsMenu.jsx';

vi.mock('../DetailView.jsx', () => ({
  resolveHideMoreMenu: (hideMoreMenu, data) =>
    (typeof hideMoreMenu === 'function' ? hideMoreMenu({ data }) : hideMoreMenu),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));

const REACTIVATE_ACTION = {
  key: 'reactivate',
  label: 'Reactivate',
  labelKey: 'reactivate',
  documentAction: 'RE',
  successKey: 'reactivated',
};

function makeHook(overrides = {}) {
  return {
    isDirtyHeader: false,
    handleSave: vi.fn().mockResolvedValue({ id: 'saved-1' }),
    fetchById: vi.fn(),
    handleProcess: vi.fn(),
    ...overrides,
  };
}

function makeDocAction(overrides = {}) {
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    loading: false,
    ...overrides,
  };
}

function renderMenu({ hook, docAction, menuActions = [REACTIVATE_ACTION] } = {}) {
  return render(
    <DetailMoreActionsMenu
      apiBaseUrl="https://example.test/api"
      customMenuContent={null}
      data={{ id: 'rec-1' }}
      docAction={docAction}
      hideMoreMenu={false}
      hook={hook}
      menuActions={menuActions}
      neoAction={{ execute: vi.fn(), loading: false }}
      recordId="rec-1"
      setDocsRefreshSignal={vi.fn()}
      sqBtnSize="h-9 w-9"
      statusField="documentStatus"
      token="tok"
      ui={(key) => key}
    />,
  );
}

async function openMenuAndClickAction(actionKey = 'reactivate') {
  fireEvent.click(screen.getByTestId('action-more'));
  fireEvent.click(screen.getByTestId(`menu-action-${actionKey}`));
}

describe('DetailMoreActionsMenu — save-before-confirm guard (ETP-4940)', () => {
  it('dirty header + click a documentAction → saves silently BEFORE the action fires', async () => {
    const callOrder = [];
    const hook = makeHook({
      isDirtyHeader: true,
      handleSave: vi.fn().mockImplementation(async () => {
        callOrder.push('save');
        return { id: 'saved-1' };
      }),
    });
    const docAction = makeDocAction({
      execute: vi.fn().mockImplementation(async () => { callOrder.push('execute'); }),
    });

    renderMenu({ hook, docAction });
    await openMenuAndClickAction();

    await waitFor(() => expect(docAction.execute).toHaveBeenCalled());

    expect(hook.handleSave).toHaveBeenCalledWith({ silent: true });
    expect(docAction.execute).toHaveBeenCalledWith('rec-1', 'RE');
    expect(callOrder).toEqual(['save', 'execute']);
  });

  it('dirty header + save fails → the documentAction does NOT proceed', async () => {
    const hook = makeHook({
      isDirtyHeader: true,
      handleSave: vi.fn().mockResolvedValue(null), // handleSave already surfaced the error
    });
    const docAction = makeDocAction();

    renderMenu({ hook, docAction });
    await openMenuAndClickAction();

    await waitFor(() => expect(hook.handleSave).toHaveBeenCalled());

    expect(docAction.execute).not.toHaveBeenCalled();
  });

  it('no pending changes → the documentAction proceeds without an extra save call', async () => {
    const hook = makeHook({ isDirtyHeader: false });
    const docAction = makeDocAction();

    renderMenu({ hook, docAction });
    await openMenuAndClickAction();

    await waitFor(() => expect(docAction.execute).toHaveBeenCalled());

    expect(hook.handleSave).not.toHaveBeenCalled();
    expect(docAction.execute).toHaveBeenCalledWith('rec-1', 'RE');
  });
});
