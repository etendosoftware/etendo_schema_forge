import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import ProductStockDefaultsWatcher from '../ProductStockDefaultsWatcher.jsx';

// ETP-5091 follow-up — this is the only reliable trigger point for forcing
// stocked/returnable to match productType: it is wired as this window's
// `formFooter` (`decisions.json`'s `window.headerExtra.customForm`), which
// DetailView.jsx keeps mounted (CSS-hidden, never unmounted) regardless of
// which primary tab is active. `ProductAdditionalInfoPanel`, by contrast, only
// mounts while "Información adicional" is active, and `productType` itself
// lives on the General tab — so an effect there can never observe a live
// productType transition (see ProductAdditionalInfoPanel.vitest.jsx).
describe('ProductStockDefaultsWatcher (ETP-5091)', () => {
  it('renders nothing', () => {
    const { container } = render(
      <ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does not call onChange on initial mount', () => {
    const onChange = vi.fn();
    render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([['S'], ['E'], ['R']])(
    'forces stocked/returnable to false when productType changes to %s',
    (nonStockableType) => {
      const onChange = vi.fn();
      const { rerender } = render(
        <ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />,
      );

      rerender(
        <ProductStockDefaultsWatcher data={{ id: '1', productType: nonStockableType }} onChange={onChange} />,
      );

      expect(onChange).toHaveBeenCalledWith('stocked', false);
      expect(onChange).toHaveBeenCalledWith('returnable', false);
    },
  );

  it.each([['S'], ['E'], ['R']])(
    'forces stocked/returnable to true when productType changes from %s back to Artículo',
    (nonStockableType) => {
      const onChange = vi.fn();
      const { rerender } = render(
        <ProductStockDefaultsWatcher data={{ id: '1', productType: nonStockableType }} onChange={onChange} />,
      );

      rerender(
        <ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />,
      );

      expect(onChange).toHaveBeenCalledWith('stocked', true);
      expect(onChange).toHaveBeenCalledWith('returnable', true);
    },
  );

  it('does not call onChange when switching between two non-stockable types (still false either way)', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProductStockDefaultsWatcher data={{ id: '1', productType: 'E' }} onChange={onChange} />,
    );

    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'S' }} onChange={onChange} />);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when productType is unchanged', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />,
    );

    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);

    expect(onChange).not.toHaveBeenCalled();
  });

  // Guard against a false-positive "transition" when the loaded RECORD changes
  // (e.g. navigating from one product straight to another) rather than the
  // same record's own productType actually changing mid-edit.
  it('does not call onChange when a different record loads with a different productType', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />,
    );

    rerender(<ProductStockDefaultsWatcher data={{ id: '2', productType: 'E' }} onChange={onChange} />);

    expect(onChange).not.toHaveBeenCalled();
  });
});
