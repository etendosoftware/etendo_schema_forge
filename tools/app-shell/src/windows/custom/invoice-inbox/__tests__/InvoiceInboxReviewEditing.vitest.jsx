// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewDrawer.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewInputs.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewSaveStatus.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewPickers.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewLines.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewVendor.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewFooter.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewForm.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewTotals.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewBanners.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReviewEditor.js
// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxMoney.js
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

  it('the VAT cell is a read-only display: a typed rate is never offered nor sent (the tax is chosen by id)', async () => {
    await mountLoaded();
    const tax = tid('invoice-inbox-review-line-0-tax');
    expect(tax).toHaveAttribute('readonly');
    typeAndBlur('invoice-inbox-review-line-0-tax', '10,555');
    expect(posts).toHaveLength(0);
  });
});

describe('editing — tax by id (ETP-6050 S2)', () => {
  it('picking a tax sends setLine {taxId} with no rate; the selector gets the document date and purchase side; re-picking the same tax writes nothing', async () => {
    pickerItems([{ id: 'T21', label: 'IVA 21%' }, { id: 'T10', label: 'IVA 10%' }]);
    await mountLoaded(makeReview({}, { lines: [line({ taxRate: 21, tax: { state: 'resolved', matchedBy: 'rate', id: 'T21', name: 'IVA 21%', rate: 21 } })] }));
    const picker = within(tid('invoice-inbox-review-line-0-tax-picker'));
    // A committed tax shows as a chip; clicking it opens the search on the committed value.
    fireEvent.click(picker.getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    fireEvent.mouseDown(await screen.findByTestId('inline-add-option-inbox-line-0-tax-T21'));
    expect(posts).toHaveLength(0);
    const url = mockPickerFetch.mock.calls.at(-1)[0];
    expect(url).toContain('/purchase-invoice/lines/selectors/C_Tax_ID');
    expect(url).toContain('isSOTrx=N');
    expect(url).toContain('DateInvoiced=');
    fireEvent.click(picker.getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    fireEvent.mouseDown(await screen.findByTestId('inline-add-option-inbox-line-0-tax-T10'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 0, taxId: 'T10' }]));
  });

  it('a missing quantity or price is red and counted; a negative or zero value is a valid number', async () => {
    await mountLoaded(makeReview({}, {
      lines: [line({ quantity: null, unitPrice: null }), line({ index: 1, quantity: -2, unitPrice: 0 })],
      validation: { missing: ['line[0].quantity', 'line[0].unitPrice'] },
    }));
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveAttribute('aria-invalid', 'true');
    expect(tid('invoice-inbox-review-line-0-price')).toHaveAttribute('aria-invalid', 'true');
    expect(tid('invoice-inbox-review-line-0-price')).toHaveValue('');
    expect(tid('invoice-inbox-review-line-1-quantity')).not.toHaveAttribute('aria-invalid');
    expect(tid('invoice-inbox-review-lines-error')).toHaveTextContent(L('invoiceInboxReviewQuantityMissingError'));
    expect(tid('invoice-inbox-review-lines-error')).toHaveTextContent(L('invoiceInboxReviewPriceMissingError'));
    typeAndBlur('invoice-inbox-review-line-1-quantity', '-3');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 1, quantity: -3 }]));
  });
});

describe('editing — discount display keeps its 4 decimals', () => {
  it.each([[10, '10%'], [12.3457, '12,3457%'], [7.0007, '7,0007%'], [12.5, '12,5%']])('a stored discount of %s shows %s (idle) and its plain value when focused', async (stored, idle) => {
    await mountLoaded(makeReview({}, { lines: [line({ discount: stored })] }));
    const cell = tid('invoice-inbox-review-line-0-discount');
    expect(cell).toHaveValue(idle);
    fireEvent.focus(cell);
    expect(cell).toHaveValue(String(stored).replace('.', ','));
  });

  it('the read-only list (confirmed) shows the discount with up to 4 decimals too', async () => {
    await mountLoaded(makeReview({ status: 'CONFIRMED', editable: false }, { lines: [line({ discount: 12.3457 })] }));
    expect(tid('invoice-inbox-review-line-0-detail')).toHaveTextContent('12,3457');
  });

  it('typing 12,3457 keeps all four decimals after blur and sends them', async () => {
    await mountLoaded(makeReview({}, { lines: [line()] }));
    typeAndBlur('invoice-inbox-review-line-0-discount', '12,3457');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 0, discount: 12.3457 }]));
  });
});

describe('editing — negative tax rates (withholding)', () => {
  it('the totals card lists -10, -5 then 21 with a signed label, amount and test id', async () => {
    await mountLoaded(makeReview({}, {
      header: { totalSource: 'lines' },
      lines: [
        line({ index: 0, quantity: 1, unitPrice: 100, taxRate: 21 }),
        line({ index: 1, quantity: 1, unitPrice: 100, taxRate: -5 }),
        line({ index: 2, quantity: 1, unitPrice: 100, taxRate: -10 }),
      ],
    }));
    const ids = screen.getAllByTestId(/^invoice-inbox-review-total-tax-.*$/).filter((el) => !el.dataset.testid.endsWith('-label')).map((el) => el.dataset.testid);
    expect(ids).toEqual(['invoice-inbox-review-total-tax--10', 'invoice-inbox-review-total-tax--5', 'invoice-inbox-review-total-tax-21']);
    expect(tid('invoice-inbox-review-total-tax--10-label')).toHaveTextContent('IVA -10%');
    expect(tid('invoice-inbox-review-total-tax--10')).toHaveTextContent(M(-10));
    expect(tid('invoice-inbox-review-total-tax--5')).toHaveTextContent(M(-5));
    expect(tid('invoice-inbox-review-total-tax-21')).toHaveTextContent(M(21));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(306));
  });
});

describe('editing — currency scale and tax mode (ETP-6050 S2)', () => {
  it('a 0-decimal currency shows no decimals in lines, totals and the mismatch banner (tolerance = 1 unit)', async () => {
    const review = makeReview({ currency: { id: 'JPY1', isoCode: 'JPY', symbol: '¥', scale: 0 } }, {
      header: { totalSource: 'printed', totalAmount: 125 },
      lines: [line({ quantity: 3, unitPrice: 33.5, taxRate: 21 })],
    });
    await mountLoaded(review);
    const yen = (v) => formatCurrency('JPY', v, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\s+/g, ' ');
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(yen(101));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(yen(122)); // the lines total, not the printed 125
    expect(tid('invoice-inbox-review-total-tax-21')).toHaveTextContent(yen(21));
    // lines total 122 vs printed 125: 3 units apart -> warning; 1 unit apart would not warn
    expect(tid('invoice-inbox-review-banner-mismatch')).toHaveTextContent(yen(122));
  });

  it('a document with both document-based and line-based taxes at one rate shows two rows, D before L', async () => {
    await mountLoaded(makeReview({}, {
      lines: [
        line({ index: 0, quantity: 1, unitPrice: 0.25, taxRate: 10, tax: { state: 'resolved', docTaxAmount: 'D' } }),
        line({ index: 1, quantity: 1, unitPrice: 0.25, taxRate: 10, tax: { state: 'resolved', docTaxAmount: 'L' } }),
      ],
    }));
    expect(tid('invoice-inbox-review-total-tax-10')).toBeInTheDocument();
    expect(tid('invoice-inbox-review-total-tax-10-L')).toBeInTheDocument();
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

  const suggestedLine = () => makeReview({}, {
    lines: [line({
      description: 'Tornillo',
      product: {
        state: 'linked', id: 'p0', matchedBy: 'suggested', details: { name: 'Tornillo A', searchKey: 'T-A' },
        candidates: [
          { id: 'p0', name: 'Tornillo A', searchKey: 'T-A', category: 'Cat', uom: 'Ud', similarity: '72' },
          { id: 'p1', name: 'Tornillo B', searchKey: 'T-B', category: 'Cat', uom: 'Ud', similarity: '70' },
        ],
      },
    })],
  });

  it('ETP-6051: chosen by OCR: choosing the same candidate sends nothing and keeps "Elegido por OCR"', async () => {
    await mountLoaded(suggestedLine());
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    fireEvent.click(tid('invoice-inbox-review-line-0-candidate-p0'));
    expect(editOps()).toEqual([]);
    expect(tid('invoice-inbox-review-line-0-product-suggested')).toHaveTextContent('Elegido por OCR');
  });

  it('ETP-6051: chosen by OCR: choosing another candidate sends selectProduct and the line becomes chosen by the user', async () => {
    await mountLoaded(suggestedLine());
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    fireEvent.click(tid('invoice-inbox-review-line-0-candidate-p1'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'selectProduct', index: 0, id: 'p1' }]));
    expect(tid('invoice-inbox-review-line-0-product')).toHaveAttribute('data-state', 'ok');
    expect(maybe('invoice-inbox-review-line-0-product-suggested')).toBeNull();
    expect(tid('invoice-inbox-review-line-0-product')).toHaveTextContent('Elegido por ti');
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

  it('clicking with a save in flight sends mark-reviewed after the save, carrying the token of that save', async () => {
    const release = holdWrites();
    await mountLoaded();
    const qty = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(qty);
    fireEvent.change(qty, { target: { value: '4' } });
    fireEvent.blur(qty);
    // The save is open: the button is NOT disabled by it (the click that blurred the input must land).
    expect(tid('invoice-inbox-review-mark-reviewed')).not.toBeDisabled();
    fireEvent.click(tid('invoice-inbox-review-mark-reviewed'));
    await act(async () => { release(); });
    await waitFor(() => expect(posts.filter((p) => p.url.endsWith('/mark-reviewed'))).toHaveLength(1));
    expect(posts.map((p) => p.url.split('/').pop())).toEqual(['apply', 'mark-reviewed']);
    expect(posts[1].body).toEqual({ updated: 'T1' });
  });

  it('a failed save sends no mark-reviewed and keeps the save error', async () => {
    respond = (url) => (url.endsWith('/action/apply') ? refusal(422, { code: 'invalid_value' }) : undefined);
    await mountLoaded();
    const qty = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(qty);
    fireEvent.change(qty, { target: { value: '4' } });
    fireEvent.click(tid('invoice-inbox-review-mark-reviewed'));
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toBeInTheDocument());
    await act(async () => { await Promise.resolve(); });
    expect(posts.some((p) => p.url.endsWith('/mark-reviewed'))).toBe(false);
    expect(tid('invoice-inbox-review-save-error')).toBeInTheDocument();
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

// ── ETP-6050 S2 addenda: tax selector, currency scale, validator codes, error paths ─────────────────

const TAXES = { T21: { name: 'IVA 21%', rate: 21 }, T10: { name: 'IVA 10%', rate: 10 }, T0: { name: 'Exento', rate: 0 } };
const taxed = (id = 'T21') => ({ state: 'resolved', matchedBy: 'rate', id, name: TAXES[id].name, rate: TAXES[id].rate, docTaxAmount: 'D' });
const taxedLine = (over = {}) => line({ taxRate: 21, tax: taxed('T21'), ...over });
const squash = (text) => text.replace(/\s+/g, ' ');
const val = (id) => squash(tid(id).value);
const money = (code, value, scale, maxDigits = scale) => squash(formatCurrency(code, value, { minimumFractionDigits: scale, maximumFractionDigits: Math.max(scale, maxDigits) }));

/** A server that resolves `setLine {taxId}` from TAXES the way the backend does (rate of the tax), and applies the rest. */
function taxAwareServer() {
  respond = (url, body) => {
    if (!url.endsWith('/action/apply')) return undefined;
    let document = state.document;
    for (const op of body.operations) {
      if (op.op === 'setLine' && 'taxId' in op) {
        const chosen = TAXES[op.taxId];
        document = { ...document, lines: document.lines.map((l, i) => ((l.index ?? i) === op.index
          ? { ...l, taxRate: chosen.rate, tax: { state: 'resolved', matchedBy: 'manual', id: op.taxId, name: chosen.name, rate: chosen.rate, docTaxAmount: 'D' } }
          : l)) };
      } else {
        document = applyOperationLocally(document, op, hintFor(document, op));
      }
    }
    tokenCount += 1;
    state = { ...state, document, updated: `T${tokenCount}`, adjusted: true };
    return jsonRes(200, state);
  };
}

async function pickTax(position, id) {
  const picker = within(tid(`invoice-inbox-review-line-${position}-tax-picker`));
  fireEvent.click(picker.getByTestId(`inline-add-field-inbox-line-${position}-tax-chip`));
  fireEvent.mouseDown(await screen.findByTestId(`inline-add-option-inbox-line-${position}-tax-${id}`));
}

describe('editing — tax selector variants (ETP-6050 S2)', () => {
  it('an option that exposes its rate shows it at once (VAT cell, tax row, total) and the server answer keeps it', async () => {
    taxAwareServer();
    pickerItems([{ id: 'T21', label: 'IVA 21%', rate: 21 }, { id: 'T10', label: 'IVA 10%', rate: 10 }]);
    const release = holdWrites();
    await mountLoaded(makeReview({}, { lines: [taxedLine()] }));
    await pickTax(0, 'T10');
    expect(tid('invoice-inbox-review-line-0-tax')).toHaveValue('10%');
    expect(tid('invoice-inbox-review-total-tax-10')).toHaveTextContent(M(10));
    expect(maybe('invoice-inbox-review-total-tax-21')).toBeNull();
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(110));
    release();
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'saved'));
    expect(tid('invoice-inbox-review-line-0-tax')).toHaveValue('10%');
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(110));
    expect(editOps()).toEqual([{ op: 'setLine', index: 0, taxId: 'T10' }]);
  });

  it('an option WITHOUT a rate shows "…" and no tax row until the server answers with the real rate; nothing is guessed', async () => {
    taxAwareServer();
    pickerItems([{ id: 'T10', label: 'IVA 10%' }]);
    const release = holdWrites();
    await mountLoaded(makeReview({}, { lines: [taxedLine()] }));
    await pickTax(0, 'T10');
    expect(tid('invoice-inbox-review-line-0-tax')).toHaveValue('…');
    expect(tid('invoice-inbox-review-line-0-tax')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryAllByTestId(/^invoice-inbox-review-total-tax-/).filter((n) => /total-tax-\d/.test(n.getAttribute('data-testid')))).toHaveLength(0);
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(100));
    release();
    await waitFor(() => expect(tid('invoice-inbox-review-line-0-tax')).toHaveValue('10%'));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(110));
  });

  it('a 0% tax is a real choice: the rate shows 0% and the line is not flagged', async () => {
    taxAwareServer();
    pickerItems([{ id: 'T0', label: 'Exento', rate: 0 }]);
    await mountLoaded(makeReview({}, { lines: [taxedLine()] }));
    await pickTax(0, 'T0');
    await waitFor(() => expect(tid('invoice-inbox-review-line-0-tax')).toHaveValue('0%'));
    expect(tid('invoice-inbox-review-line-0-tax')).not.toHaveAttribute('aria-invalid');
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(100));
  });

  it('an empty selector list offers no option and writes nothing', async () => {
    pickerItems([]);
    await mountLoaded(makeReview({}, { lines: [taxedLine()] }));
    fireEvent.click(within(tid('invoice-inbox-review-line-0-tax-picker')).getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    await waitFor(() => expect(mockPickerFetch).toHaveBeenCalled());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(posts).toHaveLength(0);
  });

  it('a failing selector request leaves the picker usable and empty: no option, no write, no crash', async () => {
    mockPickerFetch.mockImplementation(async () => jsonRes(500, { error: { code: 'boom' } }));
    await mountLoaded(makeReview({}, { lines: [taxedLine()] }));
    fireEvent.click(within(tid('invoice-inbox-review-line-0-tax-picker')).getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    await waitFor(() => expect(mockPickerFetch).toHaveBeenCalled());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(posts).toHaveLength(0);
    expect(tid('invoice-inbox-review-line-0-tax')).toHaveValue('21%');
  });

  it('the selector query carries the supplier location when the vendor has one, and omits it when it does not', async () => {
    pickerItems([{ id: 'T21', label: 'IVA 21%', rate: 21 }]);
    const withLocation = await mountLoaded(makeReview({}, {
      header: { vendor: { state: 'linked', id: 'V0', locationId: 'LOC9', details: { name: 'ACME SL', taxId: 'B1', city: 'M' }, candidates: [], extracted: {} } },
      lines: [taxedLine()],
    }));
    fireEvent.click(within(tid('invoice-inbox-review-line-0-tax-picker')).getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    await waitFor(() => expect(mockPickerFetch).toHaveBeenCalled());
    expect(mockPickerFetch.mock.calls.at(-1)[0]).toContain('C_BPartner_Location_ID=LOC9');
    withLocation.unmount();
    mockPickerFetch.mockClear();
    await mountLoaded(makeReview({}, { lines: [taxedLine()] }));
    fireEvent.click(within(tid('invoice-inbox-review-line-0-tax-picker')).getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    await waitFor(() => expect(mockPickerFetch).toHaveBeenCalled());
    const url = mockPickerFetch.mock.calls.at(-1)[0];
    expect(url).not.toContain('C_BPartner_Location_ID');
    expect(url).toContain('isSOTrx=N');
  });

  it('DateInvoiced follows the document date: another date, another selector query', async () => {
    pickerItems([{ id: 'T21', label: 'IVA 21%', rate: 21 }]);
    const first = await mountLoaded(makeReview({}, { header: { invoiceDate: '2026-08-01' }, lines: [taxedLine()] }));
    fireEvent.click(within(tid('invoice-inbox-review-line-0-tax-picker')).getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    await waitFor(() => expect(mockPickerFetch).toHaveBeenCalled());
    const urlA = new URL(mockPickerFetch.mock.calls.at(-1)[0], 'http://x');
    first.unmount();
    mockPickerFetch.mockClear();
    await mountLoaded(makeReview({}, { header: { invoiceDate: '2026-09-15' }, lines: [taxedLine()] }));
    fireEvent.click(within(tid('invoice-inbox-review-line-0-tax-picker')).getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    await waitFor(() => expect(mockPickerFetch).toHaveBeenCalled());
    const urlB = new URL(mockPickerFetch.mock.calls.at(-1)[0], 'http://x');
    expect(urlA.searchParams.get('DateInvoiced')).toBeTruthy();
    expect(urlB.searchParams.get('DateInvoiced')).toBeTruthy();
    expect(urlB.searchParams.get('DateInvoiced')).not.toBe(urlA.searchParams.get('DateInvoiced'));
  });

  it('editing the document date then opening the picker queries with the NEW date', async () => {
    pickerItems([{ id: 'T21', label: 'IVA 21%', rate: 21 }]);
    await mountLoaded(makeReview({}, { header: { invoiceDate: '2026-08-01' }, lines: [taxedLine()] }));
    const dateInput = document.getElementById('invoice-inbox-review-invoice-date');
    fireEvent.focus(dateInput);
    fireEvent.change(dateInput, { target: { value: '15/09/2026' } });
    fireEvent.blur(dateInput);
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setHeader', invoiceDate: '2026-09-15' }]));
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'saved'));
    fireEvent.click(within(tid('invoice-inbox-review-line-0-tax-picker')).getByTestId('inline-add-field-inbox-line-0-tax-chip'));
    await waitFor(() => expect(mockPickerFetch).toHaveBeenCalled());
    const url = new URL(mockPickerFetch.mock.calls.at(-1)[0], 'http://x');
    expect(url.searchParams.get('DateInvoiced')).toMatch(/2026/);
    expect(url.searchParams.get('DateInvoiced')).toMatch(/09|15/);
  });

  it('unknown_tax: the pick rolls back to the previous tax and the reason is the translated text, not the backend one', async () => {
    pickerItems([{ id: 'T10', label: 'IVA 10%', rate: 10 }]);
    respond = () => refusal(422, { code: 'unknown_tax', field: 'taxId', index: 0, message: 'tax T10 not found in zone' });
    await mountLoaded(makeReview({}, { lines: [taxedLine()] }));
    await pickTax(0, 'T10');
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'error'));
    expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L('invoiceInboxSaveErrorUnknownTax'));
    expect(screen.queryByText(/not found in zone/)).toBeNull();
    expect(tid('invoice-inbox-review-line-0-tax')).toHaveValue('21%');
    expect(maybe('invoice-inbox-review-notice')).toBeNull();
  });

  it('a line missing its tax (line[i].tax) shows "—" and flags the picker as invalid', async () => {
    await mountLoaded(makeReview({}, {
      lines: [line({ taxRate: undefined, tax: undefined })],
      validation: { missing: ['line[0].tax'] },
    }));
    expect(tid('invoice-inbox-review-line-0-tax')).toHaveValue('—');
    expect(tid('invoice-inbox-review-line-0-tax')).toHaveAttribute('aria-invalid', 'true');
    expect(tid('invoice-inbox-review-line-0-tax-picker')).toHaveAttribute('data-invalid', 'true');
    expect(tid('invoice-inbox-review-lines-error')).toHaveTextContent(L('invoiceInboxReviewTaxMissingError'));
  });

  it('a chosen tax with no name shows its rate as the picker label', async () => {
    await mountLoaded(makeReview({}, { lines: [line({ taxRate: 7, tax: { state: 'resolved', id: 'T7', rate: 7 } })] }));
    expect(within(tid('invoice-inbox-review-line-0-tax-picker')).getByTestId('inline-add-field-inbox-line-0-tax-chip')).toHaveTextContent('7%');
  });

  it.each([
    ['a settled document', { status: 'CONFIRMED', editable: false, invoice: { documentNo: 'F-1' } }],
    ['a foreign receiver (read-only table)', { status: 'ERROR', errorCode: 'FOREIGN_RECEIVER', editable: false }],
  ])('%s: no tax picker is offered (label as text) and the VAT cell stays read-only', async (_name, over) => {
    await mountLoaded(makeReview(over, { lines: [taxedLine()] }));
    expect(maybe('invoice-inbox-review-line-0-tax-picker')).toBeNull();
    expect(mockPickerFetch).not.toHaveBeenCalled();
    const name = maybe('invoice-inbox-review-line-0-tax-name');
    if (name) expect(name).toHaveTextContent('IVA 21%');
    expect(posts).toHaveLength(0);
  });

  it('addLine on a line whose tax has an id also sends setLine {taxId}, in that order, and the new row shows the tax', async () => {
    taxAwareServer();
    await mountLoaded(makeReview({}, { lines: [taxedLine()] }));
    fireEvent.click(tid('invoice-inbox-review-add-line'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'addLine' }, { op: 'setLine', index: 1, taxId: 'T21' }]));
    await waitFor(() => expect(tid('invoice-inbox-review-line-1-tax')).toHaveValue('21%'));
  });

  it('addLine on a line with a rate but NO tax id sends only addLine (the server default applies)', async () => {
    await mountLoaded(makeReview({}, { lines: [line({ taxRate: 10 })] }));
    fireEvent.click(tid('invoice-inbox-review-add-line'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'addLine' }]));
    await act(async () => { await Promise.resolve(); });
    expect(editOps()).toEqual([{ op: 'addLine' }]);
  });

  it('addLine on an empty document sends only addLine', async () => {
    await mountLoaded(makeReview({}, { lines: [], validation: { missing: ['lines'] } }));
    fireEvent.click(tid('invoice-inbox-review-add-line'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'addLine' }]));
  });
});

describe('editing — currency scale end to end (ETP-6050 S2)', () => {
  const jpy = { id: 'JPY1', isoCode: 'JPY', symbol: '¥', scale: 0 };
  const kwd = { id: 'KWD1', isoCode: 'KWD', symbol: 'KD', scale: 3 };

  it('scale 0: lines, price input, totals card and tax label show no decimals; the price still accepts up to 6', async () => {
    await mountLoaded(makeReview({ currency: jpy }, {
      header: { totalSource: 'lines' },
      lines: [line({ quantity: 3, unitPrice: 1234, taxRate: 21 }), line({ index: 1, quantity: 1, unitPrice: 33.5, taxRate: 21 })],
    }));
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(money('JPY', 3702, 0));
    expect(val('invoice-inbox-review-line-0-price')).toBe(money('JPY', 1234, 0, 6));
    expect(val('invoice-inbox-review-line-1-price')).toBe(money('JPY', 33.5, 0, 6));
    expect(tid('invoice-inbox-review-total-base')).toHaveTextContent(money('JPY', 3736, 0));
    expect(tid('invoice-inbox-review-total-tax-21-label')).toHaveTextContent(money('JPY', 3736, 0));
    expect(tid('invoice-inbox-review-total-tax-21')).toHaveTextContent(money('JPY', 785, 0));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(money('JPY', 4521, 0));
    expect(tid('invoice-inbox-review-total').textContent).not.toMatch(/[.,]\d{2}(?!\d)/);
    typeAndBlur('invoice-inbox-review-line-0-price', '1234,5');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 0, unitPrice: 1234.5 }]));
  });

  it('scale 0: the mismatch banner tolerates ONE unit and warns from two', async () => {
    const make = (printed) => makeReview({ currency: jpy }, {
      header: { totalSource: 'printed', totalAmount: printed },
      lines: [line({ quantity: 3, unitPrice: 33.5, taxRate: 21 })],
    });
    const one = await mountLoaded(make(123));
    expect(maybe('invoice-inbox-review-banner-mismatch')).toBeNull();
    one.unmount();
    await mountLoaded(make(124));
    expect(tid('invoice-inbox-review-banner-mismatch')).toHaveTextContent(money('JPY', 122, 0));
    expect(tid('invoice-inbox-review-banner-mismatch')).toHaveTextContent(money('JPY', 124, 0));
  });

  it('scale 3: amounts, totals and the mismatch tolerance use three decimals', async () => {
    const make = (printed) => makeReview({ currency: kwd }, {
      header: { totalSource: 'printed', totalAmount: printed },
      lines: [line({ quantity: 3, unitPrice: 1.2345, taxRate: 10 })],
    });
    const ok = await mountLoaded(make(4.075));
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(money('KWD', 3.704, 3));
    expect(tid('invoice-inbox-review-total-base')).toHaveTextContent(money('KWD', 3.704, 3));
    expect(tid('invoice-inbox-review-total-tax-10')).toHaveTextContent(money('KWD', 0.37, 3));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(money('KWD', 4.074, 3)); // the lines total, not the printed 4.075
    expect(maybe('invoice-inbox-review-banner-mismatch')).toBeNull();
    ok.unmount();
    await mountLoaded(make(4.077));
    expect(tid('invoice-inbox-review-banner-mismatch')).toHaveTextContent(money('KWD', 4.074, 3));
  });

  it('a missing currency (or one with no scale) falls back to 2 decimals', async () => {
    const none = await mountLoaded(makeReview({ currency: null }, { lines: [line({ quantity: 1, unitPrice: 10.5, taxRate: 0 })] }));
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(M(10.5));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(10.5));
    none.unmount();
    await mountLoaded(makeReview({ currency: { id: 'EUR1', isoCode: 'EUR', symbol: '€' } }, { lines: [line({ quantity: 1, unitPrice: 10.5, taxRate: 0 })] }));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(10.5));
  });

  it('the currency badge is read-only and shows the document currency (no selector, no fetch, nothing written)', async () => {
    await mountLoaded(makeReview({ currency: jpy }));
    const badge = tid('currency-rate-readonly');
    expect(badge).toHaveTextContent(/JPY/);
    expect(badge).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(badge);
    expect(maybe('currency-rate-popover')).toBeNull();
    expect(mockPickerFetch).not.toHaveBeenCalled();
    expect(posts).toHaveLength(0);
  });

  it('the read-only list (settled document) formats line, detail and total with the scale', async () => {
    await mountLoaded(makeReview({ currency: jpy, status: 'CONFIRMED', editable: false, invoice: { documentNo: 'F-1' } }, {
      lines: [line({ quantity: 3, unitPrice: 33.5, taxRate: 21, discount: 10 })],
    }));
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(money('JPY', 90, 0));
    expect(tid('invoice-inbox-review-line-0-detail')).toHaveTextContent(money('JPY', 33.5, 0, 6));
    expect(tid('invoice-inbox-review-total-base')).toHaveTextContent(money('JPY', 90, 0));
  });
});

describe('editing — price and quantity precision (ETP-6050 S2)', () => {
  it('a 6-decimal price is displayed in full, a 2-decimal one never with fewer than the scale; the quantity keeps 4', async () => {
    await mountLoaded(makeReview({}, {
      lines: [line({ quantity: 1.2345, unitPrice: 0.123456 }), line({ index: 1, quantity: 1, unitPrice: 12.5 })],
    }));
    expect(val('invoice-inbox-review-line-0-price')).toBe(money('EUR', 0.123456, 2, 6));
    expect(tid('invoice-inbox-review-line-0-price').value).toMatch(/0,123456/);
    expect(tid('invoice-inbox-review-line-1-price').value).toMatch(/12,50(?!\d)/);
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveValue('1,2345');
  });

  it('typing 7 decimals rounds HALF_UP to 6 at the boundary before it is sent and shown', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-price', '0,1234565');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 0, unitPrice: 0.123457 }]));
    await waitFor(() => expect(tid('invoice-inbox-review-line-0-price').value).toMatch(/0,123457/));
  });

  it('typing 5 decimals of quantity rounds to 4; a price typed with the plain 2 decimals is padded on display', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '1,23455');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 0, quantity: 1.2346 }]));
    typeAndBlur('invoice-inbox-review-line-0-price', '7,5');
    await waitFor(() => expect(editOps()).toContainEqual({ op: 'setLine', index: 0, unitPrice: 7.5 }));
    await waitFor(() => expect(tid('invoice-inbox-review-line-0-price').value).toMatch(/7,50(?!\d)/));
  });

  it('while focused the price shows its full precision as plain text', async () => {
    await mountLoaded(makeReview({}, { lines: [line({ unitPrice: 0.123456 })] }));
    const price = tid('invoice-inbox-review-line-0-price');
    fireEvent.focus(price);
    expect(price).toHaveValue('0,123456');
  });
});

describe('editing — any sign, zero and missing values (ETP-6050 S2)', () => {
  it('a negative quantity and a negative price are valid, sent as typed, and the amount keeps its sign', async () => {
    await mountLoaded(makeReview({}, { lines: [line({ quantity: -2, unitPrice: 50, taxRate: 0 })], header: { totalSource: 'lines' } }));
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(M(-100));
    expect(tid('invoice-inbox-review-line-0-quantity')).not.toHaveAttribute('aria-invalid');
    typeAndBlur('invoice-inbox-review-line-0-price', '-5');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 0, unitPrice: -5 }]));
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(M(10));
  });

  it('a zero quantity or a zero price is accepted (amount 0) and Marcar como revisada stays available', async () => {
    await mountLoaded(makeReview({}, { lines: [line({ quantity: 0, unitPrice: 50 }), line({ index: 1, quantity: 3, unitPrice: 0 })], header: { totalSource: 'lines' } }));
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(M(0));
    expect(tid('invoice-inbox-review-line-1-amount')).toHaveTextContent(M(0));
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveValue('0');
    expect(maybe('invoice-inbox-review-lines-error')).toBeNull();
    expect(tid('invoice-inbox-review-mark-reviewed')).not.toBeDisabled();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '0');
    expect(posts).toHaveLength(0);
  });

  it('clearing a price is rejected (reverts), never sent as null or as zero', async () => {
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-price', '');
    expect(posts).toHaveLength(0);
    expect(tid('invoice-inbox-review-line-0-price').value).toMatch(/50,00/);
  });

  it('a missing quantity and price: red cells, the footer counts both codes, Revisar is disabled, totals ignore the line', async () => {
    await mountLoaded(makeReview({}, {
      lines: [line({ quantity: null, unitPrice: 10, taxRate: 21 }), line({ index: 1, quantity: 2, unitPrice: null, taxRate: 21 }), line({ index: 2, quantity: 1, unitPrice: 100, taxRate: 21 })],
      validation: { missing: ['line[0].quantity', 'line[1].unitPrice'] },
      header: { totalSource: 'lines' },
    }));
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveAttribute('aria-invalid', 'true');
    expect(tid('invoice-inbox-review-line-1-price')).toHaveAttribute('aria-invalid', 'true');
    expect(tid('invoice-inbox-review-line-1-quantity')).not.toHaveAttribute('aria-invalid');
    expect(tid('invoice-inbox-review-line-2-price')).not.toHaveAttribute('aria-invalid');
    expect(tid('invoice-inbox-review-pending')).toHaveTextContent('2 obligatorios pendientes');
    expect(tid('invoice-inbox-review-mark-reviewed')).toBeDisabled();
    expect(tid('invoice-inbox-review-total-base')).toHaveTextContent(M(100));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(121));
  });

  it('filling the missing quantity clears the red cell once the server drops the code', async () => {
    respond = (url, body) => {
      if (!url.endsWith('/action/apply')) return undefined;
      let document = state.document;
      for (const op of body.operations) document = applyOperationLocally(document, op, {});
      document = { ...document, validation: { missing: [] } };
      tokenCount += 1;
      state = { ...state, document, updated: `T${tokenCount}`, adjusted: true };
      return jsonRes(200, state);
    };
    await mountLoaded(makeReview({}, { lines: [line({ quantity: null })], validation: { missing: ['line[0].quantity'] } }));
    typeAndBlur('invoice-inbox-review-line-0-quantity', '3');
    await waitFor(() => expect(editOps()).toEqual([{ op: 'setLine', index: 0, quantity: 3 }]));
    await waitFor(() => expect(tid('invoice-inbox-review-line-0-quantity')).not.toHaveAttribute('aria-invalid'));
    expect(tid('invoice-inbox-review-pending')).not.toHaveTextContent(/pendiente/);
    expect(tid('invoice-inbox-review-mark-reviewed')).not.toBeDisabled();
  });

  it('a credit document (every line negative) totals negative and its mismatch banner formats both negatives', async () => {
    await mountLoaded(makeReview({}, {
      lines: [line({ quantity: -1, unitPrice: 100, taxRate: 21 }), line({ index: 1, quantity: -2, unitPrice: 10.5, taxRate: 21 })],
      header: { totalSource: 'printed', totalAmount: -150 },
    }));
    expect(tid('invoice-inbox-review-total-base')).toHaveTextContent(M(-121));
    expect(tid('invoice-inbox-review-total-tax-21')).toHaveTextContent(M(-25.41));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(-146.41)); // the lines total, not the printed -150
    expect(tid('invoice-inbox-review-banner-mismatch')).toHaveTextContent(M(-146.41));
    expect(tid('invoice-inbox-review-banner-mismatch')).toHaveTextContent(M(-150));
  });
});

describe('editing — D and L tax rows (ETP-6050 S2)', () => {
  it('a line-based tax shows its own row labelled "por línea", D before L at the same rate, and each with its base', async () => {
    await mountLoaded(makeReview({}, {
      lines: [
        line({ index: 0, quantity: 1, unitPrice: 100, taxRate: 10, tax: { state: 'resolved', docTaxAmount: 'D' } }),
        line({ index: 1, quantity: 1, unitPrice: 50, taxRate: 10, tax: { state: 'resolved', docTaxAmount: 'L' } }),
      ],
      header: { totalSource: 'lines' },
    }));
    const rows = screen.getAllByTestId(/^invoice-inbox-review-total-tax-10(-L)?$/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['invoice-inbox-review-total-tax-10', 'invoice-inbox-review-total-tax-10-L']);
    expect(tid('invoice-inbox-review-total-tax-10')).toHaveTextContent(M(10));
    expect(tid('invoice-inbox-review-total-tax-10-L')).toHaveTextContent(M(5));
    expect(tid('invoice-inbox-review-total-tax-10-label')).toHaveTextContent(`IVA 10% s/ ${M(100)}`);
    expect(tid('invoice-inbox-review-total-tax-10-L-label')).toHaveTextContent(L('invoiceInboxReviewTotalTaxLine', { rate: '10', base: M(50) }));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(165));
  });

  it('only L lines: a single "-L" row and no D row; a rate with decimals keeps them in the id', async () => {
    await mountLoaded(makeReview({}, {
      lines: [line({ index: 0, quantity: 1, unitPrice: 100, taxRate: 5.5, tax: { state: 'resolved', docTaxAmount: 'L' } })],
      header: { totalSource: 'lines' },
    }));
    expect(tid('invoice-inbox-review-total-tax-5.5-L')).toHaveTextContent(M(5.5));
    expect(maybe('invoice-inbox-review-total-tax-5.5')).toBeNull();
  });
});

describe('editing — mark as reviewed refusals (ETP-6050 S2)', () => {
  it('not_valid adopts the recomputed codes and the new token locally: ERROR status, red cell, no re-read, no loop', async () => {
    respond = (url) => (url.endsWith('/mark-reviewed')
      ? refusal(422, { code: 'not_valid', missing: ['line[0].quantity'], documentStatus: 'ERROR', updated: 'T7' })
      : undefined);
    await mountLoaded(makeReview({}, { lines: [line({ quantity: null })] }));
    // the stored verdict said valid (stale); the click is allowed
    const reads = () => apiFetch.mock.calls.filter(([, o]) => !o?.method).length;
    const before = reads();
    fireEvent.click(tid('invoice-inbox-review-mark-reviewed'));
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L('invoiceInboxSaveErrorNotValid')));
    expect(reads()).toBe(before);
    expect(posts.filter((p) => p.url.endsWith('/mark-reviewed'))).toHaveLength(1);
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveAttribute('aria-invalid', 'true');
    expect(tid('invoice-inbox-review-pending')).toHaveTextContent('1 obligatorio pendiente');
    expect(tid('invoice-inbox-review-mark-reviewed')).toBeDisabled();
    expect(maybe('invoice-inbox-review-notice')).toBeNull();
    // no loop: nothing else is sent by itself
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(posts.filter((p) => p.url.endsWith('/mark-reviewed'))).toHaveLength(1);
  });

  it('a later edit after not_valid carries the adopted token', async () => {
    respond = (url, body) => {
      if (url.endsWith('/mark-reviewed')) return refusal(422, { code: 'not_valid', missing: ['line[0].quantity'], documentStatus: 'ERROR', updated: 'T7' });
      return undefined;
    };
    await mountLoaded(makeReview({}, { lines: [line({ quantity: null })] }));
    fireEvent.click(tid('invoice-inbox-review-mark-reviewed'));
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toBeInTheDocument());
    respond = undefined;
    typeAndBlur('invoice-inbox-review-line-0-quantity', '3');
    await waitFor(() => expect(posts.filter((p) => p.url.endsWith('/action/apply'))).toHaveLength(1));
    expect(posts.at(-1).body.updated).toBe('T7');
  });

  it('a code-less 403 on a write reads "access denied" and offers NO retry (it would be refused again)', async () => {
    respond = () => jsonRes(403, { error: { message: 'Forbidden by spec gate' } });
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '9');
    await waitFor(() => expect(saveState()).toHaveAttribute('data-state', 'error'));
    expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L('invoiceInboxSaveErrorAccess'));
    expect(screen.queryByText(/Forbidden by spec gate/)).toBeNull();
    expect(maybe('invoice-inbox-review-save-retry')).toBeNull();
    expect(tid('invoice-inbox-review-line-0-quantity')).toHaveValue('2');
  });

  it('a code-less 403 on Marcar como revisada reads "access denied" with no retry either', async () => {
    respond = (url) => (url.endsWith('/mark-reviewed') ? jsonRes(403, {}) : undefined);
    await mountLoaded();
    fireEvent.click(tid('invoice-inbox-review-mark-reviewed'));
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L('invoiceInboxSaveErrorAccess')));
    expect(maybe('invoice-inbox-review-save-retry')).toBeNull();
  });

  it('a coded 403 (feature_disabled) keeps its own reason and does offer Reintentar', async () => {
    respond = () => refusal(403, { code: 'feature_disabled' });
    await mountLoaded();
    typeAndBlur('invoice-inbox-review-line-0-quantity', '9');
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toHaveTextContent(L('invoiceInboxReviewErrorFeatureDisabled')));
    expect(tid('invoice-inbox-review-save-retry')).toBeInTheDocument();
  });
});

describe('editing — a new product whose names are not resolved (ETP-6050 S2)', () => {
  const newLine = (fresh) => line({ product: { state: 'new', id: null, candidates: [], new: fresh } });

  it('an id with no resolved name shows the "unknown" text, keeps the id selected and sends nothing by itself', async () => {
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'Tornillo', categoryId: 'C1', uomId: 'U1' })] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(within(tid('invoice-inbox-review-line-0-new-category')).getByTestId('inline-add-field-inbox-line-0-category-chip')).toHaveTextContent(L('invoiceInboxReviewNameUnknown'));
    expect(within(tid('invoice-inbox-review-line-0-new-uom')).getByTestId('inline-add-field-inbox-line-0-uom-chip')).toHaveTextContent(L('invoiceInboxReviewNameUnknown'));
    expect(maybe('invoice-inbox-review-line-0-new-error')).toBeNull();
    expect(posts).toHaveLength(0);
  });

  it('with a resolved name the name shows and the unknown text does not', async () => {
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'Tornillo', categoryId: 'C1', category: 'Ferretería', uomId: 'U1', uom: 'Unidad' })] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(tid('invoice-inbox-review-line-0-new-category')).toHaveTextContent('Ferretería');
    expect(tid('invoice-inbox-review-line-0-new-uom')).toHaveTextContent('Unidad');
    expect(tid('invoice-inbox-review-line-0-new-category')).not.toHaveTextContent(L('invoiceInboxReviewNameUnknown'));
  });

  it('picking a category sends only its id (the name is never echoed) and then shows the server-resolved name', async () => {
    catalog = { C9: 'Tornillería' };
    pickerItems([{ id: 'C9', name: 'Tornillería' }]);
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'Tornillo' })], validation: { missing: ['line[0].product'] } }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    const category = within(tid('invoice-inbox-review-line-0-new-category')).getByTestId('inline-add-field-inbox-line-0-category');
    fireEvent.focus(category);
    fireEvent.click(category);
    fireEvent.mouseDown(await screen.findByTestId('inline-add-option-inbox-line-0-category-C9'));
    await waitFor(() => expect(editOps()).toEqual([{ op: 'newProduct', index: 0, categoryId: 'C9' }]));
    await waitFor(() => expect(tid('invoice-inbox-review-line-0-new-category')).toHaveTextContent('Tornillería'));
  });
});

describe('editing — confirm flushes the autosave first (ETP-6051)', () => {
  it('a pending edit is saved BEFORE the confirm, and the confirm carries the token that save returned', async () => {
    const onConfirmed = vi.fn();
    await mountLoaded(makeReview(), { onConfirmed });
    const quantity = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(quantity);
    fireEvent.change(quantity, { target: { value: '7' } });
    fireEvent.click(tid('invoice-inbox-review-confirm'));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    const urls = posts.map((p) => p.url.split('/').pop());
    expect(urls).toEqual(['apply', 'confirm']);
    expect(posts[0].body).toEqual({ updated: 'T0', operations: [{ op: 'setLine', index: 0, quantity: 7 }] });
    expect(posts[1].body).toEqual({ updated: 'T1' });
  });

  it('clicking Confirm with a save in flight sends exactly one confirm with the new token (the button is not disabled by the save)', async () => {
    const release = holdWrites();
    const onConfirmed = vi.fn();
    await mountLoaded(makeReview(), { onConfirmed });
    const quantity = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(quantity);
    fireEvent.change(quantity, { target: { value: '3' } });
    fireEvent.blur(quantity);
    expect(tid('invoice-inbox-review-confirm')).not.toBeDisabled();
    fireEvent.click(tid('invoice-inbox-review-confirm'));
    fireEvent.click(tid('invoice-inbox-review-confirm'));
    await act(async () => { release(); });
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(posts.map((p) => p.url.split('/').pop())).toEqual(['apply', 'confirm']);
    expect(posts[1].body).toEqual({ updated: 'T1' });
  });

  it('a failed save sends no confirm and keeps the save error visible', async () => {
    respond = (url) => (url.endsWith('/action/apply') ? refusal(500, { code: 'internal' }) : undefined);
    const onConfirmed = vi.fn();
    await mountLoaded(makeReview(), { onConfirmed });
    const quantity = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(quantity);
    fireEvent.change(quantity, { target: { value: '3' } });
    fireEvent.blur(quantity);
    fireEvent.click(tid('invoice-inbox-review-confirm'));
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toBeInTheDocument());
    await act(async () => { await Promise.resolve(); });
    expect(posts.some((p) => p.url.endsWith('/action/confirm'))).toBe(false);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(tid('invoice-inbox-review-save-error')).toBeInTheDocument();
  });

  it('a failed save keeps the confirm from being sent', async () => {
    respond = (url) => (url.endsWith('/action/apply') ? refusal(422, { code: 'invalid_value' }) : undefined);
    const onConfirmed = vi.fn();
    await mountLoaded(makeReview(), { onConfirmed });
    const quantity = tid('invoice-inbox-review-line-0-quantity');
    fireEvent.focus(quantity);
    fireEvent.change(quantity, { target: { value: '7' } });
    fireEvent.click(tid('invoice-inbox-review-confirm'));
    await waitFor(() => expect(tid('invoice-inbox-review-save-error')).toBeInTheDocument());
    expect(posts.some((p) => p.url.endsWith('/action/confirm'))).toBe(false);
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});

describe('editing — new product pre-fill source hints (ETP-6051)', () => {
  const newLine = (fresh, extra = {}) => line({ ...extra, product: { state: 'new', id: null, candidates: [], new: fresh } });
  const hint = (kind) => maybe(`invoice-inbox-review-line-0-new-${kind}-source`);

  it('ocr shows "del documento" (the unit also its printed text as a tooltip); default shows "por defecto"', async () => {
    await mountLoaded(makeReview({}, { lines: [newLine(
      { name: 'Tornillo', categoryId: 'C1', category: 'Ferretería', categorySource: 'default', uomId: 'U1', uom: 'Caja', uomSource: 'ocr' },
      { unitPrinted: 'cajas' },
    )] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(hint('category')).toHaveTextContent(L('invoiceInboxReviewSourceDefault'));
    expect(hint('uom')).toHaveTextContent(L('invoiceInboxReviewSourceOcr'));
    expect(hint('uom')).toHaveTextContent('cajas');
    expect(hint('uom')).toHaveAttribute('title', L('invoiceInboxReviewUnitPrinted', { unit: 'cajas' }));
    expect(hint('category')).not.toHaveAttribute('title');
  });

  it('ocr without a printed unit shows just "del documento", with no tooltip', async () => {
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'T', categoryId: 'C1', category: 'Cat', categorySource: 'ocr', uomId: 'U1', uom: 'Caja', uomSource: 'ocr' })] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(hint('category')).toHaveTextContent(L('invoiceInboxReviewSourceOcr'));
    expect(hint('category')).not.toHaveTextContent('·');
    expect(hint('uom')).not.toHaveAttribute('title');
  });

  it('manual and an absent source show no hint', async () => {
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'T', categoryId: 'C1', category: 'Cat', categorySource: 'manual', uomId: 'U1', uom: 'Caja' })] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(hint('category')).toBeNull();
    expect(hint('uom')).toBeNull();
  });

  it('accepting the pre-fill (leaving the picker without choosing) sends nothing and keeps the hint', async () => {
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'T', categoryId: 'C1', category: 'Cat', categorySource: 'ocr', uomId: 'U1', uom: 'Caja', uomSource: 'default' })] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    const category = within(tid('invoice-inbox-review-line-0-new-category')).getByTestId('inline-add-field-inbox-line-0-category-chip');
    fireEvent.focus(category);
    fireEvent.blur(category);
    expect(posts).toHaveLength(0);
    expect(hint('category')).toHaveTextContent(L('invoiceInboxReviewSourceOcr'));
  });

  it('choosing a different category flips its hint to manual at once, before the server answers; the unit hint stays', async () => {
    pickerItems([{ id: 'C1', name: 'Cat' }, { id: 'C2', name: 'Otra' }]);
    catalog = { C2: 'Otra' };
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'T', categoryId: 'C1', category: 'Cat', categorySource: 'ocr', uomId: 'U1', uom: 'Caja', uomSource: 'default' })] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    const release = holdWrites();
    fireEvent.click(within(tid('invoice-inbox-review-line-0-new-category')).getByTestId('inline-add-field-inbox-line-0-category-chip'));
    fireEvent.mouseDown(await screen.findByTestId('inline-add-option-inbox-line-0-category-C2'));
    await waitFor(() => expect(hint('category')).toBeNull());
    expect(hint('uom')).toHaveTextContent(L('invoiceInboxReviewSourceDefault'));
    await act(async () => { release(); });
    await waitFor(() => expect(editOps()).toContainEqual({ op: 'newProduct', index: 0, categoryId: 'C2' }));
  });

  it('pickers stay required (missing hint) while no category / unit is chosen, whatever the source', async () => {
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'T' })], validation: { missing: ['line[0].product'] } }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(tid('invoice-inbox-review-line-0-new-error')).toHaveTextContent(L('invoiceInboxReviewProductNewRequired'));
    expect(hint('category')).toBeNull();
  });

  it('the product name field carries the product-name label, not the generic one', async () => {
    await mountLoaded(makeReview({}, { lines: [newLine({ name: 'T' })] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(tid('invoice-inbox-review-line-0-new-name')).toHaveAttribute('aria-label', L('invoiceInboxReviewProductName'));
    expect(tid('invoice-inbox-review-line-0-new-product')).toHaveTextContent(L('invoiceInboxReviewProductName'));
  });
});
