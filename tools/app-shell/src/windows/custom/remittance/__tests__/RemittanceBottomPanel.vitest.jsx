// @covers artifacts/remittance/custom/RemittanceBottomPanel.jsx
//
// The remittance bottom section: the «Seleccionar desde factura» trigger (panel-rendered once
// there are lines, inside the lines empty state before that) and the lines total. The total goes
// through the real `fetchLinesTotal` and `formatCurrency`; only the request boundary
// (`useApiFetch`) and the heavy picker are stubbed.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

// Stable translator (a new function per render would re-run every effect that depends on it).
const mockUi = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

vi.mock('@/components/contract-ui', () => ({
  LinesEmptyState: (props) => (
    <div
      data-testid="lines-empty-state"
      data-can-add-line={String(props.canAddLine)}
      data-description={props.description}
    >
      {props.secondaryAction}
    </div>
  ),
}));

vi.mock('@generated/remittance/custom/SelectDueItemsModal', () => ({
  default: (props) => (
    <div data-testid="due-items-modal" data-remittance-id={props.remittanceId} data-api={props.apiBaseUrl}>
      <button type="button" data-testid="due-items-modal-success" onClick={() => props.onSuccess(2)}>ok</button>
      <button type="button" data-testid="due-items-modal-close" onClick={() => props.onClose()}>close</button>
    </div>
  ),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RemittanceBottomPanel, { canSelectDueItems } from '@generated/remittance/custom/RemittanceBottomPanel.jsx';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

const EmptyState = RemittanceBottomPanel.linesEmptyState;

const API = '/sws/neo/remittance';
const PENDING = { id: 'rem-1', processed: false, remittanceType: 'type-1', financialAccount: 'acc-1' };
const LINES = [
  { id: 'l1', amount: 1000, currency: 'EUR' },
  { id: 'l2', amount: 202.3, currency: 'EUR' },
];

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

const summaryAnswer = (amount, count) => jsonResponse({ response: { data: [{ amount, id: count, isGridSummary: true }] } });

function renderPanel(props = {}) {
  return render(<RemittanceBottomPanel data={PENDING} apiBaseUrl={API} lines={LINES} {...props} />);
}

let reloadSpy;
const originalLocation = window.location;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(summaryAnswer(1202.3, 2));
  reloadSpy = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { ...originalLocation, reload: reloadSpy } });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: originalLocation });
});

describe('canSelectDueItems', () => {
  it('is true for an unprocessed remittance with both a type and an account', () => {
    expect(canSelectDueItems(PENDING)).toBe(true);
    // A new (unsaved) record qualifies too: the empty state saves it first.
    expect(canSelectDueItems({ remittanceType: 't', financialAccount: 'a' })).toBe(true);
  });

  it('is false once processed, as a boolean or as Y', () => {
    expect(canSelectDueItems({ ...PENDING, processed: true })).toBe(false);
    expect(canSelectDueItems({ ...PENDING, processed: 'Y' })).toBe(false);
  });

  it('is false without a remittance type or without a financial account', () => {
    expect(canSelectDueItems({ ...PENDING, remittanceType: null })).toBe(false);
    expect(canSelectDueItems({ ...PENDING, financialAccount: '' })).toBe(false);
    expect(canSelectDueItems(null)).toBe(false);
  });
});

describe('RemittanceBottomPanel — with lines', () => {
  it('draws the trigger and the total in the lines footer of an editable pending remittance', async () => {
    renderPanel();
    const footer = screen.getByTestId('remittance-lines-footer');
    expect(footer).toContainElement(screen.getByTestId('action-select-due-items'));
    expect(screen.getByTestId('action-select-due-items')).toHaveTextContent('remittanceSelectFromInvoices');
    expect(await screen.findByTestId('remittance-lines-total')).toBeInTheDocument();
    expect(footer).toContainElement(screen.getByTestId('remittance-lines-total'));
  });

  it('renders the total over every line from the grid summary, in the lines’ currency', async () => {
    mockApiFetch.mockResolvedValue(summaryAnswer(1202.3, 4));
    renderPanel();
    expect(await screen.findByTestId('remittance-lines-total-label')).toHaveTextContent('remittanceLinesTotal:{"count":4}');
    expect(screen.getByTestId('remittance-lines-total-amount')).toHaveTextContent('1.202,30 €');
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toMatch(/^\/lines\?parentId=rem-1&_summary=/);
  });

  it('falls back to the loaded lines when the summary request fails', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    renderPanel();
    expect(await screen.findByTestId('remittance-lines-total-label')).toHaveTextContent('remittanceLinesTotal:{"count":2}');
    expect(screen.getByTestId('remittance-lines-total-amount')).toHaveTextContent('1.202,30 €');
  });

  it('re-reads the total when DetailView hands over a new lines array', async () => {
    const { rerender } = renderPanel();
    await screen.findByTestId('remittance-lines-total');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);

    mockApiFetch.mockResolvedValue(summaryAnswer(1000, 1));
    rerender(<RemittanceBottomPanel data={PENDING} apiBaseUrl={API} lines={[LINES[0]]} />);
    await waitFor(() => expect(screen.getByTestId('remittance-lines-total-label').textContent).toBe('remittanceLinesTotalOne:{"count":1}'));
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [1, 'remittanceLinesTotalOne'],
    [2, 'remittanceLinesTotal'],
    [7, 'remittanceLinesTotal'],
  ])('labels a total of %i line(s) with %s', async (count, key) => {
    mockApiFetch.mockResolvedValue(summaryAnswer(10, count));
    renderPanel();
    await waitFor(() => expect(screen.getByTestId('remittance-lines-total-label').textContent).toBe(`${key}:{"count":${count}}`));
  });

  it.each([['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]])('ships the singular and plural total labels in %s', (_loc, json) => {
    // The singular may spell the 1 out; the plural must interpolate the count.
    expect(json.genericLabels.remittanceLinesTotalOne).toEqual(expect.stringMatching(/\S/));
    expect(json.genericLabels.remittanceLinesTotalOne).not.toBe(json.genericLabels.remittanceLinesTotal);
    expect(json.genericLabels.remittanceLinesTotal).toEqual(expect.stringMatching(/\{count\}/));
  });

  it('still shows the total on a processed remittance, without the trigger', async () => {
    renderPanel({ data: { ...PENDING, processed: true } });
    expect(await screen.findByTestId('remittance-lines-total')).toBeInTheDocument();
    expect(screen.getByTestId('remittance-lines-footer')).toBeInTheDocument();
    expect(screen.queryByTestId('action-select-due-items')).toBeNull();
  });

  it.each([
    ['processed as Y', { data: { ...PENDING, processed: 'Y' } }],
    ['no remittance type', { data: { ...PENDING, remittanceType: null } }],
    ['no financial account', { data: { ...PENDING, financialAccount: null } }],
    ['a read-only document', { isDocumentReadOnly: true }],
    ['a read-only window', { windowReadOnly: true }],
  ])('hides the trigger for %s but keeps the total', async (_label, props) => {
    renderPanel(props);
    expect(await screen.findByTestId('remittance-lines-total')).toBeInTheDocument();
    expect(screen.queryByTestId('action-select-due-items')).toBeNull();
  });

  it('takes the id from recordId when the data has none', async () => {
    renderPanel({ data: { ...PENDING, id: undefined }, recordId: 'rem-route' });
    await screen.findByTestId('remittance-lines-total');
    expect(mockApiFetch.mock.calls[0][0]).toMatch(/^\/lines\?parentId=rem-route&/);
  });

  it('renders nothing without lines', () => {
    const { container } = renderPanel({ lines: [] });
    expect(container).toBeEmptyDOMElement();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('renders nothing for an unsaved record (no id, no recordId)', () => {
    const { container } = renderPanel({ data: { ...PENDING, id: undefined } });
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the picker for this remittance and reloads the page after a selection', async () => {
    renderPanel();
    expect(screen.queryByTestId('due-items-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('action-select-due-items'));
    const modal = screen.getByTestId('due-items-modal');
    expect(modal).toHaveAttribute('data-remittance-id', 'rem-1');
    expect(modal).toHaveAttribute('data-api', API);

    fireEvent.click(screen.getByTestId('due-items-modal-success'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('due-items-modal')).toBeNull();
    await screen.findByTestId('remittance-lines-total');
  });

  it('closes the picker without reloading when it is dismissed', async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('action-select-due-items'));
    fireEvent.click(screen.getByTestId('due-items-modal-close'));
    expect(screen.queryByTestId('due-items-modal')).toBeNull();
    expect(reloadSpy).not.toHaveBeenCalled();
    await screen.findByTestId('remittance-lines-total');
  });
});

describe('RemittanceBottomPanel — static slots', () => {
  it('turns off the generic line totals (the panel draws its own)', () => {
    expect(RemittanceBottomPanel.showLineTotals).toBe(false);
  });

  it('exposes the lines empty state', () => {
    expect(typeof RemittanceBottomPanel.linesEmptyState).toBe('function');
  });
});

describe('RemittanceBottomPanel.linesEmptyState', () => {
  const baseProps = { data: PENDING, recordId: 'rem-1', apiBaseUrl: API, onRefresh: vi.fn() };

  it('offers no «add line» and explains where lines come from', () => {
    render(<EmptyState {...baseProps} />);
    const empty = screen.getByTestId('lines-empty-state');
    expect(empty).toHaveAttribute('data-can-add-line', 'false');
    expect(empty).toHaveAttribute('data-description', 'remittanceLinesEmptyDescription');
  });

  it('shows the button on a pending remittance with type and account', () => {
    render(<EmptyState {...baseProps} />);
    expect(screen.getByTestId('action-select-due-items-empty-state')).toHaveTextContent('remittanceSelectFromInvoices');
  });

  it.each([
    ['processed', { ...PENDING, processed: true }],
    ['no remittance type', { ...PENDING, remittanceType: undefined }],
    ['no financial account', { ...PENDING, financialAccount: undefined }],
  ])('hides the button when %s', (_label, data) => {
    render(<EmptyState {...baseProps} data={data} />);
    expect(screen.getByTestId('lines-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('action-select-due-items-empty-state')).toBeNull();
  });

  it('saves before opening and opens once the save succeeds', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<EmptyState {...baseProps} onSave={onSave} />);
    await act(async () => { fireEvent.click(screen.getByTestId('action-select-due-items-empty-state')); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('due-items-modal')).toHaveAttribute('data-remittance-id', 'rem-1');
  });

  it('does not open when the save fails', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<EmptyState {...baseProps} onSave={onSave} />);
    await act(async () => { fireEvent.click(screen.getByTestId('action-select-due-items-empty-state')); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('due-items-modal')).toBeNull();
  });

  it('opens straight away when there is no save step', () => {
    render(<EmptyState {...baseProps} />);
    fireEvent.click(screen.getByTestId('action-select-due-items-empty-state'));
    expect(screen.getByTestId('due-items-modal')).toBeInTheDocument();
  });

  it('a new remittance: saves first, then the picker re-opens on the saved record through forceOpen', async () => {
    const newData = { remittanceType: 'type-1', financialAccount: 'acc-1' };
    const onSave = vi.fn().mockResolvedValue(true);
    const { rerender } = render(<EmptyState data={newData} apiBaseUrl={API} onSave={onSave} />);
    await act(async () => { fireEvent.click(screen.getByTestId('action-select-due-items-empty-state')); });
    expect(onSave).toHaveBeenCalledTimes(1);
    // Still no id: there is nothing to open the picker on yet.
    expect(screen.queryByTestId('due-items-modal')).toBeNull();

    // The save remounts the detail on the record's route; DetailView asks to re-open.
    const onForceOpenHandled = vi.fn();
    rerender(
      <EmptyState
        data={{ ...newData, id: 'rem-new' }}
        apiBaseUrl={API}
        onSave={onSave}
        forceOpen
        onForceOpenHandled={onForceOpenHandled}
      />,
    );
    expect(screen.getByTestId('due-items-modal')).toHaveAttribute('data-remittance-id', 'rem-new');
    expect(onForceOpenHandled).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('re-reads the header and the lines (onRefresh) after a selection, without reloading the page', () => {
    const onRefresh = vi.fn();
    render(<EmptyState {...baseProps} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTestId('action-select-due-items-empty-state'));
    fireEvent.click(screen.getByTestId('due-items-modal-success'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('due-items-modal')).toBeNull();
  });

  it('closes the picker on dismiss without refreshing', () => {
    const onRefresh = vi.fn();
    render(<EmptyState {...baseProps} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTestId('action-select-due-items-empty-state'));
    fireEvent.click(screen.getByTestId('due-items-modal-close'));
    expect(screen.queryByTestId('due-items-modal')).toBeNull();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
