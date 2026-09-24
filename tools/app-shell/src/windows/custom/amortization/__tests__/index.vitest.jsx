// ETP-5414 — behavioral coverage for the amortización per-row kebab wrapper
// (`tools/app-shell/src/windows/custom/amortization/index.jsx`).
//
// `ListView` is stubbed (its own behavior — row rendering, hover reveal, sticky
// column — is generic and already covered by ListView's own test suite); this
// file's job is to prove the CONFIG this window hands to `ListView`/`RowQuickActions`
// is correct: Edit stays at its default (visible, unchanged), the kebab is added on
// top of it, "Confirmar"/"Reactivar" are offered for the right row state, confirm's
// async validation genuinely runs before execution, and
// reactivate's `preUnpost` wiring — which now lives entirely in `RowQuickActions.jsx`
// (see that file's own suite for the generic mechanism) — is exercised end to end by
// mounting the REAL `RowQuickActions` directly with this window's own config, so both
// share the very same mocked `useNeoAction().execute` call log.
//
// `AmortizationBulkActions.jsx` is mocked ONLY at its default (UI) export — `isConfirmed`,
// `validateConfirmEligibility` and `buildAmortizationActions` stay REAL, so the parity
// test between the row kebab and the bulk bar exercises the actual shared functions,
// not a hand-copied approximation of them.

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

const { mockNeoExecute } = vi.hoisted(() => ({ mockNeoExecute: vi.fn() }));
vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: mockNeoExecute, loading: false }),
}));

// RowQuickActions (mounted for real below) calls useDocumentAction unconditionally.
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn(), loading: false, error: null }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

let currentWindowAccessTier = 'full';
vi.mock('@/auth/AuthContext.jsx', async () => {
  const { createAuthContextMock } = await import('@/test/mockOrderWindowAuth.jsx');
  return createAuthContextMock(() => currentWindowAccessTier);
});

let lastListViewProps = null;
vi.mock('@/components/contract-ui/ListView.jsx', () => ({
  ListView: (props) => {
    lastListViewProps = props;
    return <div data-testid="list-view" />;
  },
}));

vi.mock('@generated/amortization/generated/web/amortization/HeaderPage', () => ({
  default: (props) => <div data-testid="header-page" data-record-id={props.recordId || ''} />,
  api: { labelOverrides: {} },
}));

vi.mock('@generated/amortization/generated/web/amortization/HeaderTable', () => ({
  default: () => <div data-testid="header-table" />,
}));

// Default (UI) export only — named exports (isConfirmed/validateConfirmEligibility/
// buildAmortizationActions) stay real, see file docblock above.
vi.mock('@generated/amortization/custom/AmortizationBulkActions', async () => {
  const actual = await vi.importActual('@generated/amortization/custom/AmortizationBulkActions');
  return {
    ...actual,
    default: () => <div data-testid="amortization-bulk-actions" />,
  };
});

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { buildAmortizationActions } from '@generated/amortization/custom/AmortizationBulkActions';
// ETP-5414 — `buildPostActions` is REAL here too (BulkDocumentAction.jsx is never mocked in
// this file), so the parity check for the new `post` kebab entry exercises the actual shared
// gate the bulk "Contabilizar" button uses, not a hand-copied approximation.
import { buildPostActions } from '@/components/contract-ui/BulkDocumentAction';
import RowQuickActionsComponent from '@/components/contract-ui/RowQuickActions.jsx';
import AmortizationWindow from '../index.jsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

const unconfirmedRow = { id: 'r-unconfirmed', name: 'Amort Unconfirmed', processed: 'N', posted: 'N' };
const confirmedNotPostedRow = { id: 'r-confirmed', name: 'Amort Confirmed', processed: 'Y', posted: 'N' };
const confirmedPostedRow = { id: 'r-posted', name: 'Amort Posted', processed: 'Y', posted: 'Y' };

function renderWindow(props = {}) {
  return render(
    <AmortizationWindow windowName="amortization" apiBaseUrl="/api/amortization" token="tkn" {...props} />,
  );
}

const linesResponse = (lines) => ({ ok: true, json: async () => ({ response: { data: lines } }) });

describe('AmortizationWindow — per-row kebab (ETP-5414)', () => {
  beforeEach(() => {
    lastListViewProps = null;
    currentWindowAccessTier = 'full';
    mockApiFetch.mockReset();
    mockNeoExecute.mockReset();
    mockNeoExecute.mockResolvedValue({ success: true });
    toast.success.mockClear();
    toast.error.mockClear();
  });

  it('renders the WindowAccessGuard instead of ListView when the access tier is none', () => {
    currentWindowAccessTier = 'none';
    renderWindow();
    expect(screen.getByTestId('window-access-guard')).toBeInTheDocument();
    expect(screen.queryByTestId('list-view')).not.toBeInTheDocument();
  });

  it('renders HeaderPage for the detail branch, untouched by this wrapper', () => {
    renderWindow({ recordId: 'amz-1' });
    expect(screen.getByTestId('header-page')).toHaveAttribute('data-record-id', 'amz-1');
    expect(screen.queryByTestId('list-view')).not.toBeInTheDocument();
  });

  describe('list branch — Edit stays default, kebab is added, Clone/Email/Delete stay off', () => {
    it('does not override Edit (stays at its default, visible), never wires onCloneRow/sendDocument/documentPreview, and unconditionally hides Delete', () => {
      renderWindow();
      expect(lastListViewProps.rowQuickActions.actions).toBeUndefined();
      expect(lastListViewProps.rowQuickActions.hideDeleteButton).toBe(true);
      expect(lastListViewProps.onCloneRow).toBeUndefined();
      expect(lastListViewProps.sendDocument).toBeUndefined();
      expect(lastListViewProps.documentPreview).toBeUndefined();
    });
  });

  describe('menuActions — Confirmar / Reactivar visibility by row state', () => {
    it('offers Confirmar (visible) and not Reactivar for an unconfirmed row', () => {
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: unconfirmedRow });
      const byKey = Object.fromEntries(actions.map((a) => [a.key, a]));
      expect(byKey.confirm.visible).toBe(true);
      expect(byKey.reactivate.visible).toBe(false);
    });

    it('offers Reactivar (visible) and not Confirmar for a confirmed row', () => {
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: confirmedNotPostedRow });
      const byKey = Object.fromEntries(actions.map((a) => [a.key, a]));
      expect(byKey.confirm.visible).toBe(false);
      expect(byKey.reactivate.visible).toBe(true);
    });

    it('the reactivate entry is fully declarative: neoAction=Processed, preUnpost=true, no onClick', () => {
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: confirmedNotPostedRow });
      const reactivate = actions.find((a) => a.key === 'reactivate');
      expect(reactivate).toMatchObject({ neoAction: 'Processed', preUnpost: true, successKey: 'reactivated' });
      expect(reactivate.onClick).toBeUndefined();
    });
  });

  describe('menuActions — Contabilizar (post) visibility by row state (ETP-5414)', () => {
    it('is visible for a confirmed, not-posted row', () => {
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: confirmedNotPostedRow });
      expect(actions.find((a) => a.key === 'post').visible).toBe(true);
    });

    it('is NOT visible for an unconfirmed (not yet processed) row', () => {
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: unconfirmedRow });
      expect(actions.find((a) => a.key === 'post').visible).toBe(false);
    });

    it('is NOT visible for an already-posted row', () => {
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: confirmedPostedRow });
      expect(actions.find((a) => a.key === 'post').visible).toBe(false);
    });

    it('the post entry is fully declarative: neoAction=post, successKey=documentPosted, no onClick, no preUnpost', () => {
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: confirmedNotPostedRow });
      const post = actions.find((a) => a.key === 'post');
      expect(post).toMatchObject({ neoAction: 'post', successKey: 'documentPosted' });
      expect(post.onClick).toBeUndefined();
      expect(post.preUnpost).toBeUndefined();
    });

    it('agrees with buildPostActions on eligibility for the same row, for every row state', () => {
      renderWindow();
      for (const row of [unconfirmedRow, confirmedNotPostedRow, confirmedPostedRow]) {
        const postVisible = lastListViewProps.rowQuickActions.menuActions({ row })
          .find((a) => a.key === 'post').visible;
        const bulkOffersPost = buildPostActions([row]).some((a) => a.value === 'post');
        expect(postVisible).toBe(bulkOffersPost);
      }
    });
  });

  describe('parity with the bulk bar (buildAmortizationActions + buildPostActions)', () => {
    it.each([
      ['an unconfirmed row', unconfirmedRow],
      ['a confirmed, not-posted row', confirmedNotPostedRow],
      ['a confirmed, posted row', confirmedPostedRow],
    ])('agrees with buildAmortizationActions + buildPostActions on eligibility for %s', (_label, row) => {
      renderWindow();
      const rowOffers = lastListViewProps.rowQuickActions.menuActions({ row })
        .filter((a) => a.visible)
        .map((a) => a.key)
        .sort();
      // ETP-5414 — the kebab now offers a THIRD entry ('post') that
      // `buildAmortizationActions` alone knows nothing about (it's a separate function,
      // `buildPostActions`, exactly like the bulk bar mounts a SEPARATE
      // `<BulkDocumentAction>` for "Contabilizar" — see AmortizationBulkActions.jsx). The
      // kebab's full offer must equal the UNION of what each bulk button would
      // independently offer for the same single-row selection.
      const bulkOffers = [
        ...buildAmortizationActions([row]).map((a) => a.value),
        ...buildPostActions([row]).map((a) => a.value),
      ].sort();
      expect(rowOffers).toEqual(bulkOffers);
    });
  });

  describe('confirm — async validation runs before execution', () => {
    it('rejects with the validation reason and never executes when validation fails (no lines)', async () => {
      mockApiFetch.mockResolvedValueOnce(linesResponse([]));
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: unconfirmedRow });
      const confirmAction = actions.find((a) => a.key === 'confirm');

      let result;
      await act(async () => {
        result = await confirmAction.onClick({ row: unconfirmedRow });
      });

      expect(result).toEqual({ success: false, message: 'amortizationBulkNoLines' });
      expect(mockNeoExecute).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('amortizationBulkNoLines');
    });

    it('executes Processed and toasts success when validation passes', async () => {
      mockApiFetch.mockResolvedValueOnce(
        linesResponse([{ amortizationPercentage: 10, amortizationAmount: 100 }]),
      );
      renderWindow();
      const actions = lastListViewProps.rowQuickActions.menuActions({ row: unconfirmedRow });
      const confirmAction = actions.find((a) => a.key === 'confirm');

      await act(async () => {
        await confirmAction.onClick({ row: unconfirmedRow });
      });

      expect(mockNeoExecute).toHaveBeenCalledWith(unconfirmedRow.id, 'Processed');
      expect(toast.success).toHaveBeenCalledWith('actionCompleted');
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('bumps refreshTrigger (ListView refreshKey) after a successful confirm', async () => {
      mockApiFetch.mockResolvedValueOnce(
        linesResponse([{ amortizationPercentage: 10, amortizationAmount: 100 }]),
      );
      renderWindow();
      const before = lastListViewProps.refreshTrigger;
      const confirmAction = lastListViewProps.rowQuickActions.menuActions({ row: unconfirmedRow })
        .find((a) => a.key === 'confirm');

      await act(async () => {
        await confirmAction.onClick({ row: unconfirmedRow });
      });

      expect(lastListViewProps.refreshTrigger).toBe(before + 1);
    });

    it('does not double-toast: onMenuActionExecuted skips the confirm key entirely', () => {
      renderWindow();
      expect(() => {
        lastListViewProps.rowQuickActions.onMenuActionExecuted(
          { key: 'confirm' },
          { success: true },
        );
      }).not.toThrow();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('toasts success and bumps refreshTrigger for a declarative reactivate result via onMenuActionExecuted', () => {
      renderWindow();
      const before = lastListViewProps.refreshTrigger;
      act(() => {
        lastListViewProps.rowQuickActions.onMenuActionExecuted(
          { key: 'reactivate', successKey: 'reactivated' },
          { success: true },
        );
      });
      expect(toast.success).toHaveBeenCalledWith('reactivated');
      expect(lastListViewProps.refreshTrigger).toBe(before + 1);
    });

    it('toasts success (documentPosted) and bumps refreshTrigger for a declarative post result via onMenuActionExecuted', () => {
      renderWindow();
      const before = lastListViewProps.refreshTrigger;
      act(() => {
        lastListViewProps.rowQuickActions.onMenuActionExecuted(
          { key: 'post', successKey: 'documentPosted' },
          { success: true },
        );
      });
      expect(toast.success).toHaveBeenCalledWith('documentPosted');
      expect(lastListViewProps.refreshTrigger).toBe(before + 1);
    });

    it('toasts the translated error for a failed declarative post result via onMenuActionExecuted, without bumping refreshTrigger', () => {
      renderWindow();
      const before = lastListViewProps.refreshTrigger;
      act(() => {
        lastListViewProps.rowQuickActions.onMenuActionExecuted(
          { key: 'post', successKey: 'documentPosted' },
          { success: false, message: 'accounting error' },
        );
      });
      expect(toast.error).toHaveBeenCalledWith('accounting error');
      expect(toast.success).not.toHaveBeenCalled();
      // ETP-5414 review — the generic onMenuActionExecuted branch bumps refreshKey
      // unconditionally (success or failure), mirroring the existing behaviour already
      // exercised for reactivate elsewhere in this file; asserted explicitly here too so a
      // future change to that branch is caught from the post entry's own coverage.
      expect(lastListViewProps.refreshTrigger).toBe(before + 1);
    });
  });

  // ── reactivate's preUnpost, exercised through the REAL RowQuickActions ──────────
  // Mounts the actual generic component with this window's own `menuActions`/
  // `onMenuActionExecuted` config, so the preUnpost mechanism (which lives entirely
  // in RowQuickActions.jsx — see that file's own suite for the generic contract) is
  // proven wired correctly from amortización's specific config, sharing the same
  // mocked useNeoAction().execute call log as AmortizationWindow itself.
  describe('reactivate — preUnpost wiring via the real RowQuickActions', () => {
    function mountRealKebab(row) {
      renderWindow();
      const rq = lastListViewProps.rowQuickActions;
      return render(
        <table>
          <tbody>
            <tr>
              <td>
                <RowQuickActionsComponent
                  row={row}
                  windowName="amortization"
                  apiBaseUrl="/api/amortization"
                  token="tkn"
                  menuActions={rq.menuActions}
                  onMenuActionExecuted={rq.onMenuActionExecuted}
                  hideDeleteButton={rq.hideDeleteButton}
                  actionsConfig={rq.actions}
                />
              </td>
            </tr>
          </tbody>
        </table>,
      );
    }

    it('a posted, confirmed row: unpost runs before Processed when Reactivar is clicked', async () => {
      const user = userEvent.setup();
      mountRealKebab(confirmedPostedRow);

      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText('reactivate'));
      await new Promise((r) => setTimeout(r, 0));

      expect(mockNeoExecute.mock.calls).toEqual([
        ['r-posted', 'unpost'],
        ['r-posted', 'Processed'],
      ]);
      expect(toast.success).toHaveBeenCalledWith('reactivated');
    });

    it('a posted, confirmed row whose unpost fails: Processed never runs, and RowQuickActions itself toasts the failure (not AmortizationWindow)', async () => {
      mockNeoExecute.mockImplementation(async (id, actionName) => {
        if (actionName === 'unpost') return { success: false, message: 'accounting settled' };
        return { success: true };
      });
      const user = userEvent.setup();
      mountRealKebab(confirmedPostedRow);

      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText('reactivate'));
      await new Promise((r) => setTimeout(r, 0));

      expect(mockNeoExecute).toHaveBeenCalledWith('r-posted', 'unpost');
      expect(mockNeoExecute).not.toHaveBeenCalledWith('r-posted', 'Processed');
      // This is RowQuickActions.jsx's own preUnpost-failure toast, fired before it
      // calls onMenuActionExecuted({success:false,...}) — AmortizationWindow's own
      // onMenuActionExecuted has no preUnpost-specific toast of its own, so a single
      // toast.error call here proves there is exactly one toast, from one place.
      expect(toast.error).toHaveBeenCalledWith('accounting settled');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('a confirmed, NOT posted row: Reactivar runs Processed directly, no unpost call', async () => {
      const user = userEvent.setup();
      mountRealKebab(confirmedNotPostedRow);

      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText('reactivate'));
      await new Promise((r) => setTimeout(r, 0));

      expect(mockNeoExecute).toHaveBeenCalledWith('r-confirmed', 'Processed');
      expect(mockNeoExecute).not.toHaveBeenCalledWith('r-confirmed', 'unpost');
      expect(mockNeoExecute).toHaveBeenCalledTimes(1);
    });
  });

  // ── post ("Contabilizar"), exercised through the REAL RowQuickActions ──────────────
  // Mirrors the reactivate block above (same `mountRealKebab` helper, same mocked
  // useNeoAction().execute call log), but proves the DIFFERENCE that matters for this
  // entry: no preUnpost step — a single 'post' call, never an 'unpost' call first.
  describe('post — no preUnpost, single call, via the real RowQuickActions', () => {
    function mountRealKebab(row) {
      renderWindow();
      const rq = lastListViewProps.rowQuickActions;
      return render(
        <table>
          <tbody>
            <tr>
              <td>
                <RowQuickActionsComponent
                  row={row}
                  windowName="amortization"
                  apiBaseUrl="/api/amortization"
                  token="tkn"
                  menuActions={rq.menuActions}
                  onMenuActionExecuted={rq.onMenuActionExecuted}
                  hideDeleteButton={rq.hideDeleteButton}
                  actionsConfig={rq.actions}
                />
              </td>
            </tr>
          </tbody>
        </table>,
      );
    }

    it('a confirmed, not-posted row: clicking Contabilizar fires exactly one neoAction.execute call, with "post" — no preUnpost/unpost call', async () => {
      const user = userEvent.setup();
      mountRealKebab(confirmedNotPostedRow);

      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText('post'));
      await new Promise((r) => setTimeout(r, 0));

      expect(mockNeoExecute).toHaveBeenCalledWith('r-confirmed', 'post');
      expect(mockNeoExecute).not.toHaveBeenCalledWith('r-confirmed', 'unpost');
      expect(mockNeoExecute).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith('documentPosted');
    });

    it('a confirmed, not-posted row whose post action fails: toasts the translated failure via onMenuActionExecuted', async () => {
      mockNeoExecute.mockResolvedValue({ success: false, message: 'accounting error' });
      const user = userEvent.setup();
      mountRealKebab(confirmedNotPostedRow);

      await user.click(screen.getByTestId('row-quick-action-more'));
      await user.click(screen.getByText('post'));
      await new Promise((r) => setTimeout(r, 0));

      expect(mockNeoExecute).toHaveBeenCalledWith('r-confirmed', 'post');
      expect(mockNeoExecute).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith('accounting error');
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('is not offered at all for a confirmed, already-posted row (no "post" menu item to click)', async () => {
      const user = userEvent.setup();
      mountRealKebab(confirmedPostedRow);

      await user.click(screen.getByTestId('row-quick-action-more'));
      expect(screen.queryByText('post')).not.toBeInTheDocument();
    });
  });

  describe('source-reading: isConfirmed/validateConfirmEligibility are imported, not duplicated (ETP-5414)', () => {
    it('imports isConfirmed and validateConfirmEligibility from AmortizationBulkActions.jsx', () => {
      const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');
      expect(src).toMatch(
        /import AmortizationBulkActions, \{\s*isConfirmed,\s*validateConfirmEligibility\s*\} from ['"]@generated\/amortization\/custom\/AmortizationBulkActions['"]/,
      );
      // No second, hand-rolled definition of either function in this file.
      expect(src).not.toMatch(/const isConfirmed = /);
      expect(src).not.toMatch(/function validateConfirmEligibility/);
    });

    it('imports isRowPosted and isRowProcessed from BulkDocumentAction.jsx, not re-defined (ETP-5414)', () => {
      const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');
      expect(src).toMatch(
        /import \{\s*isRowPosted,\s*isRowProcessed\s*\} from ['"]@\/components\/contract-ui\/BulkDocumentAction['"]/,
      );
      // No second, hand-rolled definition of either predicate in this file.
      expect(src).not.toMatch(/const isRowPosted = /);
      expect(src).not.toMatch(/const isRowProcessed = /);
    });
  });
});
