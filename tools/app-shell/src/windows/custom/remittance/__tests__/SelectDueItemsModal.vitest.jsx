// @covers artifacts/remittance/custom/SelectDueItemsModal.jsx
//
// «Seleccionar desde factura» over the generic DocumentPickerModal: the server owns the due list
// (search + paging through `availableDueItems`); dues already in the remittance open checked with
// their line amount; confirming sends the difference in ONE `syncDueItems` call. Rendered with the
// real DocumentPickerModal, RecordLink and remittanceDueItemsApi; only the request boundary
// (`useApiFetch`), the toasts and `useNavigate` are mocked. Fake timers pin the 300 ms debounce.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => mockNavigate }));

// Stable translator (the loader depends on it). Keys echo back with their params; the backend
// refusal keys resolve, so the messageKeys route of backendErrors.js can be observed.
const mockDictionary = {
  'backendError.remittanceLineAmountInvalid': 'T:lineAmountInvalid',
  'backendError.remittanceLineAmountNotEditable': 'T:lineAmountNotEditable',
  'backendError.remittanceDueItemNotIncluded': 'T:dueItemNotIncluded',
  'backendError.remittanceTypeOrAccountMissing': 'T:typeOrAccountMissing',
};
const mockUi = (key, params) => mockDictionary[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi, useLocaleSwitch: () => ({ locale: 'es-ES' }) }));

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { toast } from 'sonner';
import SelectDueItemsModal from '@generated/remittance/custom/SelectDueItemsModal.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';

const API = '/sws/neo/remittance';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const due = (n, extra = {}) => ({
  id: `psd-${n}`, documentNo: `FAC-${n}`, businessPartner: `Partner ${n}`, invoiceId: `INV-${n}`, salesTransaction: true,
  invoiceDate: '2026-11-01', dueDate: '2026-12-01', grandTotalAmount: 100 * n, outstandingAmount: 100 * n, currency: 'EUR',
  alreadyInRemittance: false, ...extra,
});
const page = (items, total) => jsonResponse({ response: { data: { items, total } } });

const callsTo = (action) => mockApiFetch.mock.calls.filter(([url]) => url.endsWith(`/action/${action}`));
const bodiesOf = (action) => callsTo(action).map(([, init]) => JSON.parse(init.body));

let availableAnswers;
let syncAnswers;
function installRoutes() {
  availableAnswers = [];
  syncAnswers = [];
  mockApiFetch.mockImplementation((url) => {
    if (url.endsWith('/action/availableDueItems')) {
      const next = availableAnswers.shift();
      return next ? (next.promise ?? Promise.resolve(next)) : Promise.resolve(page([], 0));
    }
    if (url.endsWith('/action/syncDueItems')) {
      return Promise.resolve(syncAnswers.shift() ?? jsonResponse({ response: { data: {} } }));
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function renderModal(props = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <SelectDueItemsModal remittanceId="rem-1" apiBaseUrl={API} onClose={onClose} onSuccess={onSuccess} {...props} />,
  );
  await flush();
  return { ...utils, onClose, onSuccess };
}

const rowIds = () => [...document.body.querySelectorAll('[data-testid^="document-picker-row-"]')]
  .map((node) => node.getAttribute('data-testid').replace('document-picker-row-', ''));
const row = (id) => screen.getByTestId(`document-picker-row-${id}`);
const search = () => screen.getByTestId('document-picker-search');
const confirm = () => screen.getByTestId('document-picker-confirm');
const amountInput = (id) => screen.getByTestId(`document-picker-amount-${id}-input`);

function setAmount(id, value) {
  fireEvent.focus(amountInput(id));
  fireEvent.change(amountInput(id), { target: { value } });
}

function scrollListToBottom() {
  const list = screen.getByTestId('document-picker-list');
  Object.defineProperty(list, 'scrollTop', { value: 640, configurable: true });
  Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(list, 'scrollHeight', { value: 1050, configurable: true });
  fireEvent.scroll(list);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockApiFetch.mockReset();
  installRoutes();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SelectDueItemsModal — loading and wording', () => {
  it('loads the first page (1-based, 20 per page, empty search) on open', async () => {
    availableAnswers.push(page([due(1), due(2)], 2));
    await renderModal();
    expect(callsTo('availableDueItems')[0][0]).toBe('/remittance/rem-1/action/availableDueItems');
    expect(bodiesOf('availableDueItems')).toEqual([{ search: '', page: 1, pageSize: 20 }]);
    expect(rowIds()).toEqual(['psd-1', 'psd-2']);
  });

  it('shows the loading state until the first page arrives', async () => {
    const pending = deferred();
    availableAnswers.push({ promise: pending.promise });
    await renderModal();
    expect(screen.getByTestId('document-picker-loading')).toBeInTheDocument();
    await act(async () => { pending.resolve(page([due(1)], 1)); });
    expect(screen.queryByTestId('document-picker-loading')).toBeNull();
    expect(rowIds()).toEqual(['psd-1']);
  });

  it('uses the remittance wording, subtitle and columns', async () => {
    availableAnswers.push(page([due(1, { dueStatus: 'OVERDUE' })], 1));
    await renderModal({ subtitle: 'Remesa de cobro · Banco' });
    expect(screen.getByTestId('document-picker-modal')).toHaveAttribute('aria-label', 'remittanceSelectDueItemsTitle');
    expect(screen.getByTestId('document-picker-subtitle')).toHaveTextContent('Remesa de cobro · Banco');
    expect(search()).toHaveAttribute('placeholder', 'remittanceSearchDueItems');
    expect(screen.getByTestId('document-picker-notice')).toHaveTextContent('remittanceDueItemsNoticeTitle');
    const header = screen.getByTestId('document-picker-header');
    // The first column is «Factura» / «Invoice» (the generic `invoice` key): every row is an
    // invoice due, and the lines grid calls the same column «Factura».
    const headings = [...header.querySelectorAll('span')].map((el) => el.textContent).filter(Boolean);
    expect(headings).toEqual(['invoice', 'remittanceColInvoiceDate', 'remittanceColDueDate', 'remittanceColPartner',
      'remittanceColTotal', 'remittanceColOutstanding', 'remittanceColToRemit']);
    expect(row('psd-1')).toHaveTextContent('01/12/2026');
    expect(row('psd-1')).toHaveTextContent('Partner 1');
    expect(screen.getByTestId('remittance-due-status-psd-1')).toHaveTextContent('remittanceDueStatusOverdue');
  });

  it('shows the empty notice when nothing is pending', async () => {
    availableAnswers.push(page([], 0));
    await renderModal();
    expect(screen.getByTestId('document-picker-empty')).toHaveTextContent('remittanceNoDueItems');
  });

  it('toasts the translated load error and shows an empty list', async () => {
    availableAnswers.push(jsonResponse({ error: { message: 'x', messageKeys: ['ETGO_RemittanceTypeOrAccountMissing'] } }, { ok: false, status: 422 }));
    await renderModal();
    expect(toast.error).toHaveBeenCalledWith('T:typeOrAccountMissing');
    expect(screen.getByTestId('document-picker-empty')).toBeInTheDocument();
  });

  it('falls back to remittanceDueItemsLoadError when the failure carries nothing usable', async () => {
    availableAnswers.push({ ok: false, status: 500, json: async () => { throw new Error('no json'); } });
    await renderModal();
    expect(toast.error).toHaveBeenCalledWith('remittanceDueItemsLoadError');
  });
});

describe('SelectDueItemsModal — search', () => {
  it('debounces the search by 300 ms and sends only the last text, from page 1', async () => {
    availableAnswers.push(page([due(1), due(2)], 2));
    await renderModal();
    availableAnswers.push(page([due(2)], 1));
    fireEvent.change(search(), { target: { value: 'a' } });
    await flush(100);
    fireEvent.change(search(), { target: { value: 'acme' } });
    await flush(299);
    expect(callsTo('availableDueItems')).toHaveLength(1);
    await flush(1);
    expect(bodiesOf('availableDueItems')[1]).toEqual({ search: 'acme', page: 1, pageSize: 20 });
    expect(callsTo('availableDueItems')).toHaveLength(2);
    expect(rowIds()).toEqual(['psd-2']);
  });

  it('drops a late answer that a newer search superseded', async () => {
    const slowFirst = deferred();
    availableAnswers.push({ promise: slowFirst.promise });
    await renderModal();
    availableAnswers.push(page([due(9)], 1));
    fireEvent.change(search(), { target: { value: 'nine' } });
    await flush(300);
    expect(rowIds()).toEqual(['psd-9']);
    await act(async () => { slowFirst.resolve(page([due(1), due(2)], 2)); });
    expect(rowIds()).toEqual(['psd-9']);
  });
});

describe('SelectDueItemsModal — paging', () => {
  const twenty = (offset = 0) => Array.from({ length: 20 }, (_, i) => due(offset + i + 1));

  it('asks for the next page at the bottom and stops once `total` rows are loaded', async () => {
    availableAnswers.push(page(twenty(), 22));
    await renderModal();
    availableAnswers.push(page([due(21), due(22)], 22));
    scrollListToBottom();
    await flush();
    expect(bodiesOf('availableDueItems')[1]).toEqual({ search: '', page: 2, pageSize: 20 });
    expect(rowIds()).toHaveLength(22);
    scrollListToBottom();
    await flush();
    expect(callsTo('availableDueItems')).toHaveLength(2);
  });

  it('keeps the search text on the next page', async () => {
    availableAnswers.push(page(twenty(), 40));
    await renderModal();
    availableAnswers.push(page(twenty(), 40));
    fireEvent.change(search(), { target: { value: 'fac' } });
    await flush(300);
    availableAnswers.push(page(twenty(20), 40));
    scrollListToBottom();
    await flush();
    expect(bodiesOf('availableDueItems')[2]).toEqual({ search: 'fac', page: 2, pageSize: 20 });
  });

  it('does not ask for more when the first page holds the whole set', async () => {
    availableAnswers.push(page([due(1)], 1));
    await renderModal();
    scrollListToBottom();
    await flush();
    expect(callsTo('availableDueItems')).toHaveLength(1);
  });
});

describe('SelectDueItemsModal — dues already in the remittance', () => {
  it('open checked with their line amount; the others show their outstanding', async () => {
    availableAnswers.push(page([due(1, { alreadyInRemittance: true, lineAmount: 30 }), due(2)], 2));
    await renderModal();
    expect(row('psd-1')).toHaveAttribute('aria-selected', 'true');
    expect(amountInput('psd-1').value).toMatch(/^30(,00)?$/);
    expect(row('psd-2')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('document-picker-status').textContent)
      .toBe(`remittanceDueItemsFooter:${JSON.stringify({ count: 1, total: formatCurrency('EUR', 30) })}`);
    expect(confirm()).toBeDisabled();
  });
});

describe('SelectDueItemsModal — confirm (syncDueItems)', () => {
  const LOADED = [
    due(1, { alreadyInRemittance: true, lineAmount: 30 }),
    due(2),
    due(3, { alreadyInRemittance: true, lineAmount: 300 }),
  ];

  async function pickChanges() {
    availableAnswers.push(page(LOADED, 3));
    const utils = await renderModal();
    fireEvent.click(row('psd-2'));
    setAmount('psd-1', '45');
    fireEvent.click(row('psd-3'));
    return utils;
  }

  it('sends new and changed dues in `items` (numbers) and unchecked included dues in `remove`', async () => {
    syncAnswers.push(jsonResponse({ response: { data: { created: 1, updated: 1, removed: 1 } } }));
    await pickChanges();
    await act(async () => { fireEvent.click(confirm()); });
    expect(callsTo('syncDueItems')[0][0]).toBe('/remittance/rem-1/action/syncDueItems');
    expect(bodiesOf('syncDueItems')).toEqual([{
      items: [{ id: 'psd-2', amount: 200 }, { id: 'psd-1', amount: 45 }],
      remove: ['psd-3'],
    }]);
  });

  it('toasts what changed and hands the result to onSuccess', async () => {
    syncAnswers.push(jsonResponse({ response: { data: { created: 1, updated: 1, removed: 1, message: 'ok' } } }));
    const { onSuccess, onClose } = await pickChanges();
    await act(async () => { fireEvent.click(confirm()); });
    const result = { created: 1, updated: 1, removed: 1, message: 'ok' };
    expect(toast.success).toHaveBeenCalledWith(`remittanceDueItemsSynced:${JSON.stringify(result)}`);
    expect(onSuccess).toHaveBeenCalledWith(result);
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ['ETGO_RemittanceLineAmountInvalid', 'T:lineAmountInvalid'],
    ['ETGO_RemittanceLineAmountNotEditable', 'T:lineAmountNotEditable'],
    ['ETGO_RemittanceDueItemNotIncluded', 'T:dueItemNotIncluded'],
  ])('translates the %s refusal and stays open', async (messageKey, translated) => {
    syncAnswers.push(jsonResponse({ error: { message: 'Texto del backend.', messageKeys: [messageKey], invalidIds: ['psd-2'] } }, { ok: false, status: 422 }));
    const { onSuccess } = await pickChanges();
    await act(async () => { fireEvent.click(confirm()); });
    expect(toast.error).toHaveBeenCalledWith(translated);
    expect(toast.success).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId('document-picker-modal')).toBeInTheDocument();
    // The picker is usable again for a retry.
    expect(confirm()).not.toBeDisabled();
  });

  it('falls back to remittanceDueItemsSyncError when the refusal carries nothing usable', async () => {
    syncAnswers.push({ ok: false, status: 500, json: async () => { throw new Error('no json'); } });
    await pickChanges();
    await act(async () => { fireEvent.click(confirm()); });
    expect(toast.error).toHaveBeenCalledWith('remittanceDueItemsSyncError');
  });
});

describe('SelectDueItemsModal — Documento link', () => {
  it.each([
    [true, '/sales-invoice/INV-1'],
    [false, '/purchase-invoice/INV-1'],
  ])('salesTransaction %s opens %s and closes the modal', async (salesTransaction, route) => {
    availableAnswers.push(page([due(1, { salesTransaction })], 1));
    const { onClose } = await renderModal();
    const link = screen.getByTestId('remittance-due-item-link-psd-1');
    expect(link).toHaveTextContent('FAC-1');
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(route);
    // The link click does not toggle the row.
    expect(row('psd-1')).toHaveAttribute('aria-selected', 'false');
  });

  // User decision (round 3 live test): the Documento cell is the invoice number with its link
  // only, with no second line under it.
  it('shows only the document number in the Documento cell', async () => {
    availableAnswers.push(page([due(1)], 1));
    await renderModal();
    const cell = within(row('psd-1')).getByTestId('document-picker-cell-document');
    expect(cell).toHaveTextContent(/^FAC-1$/);
  });

  it('renders the document number as plain text when there is no invoice id', async () => {
    availableAnswers.push(page([due(1, { invoiceId: null })], 1));
    await renderModal();
    expect(screen.queryByTestId('remittance-due-item-link-psd-1')).toBeNull();
    expect(row('psd-1')).toHaveTextContent('FAC-1');
  });
});
