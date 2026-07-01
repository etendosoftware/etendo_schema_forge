// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import ImportReturnLinesModal from '../ImportReturnLinesModal.jsx';

const DOCS = [
  {
    id: 'DOC-1',
    documentNo: 'SHIP-001',
    movementDate: '2024-01-15',
    'businessPartner$_identifier': 'Acme Corp',
  },
  {
    id: 'DOC-2',
    documentNo: 'SHIP-002',
    movementDate: '2024-02-20',
    'businessPartner$_identifier': 'Acme Corp',
  },
];

const LINES = [
  { id: 'LINE-1', 'product$_identifier': 'Widget A', movementQuantity: '5' },
  { id: 'LINE-2', 'product$_identifier': 'Widget B', movementQuantity: '3' },
];

function makeConfig(overrides = {}) {
  return {
    fetchSourceDocs: vi.fn().mockResolvedValue(DOCS),
    fetchSourceLines: vi.fn().mockResolvedValue(LINES),
    importActionUrl: (base, id) => `${base}/action/import/${id}`,
    titleKey: 'importFromShipment',
    searchPlaceholderKey: 'searchShipment',
    noDocsKey: 'noCompletedShipmentsForThisCustomer',
    noDocsMatchSearchKey: 'noShipmentsMatchYourSearch',
    successToastKey: 'linesImportedFromShipment',
    dateField: 'movementDate',
    showAmount: false,
    qtyStep: 1,
    ...overrides,
  };
}

const BASE_PROPS = {
  targetId: 'REC-001',
  bpId: 'BP-001',
  base: '/sws/neo',
  headers: { Authorization: 'Bearer test' },
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

describe('ImportReturnLinesModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the modal title from config.titleKey', async () => {
    const config = makeConfig();
    render(<ImportReturnLinesModal {...BASE_PROPS} config={config} />);
    await waitFor(() => expect(config.fetchSourceDocs).toHaveBeenCalled());
    expect(screen.getByText('importFromShipment')).toBeInTheDocument();
  });

  it('shows loading state while fetch is in flight', () => {
    const config = makeConfig({
      fetchSourceDocs: () => new Promise(() => {}),
    });
    render(<ImportReturnLinesModal {...BASE_PROPS} config={config} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('shows noDocsKey message when fetch resolves with empty array', async () => {
    const config = makeConfig({ fetchSourceDocs: vi.fn().mockResolvedValue([]) });
    render(<ImportReturnLinesModal {...BASE_PROPS} config={config} />);
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
    expect(screen.getByText('noCompletedShipmentsForThisCustomer')).toBeInTheDocument();
  });

  it('shows doc rows after fetch resolves with data', async () => {
    const config = makeConfig();
    render(<ImportReturnLinesModal {...BASE_PROPS} config={config} />);
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
    expect(screen.getByText('SHIP-001')).toBeInTheDocument();
    expect(screen.getByText('SHIP-002')).toBeInTheDocument();
  });

  it('filters the doc list when user types in the search input', async () => {
    const config = makeConfig();
    render(<ImportReturnLinesModal {...BASE_PROPS} config={config} />);
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('searchShipment');
    fireEvent.change(searchInput, { target: { value: 'SHIP-001' } });

    expect(screen.getByText('SHIP-001')).toBeInTheDocument();
    expect(screen.queryByText('SHIP-002')).not.toBeInTheDocument();
  });

  it('shows noDocsMatchSearchKey when search yields no results', async () => {
    const config = makeConfig();
    render(<ImportReturnLinesModal {...BASE_PROPS} config={config} />);
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('searchShipment');
    fireEvent.change(searchInput, { target: { value: 'ZZZNOMATCH' } });

    expect(screen.getByText('noShipmentsMatchYourSearch')).toBeInTheDocument();
  });

  it('shows disabled import button when nothing is selected', async () => {
    const config = makeConfig({ fetchSourceDocs: vi.fn().mockResolvedValue([]) });
    render(<ImportReturnLinesModal {...BASE_PROPS} config={config} />);
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    const importBtn = screen.getByText('importSelected');
    expect(importBtn.closest('button')).toBeDisabled();
  });

  it('shows selected count suffix after expanding a doc and lines load', async () => {
    const config = makeConfig();
    render(<ImportReturnLinesModal {...BASE_PROPS} config={config} />);
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    // Click SHIP-001 row to expand — lines will be fetched and auto-selected
    const shipRow = screen.getByText('SHIP-001').closest('[style]');
    fireEvent.click(shipRow);

    await waitFor(() => expect(config.fetchSourceLines).toHaveBeenCalledWith(
      '/sws/neo', 'DOC-1', BASE_PROPS.headers,
    ));
    await waitFor(() => expect(screen.queryByText('loadingLines')).not.toBeInTheDocument());

    // After lines load, they are auto-selected → selected.size === 2
    // The import button label should include (2)
    await waitFor(() => {
      const importBtn = screen.getByText(/importSelected/);
      expect(importBtn).toBeInTheDocument();
    });
  });

  it('calls onClose when the close (×) button is clicked', async () => {
    const onClose = vi.fn();
    const config = makeConfig({ fetchSourceDocs: vi.fn().mockResolvedValue([]) });
    render(<ImportReturnLinesModal {...BASE_PROPS} onClose={onClose} config={config} />);
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not fetch when bpId is absent', () => {
    const config = makeConfig();
    render(<ImportReturnLinesModal {...BASE_PROPS} bpId={null} config={config} />);
    expect(config.fetchSourceDocs).not.toHaveBeenCalled();
  });
});
