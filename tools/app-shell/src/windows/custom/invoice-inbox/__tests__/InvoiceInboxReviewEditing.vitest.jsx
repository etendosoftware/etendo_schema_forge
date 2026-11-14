// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewDrawer.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewInputs.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewSaveStatus.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewPickers.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewLines.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewVendor.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewFooter.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewForm.jsx
// New file justification: InvoiceInboxReviewDrawer.vitest.jsx is the read-side suite of the panel
// (732 lines: shell, banners, rendering of every state); this file holds the write flows of S2
// (autosave, line operations, vendor / product resolution, mark reviewed, flush on close / nav),
// which need a stateful fake of the `apply` action that the read suite has no use for.
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const labels = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
const L = (key, params = {}) => String(labels[key] ?? key).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, k) => params[k] ?? '');

vi.mock('@/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useUI: () => (key, params) => globalThis.__L(key, params),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));
globalThis.__L = L;
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useCurrencyPrecision.js', () => ({ useCurrencyPrecision: () => 2 }));
const mockPickerFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockPickerFetch }));
vi.mock('../InvoiceInboxReviewViewer.jsx', () => ({ default: () => <div data-testid="viewer-stub" /> }));

import InvoiceInboxReviewDrawer from '../InvoiceInboxReviewDrawer.jsx';
import { AUTOSAVE_DEBOUNCE_MS } from '../InvoiceInboxReviewInputs.jsx';
import { STACKED_BELOW_PX } from '../InvoiceInboxReviewLines.jsx';
import { applyOperationLocally, MAX_LINES } from '../invoiceInboxReviewModel.js';
import { formatCurrency } from '@/lib/formatCurrency.js';

const M = (value) => formatCurrency('EUR', value).replace(/\s+/g, ' ');
const tid = (id) => screen.getByTestId(id);
const maybe = (id) => screen.queryByTestId(id);

const line = (over = {}) => ({
  index: 0, description: 'Widget', quantity: 2, unitPrice: 50, taxRate: 21,
  product: { state: 'linked', matchedBy: 'exact', id: 'P0', details: { name: 'Widget A', searchKey: 'W-1' } },
  ...over,
});

function makeReview(over = {}, doc = {}) {
  const { header: headerOver, ...docRest } = doc;
  return {
    id: 'D1', status: 'PENDING_REVIEW', errorCode: null, reviewed: false, adjusted: false, editable: true, updated: 'T0',
    fileName: 'factura.pdf', sender: 'ana@proveedor.com', source: 'EMAIL', created: '2026-08-10T09:30:00Z',
    invoice: null, currency: { id: 'EUR1', isoCode: 'EUR', symbol: '€' },
    document: {
      header: {
        vendor: { state: 'linked', matchedBy: 'taxId', id: 'V0', details: { name: 'ACME SL', taxId: 'B1234', city: 'Madrid' }, candidates: [], extracted: {} },
        documentNo: 'F-100', invoiceDate: '2026-08-01', totalAmount: 121, totalSource: 'lines',
        duplicate: { state: 'none', invoices: [], inbox: [] },
        ...headerOver,
      },
      lines: [line()],
      validation: { missing: [] },
      ...docRest,
    },
    ...over,
  };
}

const ambiguousVendor = () => makeReview({}, {
  header: {
    vendor: {
      state: 'ambiguous', extracted: { name: 'Uno SL', taxId: 'A1' },
      candidates: [{ id: 'c0', name: 'Uno SA', taxId: 'A1', city: 'X' }, { id: 'c1', name: 'Uno SL', taxId: 'A2', city: 'Y' }],
    },
  },
  validation: { missing: ['vendor'] },
});

/** What the fake server does with the `apply` / `mark-reviewed` posts and the reads. */
let state;
let posts;
let respond;
let tokenCount;
/** Names the fake server resolves for picked category / unit ids. */
let catalog;
/** While set, every write waits for `release()` (a write "in flight"). */
let gate;
function holdWrites() {
  let release;
  gate = new Promise((resolve) => { release = resolve; });
  return () => { gate = null; release(); };
}
function hintFor(document, op) {
  if (op.op === 'selectVendor') {
    const c = (document.header.vendor.candidates ?? []).find((item) => item.id === op.id);
    return c ? { name: c.name, taxId: c.taxId, city: c.city } : {};
  }
  if (op.op === 'selectProduct') {
    const l = document.lines.find((item, i) => (item.index ?? i) === op.index);
    const c = (l?.product?.candidates ?? []).find((item) => item.id === op.id);
    return c ? { name: c.name, searchKey: c.searchKey } : {};
  }
  if (op.op === 'newProduct') return { category: catalog[op.categoryId], uom: catalog[op.uomId] };
  return {};
}
const nav = (over = {}) => ({
  position: 2, total: 5, canPrev: true, canNext: true, advancing: false,
  goPrev: vi.fn(), goNext: vi.fn(), restoreFocus: vi.fn(), ...over,
});
const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const refusal = (status, error) => jsonRes(status, { error: { status, ...error } });

const apiFetch = vi.fn(async (url, options) => {
  if (options?.method === 'POST') {
    const body = JSON.parse(options.body);
    posts.push({ url, body });
    if (gate) await gate;
    const custom = respond?.(url, body);
    if (custom !== undefined) return custom;
    if (url.endsWith('/action/apply')) {
      let document = state.document;
      for (const op of body.operations) document = applyOperationLocally(document, op, hintFor(document, op));
      tokenCount += 1;
      state = { ...state, document, updated: `T${tokenCount}`, adjusted: true };
      return jsonRes(200, state);
    }
    tokenCount += 1;
    state = { ...state, status: 'READY', reviewed: true, updated: `T${tokenCount}` };
    return jsonRes(200, state);
  }
  return jsonRes(200, state);
});

function mount(review = makeReview(), props = {}) {
  state = review;
  const handlers = { onClose: vi.fn(), onDiscard: vi.fn() };
  const navigation = nav(props.nav);
  const utils = render(
    <InvoiceInboxReviewDrawer
      id="D1" row={{ id: 'D1', fileName: 'factura.pdf', status: 'PENDING_REVIEW' }}
      apiFetch={apiFetch} apiBaseUrl="/sws/neo/invoice-inbox" {...handlers} {...props} nav={navigation} />,
  );
  return { ...utils, ...handlers, nav: navigation };
}
async function mountLoaded(review, props) {
  const out = mount(review, props);
  await screen.findByTestId('invoice-inbox-review-form');
  return out;
}

/** Types into an autosaving input the way a user does and leaves it (blur commits). */
function typeAndBlur(testId, text) {
  const input = tid(testId);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
}
const editOps = () => posts.filter((p) => p.url.endsWith('/action/apply')).flatMap((p) => p.body.operations);
const saveState = () => tid('invoice-inbox-review-save-state');

function pickerItems(items) {
  mockPickerFetch.mockImplementation(async () => jsonRes(200, { items, hasMore: false }));
}

beforeEach(() => {
  posts = []; respond = undefined; tokenCount = 0; gate = null; catalog = {};
  apiFetch.mockClear();
  mockPickerFetch.mockReset();
  pickerItems([]);
});

describe('editing — autosave inputs', () => {
  it('a blur sends ONE apply with the last token and shows Guardando then Guardado in the live region', async () => {
    await mountLoaded();
    expect(maybe('invoice-inbox-review-save-state')).toBeNull();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '3');
    expect(saveState()).toHaveAttribute('data-state', 'saving');
    expect(saveState()).toHaveTextContent(L('invoiceInboxSaveSaving'));
    expect(saveState().closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'saved'));
    expect(saveState()).toHaveTextContent(L('invoiceInboxSaveSaved'));
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('/header/D1/action/apply');
    expect(posts[0].body).toEqual({ updated: 'T0', operations: [{ op: 'setLine', index: 0, quantity: 3 }] });
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(M(150));
  });

  it('typing waits 700 ms before saving; a later blur with nothing new sends nothing more', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await mountLoaded();
      expect(AUTOSAVE_DEBOUNCE_MS).toBe(700);
      const price = tid('invoice-inbox-review-line-0-price');
      fireEvent.focus(price);
      fireEvent.change(price, { target: { value: '10,5' } });
      await act(async () => { vi.advanceTimersByTime(699); });
      expect(posts).toHaveLength(0);
      await act(async () => { vi.advanceTimersByTime(5); });
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(editOps()).toEqual([{ op: 'setLine', index: 0, unitPrice: 10.5 }]);
      fireEvent.blur(price);
      await act(async () => { vi.advanceTimersByTime(2500); });
      expect(posts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('typing again restarts the debounce (only the final text is sent)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await mountLoaded();
      const desc = tid('invoice-inbox-review-line-0-description');
      fireEvent.focus(desc);
      fireEvent.change(desc, { target: { value: 'Ab' } });
      await act(async () => { vi.advanceTimersByTime(500); });
      fireEvent.change(desc, { target: { value: 'Abc' } });
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(posts).toHaveLength(0);
      await act(async () => { vi.advanceTimersByTime(300); });
      await waitFor(() => expect(posts).toHaveLength(1));
      expect(editOps()).toEqual([{ op: 'setLine', index: 0, description: 'Abc' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Enter commits at once, without waiting for the debounce', async () => {
    await mountLoaded();
    const no = tid('invoice-inbox-review-invoice-no');
    fireEvent.focus(no);
    fireEvent.change(no, { target: { value: 'F-200' } });
    fireEvent.keyDown(no, { key: 'Enter' });
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(editOps()).toEqual([{ op: 'setHeader', documentNo: 'F-200' }]);
  });

  it('a blur without any change writes nothing', async () => {
    await mountLoaded();
    for (const id of ['invoice-inbox-review-invoice-no', 'invoice-inbox-review-line-0-quantity', 'invoice-inbox-review-line-0-discount']) {
      fireEvent.focus(tid(id));
      fireEvent.blur(tid(id));
    }
    await act(async () => { await Promise.resolve(); });
    expect(posts).toHaveLength(0);
    expect(maybe('invoice-inbox-review-save-state')).toBeNull();
  });

  it('a typed value equal to the committed one (other format) writes nothing', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '2,0');
    await act(async () => { await Promise.resolve(); });
    expect(posts).toHaveLength(0);
  });

  it('an invalid number is never sent, marks the input invalid while open and reverts on blur', async () => {
    await mountLoaded();
    const qty = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(qty);
    fireEvent.change(qty, { target: { value: '12a' } });
    fireEvent.keyDown(qty, { key: 'Enter' });
    expect(qty).toHaveAttribute('aria-invalid', 'true');
    fireEvent.blur(qty);
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveValue('2');
    expect(tid('invoice-inbox-review-line-0-quantity')).not.toHaveAttribute('aria-invalid');
    expect(posts).toHaveLength(0);
  });

  it('an empty quantity (required) is rejected; an empty discount is "no discount" and is only sent when there was one', async () => {
    await mountLoaded(makeReview({}, { lines: [line({ discount: 10 })] }));
    typeAndBlur('invoice-inbox-review-line-0-quantity', '');
    expect(posts).toHaveLength(0);
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveValue('2');
    typeAndBlur('invoice-inbox-review-line-0-discount', '');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(editOps()).toEqual([{ op: 'setLine', index: 0, discount: null }]);
  });

  it('the tax rate accepts a comma decimal and is rounded to two decimals', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-tax', '10,555');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(editOps()).toEqual([{ op: 'setLine', index: 0, taxRate: 10.56 }]);
  });
});

describe('editing — line discount', () => {
  it('under a comma locale "10,5" is accepted and shown as 10,5 %; "1.000,50" and 150 are rejected', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-discount', '1.000,50');
    typeAndBlur('invoice-inbox-review-line-0-discount', '150');
    typeAndBlur('invoice-inbox-review-line-0-discount', '-5');
    expect(posts).toHaveLength(0);
    typeAndBlur('invoice-inbox-review-line-0-discount', '10,5');
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(editOps()).toEqual([{ op: 'setLine', index: 0, discount: 10.5 }]);
    await waitFor(() => expect(tid('invoice-inbox-review-line-0-discount')).toHaveValue('10,5%'));
  });

  it('the amount and the totals follow the discount (2 x 50 less 10 % = 90)', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-discount', '10');
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(M(90));
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'saved'));
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(M(90));
    expect(tid('invoice-inbox-review-totals')).toHaveTextContent(M(90));
  });

  it('a zero discount on a line with none writes nothing; clearing a stored discount sends null', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-discount', '0');
    await act(async () => { await Promise.resolve(); });
    expect(posts).toHaveLength(0);
  });
});

describe('editing — save errors', () => {
  it('422 rolls the value back, shows the reason (never the backend text) and Reintentar re-reads', async () => {
    respond = () => refusal(422, { code: 'invalid_value', field: 'quantity', index: 0, message: 'SQL boom' });
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '9');
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'error'));
    expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L('invoiceInboxSaveErrorInvalidValue'));
    expect(screen.queryByText(/SQL boom/)).toBeNull();
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveValue('2');
    const reads = apiFetch.mock.calls.filter(([, o]) => !o?.method).length;
    fireEvent.click(tid('invoice-inbox-review-save-retry'));
    await waitFor(() => expect(apiFetch.mock.calls.filter(([, o]) => !o?.method).length).toBe(reads + 1));
    await waitFor(() => expect(maybe('invoice-inbox-review-save-state')).toBeNull());
  });

  it('409 stale_document reloads the document, drops the unsaved edit and shows a dismissible notice', async () => {
    respond = () => refusal(409, { code: 'stale_document' });
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '9');
    expect(await screen.findByTestId('invoice-inbox-review-notice')).toHaveTextContent(L('invoiceInboxSaveErrorStale'));
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveValue('2');
    expect(maybe('invoice-inbox-review-save-state')).toBeNull();
    fireEvent.click(tid('invoice-inbox-review-notice-dismiss'));
    expect(maybe('invoice-inbox-review-notice')).toBeNull();
  });

  it('409 not_editable reloads and now shows the document read-only', async () => {
    respond = () => refusal(409, { code: 'not_editable', documentStatus: 'CONFIRMED' });
    await mountLoaded();
    state = makeReview({ status: 'CONFIRMED', editable: false, invoice: { documentNo: 'F-100' } });
    typeAndBlur('invoice-inbox-review-line-0-quantity', '9');
    expect(await screen.findByTestId('invoice-inbox-review-notice')).toHaveTextContent(L('invoiceInboxSaveErrorNotEditable'));
    await waitFor(() => expect(maybe('invoice-inbox-review-add-line')).toBeNull());
    expect(maybe('invoice-inbox-review-footer')).toBeNull();
  });

  it('a network failure shows its already translated text', async () => {
    respond = () => { throw Object.assign(new Error('Sin conexión. Reintenta.'), { name: 'NetworkError', code: 'NETWORK', reason: 'offline' }); };
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '9');
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toHaveTextContent('Sin conexión. Reintenta.'));
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveValue('2');
  });

  it.each([
    ['too_many_lines', 'invoiceInboxSaveErrorTooManyLines'],
    ['unknown_product', 'invoiceInboxSaveErrorUnknownProduct'],
    ['request_too_large', 'invoiceInboxSaveErrorTooLarge'],
    ['missing_updated', 'invoiceInboxSaveErrorGeneric'],
    ['something_new', 'invoiceInboxSaveErrorGeneric'],
  ])('the refusal %s reads %s', async (code, key) => {
    respond = () => refusal(422, { code });
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '9');
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L(key)));
  });
});

describe('editing — lines', () => {
  const twoLines = () => makeReview({}, { lines: [line({ index: 0 }), line({ index: 4, description: 'Gadget', taxRate: 10 })] });

  it('addLine posts the operation, shows the new row with the previous rate and focuses its description', async () => {
    await mountLoaded(twoLines());
    fireEvent.click(tid('invoice-inbox-review-add-line'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'addLine' }]));
    const description = await screen.findByTestId('invoice-inbox-review-line-2-description');
    expect(tid('invoice-inbox-review-lines-title')).toHaveTextContent('Líneas · 3');
    expect(tid('invoice-inbox-review-line-2-tax')).toHaveValue('10%');
    await waitFor(() => expect(description).toHaveFocus());
  });

  it('removeLine addresses the line by its stable index, and what is left keeps its index', async () => {
    await mountLoaded(twoLines());
    fireEvent.click(tid('invoice-inbox-review-line-delete-0'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'removeLine', index: 0 }]));
    await waitFor(() => expect(tid('invoice-inbox-review-lines-title')).toHaveTextContent('Líneas · 1'));
    typeAndBlur('invoice-inbox-review-line-0-quantity', '7');
    await waitFor(() => expect(editOps()).toEqual([
      { op: 'removeLine', index: 0 }, { op: 'setLine', index: 4, quantity: 7 },
    ]));
  });

  it('deleting the second line sends its own stable index', async () => {
    await mountLoaded(twoLines());
    fireEvent.click(tid('invoice-inbox-review-line-delete-1'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'removeLine', index: 4 }]));
  });

  it('removing a line is immediate (optimistic) and a refusal brings it back', async () => {
    respond = () => refusal(422, { code: 'line_not_found' });
    await mountLoaded(twoLines());
    fireEvent.click(tid('invoice-inbox-review-line-delete-0'));
    expect(tid('invoice-inbox-review-lines-title')).toHaveTextContent('Líneas · 1');
    await waitFor(() => expect(tid('invoice-inbox-review-lines-title')).toHaveTextContent('Líneas · 2'));
    expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L('invoiceInboxSaveErrorLineNotFound'));
  });

  it('Añadir línea is disabled at the line cap', async () => {
    const lines = Array.from({ length: MAX_LINES }, (_, i) => line({ index: i }));
    await mountLoaded(makeReview({}, { lines }));
    expect(tid('invoice-inbox-review-add-line')).toBeDisabled();
  });

  it('several quick structural edits are all sent, in order', async () => {
    await mountLoaded(twoLines());
    fireEvent.click(tid('invoice-inbox-review-add-line'));
    fireEvent.click(tid('invoice-inbox-review-add-line'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'addLine' }, { op: 'addLine' }]));
    expect(posts.map((p) => p.body.updated)).toEqual(['T0', 'T1']);
  });

  describe('stacked layout', () => {
    const originalRO = globalThis.ResizeObserver;
    const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    let width;
    afterEach(() => {
      globalThis.ResizeObserver = originalRO;
      if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth);
      else delete HTMLElement.prototype.clientWidth;
    });
    function fakeWidth(px) {
      width = px;
      globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return width; } });
    }

    it('below 460 px a line stacks: the labels show and the header row is gone', async () => {
      fakeWidth(STACKED_BELOW_PX - 1);
      await mountLoaded();
      expect(tid('invoice-inbox-review-line-0')).toHaveAttribute('data-layout', 'stacked');
      expect(maybe('invoice-inbox-review-lines-head')).toBeNull();
      expect(within(tid('invoice-inbox-review-line-0')).getByText(L('invoiceInboxReviewColDiscount'))).toBeInTheDocument();
    });

    it('at 460 px and above it keeps the row layout with the header row', async () => {
      fakeWidth(STACKED_BELOW_PX);
      await mountLoaded();
      expect(tid('invoice-inbox-review-line-0')).toHaveAttribute('data-layout', 'row');
      expect(tid('invoice-inbox-review-lines-head')).toBeInTheDocument();
    });

    it('stacked cells still edit and save', async () => {
      fakeWidth(300);
      await mountLoaded();
      typeAndBlur('invoice-inbox-review-line-0-discount', '5');
      await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 0, discount: 5 }]));
    });
  });
});

describe('editing — header', () => {
  it('the invoice number and the date are saved as setHeader operations', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-invoice-no', 'F-9');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setHeader', documentNo: 'F-9' }]));
  });
});

describe('editing — vendor resolution', () => {
  it('ambiguous: choosing a candidate sends selectVendor and the card turns linked "Elegido por ti"', async () => {
    await mountLoaded(ambiguousVendor());
    fireEvent.click(tid('invoice-inbox-review-vendor-candidate-c1'));
    expect(tid('invoice-inbox-review-vendor')).toHaveAttribute('data-state', 'linked');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'selectVendor', id: 'c1' }]));
    expect(tid('invoice-inbox-review-vendor-name')).toHaveTextContent('Uno SL');
    expect(tid('invoice-inbox-review-vendor-matched-by')).toHaveTextContent(L('invoiceInboxReviewVendorLinkedManual'));
  });

  it('ambiguous: "Ninguno · crear proveedor nuevo" sends newVendor and shows the new-vendor block', async () => {
    await mountLoaded(ambiguousVendor());
    fireEvent.click(tid('invoice-inbox-review-vendor-none-option'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'newVendor' }]));
    expect(tid('invoice-inbox-review-vendor')).toHaveAttribute('data-state', 'new');
    expect(tid('invoice-inbox-review-vendor-new-name')).toHaveValue('Uno SL');
  });

  it('ambiguous: searching an Etendo vendor links the picked one with its search data', async () => {
    pickerItems([{ id: 'E9', name: 'Otro SA', taxId: 'Z9', city: 'Leon' }]);
    await mountLoaded(ambiguousVendor());
    const combo = within(tid('invoice-inbox-review-vendor-search')).getByTestId('inline-add-field-inbox-vendor');
    fireEvent.focus(combo);
    fireEvent.click(combo);
    const option = await screen.findByTestId('inline-add-option-inbox-vendor-E9');
    fireEvent.mouseDown(option);
    await waitFor(() => expect(editOps()).toEqual([{ op: 'selectVendor', id: 'E9' }]));
    const [url] = mockPickerFetch.mock.calls[0];
    expect(url).toContain('/selectors/');
    expect(url).not.toContain('_neoWhere');
  });

  it('new: editing a field sends newVendor with only that field, keyed so the last value wins', async () => {
    const review = makeReview({}, {
      header: { vendor: { state: 'new', candidates: [], extracted: { name: 'Nuevo SL', taxId: 'X1', city: 'Paris' } } },
      validation: { missing: [] },
    });
    await mountLoaded(review);
    typeAndBlur('invoice-inbox-review-vendor-new-city', 'Lyon');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'newVendor', fields: { city: 'Lyon' } }]));
    typeAndBlur('invoice-inbox-review-vendor-new-name', 'Nuevo SA');
    await waitFor(() => expect(editOps()).toHaveLength(2));
    expect(editOps()[1]).toEqual({ op: 'newVendor', fields: { name: 'Nuevo SA' } });
    expect(tid('invoice-inbox-review-vendor-new-name')).toHaveValue('Nuevo SA');
  });

  it('new: "Buscar existente" opens the search; the country is a picker that saves its name', async () => {
    pickerItems([{ id: 'FR', name: 'Francia' }]);
    const review = makeReview({}, { header: { vendor: { state: 'new', candidates: [], extracted: { name: 'N', countryName: 'España' } } } });
    await mountLoaded(review);
    fireEvent.click(tid('invoice-inbox-review-vendor-search-existing'));
    expect(within(tid('invoice-inbox-review-vendor-new')).getByTestId('invoice-inbox-review-vendor-search')).toBeInTheDocument();
    // The committed country shows as a chip; opening it gives the search input.
    fireEvent.click(within(tid('invoice-inbox-review-vendor-new-country-field')).getByTestId('inline-add-field-inbox-vendor-country-chip'));
    const combo = await screen.findByTestId('inline-add-field-inbox-vendor-country');
    fireEvent.focus(combo);
    fireEvent.click(combo);
    fireEvent.mouseDown(await screen.findByTestId('inline-add-option-inbox-vendor-country-FR'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'newVendor', fields: { countryName: 'Francia' } }]));
  });

  it('none with extracted data offers "crear proveedor nuevo"; without data it does not', async () => {
    const none = (extracted) => makeReview({}, { header: { vendor: { state: 'none', extracted } }, validation: { missing: ['vendor'] } });
    const { unmount } = await mountLoaded(none({ name: 'Algo' }));
    fireEvent.click(tid('invoice-inbox-review-vendor-create-new'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'newVendor' }]));
    unmount();
    posts = [];
    await mountLoaded(none({}));
    expect(maybe('invoice-inbox-review-vendor-create-new')).toBeNull();
  });

  it('linked: Cambiar opens the search and the candidates, and the committed vendor is already linked', async () => {
    const review = makeReview({}, {
      header: { vendor: { state: 'linked', id: 'V0', matchedBy: 'taxId', details: { name: 'ACME SL', taxId: 'B1', city: 'M' }, candidates: [{ id: 'V0', name: 'ACME SL', taxId: 'B1', city: 'M' }, { id: 'V5', name: 'ACME SA', taxId: 'B5', city: 'S' }], extracted: {} } },
    });
    await mountLoaded(review);
    expect(maybe('invoice-inbox-review-vendor-change-panel')).toBeNull();
    fireEvent.click(tid('invoice-inbox-review-vendor-change'));
    const panel = tid('invoice-inbox-review-vendor-change-panel');
    expect(within(panel).getByTestId('invoice-inbox-review-vendor-candidate-V0')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(panel).getByTestId('invoice-inbox-review-vendor-candidate-V0'));
    expect(editOps()).toEqual([]);
    fireEvent.click(within(panel).getByTestId('invoice-inbox-review-vendor-candidate-V5'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'selectVendor', id: 'V5' }]));
  });
});

describe('editing — product resolution', () => {
  const ambiguousLine = (extra = {}) => makeReview({}, {
    lines: [line({
      description: 'Tornillo',
      product: { state: 'ambiguous', candidates: [{ id: 'p0', name: 'Tornillo A', searchKey: 'T-A', category: 'Cat', uom: 'Ud' }, { id: 'p1', name: 'Tornillo B', searchKey: 'T-B', category: 'Cat', uom: 'Ud' }], ...extra },
    })],
    validation: { missing: ['line[0].product'] },
  });

  it('ambiguous: choosing a candidate sends selectProduct with the line index and links the chip', async () => {
    await mountLoaded(ambiguousLine());
    fireEvent.click(tid('invoice-inbox-review-line-0-candidate-p1'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'selectProduct', index: 0, id: 'p1' }]));
    expect(tid('invoice-inbox-review-line-0-product')).toHaveAttribute('data-state', 'ok');
  });

  it('ambiguous: "Ninguno · crear producto nuevo" sends newProduct and opens the new-product form with the description as name', async () => {
    await mountLoaded(ambiguousLine());
    fireEvent.click(tid('invoice-inbox-review-line-0-none-option'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'newProduct', index: 0 }]));
    expect(tid('invoice-inbox-review-line-0-product')).toHaveAttribute('data-state', 'new');
    // The user just asked for a new product: the panel with its required category and unit must
    // stay open (SOURCE BUG when it collapses: `open` defaults to "ambiguous only", so the form is hidden).
    expect(tid('invoice-inbox-review-line-0-product')).toHaveAttribute('aria-expanded', 'true');
    expect(tid('invoice-inbox-review-line-0-new-name')).toHaveValue('Tornillo');
  });

  it('none without candidates: "Crear producto nuevo" button', async () => {
    const review = makeReview({}, { lines: [line({ product: { state: 'none', candidates: [] } })], validation: { missing: ['line[0].product'] } });
    await mountLoaded(review);
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    fireEvent.click(tid('invoice-inbox-review-line-0-create-new'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'newProduct', index: 0 }]));
  });

  it('new product: name, category and unit are saved as newProduct patches; the missing hint shows until both are chosen', async () => {
    pickerItems([{ id: 'C1', name: 'Ferretería' }, { id: 'C2', name: 'Otra' }]);
    catalog = { C1: 'Ferretería', U1: 'Caja' };
    const review = makeReview({}, {
      lines: [line({ product: { state: 'new', new: { name: 'Tornillo' }, candidates: [] } })],
      validation: { missing: ['line[0].product'] },
    });
    await mountLoaded(review);
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(tid('invoice-inbox-review-line-0-new-error')).toHaveTextContent(L('invoiceInboxReviewProductNewRequired'));
    typeAndBlur('invoice-inbox-review-line-0-new-name', 'Tornillo M6');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'newProduct', index: 0, name: 'Tornillo M6' }]));

    const category = within(tid('invoice-inbox-review-line-0-new-category')).getByTestId('inline-add-field-inbox-line-0-category');
    fireEvent.focus(category);
    fireEvent.click(category);
    fireEvent.mouseDown(await screen.findByTestId('inline-add-option-inbox-line-0-category-C1'));
    await waitFor(() => expect(editOps()).toContainEqual({ op: 'newProduct', index: 0, categoryId: 'C1' }));
    await waitFor(() => expect(tid('invoice-inbox-review-line-0-new-category')).toHaveTextContent('Ferretería'));

    pickerItems([{ id: 'U1', name: 'Caja' }]);
    const uom = within(tid('invoice-inbox-review-line-0-new-uom')).getByTestId('inline-add-field-inbox-line-0-uom');
    fireEvent.focus(uom);
    fireEvent.click(uom);
    fireEvent.mouseDown(await screen.findByTestId('inline-add-option-inbox-line-0-uom-U1'));
    await waitFor(() => expect(editOps()).toContainEqual({ op: 'newProduct', index: 0, uomId: 'U1' }));
  });

  it('the category and unit pickers open on the committed value (checked, aria-selected)', async () => {
    pickerItems([{ id: 'C0', name: 'Primera' }, { id: 'C1', name: 'Ferretería' }, { id: 'C2', name: 'Tercera' }]);
    const review = makeReview({}, {
      lines: [line({ product: { state: 'new', new: { name: 'T', categoryId: 'C1', category: 'Ferretería', uomId: 'U1', uom: 'Caja' }, candidates: [] } })],
    });
    await mountLoaded(review);
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    const chip = within(tid('invoice-inbox-review-line-0-new-category')).getByTestId('inline-add-field-inbox-line-0-category-chip');
    fireEvent.click(chip);
    const committed = await screen.findByTestId('inline-add-option-inbox-line-0-category-C1');
    await waitFor(() => expect(committed).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByTestId('inline-add-option-inbox-line-0-category-C0')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('inline-add-option-inbox-line-0-category-C2')).toHaveAttribute('aria-selected', 'false');
  });

  it('a linked line searches the catalog and a picked product links with its name', async () => {
    pickerItems([{ id: 'P7', name: 'Nuevo Prod', searchKey: 'NP-7' }]);
    await mountLoaded();
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    const combo = within(tid('invoice-inbox-review-line-0-search')).getByTestId('inline-add-field-inbox-line-0-product-chip');
    fireEvent.click(combo);
    fireEvent.mouseDown(await screen.findByTestId('inline-add-option-inbox-line-0-product-P7'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'selectProduct', index: 0, id: 'P7' }]));
  });
});

describe('editing — Marcar como revisada', () => {
  it('is enabled on a valid pending document, disabled with pending items, and not offered on READY', async () => {
    const { unmount } = await mountLoaded();
    expect(tid('invoice-inbox-review-mark-reviewed')).not.toBeDisabled();
    unmount();
    const pending = await mountLoaded(makeReview({}, { validation: { missing: ['vendor'] } }));
    expect(tid('invoice-inbox-review-mark-reviewed')).toBeDisabled();
    pending.unmount();
    await mountLoaded(makeReview({ status: 'READY' }));
    expect(maybe('invoice-inbox-review-mark-reviewed')).toBeNull();
    expect(tid('invoice-inbox-review-reviewed')).toHaveTextContent(L('invoiceInboxReviewReviewedByYou'));
  });

  it('is disabled for an ERROR document even when nothing is missing', async () => {
    await mountLoaded(makeReview({ status: 'ERROR', errorCode: 'UNREADABLE' }));
    expect(tid('invoice-inbox-review-mark-reviewed')).toBeDisabled();
  });

  it('click flushes the pending edit first, then marks with the new token and the footer turns "Revisada por ti"', async () => {
    await mountLoaded();
    const qty = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(qty);
    fireEvent.change(qty, { target: { value: '4' } });
    fireEvent.click(tid('invoice-inbox-review-mark-reviewed'));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[0].url).toBe('/header/D1/action/apply');
    expect(posts[1].url).toBe('/header/D1/action/mark-reviewed');
    expect(posts[1].body).toEqual({ updated: 'T1' });
    await waitFor(() => expect(tid('invoice-inbox-review-reviewed')).toBeInTheDocument());
    expect(maybe('invoice-inbox-review-mark-reviewed')).toBeNull();
  });

  it('not_valid (stale verdict) re-reads and shows what is still missing and the reason', async () => {
    respond = (url) => (url.endsWith('/mark-reviewed') ? refusal(422, { code: 'not_valid', missing: ['vendor'] }) : undefined);
    await mountLoaded();
    state = makeReview({ updated: 'T5' }, { validation: { missing: ['vendor'] }, header: { vendor: { state: 'none' } } });
    fireEvent.click(tid('invoice-inbox-review-mark-reviewed'));
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L('invoiceInboxSaveErrorNotValid')));
    await waitFor(() => expect(tid('invoice-inbox-review-pending')).toHaveTextContent('1 obligatorio pendiente'));
    expect(tid('invoice-inbox-review-mark-reviewed')).toBeDisabled();
  });

  it('is disabled while a save is in flight', async () => {
    const release = holdWrites();
    await mountLoaded();
    const qty = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(qty);
    fireEvent.change(qty, { target: { value: '4' } });
    fireEvent.blur(qty);
    expect(tid('invoice-inbox-review-mark-reviewed')).toBeDisabled();
    release();
    await waitFor(() => expect(tid('invoice-inbox-review-mark-reviewed')).not.toBeDisabled());
  });
});

describe('editing — read-only documents', () => {
  const ro = (over) => makeReview(over, {
    header: { vendor: { state: 'linked', matchedBy: 'taxId', id: 'V0', details: { name: 'ACME', taxId: 'B1' }, candidates: [], extracted: {} } },
  });
  it.each([
    ['CONFIRMED', { status: 'CONFIRMED', editable: false, invoice: { id: 'I1', documentNo: 'F-1' } }],
    ['DISCARDED', { status: 'DISCARDED', editable: false }],
    ['FOREIGN_RECEIVER', { status: 'ERROR', errorCode: 'FOREIGN_RECEIVER', editable: false }],
  ])('%s: no editable input, no add or delete, no save indicator and no write on any interaction', async (_name, over) => {
    await mountLoaded(ro(over));
    expect(maybe('invoice-inbox-review-add-line')).toBeNull();
    expect(maybe('invoice-inbox-review-line-delete-0')).toBeNull();
    expect(maybe('invoice-inbox-review-mark-reviewed')).toBeNull();
    expect(maybe('invoice-inbox-review-vendor-change')).toBeNull();
    if (maybe('invoice-inbox-review-invoice-no')) expect(tid('invoice-inbox-review-invoice-no')).toHaveAttribute('readonly');
    if (maybe('invoice-inbox-review-line-0-quantity')) {
      expect(tid('invoice-inbox-review-line-0-quantity')).toHaveAttribute('readonly');
      typeAndBlur('invoice-inbox-review-line-0-quantity', '9');
    }
    await act(async () => { await Promise.resolve(); });
    expect(posts).toHaveLength(0);
    expect(maybe('invoice-inbox-review-save-state')).toBeNull();
  });

  it('a foreign receiver keeps only Discard in the footer', async () => {
    await mountLoaded(ro({ status: 'ERROR', errorCode: 'FOREIGN_RECEIVER', editable: false }));
    const footer = tid('invoice-inbox-review-footer');
    expect(within(footer).getByTestId('invoice-inbox-review-discard')).toBeInTheDocument();
    expect(within(footer).queryByTestId('invoice-inbox-review-confirm')).toBeNull();
    expect(within(footer).queryByTestId('invoice-inbox-review-mark-reviewed')).toBeNull();
  });
});

describe('editing — leaving the panel waits for the saves', () => {
  function pendingEdit() {
    const qty = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(qty);
    fireEvent.change(qty, { target: { value: '6' } });
  }

  it('close commits the typed value, waits for the write, then closes', async () => {
    const { onClose } = await mountLoaded();
    pendingEdit();
    fireEvent.click(tid('invoice-inbox-review-close'));
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(editOps()).toEqual([{ op: 'setLine', index: 0, quantity: 6 }]);
  });

  it('previous and next wait for the write before moving', async () => {
    const { nav: navigation } = await mountLoaded();
    pendingEdit();
    fireEvent.click(tid('invoice-inbox-review-next'));
    await waitFor(() => expect(navigation.goNext).toHaveBeenCalledTimes(1));
    expect(editOps()).toHaveLength(1);
    expect(posts[0].url).toBe('/header/D1/action/apply');
    pendingEdit();
    fireEvent.click(tid('invoice-inbox-review-prev'));
    await waitFor(() => expect(navigation.goPrev).toHaveBeenCalledTimes(1));
  });

  it('a failed write keeps the panel open and the nav where it is', async () => {
    respond = () => refusal(422, { code: 'invalid_value' });
    const { onClose, nav: navigation } = await mountLoaded();
    pendingEdit();
    fireEvent.click(tid('invoice-inbox-review-close'));
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'error'));
    expect(onClose).not.toHaveBeenCalled();
    pendingEdit();
    fireEvent.click(tid('invoice-inbox-review-next'));
    await waitFor(() => expect(posts).toHaveLength(2));
    await act(async () => { await Promise.resolve(); });
    expect(navigation.goNext).not.toHaveBeenCalled();
  });

  it('with nothing pending, close and nav go straight through and write nothing', async () => {
    const { onClose, nav: navigation } = await mountLoaded();
    fireEvent.click(tid('invoice-inbox-review-prev'));
    await waitFor(() => expect(navigation.goPrev).toHaveBeenCalledTimes(1));
    fireEvent.click(tid('invoice-inbox-review-close'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(0);
  });

  it('Discard waits for the write, then hands the review to onDiscard', async () => {
    const { onDiscard } = await mountLoaded();
    pendingEdit();
    fireEvent.click(tid('invoice-inbox-review-discard'));
    await waitFor(() => expect(onDiscard).toHaveBeenCalledTimes(1));
    expect(posts).toHaveLength(1);
    expect(onDiscard.mock.calls[0][0]).toMatchObject({ id: 'D1' });
  });

  it('asks the browser to confirm a reload while a write is open', async () => {
    const release = holdWrites();
    await mountLoaded();
    const qty = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(qty);
    fireEvent.change(qty, { target: { value: '6' } });
    fireEvent.blur(qty);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    release();
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'saved'));
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
