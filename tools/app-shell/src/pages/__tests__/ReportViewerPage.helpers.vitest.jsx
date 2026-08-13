// Unit tests for the pure selector helper functions extracted from ReportViewerPage.
// These cover the SearchInput product-drawer path which the render-only suite never exercises.

// Mock the module's dependencies so importing ReportViewerPage.jsx is side-effect free in jsdom.
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token', selectedRole: { orgList: [] }, selectedOrg: { id: 'org1' } }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ toggleFavorite: vi.fn(), isFavorite: () => false }),
}));

vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/date-field', () => ({
  DateField: () => <input type="date" data-testid="date-field" />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import {
  getSelectorPlaceholderLabel,
  getSelectedItems,
  getProductSelectorUrl,
  getSelectorLabelClassName,
  getSelectorButtonTitle,
  applyProductSelectorScopeParams,
} from '../ReportViewerPage.jsx';

describe('getSelectorPlaceholderLabel', () => {
  it('returns "N selected" when multi and items are selected', () => {
    expect(getSelectorPlaceholderLabel(true, [{ id: '1' }, { id: '2' }], 'Account', '')).toBe('2 selected');
  });

  it('returns "Search <label>..." when multi with no selection', () => {
    expect(getSelectorPlaceholderLabel(true, [], 'Account', '')).toBe('Search Account...');
  });

  it('falls back to "Search Product..." when multi, empty, and no label', () => {
    expect(getSelectorPlaceholderLabel(true, [], '', '')).toBe('Search Product...');
    expect(getSelectorPlaceholderLabel(true, [], undefined, '')).toBe('Search Product...');
  });

  it('returns the displayText when non-multi and displayText is present', () => {
    expect(getSelectorPlaceholderLabel(false, [], 'Account', 'Widget A')).toBe('Widget A');
  });

  it('returns "Search <label>..." when non-multi with no displayText', () => {
    expect(getSelectorPlaceholderLabel(false, [], 'Account', '')).toBe('Search Account...');
  });

  it('falls back to "Search Product..." when non-multi, no displayText, no label', () => {
    expect(getSelectorPlaceholderLabel(false, [], '', '')).toBe('Search Product...');
  });
});

describe('getSelectedItems', () => {
  it('non-multi with truthy value returns a single {id,name} item', () => {
    expect(getSelectedItems(false, [{ id: 'x' }], 'p1', 'Widget')).toEqual([{ id: 'p1', name: 'Widget' }]);
  });

  it('non-multi with only displayValue truthy returns single item with undefined id', () => {
    expect(getSelectedItems(false, [], '', 'Widget')).toEqual([{ id: '', name: 'Widget' }]);
  });

  it('non-multi with falsy value and displayValue returns empty array', () => {
    expect(getSelectedItems(false, [{ id: 'ignored' }], '', '')).toEqual([]);
  });

  it('multi with truthy value returns the selected array', () => {
    const selected = [{ id: 'a' }, { id: 'b' }];
    expect(getSelectedItems(true, selected, 'a,b', 'A | B')).toBe(selected);
  });

  it('multi with falsy value and displayValue returns the selected array', () => {
    const selected = [{ id: 'a' }];
    expect(getSelectedItems(true, selected, '', '')).toBe(selected);
  });
});

describe('getProductSelectorUrl', () => {
  it('omits the query string when params are empty', () => {
    const url = getProductSelectorUrl(new URLSearchParams());
    expect(url).toContain('/sws/report-selectors/product');
    expect(url).not.toContain('?');
  });

  it('appends the query string when params are present', () => {
    const params = new URLSearchParams();
    params.set('selectedOrgId', 'org1');
    const url = getProductSelectorUrl(params);
    expect(url).toContain('/sws/report-selectors/product?');
    expect(url).toContain('selectedOrgId=org1');
  });
});

describe('getSelectorLabelClassName', () => {
  it('always includes the base layout classes', () => {
    expect(getSelectorLabelClassName([], '')).toContain('block truncate whitespace-nowrap');
  });

  it('uses text-foreground when there are selected items', () => {
    const cls = getSelectorLabelClassName([{ id: '1' }], '');
    expect(cls).toContain('text-foreground');
    expect(cls).not.toContain('text-muted-foreground');
  });

  it('uses text-foreground when displayText is truthy', () => {
    const cls = getSelectorLabelClassName([], 'Widget');
    expect(cls).toContain('text-foreground');
    expect(cls).not.toContain('text-muted-foreground');
  });

  it('uses text-muted-foreground when no items and no displayText', () => {
    expect(getSelectorLabelClassName([], '')).toContain('text-muted-foreground');
  });
});

describe('getSelectorButtonTitle', () => {
  it('joins selected names with ", " when multi with selection', () => {
    const items = [{ name: 'Alpha' }, { name: 'Beta' }];
    expect(getSelectorButtonTitle(true, items, 'ignored')).toBe('Alpha, Beta');
  });

  it('returns displayText when not multi', () => {
    expect(getSelectorButtonTitle(false, [{ name: 'Alpha' }], 'Widget')).toBe('Widget');
  });

  it('returns displayText when multi but no selection', () => {
    expect(getSelectorButtonTitle(true, [], 'Widget')).toBe('Widget');
  });

  it('returns empty string when no displayText and no qualifying selection', () => {
    expect(getSelectorButtonTitle(false, [], '')).toBe('');
    expect(getSelectorButtonTitle(true, [], '')).toBe('');
  });
});

describe('applyProductSelectorScopeParams', () => {
  it('sets selectedOrgId only when truthy', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('org1', params, [], '');
    expect(params.get('selectedOrgId')).toBe('org1');
    expect(params.has('roleOrgIds')).toBe(false);
    expect(params.has('warehouseIds')).toBe(false);
  });

  it('sets roleOrgIds joined by "," only when the array is non-empty', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('', params, ['o1', 'o2'], '');
    expect(params.get('roleOrgIds')).toBe('o1,o2');
    expect(params.has('selectedOrgId')).toBe(false);
  });

  it('does not set roleOrgIds for an empty array', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('', params, [], '');
    expect(params.has('roleOrgIds')).toBe(false);
  });

  it('sets warehouseIds only when truthy', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('', params, [], 'wh1');
    expect(params.get('warehouseIds')).toBe('wh1');
  });

  it('sets all three when all are provided', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('org1', params, ['o1', 'o2'], 'wh1');
    expect(params.get('selectedOrgId')).toBe('org1');
    expect(params.get('roleOrgIds')).toBe('o1,o2');
    expect(params.get('warehouseIds')).toBe('wh1');
  });

  it('leaves params untouched when all inputs are falsy/empty', () => {
    const params = new URLSearchParams();
    applyProductSelectorScopeParams('', params, [], '');
    expect(params.toString()).toBe('');
    applyProductSelectorScopeParams(null, params, null, null);
    expect(params.toString()).toBe('');
  });
});
