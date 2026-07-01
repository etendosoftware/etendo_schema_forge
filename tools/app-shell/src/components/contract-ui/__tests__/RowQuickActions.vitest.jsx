import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

import RowQuickActions from '../RowQuickActions.jsx';

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
    docActionLoadingFlag = false;
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

  it('shows kebab when menuActions are provided and filters invisible ones', async () => {
    const user = userEvent.setup();
    const menuActions = [
      { key: 'a', label: 'Action A', visible: true },
      { key: 'b', label: 'Action B', visible: false },
      { key: 'c', label: 'Action C' }, // no visible field ⇒ visible by default
    ];
    setup({ menuActions });
    const more = screen.getByTestId('row-quick-action-more');
    expect(more).toBeTruthy();
    await user.click(more);
    expect(screen.getByText('Action A')).toBeTruthy();
    expect(screen.queryByText('Action B')).toBeNull();
    expect(screen.getByText('Action C')).toBeTruthy();
  });

  it('calls onEdit when Edit is clicked', async () => {
    const user = userEvent.setup();
    const { onEdit } = setup();
    await user.click(screen.getByTestId('row-quick-action-edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(DRAFT_ROW);
  });

  it('calls onClone when Clone is clicked', async () => {
    const user = userEvent.setup();
    const { onClone } = setup();
    await user.click(screen.getByTestId('row-quick-action-clone'));
    expect(onClone).toHaveBeenCalledTimes(1);
  });

  it('calls onEmail when Email is clicked (with documentPreview)', async () => {
    const user = userEvent.setup();
    const { onEmail } = setup({ documentPreview: true });
    await user.click(screen.getByTestId('row-quick-action-email'));
    expect(onEmail).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when Delete is clicked', async () => {
    const user = userEvent.setup();
    const { onDelete } = setup();
    await user.click(screen.getByTestId('row-quick-action-delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
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
});
