import { render, screen, fireEvent } from '@testing-library/react';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// `f.lookup: true` search fields (e.g. product) route through the inline LookupFormField,
// which renders this drawer and calls `onSelect(item)` with the raw server item — feeding
// `applyLookupAuxData` the same shape CreatableSearchSelect's `handleSelect` would.
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: ({ open, onSelect, 'data-testid': testId }) => (
    open ? (
      <button
        type="button"
        data-testid={`${testId}-pick`}
        onClick={() => onSelect({
          id: 'PROD1',
          name: 'Widget',
          active: true,
          searchKey: 'PROD1-KEY',
          isTaxIncluded: true,
          standardPrice: 42.5,
          _aux: { _PSTD: 10, _UOM: 'EA' },
        })}
      >
        pick product
      </button>
    ) : null
  ),
}));
vi.mock('../ImageField.jsx', () => ({ ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../PartnerAddressPicker.jsx', () => ({
  PartnerAddressPicker: () => <div data-testid="partner-address-picker" />,
}));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
// Real CreatableSearchSelect's `handleSelect` calls `onChange(opt.id, opt.name, opt)` — the
// whole raw server item as the 3rd arg. Mock it thin but preserve that contract so the wrapper
// under test (EntityForm's `selectorOnChange`/`searchOnChange`) receives the same shape.
vi.mock('../CreatableSearchSelect.jsx', () => ({
  CreatableSearchSelect: ({ field, onChange }) => (
    <button
      type="button"
      data-testid={`select-${field.key}`}
      onClick={() => onChange('CAT1', 'Category One', {
        // Raw server item fields — NOT an aux contract. Must be ignored.
        id: 'CAT1',
        name: 'Category One',
        active: true,
        searchKey: 'CAT1-KEY',
        // Legitimate nested aux contract — must still be applied.
        _aux: { _UOM: 'EA', _CURR: 'USD' },
      })}
    >
      select
    </button>
  ),
}));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import { EntityForm } from '../EntityForm.jsx';

describe('EntityForm selector aux-data propagation (ETP-4600 regression)', () => {
  it('ignores raw selector-item fields but still applies the `_aux` contract for type:selector fields', () => {
    const onChange = vi.fn();
    const fields = [
      { key: 'assetCategory', label: 'Asset Category', type: 'selector', column: 'M_Asset_Category_ID' },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('select-assetCategory'));

    const calledNames = onChange.mock.calls.map((c) => c[0]);

    // Legitimate writes: the field itself, its identifier, and the _aux suffixes.
    expect(calledNames).toContain('assetCategory');
    expect(calledNames).toContain('assetCategory$_identifier');
    expect(calledNames).toContain('assetCategory_UOM');
    expect(calledNames).toContain('assetCategory_CURR');

    // Bogus concatenations that the old bug produced from raw option fields must NOT appear.
    expect(calledNames).not.toContain('assetCategoryid');
    expect(calledNames).not.toContain('assetCategoryname');
    expect(calledNames).not.toContain('assetCategoryactive');
    expect(calledNames).not.toContain('assetCategorysearchKey');

    // Exactly one call per legitimate write (no duplicate spurious calls).
    expect(onChange.mock.calls.filter((c) => c[0] === 'assetCategory')).toHaveLength(1);
  });

  it('ignores raw selector-item fields but still applies standardPrice/_aux for type:search + lookup fields', () => {
    const onChange = vi.fn();
    const fields = [
      { key: 'product', id: 'product', label: 'Product', type: 'search', lookup: true, column: 'M_Product_ID' },
    ];
    render(<EntityForm fields={fields} data={{}} onChange={onChange} />);

    // Open the drawer, then pick the product.
    fireEvent.click(screen.getByTestId('field-product'));
    fireEvent.click(screen.getByTestId('ProductSearchDrawer__product-pick'));

    const calledNames = onChange.mock.calls.map((c) => c[0]);

    // Legitimate: field + identifier, the isTaxIncluded=true -> grossUnitPrice mapping, and _aux.
    expect(calledNames).toContain('product');
    expect(calledNames).toContain('product$_identifier');
    expect(calledNames).toContain('grossUnitPrice');
    expect(calledNames).toContain('product_PSTD');
    expect(calledNames).toContain('product_UOM');

    // Bogus concatenations from raw option fields must NOT appear.
    expect(calledNames).not.toContain('productid');
    expect(calledNames).not.toContain('productname');
    expect(calledNames).not.toContain('productactive');
    expect(calledNames).not.toContain('productsearchKey');
    expect(calledNames).not.toContain('productisTaxIncluded');
    expect(calledNames).not.toContain('productstandardPrice');
  });
});
