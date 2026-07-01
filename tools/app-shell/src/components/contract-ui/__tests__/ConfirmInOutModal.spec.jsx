// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ConfirmInOutModal from '../ConfirmInOutModal.jsx';

const BASE_PROPS = {
  base: '/sws/neo',
  headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  recordId: 'REC-001',
  specName: 'goods-shipment',
  entityName: 'goodsShipment',
  invoiceAction: 'createInvoice',
  defaultCreateInvoice: false,
  title: 'Confirm Shipment',
  docInfo: { documentNo: 'SHIP-001', bpName: 'Acme Corp' },
  infoRowPre: 'You are about to confirm',
  infoRowBold: 'SHIP-001',
  infoRowPost: 'from Acme Corp',
  cardTitle: 'Create Invoice',
  cardDesc: 'Also create an invoice for this shipment',
  confirmLabel: 'Confirm',
  confirmWithInvoiceLabel: 'Confirm + Invoice',
  processingLabel: 'Processing...',
  cancelLabel: 'Cancel',
  onConfirmed: vi.fn(),
  onClose: vi.fn(),
};

describe('ConfirmInOutModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { id: 'INV-001', documentNo: 'FAC-001', grandTotalAmount: 500 } } }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the modal title', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} />);
    expect(screen.getByText('Confirm Shipment')).toBeInTheDocument();
  });

  it('renders subtitle parts: documentNo and bpName', () => {
    // Use a docInfo with a unique documentNo that does not appear in infoRowBold
    render(<ConfirmInOutModal {...BASE_PROPS} docInfo={{ documentNo: 'SHIP-999', bpName: 'Acme Corp' }} />);
    expect(screen.getByText('SHIP-999')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders subtitle with amount when total is provided', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} docInfo={{ documentNo: 'SHIP-002', bpName: 'Corp', total: 1234.5, currency: 'EUR' }} />);
    // Amount is formatted with es-ES locale (jsdom may omit thousand sep) — match decimal part
    const hits = screen.getAllByText(/1234,50/);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('omits subtitle rows that are null/undefined', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} docInfo={{}} />);
    // No subtitle section → no dots separator rendered
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });

  it('renders the cancel button', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(BASE_PROPS.onClose).toHaveBeenCalled();
  });

  it('calls onClose when × close button is clicked', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByText('×'));
    expect(BASE_PROPS.onClose).toHaveBeenCalled();
  });

  it('shows confirm label when createInvoice is off (defaultCreateInvoice=false)', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('shows confirmWithInvoiceLabel when defaultCreateInvoice is true', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} />);
    expect(screen.getByText('Confirm + Invoice')).toBeInTheDocument();
  });

  it('toggle switch changes confirm label between Confirm and Confirm + Invoice', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(screen.getByText('Confirm + Invoice')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('info row and toggle are hidden when skipDocumentAction=true', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} skipDocumentAction={true} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('You are about to confirm')).not.toBeInTheDocument();
  });

  it('calls onConfirmed after successful confirm (no invoice toggle)', async () => {
    const onConfirmed = vi.fn();
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} onConfirmed={onConfirmed} />);
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({ invoice: null }));
  });

  it('calls onConfirmed with invoice data when createInvoice toggle is on', async () => {
    const onConfirmed = vi.fn();
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} onConfirmed={onConfirmed} />);
    fireEvent.click(screen.getByText('Confirm + Invoice'));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({
      invoice: { id: 'INV-001', documentNo: 'FAC-001', amount: 500 },
    }));
  });

  it('shows error message when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ response: { message: 'Server error' } }),
    }));
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
  });
});
