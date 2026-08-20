// Coverage-recovery suite (ETP-4692): the existing index.test.js /
// PurchaseOrderNoLegacyFilter.test.js suites are source-reading (regex-only,
// per this project's convention for thin wrappers) and never import/render
// the module, so V8/Istanbul instrumentation never touches the ETP-4520
// useWindowAccess wiring (windowAccessTier read-only/none branches +
// effectiveWindow useMemo). This suite renders the real component (mocking
// its heavy dependencies, incl. useOrderWindow — already covered by its own
// useOrderWindow.vitest.jsx) so that wiring gets exercised and covered for
// real, mirroring purchase-invoice/sales-invoice's index.vitest.jsx pattern.

vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node) => <div data-testid="portal">{node}</div>,
  };
});

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
}));

// ETP-4520 — index.jsx now checks useWindowAccess() before either branch renders.
// ETP-4888 — index.jsx also wires useTaxSifLineRowActions(), which reads selectedOrg
// from useAuth(). Mirrors the convention in sales-invoice/purchase-invoice's own
// index.vitest.jsx for the same @/auth/AuthContext.jsx mock.
let currentWindowAccessTier = 'full';
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' }, logout: vi.fn() }),
  useWindowAccess: () => currentWindowAccessTier,
  WindowAccessGuard: (props) => <div data-testid="window-access-guard" data-window-id={props.windowId} />,
}));

// useTaxSifLineRowActions() also calls useFiscalConfig(), whose own useApiFetch()
// resolves to the package-internal AuthContext (a different module instance than the
// '@/auth/AuthContext.jsx' alias above), so mocking useAuth alone isn't enough — it
// still throws "useAuth must be used within AuthProvider". Mocking useFiscalConfig.js
// itself sidesteps that mismatch entirely, same as sales-invoice/purchase-invoice's
// own index.vitest.jsx does for the same pair.
let fiscalProfile = null;
vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({ profile: fiscalProfile })),
}));

let lastUseOrderWindowArgs;
vi.mock('../../shared/useOrderWindow.jsx', () => ({
  useOrderWindow: vi.fn((args) => {
    lastUseOrderWindowArgs = args;
    return {
      refreshKey: 0,
      setRefreshKey: vi.fn(),
      renderPreview: (opts) => <div data-testid="order-preview" data-row-id={opts.row.id} />,
      rowQuickActions: { onEdit: vi.fn(), enabled: true },
      effectiveRecord: null,
      clearSavedRecord: vi.fn(),
      deleteDialog: <div data-testid="delete-dialog" />,
      confirmPortal: null,
      confirmResultPortal: null,
      manageLauncher: null,
      emailModalPortal: null,
    };
  }),
}));

vi.mock('../../shared/usePurchaseOrderPdf.js', () => ({
  usePurchaseOrderPdf: vi.fn(),
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
  default: () => <div data-testid="clone-modal" />,
}));

vi.mock('@/components/contract-ui/LinesEmptyState.jsx', () => ({
  default: () => <div data-testid="lines-empty-state" />,
}));

let lastListViewProps;
vi.mock('@/components/contract-ui/ListView.jsx', () => ({
  ListView: (props) => {
    lastListViewProps = props;
    return <div data-testid="list-view" />;
  },
}));

vi.mock('@/components/contract-ui/BulkDocumentAction', () => ({
  default: () => <div data-testid="bulk-document-action" />,
  buildInOutActions: vi.fn(),
}));

vi.mock('@generated/purchase-order/custom/BulkPurchaseOrderMoreMenu', () => ({
  default: () => <div data-testid="bulk-more-menu" />,
}));

vi.mock('@generated/purchase-order/custom/PurchaseOrderActions', () => ({
  ConfirmModal: () => <div data-testid="confirm-modal" />,
  PoConfirmResultModal: () => <div data-testid="confirm-result-modal" />,
  ManageDocsLauncher: () => <div data-testid="manage-docs-launcher" />,
}));

vi.mock('@generated/purchase-order/generated/web/purchase-order/HeaderTable', () => ({
  default: (props) => <div {...props} data-testid="header-table" />,
}));

let lastGeneratedAppProps;
vi.mock('@generated/purchase-order/generated/web/purchase-order/index.jsx', () => ({
  default: (props) => {
    lastGeneratedAppProps = props;
    return <div data-testid="generated-app" data-record-id={props.recordId || ''} />;
  },
}));

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PurchaseOrderWindow from '../index.jsx';

describe('PurchaseOrderWindow — render smoke tests (ETP-4520 window-access wiring)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastListViewProps = null;
    lastGeneratedAppProps = null;
    lastUseOrderWindowArgs = null;
    currentWindowAccessTier = 'full';
  });

  it('renders the list view (ListView) when no recordId is present and access is full', () => {
    render(<PurchaseOrderWindow windowName="purchase-order" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('list-view')).toBeInTheDocument();
    expect(lastListViewProps.window).toBeUndefined();
  });

  it('renders GeneratedApp (detail view) when a recordId is present', () => {
    render(<PurchaseOrderWindow windowName="purchase-order" recordId="po-1" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('generated-app')).toHaveAttribute('data-record-id', 'po-1');
    expect(lastGeneratedAppProps.draftMode).toMatchObject({ enabled: true, processValue: 'CO' });
  });

  // ETP-4520 — the hand-rolled ListView below only picks up the runtime
  // per-tier access restriction if this wrapper computes and passes through
  // effectiveWindow; verifies the useMemo wiring added alongside the guard.
  it('passes a read-only effectiveWindow to ListView when the access tier is read-only', () => {
    currentWindowAccessTier = 'read-only';
    render(<PurchaseOrderWindow windowName="purchase-order" apiBaseUrl="/api" token="tkn" window={{ foo: 'bar' }} />);

    expect(lastListViewProps.window).toMatchObject({ foo: 'bar', readOnly: true });
  });

  it('renders the WindowAccessGuard (windowId 181) instead of ListView when the access tier is none', () => {
    currentWindowAccessTier = 'none';
    render(<PurchaseOrderWindow windowName="purchase-order" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('window-access-guard')).toHaveAttribute('data-window-id', '181');
    expect(screen.queryByTestId('list-view')).not.toBeInTheDocument();
  });

  it('renders the WindowAccessGuard instead of GeneratedApp when the access tier is none, even with a recordId', () => {
    currentWindowAccessTier = 'none';
    render(<PurchaseOrderWindow windowName="purchase-order" recordId="po-1" apiBaseUrl="/api" token="tkn" />);

    expect(screen.getByTestId('window-access-guard')).toBeInTheDocument();
    expect(screen.queryByTestId('generated-app')).not.toBeInTheDocument();
  });

  it('passes documentType (translated via useMenuLabel) through to useOrderWindow', () => {
    render(<PurchaseOrderWindow windowName="purchase-order" apiBaseUrl="/api" token="tkn" />);

    expect(lastUseOrderWindowArgs).toMatchObject({ specName: 'purchase-order', documentType: 'Purchase Order' });
  });
});
