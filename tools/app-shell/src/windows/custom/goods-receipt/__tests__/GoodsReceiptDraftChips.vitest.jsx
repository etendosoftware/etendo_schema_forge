vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
}));

vi.mock('@/components/ui/status-tag-tokens.js', () => ({
  TONE_STYLES: {
    success: { background: '#d1fae5', color: '#065f46' },
    warning: { background: '#fef3c7', color: '#92400e' },
    neutral: { background: '#f3f4f6', color: '#374151' },
  },
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GoodsReceiptDraftChips from '@generated/goods-receipt/custom/GoodsReceiptDraftChips.jsx';

describe('GoodsReceiptDraftChips', () => {
  it('returns null when data is absent', () => {
    const { container } = render(<GoodsReceiptDraftChips data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when documentStatus is DR', () => {
    const { container } = render(
      <GoodsReceiptDraftChips data={{ documentStatus: 'DR', invoiceStatus: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the invoice badge when documentStatus is CO', () => {
    render(<GoodsReceiptDraftChips data={{ documentStatus: 'CO', invoiceStatus: 50 }} />);
    expect(screen.getByTestId('goods-receipt-invoice-badge')).toBeInTheDocument();
    expect(screen.getByTestId('goods-receipt-invoice-badge')).toHaveTextContent(/50%/);
    expect(screen.getByTestId('goods-receipt-invoice-badge')).toHaveAttribute('data-tone', 'neutral');
  });

  it('renders a neutral 0% badge when CO and invoiceStatus is 0', () => {
    render(<GoodsReceiptDraftChips data={{ documentStatus: 'CO', invoiceStatus: 0 }} />);
    const el = screen.getByTestId('goods-receipt-invoice-badge');
    expect(el).toHaveTextContent(/0%/);
    expect(el).toHaveAttribute('data-tone', 'neutral');
  });

  it('renders nothing when DR and invoiceStatus is 0', () => {
    const { container } = render(
      <GoodsReceiptDraftChips data={{ documentStatus: 'DR', invoiceStatus: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a success badge for a draft already fully invoiced (ETP-5381)', () => {
    render(<GoodsReceiptDraftChips data={{ documentStatus: 'DR', invoiceStatus: 100 }} />);
    const el = screen.getByTestId('goods-receipt-invoice-badge');
    expect(el).toHaveTextContent(/100%/);
    expect(el).toHaveAttribute('data-tone', 'success');
  });

  it('renders a neutral badge for a partially invoiced draft', () => {
    render(<GoodsReceiptDraftChips data={{ documentStatus: 'DR', invoiceStatus: 40 }} />);
    const el = screen.getByTestId('goods-receipt-invoice-badge');
    expect(el).toHaveTextContent(/40%/);
    expect(el).toHaveAttribute('data-tone', 'neutral');
  });

  it('shows 100% when fully invoiced', () => {
    render(<GoodsReceiptDraftChips data={{ documentStatus: 'CO', invoiceStatus: 100 }} />);
    expect(screen.getByTestId('goods-receipt-invoice-badge')).toHaveTextContent(/100%/);
    expect(screen.getByTestId('goods-receipt-invoice-badge')).toHaveAttribute('data-show-icon', 'false').toBeInTheDocument();
  });
});
