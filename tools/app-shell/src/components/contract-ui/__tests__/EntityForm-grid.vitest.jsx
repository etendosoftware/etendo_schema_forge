import { render } from '@testing-library/react';

// Mock i18n hooks (mirror EntityForm.vitest.jsx)
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Stub heavy sub-components so they do not require their own dependencies.
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../ImageField.jsx', () => ({
  ImageField: () => <div data-testid="image-field" />,
}));
vi.mock('../PartnerAddressPicker.jsx', () => ({
  PartnerAddressPicker: () => <div data-testid="partner-address-picker" />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <div data-testid="selector-input" />,
}));
vi.mock('../CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

import { EntityForm } from '../EntityForm.jsx';

/**
 * Returns the top-level grid container that renders the fields.
 * EntityForm wraps `displayFields.map(...)` in a <div className={gridClass} ...>
 * — the first element in `container.children` is exactly that wrapper.
 */
function getGridWrapper(container) {
  // The component returns a single root element: the grid wrapper.
  return container.firstElementChild;
}

describe('EntityForm — horizontal grid layout (ETP-4000)', () => {
  const fields = [
    { key: 'name', label: 'Name', type: 'text', column: 'Name' },
    { key: 'description', label: 'Description', type: 'text', column: 'Description' },
  ];

  it('horizontal layout uses md:grid-cols-4 (Figma ETP-4000 spec)', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" />
    );
    const grid = getGridWrapper(container);
    expect(grid).not.toBeNull();
    expect(grid.className).toMatch(/(^|\s)md:grid-cols-4(\s|$)/);
  });

  it('horizontal layout uses gap-x-5 (Figma ETP-4000 spec)', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" />
    );
    const grid = getGridWrapper(container);
    expect(grid).not.toBeNull();
    expect(grid.className).toMatch(/(^|\s)gap-x-5(\s|$)/);
  });

  it('horizontal layout uses the ROW_GAP_Y density token gap-y-3 (ETP-4321 — 12px row rhythm)', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" />
    );
    const grid = getGridWrapper(container);
    expect(grid.className).toMatch(/(^|\s)gap-y-3(\s|$)/);
    // Must NOT regress to the legacy 20px row gap.
    expect(grid.className).not.toMatch(/(^|\s)gap-y-5(\s|$)/);
  });

  it('horizontal layout does NOT regress to md:grid-cols-3 / gap-x-6', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" />
    );
    const grid = getGridWrapper(container);
    expect(grid.className).not.toMatch(/(^|\s)md:grid-cols-3(\s|$)/);
    expect(grid.className).not.toMatch(/(^|\s)gap-x-6(\s|$)/);
  });

  it('non-horizontal layout still uses md:grid-cols-3 (no regression on secondary forms)', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />
    );
    const grid = getGridWrapper(container);
    expect(grid).not.toBeNull();
    expect(grid.className).toMatch(/(^|\s)md:grid-cols-3(\s|$)/);
    expect(grid.className).toMatch(/(^|\s)gap-3(\s|$)/);
  });

  it('non-horizontal layout does NOT accidentally adopt the 4-column horizontal grid', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} />
    );
    const grid = getGridWrapper(container);
    expect(grid.className).not.toMatch(/(^|\s)md:grid-cols-4(\s|$)/);
  });

  it('cols prop applies an inline grid-template-columns override', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} cols={2} />
    );
    const grid = getGridWrapper(container);
    expect(grid).not.toBeNull();
    // The override path uses gridClass="grid" and inline style only.
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    // Inline override sets gap via style, not via Tailwind classes.
    expect(grid.className).not.toMatch(/(^|\s)md:grid-cols-4(\s|$)/);
    expect(grid.className).not.toMatch(/(^|\s)md:grid-cols-3(\s|$)/);
  });

  it('cols prop overrides even when layout="horizontal" is also passed', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" cols={2} />
    );
    const grid = getGridWrapper(container);
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(grid.className).not.toMatch(/(^|\s)md:grid-cols-4(\s|$)/);
  });
});
