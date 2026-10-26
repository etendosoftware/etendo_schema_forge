// @covers tools/app-shell/src/windows/custom/product/index.jsx
// New file: no existing test covers product/index.jsx (make find-tests returned only other windows'
// index tests, none of which can host the product wrapper's wiring).

vi.mock('../productFkResolvers.js', () => ({}));
vi.mock('../productImportDescriptor.js', () => ({}));
vi.mock('../ProductCustomTable', () => ({ default: () => null }));

const { mockProductPage } = vi.hoisted(() => ({ mockProductPage: vi.fn() }));
vi.mock('@generated/product/generated/web/product/ProductPage', () => ({
  default: (props) => {
    mockProductPage(props);
    return <div data-testid="product-page-stub" />;
  },
}));

import { render, screen } from '@testing-library/react';
import ProductApp from '../index.jsx';
import ProductCustomTable from '../ProductCustomTable';

const lastProps = () => mockProductPage.mock.calls.at(-1)[0];

describe('product window wrapper', () => {
  beforeEach(() => mockProductPage.mockClear());

  it('renders the generated page with Table, windowName and recordId forwarded', () => {
    render(<ProductApp windowName="product" recordId="abc" />);
    expect(screen.getByTestId('product-page-stub')).toBeInTheDocument();
    expect(lastProps().Table).toBe(ProductCustomTable);
    expect(lastProps().windowName).toBe('product');
    expect(lastProps().recordId).toBe('abc');
  });

  it('defaults sidebarFormScrollPaddingX to the min-width class while keeping px-2 and pb-2', () => {
    render(<ProductApp windowName="product" />);
    const tokens = lastProps().sidebarFormScrollPaddingX.split(/\s+/);
    expect(tokens).toContain('[&>*]:min-w-[820px]');
    expect(tokens).toContain('px-2');
    expect(tokens).toContain('pb-2');
  });

  it('lets a caller-provided sidebarFormScrollPaddingX win over the default', () => {
    render(<ProductApp windowName="product" sidebarFormScrollPaddingX="p-0" />);
    expect(lastProps().sidebarFormScrollPaddingX).toBe('p-0');
  });

  it('passes other props through untouched', () => {
    const onSelect = vi.fn();
    render(<ProductApp windowName="product" foo="bar" onSelect={onSelect} />);
    expect(lastProps().foo).toBe('bar');
    expect(lastProps().onSelect).toBe(onSelect);
  });
});
