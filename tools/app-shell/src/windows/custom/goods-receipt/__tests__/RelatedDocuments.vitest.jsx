// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/related-documents', () => ({
  DocChip: ({ type, testId }) => (
    <div data-testid={testId || `doc-chip-${type}`}>{type}</div>
  ),
  RelatedDocumentsShell: ({ children, loading }) => (
    <div data-testid="shell" data-loading={loading}>{children}</div>
  ),
  docChipProps: ({ type, doc }) => ({ type, testId: `chip-${type}-${doc.id}` }),
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RelatedDocuments from '../RelatedDocuments.jsx';

describe('RelatedDocuments (goods-receipt)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders RelatedDocumentsShell with loading=false', () => {
    render(<RelatedDocuments data={undefined} />);
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByTestId('shell').dataset.loading).toBe('false');
  });

  it('renders empty shell with no chips when data is undefined', () => {
    render(<RelatedDocuments data={undefined} />);
    expect(screen.queryAllByTestId(/^chip-/)).toHaveLength(0);
  });

  it('renders empty shell with no chips when data is null', () => {
    render(<RelatedDocuments data={null} />);
    expect(screen.queryAllByTestId(/^chip-/)).toHaveLength(0);
  });

  it('renders 2 order chips when linkedOrders has 2 entries', () => {
    const data = {
      linkedOrders: [
        { id: 'ord-1', documentNo: 'PO-001' },
        { id: 'ord-2', documentNo: 'PO-002' },
      ],
    };
    render(<RelatedDocuments data={data} />);
    expect(screen.getByTestId('chip-order-ord-1')).toBeInTheDocument();
    expect(screen.getByTestId('chip-order-ord-2')).toBeInTheDocument();
  });

  it('renders 1 invoice chip when linkedInvoices has 1 entry', () => {
    const data = {
      linkedInvoices: [{ id: 'inv-1', documentNo: 'FAC-001' }],
    };
    render(<RelatedDocuments data={data} />);
    expect(screen.getByTestId('chip-invoice-inv-1')).toBeInTheDocument();
  });

  it('renders return chip with type return-to-vendor', () => {
    const data = {
      linkedReturns: [{ id: 'ret-1', documentNo: 'RET-001' }],
    };
    render(<RelatedDocuments data={data} />);
    expect(screen.getByTestId('chip-return-to-vendor-ret-1')).toBeInTheDocument();
    expect(screen.getByTestId('chip-return-to-vendor-ret-1').textContent).toBe('return-to-vendor');
  });

  it('treats non-array linkedOrders as empty (renders 0 order chips)', () => {
    const data = { linkedOrders: null };
    render(<RelatedDocuments data={data} />);
    expect(screen.queryAllByTestId(/^chip-order-/)).toHaveLength(0);
  });

  it('treats non-array linkedInvoices as empty', () => {
    const data = { linkedInvoices: 'not-an-array' };
    render(<RelatedDocuments data={data} />);
    expect(screen.queryAllByTestId(/^chip-invoice-/)).toHaveLength(0);
  });

  it('treats non-array linkedReturns as empty', () => {
    const data = { linkedReturns: 42 };
    render(<RelatedDocuments data={data} />);
    expect(screen.queryAllByTestId(/^chip-return-to-vendor-/)).toHaveLength(0);
  });

  it('renders correct total count of chips when all three arrays are populated', () => {
    const data = {
      linkedOrders: [
        { id: 'ord-1' },
        { id: 'ord-2' },
      ],
      linkedInvoices: [{ id: 'inv-1' }],
      linkedReturns: [{ id: 'ret-1' }],
    };
    render(<RelatedDocuments data={data} />);
    // 2 orders + 1 invoice + 1 return = 4 chips
    const allChips = screen.queryAllByTestId(/^chip-/);
    expect(allChips).toHaveLength(4);
  });
});
