// @covers tools/app-shell/src/components/follow-up-documents/FollowUpDocumentButton.jsx
// @covers tools/app-shell/src/components/follow-up-documents/useFollowUpDocuments.js
// @covers tools/app-shell/src/components/follow-up-documents/FollowUpDocumentModal.jsx
// @covers tools/app-shell/src/components/contract-ui/ActionChoiceModal.jsx
//
// The generic follow-up document flow end to end at component level: topbar button →
// choice modal (ActionChoiceModal, real) → POST through apiFetch (mocked) → result modal
// (ConfirmResultModal, real). The hook and the modal are exercised through the button, the
// only way a window mounts them.

const mockApiFetch = vi.hoisted(() => vi.fn());
const mockApiFetchBase = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());
const mockTrackDocumentCreated = vi.hoisted(() => vi.fn());

// Stable translator: `{ count }` is echoed so the description interpolation is observable.
// The input-required labels are translated (an echoed key would hit the generic fallback).
const mockUi = vi.hoisted(() => {
  const catalog = { followUpInputWarehouseId: 'Warehouse', followUpInputWarehouseIdHelp: 'Pick the warehouse' };
  return (key, params) => (params?.count != null ? `${key}:${params.count}` : (catalog[key] ?? key));
});

vi.mock('@/i18n', () => ({
  useUI: () => mockUi,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

// Every backend call goes through useApiFetch (docs/request-policy.md): mock that boundary.
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => { mockApiFetchBase(base); return mockApiFetch; },
}));

vi.mock('@/lib/observability/health-events.js', () => ({
  trackDocumentCreated: mockTrackDocumentCreated,
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import FollowUpDocumentButton from '../FollowUpDocumentButton.jsx';
import { consumeFollowUpPrompt, requestFollowUpPrompt } from '../followUpDocuments.js';

const SPEC = 'sales-invoice';
const API_BASE = '/sws/neo/sales-invoice';
const ACTION_URL = '/sws/neo/sales-invoice/header/inv-1/action/createShipment';

const BUTTON = 'follow-up-document-button';
const MODAL = 'follow-up-document-modal';
const PRIMARY = 'action-confirm-modal';

const SHIPMENT_ENTRY = {
  needed: true, pendingLines: 2, action: 'createShipment', targetSpec: 'goods-shipment', targetEntity: 'goodsShipment',
};

const OPTIONS = {
  shipment: {
    titleKey: 'manageShipmentTitle',
    buttonLabelKey: 'manageShipmentButton',
    labelKey: 'createShipmentLabel',
    descriptionKey: 'createShipmentDescription',
    descriptionOneKey: 'createShipmentDescriptionOne',
    actionLabelKey: 'createShipmentAction',
    badgeKey: 'draft',
    badgeTone: 'info',
    resultDocType: 'salida',
    resultTitleKey: 'shipmentCreated',
  },
  invoice: {
    labelKey: 'createInvoiceLabel',
    descriptionKey: 'createInvoiceDescription',
    resultDocType: 'facturaVenta',
  },
};

const SUMMARY = { documentLabelKey: 'invoice', dateLabelKey: 'date', dateField: 'invoiceDate' };

const RECORD = {
  id: 'inv-1',
  documentNo: 'F-0001',
  invoiceDate: '2026-08-10',
  'businessPartner$_identifier': 'ACME S.L.',
  grandTotalAmount: 1234.5,
  'currency$_identifier': 'EUR',
  followUp: { available: ['shipment'], shipment: SHIPMENT_ENTRY },
};

const withFollowUp = (followUp, patch = {}) => ({ ...RECORD, ...patch, followUp });

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

const CREATED = jsonResponse({ response: { data: { id: 'sh-1', documentNo: 'ALB-0001' } } }, { status: 201 });

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function renderButton(props = {}) {
  const onRefresh = vi.fn();
  const allProps = {
    data: RECORD, apiBaseUrl: API_BASE, spec: SPEC, options: OPTIONS, summary: SUMMARY, onRefresh, ...props,
  };
  const view = render(<FollowUpDocumentButton {...allProps} />);
  const rerender = (patch) => view.rerender(<FollowUpDocumentButton {...allProps} {...patch} />);
  return { ...view, rerender, onRefresh };
}

async function openFromButton(user) {
  await user.click(screen.getByTestId(BUTTON));
  return screen.getByTestId(MODAL);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(CREATED);
});

afterEach(() => {
  // A prompt left over by a test must not open the modal in the next one.
  consumeFollowUpPrompt(SPEC, 'inv-1');
});

describe('FollowUpDocumentButton — visibility', () => {
  it.each([
    ['nothing is available', { data: withFollowUp({ available: [] }) }],
    ['the record has no followUp annotation', { data: { ...RECORD, followUp: undefined } }],
    ['the window is read-only', { windowReadOnly: true }],
    ['the only available key is not configured by the window', {
      data: withFollowUp({ available: ['receipt'], receipt: { needed: true, action: 'createReceipt' } }),
    }],
  ])('is hidden when %s', (_, props) => {
    renderButton(props);
    expect(screen.queryByTestId(BUTTON)).toBeNull();
  });

  it.each([
    ['one follow-up: the option buttonLabelKey', {}, 'manageShipmentButton', 'shipment'],
    ['several: the buttonLabelKey prop', {
      data: withFollowUp({ available: ['shipment', 'invoice'], shipment: SHIPMENT_ENTRY, invoice: { needed: true, action: 'createInvoice' } }),
      buttonLabelKey: 'manageDocuments',
    }, 'manageDocuments', 'shipment,invoice'],
    ['several without a prop: the generic key', {
      data: withFollowUp({ available: ['shipment', 'invoice'], shipment: SHIPMENT_ENTRY, invoice: { needed: true, action: 'createInvoice' } }),
    }, 'followUpManageButton', 'shipment,invoice'],
  ])('is shown and labelled with %s', (_, props, label, keys) => {
    renderButton(props);
    const button = screen.getByTestId(BUTTON);
    expect(button).toHaveTextContent(label);
    expect(button).toHaveAttribute('data-follow-up-keys', keys);
    expect(screen.queryByTestId(MODAL)).toBeNull();
  });
});

describe('FollowUpDocumentButton — post-Confirm prompt hand-off', () => {
  // The prompt carries the freshly processed record; the `data` prop may still be the
  // pre-process one (no annotation yet), so the modal must open from the snapshot.
  const PRE_PROCESS = { ...RECORD, followUp: undefined };

  it('opens the modal on mount for a prompt queued before it mounted', () => {
    requestFollowUpPrompt(SPEC, RECORD);
    renderButton({ data: PRE_PROCESS });
    expect(screen.getByTestId(MODAL)).toBeInTheDocument();
    expect(screen.queryByTestId(BUTTON)).toBeNull();
  });

  it('opens the modal when a prompt for this record is announced while mounted', () => {
    renderButton({ data: PRE_PROCESS });
    expect(screen.queryByTestId(MODAL)).toBeNull();
    act(() => { requestFollowUpPrompt(SPEC, RECORD); });
    expect(screen.getByTestId(MODAL)).toBeInTheDocument();
  });

  it.each([
    ['another record', 'sales-invoice', { ...RECORD, id: 'inv-2' }],
    ['another spec', 'purchase-invoice', RECORD],
  ])('ignores a prompt for %s', (_, spec, rec) => {
    renderButton({ data: PRE_PROCESS });
    act(() => { requestFollowUpPrompt(spec, rec); });
    expect(screen.queryByTestId(MODAL)).toBeNull();
    consumeFollowUpPrompt(spec, rec.id);
  });
});

describe('FollowUpDocumentButton — choice modal content', () => {
  it('titles the dialog with the option titleKey and shows the option, badge and pending-line description', async () => {
    const user = userEvent.setup();
    renderButton();
    const modal = await openFromButton(user);
    expect(modal).toHaveAccessibleName('manageShipmentTitle');
    const card = within(screen.getByTestId('follow-up-option-shipment'));
    expect(card.getByText('createShipmentLabel')).toBeInTheDocument();
    expect(card.getByText('draft')).toHaveAttribute('data-badge-tone', 'info');
    expect(card.getByText('createShipmentDescription:2')).toBeInTheDocument();
    expect(screen.getByTestId(PRIMARY)).toHaveTextContent('createShipmentAction');
  });

  it('uses the singular description when exactly one line is pending', async () => {
    const user = userEvent.setup();
    renderButton({ data: withFollowUp({ available: ['shipment'], shipment: { ...SHIPMENT_ENTRY, pendingLines: 1 } }) });
    await openFromButton(user);
    expect(screen.getByText('createShipmentDescriptionOne:1')).toBeInTheDocument();
  });

  it.each([
    ['the window questionKey', 'invoiceQuestion', 'invoiceQuestion'],
    ['the generic question without one', undefined, 'followUpQuestion'],
  ])('asks %s', async (_, questionKey, expected) => {
    const user = userEvent.setup();
    renderButton({ questionKey });
    await openFromButton(user);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('summarises document, date, contact, pending lines and total through the canonical formatters', async () => {
    const user = userEvent.setup();
    renderButton();
    await openFromButton(user);
    expect(screen.getByText('invoice')).toBeInTheDocument();
    expect(screen.getByTestId('follow-up-summary-document')).toHaveTextContent('F-0001');
    expect(screen.getByTestId('follow-up-summary-date').textContent).toBe(formatCalendarDate('2026-08-10', 'en_US'));
    expect(screen.getByTestId('follow-up-summary-contact')).toHaveTextContent('ACME S.L.');
    expect(screen.getByText('lines')).toBeInTheDocument();
    expect(screen.getByTestId('follow-up-summary-pending-lines')).toHaveTextContent('2');
    expect(screen.getByTestId('follow-up-summary-total').textContent).toBe(formatCurrency('EUR', 1234.5));
  });

  it('labels the pending-lines column with summary.linesLabelKey and omits the document column without documentLabelKey', async () => {
    const user = userEvent.setup();
    renderButton({ summary: { linesLabelKey: 'pendingToShip' } });
    await openFromButton(user);
    expect(screen.getByText('pendingToShip')).toBeInTheDocument();
    expect(screen.queryByText('lines')).toBeNull();
    expect(screen.queryByTestId('follow-up-summary-document')).toBeNull();
    expect(screen.queryByTestId('follow-up-summary-date')).toBeNull();
  });
});

describe('FollowUpDocumentButton — creating the document', () => {
  it('POSTs the action once, through apiFetch with an empty base, even on a double click', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    mockApiFetch.mockReturnValue(pending.promise);
    renderButton();
    await openFromButton(user);
    fireEvent.click(screen.getByTestId(PRIMARY));
    fireEvent.click(screen.getByTestId(PRIMARY));
    await act(async () => { pending.resolve(CREATED); });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith(ACTION_URL, { method: 'POST', body: JSON.stringify({}) });
    expect(mockApiFetchBase).toHaveBeenCalledWith('');
  });

  it('on 201 shows the result with a link to the created document, announces it and refreshes the record', async () => {
    const user = userEvent.setup();
    const created = vi.fn();
    window.addEventListener('sales-invoice:document-created', created);
    try {
      const { onRefresh } = renderButton();
      await openFromButton(user);
      await user.click(screen.getByTestId(PRIMARY));

      expect(await screen.findByTestId('confirm-result-modal')).toBeInTheDocument();
      expect(screen.queryByTestId(MODAL)).toBeNull();
      expect(screen.getByText('shipmentCreated')).toBeInTheDocument();
      expect(screen.getByText('ALB-0001')).toBeInTheDocument();
      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(mockTrackDocumentCreated).toHaveBeenCalledWith('goods-shipment');
      expect(created).toHaveBeenCalledTimes(1);
      expect(created.mock.calls[0][0].detail).toMatchObject({
        recordId: 'inv-1', followUp: 'shipment', document: { id: 'sh-1', spec: 'goods-shipment', documentStatus: 'DR' },
      });

      await user.click(screen.getByText('soViewShipment'));
      expect(mockNavigate).toHaveBeenCalledWith('/goods-shipment/sh-1');
    } finally {
      window.removeEventListener('sales-invoice:document-created', created);
    }
  });

  it('gives the focus back to the topbar button when the result is closed', async () => {
    const user = userEvent.setup();
    renderButton();
    await openFromButton(user);
    await user.click(screen.getByTestId(PRIMARY));
    await user.click(await screen.findByTestId('action-confirm-result-close'));
    expect(screen.queryByTestId('confirm-result-modal')).toBeNull();
    expect(screen.getByTestId(BUTTON)).toHaveFocus();
  });

  it.each([
    ['a FOLLOW_UP_* error code', () => Promise.resolve(jsonResponse({ error: { code: 'FOLLOW_UP_DRAFT_IN_PROGRESS', message: 'raw' } }, { ok: false, status: 409 })), 'followUpErrorDraftInProgress'],
    ['an unknown error code', () => Promise.resolve(jsonResponse({ error: { code: 'BOOM', message: 'raw' } }, { ok: false, status: 500 })), 'followUpErrorGeneric'],
    ['a 2xx without a created document', () => Promise.resolve(jsonResponse({ response: { data: {} } })), 'followUpErrorGeneric'],
    ['a network failure (already translated message)', () => Promise.reject(new Error('networkErrorRetry')), 'networkErrorRetry'],
  ])('shows %s translated inline and keeps the modal open', async (_, answer, message) => {
    const user = userEvent.setup();
    const created = vi.fn();
    window.addEventListener('sales-invoice:document-created', created);
    try {
      mockApiFetch.mockImplementation(answer);
      const { onRefresh } = renderButton();
      await openFromButton(user);
      await user.click(screen.getByTestId(PRIMARY));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.queryByText('raw')).toBeNull();
      expect(screen.getByTestId(MODAL)).toBeInTheDocument();
      expect(screen.getByTestId(PRIMARY)).toBeEnabled();
      expect(onRefresh).not.toHaveBeenCalled();
      expect(created).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('sales-invoice:document-created', created);
    }
  });

  it.each([
    ['Esc', (user) => user.keyboard('{Escape}')],
    ['Cancel', (user) => user.click(screen.getByText('cancel'))],
  ])('%s closes the modal without any request', async (_, reject) => {
    const user = userEvent.setup();
    renderButton();
    await openFromButton(user);
    await reject(user);
    expect(screen.queryByTestId(MODAL)).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('closes the session when the user moved to another record while the POST was in flight', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    mockApiFetch.mockReturnValue(pending.promise);
    const { rerender } = renderButton();
    await openFromButton(user);
    fireEvent.click(screen.getByTestId(PRIMARY));
    rerender({ data: { ...RECORD, id: 'inv-2' } });
    // In flight: kept, so a committed document is never silently lost mid-request.
    expect(screen.getByTestId(MODAL)).toBeInTheDocument();
    await act(async () => { pending.resolve(CREATED); });
    await waitFor(() => expect(screen.queryByTestId(MODAL)).toBeNull());
    expect(screen.queryByTestId('confirm-result-modal')).toBeNull();
  });
});

describe('FollowUpDocumentButton — input-required round-trip', () => {
  const WAREHOUSES = [{ id: 'wh-1', name: 'Central' }, { id: 'wh-2', name: 'Norte' }];
  const INPUT_FIELD = 'follow-up-input';
  const COMBO = 'field-follow-up-input-warehouseId';

  const inputRequired = (options = WAREHOUSES) => jsonResponse({
    error: { code: 'FOLLOW_UP_WAREHOUSE_REQUIRED', status: 409, message: 'raw', input: { key: 'warehouseId', options } },
  }, { ok: false, status: 409 });
  const failure = (code, status) => jsonResponse({ error: { code, status, message: 'raw' } }, { ok: false, status });
  const postBodies = () => mockApiFetch.mock.calls.map(([, init]) => JSON.parse(init.body));

  async function askForWarehouse(user, options) {
    mockApiFetch.mockResolvedValueOnce(inputRequired(options));
    renderButton();
    await openFromButton(user);
    await user.click(screen.getByTestId(PRIMARY));
    return screen.findByTestId(INPUT_FIELD);
  }

  it('keeps the modal open with a labelled, focused selector and the primary disabled until a value is chosen', async () => {
    const user = userEvent.setup();
    const field = await askForWarehouse(user);

    expect(screen.getByTestId(MODAL)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('raw')).toBeNull();
    expect(field).toHaveAttribute('data-input-key', 'warehouseId');
    expect(field).toHaveAccessibleName(/Warehouse/);
    expect(field).toHaveAccessibleDescription('Pick the warehouse');
    const combo = screen.getByRole('combobox', { name: /Warehouse/ });
    expect(combo).toBe(screen.getByTestId(COMBO));
    expect(combo).toHaveFocus();
    expect(screen.getByTestId(PRIMARY)).toBeDisabled();

    // Enter with nothing chosen does not submit either, and does not close the modal.
    await user.keyboard('{Escape}');
    fireEvent.keyDown(combo, { key: 'Enter' });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(MODAL)).toBeInTheDocument();
  });

  it('multi-option layout: Enter on the choice card that asked for the input does not POST while it is empty', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(inputRequired());
    renderButton({
      data: withFollowUp({
        available: ['shipment', 'invoice'], shipment: SHIPMENT_ENTRY, invoice: { needed: true, action: 'createInvoice' },
      }),
    });
    await openFromButton(user);
    await user.click(screen.getByTestId(PRIMARY));
    expect(await screen.findByTestId(INPUT_FIELD)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId('follow-up-option-shipment'), { key: 'Enter' });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(MODAL)).toBeInTheDocument();
    expect(screen.getByTestId(INPUT_FIELD)).toBeInTheDocument();
    expect(screen.getByTestId(PRIMARY)).toBeDisabled();
    expect(screen.queryByTestId('confirm-result-modal')).toBeNull();
  });

  it('retries the POST with the chosen value and shows the created document', async () => {
    const user = userEvent.setup();
    await askForWarehouse(user);
    mockApiFetch.mockResolvedValueOnce(CREATED);

    fireEvent.focus(screen.getByTestId(COMBO));
    fireEvent.mouseDown(screen.getByTestId('option-follow-up-input-warehouseId-wh-2'));
    expect(screen.getByTestId(PRIMARY)).toBeEnabled();
    await user.click(screen.getByTestId(PRIMARY));

    expect(await screen.findByTestId('confirm-result-modal')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch.mock.calls[1][0]).toBe(ACTION_URL);
    expect(postBodies()).toEqual([{}, { warehouseId: 'wh-2' }]);
  });

  it('preselects a single option, still shows it, and Enter on it retries', async () => {
    const user = userEvent.setup();
    await askForWarehouse(user, [WAREHOUSES[0]]);
    mockApiFetch.mockResolvedValueOnce(CREATED);

    const chip = screen.getByTestId(`${COMBO}-chip`);
    expect(chip).toHaveTextContent('Central');
    expect(chip).toHaveFocus();
    expect(screen.getByTestId(PRIMARY)).toBeEnabled();
    await user.keyboard('{Enter}');

    expect(await screen.findByTestId('confirm-result-modal')).toBeInTheDocument();
    expect(postBodies()).toEqual([{}, { warehouseId: 'wh-1' }]);
  });

  it.each([
    ['a 400 FOLLOW_UP_INVALID_INPUT on the retry', 'followUpErrorInvalidInput', true,
      async (user) => {
        await askForWarehouse(user, [WAREHOUSES[0]]);
        mockApiFetch.mockResolvedValueOnce(failure('FOLLOW_UP_INVALID_INPUT', 400));
        await user.click(screen.getByTestId(PRIMARY));
      }],
    ['a 409 FOLLOW_UP_WAREHOUSE_REQUIRED without an input block', 'followUpErrorWarehouseRequired', false,
      async (user) => {
        mockApiFetch.mockResolvedValueOnce(failure('FOLLOW_UP_WAREHOUSE_REQUIRED', 409));
        renderButton();
        await openFromButton(user);
        await user.click(screen.getByTestId(PRIMARY));
      }],
  ])('shows %s translated, keeping the modal open', async (_, message, selectorKept, act409) => {
    const user = userEvent.setup();
    await act409(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('raw')).toBeNull();
    expect(screen.getByTestId(MODAL)).toBeInTheDocument();
    expect(Boolean(screen.queryByTestId(INPUT_FIELD))).toBe(selectorKept);
    expect(screen.queryByTestId('confirm-result-modal')).toBeNull();
  });

  it.each([
    ['Esc (the first one closes the open list, the second the modal)', async (user) => {
      await user.keyboard('{Escape}');
      expect(screen.getByTestId(MODAL)).toBeInTheDocument();
      await user.keyboard('{Escape}');
    }],
    ['Cancel', (user) => user.click(screen.getByText('cancel'))],
  ])('%s still cancels from the selector without another request', async (_, reject) => {
    const user = userEvent.setup();
    await askForWarehouse(user);
    await reject(user);
    expect(screen.queryByTestId(MODAL)).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('multi-option layout: selecting another follow-up releases the selector, which never comes back for it', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(inputRequired()).mockResolvedValueOnce(CREATED);
    renderButton({
      data: withFollowUp({
        available: ['shipment', 'invoice'], shipment: SHIPMENT_ENTRY, invoice: { needed: true, action: 'createInvoice' },
      }),
    });
    await openFromButton(user);
    await user.click(screen.getByTestId(PRIMARY));
    expect(await screen.findByTestId(INPUT_FIELD)).toBeInTheDocument();
    expect(screen.getByTestId(PRIMARY)).toBeDisabled();

    await user.click(screen.getByTestId('follow-up-option-invoice'));
    expect(screen.queryByTestId(INPUT_FIELD)).toBeNull();
    expect(screen.getByTestId(PRIMARY)).toBeEnabled();
    await user.click(screen.getByTestId('follow-up-option-shipment'));
    expect(screen.queryByTestId(INPUT_FIELD)).toBeNull();

    await user.click(screen.getByTestId('follow-up-option-invoice'));
    await user.click(screen.getByTestId(PRIMARY));
    expect(await screen.findByTestId('confirm-result-modal')).toBeInTheDocument();
    expect(mockApiFetch.mock.calls[1][0]).toBe('/sws/neo/sales-invoice/header/inv-1/action/createInvoice');
    expect(postBodies()).toEqual([{}, {}]);
  });

  it('POSTs the retry once even on a double click', async () => {
    const user = userEvent.setup();
    await askForWarehouse(user, [WAREHOUSES[0]]);
    const pending = deferred();
    mockApiFetch.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByTestId(PRIMARY));
    fireEvent.click(screen.getByTestId(PRIMARY));
    await act(async () => { pending.resolve(CREATED); });
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(postBodies()).toEqual([{}, { warehouseId: 'wh-1' }]);
  });
});
