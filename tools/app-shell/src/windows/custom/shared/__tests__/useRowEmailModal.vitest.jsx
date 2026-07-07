// Mocks must come before imports (Vitest hoisting)
//
// Regression guard (ETP-4372): the row-hover "send document by email" envelope
// must open SendDocumentModal WITH a client-generated PDF preview. The shared
// hook useRowEmailModal wires each window's per-document PDF hook so the modal
// receives pdfBlobUrl. Before the fix the modal opened without pdfBlobUrl and
// showed a "PDF not configured" card.

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: (props) => (
    <div
      data-testid="send-document-modal"
      data-pdf-blob-url={props.pdfBlobUrl ?? ''}
      data-pdf-blob-loading={String(props.pdfBlobLoading)}
      data-document-no={props.documentNo ?? ''}
      data-document-id={props.documentId ?? ''}
      data-window-name={props.windowName ?? ''}
      data-document-type={props.documentType ?? ''}
      data-bp-name={props.bpName ?? ''}
      data-bpartner-id={props.bPartnerId ?? ''}
      data-allow-email={String(props.allowEmail)}
    >
      <button data-testid="modal-close" onClick={props.onClose}>close</button>
    </div>
  ),
}));

import { render, screen, renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useRowEmailModal } from '../useRowEmailModal.jsx';

// Tiny harness: renders the emailModalPortal returned by the hook and exposes
// onEmail via a button so we can drive state through the real render cycle.
function Harness({ hookOptions, row }) {
  const { onEmail, emailModalPortal } = useRowEmailModal(hookOptions);
  return (
    <div>
      <button data-testid="trigger-email" onClick={() => onEmail(row)}>
        email
      </button>
      {emailModalPortal}
    </div>
  );
}

const ROW = {
  id: 'doc-42',
  documentNo: 'SO/0042',
  'businessPartner$_identifier': 'ACME Corp',
  businessPartner: 'bp-7',
};

const BASE_OPTIONS = {
  usePdf: () => ({ pdfUrl: 'blob:fake-pdf', loading: false }),
  apiBaseUrl: '/api',
  token: 'tok',
  windowName: 'sales-order',
  documentType: 'Order',
};

describe('useRowEmailModal', () => {
  it('renders no modal before onEmail is called', () => {
    render(<Harness hookOptions={BASE_OPTIONS} row={ROW} />);
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
  });

  it('opens the modal WITH the pdfBlobUrl from the supplied usePdf hook (core regression)', async () => {
    render(<Harness hookOptions={BASE_OPTIONS} row={ROW} />);

    await act(async () => {
      screen.getByTestId('trigger-email').click();
    });

    const modal = screen.getByTestId('send-document-modal');
    expect(modal).toBeInTheDocument();
    // The whole point of the fix: preview IS wired.
    expect(modal).toHaveAttribute('data-pdf-blob-url', 'blob:fake-pdf');
    expect(modal).toHaveAttribute('data-pdf-blob-loading', 'false');
  });

  it('forwards documentNo, documentId and windowName from the row/options', async () => {
    render(<Harness hookOptions={BASE_OPTIONS} row={ROW} />);

    await act(async () => {
      screen.getByTestId('trigger-email').click();
    });

    const modal = screen.getByTestId('send-document-modal');
    expect(modal).toHaveAttribute('data-document-no', 'SO/0042');
    expect(modal).toHaveAttribute('data-document-id', 'doc-42');
    expect(modal).toHaveAttribute('data-window-name', 'sales-order');
    // spot-check the remaining derived props
    expect(modal).toHaveAttribute('data-bp-name', 'ACME Corp');
    expect(modal).toHaveAttribute('data-bpartner-id', 'bp-7');
    expect(modal).toHaveAttribute('data-document-type', 'Order');
  });

  it('still renders (no crash, rules of hooks respected) with pdfBlobUrl null when usePdf is omitted', async () => {
    const { usePdf, ...noPdfOptions } = BASE_OPTIONS;
    render(<Harness hookOptions={noPdfOptions} row={ROW} />);

    await act(async () => {
      screen.getByTestId('trigger-email').click();
    });

    const modal = screen.getByTestId('send-document-modal');
    expect(modal).toBeInTheDocument();
    // useNoPdf fallback -> null pdfUrl -> empty attribute
    expect(modal).toHaveAttribute('data-pdf-blob-url', '');
    expect(modal).toHaveAttribute('data-pdf-blob-loading', 'false');
  });

  it('closes the modal when onClose fires', async () => {
    render(<Harness hookOptions={BASE_OPTIONS} row={ROW} />);

    await act(async () => {
      screen.getByTestId('trigger-email').click();
    });
    expect(screen.getByTestId('send-document-modal')).toBeInTheDocument();

    await act(async () => {
      screen.getByTestId('modal-close').click();
    });
    expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
  });

  it('exposes onEmail/setEmailRow and updates emailRow through renderHook', () => {
    const { result } = renderHook(() => useRowEmailModal(BASE_OPTIONS));

    expect(result.current.emailRow).toBeNull();
    expect(result.current.emailModalPortal).toBeNull();

    act(() => {
      result.current.onEmail(ROW);
    });

    expect(result.current.emailRow).toEqual(ROW);
    expect(result.current.emailModalPortal).not.toBeNull();

    act(() => {
      result.current.setEmailRow(null);
    });

    expect(result.current.emailRow).toBeNull();
    expect(result.current.emailModalPortal).toBeNull();
  });
});
