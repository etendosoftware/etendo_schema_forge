// @covers tools/app-shell/src/components/contract-ui/DetailMoreActionsMenu.jsx
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
import { toast } from 'sonner';
import { DetailMoreActionsMenu } from '../DetailMoreActionsMenu.jsx';
import { ACCOUNTING_HIDDEN, setMockCapabilities } from '@/test/capabilitiesSafeMock.js';

vi.mock('../DetailView.jsx', () => ({
  resolveHideMoreMenu: (hideMoreMenu, data) =>
    (typeof hideMoreMenu === 'function' ? hideMoreMenu({ data }) : hideMoreMenu),
}));

vi.mock('@/hooks/useCapabilitiesSafe.js', async () =>
  (await import('@/test/capabilitiesSafeMock.js')).capabilitiesSafeMock());

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// backendErrors.js is used for real: the documentAction failure toast is asserted through the
// actual translation map, and the module has no imports of its own.

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

function renderMenu({ hook, docAction, menuActions = [REACTIVATE_ACTION], ui = (key) => key } = {}) {
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
      ui={ui}
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

  // KNOWN GAP (W1, flagged in review — QA verified, non-blocking):
  // runDocumentAction gates the save-before-confirm guard on `hook.isDirtyHeader`
  // ONLY, unlike DetailView's draftMode Confirm button, which reads the fuller
  // `isDirty` (header OR line-edit OR add-row state — see computeIsDirty and the
  // paired "line-edit dirty only" test in DetailView.saveButtons.vitest.jsx). A
  // pending LINE-row edit that hasn't touched the header (isDirtyHeader still
  // false) is therefore NOT saved before a kebab documentAction fires — the same
  // silent-discard bug ETP-4940 fixes, just reachable through a narrower door.
  //
  // Reachability today: every generated window's only kebab documentAction is
  // 'reactivate' (RE) — grep `documentAction:` across artifacts/*/generated
  // confirms no window routes 'confirm' (CO) through the kebab — and reactivate
  // only shows once a document is already status=CO, where lines are normally
  // read-only. So this gap is not known to be reachable via the STANDARD
  // generated line-edit UI today; it stays open only in case a future kebab
  // action is added for a non-completed status, or a custom component mutates
  // line-edit state on a completed doc. Severity: Low (strictly better than the
  // pre-fix baseline — the header case IS covered — and not reachable through
  // any currently-shipped path). Pinned here so behavior doesn't silently widen
  // and so a future fix (reading the fuller isDirty here too) has to touch this
  // test rather than pass by accident.
  it('[KNOWN GAP W1] line-only dirty (isDirtyHeader false) → the documentAction proceeds WITHOUT saving first', async () => {
    // isDirtyHeader:false simulates "header clean, but a line-row edit is
    // pending elsewhere in DetailView state" — DetailMoreActionsMenu is never
    // given that fuller signal (no `isDirty`/`lineEdits` prop exists on this
    // component), only `hook.isDirtyHeader`, so there is no way for this guard
    // to see it even if it wanted to.
    const hook = makeHook({ isDirtyHeader: false });
    const docAction = makeDocAction();

    renderMenu({ hook, docAction });
    await openMenuAndClickAction();

    await waitFor(() => expect(docAction.execute).toHaveBeenCalled());

    // This is the gap, pinned: no save happens, the action runs straight
    // through against whatever was last persisted — a pending line edit would
    // be silently lost exactly like the original ETP-4940 bug.
    expect(hook.handleSave).not.toHaveBeenCalled();
    expect(docAction.execute).toHaveBeenCalledWith('rec-1', 'RE');
  });
});

// ETP-5700 — custom kebab content cannot save first (it gets no save handle), so the
// menu hands it the header's dirty signal and lets it refuse to run on a dirty form.
describe('DetailMoreActionsMenu — customMenuContent receives isDirty (ETP-5700)', () => {
  function DirtyProbe({ isDirty }) {
    return <span data-testid="dirty-probe">{String(isDirty)}</span>;
  }

  function renderWithCustom(hook) {
    render(
      <DetailMoreActionsMenu
        apiBaseUrl="https://example.test/api"
        customMenuContent={DirtyProbe}
        data={{ id: 'rec-1' }}
        docAction={makeDocAction()}
        hideMoreMenu={false}
        hook={hook}
        menuActions={[]}
        neoAction={{ execute: vi.fn(), loading: false }}
        recordId="rec-1"
        setDocsRefreshSignal={vi.fn()}
        sqBtnSize="h-9 w-9"
        statusField="documentStatus"
        token="tok"
        ui={(key) => key}
      />,
    );
    fireEvent.click(screen.getByTestId('action-more'));
  }

  it.each([
    [true, 'true'],
    [false, 'false'],
  ])('isDirtyHeader=%s → the open menu content gets isDirty=%s', (isDirtyHeader, expected) => {
    renderWithCustom(makeHook({ isDirtyHeader }));
    // The hidden probe renders the same component too; the visible one is the last.
    const rendered = screen.getAllByTestId('dirty-probe');
    expect(rendered[rendered.length - 1]).toHaveTextContent(expected);
  });
});

// ETP-5684 — "Show Accounting Fields" off hides Contabilizar / Descontabilizar from the
// form kebab, whatever the window declared. Keyed on the generic `neoAction`, so the
// generated menuActions of every postable window are covered without a decisions change.
describe('DetailMoreActionsMenu — accounting capability gate (ETP-5684)', () => {
  const POST_ACTION = { key: 'post', label: 'Post', labelKey: 'post', neoAction: 'post' };
  const UNPOST_ACTION = { key: 'unpost', label: 'Unpost', labelKey: 'unpost', neoAction: 'unpost' };

  it('shows post and unpost when the role can see accounting', () => {
    renderMenu({ hook: makeHook(), docAction: makeDocAction(), menuActions: [REACTIVATE_ACTION, POST_ACTION, UNPOST_ACTION] });
    fireEvent.click(screen.getByTestId('action-more'));
    expect(screen.getByTestId('menu-action-post')).toBeInTheDocument();
    expect(screen.getByTestId('menu-action-unpost')).toBeInTheDocument();
  });

  it('drops post and unpost but keeps the other actions when the capability is off', () => {
    setMockCapabilities(ACCOUNTING_HIDDEN);
    renderMenu({ hook: makeHook(), docAction: makeDocAction(), menuActions: [REACTIVATE_ACTION, POST_ACTION, UNPOST_ACTION] });
    fireEvent.click(screen.getByTestId('action-more'));
    expect(screen.getByTestId('menu-action-reactivate')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-action-post')).toBeNull();
    expect(screen.queryByTestId('menu-action-unpost')).toBeNull();
  });

  it('renders no kebab at all when posting was the only action', () => {
    setMockCapabilities(ACCOUNTING_HIDDEN);
    renderMenu({ hook: makeHook(), docAction: makeDocAction(), menuActions: [POST_ACTION] });
    expect(screen.queryByTestId('action-more')).toBeNull();
  });
});

// ETP-5745 follow-up — "if it can't reactivate, it must not do anything": a reactivation this
// guard already knows will be refused (fiscally accepted + a completed rectificativa) must not
// run maybeSaveBeforeConfirm, runPreUnpost, or docAction.execute — not even when the header is
// dirty and the row is posted (which would otherwise both fire first).
describe('DetailMoreActionsMenu — reactivation blocked by a fiscal-accepted rectificativa (ETP-5745 follow-up)', () => {
  const REACTIVATE_WITH_PREUNPOST = {
    key: 'reactivate',
    label: 'Reactivate',
    labelKey: 'reactivate',
    documentAction: 'RE',
    successKey: 'reactivated',
    preUnpost: true,
  };
  const CONFIRM_ACTION = {
    key: 'confirm',
    label: 'Confirm',
    labelKey: 'confirm',
    documentAction: 'CO',
    successKey: 'documentConfirmed',
  };

  // `ui` mimics useUI()'s interpolation ({param} substitution) closely enough to assert the
  // exact params the component passed, without re-implementing backendErrors.js here.
  function paramUi(key, params) {
    return params ? `${key}:${JSON.stringify(params)}` : key;
  }

  function renderBlockedMenu({ data, menuActions = [REACTIVATE_WITH_PREUNPOST], hookOverrides = {} } = {}) {
    const hook = makeHook({ isDirtyHeader: true, ...hookOverrides });
    const docAction = makeDocAction();
    const neoExecute = vi.fn().mockResolvedValue({ success: true });
    render(
      <DetailMoreActionsMenu
        apiBaseUrl="https://example.test/api"
        customMenuContent={null}
        data={data}
        docAction={docAction}
        hideMoreMenu={false}
        hook={hook}
        menuActions={menuActions}
        neoAction={{ execute: neoExecute, loading: false }}
        recordId={data?.id}
        setDocsRefreshSignal={vi.fn()}
        sqBtnSize="h-9 w-9"
        statusField="documentStatus"
        token="tok"
        ui={paramUi}
      />,
    );
    return { hook, docAction, neoExecute };
  }

  it('toasts the fiscal-rectified message and runs nothing else: no save, no preUnpost, no execute', async () => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    const { hook, docAction, neoExecute } = renderBlockedMenu({
      data: {
        id: 'rec-1',
        posted: 'Y', // posted on purpose — proves runPreUnpost (which WOULD fire for a posted row) never runs
        reactivationBlocked: true,
        reactivationBlockedFiscalSystem: 'Verifactu',
        reactivationBlockedRectificativas: ['FR-0001', 'FR-0002'],
      },
    });

    await openMenuAndClickAction();

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(
      'backendError.invoiceReactivateFiscalRectified:'
      + JSON.stringify({ fiscalSystem: 'Verifactu', rectificativas: 'FR-0001, FR-0002' }),
    );
    expect(hook.handleSave).not.toHaveBeenCalled();
    expect(neoExecute).not.toHaveBeenCalled();
    expect(docAction.execute).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('passes a bare (non-array) rectificativas value through unchanged', async () => {
    vi.mocked(toast.error).mockClear();
    await renderBlockedMenu({
      data: {
        id: 'rec-1',
        reactivationBlocked: true,
        reactivationBlockedFiscalSystem: 'TicketBAI',
        reactivationBlockedRectificativas: 'FR-0003',
      },
    });

    await openMenuAndClickAction();

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(
      'backendError.invoiceReactivateFiscalRectified:'
      + JSON.stringify({ fiscalSystem: 'TicketBAI', rectificativas: 'FR-0003' }),
    );
  });

  it('does not block a non-RE action even when reactivationBlocked is true', async () => {
    const { hook, docAction } = renderBlockedMenu({
      data: { id: 'rec-1', reactivationBlocked: true },
      menuActions: [CONFIRM_ACTION],
    });

    await openMenuAndClickAction('confirm');

    await waitFor(() => expect(docAction.execute).toHaveBeenCalled());
    // The normal flow DID run: the dirty header was saved first, same as any other documentAction.
    expect(hook.handleSave).toHaveBeenCalledWith({ silent: true });
    expect(docAction.execute).toHaveBeenCalledWith('rec-1', 'CO');
  });

  it('runs the normal flow (save, then execute) when reactivationBlocked is false', async () => {
    const { hook, docAction } = renderBlockedMenu({ data: { id: 'rec-1', reactivationBlocked: false } });

    await openMenuAndClickAction();

    await waitFor(() => expect(docAction.execute).toHaveBeenCalled());
    expect(hook.handleSave).toHaveBeenCalledWith({ silent: true });
    expect(docAction.execute).toHaveBeenCalledWith('rec-1', 'RE');
  });

  it('runs the normal flow when reactivationBlocked is absent entirely', async () => {
    const { docAction } = renderBlockedMenu({ data: { id: 'rec-1' } });

    await openMenuAndClickAction();

    await waitFor(() => expect(docAction.execute).toHaveBeenCalled());
    expect(docAction.execute).toHaveBeenCalledWith('rec-1', 'RE');
  });
});

describe('DetailMoreActionsMenu — documentAction failure toast', () => {
  const LINKED_DOCS = 'This order cannot be reactivated because it has linked shipments or invoices.';
  const DICT = {
    cannotReactivateLinkedDocs: 'No se puede reactivar: el pedido tiene documentos vinculados',
    actionFailed: 'La acción ha fallado',
  };
  const ui = (key) => DICT[key] ?? key;

  it.each([
    // Fails pre-fix: the raw English text was toasted untranslated.
    ['a mapped backend message is translated', LINKED_DOCS, DICT.cannotReactivateLinkedDocs],
    // Unchanged behaviour: an unmapped message still reaches the user verbatim.
    ['an unmapped backend message is shown verbatim', 'Something unexpected', 'Something unexpected'],
    // Fails pre-fix: an empty message toasted an empty string instead of the generic failure.
    ['an empty message falls back to actionFailed', '', DICT.actionFailed],
  ])('%s', async (_label, message, expected) => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    const docAction = makeDocAction({ execute: vi.fn().mockRejectedValue(new Error(message)) });

    renderMenu({ hook: makeHook(), docAction, ui });
    await openMenuAndClickAction();

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(expected);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
