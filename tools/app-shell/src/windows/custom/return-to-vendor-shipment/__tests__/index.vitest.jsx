/**
 * ReturnToVendorShipmentWindow — bulk actions composition (ETP-5378 QA follow-up, SEL-05/SEL-06).
 *
 * The purchase-side twin of
 * `windows/custom/return-material-receipt/__tests__/index.vitest.jsx` — read that file's
 * header for the full defect narrative. In short: a Completed + "Contabilizado" row offered
 * "Descontabilizar" in the row-hover kebab but produced a selection bar with no document
 * action at all, because the only two `BulkDocumentAction`s mounted were `buildInOutActions`
 * (Procesar) and `buildPostActions` (Contabilizar), and the latter only fires for a row that
 * is `processed && !posted`.
 *
 * Kept as a SEPARATE file rather than a loop over both windows: these are two independent
 * `index.jsx` files with their own entity name and their own import list, and a shared
 * parametrized suite would hide the case where one of them is fixed and the other is not —
 * which is exactly the shape of this defect (QA found it on both windows at once, and the
 * fix had to be applied twice).
 *
 * The exhaustive branch coverage of the predicates themselves lives in
 * `components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx`; this file only pins this
 * window's wiring and the one condition that was false in production.
 */

let lastShellProps;
vi.mock('../../shared/ReturnWindowShell', () => ({
  default: (props) => {
    lastShellProps = props;
    return (
      <div data-testid="return-window-shell">
        {props.bulkActions
          ? <props.bulkActions selectedRows={[{ id: 'rtvs-001', documentNo: 'RTVS-CO-001' }]} />
          : null}
      </div>
    );
  },
}));

vi.mock('@/components/contract-ui/CreateContactContext.js', () => ({
  CreateContactContext: {
    Provider: ({ children }) => <div data-testid="contact-provider">{children}</div>,
  },
}));

vi.mock('@/components/contract-ui/useCreateContactModal.jsx', () => ({
  useCreateContactModal: vi.fn(() => ({
    createContactCtxValue: { open: vi.fn() },
    contactPortal: <div data-testid="contact-portal" />,
  })),
}));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
}));

vi.mock('@/components/contract-ui/CopyLinkButton', () => ({
  default: () => <div data-testid="copy-link-button" />,
}));

vi.mock('@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage', () => ({
  default: () => <div data-testid="rtvs-page" />,
}));

vi.mock('../ReturnToVendorShipmentPreview', () => ({
  default: () => <div data-testid="rtvs-preview" />,
}));

vi.mock('../ReturnToVendorShipmentRowConfirmModal.jsx', () => ({
  default: () => <div data-testid="rtvs-row-confirm-modal" />,
}));

vi.mock('../ReturnToVendorShipmentSecondaryActions.jsx', () => ({
  default: () => <div data-testid="rtvs-secondary-actions" />,
}));

vi.mock('../useReturnToVendorPdf.js', () => ({
  useReturnToVendorPdf: vi.fn(() => ({})),
}));

let bulkDocumentActionCalls = [];
// The named exports come from the shared helper (it documents why a mock must expose the
// module's FULL export surface — omitting one makes the whole spec file fail to load).
// Every builder/filter this window mounts is then swapped back to the REAL implementation:
// the regression guard below has to evaluate the actual gate, not a stub that answers `[]`
// for every input — which is precisely what the broken build behaved like.
vi.mock('@/components/contract-ui/BulkDocumentAction', async () => {
  const actual = await vi.importActual('@/components/contract-ui/BulkDocumentAction');
  const { bulkDocumentActionNamedExports } = await import('@/test/bulkDocumentActionMock.js');
  return {
    ...bulkDocumentActionNamedExports({
      buildInOutActions: actual.buildInOutActions,
      buildPostActions: actual.buildPostActions,
      postRowFilter: actual.postRowFilter,
      buildUnpostActions: actual.buildUnpostActions,
      unpostRowFilter: actual.unpostRowFilter,
    }),
    default: (props) => {
      bulkDocumentActionCalls.push(props);
      const { entity, labelKey, actionMode } = props;
      return (
        <div
          data-testid={`bulk-document-action-${labelKey}`}
          data-entity={entity}
          data-label-key={labelKey}
          data-action-mode={actionMode || 'documentAction'} />
      );
    },
  };
});

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildInOutActions, buildPostActions, postRowFilter, buildUnpostActions, unpostRowFilter,
} from '@/components/contract-ui/BulkDocumentAction';
import ReturnToVendorShipmentWindow from '../index.jsx';

const ENTITY = 'returnToVendorShipment';

const renderWindow = () => render(
  <ReturnToVendorShipmentWindow windowName="return-to-vendor-shipment" apiBaseUrl="/api" token="tkn" />,
);

const callFor = (labelKey) => bulkDocumentActionCalls.find((p) => p.labelKey === labelKey);

describe('ReturnToVendorShipmentWindow — bulk actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastShellProps = null;
    bulkDocumentActionCalls = [];
  });

  describe('ETP-5378 QA follow-up — bulk Descontabilizar', () => {
    it('mounts THREE BulkDocumentAction instances, in process → post → unpost order', () => {
      renderWindow();

      expect(screen.getByTestId('bulk-document-action-process')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-document-action-post')).toBeInTheDocument();
      expect(screen.getByTestId('bulk-document-action-unpost')).toBeInTheDocument();

      const labelKeys = bulkDocumentActionCalls.map((p) => p.labelKey);
      expect(labelKeys.filter((k, i) => labelKeys.indexOf(k) === i)).toEqual(['process', 'post', 'unpost']);
    });

    it('wires the unpost instance to the SHARED helpers, in neoAction mode, on its own entity', () => {
      renderWindow();

      const unpost = callFor('unpost');
      expect(unpost.buildActions).toBe(buildUnpostActions);
      expect(unpost.rowFilter).toBe(unpostRowFilter);
      expect(unpost.actionMode).toBe('neoAction');
      expect(unpost.labelKey).toBe('unpost');
      expect(unpost.entity).toBe(ENTITY);
      expect(screen.getByTestId('bulk-document-action-unpost')).toHaveAttribute('data-entity', ENTITY);
    });

    // Guard against the new button DISPLACING Contabilizar rather than joining it — the two
    // are one-line-apart siblings with near-identical prop lists, so a crossed helper
    // reference would look right in review and be invisible to a regex-based test.
    it('leaves the Contabilizar instance untouched (no crossed helpers)', () => {
      renderWindow();

      const post = callFor('post');
      expect(post.buildActions).toBe(buildPostActions);
      expect(post.rowFilter).toBe(postRowFilter);
      expect(post.actionMode).toBe('neoAction');
      expect(post.entity).toBe(ENTITY);
      expect(post.buildActions).not.toBe(buildUnpostActions);
      expect(post.rowFilter).not.toBe(unpostRowFilter);
    });

    it('leaves the Procesar (DR→CO) instance untouched, on the documentAction path', () => {
      renderWindow();

      const process = callFor('process');
      expect(process.buildActions).toBe(buildInOutActions);
      expect(process.actionMode).toBeUndefined();
      expect(process.entity).toBe(ENTITY);
      expect(screen.getByTestId('bulk-document-action-process')).toHaveAttribute('data-action-mode', 'documentAction');
    });

    // A return shipment's accounting reversal IS a standalone action here — the same rule
    // goods-shipment follows. `preUnpostActions` (unpost-then-act, chained inside Reactivar)
    // belongs to the invoice windows only; opting in here would silently reverse accounting
    // as a side effect of another action.
    it('never opts into preUnpostActions on any instance', () => {
      renderWindow();

      for (const call of bulkDocumentActionCalls) {
        expect(call.preUnpostActions).toBeUndefined();
      }
    });

    it('still renders CopyLinkButton beside the three document actions', () => {
      renderWindow();

      expect(screen.getByTestId('copy-link-button')).toBeInTheDocument();
    });
  });

  // ── The regression itself ───────────────────────────────────────────────────
  // Stated as the user-visible invariant rather than as a prop check: whatever the wiring
  // looks like, a posted + completed row must leave the selection bar with something to do.
  describe('SEL-05/SEL-06 regression — a posted row must yield at least one bulk action', () => {
    const POSTED_ROW = { id: 'rtvs-002', documentNo: 'RTVS-CO-002', documentStatus: 'CO', processed: 'Y', posted: 'Y' };

    it('the union of the mounted builders is non-empty for a Completed + Contabilizado row', () => {
      renderWindow();

      const rows = [POSTED_ROW];
      const union = bulkDocumentActionCalls
        .filter((p, i, all) => all.findIndex((q) => q.labelKey === p.labelKey) === i)
        .flatMap((p) => p.buildActions(rows));

      // This is the assertion that was false in production: every mounted builder answered
      // [], so BulkDocumentAction returned null three times over and the bar showed nothing.
      expect(union.length).toBeGreaterThan(0);
      expect(union.map((a) => a.value)).toContain('unpost');
    });

    it('Contabilizar is correctly absent for that same row — Descontabilizar is the only one', () => {
      renderWindow();

      const rows = [POSTED_ROW];
      expect(callFor('post').buildActions(rows)).toEqual([]);
      expect(callFor('unpost').buildActions(rows)).toEqual([{ value: 'unpost', labelKey: 'unpost' }]);
      expect(callFor('process').buildActions(rows)).toEqual([]);
    });

    // The mirror case, so the fix cannot be "always offer unpost": a completed but NOT yet
    // posted row must still get Contabilizar and must NOT get Descontabilizar.
    it('the not-yet-posted mirror case still offers Contabilizar only', () => {
      renderWindow();

      const rows = [{ ...POSTED_ROW, id: 'rtvs-003', posted: 'N' }];
      expect(callFor('post').buildActions(rows)).toEqual([{ value: 'post', labelKey: 'post' }]);
      expect(callFor('unpost').buildActions(rows)).toEqual([]);
    });

    it('the unpost rowFilter admits the posted row and blocks the unposted one', () => {
      renderWindow();

      const ui = (key) => key;
      expect(callFor('unpost').rowFilter(POSTED_ROW, 'unpost', ui)).toBe(true);
      expect(callFor('unpost').rowFilter({ ...POSTED_ROW, posted: 'N' }, 'unpost', ui)).toBe('bulkRowNotPosted');
    });
  });

  // ETP-5209 production crash, guarded here too: ListView invokes the `bulkActions` slot as a
  // PLAIN FUNCTION CALL inside its own render body, never as JSX. Calling the captured
  // reference directly — outside any React render pass — reproduces the hook-dispatcher-less
  // context production hits, so a stray hook added to this wrapper fails here instead of
  // crashing the first time a user ticks a checkbox.
  it('the bulkActions wrapper is callable as a plain function (no hooks inside)', () => {
    renderWindow();

    expect(() => lastShellProps.bulkActions({
      selectedRows: [{ id: 'rtvs-002', processed: 'Y', posted: 'Y' }],
      clearSelection: vi.fn(),
      token: 'tkn',
      apiBaseUrl: '/api',
      windowName: 'return-to-vendor-shipment',
    })).not.toThrow();
  });
});
