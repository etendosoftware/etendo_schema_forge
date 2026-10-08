// @covers tools/app-shell/src/components/contract-ui/EntityForm.jsx
// @covers tools/app-shell/src/components/contract-ui/formResponsiveLayout.js
// @covers tools/app-shell/src/components/contract-ui/FormShowMoreToggle.jsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';

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

  // ETP-5513 — the real column count is measured from the grid's own width
  // (formResponsiveLayout.js) and applied inline; md:grid-cols-4 is only the static
  // fallback for the unmeasured first commit (and jsdom, which has no layout).
  it('horizontal layout keeps md:grid-cols-4 as the unmeasured fallback (ETP-4000, ETP-5513)', () => {
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
    // minmax(0, 1fr) (not bare 1fr) — see ETP-4600 Gap D: a plain `1fr` track's
    // implicit minimum is the item's min-content size, which lets a long
    // unbreakable value grow the column instead of letting `truncate` clip it.
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    // Inline override sets gap via style, not via Tailwind classes.
    expect(grid.className).not.toMatch(/(^|\s)md:grid-cols-4(\s|$)/);
    expect(grid.className).not.toMatch(/(^|\s)md:grid-cols-3(\s|$)/);
  });

  it('cols prop overrides even when layout="horizontal" is also passed', () => {
    const { container } = render(
      <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" cols={2} />
    );
    const grid = getGridWrapper(container);
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    expect(grid.className).not.toMatch(/(^|\s)md:grid-cols-4(\s|$)/);
  });

  // ETP-4751 — `trailing` / `renderAsFragment` (inline SIF field flows into the header grid)
  describe('trailing slot + renderAsFragment (ETP-4751)', () => {
    it('renders `trailing` as an additional child INSIDE the grid container (flows into the next cell)', () => {
      const { container } = render(
        <EntityForm
          fields={fields}
          data={{}}
          onChange={vi.fn()}
          layout="horizontal"
          trailing={<div data-testid="trailing-cell">extra</div>}
        />
      );
      const grid = getGridWrapper(container);
      const trailing = container.querySelector('[data-testid="trailing-cell"]');
      expect(trailing).not.toBeNull();
      // The trailing node is a DIRECT child of the grid container, so it flows into
      // the next free grid cell alongside the native field cells — NOT below the grid.
      expect(trailing.parentElement).toBe(grid);
      // It is the LAST child, after the two field cells.
      expect(grid.lastElementChild).toBe(trailing);
    });

    it('undefined `trailing` is strictly additive — no extra grid child, no behavior change', () => {
      const { container } = render(
        <EntityForm fields={fields} data={{}} onChange={vi.fn()} layout="horizontal" />
      );
      const grid = getGridWrapper(container);
      // Only the two field cells; no phantom trailing node.
      expect(grid.children.length).toBe(fields.length);
    });

    it('renderAsFragment emits bare field cells WITHOUT the wrapping grid container', () => {
      const { container } = render(
        <EntityForm
          fields={[fields[0]]}
          data={{}}
          onChange={vi.fn()}
          layout="horizontal"
          renderAsFragment
        />
      );
      // No grid wrapper: the top-level node is the field cell itself, not a
      // `grid ...` container. This lets the caller splice the cell into ANOTHER
      // form's grid via its `trailing` slot.
      const top = container.firstElementChild;
      expect(top).not.toBeNull();
      expect(top.className || '').not.toMatch(/(^|\s)grid(\s|$)/);
      // The field input still renders (registration/rendering intact).
      expect(container.querySelector('[data-testid="field-name"]')).not.toBeNull();
    });
  });
});

// Measured header grid (ETP-5513): the column count follows the grid's OWN width,
// not the viewport, and the first `initialRows` rows can hide the rest behind a
// "Show more" toggle. jsdom has no layout, so the width is stubbed through
// getBoundingClientRect (first measurement) and a controllable ResizeObserver
// (later resizes).
describe('EntityForm — measured horizontal grid + initialRows (ETP-5513)', () => {
  let width = 0;
  let observers = [];
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const originalRO = globalThis.ResizeObserver;

  class FakeResizeObserver {
    constructor(cb) { this.cb = cb; this.nodes = []; observers.push(this); }
    observe(node) { this.nodes.push(node); }
    unobserve() {}
    disconnect() { this.nodes = []; }
  }

  function resizeTo(next) {
    width = next;
    act(() => {
      for (const o of observers) {
        if (o.nodes.length) o.cb(o.nodes.map(() => ({ contentRect: { width: next } })));
      }
    });
  }

  beforeEach(() => {
    width = 0;
    observers = [];
    globalThis.ResizeObserver = FakeResizeObserver;
    HTMLElement.prototype.getBoundingClientRect = function rect() {
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0 };
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    globalThis.ResizeObserver = originalRO;
  });

  const mk = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({
    key: `k${i}`, label: `K${i}`, type: 'text', column: `K${i}`, ...extra,
  }));
  const renderedKeys = (grid) =>
    [...grid.querySelectorAll('[data-testid^="field-"]')].map(el => el.dataset.testid.replace('field-', ''));
  const renderForm = (props) => render(
    <EntityForm data={{}} onChange={vi.fn()} layout="horizontal" {...props} />
  );

  describe('column count follows the container width', () => {
    it.each([
      [400, 2], [479, 2], [480, 3], [664, 3], [848, 3], [959, 3], [960, 4], [1100, 4],
    ])('a %ipx wide grid renders %i columns', (w, expected) => {
      width = w;
      const { container } = renderForm({ fields: mk(2) });
      expect(getGridWrapper(container).style.gridTemplateColumns)
        .toBe(`repeat(${expected}, minmax(0, 1fr))`);
    });

    it('keeps the static fallback classes and no inline columns before it is measured', () => {
      const { container } = renderForm({ fields: mk(2) });
      const grid = getGridWrapper(container);
      expect(grid.style.gridTemplateColumns).toBe('');
      expect(grid.className).toMatch(/(^|\s)grid-cols-2(\s|$)/);
      expect(grid.className).toMatch(/(^|\s)md:grid-cols-4(\s|$)/);
    });

    it('re-resolves the column count when the container is resized', () => {
      width = 1100;
      const { container } = renderForm({ fields: mk(2) });
      const grid = getGridWrapper(container);
      expect(grid.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
      resizeTo(700);
      expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
      resizeTo(300);
      expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    });

    it('an explicit cols prop wins over the measured width', () => {
      width = 1100;
      const { container } = renderForm({ fields: mk(2), cols: 2 });
      expect(getGridWrapper(container).style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    });

    it('a non-horizontal form is not measured', () => {
      width = 1100;
      const { container } = render(<EntityForm fields={mk(2)} data={{}} onChange={vi.fn()} />);
      const grid = getGridWrapper(container);
      expect(grid.style.gridTemplateColumns).toBe('');
      expect(grid.className).toMatch(/(^|\s)md:grid-cols-3(\s|$)/);
    });
  });

  describe('span clamping', () => {
    it('clamps a span wider than the measured column count', () => {
      width = 700; // 3 columns
      renderForm({ fields: [...mk(1), { key: 'desc', label: 'Desc', type: 'text', column: 'Desc', span: 4 }] });
      const cell = screen.getByTestId('field-desc').closest('.col-span-3');
      expect(cell).not.toBeNull();
      expect(screen.getByTestId('field-desc').closest('.col-span-4')).toBeNull();
    });

    it('keeps a span that fits the measured column count', () => {
      width = 1100; // 4 columns
      renderForm({ fields: [...mk(1), { key: 'desc', label: 'Desc', type: 'text', column: 'Desc', span: 4 }] });
      expect(screen.getByTestId('field-desc').closest('.col-span-4')).not.toBeNull();
    });
  });

  describe('initialRows collapse', () => {
    // 3 columns x 2 rows = 6 visible cells; k5 and k8 are required.
    const nineFields = () => mk(9).map(f => (f.key === 'k5' || f.key === 'k8' ? { ...f, required: true } : f));

    it('shows two rows with required fields first and hides the rest behind the toggle', () => {
      width = 700;
      const { container } = renderForm({ fields: nineFields(), initialRows: 2 });
      expect(renderedKeys(getGridWrapper(container))).toEqual(['k5', 'k8', 'k0', 'k1', 'k2', 'k3']);
      expect(screen.queryByTestId('field-k4')).toBeNull();
      const toggle = screen.getByTestId('form-show-more-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveTextContent('showMoreFormData');
    });

    it('expands with the same order (only appending) and collapses back', () => {
      width = 700;
      const { container } = renderForm({ fields: nineFields(), initialRows: 2 });
      const grid = getGridWrapper(container);
      const collapsed = renderedKeys(grid);

      fireEvent.click(screen.getByTestId('form-show-more-toggle'));
      const expanded = renderedKeys(grid);
      expect(expanded).toEqual(['k5', 'k8', 'k0', 'k1', 'k2', 'k3', 'k4', 'k6', 'k7']);
      expect(expanded.slice(0, collapsed.length)).toEqual(collapsed);
      const toggle = screen.getByTestId('form-show-more-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveTextContent('showLessFormData');

      fireEvent.click(toggle);
      expect(renderedKeys(grid)).toEqual(collapsed);
      expect(screen.getByTestId('form-show-more-toggle')).toHaveAttribute('aria-expanded', 'false');
    });

    it('renders the toggle as the last, full-width cell of the grid', () => {
      width = 700;
      const { container } = renderForm({ fields: nineFields(), initialRows: 2 });
      const grid = getGridWrapper(container);
      const toggleCell = screen.getByTestId('form-show-more-toggle').parentElement;
      expect(grid.lastElementChild).toBe(toggleCell);
      expect(toggleCell.className).toMatch(/(^|\s)col-span-full(\s|$)/);
    });

    it('renders no toggle and keeps the declared order when the fields fit', () => {
      width = 700;
      const fields = mk(6).map(f => (f.key === 'k4' ? { ...f, required: true } : f));
      const { container } = renderForm({ fields, initialRows: 2 });
      expect(renderedKeys(getGridWrapper(container))).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
      expect(screen.queryByTestId('form-show-more-toggle')).toBeNull();
    });

    it('renders no toggle without initialRows, whatever the field count', () => {
      width = 700;
      const { container } = renderForm({ fields: mk(12) });
      expect(renderedKeys(getGridWrapper(container))).toHaveLength(12);
      expect(screen.queryByTestId('form-show-more-toggle')).toBeNull();
    });

    it('renders no toggle before the grid is measured (all fields visible)', () => {
      const { container } = renderForm({ fields: mk(12), initialRows: 2 });
      expect(renderedKeys(getGridWrapper(container))).toHaveLength(12);
      expect(screen.queryByTestId('form-show-more-toggle')).toBeNull();
    });

    it('re-partitions when the column count changes on resize', () => {
      width = 1100; // 4 cols x 2 rows = 8 visible
      const { container } = renderForm({ fields: mk(9), initialRows: 2 });
      const grid = getGridWrapper(container);
      expect(renderedKeys(grid)).toHaveLength(8);
      resizeTo(700); // 3 cols x 2 rows = 6 visible
      expect(renderedKeys(grid)).toHaveLength(6);
    });

    // `trailing` is not one of this form's field rows (tax's TaxSifField is a nested
    // EntityForm): unmounting it while collapsed would drop its fields from validation.
    it('keeps the trailing slot mounted collapsed and expanded, before the toggle', () => {
      width = 700;
      const { container } = renderForm({ fields: nineFields(), initialRows: 2, trailing: <div data-testid="trailing-cell" /> });
      const grid = getGridWrapper(container);
      const trailingCell = screen.getByTestId('trailing-cell');
      expect(screen.getByTestId('form-show-more-toggle')).toHaveAttribute('aria-expanded', 'false');
      expect(trailingCell.nextElementSibling).toBe(grid.lastElementChild);
      fireEvent.click(screen.getByTestId('form-show-more-toggle'));
      expect(screen.getByTestId('trailing-cell')).toBe(trailingCell);
    });

    it('keeps a nested form passed through trailing registered while collapsed', () => {
      width = 700;
      const registerFields = vi.fn();
      const nested = (
        <EntityForm data={{}} onChange={vi.fn()} layout="horizontal" registerFields={registerFields}
          fields={[{ key: 'nestedReq', label: 'Nested', type: 'text', column: 'Nested', required: true }]} />
      );
      renderForm({ fields: nineFields(), initialRows: 2, trailing: nested });
      expect(screen.getByTestId('form-show-more-toggle')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByTestId('field-nestedReq')).toBeInTheDocument();
      const lastCall = registerFields.mock.calls.at(-1);
      expect(lastCall[0]?.map(f => f.key)).toEqual(['nestedReq']);
    });

    it('keeps every field (hidden ones included) registered for validation', () => {
      width = 700;
      const registerFields = vi.fn();
      renderForm({ fields: nineFields(), initialRows: 2, registerFields });
      expect(screen.queryByTestId('field-k7')).toBeNull();
      const lastCall = registerFields.mock.calls.filter(([f]) => f).at(-1);
      expect(lastCall[0].map(f => f.key)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8']);
    });

    describe('read-only forms keep the declared order', () => {
      // k7 and k8 are required: on an editable form they move first.
      const fields = () => mk(9).map(f => (['k7', 'k8'].includes(f.key) ? { ...f, required: true } : f));

      it('moves required fields first on an editable form', () => {
        width = 700;
        const { container } = renderForm({ fields: fields(), initialRows: 2 });
        expect(renderedKeys(getGridWrapper(container))).toEqual(['k7', 'k8', 'k0', 'k1', 'k2', 'k3']);
      });

      it('does not reorder when the whole form is read-only (asterisks hidden)', () => {
        width = 700;
        const { container } = renderForm({ fields: fields(), initialRows: 2, readOnly: true });
        expect(renderedKeys(getGridWrapper(container))).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
      });

      it('does not move a required field that readOnlyLogic locks (completed document)', () => {
        width = 700;
        const locked = fields().map(f => (f.key === 'k8' ? { ...f, readOnlyLogic: (r) => r.processed === true } : f));
        const { container } = render(
          <EntityForm data={{ processed: true }} onChange={vi.fn()} layout="horizontal" fields={locked} initialRows={2} />
        );
        expect(renderedKeys(getGridWrapper(container))).toEqual(['k7', 'k0', 'k1', 'k2', 'k3', 'k4']);
      });
    });

    describe('a hidden field with a validation error', () => {
      // 9 required fields at 3 columns: r6..r8 fall outside the first two rows.
      const required = () => mk(9, { required: true });

      it('expands the block on its own and shows the error', () => {
        width = 700;
        const { rerender } = renderForm({ fields: required(), initialRows: 2 });
        expect(screen.queryByTestId('field-k8')).toBeNull();

        rerender(<EntityForm data={{}} onChange={vi.fn()} layout="horizontal" fields={required()} initialRows={2} fieldErrors={{ k8: 'fieldRequired' }} />);
        expect(screen.getByTestId('field-k8')).toBeInTheDocument();
        expect(screen.getByTestId('error-k8')).toHaveTextContent('fieldRequired');
        expect(screen.getByTestId('form-show-more-toggle')).toHaveAttribute('aria-expanded', 'true');
      });

      it('cannot be collapsed while the error stands', () => {
        width = 700;
        renderForm({ fields: required(), initialRows: 2, fieldErrors: { k8: 'fieldRequired' } });
        const toggle = () => screen.getByTestId('form-show-more-toggle');
        fireEvent.click(toggle());
        expect(screen.getByTestId('field-k8')).toBeInTheDocument();
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(toggle());
        expect(screen.getByTestId('field-k8')).toBeInTheDocument();
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
      });

      // Fixing the field clears its error on change: collapsing then would make the
      // field the user is typing in vanish. The block stays open until the user closes it.
      it('stays expanded once the error is cleared, and the user can then collapse it', () => {
        width = 700;
        const { rerender } = renderForm({ fields: required(), initialRows: 2, fieldErrors: { k8: 'fieldRequired' } });
        expect(screen.getByTestId('field-k8')).toBeInTheDocument();
        rerender(<EntityForm data={{}} onChange={vi.fn()} layout="horizontal" fields={required()} initialRows={2} fieldErrors={{}} />);
        expect(screen.getByTestId('field-k8')).toBeInTheDocument();
        expect(screen.getByTestId('form-show-more-toggle')).toHaveAttribute('aria-expanded', 'true');

        fireEvent.click(screen.getByTestId('form-show-more-toggle'));
        expect(screen.queryByTestId('field-k8')).toBeNull();
        expect(screen.getByTestId('form-show-more-toggle')).toHaveAttribute('aria-expanded', 'false');
      });

      it('does not expand for an error on a field that is already visible', () => {
        width = 700;
        renderForm({ fields: required(), initialRows: 2, fieldErrors: { k0: 'fieldRequired' } });
        expect(screen.getByTestId('error-k0')).toBeInTheDocument();
        expect(screen.queryByTestId('field-k8')).toBeNull();
        expect(screen.getByTestId('form-show-more-toggle')).toHaveAttribute('aria-expanded', 'false');
      });
    });
  });

  it('ships the toggle labels in both locales', () => {
    expect(esES.genericLabels.showMoreFormData).toBe('Mostrar más datos');
    expect(esES.genericLabels.showLessFormData).toBe('Mostrar menos datos');
    expect(enUS.genericLabels.showMoreFormData).toBeTruthy();
    expect(enUS.genericLabels.showLessFormData).toBeTruthy();
  });
});
