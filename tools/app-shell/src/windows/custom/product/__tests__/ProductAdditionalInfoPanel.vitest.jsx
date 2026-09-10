import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── mock heavy children so we exercise ProductAdditionalInfoPanel's own logic ──
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => () => null,
}));

// EntityForm stub renders the field keys it receives, so we can assert which
// groups are mounted without pulling in the real selector/combobox machinery.
// Same convention as AssetsDetailPanel.vitest.jsx.
vi.mock('@/components/contract-ui', () => ({
  EntityForm: ({ fields }) => (
    <div data-testid="entity-form" data-fields={(fields || []).map(f => f.key).join(',')} />
  ),
}));

import ProductAdditionalInfoPanel from '../ProductAdditionalInfoPanel.jsx';

const BASE_PROPS = {
  entity: 'product',
  token: 'tok',
  apiBaseUrl: '/api/product',
  catalogs: {},
  api: {},
  editing: true,
  onChange: vi.fn(),
};

// ETP-4943 / ETP-5091 — Service, Expense ("Gasto") and Resource ("Recurso")
// products have no physical existence: the Logistics section (weight, UOM for
// weight, "Almacenable"/Returnable) does not apply to them and must be
// hidden, and both stock-management flags must be forced to false so none of
// them can ever be saved as stocked/returnable. Mirrors the precedent already
// established for the stock sidebar (`ProductSidebar.jsx`, ETP-4606 /
// ETP-5091: `['S', 'E', 'R'].includes(data?.productType)` → no stock UI at all).
describe.each([
  ['Service', 'S'],
  ['Expense', 'E'],
  ['Resource', 'R'],
])('ProductAdditionalInfoPanel — Logistics section for %s-type products (ETP-4943 / ETP-5091)', (_label, productType) => {
  it(`hides the Logistics section when productType is ${productType}`, () => {
    render(<ProductAdditionalInfoPanel {...BASE_PROPS} data={{ productType }} />);
    expect(screen.queryByText('logistics')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-stocked')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-returnable')).not.toBeInTheDocument();
  });

  it(`forces stocked/returnable to false as soon as the type is ${productType}`, () => {
    const onChange = vi.fn();
    render(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ productType, stocked: true, returnable: true }}
      />,
    );
    expect(onChange).toHaveBeenCalledWith('stocked', false, 'IsStocked');
    expect(onChange).toHaveBeenCalledWith('returnable', false, 'Returnable');
  });

  it(`does not call onChange when the flags are already false for a ${productType}-type product`, () => {
    const onChange = vi.fn();
    render(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ productType, stocked: false, returnable: false }}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not force the flags while in read-only (view) mode', () => {
    const onChange = vi.fn();
    render(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        editing={false}
        onChange={onChange}
        data={{ productType, stocked: true, returnable: true }}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the section again with its own values when the type switches back to Article', () => {
    const { rerender } = render(
      <ProductAdditionalInfoPanel {...BASE_PROPS} data={{ productType }} />,
    );
    expect(screen.queryByTestId('field-stocked')).not.toBeInTheDocument();

    rerender(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        data={{ productType: 'I', stocked: true, returnable: false }}
      />,
    );
    expect(screen.getByTestId('field-stocked')).toBeInTheDocument();
    expect(screen.getByTestId('field-stocked')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('field-returnable')).toHaveAttribute('aria-checked', 'false');
  });

  // ETP-5091 follow-up: the ticket's own expected behavior requires the flags to reset to
  // their default (true) on this transition, not just "whatever the record happened to have
  // left over from being forced false" — reproduced live: creating/editing a product, setting
  // it to a non-stockable type (which force-clears the flags) and then back to Artículo left
  // Almacenable/Retornable unchecked instead of restoring them.
  it(`restores stocked/returnable to true when switching back to Article from ${productType}`, () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ productType, stocked: false, returnable: false }}
      />,
    );

    rerender(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ productType: 'I', stocked: false, returnable: false }}
      />,
    );

    expect(onChange).toHaveBeenCalledWith('stocked', true, 'IsStocked');
    expect(onChange).toHaveBeenCalledWith('returnable', true, 'Returnable');
  });
});

describe('ProductAdditionalInfoPanel — Logistics section stays visible for stockable types', () => {
  it('keeps the Logistics section visible for a stockable type (Article)', () => {
    render(<ProductAdditionalInfoPanel {...BASE_PROPS} data={{ productType: 'I' }} />);
    expect(screen.getByText('logistics')).toBeInTheDocument();
    expect(screen.getByTestId('field-stocked')).toBeInTheDocument();
    expect(screen.getByTestId('field-returnable')).toBeInTheDocument();
  });

  // Guard against the reset effect fighting a deliberate user edit: it must only fire on the
  // non-stockable → stockable transition itself, not on every render while already stockable.
  it('does not re-force stocked back to true after the user manually unchecks it while staying Article', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ productType: 'I', stocked: true, returnable: true }}
      />,
    );

    rerender(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ productType: 'I', stocked: false, returnable: true }}
      />,
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});
