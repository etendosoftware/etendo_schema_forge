// @covers artifacts/sales-quotation/custom/QuotationConfirmModal.jsx
// @covers artifacts/sales-quotation/custom/SendToEvaluationModal.jsx
// @covers artifacts/sales-quotation/custom/RejectQuotationModal.jsx
//
// ETP-5398 — the three Sales Quotation action modals follow the Figma frame "PopUps":
// a summary table (Presupuesto · Contacto · Líneas · Subtotal · Total), a dark pill primary
// button and an outline Cancelar. Confirmar is mounted through the generic ActionChoiceModal;
// Enviar a evaluación and Rechazar keep their own components. Their request flows must stay
// exactly as before, so every test below also pins the API call each primary button makes.
//
// The modals live in artifacts/sales-quotation/custom/ (outside vitest's src/** include), so
// they are imported through the @generated alias like the window wrapper does.

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency } from '@/lib/formatCurrency.js';
import QuotationConfirmModal from '@generated/sales-quotation/custom/QuotationConfirmModal';
import SendToEvaluationModal from '@generated/sales-quotation/custom/SendToEvaluationModal';
import RejectQuotationModal from '@generated/sales-quotation/custom/RejectQuotationModal';

const API_BASE = '/sws/neo/sales-quotation';
const QUOTATION_ID = 'q-1';
const CURRENCY = 'EUR';
const PRIMARY_TEST_ID = 'action-confirm-modal';
const QUOTATION = {
  id: QUOTATION_ID,
  documentNo: '1000155',
  'businessPartner$_identifier': 'Distribuciones Iberia S.A.',
  'currency$_identifier': CURRENCY,
  grandTotalAmount: 12.1,
  summedLineAmount: 10,
};

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

const RECORD_URL = `${API_BASE}/quotation/${QUOTATION_ID}`;

/**
 * Stubs fetch with a list of [urlFragment, response] routes; the first matching fragment
 * wins. The record URL itself answers `record`, anything else an empty JSON body.
 * Returns the mock to assert calls on.
 */
function stubFetch(routes = [], record = QUOTATION) {
  const fetchMock = vi.fn((url) => {
    const route = routes.find(([fragment]) => url.includes(fragment));
    if (route) return route[1]();
    if (url === RECORD_URL) return jsonResponse({ response: { data: [record] } });
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const linesRoute = (count) => ['/quotationLine', () => jsonResponse({ response: { data: Array.from({ length: count }, (_, i) => ({ id: `l-${i}` })) } })];

const calledUrls = (fetchMock) => fetchMock.mock.calls.map(([url]) => url);

const modalProps = (overrides = {}) => ({
  quotationId: QUOTATION_ID,
  data: QUOTATION,
  token: 'tkn',
  apiBaseUrl: API_BASE,
  onClose: vi.fn(),
  ...overrides,
});

async function renderAndSettle(element) {
  await act(async () => { render(element); });
}

// formatCurrency separates amount and symbol with a non-breaking space, which
// toHaveTextContent would normalise away — compare the raw text instead.
function expectAmount(testId, value) {
  expect(screen.getByTestId(testId).textContent).toBe(formatCurrency(CURRENCY, value));
}

async function clickPrimary() {
  await act(async () => { fireEvent.click(screen.getByTestId(PRIMARY_TEST_ID)); });
}

function expectDarkPrimary() {
  const style = screen.getByTestId(PRIMARY_TEST_ID).getAttribute('style');
  expect(style).toContain('border-radius: 360px');
  expect(style).not.toContain('--status-info');
}

function expectFigmaSummary() {
  for (const header of ['quotation', 'contact', 'lines', 'subtotal', 'total']) {
    expect(screen.getByText(header)).toBeInTheDocument();
  }
  expect(screen.getByText(QUOTATION.documentNo)).toBeInTheDocument();
  expect(screen.getByText(QUOTATION['businessPartner$_identifier'])).toBeInTheDocument();
  expectAmount('confirm-summary-total', 12.1);
}

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { pathname: '/sales-quotation/q-1', href: '', reload: vi.fn() },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('QuotationConfirmModal — mounted on ActionChoiceModal (ETP-5398)', () => {
  it('renders the configurable title, question and the Figma summary table', async () => {
    stubFetch([linesRoute(1)]);
    await renderAndSettle(<QuotationConfirmModal {...modalProps()} />);
    expect(screen.getByRole('dialog', { name: 'sqConfirmQuotationTitle' })).toBeInTheDocument();
    expect(screen.getByText('sqWhatToDo')).toBeInTheDocument();
    expectFigmaSummary();
    expectAmount('confirm-summary-subtotal', 10);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows a placeholder line count while the lines are still loading', async () => {
    stubFetch([['/quotationLine', () => new Promise(() => {})]]);
    await renderAndSettle(<QuotationConfirmModal {...modalProps()} />);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('offers both options with the recommended badge on the order and order selected by default', async () => {
    stubFetch([linesRoute(1)]);
    await renderAndSettle(<QuotationConfirmModal {...modalProps()} />);
    expect(screen.getByTestId('confirm-option-order')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('confirm-option-order')).toHaveTextContent('soRecommended');
    // ActionChoiceModal grew a per-option badgeTone; the quotation passes none, so its
    // «Recomendado» must keep the green success tone, not the blue info one.
    expect(screen.getByText('soRecommended')).toHaveAttribute('data-badge-tone', 'success');
    expect(screen.getByTestId('confirm-option-invoice')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('sqCreateOrderDesc')).toBeInTheDocument();
    expect(screen.getByText('sqInvoiceDirectlyDesc')).toBeInTheDocument();
    expectDarkPrimary();
    expect(screen.getByTestId(PRIMARY_TEST_ID)).toHaveTextContent('continue');
  });

  it('converts the quotation into a sales order when continuing with the default option', async () => {
    const fetchMock = stubFetch([linesRoute(1)]);
    await renderAndSettle(<QuotationConfirmModal {...modalProps()} />);
    await clickPrimary();
    expect(calledUrls(fetchMock)).toContain(`${API_BASE}/quotation/${QUOTATION_ID}/action/Convertquotation`);
  });

  it('creates the invoice directly when the invoice option is chosen', async () => {
    const fetchMock = stubFetch([
      linesRoute(1),
      ['/action/createDraftInvoice', () => jsonResponse({ response: { data: { id: 'inv-1', documentNo: 'F-1', documentStatus: 'CO' } } })],
    ]);
    await renderAndSettle(<QuotationConfirmModal {...modalProps()} />);
    fireEvent.click(screen.getByTestId('confirm-option-invoice'));
    await clickPrimary();
    const urls = calledUrls(fetchMock);
    expect(urls).toContain(`${API_BASE}/quotation/${QUOTATION_ID}/action/createDraftInvoice`);
    expect(urls.some((url) => url.includes('Convertquotation'))).toBe(false);
    expect(await screen.findByText('soInvoiceCreated')).toBeInTheDocument();
  });

  it('shows the server error inside the modal when the conversion fails', async () => {
    stubFetch([
      linesRoute(1),
      ['/action/Convertquotation', () => jsonResponse({ message: 'boom' }, false, 500)],
    ]);
    await renderAndSettle(<QuotationConfirmModal {...modalProps()} />);
    await clickPrimary();
    expect(screen.getByRole('alert')).toHaveTextContent('sqOrderConfirmedErrorboom');
  });

  it('closes through onClose from the cancel button', async () => {
    stubFetch([linesRoute(1)]);
    const props = modalProps();
    await renderAndSettle(<QuotationConfirmModal {...props} />);
    fireEvent.click(screen.getByText('cancel'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SendToEvaluationModal — Figma layout (ETP-5398)', () => {
  it('renders the title, the summary table and the info alert', async () => {
    stubFetch([linesRoute(1)]);
    await renderAndSettle(<SendToEvaluationModal {...modalProps()} />);
    expect(screen.getByRole('dialog', { name: 'sqSendToEvalTitle' })).toBeInTheDocument();
    expectFigmaSummary();
    expect(screen.getByText('sqSendToEvalDesc')).toBeInTheDocument();
    expect(screen.getByTestId(PRIMARY_TEST_ID)).toHaveTextContent('sqSendToEvalConfirm');
    expectDarkPrimary();
  });

  it('keeps the subtotal discount rule: only the net amount gets the total discount factor', async () => {
    const discounted = { ...QUOTATION, etgoTotalDiscount: 10 };
    stubFetch([linesRoute(1)], discounted);
    await renderAndSettle(<SendToEvaluationModal {...modalProps({ data: discounted })} />);
    expectAmount('confirm-summary-subtotal', 9);
    expectAmount('confirm-summary-total', 12.1);
  });

  it('sends the quotation to evaluation and refreshes only the record, without reloading the page', async () => {
    const fetchMock = stubFetch([linesRoute(1)]);
    const props = modalProps({ onRefresh: vi.fn() });
    await renderAndSettle(<SendToEvaluationModal {...props} />);
    await clickPrimary();
    expect(calledUrls(fetchMock)).toContain(`${API_BASE}/quotation/${QUOTATION_ID}/action/DocAction`);
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('does not refresh when the request fails', async () => {
    stubFetch([
      linesRoute(1),
      ['/action/DocAction', () => jsonResponse({ message: 'boom' }, false, 500)],
    ]);
    const props = modalProps({ onRefresh: vi.fn() });
    await renderAndSettle(<SendToEvaluationModal {...props} />);
    await clickPrimary();
    expect(props.onRefresh).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('disables the primary button with the disabled fill when the quotation has no lines', async () => {
    stubFetch([linesRoute(0)]);
    await renderAndSettle(<SendToEvaluationModal {...modalProps()} />);
    const primary = screen.getByTestId(PRIMARY_TEST_ID);
    expect(primary).toBeDisabled();
    expect(primary.getAttribute('style')).toContain('hsl(var(--border-control))');
  });

  it('maps the backend no-lines error to the translated message', async () => {
    stubFetch([
      linesRoute(1),
      ['/action/DocAction', () => jsonResponse({ message: '@OrderWithoutLines@' }, false, 400)],
    ]);
    await renderAndSettle(<SendToEvaluationModal {...modalProps()} />);
    await clickPrimary();
    expect(screen.getByRole('alert')).toHaveTextContent('sqNoLinesError');
  });

  it('closes from the close icon', async () => {
    stubFetch([linesRoute(1)]);
    const props = modalProps();
    await renderAndSettle(<SendToEvaluationModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RejectQuotationModal — Figma differences (ETP-5398)', () => {
  it('renders the close icon with the secondary icon token', async () => {
    stubFetch();
    await renderAndSettle(<RejectQuotationModal {...modalProps()} />);
    // The close icon reuses the `cancel` label; it is the first such button in the DOM.
    const [close] = screen.getAllByRole('button', { name: 'cancel' });
    expect(close.getAttribute('style')).toContain('hsl(var(--icon-secondary))');
    expect(close.querySelector('svg')).not.toBeNull();
  });

  it('sizes the reject button to its label instead of a fixed width', async () => {
    stubFetch();
    await renderAndSettle(<RejectQuotationModal {...modalProps()} />);
    const reject = screen.getByText('rejectQuotationConfirm').closest('button');
    expect(reject.style.width).toBe('');
    expect(reject.style.height).toBe('40px');
    expect(reject).toBeDisabled();
  });

  it('keeps the description key whose copy now reads "el motivo del rechazo"', async () => {
    stubFetch();
    await renderAndSettle(<RejectQuotationModal {...modalProps()} />);
    expect(screen.getByText('rejectQuotationDesc')).toBeInTheDocument();
  });
});
