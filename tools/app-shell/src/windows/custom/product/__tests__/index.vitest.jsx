// @covers tools/app-shell/src/windows/custom/product/index.jsx
// @covers tools/app-shell/src/windows/custom/product/ProductMovementsTab.jsx
// @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('defaults sidebarFormScrollPaddingX to the min-width class with right and bottom padding only (no left inset)', () => {
    render(<ProductApp windowName="product" />);
    const tokens = lastProps().sidebarFormScrollPaddingX.split(/\s+/);
    expect(tokens).toContain('[&>*]:min-w-[680px]');
    expect(tokens).toContain('pr-2');
    expect(tokens).toContain('pb-2');
    expect(tokens).not.toContain('px-2');
    expect(tokens).not.toContain('pl-2');
  });

  // The Movements table bleeds to the card edge with `-mr-N`: it cancels DetailView's `p-2` wrapper (2 units)
  // plus the content column's right padding. If either side changes alone the table over/under-shoots.
  it('keeps the content column right padding coupled to the Movements table right bleed', () => {
    render(<ProductApp windowName="product" />);
    const pr = Number(lastProps().sidebarFormScrollPaddingX.match(/(?:^|\s)pr-(\d+)(?:\s|$)/)[1]);
    // Attribute-order independent: take the JSX opening tag that carries the scroll box testid, then its className.
    const tabSrc = readFileSync(resolve(__dirname, '../ProductMovementsTab.jsx'), 'utf8');
    const tag = tabSrc.match(/<[A-Za-z][^<>]*?data-testid="product-movements-scroll"[^<>]*>/s)?.[0]
      ?? tabSrc.match(/<[A-Za-z][^<>]*?className="[^"]*"[^<>]*?data-testid="product-movements-scroll"[^<>]*>/s)?.[0];
    expect(tag, 'ProductMovementsTab.jsx no longer has an element with data-testid="product-movements-scroll"').toBeTruthy();
    const classAttr = tag.match(/className="([^"]*)"/)?.[1];
    expect(classAttr, 'the product-movements-scroll element must keep a literal className carrying -mr-N').toBeTruthy();
    const mr = Number(classAttr.match(/(?:^|\s)-mr-(\d+)(?:\s|$)/)?.[1]);
    expect(Number.isFinite(mr), 'the scroll box className lost its -mr-N bleed').toBe(true);
    // The custom-tab wrapper padding comes from the real DetailView source, not a literal in this test.
    const dvSrc = readFileSync(resolve(__dirname, '../../../../components/contract-ui/DetailView.jsx'), 'utf8');
    const wrapper = dvSrc.match(/className=\{`(p-\d+) flex flex-col gap-3[^`]*`\}/);
    expect(wrapper, 'DetailView custom-tab wrapper (`p-N flex flex-col gap-3`) not found').toBeTruthy();
    const DETAILVIEW_CUSTOM_TAB_PADDING = Number(wrapper[1].slice(2));
    expect(mr, 'Movements bleed (-mr-N) must equal the content column pr-N plus the DetailView custom-tab padding: update ProductMovementsTab -mr-N (and its -ml-N) if either changed').toBe(pr + DETAILVIEW_CUSTOM_TAB_PADDING);
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
