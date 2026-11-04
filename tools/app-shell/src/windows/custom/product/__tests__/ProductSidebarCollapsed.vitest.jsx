/**
 * @covers tools/app-shell/src/windows/custom/product/ProductSidebarCollapsed.jsx
 * @covers artifacts/product/decisions.json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('lucide-react', () => ({
  PanelRightOpen: (p) => <span {...p} data-testid="icon-panel-open" />,
  Package: (p) => <span {...p} data-testid="icon-package" />,
  Warehouse: (p) => <span {...p} data-testid="icon-warehouse" />,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import ProductSidebarCollapsed from '../ProductSidebarCollapsed.jsx';

describe('ProductSidebarCollapsed', () => {
  it('is a named region carrying the collapsed marker, with real buttons and Lucide icons', () => {
    render(<ProductSidebarCollapsed onOpen={vi.fn()} onSelectTab={vi.fn()} />);
    const strip = screen.getByTestId('ProductSidebarCollapsed');
    expect(strip.getAttribute('aria-label')).toBe('productSidePanel');
    expect(strip.getAttribute('data-product-sidebar-collapsed')).toBe('true');
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    buttons.forEach((b) => { expect(b.getAttribute('type')).toBe('button'); expect(b.className).toContain('focus-visible:ring-2'); });
    expect(screen.getByTestId('icon-panel-open')).toBeInTheDocument();
    expect(screen.getByTestId('icon-package')).toBeInTheDocument();
    expect(screen.getByTestId('icon-warehouse')).toBeInTheDocument();
  });

  it('routes the open button and each tab icon to its callback', () => {
    const onOpen = vi.fn();
    const onSelectTab = vi.fn();
    render(<ProductSidebarCollapsed onOpen={onOpen} onSelectTab={onSelectTab} />);
    fireEvent.click(screen.getByTestId('ProductSidebarOpenButton'));
    expect(onOpen).toHaveBeenCalledTimes(1);
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
  const VARIANTS = ['w-12', 'pr-0', 'overflow-hidden'].map((c) => `has-[[data-product-sidebar-collapsed=true]]:${c}`);
  const classOf = (rel, re) => readFileSync(resolve(root, rel), 'utf8').match(re)?.[1] ?? '';

  it.each([
    ['decisions.json', 'artifacts/product/decisions.json', /"sidebarClassName":\s*"([^"]*)"/],
    ['contract.json', 'artifacts/product/contract.json', /"sidebarClassName":\s*"([^"]*)"/],
    ['generated ProductPage.jsx', 'artifacts/product/generated/web/product/ProductPage.jsx', /sidebarClassName="([^"]*)"/],
  ])('%s', (_n, rel, re) => {
    const cls = classOf(rel, re);
    expect(cls).toContain('w-[320px]');
    VARIANTS.forEach((v) => expect(cls).toContain(v));
  });
});
