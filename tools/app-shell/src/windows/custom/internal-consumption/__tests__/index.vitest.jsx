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

import { render, screen, act } from '@testing-library/react';
import { toast } from 'sonner';
import InternalConsumptionWindow from '../index.jsx';

const ui = (key) => key;
const PROCESSED_UNPOSTED = { id: 'ic-1', processed: 'Y', posted: 'N' };
const PROCESSED_POSTED = { id: 'ic-2', processed: 'Y', posted: 'Y' };
const DRAFT = { id: 'ic-3', processed: 'N', posted: 'N' };
const ROWS = [PROCESSED_UNPOSTED, PROCESSED_POSTED, DRAFT];

const lastAppProps = () => generatedAppProps[generatedAppProps.length - 1];

function renderBulkActions() {
  bulkActionProps.length = 0;
  const BulkActions = lastAppProps().bulkActions;
  render(<BulkActions selectedRows={ROWS} apiBaseUrl="/api" onDone={vi.fn()} />);
  const post = bulkActionProps.find((p) => p.labelKey === 'post');
  const unpost = bulkActionProps.find((p) => p.labelKey === 'unpost');
  return { post, unpost };
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
});
