// @covers tools/app-shell/src/components/copilot/ocr/OcrReviewModal.jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars
    ? `${key}|${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('|')}`
    : key),
}));

vi.mock('../kinds/KindRenderer.jsx', () => ({
  default: ({ field, value, onChange }) => (
    <div data-testid={`kind-${field.key}`}>
      <span>{typeof value === 'object' ? value?.label : value}</span>
      <button type="button" onClick={() => onChange(field.kind === 'entity' ? { id: 'bp-2', label: 'New Vendor' } : `edited-${field.key}`)}>
        edit {field.key}
      </button>
    </div>
  ),
}));

vi.mock('../strategies.js', () => ({
  CREATE_COMPONENTS: {
    contact: () => <div data-testid="contact-create" />,
  },
}));

const checkBpHasLocation = vi.fn();
const findDuplicatePurchaseInvoices = vi.fn();
vi.mock('../ingest/purchaseInvoiceDescriptor.js', () => ({
  checkBpHasLocation: (...args) => checkBpHasLocation(...args),
  findDuplicatePurchaseInvoices: (...args) => findDuplicatePurchaseInvoices(...args),
}));

import OcrReviewModal from '../OcrReviewModal.jsx';

beforeEach(() => {
  checkBpHasLocation.mockReset();
  checkBpHasLocation.mockResolvedValue('present');
  findDuplicatePurchaseInvoices.mockReset();
  findDuplicatePurchaseInvoices.mockResolvedValue({ status: 'none', invoices: [] });
});

const continueButton = () => screen.getByText('ocrReviewContinue');

const fields = [
  {
    id: 'vendor-field',
    key: 'vendor',
    label: 'vendorLabel',
    kind: 'entity',
    extractFrom: 'vendorName',
    createComponent: 'contact',
  },
  {
    id: 'document-field',
    key: 'documentNo',
    label: 'documentNoLabel',
    kind: 'text',
    extractFrom: 'documentNo',
  },
  {
    id: 'date-field',
    key: 'invoiceDate',
    label: 'invoiceDateLabel',
    kind: 'date',
    extractFrom: ['invoiceDate', 'fallbackDate'],
  },
];

function renderModal(props = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <OcrReviewModal
      extracted={{
        vendorName: 'Raw Vendor',
        documentNo: 'INV-1',
        fallbackDate: '2026-07-01',
      }}
      fields={fields}
      preResolved={{ vendor: { id: 'bp-1', label: 'Resolved Vendor' } }}
      resolving={false}
      contactsBase="/contacts"
      apiBaseUrl="/api"
      token="tok"
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSubmit, onCancel };
}

describe('OcrReviewModal', () => {
  it('renders extracted and pre-resolved field values, then submits enabled values', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    expect(screen.getByText('ocrReviewTitle')).toBeInTheDocument();
    expect(screen.getByText(/vendorLabel:/)).toBeInTheDocument();
    expect(screen.getByText('Resolved Vendor')).toBeInTheDocument();
    expect(screen.getByText('INV-1')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01')).toBeInTheDocument();

    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());

    expect(onSubmit).toHaveBeenCalledWith({
      vendor: { id: 'bp-1', label: 'Resolved Vendor' },
      documentNo: 'INV-1',
      invoiceDate: '2026-07-01',
      dueDate: null,
    });
  });

  it('requires a usable vendor and shows vendor resolving text while disabled', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal({
      preResolved: {},
      resolving: true,
    });

    expect(screen.getByText('ocrReviewVendorChecking')).toBeInTheDocument();
    expect(screen.getByText('ocrReviewContinue')).toBeDisabled();
    await user.click(screen.getByText('ocrReviewContinue'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('lets the user edit disabled rows, toggle values off, and cancel', async () => {
    const user = userEvent.setup();
    const { onSubmit, onCancel } = renderModal();

    const switches = screen.getAllByRole('switch');
    await user.click(switches[1]);
    expect(switches[1]).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('kind-documentNo')).toBeInTheDocument();

    await user.click(within(screen.getByTestId('kind-documentNo')).getByText('edit documentNo'));
    expect(switches[1]).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({
      documentNo: 'edited-documentNo',
    }));

    await user.click(screen.getByLabelText('ocrReviewCancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not submit raw extracted text for entity fields until an id is selected', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal({
      preResolved: {},
      resolving: false,
    });

    expect(screen.getByTestId('kind-vendor')).toBeInTheDocument();
    expect(screen.queryByText('Raw Vendor')).not.toBeInTheDocument();
    expect(screen.getByText('ocrReviewContinue')).toBeDisabled();

    await user.click(within(screen.getByTestId('kind-vendor')).getByText('edit vendor'));
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(continueButton());

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      vendor: { id: 'bp-2', label: 'New Vendor' },
    }));
  });

  // ETP-5289 — a vendor with no address cannot carry the invoice (partnerAddress is NOT NULL).
  it('blocks Continue and explains when the vendor has no address', async () => {
    checkBpHasLocation.mockResolvedValue('missing');
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    expect(await screen.findByText('ocrReviewVendorNoAddress')).toBeInTheDocument();
    expect(checkBpHasLocation).toHaveBeenCalledWith({ token: 'tok', apiBaseUrl: '/api', bpId: 'bp-1' });
    expect(continueButton()).toBeDisabled();
    await user.click(continueButton());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('re-checks on demand and unblocks once the address exists', async () => {
    checkBpHasLocation.mockResolvedValueOnce('missing').mockResolvedValueOnce('present');
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByTestId('ocr-review-vendor-recheck'));

    await waitFor(() => expect(continueButton()).toBeEnabled());
    expect(screen.queryByText('ocrReviewVendorNoAddress')).not.toBeInTheDocument();
    expect(checkBpHasLocation).toHaveBeenCalledTimes(2);
  });

  it('does not block when the address lookup itself fails', async () => {
    checkBpHasLocation.mockResolvedValue('unknown');
    renderModal();

    await waitFor(() => expect(continueButton()).toBeEnabled());
    expect(screen.queryByText('ocrReviewVendorNoAddress')).not.toBeInTheDocument();
  });

  it('checks the newly chosen vendor, not the pre-resolved one', async () => {
    checkBpHasLocation.mockImplementation(async ({ bpId }) => (bpId === 'bp-2' ? 'missing' : 'present'));
    const user = userEvent.setup();
    renderModal({ preResolved: {} });

    await user.click(within(screen.getByTestId('kind-vendor')).getByText('edit vendor'));

    expect(await screen.findByText('ocrReviewVendorNoAddress')).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });
  // ETP-5654 — uploading the same PDF twice must warn (never block) about the existing invoice.
  describe('duplicate invoice warning', () => {
    const duplicate = { status: 'duplicate', invoices: [{ id: 'inv-9', documentNo: '1000123' }] };

    it('looks up the vendor + document number and warns with a link, keeping Continue enabled', async () => {
      findDuplicatePurchaseInvoices.mockResolvedValue(duplicate);
      renderModal();

      const link = await screen.findByTestId('ocr-review-duplicate-invoice-link');
      expect(findDuplicatePurchaseInvoices).toHaveBeenCalledWith({
        token: 'tok', apiBaseUrl: '/api', bpId: 'bp-1', documentNo: 'INV-1',
      });
      expect(link).toHaveTextContent('1000123');
      expect(link.getAttribute('href')).toMatch(/\/purchase-invoice\/inv-9$/);
      expect(link).toHaveAttribute('target', '_blank');
      expect(screen.getByTestId('ocr-review-duplicate-invoice')).toHaveTextContent('ocrReviewDuplicateInvoice|documentNo=INV-1');
      await waitFor(() => expect(continueButton()).toBeEnabled());
    });

    it('shows nothing when there is no duplicate', async () => {
      renderModal();
      await waitFor(() => expect(findDuplicatePurchaseInvoices).toHaveBeenCalled());
      expect(screen.queryByTestId('ocr-review-duplicate-invoice')).not.toBeInTheDocument();
    });

    it('shows nothing and does not block when the lookup fails', async () => {
      findDuplicatePurchaseInvoices.mockResolvedValue({ status: 'unknown', invoices: [] });
      renderModal();
      await waitFor(() => expect(findDuplicatePurchaseInvoices).toHaveBeenCalled());
      expect(screen.queryByTestId('ocr-review-duplicate-invoice')).not.toBeInTheDocument();
      await waitFor(() => expect(continueButton()).toBeEnabled());
    });

    it('does not look up without a vendor or without a document number', async () => {
      renderModal({ preResolved: {} });
      renderModal({ extracted: { vendorName: 'x', documentNo: '   ' } });
      await new Promise((r) => setTimeout(r, 0));
      expect(findDuplicatePurchaseInvoices).not.toHaveBeenCalled();
    });

    it('re-checks when the vendor changes and drops the stale warning', async () => {
      findDuplicatePurchaseInvoices.mockImplementation(async ({ bpId }) => (bpId === 'bp-1' ? duplicate : { status: 'none', invoices: [] }));
      const user = userEvent.setup();
      renderModal();
      await screen.findByTestId('ocr-review-duplicate-invoice');

      await user.click(screen.getAllByRole('switch')[0]);
      await user.click(within(screen.getByTestId('kind-vendor')).getByText('edit vendor'));

      await waitFor(() => expect(findDuplicatePurchaseInvoices).toHaveBeenCalledWith(expect.objectContaining({ bpId: 'bp-2' })));
      await waitFor(() => expect(screen.queryByTestId('ocr-review-duplicate-invoice')).not.toBeInTheDocument());
    });

    it('re-checks when the document number is edited', async () => {
      const user = userEvent.setup();
      renderModal();
      await waitFor(() => expect(findDuplicatePurchaseInvoices).toHaveBeenCalledTimes(1));

      await user.click(screen.getAllByRole('switch')[1]);
      await user.click(within(screen.getByTestId('kind-documentNo')).getByText('edit documentNo'));

      await waitFor(() => expect(findDuplicatePurchaseInvoices).toHaveBeenCalledWith(expect.objectContaining({ documentNo: 'edited-documentNo' })));
    });
  });
});
