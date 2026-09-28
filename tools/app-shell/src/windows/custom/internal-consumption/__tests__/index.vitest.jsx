// ETP-5445 — render suite for the Internal Consumption custom window wrapper.
// GeneratedApp and the BulkDocumentAction component are stubbed so the test can
// capture the props the wrapper wires in; the row filters / action builders are
// the REAL ones re-exported from BulkDocumentAction, so the Post/Unpost gating
// asserted here is the production behavior, not a copy of it.

const generatedAppProps = [];
vi.mock('@generated/internal-consumption/generated/web/internal-consumption/index.jsx', () => ({
  default: (props) => {
    generatedAppProps.push(props);
    return <div data-testid="generated-app" data-refresh={props.refreshTrigger} />;
  },
}));

const bulkActionProps = [];
vi.mock('@/components/contract-ui/BulkDocumentAction', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: (props) => {
      bulkActionProps.push(props);
      return <div data-testid={props['data-testid']} />;
    },
  };
});

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// ETP-5445 — the row Confirm entry POSTs through useApiFetch. A STABLE mock (hoisted, same
// identity every render) so the memoized rowQuickActions is not rebuilt on each render.
const { mockApiFetch, mockExtractErrorMessage } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockExtractErrorMessage: vi.fn(),
}));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));
vi.mock('@/hooks/useEntity.js', async (importOriginal) => ({
  ...(await importOriginal()),
  extractErrorMessage: (...args) => mockExtractErrorMessage(...args),
}));

import { render, screen, act } from '@testing-library/react';
import { toast } from 'sonner';
import { PROCESS_FAILURE_TOAST_DURATION_MS } from '@/hooks/useEntity.js';
import InternalConsumptionWindow, {
  buildConfirmActions, confirmRowFilter, isConfirmableRow,
} from '../index.jsx';

const ui = (key) => key;
const PROCESSED_UNPOSTED = { id: 'ic-1', processed: 'Y', posted: 'N' };
const PROCESSED_POSTED = { id: 'ic-2', processed: 'Y', posted: 'Y' };
const DRAFT = { id: 'ic-3', processed: 'N', posted: 'N' };
const ROWS = [PROCESSED_UNPOSTED, PROCESSED_POSTED, DRAFT];
// ETP-5445 — a real draft as the list returns it: status DR and not processed.
const CONFIRMABLE = { id: 'ic-4', status: 'DR', processed: 'N', posted: 'N' };
const COMPLETED = { id: 'ic-5', status: 'CO', processed: 'Y', posted: 'N' };
const CONFIRM_PARAMS = { fieldValues: { processNow: 'CO' }, action: 'CO' };

const lastAppProps = () => generatedAppProps[generatedAppProps.length - 1];

function renderBulkActions() {
  bulkActionProps.length = 0;
  const BulkActions = lastAppProps().bulkActions;
  render(<BulkActions selectedRows={ROWS} apiBaseUrl="/api" onDone={vi.fn()} />);
  const post = bulkActionProps.find((p) => p.labelKey === 'post');
  const unpost = bulkActionProps.find((p) => p.labelKey === 'unpost');
  const confirm = bulkActionProps.find((p) => p.labelKey === 'confirm');
  return { post, unpost, confirm };
}

/** Rows the given bulk action would actually apply to (rowFilter === true). */
function applicableRows(actionProps, rows) {
  const actions = actionProps.buildActions(rows);
  expect(actions).toHaveLength(1);
  const { value } = actions[0];
  return rows.filter((row) => actionProps.rowFilter(row, value, ui) === true);
}

describe('InternalConsumptionWindow (ETP-5445)', () => {
  beforeEach(() => {
    generatedAppProps.length = 0;
    bulkActionProps.length = 0;
    vi.clearAllMocks();
    mockApiFetch.mockReset();
    mockExtractErrorMessage.mockReset();
  });

  it('renders GeneratedApp forwarding its own props plus the wrapper wiring', () => {
    render(<InternalConsumptionWindow apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('generated-app')).toBeInTheDocument();
    const props = lastAppProps();
    expect(props.apiBaseUrl).toBe('/api');
    expect(props.token).toBe('tkn');
    expect(typeof props.bulkActions).toBe('function');
    expect(props.rowQuickActions.enabled).toBe(true);
    expect(props.refreshTrigger).toBe(0);
    expect(props['data-testid']).toBe('GeneratedApp__b7e2c1');
  });

  describe('bulkActions', () => {
    it('renders a Post and an Unpost BulkDocumentAction for the internalConsumption entity', () => {
      render(<InternalConsumptionWindow />);
      const { post, unpost } = renderBulkActions();

      expect(screen.getByTestId('BulkDocumentActionPost__b7e2c1')).toBeInTheDocument();
      expect(screen.getByTestId('BulkDocumentActionUnpost__b7e2c1')).toBeInTheDocument();
      for (const p of [post, unpost]) {
        expect(p.entity).toBe('internalConsumption');
        expect(p.actionMode).toBe('neoAction');
      }
    });

    it('forwards the toolbar props (selectedRows, apiBaseUrl) to both actions', () => {
      render(<InternalConsumptionWindow />);
      const { post, unpost } = renderBulkActions();

      expect(post.selectedRows).toBe(ROWS);
      expect(unpost.selectedRows).toBe(ROWS);
      expect(post.apiBaseUrl).toBe('/api');
      expect(unpost.apiBaseUrl).toBe('/api');
    });

    it('Post applies only to the processed + unposted row', () => {
      render(<InternalConsumptionWindow />);
      const { post } = renderBulkActions();

      expect(applicableRows(post, ROWS)).toEqual([PROCESSED_UNPOSTED]);
      expect(post.rowFilter(PROCESSED_POSTED, 'post', ui)).toBe('bulkRowAlreadyPosted');
      expect(post.rowFilter(DRAFT, 'post', ui)).toBe('bulkRowNotCompleted');
    });

    it('Unpost applies only to the processed + posted row', () => {
      render(<InternalConsumptionWindow />);
      const { unpost } = renderBulkActions();

      expect(applicableRows(unpost, ROWS)).toEqual([PROCESSED_POSTED]);
      expect(unpost.rowFilter(PROCESSED_UNPOSTED, 'unpost', ui)).toBe('bulkRowNotPosted');
      expect(unpost.rowFilter(DRAFT, 'unpost', ui)).toBe('bulkRowNotPosted');
    });

    it('offers no Post action when no selected row is postable, and no Unpost when none is posted', () => {
      render(<InternalConsumptionWindow />);
      const { post, unpost } = renderBulkActions();

      expect(post.buildActions([PROCESSED_POSTED, DRAFT])).toEqual([]);
      expect(unpost.buildActions([PROCESSED_UNPOSTED, DRAFT])).toEqual([]);
    });
  });

  describe('rowQuickActions', () => {
    it('shows Post for a processed, unposted row', () => {
      render(<InternalConsumptionWindow />);
      const actions = lastAppProps().rowQuickActions.menuActions({ row: PROCESSED_UNPOSTED });

      expect(actions.map((a) => a.key)).toEqual(['post']);
      expect(actions[0].neoAction).toBe('post');
    });

    it('shows Unpost (destructive) for a processed, posted row', () => {
      render(<InternalConsumptionWindow />);
      const actions = lastAppProps().rowQuickActions.menuActions({ row: PROCESSED_POSTED });

      expect(actions.map((a) => a.key)).toEqual(['unpost']);
      expect(actions[0].neoAction).toBe('unpost');
      expect(actions[0].destructive).toBe(true);
    });

    it('shows neither Post nor Unpost for a draft (unprocessed) row', () => {
      render(<InternalConsumptionWindow />);

      expect(lastAppProps().rowQuickActions.menuActions({ row: DRAFT })).toEqual([]);
    });

    it('accepts boolean posted/processed flags as well as Y/N', () => {
      render(<InternalConsumptionWindow />);
      const { menuActions } = lastAppProps().rowQuickActions;

      expect(menuActions({ row: { processed: true, posted: false } }).map((a) => a.key)).toEqual(['post']);
      expect(menuActions({ row: { processed: true, posted: true } }).map((a) => a.key)).toEqual(['unpost']);
    });

    it('bumps refreshTrigger and toasts success after a menu action executes', () => {
      render(<InternalConsumptionWindow />);
      const { onMenuActionExecuted, menuActions } = lastAppProps().rowQuickActions;
      const [postAction] = menuActions({ row: PROCESSED_UNPOSTED });

      act(() => onMenuActionExecuted(postAction, { success: true }));

      expect(lastAppProps().refreshTrigger).toBe(1);
      expect(screen.getByTestId('generated-app')).toHaveAttribute('data-refresh', '1');
      expect(toast.success).toHaveBeenCalledWith('documentPosted');
    });

    it('still bumps refreshTrigger and toasts the error when the action fails', () => {
      render(<InternalConsumptionWindow />);
      const { onMenuActionExecuted, menuActions } = lastAppProps().rowQuickActions;
      const [unpostAction] = menuActions({ row: PROCESSED_POSTED });

      act(() => onMenuActionExecuted(unpostAction, { success: false, message: 'boom' }));

      expect(lastAppProps().refreshTrigger).toBe(1);
      expect(toast.error).toHaveBeenCalledWith('boom');
    });

    it('increments refreshTrigger on every executed action', () => {
      render(<InternalConsumptionWindow />);
      const { onMenuActionExecuted } = lastAppProps().rowQuickActions;
      const action = { key: 'post', neoAction: 'post', successKey: 'documentPosted' };

      act(() => onMenuActionExecuted(action, { success: true }));
      act(() => onMenuActionExecuted(action, { success: true }));

      expect(lastAppProps().refreshTrigger).toBe(2);
    });

    it('ignores non-NEO menu actions (no refresh, no toast)', () => {
      render(<InternalConsumptionWindow />);
      const { onMenuActionExecuted } = lastAppProps().rowQuickActions;

      act(() => onMenuActionExecuted({ key: 'custom' }, { success: true }));

      expect(lastAppProps().refreshTrigger).toBe(0);
      expect(toast.success).not.toHaveBeenCalled();
    });
  });
  describe('isConfirmableRow', () => {
    it('is true only for a DR row that is not processed', () => {
      expect(isConfirmableRow(CONFIRMABLE)).toBe(true);
      expect(isConfirmableRow({ status: 'DR', processed: false })).toBe(true);
    });

    it('is false for a processed row, even if still flagged DR', () => {
      expect(isConfirmableRow({ status: 'DR', processed: 'Y' })).toBe(false);
      expect(isConfirmableRow({ status: 'DR', processed: true })).toBe(false);
    });

    it('is false for a non-draft status and for null/undefined rows', () => {
      expect(isConfirmableRow(COMPLETED)).toBe(false);
      expect(isConfirmableRow(DRAFT)).toBe(false);
      expect(isConfirmableRow(null)).toBe(false);
      expect(isConfirmableRow(undefined)).toBe(false);
    });
  });

  describe('buildConfirmActions', () => {
    it('offers confirm (processNow + body) when at least one selected row is a draft', () => {
      expect(buildConfirmActions([COMPLETED, CONFIRMABLE])).toEqual([{
        value: 'confirm',
        labelKey: 'confirm',
        neoActionName: 'processNow',
        neoActionBody: CONFIRM_PARAMS,
      }]);
    });

    it('offers nothing when no selected row is a draft', () => {
      expect(buildConfirmActions([COMPLETED, PROCESSED_POSTED, DRAFT])).toEqual([]);
    });

    it('offers nothing for an empty selection', () => {
      expect(buildConfirmActions([])).toEqual([]);
    });
  });

  describe('confirmRowFilter', () => {
    it('lets a draft through', () => {
      expect(confirmRowFilter(CONFIRMABLE, 'confirm', ui)).toBe(true);
    });

    it('skips a non-draft with bulkRowNotDraft', () => {
      expect(confirmRowFilter(COMPLETED, 'confirm', ui)).toBe('bulkRowNotDraft');
      expect(confirmRowFilter({ status: 'DR', processed: 'Y' }, 'confirm', ui)).toBe('bulkRowNotDraft');
    });

    it('does not gate any other action', () => {
      expect(confirmRowFilter(COMPLETED, 'post', ui)).toBe(true);
    });
  });

  describe('bulk Confirm', () => {
    it('renders a Confirm BulkDocumentAction first, wired to processNow with the confirm body', () => {
      render(<InternalConsumptionWindow />);
      const { confirm } = renderBulkActions();

      expect(screen.getByTestId('BulkDocumentActionConfirm__b7e2c1')).toBeInTheDocument();
      expect(bulkActionProps.map((p) => p.labelKey)).toEqual(['confirm', 'post', 'unpost']);
      expect(confirm.entity).toBe('internalConsumption');
      expect(confirm.actionMode).toBe('neoAction');
      expect(confirm.buildActions).toBe(buildConfirmActions);
      expect(confirm.rowFilter).toBe(confirmRowFilter);
      expect(confirm.selectedRows).toBe(ROWS);

      const [action] = confirm.buildActions([CONFIRMABLE]);
      expect(action.neoActionName).toBe('processNow');
      expect(action.neoActionBody).toEqual(CONFIRM_PARAMS);
    });

    it('applies only to the draft rows of a mixed selection', () => {
      render(<InternalConsumptionWindow />);
      const { confirm } = renderBulkActions();

      expect(applicableRows(confirm, [CONFIRMABLE, COMPLETED, PROCESSED_POSTED])).toEqual([CONFIRMABLE]);
    });
  });

  describe('row Confirm', () => {
    const confirmEntry = (row) => lastAppProps().rowQuickActions.menuActions({ row })
      .find((a) => a.key === 'confirm');

    it('is shown for a draft row, ahead of any Post entry', () => {
      render(<InternalConsumptionWindow />);
      const actions = lastAppProps().rowQuickActions.menuActions({ row: CONFIRMABLE });

      expect(actions.map((a) => a.key)).toEqual(['confirm']);
      expect(actions[0].labelKey).toBe('confirm');
      expect(typeof actions[0].onClick).toBe('function');
      // Not a declarative neoAction: that path would send `{}` and double-toast.
      expect(actions[0].neoAction).toBeUndefined();
    });

    it('is not shown for non-draft rows', () => {
      render(<InternalConsumptionWindow />);
      for (const row of [COMPLETED, PROCESSED_POSTED, PROCESSED_UNPOSTED, DRAFT]) {
        expect(confirmEntry(row)).toBeUndefined();
      }
    });

    it('POSTs the exact confirm body to the processNow URL, toasts success and refreshes', async () => {
      mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      render(<InternalConsumptionWindow apiBaseUrl="/api" />);
      const entry = confirmEntry(CONFIRMABLE);

      let result;
      await act(async () => { result = await entry.onClick({ row: CONFIRMABLE }); });

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockApiFetch.mock.calls[0];
      expect(url).toBe('/internalConsumption/ic-4/action/processNow');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual(CONFIRM_PARAMS);
      expect(result).toEqual({ success: true });
      expect(toast.success).toHaveBeenCalledWith('documentConfirmed');
      expect(toast.error).not.toHaveBeenCalled();
      expect(mockExtractErrorMessage).not.toHaveBeenCalled();
      expect(lastAppProps().refreshTrigger).toBe(1);
    });

    it('URL-encodes the record id', async () => {
      mockApiFetch.mockResolvedValue({ ok: true });
      render(<InternalConsumptionWindow />);
      const row = { ...CONFIRMABLE, id: 'a/b c' };

      await act(async () => { await confirmEntry(row).onClick({ row }); });

      expect(mockApiFetch.mock.calls[0][0]).toBe('/internalConsumption/a%2Fb%20c/action/processNow');
    });

    it('on failure toasts the message from extractErrorMessage and still refreshes', async () => {
      const res = { ok: false, status: 400 };
      mockApiFetch.mockResolvedValue(res);
      mockExtractErrorMessage.mockResolvedValue('Stock insuficiente');
      render(<InternalConsumptionWindow />);

      let result;
      await act(async () => { result = await confirmEntry(CONFIRMABLE).onClick({ row: CONFIRMABLE }); });

      expect(mockExtractErrorMessage).toHaveBeenCalledWith(res, expect.any(Function));
      expect(toast.error).toHaveBeenCalledWith('Stock insuficiente', { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
      expect(toast.success).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, message: 'Stock insuficiente' });
      expect(lastAppProps().refreshTrigger).toBe(1);
    });

    it('falls back to actionFailed when extractErrorMessage yields nothing', async () => {
      mockApiFetch.mockResolvedValue({ ok: false, status: 500 });
      mockExtractErrorMessage.mockResolvedValue('');
      render(<InternalConsumptionWindow />);

      await act(async () => { await confirmEntry(CONFIRMABLE).onClick({ row: CONFIRMABLE }); });

      expect(toast.error).toHaveBeenCalledWith('actionFailed', { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
      expect(lastAppProps().refreshTrigger).toBe(1);
    });

    it('error toasts use the form\'s long process-failure duration, not sonner\'s default', async () => {
      mockApiFetch.mockResolvedValue({ ok: false, status: 400 });
      mockExtractErrorMessage.mockResolvedValue('boom');
      render(<InternalConsumptionWindow />);

      await act(async () => { await confirmEntry(CONFIRMABLE).onClick({ row: CONFIRMABLE }); });

      expect(typeof PROCESS_FAILURE_TOAST_DURATION_MS).toBe('number');
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error.mock.calls[0][1]).toEqual({ duration: PROCESS_FAILURE_TOAST_DURATION_MS });
    });

    it('a rejected fetch (network error) toasts actionFailed, refreshes and resolves { success: false }', async () => {
      mockApiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
      render(<InternalConsumptionWindow />);

      let result;
      await act(async () => { result = await confirmEntry(CONFIRMABLE).onClick({ row: CONFIRMABLE }); });

      expect(result).toEqual({ success: false });
      expect(toast.error).toHaveBeenCalledWith('actionFailed', { duration: PROCESS_FAILURE_TOAST_DURATION_MS });
      expect(toast.success).not.toHaveBeenCalled();
      expect(mockExtractErrorMessage).not.toHaveBeenCalled();
      expect(lastAppProps().refreshTrigger).toBe(1);
    });

    it('is not handled by onMenuActionExecuted (no double toast / refresh)', () => {
      render(<InternalConsumptionWindow />);
      const { onMenuActionExecuted } = lastAppProps().rowQuickActions;

      act(() => onMenuActionExecuted(confirmEntry(CONFIRMABLE), { success: true }));

      expect(toast.success).not.toHaveBeenCalled();
      expect(lastAppProps().refreshTrigger).toBe(0);
    });
  });
  // ETP-5445 regression — Anular (Void) was deliberately REMOVED from the row-hover kebab by
  // user decision; it lives only in the detail kebab (InternalConsumptionActions). Completed
  // rows must offer Post/Unpost but never `void`.
  describe('no row Void (ETP-5445)', () => {
    it.each([
      ['unposted', { id: 'ic-6', status: 'CO', processed: 'Y', posted: 'N' }, ['post']],
      ['posted', { id: 'ic-7', status: 'CO', processed: 'Y', posted: 'Y' }, ['unpost']],
    ])('a completed %s row has no void entry in the row kebab', (_label, row, expectedKeys) => {
      render(<InternalConsumptionWindow />);
      const keys = lastAppProps().rowQuickActions.menuActions({ row }).map((a) => a.key);

      expect(keys).not.toContain('void');
      expect(keys).toEqual(expectedKeys);
    });

    it('the wrapper does not import the voidInternalConsumption helper', async () => {
      const { default: wrapperSrc } = await import('../index.jsx?raw');

      expect(wrapperSrc).not.toMatch(/voidInternalConsumption/);
      expect(wrapperSrc).not.toMatch(/isVoidableRow/);
    });
  });
});
