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

let lastPageProps;
function PageComponent(props) {
  lastPageProps = props;
  return <div data-testid="page-component" data-record-id={props.recordId || ''} />;
}

describe('ReturnWindowShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowDeleteConfig = null;
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
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-auth', 'Bearer tkn');
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-header-entity', 'returnToVendor');
    expect(screen.getByTestId('clone-modal')).toHaveAttribute('data-route-prefix', '/return-to-vendor/');

    fireEvent.click(screen.getByText('cloned'));
    expect(lastPageProps.refreshTrigger).toBe(2);
    fireEvent.click(screen.getByText('close clone'));
    expect(screen.queryByTestId('clone-modal')).not.toBeInTheDocument();
  });
});
