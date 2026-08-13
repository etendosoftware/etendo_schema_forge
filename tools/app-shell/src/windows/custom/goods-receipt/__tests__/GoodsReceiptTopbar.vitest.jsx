vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GoodsReceiptTopbar from '@generated/goods-receipt/custom/GoodsReceiptTopbar.jsx';

describe('GoodsReceiptTopbar', () => {
  it('returns null when data is absent', () => {
    const { container } = render(<GoodsReceiptTopbar data={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when documentStatus is not CO', () => {
    const { container } = render(
      <GoodsReceiptTopbar data={{ documentStatus: 'DR', invoiceStatus: 0 }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the invoice status pill when documentStatus is CO', () => {
    render(<GoodsReceiptTopbar data={{ documentStatus: 'CO', invoiceStatus: 75 }} />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows 0% when invoiceStatus is 0', () => {
    render(<GoodsReceiptTopbar data={{ documentStatus: 'CO', invoiceStatus: 0 }} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows 100% when fully invoiced', () => {
    render(<GoodsReceiptTopbar data={{ documentStatus: 'CO', invoiceStatus: 100 }} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
