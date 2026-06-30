vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/progressTone', () => ({
  getProgressTone: (pct) => (pct >= 1 ? 'success' : pct > 0 ? 'warning' : 'neutral'),
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
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders nothing when invoiceStatus is 0 (badge hidden until invoiced)', () => {
    const { container } = render(
      <GoodsReceiptDraftChips data={{ documentStatus: 'CO', invoiceStatus: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows 100% when fully invoiced', () => {
    render(<GoodsReceiptDraftChips data={{ documentStatus: 'CO', invoiceStatus: 100 }} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
