// @covers tools/app-shell/src/windows/custom/product/ProductStockDefaultsWatcher.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

import ProductStockDefaultsWatcher from '../ProductStockDefaultsWatcher.jsx';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));

const defaultsResponse = (defaults) => ({ ok: true, json: async () => ({ defaults }) });

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


// Lets every pending promise continuation (fetch -> res.json() -> onChange) run.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ProductStockDefaultsWatcher — tax category follows product type (ETP-5680)', () => {
  const typeDefaults = (id, label) => defaultsResponse({
    taxCategory: 'is-default', typeTaxCategory: id, 'typeTaxCategory$_identifier': label,
  });

  beforeEach(() => { apiFetchMock.mockReset(); });

  const taxCalls = (onChange) => onChange.mock.calls.filter(([k]) => k.startsWith('taxCategory'));

  it('does not fetch nor touch the tax category when an existing product is merely opened', () => {
    const onChange = vi.fn();
    render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I', taxCategory: 'exento' }} onChange={onChange} />);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(taxCalls(onChange)).toHaveLength(0);
  });

  it('does not fetch when a different record loads (even with another type) or data merely refreshes', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '2', productType: 'S' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '2', productType: 'S', eTGOStock: 3 }} onChange={onChange} />);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('sets the services tax category when a saved product changes to Service', async () => {
    apiFetchMock.mockResolvedValue(typeDefaults('tax-serv', 'IVA Normal Servicios'));
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I', taxCategory: 'exento' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'S', taxCategory: 'exento' }} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('taxCategory', 'tax-serv'));
    expect(onChange).toHaveBeenCalledWith('taxCategory$_identifier', 'IVA Normal Servicios');
    expect(apiFetchMock).toHaveBeenCalledWith('/product/defaults?productType=S');
  });

  it('on a new record (no id) the first type pick resolves the category', async () => {
    apiFetchMock.mockResolvedValue(typeDefaults('tax-goods', 'IVA Normal'));
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={{}} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ productType: 'I' }} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('taxCategory', 'tax-goods'));
  });

  it('leaves the field untouched when the tenant has no category for the type', async () => {
    apiFetchMock.mockResolvedValue(defaultsResponse({ taxCategory: 'is-default' }));
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'S' }} onChange={onChange} />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await flush();
    expect(taxCalls(onChange)).toHaveLength(0);
  });

  it('leaves the field untouched when the request fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('network'));
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'S' }} onChange={onChange} />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await flush();
    expect(taxCalls(onChange)).toHaveLength(0);
  });

  it('a manual override is overwritten by the next type change; repeated changes apply the latest only', async () => {
    apiFetchMock.mockImplementation(async (url) => (url.endsWith('=S')
      ? typeDefaults('tax-serv', 'IVA Normal Servicios')
      : typeDefaults('tax-goods', 'IVA Normal')));
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'S', taxCategory: 'manual' }} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('taxCategory', 'tax-serv'));
    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I', taxCategory: 'manual' }} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('taxCategory', 'tax-goods'));
  });

  it('drops a stale response when the type changed again before it arrived', async () => {
    let resolveFirst;
    apiFetchMock
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(typeDefaults('tax-goods', 'IVA Normal'));
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'S' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('taxCategory', 'tax-goods'));
    resolveFirst(typeDefaults('tax-serv', 'IVA Normal Servicios'));
    await flush();
    expect(onChange).not.toHaveBeenCalledWith('taxCategory', 'tax-serv');
  });

  it('full new-form sequence: initial defaults, then Service, then back to Item (final value follows the type)', async () => {
    apiFetchMock.mockImplementation(async (url) => (url.endsWith('=S')
      ? typeDefaults('tax-serv', 'IVA Normal Servicios')
      : typeDefaults('tax-goods', 'IVA Normal')));
    const onChange = vi.fn();
    // New form: empty record, then the initial /defaults arrive (type Item, backend-resolved category).
    const { rerender } = render(<ProductStockDefaultsWatcher data={{}} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ productType: 'I', taxCategory: 'tax-goods' }} onChange={onChange} />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/product/defaults?productType=I'));
    rerender(<ProductStockDefaultsWatcher data={{ productType: 'S', taxCategory: 'tax-goods' }} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('taxCategory$_identifier', 'IVA Normal Servicios'));
    rerender(<ProductStockDefaultsWatcher data={{ productType: 'I', taxCategory: 'tax-serv' }} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('taxCategory$_identifier', 'IVA Normal'));
    const ids = onChange.mock.calls.filter(([k]) => k === 'taxCategory').map(([, v]) => v);
    expect(ids.at(-1)).toBe('tax-goods');
    expect(ids).toContain('tax-serv');
  });

  it('drops a pending reply when another record loads before it arrives (never touches the loaded record)', async () => {
    let resolvePending;
    apiFetchMock.mockImplementationOnce(() => new Promise((r) => { resolvePending = r; }));
    const onChange = vi.fn();
    const { rerender } = render(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'I' }} onChange={onChange} />);
    rerender(<ProductStockDefaultsWatcher data={{ id: '1', productType: 'S' }} onChange={onChange} />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    rerender(<ProductStockDefaultsWatcher data={{ id: '2', productType: 'I', taxCategory: 'exento' }} onChange={onChange} />);
    resolvePending(typeDefaults('tax-serv', 'IVA Normal Servicios'));
    await flush();
    expect(taxCalls(onChange)).toHaveLength(0);
  });
});
