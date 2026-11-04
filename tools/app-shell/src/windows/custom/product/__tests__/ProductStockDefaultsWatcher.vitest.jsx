// @covers tools/app-shell/src/windows/custom/product/ProductStockDefaultsWatcher.jsx
// @covers tools/app-shell/src/components/contract-ui/saveActions.jsx
// @covers tools/app-shell/src/lib/formPendingWork.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import ProductStockDefaultsWatcher, { TAX_CATEGORY_LOOKUP_TIMEOUT_MS } from '../ProductStockDefaultsWatcher.jsx';
import { renderSaveActions } from '@/components/contract-ui/saveActions.jsx';
import { getPendingCount } from '@/lib/formPendingWork.js';

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
    expect(apiFetchMock).toHaveBeenCalledWith('/product/defaults?productType=S', { timeout: TAX_CATEGORY_LOOKUP_TIMEOUT_MS });
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
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/product/defaults?productType=I', { timeout: TAX_CATEGORY_LOOKUP_TIMEOUT_MS }));
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

// ETP-5680 follow-up — Save is gated while the defaults request is in flight. The scope is
// `onLocalChange` (the form instance's `hook.handleChange`).
describe('ProductStockDefaultsWatcher — pending recalculation gates Save (ETP-5680)', () => {
  beforeEach(() => { apiFetchMock.mockReset(); });

  const scopeOf = () => () => {};
  const mountWatcher = (data, scope, onChange = vi.fn()) => {
    const ui = (props) => <ProductStockDefaultsWatcher data={props.data} onChange={onChange} onLocalChange={scope} />;
    const view = render(ui({ data }));
    return { onChange, rerenderWith: (next) => view.rerender(ui({ data: next })), unmount: view.unmount };
  };
  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  };
  const reply = (id, label) => defaultsResponse({ typeTaxCategory: id, 'typeTaxCategory$_identifier': label });

  it('registers synchronously on a type change, before the reply, and releases when it arrives', async () => {
    const scope = scopeOf();
    const pending = deferred();
    apiFetchMock.mockReturnValueOnce(pending.promise);
    const { rerenderWith } = mountWatcher({ id: '1', productType: 'I' }, scope);
    expect(getPendingCount(scope)).toBe(0);

    rerenderWith({ id: '1', productType: 'S' });
    expect(getPendingCount(scope)).toBe(1);

    await act(async () => { pending.resolve(reply('tax-serv', 'IVA Normal Servicios')); await flush(); });
    expect(getPendingCount(scope)).toBe(0);
  });

  it('does not register on load nor on an unrelated field change', () => {
    const scope = scopeOf();
    const { rerenderWith } = mountWatcher({ id: '1', productType: 'I', name: 'A' }, scope);
    rerenderWith({ id: '1', productType: 'I', name: 'B' });
    expect(getPendingCount(scope)).toBe(0);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('releases when the request fails, when the answer has no category, and when it is not ok', async () => {
    for (const outcome of [
      () => Promise.reject(new Error('network')),
      () => Promise.resolve(defaultsResponse({ taxCategory: 'is-default' })),
      () => Promise.resolve({ ok: false, json: async () => ({}) }),
    ]) {
      apiFetchMock.mockReset();
      apiFetchMock.mockImplementationOnce(outcome);
      const scope = scopeOf();
      const { rerenderWith, unmount } = mountWatcher({ id: '1', productType: 'I' }, scope);
      rerenderWith({ id: '1', productType: 'S' });
      expect(getPendingCount(scope)).toBe(1);
      await act(async () => { await flush(); });
      expect(getPendingCount(scope)).toBe(0);
      unmount();
    }
  });

  it('a second type change while the first is in flight keeps it pending until BOTH requests settle', async () => {
    const scope = scopeOf();
    const first = deferred();
    const second = deferred();
    apiFetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { onChange, rerenderWith } = mountWatcher({ id: '1', productType: 'I' }, scope);
    rerenderWith({ id: '1', productType: 'S' });
    rerenderWith({ id: '1', productType: 'I' });
    expect(getPendingCount(scope)).toBe(2);

    // The stale (first) reply is dropped but the form is still waiting for the second one.
    await act(async () => { first.resolve(reply('tax-serv', 'IVA Normal Servicios')); await flush(); });
    expect(getPendingCount(scope)).toBe(1);
    expect(onChange).not.toHaveBeenCalledWith('taxCategory', 'tax-serv');

    await act(async () => { second.resolve(reply('tax-goods', 'IVA Normal')); await flush(); });
    expect(getPendingCount(scope)).toBe(0);
    expect(onChange).toHaveBeenCalledWith('taxCategory', 'tax-goods');
  });

  it('a record switch releases the pending count at once, without waiting for the late reply', async () => {
    const scope = scopeOf();
    const pending = deferred();
    apiFetchMock.mockReturnValueOnce(pending.promise);
    const { onChange, rerenderWith } = mountWatcher({ id: '1', productType: 'I' }, scope);
    rerenderWith({ id: '1', productType: 'S' });
    expect(getPendingCount(scope)).toBe(1);

    rerenderWith({ id: '2', productType: 'I', taxCategory: 'exento' });
    expect(getPendingCount(scope)).toBe(0);

    await act(async () => { pending.resolve(reply('tax-serv', 'IVA Normal Servicios')); await flush(); });
    expect(getPendingCount(scope)).toBe(0);
    expect(onChange).not.toHaveBeenCalledWith('taxCategory', 'tax-serv');
  });

  it('unmounting releases the pending count', () => {
    const scope = scopeOf();
    apiFetchMock.mockReturnValueOnce(new Promise(() => {}));
    const { rerenderWith, unmount } = mountWatcher({ id: '1', productType: 'I' }, scope);
    rerenderWith({ id: '1', productType: 'S' });
    expect(getPendingCount(scope)).toBe(1);
    unmount();
    expect(getPendingCount(scope)).toBe(0);
  });

  // W1: a hung lookup must not hold Save for apiFetch's 60 s default; the request carries a short
  // explicit timeout, and its NetworkError rejection goes through the same catch/finally.
  it('issues the defaults request with the explicit, short timeout', () => {
    expect(TAX_CATEGORY_LOOKUP_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    expect(TAX_CATEGORY_LOOKUP_TIMEOUT_MS).toBeLessThan(60000);
    const scope = scopeOf();
    apiFetchMock.mockReturnValueOnce(new Promise(() => {}));
    const { rerenderWith } = mountWatcher({ id: '1', productType: 'I' }, scope);
    rerenderWith({ id: '1', productType: 'S' });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/product/defaults?productType=S',
      expect.objectContaining({ timeout: TAX_CATEGORY_LOOKUP_TIMEOUT_MS }),
    );
  });

  it('a timeout (NetworkError) releases Save and leaves the tax category untouched', async () => {
    const scope = scopeOf();
    const timeoutError = Object.assign(new Error('timeout'), { name: 'NetworkError', reason: 'timeout' });
    apiFetchMock.mockRejectedValueOnce(timeoutError);
    const { onChange, rerenderWith } = mountWatcher({ id: '1', productType: 'I' }, scope);
    rerenderWith({ id: '1', productType: 'S' });
    expect(getPendingCount(scope)).toBe(1);
    await act(async () => { await flush(); });
    expect(getPendingCount(scope)).toBe(0);
    expect(onChange).not.toHaveBeenCalledWith('taxCategory', expect.anything());
  });

  // The end-to-end behaviour QA reported: a form whose `handleSave` is closed over the current
  // data (like `performSave` over `editing`). Save is disabled until the reply, and the click
  // after it sends the Services category.
  describe('in a form with a Save button', () => {
    function Form({ saved, scope }) {
      const [data, setData] = useState({ id: undefined, productType: 'I', taxCategory: 'tax-goods' });
      const onChange = (key, value) => setData((prev) => ({ ...prev, [key]: value }));
      const params = {
        hook: {
          isSaving: false, children: [], handleChange: scope, primeSaved: vi.fn(),
          handleSave: vi.fn(async (body) => { saved.push(body); return { id: 'new-1' }; }),
        },
        isDirty: true, isNew: true, isDocumentReadOnly: false, isProcessed: false,
        flushPendingLines: async () => true, data, navigate: vi.fn(), windowName: 'product',
        ui: (k) => k, tMenu: (k) => k, token: 't', apiBaseUrl: '/api', saveBtnCls: '',
        draftMode: null, blockSaveForBalance: false, saveGate: {},
      };
      return (
        <>
          <ProductStockDefaultsWatcher data={data} onChange={onChange} onLocalChange={scope} />
          <button type="button" data-testid="pick-service" onClick={() => onChange('productType', 'S')} />
          <button type="button" data-testid="rename" onClick={() => onChange('name', 'x')} />
          {renderSaveActions(params)}
        </>
      );
    }

    it('keeps Save disabled until the reply arrives, then saves the Services category', async () => {
      const scope = scopeOf();
      const saved = [];
      const pending = deferred();
      apiFetchMock.mockReturnValueOnce(pending.promise);
      render(<Form saved={saved} scope={scope} />);
      expect(screen.getByTestId('action-save')).not.toBeDisabled();

      fireEvent.click(screen.getByTestId('pick-service'));
      expect(screen.getByTestId('action-save')).toBeDisabled();
      expect(screen.getByTestId('action-save')).toHaveAttribute('title', 'saveCalculating');
      expect(screen.getByTestId('Loader2__fa3275')).toBeInTheDocument();

      await act(async () => { pending.resolve(reply('tax-serv', 'IVA Normal Servicios')); await flush(); });
      await waitFor(() => expect(screen.getByTestId('action-save')).not.toBeDisabled());

      fireEvent.click(screen.getByTestId('action-save'));
      await waitFor(() => expect(saved).toHaveLength(1));
      expect(saved[0].productType).toBe('S');
      expect(saved[0].taxCategory).toBe('tax-serv');
    });

    it('re-enables Save with the old category when the request fails', async () => {
      const scope = scopeOf();
      apiFetchMock.mockRejectedValueOnce(new Error('network'));
      render(<Form saved={[]} scope={scope} />);
      fireEvent.click(screen.getByTestId('pick-service'));
      expect(screen.getByTestId('action-save')).toBeDisabled();
      await waitFor(() => expect(screen.getByTestId('action-save')).not.toBeDisabled());
    });

    it('does not gate Save on an unrelated field change', () => {
      const scope = scopeOf();
      render(<Form saved={[]} scope={scope} />);
      fireEvent.click(screen.getByTestId('rename'));
      expect(screen.getByTestId('action-save')).not.toBeDisabled();
      expect(screen.queryByTestId('Loader2__fa3275')).not.toBeInTheDocument();
    });
  });
});
