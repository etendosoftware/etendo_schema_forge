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

// ETP-4943 — a Service product has no physical existence: the Logistics section
// (weight, UOM for weight, "Almacenable"/Returnable) does not apply to it and must
// be hidden, and both stock-management flags must be forced to false so a Service
// product can never be saved as stocked/returnable. Mirrors the precedent already
// established for the stock sidebar (`ProductSidebar.jsx`, ETP-4606:
// `if (data?.productType === 'S') return null`).
describe('ProductAdditionalInfoPanel — Logistics section for Service-type products (ETP-4943)', () => {
  it('hides the Logistics section when productType is Service', () => {
    render(<ProductAdditionalInfoPanel {...BASE_PROPS} data={{ productType: 'S' }} />);
    expect(screen.queryByText('logistics')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-stocked')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-returnable')).not.toBeInTheDocument();
  });

  it('keeps the Logistics section visible for a stockable type (Article)', () => {
    render(<ProductAdditionalInfoPanel {...BASE_PROPS} data={{ productType: 'I' }} />);
    expect(screen.getByText('logistics')).toBeInTheDocument();
    expect(screen.getByTestId('field-stocked')).toBeInTheDocument();
    expect(screen.getByTestId('field-returnable')).toBeInTheDocument();
  });

  it('forces stocked/returnable to false as soon as the type is Service', () => {
    const onChange = vi.fn();
    render(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ productType: 'S', stocked: true, returnable: true }}
      />,
    );
    expect(onChange).toHaveBeenCalledWith('stocked', false, 'IsStocked');
    expect(onChange).toHaveBeenCalledWith('returnable', false, 'Returnable');
  });

  it('does not call onChange when the flags are already false for a Service product', () => {
    const onChange = vi.fn();
    render(
      <ProductAdditionalInfoPanel
        {...BASE_PROPS}
        onChange={onChange}
        data={{ productType: 'S', stocked: false, returnable: false }}
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
        data={{ productType: 'S', stocked: true, returnable: true }}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the section again with its own values when the type switches back to Article', () => {
    const { rerender } = render(
      <ProductAdditionalInfoPanel {...BASE_PROPS} data={{ productType: 'S' }} />,
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
});
