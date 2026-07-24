// Coverage-recovery suite (ETP-4346 batch 2): a genuine render smoke test for
// the sales-invoice custom window wrapper. The existing index.test.js is a
// source-reading suite (regex-only, per this project's convention for thin
// wrappers) that never imports/renders the module, so V8/Istanbul instrumentation
// never touches these lines and the file shows 0% coverage. This suite renders
// the real component (mocking its heavy dependencies) so the wiring — list vs.
// detail routing, row quick actions (including email), clone modal portal,
// send-document modal portal, delete dialog, preview render prop — gets
// exercised and covered for real.

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
  useLocation: () => ({ pathname: '/sales-invoice', state: locationState }),
  useSearchParams: () => [searchParams],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: vi.fn(),
}));

// index.jsx reads selectedOrg from useAuth() to resolve the org's fiscal
// profile (Verifactu processing-modal wiring). Mirrors the convention used
// by PurchaseInvoiceHeaderTable.vitest.jsx / PurchaseInvoiceTopbar.vitest.jsx
// for the same @/auth/AuthContext.jsx + useFiscalConfig.js pair.
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn() }),
  useWindowAccess: () => 'full',
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
}));

let fiscalProfile = null;
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({ profile: fiscalProfile })),
}));

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

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: ({ documentType, documentNo, bpName, bPartnerId, documentId, windowName, onClose }) => (
    <div
      data-testid="send-document-modal"
      data-document-type={documentType}
      data-document-no={documentNo}
      data-bp-name={bpName}
      data-bpartner-id={bPartnerId}
      data-document-id={documentId}
      data-window-name={windowName}
    >
      <button type="button" onClick={onClose}>close send</button>
    </div>
  ),
}));

vi.mock('@/components/contract-ui', () => ({
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

vi.mock('@generated/sales-invoice/custom/InvoiceHeaderTable.jsx', () => ({
  default: (props) => <div {...props} data-testid="sales-invoice-header-table" />,
}));

vi.mock('@generated/sales-invoice/custom/InvoiceBottomPanel.jsx', () => ({
  default: () => <div data-testid="invoice-bottom-panel" />,
}));

vi.mock('../../shared/InvoicePreview.jsx', () => ({
  default: ({ invoice, specName, windowName, onInvoiceUpdated }) => (
    <div data-testid="invoice-preview" data-invoice-id={invoice.id} data-spec-name={specName} data-window-name={windowName}>
      <button type="button" onClick={onInvoiceUpdated}>invoice updated</button>
    </div>
  ),
}));

vi.mock('../SalesInvoiceTopbar.jsx', () => ({
  default: () => <div data-testid="sales-invoice-topbar" />,
}));

vi.mock('../../shared/useInvoicePdf.js', () => ({
  useInvoicePdf: vi.fn(() => ({ pdfUrl: 'blob:mock-pdf', loading: false })),
}));

vi.mock('../../shared/useInvoiceWindow.js', async () => {
  const actual = await vi.importActual('../../shared/useInvoiceWindow.js');
  return actual;
});

let lastHeaderPageProps;
vi.mock('@generated/sales-invoice/generated/web/sales-invoice/HeaderPage', () => ({
  default: (props) => {
    lastHeaderPageProps = props;
    const BottomSection = props.bottomSection;
    const TopbarRight = props.topbarRight;
    return (
      <div data-testid="header-page" data-record-id={props.recordId || ''}>
        {BottomSection ? <BottomSection /> : null}
        {TopbarRight ? <TopbarRight /> : null}
      </div>
    );
  },
}));

let lastListViewProps;

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SalesInvoiceWindow from '../index.jsx';

describe('SalesInvoiceWindow — render smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    locationState = {};
    lastListViewProps = null;
    lastHeaderPageProps = null;
    rowDeleteConfig = null;
    fiscalProfile = null;
  });

  it('renders the list view (ListView) when no recordId is present', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('list-view')).toBeInTheDocument();
    expect(screen.getByTestId('sales-invoice-header-table')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-preview')).toHaveAttribute('data-spec-name', 'sales-invoice');
    expect(screen.getByTestId('delete-dialog')).toBeInTheDocument();
    expect(rowDeleteConfig).toMatchObject({ apiBaseUrl: '/api', entity: 'header', token: 'tkn' });
  });

  it('renders HeaderPage (detail view) when a recordId is present', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" recordId="inv-1" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('header-page')).toHaveAttribute('data-record-id', 'inv-1');
    expect(screen.getByTestId('invoice-bottom-panel')).toBeInTheDocument();
    expect(screen.getByTestId('contact-provider')).toBeInTheDocument();
    expect(screen.getByTestId('contact-portal')).toBeInTheDocument();
    expect(lastHeaderPageProps).toMatchObject({
      notesField: 'description',
      breadcrumb: 'Sales / Sales Invoice',
      onAfterSave: true,
      refetchAfterSave: true,
    });
    expect(lastHeaderPageProps.draftMode).toMatchObject({ enabled: true, processValue: 'CO' });
    // No Verifactu profile configured for the org -> no processing modal.
    expect(lastHeaderPageProps.draftMode.processingModal).toBeNull();
  });

  it('enables the Verifactu processing modal on draftMode when the org profile is verifactu', () => {
    fiscalProfile = 'verifactu';
    render(<SalesInvoiceWindow windowName="sales-invoice" recordId="inv-1" apiBaseUrl="/api" token="tkn" />);

    expect(lastHeaderPageProps.draftMode.processingModal).toMatchObject({
      body: 'fiscal.verifactu.processing.body',
    });
  });

  it('navigates to the edit route when a row quick action edit is triggered', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    lastListViewProps.rowQuickActions.onEdit({ id: 'inv-9' });
    expect(navigate).toHaveBeenCalledWith('/sales-invoice/inv-9');
  });

  it('shows the email quick action by default (unlike purchase-invoice) and opens the send modal', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.rowQuickActions.actions.email.show).toBe(true);
    expect(lastListViewProps.rowQuickActions.onEmail).toBeInstanceOf(Function);

    act(() => {
      lastListViewProps.rowQuickActions.onEmail({
        id: 'inv-7', documentNo: 'INV-007', businessPartner: 'bp-1', 'businessPartner$_identifier': 'Acme',
      });
    });

    const modal = screen.getByTestId('send-document-modal');
    expect(modal).toHaveAttribute('data-document-no', 'INV-007');
    expect(modal).toHaveAttribute('data-bp-name', 'Acme');
    expect(modal).toHaveAttribute('data-bpartner-id', 'bp-1');
    expect(modal).toHaveAttribute('data-document-id', 'inv-7');
  });

  it('closes the send-document modal portal on close', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    act(() => {
      lastListViewProps.rowQuickActions.onEmail({ id: 'inv-7', documentNo: 'INV-007' });
    });
    expect(screen.getByTestId('send-document-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close send'));
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
  });

  it('opens the clone modal via onCloneRow and refreshes the list on cloned', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    act(() => {
      lastListViewProps.onCloneRow([{ id: 'inv-2' }, { id: 'inv-3' }]);
    });

    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-record-count', '2');
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-route-prefix', '/sales-invoice/');

    const beforeRefresh = lastListViewProps.refreshTrigger;
    fireEvent.click(screen.getByText('cloned'));
    expect(lastListViewProps.refreshTrigger).toBe(beforeRefresh + 1);
  });

  it('closes the clone modal portal on close', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    act(() => {
      lastListViewProps.onCloneRow({ id: 'inv-5' });
    });
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-record-count', '1');

    fireEvent.click(screen.getByText('close clone'));
    expect(screen.queryByTestId('clone-modal')).not.toBeInTheDocument();
  });

  it('refreshes the list when the invoice preview reports an update', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    const beforeRefresh = lastListViewProps.refreshTrigger;
    fireEvent.click(screen.getByText('invoice updated'));
    expect(lastListViewProps.refreshTrigger).toBe(beforeRefresh + 1);
  });

  it('sets initialAdvancedFilter and initialColumns for the overdue filter param', () => {
    searchParams = new URLSearchParams('filter=overdue');
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter).toMatchObject({
      rowOperator: 'and',
      conditions: [
        { field: 'documentStatus', operator: 'equals', value: 'CO' },
        { field: 'outstandingAmount', operator: 'greaterThan', value: 0 },
      ],
    });
    expect(lastListViewProps.initialColumns).not.toBeNull();
  });

  it('adds an eTGODueDate=today condition for the collectionsDueToday filter param', () => {
    searchParams = new URLSearchParams('filter=collectionsDueToday');
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter.conditions).toHaveLength(3);
    expect(lastListViewProps.initialAdvancedFilter.conditions[2].field).toBe('eTGODueDate');
  });

  it('passes DocStatus from the URL into initialColumnFilters', () => {
    searchParams = new URLSearchParams('DocStatus=CO');
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialColumnFilters).toEqual({ documentStatus: 'CO' });
  });

  it('leaves initialAdvancedFilter/initialColumnFilters null-ish without filter params', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.initialAdvancedFilter).toBeNull();
    expect(lastListViewProps.initialColumnFilters).toBeUndefined();
    expect(lastListViewProps.initialColumns).toBeNull();
  });

  it('passes LABEL_OVERRIDES and subsetFilters through to ListView', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.labelOverrides.en_US.OutstandingAmt).toBe('Pending Payment');
    expect(lastListViewProps.subsetFilters.map((f) => f.label)).toEqual([
      'allTab', 'invoicesTab', 'creditNotesTab', 'returnsTab',
    ]);
  });

  it('bumps refreshKey when useRowDelete reports a successful delete', () => {
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    const beforeRefresh = lastListViewProps.refreshTrigger;
    act(() => {
      rowDeleteConfig.onSuccess();
    });
    expect(lastListViewProps.refreshTrigger).toBe(beforeRefresh + 1);
  });

  it('renders the external preview row passed via navigation state and clears it on close', () => {
    locationState = { savedRecord: { id: 'saved-1' } };
    render(<SalesInvoiceWindow windowName="sales-invoice" apiBaseUrl="/api" token="tkn" />);

    expect(lastListViewProps.externalPreviewRow).toEqual({ id: 'saved-1' });

    act(() => {
      lastListViewProps.onExternalPreviewClose();
    });
    expect(navigate).toHaveBeenCalledWith('/sales-invoice', { replace: true, state: {} });
  });
});
