// Coverage-recovery suite (ETP-4346 batch 2): a genuine render smoke test for
// the purchase-invoice custom window wrapper. The existing index.test.js is a
// source-reading suite (regex-only, per this project's convention for thin
// wrappers) that never imports/renders the module, so V8/Istanbul instrumentation
// never touches these lines and the file shows 0% coverage. This suite renders
// the real component (mocking its heavy dependencies) so the wiring — list vs.
// detail routing, row quick actions, clone modal portal, delete dialog, preview
// render prop — gets exercised and covered for real.

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node) => <div data-testid="portal">{node}</div>,
  };
});

const navigate = vi.fn();
let searchParams = new URLSearchParams();
let locationState = {};

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: '/purchase-invoice', state: locationState }),
  useSearchParams: () => [searchParams],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: vi.fn(),
}));

// ETP-4520 — index.jsx now checks useWindowAccess() before either branch renders.
// ETP-4888 — index.jsx now also reads selectedOrg from useAuth() (via
// useTaxSifLineRowActions -> useFiscalConfig) to resolve the org's fiscal
// profile for the tax-SIF line trigger. See @/test/mockOrderWindowAuth.jsx for
// why both mocks are needed together; mirrors the convention already used by
// sales-invoice/__tests__/index.vitest.jsx and PurchaseInvoiceHeaderTable.vitest.jsx
// / PurchaseInvoiceTopbar.vitest.jsx for the same pair.
let currentWindowAccessTier = 'full';
vi.mock('@/auth/AuthContext.jsx', () => createAuthContextMock(() => currentWindowAccessTier));

let fiscalProfile = null;
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => createFiscalConfigMock(() => fiscalProfile));

let rowDeleteConfig;
const requestDeleteSpy = vi.fn();
vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: vi.fn((config) => {
    rowDeleteConfig = config;
    return {
      requestDelete: requestDeleteSpy,
      deleteDialog: <div data-testid="delete-dialog" />,
    };
  }),
}));

vi.mock('@/components/contract-ui/CreateContactContext.js', () => ({
  CreateContactContext: {
    Provider: ({ children }) => <div data-testid="contact-provider">{children}</div>,
  },
}));

vi.mock('@/components/contract-ui/useCreateContactModal.jsx', () => ({
  useCreateContactModal: vi.fn(() => ({
    headers: { Authorization: 'Bearer tkn' },
    createContactCtxValue: { open: vi.fn() },
    contactPortal: <div data-testid="contact-portal" />,
  })),
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: ({ records, apiBaseUrl, headers, routePrefix, errorKey, processingKey, onClose, onCloned }) => (
    <div
      data-testid="clone-modal"
      data-record-count={records.length}
      data-api-base-url={apiBaseUrl}
      data-route-prefix={routePrefix}
      data-error-key={errorKey}
      data-processing-key={processingKey}
    >
      <button type="button" onClick={onClose}>close clone</button>
      <button type="button" onClick={onCloned}>cloned</button>
    </div>
  ),
}));

vi.mock('@/components/contract-ui/ListView.jsx', () => ({
  ListView: (props) => {
    lastListViewProps = props;
    return (
      <div data-testid="list-view">
        {props.Table ? <props.Table marker="table-prop" /> : null}
        {props.bulkActions ? <props.bulkActions selectedRows={[{ id: 'inv-1' }]} /> : null}
        {props.renderPreview ? props.renderPreview({ row: { id: 'preview-1' }, onClose: vi.fn(), onEdit: vi.fn() }) : null}
      </div>
    );
  },
}));

vi.mock('@/components/contract-ui/BulkDocumentAction', () => ({
  default: ({ labelKey }) => (
    <div data-testid="bulk-document-action" data-label-key={labelKey} />
  ),
}));

vi.mock('../PurchaseInvoiceHeaderTable.jsx', () => ({
  default: (props) => <div {...props} data-testid="purchase-invoice-header-table" />,
}));

vi.mock('../../shared/InvoicePreview.jsx', () => ({
  default: ({ invoice, specName, windowName, onInvoiceUpdated }) => (
    <div data-testid="invoice-preview" data-invoice-id={invoice.id} data-spec-name={specName} data-window-name={windowName}>
      <button type="button" onClick={onInvoiceUpdated}>invoice updated</button>
    </div>
  ),
}));

vi.mock('../PurchaseInvoiceTopbar.jsx', () => ({
  default: () => <div data-testid="purchase-invoice-topbar" />,
}));

vi.mock('../../shared/OcrSidePanel.jsx', () => ({
  default: () => <div data-testid="ocr-side-panel" />,
}));

vi.mock('../../shared/useInvoiceWindow.js', async () => {
  const actual = await vi.importActual('../../shared/useInvoiceWindow.js');
  return actual;
});

let lastHeaderPageProps;
vi.mock('@generated/purchase-invoice/generated/web/purchase-invoice/HeaderPage', () => ({
  default: (props) => {
    lastHeaderPageProps = props;
    return <div data-testid="header-page" data-record-id={props.recordId || ''} />;
  },
}));

let lastListViewProps;

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthContextMock, createFiscalConfigMock } from '@/test/mockOrderWindowAuth.jsx';
import PurchaseInvoiceWindow from '../index.jsx';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('PurchaseInvoiceWindow — render smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    locationState = {};
    lastListViewProps = null;
    lastHeaderPageProps = null;
    rowDeleteConfig = null;
    currentWindowAccessTier = 'full';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ETP-4520 — the hand-rolled ListView below only picks up the runtime
  // per-tier access restriction if this wrapper passes it through; verifies
  // the effectiveWindow wiring added alongside the WindowAccessGuard check.
  it('passes a read-only effectiveWindow to ListView when the access tier is read-only', () => {
    currentWindowAccessTier = 'read-only';
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.window).toMatchObject({ readOnly: true });
  });

  it('renders the WindowAccessGuard instead of ListView when the access tier is none', () => {
    currentWindowAccessTier = 'none';
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('window-access-guard')).toBeInTheDocument();
    expect(screen.queryByTestId('list-view')).not.toBeInTheDocument();
  });

  it('renders the list view (ListView) when no recordId is present', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('list-view')).toBeInTheDocument();
    expect(screen.getByTestId('purchase-invoice-header-table')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-preview')).toHaveAttribute('data-spec-name', 'purchase-invoice');
    expect(screen.getByTestId('delete-dialog')).toBeInTheDocument();
    expect(rowDeleteConfig).toMatchObject({ apiBaseUrl: '/api', entity: 'header', token: 'tkn' });
  });

  it('renders HeaderPage (detail view) when a recordId is present', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" recordId="inv-1" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('header-page')).toHaveAttribute('data-record-id', 'inv-1');
    expect(screen.getByTestId('contact-provider')).toBeInTheDocument();
    expect(screen.getByTestId('contact-portal')).toBeInTheDocument();
    expect(lastHeaderPageProps).toMatchObject({
      notesField: 'description',
      breadcrumb: 'Purchases / Purchase Invoice',
      onAfterSave: true,
      refetchAfterSave: true,
    });
    expect(lastHeaderPageProps.draftMode).toMatchObject({ enabled: true, processValue: 'CO' });
    expect(lastHeaderPageProps.summary.map((s) => s.key)).toEqual([
      'summedLineAmount', 'grandTotalAmount', 'totalPaid', 'outstandingAmount',
    ]);
  });

  it('applies the DOC_TYPE_LABELS transformRecord for AP Invoice → Factura', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" recordId="inv-1" apiBaseUrl="/api" token="tkn" />);

    const record = { id: 'inv-1', 'transactionDocument$_identifier': 'AP Invoice' };
    expect(lastHeaderPageProps.transformRecord(record)).toMatchObject({
      'transactionDocument$_identifier': 'Factura',
    });
    // Unknown doc types pass through unchanged
    expect(lastHeaderPageProps.transformRecord({ id: 'x' })).toEqual({ id: 'x' });
  });

  it('navigates to the edit route when a row quick action edit is triggered', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    lastListViewProps.rowQuickActions.onEdit({ id: 'inv-9' });
    expect(navigate).toHaveBeenCalledWith('/purchase-invoice/inv-9');
  });

  it('does not show the email quick action (purchase invoices have showEmail: false)', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.rowQuickActions.actions.email.show).toBe(false);
    expect(lastListViewProps.rowQuickActions.onEmail).toBeUndefined();
  });

  it('opens the clone modal via onCloneRow and refreshes the list on cloned', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    act(() => {
      lastListViewProps.onCloneRow([{ id: 'inv-2' }, { id: 'inv-3' }]);
    });

    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-record-count', '2');
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-route-prefix', '/purchase-invoice/');

    const beforeRefresh = lastListViewProps.refreshTrigger;
    fireEvent.click(screen.getByText('cloned'));
    expect(lastListViewProps.refreshTrigger).toBe(beforeRefresh + 1);
  });

  it('closes the clone modal portal on close', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    act(() => {
      lastListViewProps.onCloneRow({ id: 'inv-5' });
    });
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-record-count', '1');

    fireEvent.click(screen.getByText('close clone'));
    expect(screen.queryByTestId('clone-modal')).not.toBeInTheDocument();
  });

  // ETP-5012: "overdue" must mean due date < today — not just "Completed
  // with an outstanding balance", which used to wrongly include invoices
  // whose due date hasn't arrived yet.
  it('sets initialAdvancedFilter and initialColumns for the overdue filter param', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
    searchParams = new URLSearchParams('filter=overdue');
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter).toMatchObject({
      rowOperator: 'and',
      conditions: [
        { field: 'documentStatus', operator: 'equals', value: 'CO' },
        { field: 'outstandingAmount', operator: 'greaterThan', value: 0 },
        { field: 'eTGODueDate', operator: 'lessThan', value: '2026-08-25' },
      ],
    });
    expect(lastListViewProps.initialAdvancedFilter.conditions).toHaveLength(3);
    expect(lastListViewProps.initialColumns).not.toBeNull();
  });

  // ETP-5012: guards the local-calendar-day helper against the UTC bug of
  // `new Date().toISOString().slice(0, 10)` — late evening in a negative-UTC
  // timezone would otherwise resolve "today" to the day before.
  it('resolves "today" as a local calendar day, not the UTC day', () => {
    vi.useFakeTimers();
    // 2026-08-25 23:30 in UTC-3 is already 2026-08-26 in UTC.
    vi.setSystemTime(new Date(2026, 7, 25, 23, 30, 0));
    searchParams = new URLSearchParams('filter=overdue');
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter.conditions[2]).toMatchObject({
      field: 'eTGODueDate',
      operator: 'lessThan',
      value: '2026-08-25',
    });
  });

  // ETP-5012: the dashboard totals card shows the TOTAL pending balance
  // (any due date), so it needs its own filter distinct from "overdue".
  it('sets initialAdvancedFilter without a date condition for the pending filter param', () => {
    searchParams = new URLSearchParams('filter=pending');
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter).toMatchObject({
      rowOperator: 'and',
      conditions: [
        { field: 'documentStatus', operator: 'equals', value: 'CO' },
        { field: 'outstandingAmount', operator: 'greaterThan', value: 0 },
      ],
    });
    expect(lastListViewProps.initialAdvancedFilter.conditions).toHaveLength(2);
    expect(lastListViewProps.initialColumns).not.toBeNull();
  });

  it('adds an eTGODueDate=today condition for the paymentsDueToday filter param', () => {
    searchParams = new URLSearchParams('filter=paymentsDueToday');
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter.conditions).toHaveLength(3);
    expect(lastListViewProps.initialAdvancedFilter.conditions[2].field).toBe('eTGODueDate');
  });

  // ETP-5017: the dashboard "Payments" card now covers "due date <= today"
  // (overdue and due-today combined), not just an exact match on today. Since
  // date-mode filters have no `lessOrEqual` operator, this is expressed as
  // `lessThan` tomorrow.
  it('sets initialAdvancedFilter and initialColumns for the paymentsDue filter param', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 25, 12, 0, 0));
    searchParams = new URLSearchParams('filter=paymentsDue');
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter).toMatchObject({
      rowOperator: 'and',
      conditions: [
        { field: 'documentStatus', operator: 'equals', value: 'CO' },
        { field: 'outstandingAmount', operator: 'greaterThan', value: 0 },
        { field: 'eTGODueDate', operator: 'lessThan', value: '2026-08-26' },
      ],
    });
    expect(lastListViewProps.initialAdvancedFilter.conditions).toHaveLength(3);
    expect(lastListViewProps.initialColumns).not.toBeNull();
  });

  // ETP-5017 regression guard: guards the local-calendar-day helper against the
  // UTC bug of `new Date().toISOString().slice(0, 10)` — late evening in a
  // negative-UTC timezone would otherwise resolve "tomorrow" to the wrong day.
  it('resolves "tomorrow" as a local calendar day for the paymentsDue filter, not the UTC day', () => {
    vi.useFakeTimers();
    // 2026-08-25 23:30 local is already 2026-08-26 in UTC; the local calendar
    // "tomorrow" must still be the 26th, not the 27th.
    vi.setSystemTime(new Date(2026, 7, 25, 23, 30, 0));
    searchParams = new URLSearchParams('filter=paymentsDue');
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter.conditions[2]).toMatchObject({
      field: 'eTGODueDate',
      operator: 'lessThan',
      value: '2026-08-26',
    });
  });

  it('passes DocStatus from the URL into initialColumnFilters', () => {
    searchParams = new URLSearchParams('DocStatus=CO');
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialColumnFilters).toEqual({ documentStatus: 'CO' });
  });

  it('leaves initialAdvancedFilter/initialColumnFilters null-ish without filter params', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter).toBeNull();
    expect(lastListViewProps.initialColumnFilters).toBeUndefined();
    expect(lastListViewProps.initialColumns).toBeNull();
  });

  it('passes LABEL_OVERRIDES and subsetFilters through to ListView', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.labelOverrides.en_US.POReference).toBe('Document No.');
    expect(lastListViewProps.subsetFilters.map((f) => f.label)).toEqual(['allTab', 'invoicesTab', 'rectificativeInvoicesTab']);
  });

  // ETP-4737: the invoicesTab/rectificativeInvoicesTab tabs are server-side `filter` criteria
  // (not client-side rowFilter) mirrored 1:1 from decisions.json's
  // window.subsetFilters, discriminating on etsgIsRectificative/documentCategory
  // rather than the raw doc-type identifier string — so any doc type sharing the
  // same AD category (including "Factura Rectificativa (compras)") lands in the
  // right tab without a name-string edit here.
  it('mirrors decisions.json subsetFilters criteria exactly for invoicesTab/rectificativeInvoicesTab', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    const [allTab, invoicesTab, rectificativeInvoicesTab] = lastListViewProps.subsetFilters;
    expect(allTab.filter).toBeUndefined();
    expect(allTab.rowFilter).toBeUndefined();

    const decisions = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', '..', 'artifacts', 'purchase-invoice', 'decisions.json'), 'utf8'),
    );
    const byLabel = Object.fromEntries(decisions.window.subsetFilters.map((f) => [f.label, f.filter]));

    expect(invoicesTab.filter).toBe(byLabel.invoicesTab);
    expect(rectificativeInvoicesTab.filter).toBe(byLabel.rectificativeInvoicesTab);

    // Sanity-decode: invoicesTab = API AND NOT rectificative; rectificativeInvoicesTab = rectificative OR APC.
    const invoicesCriteria = JSON.parse(decodeURIComponent(invoicesTab.filter.replace('criteria=', '')));
    expect(invoicesCriteria).toEqual([
      { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'API' },
      { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'notEqual', value: true },
    ]);
    const rectificativeInvoicesCriteria = JSON.parse(decodeURIComponent(rectificativeInvoicesTab.filter.replace('criteria=', '')));
    expect(rectificativeInvoicesCriteria).toEqual([{
      _constructor: 'AdvancedCriteria',
      operator: 'or',
      criteria: [
        { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'equals', value: true },
        { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'APC' },
      ],
    }]);
  });

  it('bumps refreshKey when useRowDelete reports a successful delete', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    const beforeRefresh = lastListViewProps.refreshTrigger;
    act(() => {
      rowDeleteConfig.onSuccess();
    });
    expect(lastListViewProps.refreshTrigger).toBe(beforeRefresh + 1);
  });

  // ETP-4832: the grid was not refreshing after confirming a payment from the
  // side panel. Mirrors the equivalent sales-invoice/index.jsx wiring — the
  // InvoicePreview render prop must forward onInvoiceUpdated into a refreshKey
  // bump so ListView's refreshTrigger increments and the grid refetches.
  it('refreshes the list when the invoice preview reports an update', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    const beforeRefresh = lastListViewProps.refreshTrigger;
    fireEvent.click(screen.getByText('invoice updated'));
    expect(lastListViewProps.refreshTrigger).toBe(beforeRefresh + 1);
  });

  it('renders the external preview row passed via navigation state and clears it on close', () => {
    locationState = { savedRecord: { id: 'saved-1' } };
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.externalPreviewRow).toEqual({ id: 'saved-1' });

    act(() => {
      lastListViewProps.onExternalPreviewClose();
    });
    expect(navigate).toHaveBeenCalledWith('/purchase-invoice', { replace: true, state: {} });
  });

  it('disables sendDocument email for purchase invoices', () => {
    render(<PurchaseInvoiceWindow windowName="purchase-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.sendDocument).toEqual({ enabled: false, allowEmail: false });
  });
});
