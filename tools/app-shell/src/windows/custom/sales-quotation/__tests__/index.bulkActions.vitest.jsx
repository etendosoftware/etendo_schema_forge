/**
 * SalesQuotationWindow — selection-bar composition (ETP-5378 QA follow-up, case SEL-08).
 *
 * <b>The defect.</b> A Presupuesto de Venta in Borrador could be confirmed from the row-hover
 * kebab (see `index.confirmAction.vitest.jsx`), but ticking that same row's checkbox produced a
 * selection bar with only copy-link / print / clone / delete — no "Procesar". Pedido de Venta,
 * the sibling window over the very same `C_Order` table, has had it all along. The cause was not
 * a mis-gated builder: `SalesQuotationBulkActions` rendered ONLY `<CopyLinkButton>` and never
 * mounted a `BulkDocumentAction` at all.
 *
 * <b>Two design points these tests exist to pin</b>, because both look like something a future
 * reader would "simplify":
 *
 *  1. `buildInOutActions` is passed EXPLICITLY. `BulkDocumentAction`'s own built-in fallback
 *     (used when no `buildActions` prop is given) also offers `RE` (Reactivar) for completed
 *     rows. Reactivating a quotation is a separate flow with its own modal and must never be
 *     reachable from this bar — so "drop the redundant-looking prop and let the default kick in"
 *     is a real regression, and it is asserted by reference identity plus a guard that drives the
 *     REAL builder with a completed row and finds no `RE`.
 *
 *  2. The fix uses the GENERIC component, not `SendToEvaluationModal`. That modal is a
 *     per-document summary (total, line count, no-lines guard) with no meaning for N records.
 *     Quotation and Order are both `C_Order` rows and both resolve DocAction to the same classic
 *     process 104, so the wire call matches Pedido's exactly — only the entity segment
 *     (`quotation` vs `header`) differs. Hence `entity="quotation"` and the default
 *     `documentAction` action mode (NOT `neoAction`) are both asserted.
 *
 * The exhaustive branch coverage of `buildInOutActions` itself lives in
 * `components/contract-ui/__tests__/BulkDocumentAction.*`; this file pins THIS window's wiring,
 * its private `quotationBulkRowFilter`, and the one condition that was false in production.
 */

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return { ...actual, createPortal: (node) => <div data-testid="portal">{node}</div> };
});

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: () => ({ requestDelete: vi.fn(), deleteDialog: null }),
}));

vi.mock('@/components/contract-ui/CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children },
}));

vi.mock('@/components/contract-ui/useCreateContactModal.jsx', () => ({
  useCreateContactModal: () => ({ headers: {}, createContactCtxValue: {}, contactPortal: null }),
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({ default: () => null }));

vi.mock('../../shared/useRowEmailModal.jsx', () => ({
  useRowEmailModal: () => ({ onEmail: vi.fn(), emailModalPortal: null }),
}));

vi.mock('../../shared/useQuotationPdf.js', () => ({ useQuotationPdf: () => ({}) }));
vi.mock('../../shared/QuotationPreview.jsx', () => ({ default: () => null }));
vi.mock('../../shared/useSavedPreviewRecord.js', () => ({
  useSavedPreviewRecord: () => ({ effectiveRecord: null, clearSavedRecord: vi.fn() }),
}));

vi.mock('@generated/sales-quotation/generated/web/sales-quotation/QuotationTable', () => ({ default: () => null }));
vi.mock('@generated/sales-quotation/custom/QuotationSecondaryActions', () => ({ default: () => null }));
vi.mock('@generated/sales-quotation/custom/SendToEvaluationModal', () => ({ default: () => null }));
vi.mock('@generated/sales-quotation/custom/QuotationConfirmModal', () => ({ default: () => null }));
vi.mock('@generated/sales-quotation/custom/RejectQuotationModal', () => ({ default: () => null }));

vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => vi.fn() }));

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), dismiss: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

let copyLinkCalls = [];
vi.mock('@/components/contract-ui/CopyLinkButton', () => ({
  default: (props) => {
    copyLinkCalls.push(props);
    return <div data-testid="copy-link-button" />;
  },
}));

let bulkDocumentActionCalls = [];
// The named exports come from the shared helper (it documents why a mock must expose the
// module's FULL export surface — omitting one makes the whole spec file fail to load).
// `buildInOutActions` is then swapped back to the REAL implementation: the RE guard below has
// to evaluate the ACTUAL builder, not a stub that answers `[]` for every input — a stub would
// make "no RE is ever offered" pass vacuously, which is precisely the wrong kind of green.
vi.mock('@/components/contract-ui/BulkDocumentAction', async () => {
  const actual = await vi.importActual('@/components/contract-ui/BulkDocumentAction');
  const { bulkDocumentActionNamedExports } = await import('@/test/bulkDocumentActionMock.js');
  return {
    ...bulkDocumentActionNamedExports({ buildInOutActions: actual.buildInOutActions }),
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

// ListView invokes the `bulkActions` slot as a PLAIN FUNCTION CALL inside its own render body
// (`bulkActions({ selectedRows, clearSelection, token, apiBaseUrl, windowName, api, refresh })`,
// ListView.jsx), never as JSX. The mock below mirrors that call shape as closely as a stub can
// while still rendering the result, and the last test in this file exercises the plain-function
// form directly (see ETP-5209 — a hook added to this wrapper crashes only in that form).
const SLOT_PROPS = {
  selectedRows: [{ id: 'q-dr', documentNo: '1000001', documentStatus: 'DR' }],
  clearSelection: () => {},
  token: 'tkn',
  apiBaseUrl: '/sws/neo/sales-quotation',
  windowName: 'sales-quotation',
  api: { get: () => {} },
  refresh: () => {},
};

let lastGeneratedAppProps;
vi.mock('@generated/sales-quotation/generated/web/sales-quotation/index.jsx', () => ({
  default: (props) => {
    lastGeneratedAppProps = props;
    return (
      <div data-testid="generated-app">
        {props.bulkActions ? <props.bulkActions {...SLOT_PROPS} /> : null}
      </div>
    );
  },
}));

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';
import { resolveUI } from '@/i18n';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import SalesQuotationWindow from '../index.jsx';

const renderWindow = () => render(
  <SalesQuotationWindow windowName="sales-quotation" apiBaseUrl="/sws/neo/sales-quotation" token="tkn" />,
);

/** Deduped by labelKey, so assertions do not depend on how many times React re-rendered. */
const callFor = (labelKey) => bulkDocumentActionCalls.find((p) => p.labelKey === labelKey);

describe('SalesQuotationWindow — bulk actions (ETP-5378 SEL-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastGeneratedAppProps = null;
    bulkDocumentActionCalls = [];
    copyLinkCalls = [];
  });

  // ── The regression itself ───────────────────────────────────────────────────
  describe('the selection bar mounts a document action at all', () => {
    it('mounts exactly ONE BulkDocumentAction, under the "process" label', () => {
      renderWindow();

      // THE regression: before the fix this element did not exist, because
      // SalesQuotationBulkActions rendered only <CopyLinkButton>.
      expect(screen.getByTestId('bulk-document-action-process')).toBeInTheDocument();

      const labelKeys = bulkDocumentActionCalls.map((p) => p.labelKey);
      expect(labelKeys.filter((k, i) => labelKeys.indexOf(k) === i)).toEqual(['process']);
      expect(callFor('process').labelKey).toBe('process');
    });

    it('targets the quotation entity, not the generic header default', () => {
      renderWindow();

      // `entity` decides the path segment of POST /{entity}/{id}/action/documentAction
      // (useDocumentAction.js). The component defaults to 'header'; leaving the default in
      // place would POST to a path this spec does not expose.
      expect(callFor('process').entity).toBe('quotation');
      expect(screen.getByTestId('bulk-document-action-process')).toHaveAttribute('data-entity', 'quotation');
    });

    it('stays on the documentAction path — a quotation CO is a DocAction, not a NEO action', () => {
      renderWindow();

      // Design point 2: Quotation and Order are both C_Order rows resolving DocAction to the
      // same classic process 104, so this is Pedido's call with a different entity segment —
      // NOT the `neoAction` path the post/unpost buttons of other windows take.
      expect(callFor('process').actionMode).toBeUndefined();
      expect(screen.getByTestId('bulk-document-action-process'))
        .toHaveAttribute('data-action-mode', 'documentAction');
    });

    it('forwards the whole ListView slot payload through the props spread', () => {
      renderWindow();

      // `SalesQuotationBulkActions` spreads `{...props}` into the component. Rewriting that as
      // an explicit prop list is the easy way to silently drop `refresh` (in-place list
      // refetch, ETP-5302) or `clearSelection` (the pill never closes after a run).
      expect(callFor('process')).toMatchObject({
        selectedRows: SLOT_PROPS.selectedRows,
        clearSelection: SLOT_PROPS.clearSelection,
        token: 'tkn',
        apiBaseUrl: '/sws/neo/sales-quotation',
        windowName: 'sales-quotation',
        refresh: SLOT_PROPS.refresh,
      });
    });

    it('never opts into preUnpostActions — a quotation has no accounting to reverse', () => {
      renderWindow();

      for (const call of bulkDocumentActionCalls) {
        expect(call.preUnpostActions).toBeUndefined();
      }
    });
  });

  // ── Design point 1: buildInOutActions, explicitly ───────────────────────────
  describe('the action list comes from the SHARED buildInOutActions, never the built-in default', () => {
    it('passes the shared helper by reference', () => {
      renderWindow();

      // By REFERENCE, not by name: a locally re-declared const of the same name is exactly how
      // two implementations of one rule drift apart, and a source-reading regex cannot tell
      // them apart.
      expect(callFor('process').buildActions).toBe(buildInOutActions);
      expect(typeof callFor('process').buildActions).toBe('function');
    });

    it('offers CO for a Borrador row', () => {
      renderWindow();

      const rows = [{ id: 'q-dr', documentStatus: 'DR' }];
      expect(callFor('process').buildActions(rows)).toEqual([{ value: 'CO', labelKey: 'confirm' }]);
    });

    // The guard. `BulkDocumentAction`'s own built-in fallback (no `buildActions` prop) ALSO
    // emits `{ value: 'RE', labelKey: 'reactivate' }` for a completed row. Reactivating a
    // quotation is a separate flow with its own modal; it must never be reachable from the
    // selection bar. Driven through the REAL builder — see the module mock's importActual.
    it('never offers RE (Reactivar) for a completed quotation', () => {
      renderWindow();

      const completed = [{ id: 'q-co', documentStatus: 'CO', processed: 'Y' }];
      const actions = callFor('process').buildActions(completed);

      expect(actions.map((a) => a.value)).not.toContain('RE');
      expect(actions.map((a) => a.labelKey)).not.toContain('reactivate');
      // A completed-only selection yields nothing at all, so the bar shows no Procesar button.
      expect(actions).toEqual([]);
    });

    it('never offers RE even in a mixed Borrador + Completado selection', () => {
      renderWindow();

      const mixed = [
        { id: 'q-dr', documentStatus: 'DR' },
        { id: 'q-cl', documentStatus: 'CL', processed: 'Y' },
      ];
      const actions = callFor('process').buildActions(mixed);

      expect(actions).toEqual([{ value: 'CO', labelKey: 'confirm' }]);
      expect(actions.map((a) => a.value)).not.toContain('RE');
    });
  });

  // ── quotationBulkRowFilter (module-private, exercised through the prop) ──────
  //
  // Without it, a mixed selection (one Borrador + one Cerrado) would run CO against BOTH,
  // because `buildInOutActions` fires on ANY draft present — a union behaviour QA flagged as a
  // minor observation on the return windows.
  //
  // The `ui` here is the REAL resolver against the REAL locale dictionaries, not `(k) => k`:
  // `resolveUI` falls back to the key when it is missing, so a `(k) => k` stub would keep
  // passing after someone deleted `genericLabels.bulkRowNotDraft` and the user would see the
  // raw key in the toast.
  describe('quotationBulkRowFilter', () => {
    const uiFor = (dictionary) => (key) => resolveUI(dictionary, key);
    const filter = () => callFor('process').rowFilter;

    it('is wired as the rowFilter prop', () => {
      renderWindow();
      expect(typeof filter()).toBe('function');
    });

    it('admits a Borrador row for CO', () => {
      renderWindow();
      expect(filter()({ id: 'q-dr', documentStatus: 'DR' }, 'CO', uiFor(esES))).toBe(true);
    });

    it('accepts the legacy docStatus key as well as documentStatus', () => {
      renderWindow();
      // NEO answers `documentStatus`; some list payloads/preview rows still carry `docStatus`.
      // Reading only one of the two would block every row coming from the other shape.
      expect(filter()({ id: 'q-dr', docStatus: 'DR' }, 'CO', uiFor(esES))).toBe(true);
    });

    for (const documentStatus of ['CL', 'UE']) {
      it(`blocks a ${documentStatus} row for CO with the bulkRowNotDraft message`, () => {
        renderWindow();

        const message = filter()({ id: `q-${documentStatus}`, documentStatus }, 'CO', uiFor(esES));
        expect(message).toBe(esES.genericLabels.bulkRowNotDraft);
        // Not the raw key: proves the label actually resolved.
        expect(message).not.toBe('bulkRowNotDraft');
        expect(message).toBeTruthy();
      });
    }

    it('resolves the same block message in en_US', () => {
      renderWindow();

      const message = filter()({ id: 'q-cl', documentStatus: 'CL' }, 'CO', uiFor(enUS));
      expect(message).toBe(enUS.genericLabels.bulkRowNotDraft);
      expect(message).not.toBe('bulkRowNotDraft');
    });

    it('blocks a row with no status at all for CO', () => {
      renderWindow();
      expect(filter()({ id: 'q-none' }, 'CO', uiFor(esES))).toBe(esES.genericLabels.bulkRowNotDraft);
    });

    it('admits every row for an action other than CO', () => {
      renderWindow();

      // The gate is scoped to CO on purpose: it must not become a blanket "only drafts" rule
      // that would silently veto any action added to this bar later.
      for (const action of ['RE', 'post', 'unpost', 'VO']) {
        expect(filter()({ id: 'q-cl', documentStatus: 'CL' }, action, uiFor(esES))).toBe(true);
        expect(filter()({ id: 'q-dr', documentStatus: 'DR' }, action, uiFor(esES))).toBe(true);
      }
    });
  });

  // ── CopyLinkButton must survive the signature change ────────────────────────
  //
  // `SalesQuotationBulkActions` went from `({ selectedRows, windowName })` to `(props)` so the
  // whole payload could be spread into BulkDocumentAction. CopyLinkButton still reads its two
  // props by name off `props` — a real regression risk, and one that renders perfectly (the
  // button appears, the copied link is just wrong or absent).
  describe('CopyLinkButton', () => {
    it('still renders beside the document action', () => {
      renderWindow();
      expect(screen.getByTestId('copy-link-button')).toBeInTheDocument();
    });

    it('still receives selectedRows and windowName', () => {
      renderWindow();

      expect(copyLinkCalls[copyLinkCalls.length - 1]).toMatchObject({
        selectedRows: SLOT_PROPS.selectedRows,
        windowName: 'sales-quotation',
      });
    });
  });

  // ── ETP-5209 regression shape, guarded here too ─────────────────────────────
  // ListView invokes `bulkActions` as a plain function call inside its own render body, never
  // as JSX. Calling the captured reference directly — outside any React render pass —
  // reproduces the hook-dispatcher-less context production hits, so a stray hook added to this
  // wrapper fails here instead of crashing the first time a user ticks a checkbox.
  it('the bulkActions wrapper is callable as a plain function (no hooks inside)', () => {
    renderWindow();

    expect(() => lastGeneratedAppProps.bulkActions(SLOT_PROPS)).not.toThrow();
  });
});
