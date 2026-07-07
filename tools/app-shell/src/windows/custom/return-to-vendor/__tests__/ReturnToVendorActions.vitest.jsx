// ETP-4372 Part 2 — guards the form-view "Send document" envelope: clicking it
// mounts SendDocumentModal with the client-rendered PDF blob URL (preview wired).

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (key) => key,
}));

// Client-rendered PDF hook → ready blob, not loading.
vi.mock('../useReturnToVendorOrderPdf.js', () => ({
  useReturnToVendorOrderPdf: () => ({ pdfUrl: 'blob:x', loading: false }),
}));

// Render the modal portal inline so we can assert on it, and expose props.
vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: (props) => (
    <div
      data-testid="send-modal"
      data-doc-no={props.documentNo}
      data-pdf-url={props.pdfBlobUrl}
      data-pdf-loading={String(props.pdfBlobLoading)}
      data-window={props.windowName}
    >
      <button data-testid="send-close" onClick={props.onClose}>Close</button>
    </div>
  ),
  SendDocumentButton: ({ onClick }) => (
    <button data-testid="send-button" onClick={onClick}>Send</button>
  ),
}));

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

import ReturnToVendorActions from '../ReturnToVendorActions.jsx';

const DEFAULT_PROPS = {
  data: { documentStatus: 'CO', documentNo: 'RTV-001', businessPartner: 'bp-1', 'businessPartner$_identifier': 'Supplier A' },
  recordId: 'order-1',
  token: 'tok',
  apiBaseUrl: '/api',
};

describe('ReturnToVendorActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when documentStatus is absent', () => {
    const { container } = render(<ReturnToVendorActions {...DEFAULT_PROPS} data={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the Send button when there is a status', () => {
    render(<ReturnToVendorActions {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('send-button')).toBeInTheDocument();
  });

  it('does not show the modal before clicking', () => {
    render(<ReturnToVendorActions {...DEFAULT_PROPS} />);
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
  });

  it('clicking Send mounts SendDocumentModal wired with the PDF blob URL', () => {
    render(<ReturnToVendorActions {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('send-button'));
    const modal = screen.getByTestId('send-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.dataset.pdfUrl).toBe('blob:x');
    expect(modal.dataset.pdfLoading).toBe('false');
    expect(modal.dataset.docNo).toBe('RTV-001');
    expect(modal.dataset.window).toBe('return-to-vendor');
  });

  it('closing the modal unmounts it', () => {
    render(<ReturnToVendorActions {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('send-button'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('send-close'));
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
  });
});
