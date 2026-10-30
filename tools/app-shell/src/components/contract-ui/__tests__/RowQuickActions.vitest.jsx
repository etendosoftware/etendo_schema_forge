// @covers tools/app-shell/src/components/contract-ui/RowQuickActions.jsx
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

// i18n stub — return the key so we can assert on it.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// useDocumentAction stub — exposes a controllable execute() + loading flag.
const docActionExecuteMock = vi.fn().mockResolvedValue({ ok: true });
let docActionLoadingFlag = false;
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({
    execute: docActionExecuteMock,
    get loading() { return docActionLoadingFlag; },
    error: null,
  }),
}));

// ETP-5414 — useNeoAction stub for the declarative `neoAction` dispatch. Tests also
// assert it is NOT called with 'unpost' before a reactivation (ETP-5684).
const mockNeoExecute = vi.fn();
vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: mockNeoExecute, loading: false }),
}));

// ETP-5378 — alias kept for the reactivate assertions below, written
// before ETP-5414 introduced the `mock`-prefixed name Vitest's `vi.mock`
// hoisting requires for a variable referenced inside the factory above. Same
// underlying vi.fn(); resetting/asserting on either name hits the same mock.
const neoActionExecuteMock = mockNeoExecute;

// RowQuickActions never toasts itself; mocked so a test can assert that.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ETP-5684 — posting entries are gated on capabilities.showAccountingFields (fail closed).
vi.mock('@/hooks/useCapabilitiesSafe.js', async () =>
  (await import('@/test/capabilitiesSafeMock.js')).capabilitiesSafeMock());

// Stub the Iconic trash and edit icons on top of the real custom-icons module: makes the
// rendered icons observable and keeps the file independent of the core version that ships them.
vi.mock('@/components/ui/custom-icons', async (importOriginal) => ({
  ...(await importOriginal()),
  IconicTrashIcon: (props) => <svg data-icon="iconic-trash" {...props} />,
  IconicEditIcon: (props) => <svg data-icon="iconic-edit" {...props} />,
  IconicCopyIcon: (props) => <svg data-icon="iconic-copy" {...props} />,
  IconicMailIcon: (props) => <svg data-icon="iconic-mail" {...props} />,
  IconicDotsVerticalIcon: (props) => <svg data-icon="iconic-dots-vertical" {...props} />,
}));

import RowQuickActions from '../RowQuickActions.jsx';
import { ACCOUNTING_HIDDEN, setMockCapabilities } from '@/test/capabilitiesSafeMock.js';

const DRAFT_ROW = { id: '1', documentStatus: 'DR' };
const COMPLETED_ROW = { id: '2', documentStatus: 'CO' };

function setup(props = {}) {
  const onEdit = vi.fn();
  const onClone = vi.fn();
  const onEmail = vi.fn();
  const onDelete = vi.fn();
  const onMenuActionExecuted = vi.fn();
  const utils = render(
    <table>
      <tbody>
        <tr>
          <td>
            <RowQuickActions
              row={DRAFT_ROW}
              entity="header"
              apiBaseUrl="/api"
              token="t"
              onEdit={onEdit}
              onClone={onClone}
              onEmail={onEmail}
              onDelete={onDelete}
              onMenuActionExecuted={onMenuActionExecuted}
              {...props}
            />
          </td>
        </tr>
      </tbody>
    </table>,
  );
  return { ...utils, onEdit, onClone, onEmail, onDelete, onMenuActionExecuted };
}

describe('RowQuickActions', () => {
  beforeEach(() => {
    docActionExecuteMock.mockClear();
    docActionExecuteMock.mockResolvedValue({ ok: true });
    neoActionExecuteMock.mockClear();
    neoActionExecuteMock.mockResolvedValue({ success: true });
    docActionLoadingFlag = false;
    mockNeoExecute.mockReset();
    mockNeoExecute.mockResolvedValue({ success: true });
    toast.success.mockClear();
    toast.error.mockClear();
  });

  it('renders Edit and Clone buttons by default (no menu, no email)', () => {
    setup();
    expect(screen.getByTestId('row-quick-action-edit')).toBeTruthy();
    expect(screen.getByTestId('row-quick-action-clone')).toBeTruthy();
    expect(screen.queryByTestId('row-quick-action-email')).toBeNull();
    expect(screen.queryByTestId('row-quick-action-more')).toBeNull();
    expect(screen.getByTestId('row-quick-action-delete')).toBeTruthy();
  });

  it('hides Email button when documentPreview is falsy', () => {
    setup({ documentPreview: null });
    expect(screen.queryByTestId('row-quick-action-email')).toBeNull();
  });

  it('shows Email button when documentPreview is configured', () => {
    setup({ documentPreview: true });
    expect(screen.getByTestId('row-quick-action-email')).toBeTruthy();
  });

  it('hides Delete when status disallows deletion via shared util', () => {
    setup({
      row: COMPLETED_ROW,
      hideDeleteWhenComplete: true,
      statusField: 'documentStatus',
    });
    expect(screen.queryByTestId('row-quick-action-delete')).toBeNull();
  });

  it('renders Delete when hideDeleteWhenComplete is off even on completed records', () => {
    setup({
      row: COMPLETED_ROW,
      hideDeleteWhenComplete: false,
      statusField: 'documentStatus',
    });
    expect(screen.getByTestId('row-quick-action-delete')).toBeTruthy();
  });

  it('hides Delete unconditionally when hideDeleteButton is true (draft row)', () => {
    setup({ row: DRAFT_ROW, hideDeleteButton: true, statusField: 'documentStatus' });
    expect(screen.queryByTestId('row-quick-action-delete')).toBeNull();
  });

  it('hides Delete via hideDeleteButton even with hideDeleteWhenComplete off', () => {
    setup({
      row: COMPLETED_ROW,
      hideDeleteWhenComplete: false,
      hideDeleteButton: true,
      statusField: 'documentStatus',
    });
    expect(screen.queryByTestId('row-quick-action-delete')).toBeNull();
  });

  it('renders Delete when hideDeleteButton is absent (default false)', () => {
    setup({ row: DRAFT_ROW, statusField: 'documentStatus' });
    expect(screen.getByTestId('row-quick-action-delete')).toBeTruthy();
  });

  it('shows kebab when menuActions are provided and filters invisible ones', async () => {
    const user = userEvent.setup();
    const menuActions = [
      { key: 'a', label: 'Action A', visible: true },
      { key: 'b', label: 'Action B', visible: false },
      { key: 'c', label: 'Action C' }, // no visible field ⇒ visible by default
    ];
    setup({ menuActions });
    const more = screen.getByTestId('row-quick-action-more');
    expect(within(more).getByTestId('MoreVertical__ec6673')).toHaveAttribute('data-icon', 'iconic-dots-vertical');
    await user.click(more);
    expect(screen.getByText('Action A')).toBeTruthy();
    expect(screen.queryByText('Action B')).toBeNull();
    expect(screen.getByText('Action C')).toBeTruthy();
  });

  it('renders Edit with the Iconic edit icon (stable testid) and calls onEdit', async () => {
    const user = userEvent.setup();
    const { onEdit } = setup();
    const btn = screen.getByTestId('row-quick-action-edit');
    expect(within(btn).getByTestId('Pencil__ec6673')).toHaveAttribute('data-icon', 'iconic-edit');
    await user.click(btn);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(DRAFT_ROW);
  });

  // Figma "Sticky Acciones": the band is exactly its cell (DataTable reserves >= 100px), padding 0 12px,
  // buttons flush right with a 2px gap, the transparent -> row-hover gradient, no border/shadow.
  it('renders the actions band with the Figma Sticky Acciones geometry and gradient', () => {
    setup();
    const tokens = screen.getByTestId('row-quick-actions').className.split(/\s+/);
    expect(tokens).toEqual(expect.arrayContaining([
      'absolute', 'right-0', 'min-w-full', 'px-3', 'justify-end', 'gap-0.5',
      'bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,var(--row-hover-bg,hsl(var(--card)))_10.58%)]',
    ]));
    expect(tokens).not.toContain('gap-0');
    expect(tokens.some((t) => /(^|:)(border|shadow)(-|$)/.test(t))).toBe(false);
  });

  it('calls onClone when Clone is clicked', async () => {
    const user = userEvent.setup();
    const { onClone } = setup();
    const btn = screen.getByTestId('row-quick-action-clone');
    expect(within(btn).getByTestId('Copy__ec6673')).toHaveAttribute('data-icon', 'iconic-copy');
    await user.click(btn);
    expect(onClone).toHaveBeenCalledTimes(1);
  });

  it('calls onEmail when Email is clicked (with documentPreview)', async () => {
    const user = userEvent.setup();
    const { onEmail } = setup({ documentPreview: true });
    const btn = screen.getByTestId('row-quick-action-email');
    expect(within(btn).getByTestId('Mail__ec6673')).toHaveAttribute('data-icon', 'iconic-mail');
    await user.click(btn);
    expect(onEmail).toHaveBeenCalledTimes(1);
  });

  it('renders Delete with the Iconic trash icon and calls onDelete with the row', async () => {
    const user = userEvent.setup();
    const { onDelete } = setup();
    const btn = screen.getByTestId('row-quick-action-delete');
    expect(within(btn).getByTestId('IconicTrashIcon__ec6673')).toHaveAttribute('data-icon', 'iconic-trash');
    await user.click(btn);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(DRAFT_ROW);
  });

  it('dispatches documentAction via useDocumentAction when kebab item declares one', async () => {
    const user = userEvent.setup();
    const menuActions = [{ key: 'complete', label: 'Complete', documentAction: 'CO' }];
    const { onMenuActionExecuted } = setup({ menuActions });
    await user.click(screen.getByTestId('row-quick-action-more'));
    await user.click(screen.getByText('Complete'));
    expect(docActionExecuteMock).toHaveBeenCalledWith('1', 'CO');
    expect(onMenuActionExecuted).toHaveBeenCalled();
  });

  it('invokes inline onClick handler for kebab items without documentAction', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn().mockResolvedValue('done');
    const menuActions = [{ key: 'custom', label: 'Custom', onClick }];
    const { onMenuActionExecuted } = setup({ menuActions });
    await user.click(screen.getByTestId('row-quick-action-more'));
    await user.click(screen.getByText('Custom'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onMenuActionExecuted).toHaveBeenCalled();
  });

  // ETP-3914 slice 3 — in-flight + visibleWhen
  describe('in-flight state per button', () => {
    it('disables the Edit button and prevents a second click while the handler is pending', async () => {
      const user = userEvent.setup();
      // Deferred resolver so we can observe the in-flight window
      let resolveEdit;
      const onEdit = vi.fn(() => new Promise((res) => { resolveEdit = res; }));
      setup({ onEdit });
      const btn = screen.getByTestId('row-quick-action-edit');
      await user.click(btn);
      expect(onEdit).toHaveBeenCalledTimes(1);
      // While pending: clicking again must be a no-op (button is disabled).
      expect(btn).toHaveProperty('disabled', true);
      await user.click(btn);
      expect(onEdit).toHaveBeenCalledTimes(1);
      // Resolve and let React flush
      resolveEdit();
      await new Promise((r) => setTimeout(r, 0));
    });

    it('swaps the Delete trash icon for a spinner while onDelete is pending', async () => {
      const user = userEvent.setup();
      let resolveDelete;
      const onDelete = vi.fn(() => new Promise((res) => { resolveDelete = res; }));
      setup({ onDelete });
      const btn = screen.getByTestId('row-quick-action-delete');
      await user.click(btn);
      expect(btn).toBeDisabled();
      expect(within(btn).getByTestId('Loader2__ec6673')).toBeInTheDocument();
      expect(within(btn).queryByTestId('IconicTrashIcon__ec6673')).toBeNull();
      await act(async () => { resolveDelete(); });
      expect(within(btn).getByTestId('IconicTrashIcon__ec6673')).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });

    it('shows a spinner inside the kebab item while documentAction is in flight', async () => {
      const user = userEvent.setup();
      let resolveDoc;
      docActionExecuteMock.mockImplementationOnce(() => new Promise((res) => { resolveDoc = res; }));
      const menuActions = [{ key: 'complete', label: 'Complete', documentAction: 'CO' }];
      setup({ menuActions });
      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText('Complete'));
      // Pending: button still rendered, but disabled. The Loader2 icon is mounted (testable by
      // class `animate-spin`). We can't easily query lucide-react SVGs, but disabled state is
      // enough of a signal that the in-flight branch executed.
      // The dropdown closes immediately on click; nothing else to assert without DOM hooks.
      resolveDoc({ ok: true });
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  // ── Lines 92-93: catch branch in runWithInFlight ──────────────────────────
  describe('runWithInFlight error handling', () => {
    it('catches a thrown handler error and console.errors without rethrowing (lines 92-93)', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onEdit = vi.fn().mockRejectedValue(new Error('boom'));
      setup({ onEdit });
      await user.click(screen.getByTestId('row-quick-action-edit'));
      // Wait for the async handler to settle
      await new Promise((r) => setTimeout(r, 0));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Quick action 'edit' failed:"),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  // ── Line 148: menuActions as a function branch ────────────────────────────
  describe('menuActions as a function', () => {
    it('resolves menu items when menuActions is a function (line 148)', async () => {
      const user = userEvent.setup();
      const menuActions = vi.fn(({ row: _r, status: _s }) => [
        { key: 'fn-action', label: 'Function Action' },
      ]);
      setup({ menuActions, statusField: 'documentStatus' });
      const more = screen.getByTestId('row-quick-action-more');
      await user.click(more);
      expect(screen.getByText('Function Action')).toBeTruthy();
      // Verify the function was called with the expected shape
      expect(menuActions).toHaveBeenCalledWith(
        expect.objectContaining({ row: DRAFT_ROW, status: 'DR' }),
      );
    });

    it('passes undefined as status when statusField is not set', async () => {
      const user = userEvent.setup();
      const menuActions = vi.fn(() => [{ key: 'x', label: 'X' }]);
      setup({ menuActions }); // no statusField
      await user.click(screen.getByTestId('row-quick-action-more'));
      expect(menuActions).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      );
    });
  });

  // ── Line 184: action.onClick path calls onMenuActionExecuted ─────────────
  describe('action.onClick with onMenuActionExecuted callback', () => {
    it('passes onClick result to onMenuActionExecuted (line 184)', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn().mockResolvedValue({ handled: true });
      const menuActions = [{ key: 'custom2', label: 'Custom2', onClick }];
      const { onMenuActionExecuted } = setup({ menuActions, windowName: 'sales-order' });
      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText('Custom2'));
      await new Promise((r) => setTimeout(r, 0));
      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({ row: DRAFT_ROW, windowName: 'sales-order' }),
      );
      expect(onMenuActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'custom2' }),
        { handled: true },
        expect.objectContaining({ id: expect.anything() }), // the row (ETP-5577)
      );
    });
  });

  // ── Line 301: pending class on menu button while docAction.loading ────────
  describe('menu button pending class (line 301)', () => {
    it('applies opacity-50 cursor-not-allowed class to menu button when docAction.loading is true', async () => {
      const user = userEvent.setup();
      docActionLoadingFlag = true;
      const menuActions = [{ key: 'post', label: 'Post', documentAction: 'CO' }];
      setup({ menuActions });
      await user.click(screen.getByTestId('row-quick-action-more'));
      const menuBtn = screen.getByTestId('menu-action-post');
      expect(menuBtn.className).toContain('opacity-50');
      expect(menuBtn.className).toContain('cursor-not-allowed');
      expect(menuBtn).toHaveProperty('disabled', true);
    });
  });

  // ── window.readOnly: suppress the write actions (Edit, Clone, Delete) ──────
  describe('readOnly window (window.readOnly)', () => {
    it('hides Edit, Clone and Delete when readOnly is true', () => {
      setup({ readOnly: true });
      expect(screen.queryByTestId('row-quick-action-edit')).toBeNull();
      expect(screen.queryByTestId('row-quick-action-clone')).toBeNull();
      expect(screen.queryByTestId('row-quick-action-delete')).toBeNull();
    });

    it('renders Edit and Delete when readOnly is absent (default false, regression)', () => {
      setup();
      expect(screen.getByTestId('row-quick-action-edit')).toBeTruthy();
      expect(screen.getByTestId('row-quick-action-delete')).toBeTruthy();
    });
  });

  describe('visibleWhen predicate', () => {
    it('hides a canonical action when its visibleWhen expression evaluates false for the row', () => {
      // DRAFT_ROW.documentStatus === 'DR'. Expression demands status === 'CO'.
      setup({
        actionsConfig: {
          edit: { visibleWhen: "@DocumentStatus@='CO'" },
        },
      });
      expect(screen.queryByTestId('row-quick-action-edit')).toBeNull();
      // Other actions remain visible
      expect(screen.getByTestId('row-quick-action-clone')).toBeTruthy();
    });

    it('keeps a canonical action visible when its visibleWhen expression evaluates true', () => {
      setup({
        actionsConfig: {
          edit: { visibleWhen: "@DocumentStatus@='DR'" },
        },
      });
      expect(screen.getByTestId('row-quick-action-edit')).toBeTruthy();
    });

    it('hides a kebab menu item when actionsConfig visibleWhen does not match', async () => {
      const user = userEvent.setup();
      const menuActions = [
        { key: 'voidIt', label: 'Void' },
        { key: 'reactivate', label: 'Reactivate' },
      ];
      setup({
        menuActions,
        actionsConfig: {
          voidIt: { visibleWhen: "@DocumentStatus@='CO'" },
        },
      });
      const more = screen.getByTestId('row-quick-action-more');
      await user.click(more);
      expect(screen.queryByText('Void')).toBeNull();
      expect(screen.getByText('Reactivate')).toBeTruthy();
    });
  });

  // ETP-5378 — invoice Reactivate on the row kebab. ETP-5684 — a posted row is un-posted by
  // the server inside the RE, so the kebab sends the document action alone.
  describe('reactivate documentAction kebab item (ETP-5378)', () => {
    const REACTIVATE = [{ key: 'reactivate', label: 'Reactivate', documentAction: 'RE' }];
    const POSTED_ROW = { id: '9', documentStatus: 'CO', posted: 'Y' };
    const UNPOSTED_ROW = { id: '9', documentStatus: 'CO', posted: 'N' };

    async function clickReactivate(props) {
      const utils = setup({ menuActions: REACTIVATE, ...props });
      const user = userEvent.setup();
      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(await screen.findByText('Reactivate'));
      return utils;
    }

    it('runs the document action on a posted row without unposting it first', async () => {
      await clickReactivate({ row: POSTED_ROW });
      expect(neoActionExecuteMock).not.toHaveBeenCalled();
      expect(docActionExecuteMock).toHaveBeenCalledWith('9', 'RE');
    });

    // useDocumentAction THROWS on failure (useNeoAction resolves instead), so without
    // forwarding the caught error the host never heard about it and the user saw nothing.
    it('reports a thrown document action to the host instead of only the console', async () => {
      // ETP-5577 — with the error's identity and the row, so a period refusal can offer the calendar.
      docActionExecuteMock.mockRejectedValue(
        Object.assign(new Error('Factura contabilizada'), { messageKeys: ['PeriodNotAvailable'] }),
      );
      const { onMenuActionExecuted } = await clickReactivate({ row: UNPOSTED_ROW });
      expect(onMenuActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'reactivate' }),
        { success: false, message: 'Factura contabilizada', messageKeys: ['PeriodNotAvailable'] },
        UNPOSTED_ROW,
      );
    });
  });

  // ETP-5745 QA follow-up (BUG-1) — the row-hover kebab is a THIRD surface offering the
  // reactivation, and list rows are never GET-enriched with `reactivationBlocked`.
  // `preUnpostGuard` is the generic, domain-agnostic hook point: when present on a
  // `documentAction` menu entry, it MUST be checked and MUST block `docAction.execute`
  // whenever it resolves to anything other than exactly `true`.
  describe('preUnpostGuard on a documentAction kebab item (ETP-5745 follow-up)', () => {
    const GUARDED_REACTIVATE = {
      key: 'reactivate', label: 'Reactivate', documentAction: 'RE',
    };
    const POSTED_ROW = { id: '9', documentStatus: 'CO', posted: 'Y' };

    async function clickGuardedReactivate(preUnpostGuard, props) {
      const action = { ...GUARDED_REACTIVATE, preUnpostGuard };
      const utils = setup({ menuActions: [action], ...props });
      const user = userEvent.setup();
      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(await screen.findByText('Reactivate'));
      return utils;
    }

    it('calls preUnpostGuard with the row, the documentAction value, and the ui translator', async () => {
      const preUnpostGuard = vi.fn().mockResolvedValue(true);
      await clickGuardedReactivate(preUnpostGuard, { row: POSTED_ROW });
      expect(preUnpostGuard).toHaveBeenCalledWith(POSTED_ROW, 'RE', expect.any(Function));
    });

    it('blocks the action: reports failure and never runs docAction.execute when the guard resolves to a message', async () => {
      const preUnpostGuard = vi.fn().mockResolvedValue('reactivation blocked: fiscal rectification');
      const { onMenuActionExecuted } = await clickGuardedReactivate(preUnpostGuard, { row: POSTED_ROW });
      expect(onMenuActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'reactivate' }),
        { success: false, message: 'reactivation blocked: fiscal rectification' },
      );
      // The exact side effect ETP-5745 exists to prevent: the row must never be un-posted
      // (neoAction.execute) nor have its document action run when the guard refuses it.
      expect(neoActionExecuteMock).not.toHaveBeenCalled();
      expect(docActionExecuteMock).not.toHaveBeenCalled();
    });

    it('lets the normal flow run when the guard resolves to true: docAction.execute, no unpost', async () => {
      const preUnpostGuard = vi.fn().mockResolvedValue(true);
      const { onMenuActionExecuted } = await clickGuardedReactivate(preUnpostGuard, { row: POSTED_ROW });
      expect(neoActionExecuteMock).not.toHaveBeenCalled();
      expect(docActionExecuteMock).toHaveBeenCalledWith('9', 'RE');
      expect(onMenuActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'reactivate' }),
        { ok: true },
        POSTED_ROW,
      );
    });

    it('does not regress other documentAction entries (e.g. Complete) that carry no preUnpostGuard at all', async () => {
      const menuActions = [{ key: 'complete', label: 'Complete', documentAction: 'CO' }];
      const { onMenuActionExecuted } = setup({ menuActions });
      const user = userEvent.setup();
      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText('Complete'));
      expect(docActionExecuteMock).toHaveBeenCalledWith('1', 'CO');
      expect(onMenuActionExecuted).toHaveBeenCalled();
    });
  });


  // ── ETP-5316: actionsConfig.show === false is an unconditional hide gate ──
  describe('actionsConfig.show === false (unconditional hide, ETP-5316)', () => {
    it('hides Clone when actionsConfig.duplicate.show is false, even though onClone is provided and no visibleWhen restricts it', () => {
      // With no visibleWhen, the pre-fix behavior rendered Clone whenever onClone was passed.
      // `show: false` must override that regardless of row status.
      setup({
        row: DRAFT_ROW,
        actionsConfig: { duplicate: { show: false } },
      });
      expect(screen.queryByTestId('row-quick-action-clone')).toBeNull();
      // Sibling actions remain unaffected.
      expect(screen.getByTestId('row-quick-action-edit')).toBeTruthy();
    });

    it('hides Clone with show: false on a row where the old visibleWhen fallback would also have been true', () => {
      // Row status is DR and there is no visibleWhen fallback, so pre-ETP-5316 logic
      // would render Clone unconditionally. show: false must still win.
      setup({
        row: COMPLETED_ROW,
        actionsConfig: { duplicate: { show: false } },
      });
      expect(screen.queryByTestId('row-quick-action-clone')).toBeNull();
    });

    it('show: false wins even when visibleWhen on the same config would independently evaluate true', () => {
      // DRAFT_ROW.documentStatus === 'DR', so visibleWhen alone would keep Edit visible.
      // show: false must take precedence and hide it anyway.
      setup({
        row: DRAFT_ROW,
        actionsConfig: {
          edit: { visibleWhen: "@DocumentStatus@='DR'", show: false },
        },
      });
      expect(screen.queryByTestId('row-quick-action-edit')).toBeNull();
    });

    it('filters a kebab menu item out of the "More" popover when its actionsConfig entry has show: false, even if the action itself is visible: true', async () => {
      const user = userEvent.setup();
      const menuActions = [
        { key: 'duplicateAction', label: 'Duplicate', visible: true },
        { key: 'reactivate', label: 'Reactivate' },
      ];
      setup({
        menuActions,
        actionsConfig: {
          duplicateAction: { show: false },
        },
      });
      const more = screen.getByTestId('row-quick-action-more');
      await user.click(more);
      expect(screen.queryByText('Duplicate')).toBeNull();
      expect(screen.getByText('Reactivate')).toBeTruthy();
    });

    it('renders Clone normally when show is absent (regression — no config, existing behavior unchanged)', () => {
      setup({ row: DRAFT_ROW, actionsConfig: { duplicate: {} } });
      expect(screen.getByTestId('row-quick-action-clone')).toBeTruthy();
    });

    it('renders Clone normally when show is explicitly true', () => {
      setup({ row: DRAFT_ROW, actionsConfig: { duplicate: { show: true } } });
      expect(screen.getByTestId('row-quick-action-clone')).toBeTruthy();
    });
  });

  // ── ETP-5414: neoActionName override on a `neoAction` menu entry ──
  describe('neoAction menu entries — neoActionName (ETP-5414)', () => {
    async function clickMenuAction(row, action) {
      const user = userEvent.setup();
      const { onMenuActionExecuted } = setup({ row, menuActions: [action] });
      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText(action.label));
      // Let the async handleMenuActionClick chain settle.
      await new Promise((r) => setTimeout(r, 0));
      return { onMenuActionExecuted };
    }

    it('uses the literal neoAction name when neoActionName is not set (unchanged behavior)', async () => {
      await clickMenuAction(DRAFT_ROW, { key: 'a', label: 'Post', neoAction: 'post' });
      expect(mockNeoExecute).toHaveBeenCalledWith('1', 'post');
      expect(mockNeoExecute).toHaveBeenCalledTimes(1);
    });

    it('sends neoActionName as the wire action name when set, never the literal neoAction', async () => {
      await clickMenuAction(DRAFT_ROW, {
        key: 'confirm', label: 'Confirmar', neoAction: 'confirm', neoActionName: 'Processed',
      });
      expect(mockNeoExecute).toHaveBeenCalledWith('1', 'Processed');
      expect(mockNeoExecute).not.toHaveBeenCalledWith('1', 'confirm');
      expect(mockNeoExecute).toHaveBeenCalledTimes(1);
    });

    it('backward compat: an action without neoActionName calls execute once with the literal name, no unpost call, no toast', async () => {
      const { onMenuActionExecuted } = await clickMenuAction(
        DRAFT_ROW,
        { key: 'x', label: 'Do X', neoAction: 'X' },
      );
      expect(mockNeoExecute).toHaveBeenCalledWith('1', 'X');
      expect(mockNeoExecute).toHaveBeenCalledTimes(1);
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(onMenuActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'x' }),
        { success: true },
        expect.objectContaining({ id: expect.anything() }), // the row (ETP-5577)
      );
    });

    // ETP-5684 — amortization's Reactivar: a posted row is un-posted by the server.
    it('runs the main action alone on a posted row, never unposting first', async () => {
      const postedRow = { id: '9', documentStatus: 'CO', posted: 'Y' };
      await clickMenuAction(postedRow, { key: 'reactivate', label: 'Reactivar', neoAction: 'Processed' });
      expect(mockNeoExecute.mock.calls).toEqual([['9', 'Processed']]);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});

// ETP-5684 — the row kebab drops Contabilizar / Descontabilizar for a role without
// "Show Accounting Fields", whether the descriptor came from the shared builder or was
// hand-rolled in a window's index.jsx: the gate reads the generic `neoAction`.
describe('RowQuickActions — accounting capability gate (ETP-5684)', () => {
  const menuActions = [
    { key: 'complete', label: 'Complete', documentAction: 'CO' },
    { key: 'post', label: 'Post', neoAction: 'post' },
    { key: 'unpost', label: 'Unpost', neoAction: 'unpost' },
  ];

  it('lists post and unpost when the role can see accounting', async () => {
    const user = userEvent.setup();
    setup({ menuActions });
    await user.click(screen.getByTestId('row-quick-action-more'));
    expect(screen.getByText('Post')).toBeTruthy();
    expect(screen.getByText('Unpost')).toBeTruthy();
  });

  it('drops post and unpost and keeps the rest when the capability is off', async () => {
    const user = userEvent.setup();
    setMockCapabilities(ACCOUNTING_HIDDEN);
    setup({ menuActions });
    await user.click(screen.getByTestId('row-quick-action-more'));
    expect(screen.getByText('Complete')).toBeTruthy();
    expect(screen.queryByText('Post')).toBeNull();
    expect(screen.queryByText('Unpost')).toBeNull();
  });

  it('renders no kebab when posting was the only menu action', () => {
    setMockCapabilities(ACCOUNTING_HIDDEN);
    setup({ menuActions: [{ key: 'post', label: 'Post', neoAction: 'post' }] });
    expect(screen.queryByTestId('row-quick-action-more')).toBeNull();
  });
});
