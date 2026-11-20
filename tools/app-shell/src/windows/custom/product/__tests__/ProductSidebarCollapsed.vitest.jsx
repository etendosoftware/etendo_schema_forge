/**
 * @covers tools/app-shell/src/windows/custom/product/ProductSidebarCollapsed.jsx
 * @covers artifacts/product/decisions.json
 * @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@phosphor-icons/react', () => ({
  PackageIcon: (p) => <span {...p} data-testid="icon-package" />,
  WarehouseIcon: (p) => <span {...p} data-testid="icon-warehouse" />,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import ProductSidebarCollapsed from '../ProductSidebarCollapsed.jsx';

describe('ProductSidebarCollapsed', () => {
  it('is a named region carrying the collapsed marker, with real buttons and Phosphor icons', () => {
    render(<ProductSidebarCollapsed onSelectTab={vi.fn()} />);
    const strip = screen.getByTestId('ProductSidebarCollapsed');
    expect(strip.getAttribute('aria-label')).toBe('productSidePanel');
    expect(strip.getAttribute('data-product-sidebar-collapsed')).toBe('true');
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => { expect(b.getAttribute('type')).toBe('button'); expect(b.className).toContain('focus-visible:ring-2'); });
    expect(screen.queryByTestId('ProductSidebarOpenButton')).toBeNull();
    expect(screen.getByTestId('icon-package')).toBeInTheDocument();
    expect(screen.getByTestId('icon-warehouse')).toBeInTheDocument();
  });

  it('routes each tab icon to its callback', () => {
    const onSelectTab = vi.fn();
    render(<ProductSidebarCollapsed onSelectTab={onSelectTab} />);
    fireEvent.click(screen.getByTestId('ProductSidebarStripSummary'));
    fireEvent.click(screen.getByTestId('ProductSidebarStripWarehouses'));
    expect(onSelectTab.mock.calls).toEqual([['summary'], ['warehouses']]);
  });
});

// The 48 px width is switched from the window's own decisions.json (never from shared code), through
// Tailwind `has-[]` variants keyed on the marker the strip renders. If a regeneration dropped them the
// strip would render inside a 320 px column.
describe('product sidebarClassName carries the collapsed variants', () => {
  const root = resolve(__dirname, '../../../../../../../');
  const COLLAPSED_WIDTH = 'has-[[data-product-sidebar-collapsed=true]]:w-12';
  const ANIMATION = ['transition-[width]', 'duration-200', 'ease-in-out', 'motion-reduce:transition-none'];
  const classOf = (rel, re) => readFileSync(resolve(root, rel), 'utf8').match(re)?.[1] ?? '';

  it.each([
    ['decisions.json', 'artifacts/product/decisions.json', /"sidebarClassName":\s*"([^"]*)"/],
    ['contract.json', 'artifacts/product/contract.json', /"sidebarClassName":\s*"([^"]*)"/],
    ['generated ProductPage.jsx', 'artifacts/product/generated/web/product/ProductPage.jsx', /sidebarClassName="([^"]*)"/],
  ])('%s', (_n, rel, re) => {
    const cls = classOf(rel, re);
    const tokens = cls.split(/\s+/);
    expect(tokens).toContain('w-[320px]');
    expect(tokens).toContain(COLLAPSED_WIDTH);
    // The column no longer scrolls or clips (the frame does): the divider button must overflow it.
    ['relative', 'flex', 'flex-col'].forEach((c) => expect(tokens).toContain(c));
    expect(tokens.some((t) => /overflow/.test(t))).toBe(false);
    expect(tokens.some((t) => /^has-\[.*\]:(pr-0|overflow-hidden)$/.test(t))).toBe(false);
  });

  // DetailView renders `${sidebarClassName} empty:hidden`; ProductSidebar returns null for Service/Expense/Resource
  // (ProductSidebar.vitest.jsx asserts the empty render). Mounting the real DetailView is too heavy, so the wrapper
  // contract is checked from both sources: the column keeps its own box classes and DetailView keeps `empty:hidden`.
  it('keeps the column box classes and DetailView keeps empty:hidden on the sidebar wrapper, so an empty column disappears', () => {
    const cls = classOf('artifacts/product/decisions.json', /"sidebarClassName":\s*"([^"]*)"/);
    expect(cls).toContain('relative flex flex-col w-[320px]');
    const detailView = readFileSync(resolve(root, 'tools/app-shell/src/components/contract-ui/DetailView.jsx'), 'utf8');
    expect(detailView).toMatch(/<div className=\{`\$\{sidebarClassName\} empty:hidden`\}>/);
  });

  it('carries the same width animation in decisions.json, contract.json and the generated page', () => {
    const sources = [
      classOf('artifacts/product/decisions.json', /"sidebarClassName":\s*"([^"]*)"/),
      classOf('artifacts/product/contract.json', /"sidebarClassName":\s*"([^"]*)"/),
      classOf('artifacts/product/generated/web/product/ProductPage.jsx', /sidebarClassName="([^"]*)"/),
    ];
    const animationOf = (cls) => cls.split(/\s+/).filter((t) => ANIMATION.includes(t)).sort();
    sources.forEach((cls) => expect(animationOf(cls)).toEqual([...ANIMATION].sort()));
    expect(new Set(sources.map((c) => c.split(/\s+/).sort().join(' '))).size).toBe(1);
  });
});
