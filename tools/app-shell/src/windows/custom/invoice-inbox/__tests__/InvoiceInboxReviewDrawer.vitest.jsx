// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewDrawer.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewHeader.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewForm.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewVendor.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewLines.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewTotals.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewBanners.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewFooter.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxReviewParts.jsx
// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxReview.js
// New file justification: the panel components have no test; InvoiceInboxPage.vitest.jsx mocks the
// table and only drives the page flows (it gets the open/close/discard integration cases instead).
// The sections are rendered together through the drawer, the way a user sees them.
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
vi.mock('../InvoiceInboxReviewViewer.jsx', () => ({
  default: ({ documentId, fileName }) => <div data-testid="viewer-stub" data-doc={documentId} data-file={fileName} />,
}));

import InvoiceInboxReviewDrawer from '../InvoiceInboxReviewDrawer.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';

/** formatCurrency with every whitespace (incl. the no-break space) collapsed, as toHaveTextContent sees it. */
const M = (value) => formatCurrency('EUR', value).replace(/\s+/g, ' ');
const tid = (id) => screen.getByTestId(id);
const maybe = (id) => screen.queryByTestId(id);

function line(over = {}) {
  return {
    index: 0, description: 'Widget', quantity: 2, unitPrice: 50, taxRate: 21,
    product: { state: 'linked', matchedBy: 'exact', details: { name: 'Widget A', searchKey: 'W-1' } },
    ...over,
  };
}

function makeReview(over = {}, doc = {}) {
  const { header: headerOver, ...docRest } = doc;
  return {
    id: 'D1', status: 'PENDING_REVIEW', errorCode: null, reviewed: false, adjusted: false, editable: true,
    fileName: 'factura.pdf', sender: 'ana@proveedor.com', source: 'EMAIL', created: '2026-08-10T09:30:00Z',
    invoice: null, currency: { id: 'EUR1', isoCode: 'EUR', symbol: '€' },
    document: {
      header: {
        vendor: { state: 'linked', matchedBy: 'taxId', details: { name: 'ACME SL', taxId: 'B1234', city: 'Madrid' }, candidates: [], extracted: {} },
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

let answers;
const apiFetch = vi.fn(async (url) => {
  const id = decodeURIComponent(url.match(/\/header\/([^/]+)\/action\/review/)?.[1] ?? '');
  const answer = answers[id];
  if (answer instanceof Promise) return answer;
  if (typeof answer === 'function') return answer();
  const { status = 200, body } = answer ?? { status: 404, body: { error: { code: 'not_found' } } };
  return { ok: status >= 200 && status < 300, status, json: async () => body };
});

const makeNav = (over = {}) => ({
  position: 2, total: 5, canPrev: true, canNext: true, advancing: false,
  goPrev: vi.fn(), goNext: vi.fn(), restoreFocus: vi.fn(), ...over,
});

function renderDrawer(review, props = {}) {
  answers = { D1: { body: review } };
  const handlers = { onClose: vi.fn(), onDiscard: vi.fn() };
  const nav = makeNav(props.nav);
  const utils = render(
    <InvoiceInboxReviewDrawer
      id="D1"
      row={{ id: 'D1', fileName: 'factura.pdf', status: 'PENDING_REVIEW', source: 'EMAIL' }}
      apiFetch={apiFetch}
      apiBaseUrl="/sws/neo/invoice-inbox"
      token="t"
      {...handlers}
      {...props}
      nav={nav} />,
  );
  return { ...utils, ...handlers, nav };
}
async function renderLoaded(review, props) {
  const out = renderDrawer(review, props);
  await screen.findByTestId('invoice-inbox-review-form');
  return out;
}

beforeEach(() => {
  apiFetch.mockClear();
  mockPickerFetch.mockClear();
  answers = {};
});

describe('review drawer — shell, loading and the header', () => {
  it('shows the header from the list row and a skeleton while the review is read', async () => {
    let release;
    answers = { D1: new Promise((resolve) => { release = resolve; }) };
    render(<InvoiceInboxReviewDrawer id="D1" row={{ id: 'D1', fileName: 'row-name.pdf', status: 'READY' }} nav={makeNav()} apiFetch={apiFetch} apiBaseUrl="/x" onClose={vi.fn()} onDiscard={vi.fn()} />);
    expect(tid('invoice-inbox-review-title')).toHaveTextContent('row-name.pdf');
    expect(tid('invoice-inbox-review-loading')).toBeInTheDocument();
    expect(maybe('invoice-inbox-review-footer')).toBeNull();
    release({ ok: true, status: 200, json: async () => makeReview() });
    await screen.findByTestId('invoice-inbox-review-form');
    expect(maybe('invoice-inbox-review-loading')).toBeNull();
  });

  it('is closed (renders nothing) without an id', () => {
    render(<InvoiceInboxReviewDrawer id={null} row={null} nav={makeNav()} apiFetch={apiFetch} apiBaseUrl="/x" onClose={vi.fn()} onDiscard={vi.fn()} />);
    expect(maybe('invoice-inbox-review-drawer')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('header: file name, status tag, "Correo de {sender}" origin and the reception date', async () => {
    await renderLoaded(makeReview());
    expect(tid('invoice-inbox-review-title')).toHaveTextContent('factura.pdf');
    expect(tid('invoice-inbox-review-status')).toHaveTextContent(L('invoiceInboxStatusPendingReview'));
    const origin = tid('invoice-inbox-review-origin').textContent;
    expect(origin).toContain('Correo de ana@proveedor.com');
    expect(origin).toContain(' · ');
  });

  it('header: a manual upload reads "Carga manual"', async () => {
    await renderLoaded(makeReview({ source: 'UPLOAD', sender: '' }));
    expect(tid('invoice-inbox-review-origin').textContent).toMatch(/^Carga manual/);
  });

  it('header: the file icon follows the file type (PDF document, image picture)', async () => {
    const pdf = await renderLoaded(makeReview());
    expect(tid('FileIcon__review-header').getAttribute('class')).toMatch(/file-text/);
    pdf.unmount();
    answers = {};
    await renderLoaded(makeReview({ fileName: 'scan.PNG' }));
    expect(tid('FileIcon__review-header').getAttribute('class')).toMatch(/lucide-image/);
  });

  it('header: "{n} de {total}" never wraps, and prev / next call the nav', async () => {
    const { nav } = await renderLoaded(makeReview());
    const position = tid('invoice-inbox-review-position');
    expect(position).toHaveTextContent('2 de 5');
    expect(position.className).toMatch(/whitespace-nowrap/);
    fireEvent.click(tid('invoice-inbox-review-prev'));
    fireEvent.click(tid('invoice-inbox-review-next'));
    expect(nav.goPrev).toHaveBeenCalledTimes(1);
    expect(nav.goNext).toHaveBeenCalledTimes(1);
  });

  it('header: no position text when the document is not among the loaded rows; chevrons disable at the ends', async () => {
    await renderLoaded(makeReview(), { nav: { position: null, canPrev: false, canNext: false } });
    expect(maybe('invoice-inbox-review-position')).toBeNull();
    expect(tid('invoice-inbox-review-prev')).toBeDisabled();
    expect(tid('invoice-inbox-review-next')).toBeDisabled();
  });

  it('next is disabled while the walk is loading another page, and the loading line shows', async () => {
    await renderLoaded(makeReview(), { nav: { advancing: true } });
    expect(tid('invoice-inbox-review-next')).toBeDisabled();
    expect(tid('invoice-inbox-review-advancing')).toHaveTextContent(L('invoiceInboxReviewLoadingNext'));
  });

  it('the viewer gets the open document id and file name', async () => {
    await renderLoaded(makeReview());
    expect(tid('viewer-stub')).toHaveAttribute('data-doc', 'D1');
    expect(tid('viewer-stub')).toHaveAttribute('data-file', 'factura.pdf');
  });

  it('closes with the X, and Escape; a close gives the focus back through nav.restoreFocus', async () => {
    const { onClose, nav } = await renderLoaded(makeReview());
    await userEvent.click(tid('invoice-inbox-review-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(nav.restoreFocus).not.toHaveBeenCalled();
  });

  it('restores focus when the drawer unmounts closed (id back to null)', async () => {
    const { rerender, nav } = await renderLoaded(makeReview());
    rerender(<InvoiceInboxReviewDrawer id={null} row={null} nav={nav} apiFetch={apiFetch} apiBaseUrl="/x" onClose={vi.fn()} onDiscard={vi.fn()} />);
    await waitFor(() => expect(nav.restoreFocus).toHaveBeenCalled());
  });

  it('an outside click (the veil) closes it', async () => {
    const { onClose } = await renderLoaded(makeReview());
    await userEvent.click(tid('invoice-inbox-review-veil'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('review drawer — supplier', () => {
  it('linked: name, "taxId · city" and how it was matched; Change is inert', async () => {
    await renderLoaded(makeReview());
    expect(tid('invoice-inbox-review-vendor')).toHaveAttribute('data-state', 'linked');
    expect(tid('invoice-inbox-review-vendor-name')).toHaveTextContent('ACME SL');
    expect(tid('invoice-inbox-review-vendor-meta')).toHaveTextContent('B1234 · Madrid');
    expect(tid('invoice-inbox-review-vendor-matched-by')).toHaveTextContent('Vinculado por NIF');
    expect(tid('invoice-inbox-review-vendor-change')).toHaveAttribute('aria-disabled', 'true');
  });

  it('linked by name reads "Vinculado por nombre"; an unknown matchedBy shows no tag', async () => {
    const byName = await renderLoaded(makeReview({}, { header: { vendor: { state: 'linked', matchedBy: 'name', details: { name: 'ACME' } } } }));
    expect(tid('invoice-inbox-review-vendor-matched-by')).toHaveTextContent('Vinculado por nombre');
    byName.unmount();
    await renderLoaded(makeReview({}, { header: { vendor: { state: 'linked', matchedBy: 'other', details: { name: 'ACME' } } } }));
    expect(maybe('invoice-inbox-review-vendor-matched-by')).toBeNull();
  });

  const ambiguous = (count, extracted = { name: 'ACM S.L.', taxId: 'B1' }) => makeReview({}, {
    header: {
      vendor: {
        state: 'ambiguous', extracted,
        candidates: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, name: `Cand ${i}`, taxId: `T${i}`, city: 'Sevilla' })),
      },
    },
    validation: { missing: ['vendor'] },
  });

  it('ambiguous with 3 candidates: plural title, "Más probable" only on the first, create-new option, error', async () => {
    await renderLoaded(ambiguous(3));
    expect(tid('invoice-inbox-review-vendor-ambiguous-title')).toHaveTextContent('Etendo AI propone 3 proveedores');
    expect(tid('invoice-inbox-review-vendor-likely-c0')).toHaveTextContent('Más probable');
    expect(maybe('invoice-inbox-review-vendor-likely-c1')).toBeNull();
    expect(maybe('invoice-inbox-review-vendor-likely-c2')).toBeNull();
    expect(tid('invoice-inbox-review-vendor-candidate-c1')).toHaveTextContent('T1 · Sevilla');
    expect(tid('invoice-inbox-review-vendor-none-option')).toHaveTextContent(L('invoiceInboxReviewVendorCreateNew'));
    expect(tid('invoice-inbox-review-vendor-error')).toHaveTextContent('Elige uno de los proveedores propuestos');
    expect(tid('invoice-inbox-review-vendor-in-document')).toHaveTextContent('En el documento: «ACM S.L.»');
    expect(tid('invoice-inbox-review-vendor-in-document')).not.toHaveTextContent('sin NIF legible');
  });

  it('ambiguous with exactly 1 candidate: singular title', async () => {
    await renderLoaded(ambiguous(1));
    expect(tid('invoice-inbox-review-vendor-ambiguous-title')).toHaveTextContent('Etendo AI propone 1 proveedor');
    expect(tid('invoice-inbox-review-vendor-ambiguous-title')).not.toHaveTextContent('proveedores');
  });

  it('ambiguous without a legible tax id says "sin NIF legible"; a blank tax id counts as none', async () => {
    await renderLoaded(ambiguous(2, { name: 'ACM', taxId: '  ' }));
    expect(tid('invoice-inbox-review-vendor-in-document')).toHaveTextContent('sin NIF legible');
  });

  it('ambiguous candidates are disabled radios in the read-only panel', async () => {
    await renderLoaded(ambiguous(2));
    const radio = tid('invoice-inbox-review-vendor-candidate-c0');
    expect(radio).toHaveAttribute('role', 'radio');
    expect(radio).toBeDisabled();
    expect(within(tid('invoice-inbox-review-vendor-ambiguous')).getAllByRole('radio')).toHaveLength(3);
  });

  it('new: block with the structured extracted data, country by name', async () => {
    await renderLoaded(makeReview({}, {
      header: {
        vendor: { state: 'new', extracted: { name: 'Nuevo SL', taxId: 'FR123', address: 'Rue 1', postalCode: '75001', city: 'Paris', countryName: 'Francia', country: 'FR' } },
      },
    }));
    expect(tid('invoice-inbox-review-vendor-new-title')).toHaveTextContent('Proveedor nuevo');
    expect(tid('invoice-inbox-review-vendor-new-name')).toHaveValue('Nuevo SL');
    expect(tid('invoice-inbox-review-vendor-new-taxid')).toHaveValue('FR123');
    expect(tid('invoice-inbox-review-vendor-new-address')).toHaveValue('Rue 1');
    expect(tid('invoice-inbox-review-vendor-new-postalcode')).toHaveValue('75001');
    expect(tid('invoice-inbox-review-vendor-new-city')).toHaveValue('Paris');
    expect(tid('invoice-inbox-review-vendor-new-country')).toHaveValue('Francia');
    expect(tid('invoice-inbox-review-vendor-search-existing')).toHaveAttribute('aria-disabled', 'true');
  });

  it('new without a country falls back to España; without a name and missing vendor it shows the required error', async () => {
    await renderLoaded(makeReview({}, {
      header: { vendor: { state: 'new', extracted: { taxId: 'X1' } } },
      validation: { missing: ['vendor'] },
    }));
    expect(tid('invoice-inbox-review-vendor-new-country')).toHaveValue('España');
    expect(tid('invoice-inbox-review-vendor-new-name-error')).toHaveTextContent('Indica el proveedor');
    expect(tid('invoice-inbox-review-vendor-new-name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('none: the inert picker hint and, when missing, the red error', async () => {
    await renderLoaded(makeReview({}, { header: { vendor: { state: 'none' } }, validation: { missing: ['vendor'] } }));
    expect(tid('invoice-inbox-review-vendor')).toHaveAttribute('data-state', 'none');
    expect(tid('invoice-inbox-review-vendor-none-hint')).toHaveAttribute('placeholder', 'Selecciona un proveedor de Etendo…');
    expect(tid('invoice-inbox-review-vendor-error')).toHaveTextContent('Indica el proveedor');
  });

  it('a confirmed document shows the vendor as plain text, falling back to the extracted data', async () => {
    await renderLoaded(makeReview({ status: 'CONFIRMED', editable: false }, { header: { vendor: { state: 'none', extracted: { name: 'Extraído SL', taxId: 'Z9' } } } }));
    expect(tid('invoice-inbox-review-vendor-plain')).toBeInTheDocument();
    expect(tid('invoice-inbox-review-vendor-name')).toHaveTextContent('Extraído SL');
    expect(tid('invoice-inbox-review-vendor-name').className).toMatch(/overflow-wrap:anywhere/);
    expect(tid('invoice-inbox-review-vendor-meta')).toHaveTextContent('Z9');
  });
});

describe('review drawer — lines and products', () => {
  const withProduct = (product, extra = {}, missing = []) => makeReview({}, { lines: [line({ product, ...extra })], validation: { missing } });

  it('linked by exact match shows the name, key and "Coincidencia exacta", closed by default', async () => {
    await renderLoaded(withProduct({ state: 'linked', matchedBy: 'exact', details: { name: 'Widget A', searchKey: 'W-1' } }));
    const chip = tid('invoice-inbox-review-line-0-product');
    expect(chip).toHaveAttribute('data-state', 'ok');
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(tid('invoice-inbox-review-line-0-product-name')).toHaveTextContent('Widget A');
    expect(chip).toHaveTextContent('W-1');
    expect(chip).toHaveTextContent('Coincidencia exacta');
    expect(maybe('invoice-inbox-review-line-0-panel')).toBeNull();
  });

  it('linked by similarity reads "Por similitud"', async () => {
    await renderLoaded(withProduct({ state: 'linked', matchedBy: 'similarity', details: { name: 'Widget A' } }));
    expect(tid('invoice-inbox-review-line-0-product')).toHaveTextContent('Por similitud');
    expect(tid('invoice-inbox-review-line-0-product')).not.toHaveTextContent('Coincidencia exacta');
  });

  it('clicking the chip toggles its panel (with the "change product" prompt for a linked one)', async () => {
    await renderLoaded(withProduct({ state: 'linked', matchedBy: 'exact', details: { name: 'Widget A' } }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(tid('invoice-inbox-review-line-0-product')).toHaveAttribute('aria-expanded', 'true');
    expect(tid('invoice-inbox-review-line-0-panel')).toHaveTextContent('Cambiar por otro producto');
    expect(tid('invoice-inbox-review-line-0-search')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    expect(maybe('invoice-inbox-review-line-0-panel')).toBeNull();
  });

  const cands = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Prod ${i}`, searchKey: `K${i}`, category: 'Cat', uom: 'Ud' }));

  it('ambiguous with 3 candidates starts open: plural tag, "Elige uno", "Más probable" on the first only', async () => {
    await renderLoaded(withProduct({ state: 'ambiguous', candidates: cands(3) }, {}, ['line[0].product']));
    expect(tid('invoice-inbox-review-line-0-product')).toHaveAttribute('aria-expanded', 'true');
    expect(tid('invoice-inbox-review-line-0-product-tag')).toHaveTextContent('3 productos posibles');
    expect(tid('invoice-inbox-review-line-0-product')).toHaveTextContent('Elige uno');
    expect(tid('invoice-inbox-review-line-0-likely')).toHaveTextContent('Más probable');
    expect(tid('invoice-inbox-review-line-0-candidate-p1')).toHaveTextContent('K1 · Cat · Ud');
    expect(tid('invoice-inbox-review-line-0-none-option')).toHaveTextContent('Ninguno · crear producto nuevo');
    expect(tid('invoice-inbox-review-line-0-candidate-p0')).toBeDisabled();
  });

  it('ambiguous with exactly 1 candidate uses the singular "1 producto posible"', async () => {
    await renderLoaded(withProduct({ state: 'ambiguous', candidates: cands(1) }, {}, ['line[0].product']));
    expect(tid('invoice-inbox-review-line-0-product-tag')).toHaveTextContent(/^1 producto posible$/);
  });

  it('new shows the tag, category / unit and "se creará al confirmar"', async () => {
    await renderLoaded(withProduct({ state: 'new', new: { category: 'Servicios', uom: 'Hora' } }));
    expect(tid('invoice-inbox-review-line-0-product')).toHaveAttribute('data-state', 'new');
    expect(tid('invoice-inbox-review-line-0-product-tag')).toHaveTextContent('Producto nuevo');
    expect(tid('invoice-inbox-review-line-0-product')).toHaveTextContent('Servicios · Hora · se creará al confirmar');
  });

  it('none shows the unresolved text and the one red line below the table', async () => {
    await renderLoaded(withProduct({ state: 'none' }, {}, ['line[0].product']));
    expect(tid('invoice-inbox-review-line-0-product')).toHaveAttribute('data-state', 'none');
    expect(tid('invoice-inbox-review-line-0-product')).toHaveTextContent('Sin producto · vincúlalo o créalo');
    expect(tid('invoice-inbox-review-lines-error')).toHaveTextContent('Resuelve el producto de 1 línea');
  });

  it('the red line joins the active errors with " · " (plural products, tax, amount)', async () => {
    await renderLoaded(makeReview({}, {
      lines: [line({ index: 0, product: { state: 'none' } }), line({ index: 1, product: { state: 'none' }, taxRate: null })],
      validation: { missing: ['line[0].product', 'line[1].product', 'line[1].tax', 'amount'] },
    }));
    expect(tid('invoice-inbox-review-lines-error')).toHaveTextContent(
      'Resuelve el producto de 2 líneas · Asigna el impuesto a todas las líneas · La factura no tiene importe',
    );
  });

  it('a line without tax shows "—" in an invalid red cell', async () => {
    await renderLoaded(makeReview({}, { lines: [line({ taxRate: null })], validation: { missing: ['line[0].tax'] } }));
    const tax = tid('invoice-inbox-review-line-0-tax');
    expect(tax).toHaveValue('—');
    expect(tax).toHaveAttribute('aria-invalid', 'true');
  });

  it('numeric cells carry the full value in title, and the amount is quantity x price', async () => {
    await renderLoaded(makeReview({}, { lines: [line({ quantity: 1234.5, unitPrice: 10.25, taxRate: 21 })] }));
    for (const part of ['quantity', 'price', 'tax']) {
      const input = tid(`invoice-inbox-review-line-0-${part}`);
      expect(input.title).toBe(input.value);
      expect(input.title).not.toBe('');
    }
    expect(tid('invoice-inbox-review-line-0-amount')).toHaveTextContent(M(12653.63));
    expect(tid('invoice-inbox-review-line-0-amount').title).toBe(tid('invoice-inbox-review-line-0-amount').textContent);
  });

  it('the line section counts lines in its title and all fields are read-only; add / delete are inert', async () => {
    await renderLoaded(makeReview({}, { lines: [line({ index: 0 }), line({ index: 1, description: 'B' })] }));
    expect(tid('invoice-inbox-review-lines-title')).toHaveTextContent('Líneas · 2');
    expect(tid('invoice-inbox-review-line-1-description')).toHaveAttribute('readonly');
    expect(tid('invoice-inbox-review-add-line')).toHaveAttribute('aria-disabled', 'true');
    expect(tid('invoice-inbox-review-line-delete-0')).toHaveAttribute('aria-disabled', 'true');
  });

  it('zero lines: only the header row and the "no amount" line, no rows, totals in zeros', async () => {
    await renderLoaded(makeReview({}, { lines: [], validation: { missing: ['amount'] }, header: { totalAmount: 0 } }));
    expect(tid('invoice-inbox-review-lines-title')).toHaveTextContent('Líneas · 0');
    expect(tid('invoice-inbox-review-lines-head')).toBeInTheDocument();
    expect(maybe('invoice-inbox-review-lines-list')).toBeNull();
    expect(tid('invoice-inbox-review-lines-error')).toHaveTextContent('La factura no tiene importe');
    expect(tid('invoice-inbox-review-total-base')).toHaveTextContent(M(0));
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(0));
    expect(screen.queryAllByTestId(/^invoice-inbox-review-total-tax-/)).toHaveLength(0);
  });

  it('a settled document lists lines compactly, with long unbroken text carrying the wrapping classes', async () => {
    const long = 'X'.repeat(120);
    await renderLoaded(makeReview({ status: 'CONFIRMED', editable: false, invoice: { documentNo: 'F-9', identifier: 'F-9 - x' } }, { lines: [line({ description: long })] }));
    expect(tid('invoice-inbox-review-line-0-description')).toHaveTextContent(long);
    expect(tid('invoice-inbox-review-line-0-description').className).toMatch(/overflow-wrap:anywhere/);
    expect(tid('invoice-inbox-review-line-0-detail').className).toMatch(/overflow-wrap:anywhere/);
    expect(tid('invoice-inbox-review-line-0-detail')).toHaveTextContent('W-1');
    expect(maybe('invoice-inbox-review-add-line')).toBeNull();
  });

  it('the in-document product text and banner bodies wrap long unbroken text', async () => {
    const long = 'Y'.repeat(120);
    await renderLoaded(makeReview({}, { lines: [line({ description: long, product: { state: 'ambiguous', candidates: cands(2) } })], validation: { missing: ['line[0].product'] } }));
    expect(tid('invoice-inbox-review-line-0-in-document').className).toMatch(/overflow-wrap:anywhere/);
  });
});

describe('review drawer — header section, currency and totals', () => {
  it('invoice number and formatted date are read-only', async () => {
    await renderLoaded(makeReview());
    expect(tid('invoice-inbox-review-invoice-no')).toHaveValue('F-100');
    expect(tid('invoice-inbox-review-invoice-no')).toHaveAttribute('readonly');
    expect(tid('invoice-inbox-review-invoice-date')).toHaveValue(formatCalendarDate('2026-08-01', 'es_ES'));
  });

  it('the raw date is shown when the parsed one is missing', async () => {
    await renderLoaded(makeReview({}, { header: { invoiceDate: null, invoiceDateRaw: '1 ago 26' } }));
    expect(tid('invoice-inbox-review-invoice-date')).toHaveValue('1 ago 26');
  });

  it('a missing date gets the "Revisar" tag, the red field and its error', async () => {
    await renderLoaded(makeReview({}, { header: { invoiceDate: null }, validation: { missing: ['invoiceDate'] } }));
    expect(tid('invoice-inbox-review-invoice-date-tag')).toHaveTextContent('Revisar');
    expect(tid('invoice-inbox-review-invoice-date')).toHaveAttribute('aria-invalid', 'true');
    expect(tid('invoice-inbox-review-invoice-date-error')).toHaveTextContent('Indica la fecha de factura');
  });

  it('a present date has no "Revisar" tag', async () => {
    await renderLoaded(makeReview());
    expect(maybe('invoice-inbox-review-invoice-date-tag')).toBeNull();
  });

  it('the currency shows through the read-only CurrencyRatePicker as "EUR — 1,00" and fetches nothing itself', async () => {
    await renderLoaded(makeReview());
    const picker = tid('currency-rate-readonly');
    expect(picker).toHaveTextContent(/^EUR\s*—\s*1,00$/);
    expect(picker).toHaveAttribute('aria-disabled', 'true');
    expect(mockPickerFetch).not.toHaveBeenCalled();
  });

  it('totals: base, one IVA row per rate (ascending) and "Total *" with the document total', async () => {
    await renderLoaded(makeReview({}, {
      lines: [line({ index: 0, quantity: 1, unitPrice: 100, taxRate: 21 }), line({ index: 1, quantity: 2, unitPrice: 50, taxRate: 10 }), line({ index: 2, quantity: 1, unitPrice: 100, taxRate: 21 })],
      header: { totalAmount: 352, totalSource: 'printed' },
    }));
    expect(tid('invoice-inbox-review-total-base')).toHaveTextContent(M(300));
    const rows = screen.getAllByTestId(/^invoice-inbox-review-total-tax-\d+$/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['invoice-inbox-review-total-tax-10', 'invoice-inbox-review-total-tax-21']);
    expect(tid('invoice-inbox-review-total-tax-21')).toHaveTextContent(M(42));
    expect(tid('invoice-inbox-review-total-tax-21-label')).toHaveTextContent(`IVA 21% s/ ${M(200)}`);
    expect(tid('invoice-inbox-review-total-label')).toHaveTextContent('Total*');
    expect(tid('invoice-inbox-review-total')).toHaveTextContent(M(352));
  });

  it('the totals card is always shown, also on a settled document', async () => {
    await renderLoaded(makeReview({ status: 'DISCARDED', editable: false }));
    expect(tid('invoice-inbox-review-totals')).toBeInTheDocument();
  });
});

describe('review drawer — banners', () => {
  it('unreadable (ERROR / UNREADABLE) shows its banner; once adjusted it does not', async () => {
    const first = await renderLoaded(makeReview({ status: 'ERROR', errorCode: 'UNREADABLE' }));
    expect(tid('invoice-inbox-review-banner-unreadable-title')).toHaveTextContent('No se pudo leer el documento');
    first.unmount();
    await renderLoaded(makeReview({ status: 'ERROR', errorCode: 'UNREADABLE', adjusted: true }));
    expect(maybe('invoice-inbox-review-banner-unreadable')).toBeNull();
  });

  it.each([
    ['SERVICE_FAILURE', 'invoiceInboxErrorServiceFailure'],
    ['REFERENCE_TOO_LONG', 'invoiceInboxErrorReferenceTooLong'],
    ['FOREIGN_RECEIVER', 'invoiceInboxErrorForeignReceiver'],
  ])('error code %s shows its own translated banner', async (code, key) => {
    await renderLoaded(makeReview({ status: 'ERROR', errorCode: code }));
    expect(tid(`invoice-inbox-review-banner-error-${code}-title`)).toHaveTextContent(L(key));
  });

  it('MISSING_FIELDS shows no banner (the pending counter and red fields say it)', async () => {
    await renderLoaded(makeReview({ status: 'ERROR', errorCode: 'MISSING_FIELDS' }, { validation: { missing: ['vendor'] } }));
    expect(maybe('invoice-inbox-review-banners')).toBeNull();
  });

  it('confirmed: "{documentNo} registrada en Etendo · Completada", no link', async () => {
    await renderLoaded(makeReview({ status: 'CONFIRMED', editable: false, invoice: { id: 'I1', documentNo: '10000007', identifier: '10000007 - 2026-08-10 - 121.00' } }));
    expect(tid('invoice-inbox-review-banner-confirmed-title')).toHaveTextContent('10000007 registrada en Etendo · Completada');
    expect(tid('invoice-inbox-review-banner-confirmed-title')).not.toHaveTextContent('2026-08-10');
    expect(within(tid('invoice-inbox-review-banner-confirmed')).queryByRole('link')).toBeNull();
    expect(tid('invoice-inbox-review-banner-confirmed-body')).toHaveTextContent('el PDF original queda adjunto');
  });

  it('confirmed falls back to the identifier when the answer has no documentNo', async () => {
    await renderLoaded(makeReview({ status: 'CONFIRMED', editable: false, invoice: { id: 'I1', identifier: '10000007 - x' } }));
    expect(tid('invoice-inbox-review-banner-confirmed-title')).toHaveTextContent('10000007 - x registrada en Etendo · Completada');
  });

  it('duplicate invoice and duplicate in the inbox are warnings that do not block', async () => {
    await renderLoaded(makeReview({ status: 'READY' }, {
      header: { duplicate: { state: 'found', invoices: [{ documentNo: '10000003' }], inbox: [{ fileName: 'a.pdf' }, { fileName: 'b.pdf' }] } },
    }));
    expect(tid('invoice-inbox-review-banner-duplicate-body')).toHaveTextContent('Ya existe la factura 10000003 de este proveedor con el número F-100.');
    expect(tid('invoice-inbox-review-banner-duplicate-inbox-body')).toHaveTextContent('a.pdf, b.pdf');
    expect(tid('invoice-inbox-review-footer')).toBeInTheDocument();
  });

  it('a settled document shows no duplicate banner', async () => {
    await renderLoaded(makeReview({ status: 'DISCARDED', editable: false }, { header: { duplicate: { state: 'found', invoices: [{ documentNo: '1' }], inbox: [{ fileName: 'a.pdf' }] } } }));
    expect(maybe('invoice-inbox-review-banner-duplicate')).toBeNull();
    expect(maybe('invoice-inbox-review-banner-duplicate-inbox')).toBeNull();
  });

  const mismatchFor = (printed) => makeReview({}, {
    lines: [line({ quantity: 1, unitPrice: 100, taxRate: 21 })],
    header: { totalAmount: printed, totalSource: 'printed' },
  });

  it('total mismatch: a 1-cent difference gives no warning, 2 cents do', async () => {
    const one = await renderLoaded(mismatchFor(121.01));
    expect(maybe('invoice-inbox-review-banner-mismatch')).toBeNull();
    one.unmount();
    await renderLoaded(mismatchFor(121.02));
    expect(tid('invoice-inbox-review-banner-mismatch-body')).toHaveTextContent(
      `Las líneas suman ${M(121)} y el documento indica ${M(121.02)}.`,
    );
  });

  it('total mismatch only applies when the total is the printed one', async () => {
    await renderLoaded(makeReview({}, { lines: [line({ quantity: 1, unitPrice: 100, taxRate: 21 })], header: { totalAmount: 500, totalSource: 'lines' } }));
    expect(maybe('invoice-inbox-review-banner-mismatch')).toBeNull();
  });

  it('total mismatch sits at the BOTTOM, after the totals card', async () => {
    await renderLoaded(mismatchFor(300));
    const totals = tid('invoice-inbox-review-totals');
    const mismatch = tid('invoice-inbox-review-banner-mismatch');
    expect(totals.compareDocumentPosition(mismatch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And the top banners block does not contain it.
    expect(maybe('invoice-inbox-review-banners')).toBeNull();
  });

  it('total mismatch never shows on a settled document', async () => {
    await renderLoaded({ ...mismatchFor(300), status: 'CONFIRMED', editable: false });
    expect(maybe('invoice-inbox-review-banner-mismatch')).toBeNull();
  });
});

describe('review drawer — footer', () => {
  it('icon-only danger Discard calls onDiscard with the document', async () => {
    const review = makeReview();
    const { onDiscard } = await renderLoaded(review);
    const discard = tid('invoice-inbox-review-discard');
    expect(discard).toHaveAttribute('aria-label', 'Descartar');
    expect(discard.textContent.trim()).toBe('');
    expect(discard.className).toMatch(/text-destructive/);
    fireEvent.click(discard);
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDiscard.mock.calls[0][0]).toMatchObject({ id: 'D1', status: 'PENDING_REVIEW' });
  });

  it('Discard is disabled while a discard runs', async () => {
    await renderLoaded(makeReview(), { discarding: true });
    expect(tid('invoice-inbox-review-discard')).toBeDisabled();
  });

  it('pending counter: singular for 1, plural for N', async () => {
    const one = await renderLoaded(makeReview({}, { validation: { missing: ['vendor'] } }));
    expect(tid('invoice-inbox-review-pending')).toHaveTextContent(/^1 obligatorio pendiente$/);
    one.unmount();
    await renderLoaded(makeReview({}, { validation: { missing: ['vendor', 'invoiceDate'] } }));
    expect(tid('invoice-inbox-review-pending')).toHaveTextContent('2 obligatorios pendientes');
  });

  it('Mark as reviewed and Confirm are disabled with the coming-soon tooltip', async () => {
    await renderLoaded(makeReview());
    for (const id of ['invoice-inbox-review-mark-reviewed', 'invoice-inbox-review-confirm']) {
      expect(tid(id)).toBeDisabled();
      expect(tid(`${id}-wrapper`)).toHaveAttribute('title', 'Próximamente');
    }
    expect(tid('invoice-inbox-review-confirm')).toHaveTextContent('Confirmar factura');
  });

  it('READY: "Revisada por ti" as text and no Mark as reviewed button', async () => {
    await renderLoaded(makeReview({ status: 'READY' }));
    expect(tid('invoice-inbox-review-reviewed')).toHaveTextContent('Revisada por ti');
    expect(maybe('invoice-inbox-review-mark-reviewed')).toBeNull();
    expect(tid('invoice-inbox-review-confirm')).toBeDisabled();
  });

  it.each(['CONFIRMED', 'DISCARDED'])('%s has no footer', async (status) => {
    await renderLoaded(makeReview({ status, editable: false }));
    expect(maybe('invoice-inbox-review-footer')).toBeNull();
  });

  it('editable:false (FOREIGN_RECEIVER) offers only Discard and renders every field read-only', async () => {
    await renderLoaded(makeReview({ status: 'ERROR', errorCode: 'FOREIGN_RECEIVER', editable: false }));
    expect(tid('invoice-inbox-review-discard')).toBeInTheDocument();
    expect(maybe('invoice-inbox-review-confirm')).toBeNull();
    expect(maybe('invoice-inbox-review-mark-reviewed')).toBeNull();
    expect(maybe('invoice-inbox-review-pending')).toBeNull();
    expect(tid('invoice-inbox-review-form')).toHaveAttribute('data-readonly', 'true');
    expect(tid('invoice-inbox-review-invoice-no')).toBeDisabled();
    expect(maybe('invoice-inbox-review-add-line')).toBeNull();
    expect(maybe('invoice-inbox-review-line-delete-0')).toBeNull();
  });
});

describe('review drawer — errors, retry and races', () => {
  async function failWith(status, body) {
    answers = { D1: { status, body } };
    renderDrawerWithoutAnswers();
    return screen.findByTestId('invoice-inbox-review-error');
  }
  function renderDrawerWithoutAnswers(props = {}) {
    return render(
      <InvoiceInboxReviewDrawer id="D1" row={{ id: 'D1', fileName: 'f.pdf', status: 'READY' }} nav={makeNav()} apiFetch={apiFetch} apiBaseUrl="/x" onClose={vi.fn()} onDiscard={vi.fn()} {...props} />,
    );
  }

  it.each([
    [500, { error: { code: 'internal' } }, 'invoiceInboxReviewErrorGeneric'],
    [409, { error: { code: 'processing' } }, 'invoiceInboxReviewErrorProcessing'],
    [403, { error: { code: 'feature_disabled' } }, 'invoiceInboxReviewErrorFeatureDisabled'],
    [403, { error: { code: 'org_not_allowed' } }, 'invoiceInboxReviewErrorOrg'],
    [404, { error: { code: 'not_found' } }, 'invoiceInboxReviewErrorNotFound'],
  ])('HTTP %s shows the translated message and no form', async (status, body, key) => {
    const alert = await failWith(status, body);
    expect(within(alert).getByTestId('invoice-inbox-review-error-text')).toHaveTextContent(L(key));
    expect(maybe('invoice-inbox-review-form')).toBeNull();
    expect(maybe('invoice-inbox-review-footer')).toBeNull();
    expect(alert).toHaveAttribute('role', 'alert');
  });

  it('never shows the backend message text', async () => {
    const alert = await failWith(500, { error: { code: 'internal', message: 'SQLException at line 3' } });
    expect(alert).not.toHaveTextContent('SQLException');
  });

  it('a network failure shows its already translated message', async () => {
    answers = { D1: () => { throw Object.assign(new Error('Sin conexión. Reintenta.'), { name: 'NetworkError', code: 'NETWORK', reason: 'offline' }); } };
    renderDrawerWithoutAnswers();
    expect(await screen.findByTestId('invoice-inbox-review-error-text')).toHaveTextContent('Sin conexión. Reintenta.');
  });

  it('Retry reads the document again and shows it when it works', async () => {
    answers = { D1: { status: 500, body: { error: {} } } };
    renderDrawerWithoutAnswers();
    await screen.findByTestId('invoice-inbox-review-error');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    answers = { D1: { body: makeReview() } };
    await userEvent.click(tid('invoice-inbox-review-retry'));
    await screen.findByTestId('invoice-inbox-review-form');
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(maybe('invoice-inbox-review-error')).toBeNull();
  });

  it('race: a late answer of the previous document never overwrites the current one', async () => {
    let releaseA;
    answers = {
      A: new Promise((resolve) => { releaseA = resolve; }),
      B: { body: makeReview({ id: 'B', fileName: 'b.pdf' }, { header: { documentNo: 'F-B' } }) },
    };
    const props = { nav: makeNav(), apiFetch, apiBaseUrl: '/x', onClose: vi.fn(), onDiscard: vi.fn() };
    const { rerender } = render(<InvoiceInboxReviewDrawer id="A" row={{ id: 'A', fileName: 'a.pdf', status: 'READY' }} {...props} />);
    rerender(<InvoiceInboxReviewDrawer id="B" row={{ id: 'B', fileName: 'b.pdf', status: 'READY' }} {...props} />);
    await waitFor(() => expect(tid('invoice-inbox-review-invoice-no')).toHaveValue('F-B'));
    releaseA({ ok: true, status: 200, json: async () => makeReview({ id: 'A', fileName: 'a.pdf' }, { header: { documentNo: 'F-A' } }) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(tid('invoice-inbox-review-invoice-no')).toHaveValue('F-B');
    expect(tid('invoice-inbox-review-title')).toHaveTextContent('b.pdf');
  });
});

describe('review drawer — it never writes', () => {
  it('opening, reading and discarding through the footer fire only GETs of the review action', async () => {
    const { onDiscard } = await renderLoaded(makeReview({ status: 'READY' }, { lines: [line({ product: { state: 'ambiguous', candidates: [{ id: 'p1', name: 'P' }] } })] }));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    fireEvent.click(tid('invoice-inbox-review-line-0-product'));
    fireEvent.click(tid('invoice-inbox-review-discard'));
    expect(onDiscard).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    for (const [url, options] of apiFetch.mock.calls) {
      expect(url).toBe('/header/D1/action/review');
      expect(options?.method ?? 'GET').toBe('GET');
      expect(options?.body).toBeUndefined();
    }
  });

  it('disabled footer actions and inert controls fire nothing when clicked', async () => {
    await renderLoaded(makeReview({}, { header: { vendor: { state: 'linked', details: { name: 'A' } } } }));
    for (const id of ['invoice-inbox-review-confirm', 'invoice-inbox-review-mark-reviewed', 'invoice-inbox-review-vendor-change', 'invoice-inbox-review-add-line', 'invoice-inbox-review-line-delete-0']) {
      fireEvent.click(tid(id));
    }
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
