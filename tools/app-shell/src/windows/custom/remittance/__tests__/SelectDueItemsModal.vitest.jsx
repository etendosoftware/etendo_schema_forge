// @covers artifacts/remittance/custom/SelectDueItemsModal.jsx
//
// «Seleccionar desde factura»: the server-driven due-item picker. Rendered through the real
// shared InvoicePickerModal and the real remittanceDueItemsApi; only the request boundary
// (`useApiFetch`) and the toasts are mocked. Fake timers pin the 300 ms search debounce.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// Stable translator: the component's loader depends on it, so a fresh function per render would
// reload forever. Keys echo back (with their params); the two backend keys resolve so the
// messageKeys route of backendErrors.js can be observed.
const mockDictionary = {
  'backendError.remittanceDueItemNotAvailable': 'T:dueItemNotAvailable',
  'backendError.remittanceTypeOrAccountMissing': 'T:typeOrAccountMissing',
};
const mockUi = (key, params) => mockDictionary[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

import { act, fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import SelectDueItemsModal from '@generated/remittance/custom/SelectDueItemsModal.jsx';

const API = '/sws/neo/remittance';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const dueItem = (n, extra = {}) => ({
  id: `psd-${n}`, documentNo: `FAC-${n}`, businessPartner: `Partner ${n}`,
  dueDate: '2026-12-01', outstandingAmount: n, currency: 'EUR', ...extra,
});
const page = (items, total) => jsonResponse({ response: { data: { items, total } } });

const callsTo = (action) => mockApiFetch.mock.calls.filter(([url]) => url.endsWith(`/action/${action}`));
const bodiesOf = (action) => callsTo(action).map(([, init]) => JSON.parse(init.body));

// Routes each action to its own queue of answers (mockResolvedValueOnce per action).
let availableAnswers;
let selectAnswers;
function installRoutes() {
  availableAnswers = [];
  selectAnswers = [];
  mockApiFetch.mockImplementation((url) => {
    if (url.endsWith('/action/availableDueItems')) {
      const next = availableAnswers.shift();
      return next ? (next.promise ?? Promise.resolve(next)) : Promise.resolve(page([], 0));
    }
    if (url.endsWith('/action/selectDueItems')) {
      return Promise.resolve(selectAnswers.shift() ?? jsonResponse({ response: { data: { created: 0 } } }));
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

const rowIds = () => [...document.body.querySelectorAll('[data-testid^="remittance-due-items-option-"]')]
  .map((node) => node.getAttribute('data-testid').replace('remittance-due-items-option-', ''));
const row = (id) => screen.getByTestId(`remittance-due-items-option-${id}`);
const search = () => screen.getByTestId('remittance-due-items-search');
const apply = () => screen.getByTestId('remittance-due-items-apply');

// jsdom has no layout: install the scroll geometry by hand, inside the picker's 60px margin.
function scrollListToBottom() {
  const list = screen.getByTestId('remittance-due-items-list');
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

describe('SelectDueItemsModal — first load', () => {
  it('loads the first page (1-based, 20 per page, empty search) on open', async () => {
    availableAnswers.push(page([dueItem(1), dueItem(2)], 2));
    await renderModal();
    expect(bodiesOf('availableDueItems')).toEqual([{ search: '', page: 1, pageSize: 20 }]);
    expect(callsTo('availableDueItems')[0][0]).toBe('/remittance/rem-1/action/availableDueItems');
    expect(rowIds()).toEqual(['psd-1', 'psd-2']);
  });

  it('shows the loading line until the first page arrives', async () => {
    const pending = deferred();
    availableAnswers.push({ promise: pending.promise });
    render(<SelectDueItemsModal remittanceId="rem-1" apiBaseUrl={API} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await flush();
    expect(screen.getByText('loading')).toBeInTheDocument();
    await act(async () => { pending.resolve(page([dueItem(1)], 1)); });
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(rowIds()).toEqual(['psd-1']);
  });

  it('uses the remittance wording and shows each row’s due date and outstanding amount', async () => {
    availableAnswers.push(page([dueItem(1, { outstandingAmount: 1234.5, invoiceDate: '2020-01-01', grandTotalAmount: 9999 })], 1));
    await renderModal();
    expect(screen.getByText('remittanceSelectDueItemsTitle')).toBeInTheDocument();
    expect(search()).toHaveAttribute('placeholder', 'remittanceSearchDueItems');
    expect(apply()).toHaveTextContent('remittanceAddDueItems');
    expect(screen.getByText('remittanceDueItemsSelectedCount:{"count":0}')).toBeInTheDocument();
    expect(screen.getByTestId('remittance-due-items-select-all')).toBeInTheDocument();
    expect(row('psd-1')).toHaveTextContent('01/12/2026');
    expect(row('psd-1')).toHaveTextContent('1.234,50 €');
    expect(row('psd-1')).not.toHaveTextContent('9.999,00');
  });

  it('shows the empty notice when nothing is pending', async () => {
    availableAnswers.push(page([], 0));
    await renderModal();
    expect(screen.getByTestId('remittance-due-items-no-matches')).toHaveTextContent('remittanceNoDueItems');
  });

  it('toasts the translated load error and shows an empty list when loading fails', async () => {
    availableAnswers.push(jsonResponse(
      { error: { message: 'x', messageKeys: ['ETGO_RemittanceTypeOrAccountMissing'] } }, { ok: false, status: 422 },
    ));
    await renderModal();
    expect(toast.error).toHaveBeenCalledWith('T:typeOrAccountMissing');
    expect(screen.getByTestId('remittance-due-items-no-matches')).toBeInTheDocument();
  });

  it('falls back to remittanceDueItemsLoadError when the failure carries nothing usable', async () => {
    availableAnswers.push({ ok: false, status: 500, json: async () => { throw new Error('no json'); } });
    await renderModal();
    expect(toast.error).toHaveBeenCalledWith('remittanceDueItemsLoadError');
  });
});

describe('SelectDueItemsModal — search', () => {
  it('debounces the search by 300 ms and sends only the last text, from page 1', async () => {
    availableAnswers.push(page([dueItem(1), dueItem(2)], 2));
    await renderModal();
    expect(callsTo('availableDueItems')).toHaveLength(1);

    availableAnswers.push(page([dueItem(2)], 1));
    fireEvent.change(search(), { target: { value: 'a' } });
    await flush(100);
    fireEvent.change(search(), { target: { value: 'ac' } });
    await flush(100);
    fireEvent.change(search(), { target: { value: 'acme' } });
    await flush(299);
    expect(callsTo('availableDueItems')).toHaveLength(1);

    await flush(1);
    expect(bodiesOf('availableDueItems')).toEqual([
      { search: '', page: 1, pageSize: 20 },
      { search: 'acme', page: 1, pageSize: 20 },
    ]);
    expect(rowIds()).toEqual(['psd-2']);
  });

  it('reloads straight away (no debounce) when the search is cleared', async () => {
    await renderModal();
    fireEvent.change(search(), { target: { value: 'x' } });
    await flush(300);
    expect(callsTo('availableDueItems')).toHaveLength(2);
    fireEvent.change(search(), { target: { value: '' } });
    await flush(0);
    expect(callsTo('availableDueItems')).toHaveLength(3);
    expect(bodiesOf('availableDueItems')[2]).toEqual({ search: '', page: 1, pageSize: 20 });
  });

  it('drops a late answer that a newer search superseded', async () => {
    const slowFirst = deferred();
    availableAnswers.push({ promise: slowFirst.promise });
    render(<SelectDueItemsModal remittanceId="rem-1" apiBaseUrl={API} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await flush();

    availableAnswers.push(page([dueItem(9)], 1));
    fireEvent.change(search(), { target: { value: 'nine' } });
    await flush(300);
    expect(rowIds()).toEqual(['psd-9']);

    // The open-time page arrives after the search's answer: it must not overwrite it.
    await act(async () => { slowFirst.resolve(page([dueItem(1), dueItem(2)], 2)); });
    expect(rowIds()).toEqual(['psd-9']);
  });

  it('drops a late failure that a newer search superseded, without a toast', async () => {
    const slowFirst = deferred();
    availableAnswers.push({ promise: slowFirst.promise });
    render(<SelectDueItemsModal remittanceId="rem-1" apiBaseUrl={API} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await flush();
    availableAnswers.push(page([dueItem(9)], 1));
    fireEvent.change(search(), { target: { value: 'nine' } });
    await flush(300);

    await act(async () => { slowFirst.resolve(jsonResponse({}, { ok: false, status: 500 })); });
    expect(toast.error).not.toHaveBeenCalled();
    expect(rowIds()).toEqual(['psd-9']);
  });
});

describe('SelectDueItemsModal — paging', () => {
  const twenty = (offset = 0) => Array.from({ length: 20 }, (_, i) => dueItem(offset + i + 1));

  it('asks for the next page at the bottom and stops once `total` rows are loaded', async () => {
    availableAnswers.push(page(twenty(), 25));
    await renderModal();
    expect(rowIds()).toHaveLength(20);

    availableAnswers.push(page([21, 22, 23, 24, 25].map((n) => dueItem(n)), 25));
    scrollListToBottom();
    await flush();
    expect(bodiesOf('availableDueItems')[1]).toEqual({ search: '', page: 2, pageSize: 20 });
    expect(rowIds()).toHaveLength(25);
    expect(rowIds().slice(-1)).toEqual(['psd-25']);

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

  it('does not ask for more when the first page already holds the whole set', async () => {
    availableAnswers.push(page([dueItem(1), dueItem(2)], 2));
    await renderModal();
    scrollListToBottom();
    await flush();
    expect(callsTo('availableDueItems')).toHaveLength(1);
  });

  it('without a total, keeps paging while pages come back full', async () => {
    availableAnswers.push(jsonResponse({ response: { data: { items: twenty() } } }));
    await renderModal();
    availableAnswers.push(jsonResponse({ response: { data: { items: [dueItem(21)] } } }));
    scrollListToBottom();
    await flush();
    expect(callsTo('availableDueItems')).toHaveLength(2);
    expect(rowIds()).toHaveLength(21);
    // A short page means the end.
    scrollListToBottom();
    await flush();
    expect(callsTo('availableDueItems')).toHaveLength(2);
  });

  it('does not fire a second page request while one is in flight', async () => {
    availableAnswers.push(page(twenty(), 60));
    await renderModal();
    const slow = deferred();
    availableAnswers.push({ promise: slow.promise });
    scrollListToBottom();
    await flush();
    scrollListToBottom();
    await flush();
    expect(callsTo('availableDueItems')).toHaveLength(2);
    expect(screen.getByTestId('remittance-due-items-loading-more')).toBeInTheDocument();
    await act(async () => { slow.resolve(page(twenty(20), 60)); });
    expect(rowIds()).toHaveLength(40);
  });
});

describe('SelectDueItemsModal — locked rows (already in this remittance)', () => {
  const ITEMS = [dueItem(1, { alreadyInRemittance: true }), dueItem(2), dueItem(3)];

  it('shows them checked and disabled', async () => {
    availableAnswers.push(page(ITEMS, 3));
    await renderModal();
    expect(row('psd-1')).toHaveAttribute('data-locked', 'true');
    expect(row('psd-1')).toHaveAttribute('data-selected', 'true');
    expect(row('psd-1').querySelector('input[type="checkbox"]')).toBeDisabled();
    expect(row('psd-2')).not.toHaveAttribute('data-locked');
  });

  it('never toggles them and never sends them, even through «select all»', async () => {
    availableAnswers.push(page(ITEMS, 3));
    selectAnswers.push(jsonResponse({ response: { data: { created: 2 } } }));
    await renderModal();
    fireEvent.click(row('psd-1'));
    expect(screen.getByText('remittanceDueItemsSelectedCount:{"count":0}')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('remittance-due-items-select-all').querySelector('input[type="checkbox"]'));
    await act(async () => { fireEvent.click(apply()); });
    expect(bodiesOf('selectDueItems')).toEqual([{ ids: ['psd-2', 'psd-3'] }]);
  });
});

describe('SelectDueItemsModal — apply', () => {
  it('closes without calling the backend when nothing is selected', async () => {
    availableAnswers.push(page([dueItem(1)], 1));
    const { onClose, onSuccess } = await renderModal();
    await act(async () => { fireEvent.click(apply()); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(callsTo('selectDueItems')).toHaveLength(0);
  });

  it('adds the selection, toasts the created count and hands it to onSuccess', async () => {
    availableAnswers.push(page([dueItem(1), dueItem(2), dueItem(3)], 3));
    selectAnswers.push(jsonResponse({ response: { data: { created: 2, message: 'ok' } } }));
    const { onSuccess, onClose } = await renderModal();
    fireEvent.click(row('psd-3'));
    fireEvent.click(row('psd-1'));
    await act(async () => { fireEvent.click(apply()); });
    expect(callsTo('selectDueItems')[0][0]).toBe('/remittance/rem-1/action/selectDueItems');
    expect(bodiesOf('selectDueItems')).toEqual([{ ids: ['psd-3', 'psd-1'] }]);
    expect(toast.success).toHaveBeenCalledWith('remittanceDueItemsAdded:{"count":2}');
    expect(onSuccess).toHaveBeenCalledWith(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('counts the ids sent when the backend does not say how many were created', async () => {
    availableAnswers.push(page([dueItem(1), dueItem(2)], 2));
    selectAnswers.push(jsonResponse({ response: { data: {} } }));
    const { onSuccess } = await renderModal();
    fireEvent.click(row('psd-1'));
    fireEvent.click(row('psd-2'));
    await act(async () => { fireEvent.click(apply()); });
    expect(toast.success).toHaveBeenCalledWith('remittanceDueItemsAdded:{"count":2}');
    expect(onSuccess).toHaveBeenCalledWith(2);
  });

  it('toasts the translated refusal and stays open', async () => {
    availableAnswers.push(page([dueItem(1)], 1));
    selectAnswers.push(jsonResponse(
      { error: { message: 'Uno o más vencimientos ya no están disponibles.', messageKeys: ['ETGO_RemittanceDueItemNotAvailable'] } },
      { ok: false, status: 422 },
    ));
    const { onSuccess, onClose } = await renderModal();
    fireEvent.click(row('psd-1'));
    await act(async () => { fireEvent.click(apply()); });
    expect(toast.error).toHaveBeenCalledWith('T:dueItemNotAvailable');
    expect(toast.success).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('remittance-due-items-picker-modal')).toBeInTheDocument();
  });

  it('falls back to remittanceDueItemsAddError when the refusal carries nothing usable', async () => {
    availableAnswers.push(page([dueItem(1)], 1));
    selectAnswers.push({ ok: false, status: 500, json: async () => { throw new Error('no json'); } });
    await renderModal();
    fireEvent.click(row('psd-1'));
    await act(async () => { fireEvent.click(apply()); });
    expect(toast.error).toHaveBeenCalledWith('remittanceDueItemsAddError');
  });

  it('can be retried after a refusal (the submitting lock is released)', async () => {
    availableAnswers.push(page([dueItem(1)], 1));
    selectAnswers.push(jsonResponse({}, { ok: false, status: 500 }));
    selectAnswers.push(jsonResponse({ response: { data: { created: 1 } } }));
    const { onSuccess } = await renderModal();
    fireEvent.click(row('psd-1'));
    await act(async () => { fireEvent.click(apply()); });
    await act(async () => { fireEvent.click(apply()); });
    expect(callsTo('selectDueItems')).toHaveLength(2);
    expect(onSuccess).toHaveBeenCalledWith(1);
  });
});
