import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
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

import OcrReviewModal from '../OcrReviewModal.jsx';

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

    await user.click(screen.getByText('ocrReviewContinue'));

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
    await user.click(screen.getByText('ocrReviewContinue'));
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
    await user.click(screen.getByText('ocrReviewContinue'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      vendor: { id: 'bp-2', label: 'New Vendor' },
    }));
  });
});
