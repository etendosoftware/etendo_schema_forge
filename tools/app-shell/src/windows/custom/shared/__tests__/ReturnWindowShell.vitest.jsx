vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node) => <div data-testid="portal">{node}</div>,
  };
});

const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

const useBulkActionToast = vi.fn();
vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: () => useBulkActionToast(),
}));

let rowDeleteConfig;
const requestDelete = vi.fn();
vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: vi.fn((config) => {
    rowDeleteConfig = config;
    return {
      requestDelete,
      deleteDialog: <div data-testid="delete-dialog" />,
    };
  }),
}));

let rowEmailModalConfig;
const onRowEmailMock = vi.fn();
vi.mock('../useRowEmailModal.jsx', () => ({
  useRowEmailModal: vi.fn((config) => {
    rowEmailModalConfig = config;
    return {
      onEmail: onRowEmailMock,
      emailModalPortal: <div data-testid="email-modal-portal" />,
    };
  }),
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: ({ records, headers, headerEntity, routePrefix, onClose, onCloned }) => (
    <div
      data-testid="clone-modal"
      data-record-count={records.length}
      data-auth={headers.Authorization}
      data-header-entity={headerEntity}
      data-route-prefix={routePrefix}>
      <button type="button" onClick={onClose}>close clone</button>
      <button type="button" onClick={onCloned}>cloned</button>
    </div>
  ),
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReturnWindowShell from '../ReturnWindowShell.jsx';
import {
  declareBearerSession,
  declareCookieSession,
  TEST_BEARER_TOKEN,
} from '@/test/sessionContract.js';

beforeEach(() => {
  declareBearerSession();
});

let lastPageProps;
function PageComponent(props) {
  lastPageProps = props;
  return <div data-testid="page-component" data-record-id={props.recordId || ''} />;
}

describe('ReturnWindowShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowDeleteConfig = null;
    rowEmailModalConfig = null;
    lastPageProps = null;
  });

  it('renders detail mode with autosave and without list-only row actions', () => {
    render(
      <ReturnWindowShell
        windowName="return-to-vendor"
        recordId="ret-1"
        apiBaseUrl="/api"
        token="tkn"
        PageComponent={PageComponent}
        entity="returnToVendor"
        headerEntity="returnToVendor"
        routePrefix="/return-to-vendor/"
        customProp="kept"
      />,
    );

    // ETP-4857 — the shell must call useBulkActionToast() on mount so the
    // toast left behind by BulkDocumentAction's window.location.reload() is
    // read and shown; without this it silently fails to display.
    expect(useBulkActionToast).toHaveBeenCalled();
    expect(screen.getByTestId('page-component')).toHaveAttribute('data-record-id', 'ret-1');
    expect(lastPageProps).toMatchObject({
      recordId: 'ret-1',
      autoSaveOnBlur: true,
      customProp: 'kept',
    });
    // ETP-4729: hidePrint must no longer be hardcoded — the generic print
    // icon in DetailView.jsx should render for return-* detail views.
    expect(lastPageProps.hidePrint).toBeUndefined();
    expect(lastPageProps.rowQuickActions).toBeUndefined();
  });

  // ETP-4576 — the cookie half of the clone-modal credential. The shell hands the
  // modal one header bag; under the cookie scheme it must carry no Authorization
  // at all, because the `__Host-` cookie is the session.
  it('passes no Authorization to the clone modal under the cookie scheme', () => {
    declareCookieSession();
    render(
      <ReturnWindowShell
        windowName="return-to-vendor"
        apiBaseUrl="/api"
        PageComponent={PageComponent}
        entity="returnToVendor"
        headerEntity="returnToVendor"
        routePrefix="/return-to-vendor/"
      />,
    );

    act(() => {
      lastPageProps.rowQuickActions.onClone({ id: 'ret-9' });
    });
    expect(screen.getByTestId('clone-modal')).not.toHaveAttribute('data-auth');
  });

  it('wires list mode row actions, delete refresh, preview, and clone modal', () => {
    const renderPreview = vi.fn(() => <div data-testid="preview" />);
    const duplicateAction = { show: false };
    render(
      <ReturnWindowShell
        windowName="return-to-vendor"
        apiBaseUrl="/api"
        token="tkn"
        PageComponent={PageComponent}
        renderPreview={renderPreview}
        entity="returnToVendor"
        headerEntity="returnToVendor"
        routePrefix="/return-to-vendor/"
        duplicateAction={duplicateAction}
      />,
    );

    expect(screen.getByTestId('delete-dialog')).toBeInTheDocument();
    expect(rowDeleteConfig).toMatchObject({ apiBaseUrl: '/api', entity: 'returnToVendor', token: 'tkn' });
    expect(lastPageProps.renderPreview).toBe(renderPreview);
    expect(lastPageProps.rowQuickActions.actions.duplicate).toBe(duplicateAction);

    lastPageProps.rowQuickActions.onEdit({ id: 'ret-1' });
    expect(navigate).toHaveBeenCalledWith('/return-to-vendor/ret-1');

    lastPageProps.rowQuickActions.onDelete({ id: 'ret-2' });
    expect(requestDelete).toHaveBeenCalledWith({ id: 'ret-2' });

    act(() => {
      rowDeleteConfig.onSuccess();
    });
    expect(lastPageProps.refreshTrigger).toBe(1);

    act(() => {
      lastPageProps.rowQuickActions.onClone({ id: 'ret-3' });
    });
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-record-count', '1');
    // ETP-4576 — the header bag comes from writeHeaders() now, so the credential
    // is the session's, not the `token` prop's. Under bearer that is still an
    // Authorization header; the cookie case is covered below.
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-auth', `Bearer ${TEST_BEARER_TOKEN}`);
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-header-entity', 'returnToVendor');
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-route-prefix', '/return-to-vendor/');

    fireEvent.click(screen.getByText('cloned'));
    expect(lastPageProps.refreshTrigger).toBe(2);
    fireEvent.click(screen.getByText('close clone'));
    expect(screen.queryByTestId('clone-modal')).not.toBeInTheDocument();
  });

  // ETP-4718 — optional per-window row-hover "Enviar" (send-email) wiring.
  describe('emailAction wiring (ETP-4718)', () => {
    it('wires emailAction into useRowEmailModal, exposes the email row-action, and renders the modal portal', () => {
      const usePdf = vi.fn(() => ({ pdfUrl: null, loading: false }));
      const emailAction = {
        usePdf,
        documentType: 'Return to Vendor Shipment',
        visibleWhen: "@documentStatus@='CO'",
      };

      render(
        <ReturnWindowShell
          windowName="return-to-vendor"
          apiBaseUrl="/api"
          token="tkn"
          PageComponent={PageComponent}
          entity="returnToVendor"
          headerEntity="returnToVendor"
          routePrefix="/return-to-vendor/"
          emailAction={emailAction}
        />,
      );

      expect(rowEmailModalConfig).toMatchObject({
        usePdf,
        apiBaseUrl: '/api',
        token: 'tkn',
        windowName: 'return-to-vendor',
        documentType: 'Return to Vendor Shipment',
      });

      expect(lastPageProps.rowQuickActions.actions.email).toEqual({
        show: true,
        visibleWhen: "@documentStatus@='CO'",
      });
      expect(lastPageProps.rowQuickActions.onEmail).toBe(onRowEmailMock);
      expect(screen.getByTestId('email-modal-portal')).toBeInTheDocument();
    });

    it('without emailAction, leaves the email row-action absent and onEmail undefined (return-material-receipt baseline unchanged)', () => {
      render(
        <ReturnWindowShell
          windowName="return-to-vendor"
          apiBaseUrl="/api"
          token="tkn"
          PageComponent={PageComponent}
          entity="returnToVendor"
          headerEntity="returnToVendor"
          routePrefix="/return-to-vendor/"
        />,
      );

      expect(rowEmailModalConfig).toMatchObject({
        usePdf: undefined,
        documentType: undefined,
      });
      expect(lastPageProps.rowQuickActions.actions.email).toEqual({
        show: false,
        visibleWhen: undefined,
      });
      expect(lastPageProps.rowQuickActions.onEmail).toBeUndefined();
    });
  });
});
