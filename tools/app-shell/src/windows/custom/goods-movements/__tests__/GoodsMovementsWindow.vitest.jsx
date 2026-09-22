let lastGeneratedAppProps = null;
vi.mock('@generated/goods-movements/generated/web/goods-movements/index.jsx', () => ({
  default: (props) => {
    lastGeneratedAppProps = props;
    const { bulkActions: BulkActions, rowQuickActions, refreshTrigger } = props;
    return (
      <div data-testid="generated-app" data-refresh-trigger={String(refreshTrigger)}>
        {BulkActions && (
          <div data-testid="bulk-actions-slot">
            <BulkActions selectedRows={[]} clearSelection={() => {}} />
          </div>
        )}
        <button
          data-testid="trigger-menu-action-executed"
          onClick={() => rowQuickActions?.onMenuActionExecuted?.({ neoAction: 'post' })}
        >
          Trigger
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/ui/custom-icons', () => ({
  SortIcon: () => null,
  RefreshIcon: () => null,
}));

let bulkDocumentActionCalls = [];
vi.mock('@/components/contract-ui/BulkDocumentAction', async () => ({
  ...(await import('@/test/bulkDocumentActionMock.js')).bulkDocumentActionNamedExports(),
  default: (props) => {
    bulkDocumentActionCalls.push(props);
    return null;
  },
}));

vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// buildDocumentRowQuickActionsPostMenu's onMenuActionExecuted goes through the real
// sonner toast — stub it like every other hook test in this repo.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPostActions, postRowFilter, buildUnpostActions, unpostRowFilter, buildInOutActions,
} from '@/components/contract-ui/BulkDocumentAction';
import { buildPostMenuActions } from '../../shared/buildDocumentRowQuickActions.js';
import GoodsMovementsWindow from '../index.jsx';

const DEFAULT_PROPS = { token: 'tok', apiBaseUrl: '/api', windowName: 'goods-movements' };

describe('GoodsMovementsWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bulkDocumentActionCalls = [];
    lastGeneratedAppProps = null;
  });

  it('renders the generated app with SortIconComponent/RefreshIconComponent', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('generated-app')).toBeInTheDocument();
    expect(lastGeneratedAppProps.SortIconComponent).toBeDefined();
    expect(lastGeneratedAppProps.RefreshIconComponent).toBeDefined();
  });

  it('passes bulkActions=GoodsMovementsBulkAction down to GeneratedApp', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('bulk-actions-slot')).toBeInTheDocument();
  });

  it('mounts exactly two BulkDocumentAction instances (post, unpost)', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    expect(bulkDocumentActionCalls).toHaveLength(2);
    expect(bulkDocumentActionCalls.map((p) => p.labelKey)).toEqual(['post', 'unpost']);
  });

  it('both instances use entity="movement" and actionMode="neoAction"', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    for (const call of bulkDocumentActionCalls) {
      expect(call.entity).toBe('movement');
      expect(call.actionMode).toBe('neoAction');
    }
  });

  it('wires the post instance to the SHARED buildPostActions/postRowFilter references', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    const postCall = bulkDocumentActionCalls.find((p) => p.labelKey === 'post');
    expect(postCall.buildActions).toBe(buildPostActions);
    expect(postCall.rowFilter).toBe(postRowFilter);
  });

  it('wires the unpost instance to the SHARED buildUnpostActions/unpostRowFilter references', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    const unpostCall = bulkDocumentActionCalls.find((p) => p.labelKey === 'unpost');
    expect(unpostCall.buildActions).toBe(buildUnpostActions);
    expect(unpostCall.rowFilter).toBe(unpostRowFilter);
  });

  it('never mounts a buildInOutActions-based bulk button (M_Movement has no DocStatus)', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    for (const call of bulkDocumentActionCalls) {
      expect(call.buildActions).not.toBe(buildInOutActions);
    }
    expect(bulkDocumentActionCalls.map((p) => p.labelKey)).not.toContain('process');
  });

  it('passes rowQuickActions with enabled:true and the buildDocumentRowQuickActionsPostMenu spread', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    expect(lastGeneratedAppProps.rowQuickActions.enabled).toBe(true);
    expect(lastGeneratedAppProps.rowQuickActions.menuActions).toBe(buildPostMenuActions);
    expect(typeof lastGeneratedAppProps.rowQuickActions.onMenuActionExecuted).toBe('function');
  });

  it('bumps refreshTrigger when onMenuActionExecuted runs for a neoAction', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    const before = screen.getByTestId('generated-app').getAttribute('data-refresh-trigger');
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-menu-action-executed'));
    });
    const after = screen.getByTestId('generated-app').getAttribute('data-refresh-trigger');
    expect(Number(after)).toBe(Number(before) + 1);
  });

  // ETP-5209-style regression guard (see goods-receipt's own version of this test):
  // ListView invokes `bulkActions` as a plain function call in its render body, not as
  // JSX — a stray hook call inside the wrapper only crashes THAT way, never via JSX
  // (JSX mounting gives the callee its own hook dispatcher). GoodsMovementsBulkAction
  // itself calls no hooks, so this pins that invariant going forward.
  it('the bulkActions wrapper is callable as a plain function without an Invalid Hook Call error', () => {
    render(<GoodsMovementsWindow {...DEFAULT_PROPS} />);
    const BulkActionsFn = lastGeneratedAppProps.bulkActions;
    expect(() => BulkActionsFn({ selectedRows: [], clearSelection: () => {} })).not.toThrow();
  });
});
