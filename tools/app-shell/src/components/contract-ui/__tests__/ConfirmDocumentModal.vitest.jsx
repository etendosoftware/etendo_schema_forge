vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ConfirmDocumentModal, { CheckboxCard } from '@/components/contract-ui/ConfirmDocumentModal';

// ── CheckboxCard ──────────────────────────────────────────────────────────────

describe('CheckboxCard', () => {
  it('renders title and subtitle', () => {
    render(<CheckboxCard checked={false} onChange={vi.fn()} icon="📋" title="My Title" subtitle="My Sub" />);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('My Sub')).toBeInTheDocument();
  });

  it('calls onChange when clicked and not disabled', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CheckboxCard checked={false} onChange={onChange} icon="📋" title="T" subtitle="S" />,
    );
    fireEvent.click(container.firstChild);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CheckboxCard checked={false} onChange={onChange} icon="📋" title="T" subtitle="S" disabled />,
    );
    fireEvent.click(container.firstChild);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders checkmark svg when checked', () => {
    const { container } = render(
      <CheckboxCard checked={true} onChange={vi.fn()} icon="📋" title="T" subtitle="S" />,
    );
    expect(container.querySelector('polyline')).toBeInTheDocument();
  });

  it('renders checkmark svg when disabled (treated as confirmed)', () => {
    const { container } = render(
      <CheckboxCard checked={false} onChange={vi.fn()} icon="📋" title="T" subtitle="S" disabled />,
    );
    expect(container.querySelector('polyline')).toBeInTheDocument();
  });

  it('does not render checkmark when unchecked and not disabled', () => {
    const { container } = render(
      <CheckboxCard checked={false} onChange={vi.fn()} icon="📋" title="T" subtitle="S" />,
    );
    expect(container.querySelector('polyline')).not.toBeInTheDocument();
  });
});

// ── ConfirmDocumentModal ──────────────────────────────────────────────────────

const BASE_PROPS = {
  base: '/api',
  headers: { Authorization: 'Bearer tok' },
  recordId: 'rec-1',
  specName: 'goods-receipt',
  entityName: 'goodsReceipt',
  invoiceAction: 'createPurchaseInvoice',
  titleKey: 'confirmTitle',
  subtitleKey: 'confirmSubtitle',
  cardTitleKey: 'cardTitle',
  cardSubtitleKey: 'cardSub',
  confirmBtnKey: 'confirmBtn',
  onConfirmed: vi.fn(),
  onClose: vi.fn(),
};

describe('ConfirmDocumentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({}) }),
    ));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders title, subtitle and cancel button', () => {
    render(<ConfirmDocumentModal {...BASE_PROPS} />);
    expect(screen.getByText('confirmTitle')).toBeInTheDocument();
    expect(screen.getByText('confirmSubtitle')).toBeInTheDocument();
    expect(screen.getByText('cancel')).toBeInTheDocument();
  });

  it('calls onClose when × button is clicked', () => {
    render(<ConfirmDocumentModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByText('×'));
    expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button is clicked', () => {
    render(<ConfirmDocumentModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByText('cancel'));
    expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders docInfo documentNo and bpName when provided', () => {
    render(
      <ConfirmDocumentModal
        {...BASE_PROPS}
        docInfo={{ documentNo: 'ALB-001', bpName: 'Supplier A' }}
      />,
    );
    expect(screen.getByText('ALB-001')).toBeInTheDocument();
    expect(screen.getByText('Supplier A')).toBeInTheDocument();
  });

  it('does not render docInfo section when not provided', () => {
    render(<ConfirmDocumentModal {...BASE_PROPS} />);
    expect(screen.queryByText('ALB-001')).not.toBeInTheDocument();
  });

  it('calls onConfirmed with invoice:null on success when createInvoice is false', async () => {
    render(<ConfirmDocumentModal {...BASE_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('confirmBtn'));
    });
    await vi.waitFor(() =>
      expect(BASE_PROPS.onConfirmed).toHaveBeenCalledWith({ invoice: null }),
    );
  });

  it('shows error and does not call onConfirmed when documentAction fetch fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ response: { message: 'Document already confirmed' } }),
    });
    render(<ConfirmDocumentModal {...BASE_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByText('confirmBtn'));
    });
    expect(await screen.findByText('Document already confirmed')).toBeInTheDocument();
    expect(BASE_PROPS.onConfirmed).not.toHaveBeenCalled();
  });

  it('calls createPurchaseInvoice and passes invoice data to onConfirmed when checkbox is checked', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('documentAction')) {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes('createPurchaseInvoice')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { data: { id: 'inv-1', documentNo: 'FAC-001' } } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<ConfirmDocumentModal {...BASE_PROPS} />);
    // Toggle the checkbox on
    fireEvent.click(screen.getByText('cardTitle').closest('[style]'));
    await act(async () => {
      fireEvent.click(screen.getByText('confirmBtn'));
    });
    await vi.waitFor(() =>
      expect(BASE_PROPS.onConfirmed).toHaveBeenCalledWith({
        invoice: expect.objectContaining({ id: 'inv-1', documentNo: 'FAC-001' }),
      }),
    );
  });
});
