import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

import ProductStockDefaultsWatcher from '../ProductStockDefaultsWatcher.jsx';

// ETP-5091 follow-up — this is the only reliable trigger point for forcing
// stocked/returnable to match productType: it is wired as this window's
// `formFooter` (`decisions.json`'s `window.headerExtra.customForm`), which
// DetailView.jsx keeps mounted for the lifetime of the sheet. ETP-5696 reuses it for the
// hidden Sale/Purchase flags, which must always end up saved as true.
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

describe('ProductStockDefaultsWatcher — hidden Sale/Purchase always true (ETP-5696)', () => {
  const base = { id: '1', productType: 'I', name: 'A', sale: false, purchase: false };

  it('does not touch a legacy product that is merely opened', () => {
    const onChange = vi.fn();
    render(<ProductStockDefaultsWatcher data={base} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not react to a change of a field the sheet does not edit (e.g. stock arriving after load)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={base} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ ...base, eTGOStock: 5 }} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forces sale and purchase to true on the first user edit of a legacy product', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={base} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ ...base, name: 'B' }} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith('sale', true);
    expect(onChange).toHaveBeenCalledWith('purchase', true);
  });

  it('only corrects the flag that is not already true', () => {
    const onChange = vi.fn();
    const data = { ...base, sale: true };
    const { rerender } = render(<ProductStockDefaultsWatcher data={data} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ ...data, name: 'B' }} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('purchase', true);
  });

  it('accepts Y / "true" as already true', () => {
    const onChange = vi.fn();
    const data = { ...base, sale: 'Y', purchase: 'true' };
    const { rerender } = render(<ProductStockDefaultsWatcher data={data} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ ...data, name: 'B' }} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves the flags alone when the record does not carry them (new record: field defaults apply)', () => {
    const onChange = vi.fn();
    const data = { id: '1', productType: 'I', name: 'A' };
    const { rerender } = render(<ProductStockDefaultsWatcher data={data} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ ...data, name: 'B' }} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
