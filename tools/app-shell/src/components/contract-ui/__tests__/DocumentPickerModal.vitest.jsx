// @covers tools/app-shell/src/components/contract-ui/DocumentPickerModal.jsx
//
// The generic document picker: server-driven rows, a per-row amount, committed rows that open
// checked, and a confirm that receives only the difference with the committed set. Rendered with
// the real ResettableAmountInput / validateBoundedAmount / formatCurrency; i18n echoes key+params.
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const mockUi = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi, useLocaleSwitch: () => ({ locale: 'es_ES' }) }));

import { DocumentPickerModal, diffSelection } from '../DocumentPickerModal.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';

// d1 is already applied (committed) with 30 of its 100; d2 and d3 are new.
const ROWS = [
  { id: 'd1', committed: true, applied: 30, max: 100 },
  { id: 'd2', max: 50 },
  { id: 'd3', max: 20 },
];

const getRowId = (row) => row.id;
const isCommitted = (row) => row.committed === true;
const getInitialAmount = (row) => (row.committed ? row.applied : row.max);
const AMOUNT = { labelKey: 'colAmount', getMax: (row) => row.max, getReset: (row) => row.max, getCurrency: () => 'EUR' };
const COLUMNS = [
  {
    key: 'doc',
    labelKey: 'colDoc',
    render: (row, { close }) => (
      <button type="button" data-testid={`doc-link-${row.id}`} onClick={(e) => { e.stopPropagation(); close(); }}>{row.id}</button>
    ),
  },
];

function renderPicker(props = {}) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onReachBottom = vi.fn();
  const base = {
    titleKey: 'pickTitle',
    searchPlaceholderKey: 'pickSearch',
    emptyKey: 'pickEmpty',
    noticeTitleKey: 'pickNotice',
    confirmKey: 'pickConfirm',
    footerKey: 'pickFooter',
    rows: ROWS,
    getRowId,
    isCommitted,
    getInitialAmount,
    columns: COLUMNS,
    amount: AMOUNT,
    currency: 'EUR',
    onConfirm,
    onClose,
    onReachBottom,
    onSearchChange: vi.fn(),
  };
  const utils = render(<DocumentPickerModal {...base} {...props} />);
  const rerender = (next) => utils.rerender(<DocumentPickerModal {...base} {...props} {...next} />);
  return { ...utils, rerender, onConfirm, onClose, onReachBottom };
}

const row = (id) => screen.getByTestId(`document-picker-row-${id}`);
const amountInput = (id) => screen.getByTestId(`document-picker-amount-${id}-input`);
const confirmButton = () => screen.getByTestId('document-picker-confirm');
const status = () => screen.getByTestId('document-picker-status').textContent;
const footerText = (count, total) => `pickFooter:${JSON.stringify({ count, total: formatCurrency('EUR', total) })}`;

function setAmount(id, value) {
  fireEvent.focus(amountInput(id));
  fireEvent.change(amountInput(id), { target: { value } });
}

async function clickConfirm() {
  await act(async () => { fireEvent.click(confirmButton()); });
}

describe('diffSelection', () => {
  const committed = new Map([['a', '10'], ['b', '20'], ['c', '30']]);

  it('splits the selection into add, update and remove against the committed set', () => {
    const selected = new Map([['a', '10'], ['b', '25'], ['n', '5']]);
    expect(diffSelection(committed, selected)).toEqual({
      add: [{ id: 'n', amount: '5' }],
      update: [{ id: 'b', amount: '25' }],
      remove: ['c'],
    });
  });

  it('leaves out a committed row whose amount did not change (to the cent)', () => {
    const selected = new Map([['a', '10.00'], ['b', 20], ['c', '30.001']]);
    expect(diffSelection(committed, selected)).toEqual({ add: [], update: [], remove: [] });
  });

  it('never removes an id it was not told is committed (a row never loaded)', () => {
    expect(diffSelection(new Map(), new Map())).toEqual({ add: [], update: [], remove: [] });
    expect(diffSelection(new Map([['a', '1']]), new Map([['a', '1']])).remove).toEqual([]);
  });
});

describe('DocumentPickerModal — shell', () => {
  it('is a dialog with the caller’s wording, the column headers and the notice', () => {
    renderPicker();
    const dialog = screen.getByTestId('document-picker-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-label', 'pickTitle');
    expect(screen.getByTestId('document-picker-search')).toHaveAttribute('placeholder', 'pickSearch');
    const header = screen.getByTestId('document-picker-header');
    expect(header).toHaveTextContent('colDoc');
    expect(header).toHaveTextContent('colAmount');
    expect(screen.getByTestId('document-picker-notice')).toHaveTextContent('pickNotice');
  });

  it('shows the loading state and the empty notice', () => {
    const { rerender } = renderPicker({ rows: [], loading: true });
    expect(screen.getByTestId('document-picker-loading')).toBeInTheDocument();
    expect(screen.getByTestId('document-picker-select-all')).toBeDisabled();
    rerender({ rows: [], loading: false });
    expect(screen.getByTestId('document-picker-empty')).toHaveTextContent('pickEmpty');
  });

  it('forwards the search text to the caller', () => {
    const onSearchChange = vi.fn();
    renderPicker({ onSearchChange });
    fireEvent.change(screen.getByTestId('document-picker-search'), { target: { value: 'fac' } });
    expect(onSearchChange).toHaveBeenCalledWith('fac');
  });

  it('closes from ×, Cancel and the backdrop, but not from a click inside', () => {
    const { onClose } = renderPicker();
    fireEvent.click(screen.getByTestId('document-picker-modal'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('document-picker-close'));
    fireEvent.click(screen.getByTestId('document-picker-cancel'));
    fireEvent.click(screen.getByTestId('document-picker-overlay'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('a column link gets `close`, so following it closes the modal', () => {
    const { onClose } = renderPicker();
    fireEvent.click(screen.getByTestId('doc-link-d2'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(row('d2')).toHaveAttribute('aria-selected', 'false');
  });
});

describe('DocumentPickerModal — committed rows', () => {
  it('open checked and aria-selected, with their initial amount', () => {
    renderPicker();
    expect(row('d1')).toHaveAttribute('aria-selected', 'true');
    expect(within(row('d1')).getByRole('checkbox')).toBeChecked();
    expect(amountInput('d1').value).toMatch(/^30(,00)?$/);
    expect(row('d2')).toHaveAttribute('aria-selected', 'false');
    expect(within(row('d2')).getByRole('checkbox')).not.toBeChecked();
    // An unselected row shows its amount as text, not an input.
    expect(screen.queryByTestId('document-picker-amount-d2')).toBeNull();
    expect(within(row('d2')).getByTestId('document-picker-cell-amount').textContent).toBe(formatCurrency('EUR', 50));
  });

  it('a committed row that arrives on a later page is committed too, not an addition', async () => {
    const { rerender, onConfirm } = renderPicker({ rows: ROWS.slice(1) });
    fireEvent.click(row('d2'));
    rerender({ rows: [...ROWS.slice(1), { id: 'd4', committed: true, applied: 5, max: 10 }] });
    expect(row('d4')).toHaveAttribute('aria-selected', 'true');
    // The earlier pick survives the new page.
    expect(row('d2')).toHaveAttribute('aria-selected', 'true');
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledWith({ add: [{ id: 'd2', amount: '50' }], update: [], remove: [] });
  });
});

describe('DocumentPickerModal — confirm', () => {
  it('is disabled while nothing changed', () => {
    renderPicker();
    expect(confirmButton()).toBeDisabled();
  });

  it('sends a newly picked row as an addition, at its initial amount', async () => {
    const { onConfirm } = renderPicker();
    fireEvent.click(row('d2'));
    expect(confirmButton()).not.toBeDisabled();
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledWith({ add: [{ id: 'd2', amount: '50' }], update: [], remove: [] });
  });

  it('sends a committed row with a new amount as an update', async () => {
    const { onConfirm } = renderPicker();
    setAmount('d1', '45');
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledWith({ add: [], update: [{ id: 'd1', amount: '45' }], remove: [] });
  });

  it('sends an unchecked committed row as a removal', async () => {
    const { onConfirm } = renderPicker();
    fireEvent.click(row('d1'));
    expect(row('d1')).toHaveAttribute('aria-selected', 'false');
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledWith({ add: [], update: [], remove: ['d1'] });
  });

  it('is disabled again when a change is undone', () => {
    renderPicker();
    fireEvent.click(row('d2'));
    fireEvent.click(row('d2'));
    expect(confirmButton()).toBeDisabled();
  });

  it('is disabled while a selected amount is invalid, and says why on the row', () => {
    renderPicker();
    fireEvent.click(row('d2'));
    setAmount('d2', '60');
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByTestId('document-picker-amount-error-d2').textContent)
      .toBe(`boundedAmountExceedsMax:${JSON.stringify({ max: formatCurrency('EUR', 50) })}`);
    setAmount('d2', '50');
    expect(confirmButton()).not.toBeDisabled();
    expect(screen.queryByTestId('document-picker-amount-error-d2')).toBeNull();
  });

  it('is disabled while the confirm runs, then enabled again', async () => {
    let finish;
    const onConfirm = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    renderPicker({ onConfirm });
    fireEvent.click(row('d2'));
    await clickConfirm();
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByTestId('Loader2__document-picker-confirm')).toBeInTheDocument();
    // A second click while running does nothing.
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(confirmButton()).not.toBeDisabled();
    expect(screen.queryByTestId('Loader2__document-picker-confirm')).toBeNull();
  });

  it('keeps an amount typed on a row after it is unchecked and checked again', async () => {
    const { onConfirm } = renderPicker();
    fireEvent.click(row('d2'));
    setAmount('d2', '12');
    fireEvent.click(row('d2'));
    fireEvent.click(row('d2'));
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledWith({ add: [{ id: 'd2', amount: '12' }], update: [], remove: [] });
  });
});

describe('DocumentPickerModal — select all, footer and paging', () => {
  it('selects every loaded row, then deselects them all', async () => {
    const { onConfirm } = renderPicker();
    const toggle = screen.getByTestId('document-picker-select-all');
    expect(toggle).toHaveTextContent('selectAll');
    fireEvent.click(toggle);
    for (const id of ['d1', 'd2', 'd3']) expect(row(id)).toHaveAttribute('aria-selected', 'true');
    expect(toggle).toHaveTextContent('deselectAll');
    // The committed row keeps its own amount; the new ones start at theirs.
    expect(amountInput('d1').value).toMatch(/^30(,00)?$/);
    fireEvent.click(toggle);
    for (const id of ['d1', 'd2', 'd3']) expect(row(id)).toHaveAttribute('aria-selected', 'false');
    expect(toggle).toHaveTextContent('selectAll');
    await clickConfirm();
    expect(onConfirm).toHaveBeenCalledWith({ add: [], update: [], remove: ['d1'] });
  });

  it('counts the selected rows and totals their amounts in the footer and the confirm label', () => {
    renderPicker();
    expect(status()).toBe(footerText(1, 30));
    expect(confirmButton()).toHaveTextContent('pickConfirm:{"count":" (1)"}');
    fireEvent.click(row('d2'));
    expect(status()).toBe(footerText(2, 80));
    setAmount('d2', '12,5');
    expect(status()).toBe(footerText(2, 42.5));
    fireEvent.click(row('d1'));
    fireEvent.click(row('d2'));
    expect(status()).toBe(footerText(0, 0));
    expect(confirmButton()).toHaveTextContent('pickConfirm:{"count":""}');
  });

  function scrollListToBottom() {
    const list = screen.getByTestId('document-picker-list');
    Object.defineProperty(list, 'scrollTop', { value: 640, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(list, 'scrollHeight', { value: 1050, configurable: true });
    fireEvent.scroll(list);
  }

  it('asks for the next page when the list reaches the bottom', () => {
    const { onReachBottom } = renderPicker();
    scrollListToBottom();
    expect(onReachBottom).toHaveBeenCalledTimes(1);
  });

  it('does not ask while far from the bottom, or while a page is loading', () => {
    const { onReachBottom, rerender } = renderPicker();
    const list = screen.getByTestId('document-picker-list');
    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(list, 'scrollHeight', { value: 1050, configurable: true });
    fireEvent.scroll(list);
    expect(onReachBottom).not.toHaveBeenCalled();
    rerender({ loadingMore: true });
    expect(screen.getByTestId('document-picker-loading-more')).toBeInTheDocument();
    scrollListToBottom();
    expect(onReachBottom).not.toHaveBeenCalled();
  });
});

// Repro (ETP-6148 round 3 review): the row's box is the real core Checkbox, a native <label>
// wrapping a visually-hidden <input>. It only understands `onChange`; an `onCheckedChange` prop
// was dropped, and the box's stopPropagation kept the click from the row too, so clicking the box
// did nothing. Both the input and the visible box (which makes the browser re-dispatch a click at
// the input) must toggle the row exactly once.
describe('DocumentPickerModal — clicking the row checkbox', () => {
  const box = (id) => within(screen.getByTestId(`document-picker-row-${id}`)).getByRole('checkbox');
  const clickVisibleBox = (input) => fireEvent.click(input.closest('label').querySelector('div'));

  it('clicking the checkbox input toggles the row once, both ways', () => {
    renderPicker();
    const row = screen.getByTestId('document-picker-row-d2');
    expect(row).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(box('d2'));
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(box('d2')).toBeChecked();
    fireEvent.click(box('d2'));
    expect(row).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking the visible box toggles the row once, both ways', () => {
    renderPicker();
    const row = screen.getByTestId('document-picker-row-d2');
    clickVisibleBox(box('d2'));
    expect(row).toHaveAttribute('aria-selected', 'true');
    clickVisibleBox(box('d2'));
    expect(row).toHaveAttribute('aria-selected', 'false');
  });

  it('unchecking a committed row through its box marks it for removal', async () => {
    const { onConfirm } = renderPicker();
    fireEvent.click(box('d1'));
    expect(screen.getByTestId('document-picker-row-d1')).toHaveAttribute('aria-selected', 'false');
    await act(async () => { fireEvent.click(screen.getByTestId('document-picker-confirm')); });
    expect(onConfirm).toHaveBeenCalledWith({ add: [], update: [], remove: ['d1'] });
  });
});

// Alex review N2: a generic modal closes on Escape, and neither the backdrop nor Escape may close
// it while the confirm is running (the caller's write is in flight and its outcome would be lost).
describe('DocumentPickerModal — Escape and closing while confirming', () => {
  const dialog = () => screen.getByTestId('document-picker-modal');
  const pending = () => {
    let finish;
    const onConfirm = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    return { onConfirm, finish: () => finish() };
  };
  const startConfirm = async () => {
    fireEvent.click(screen.getByTestId('document-picker-row-d2'));
    await act(async () => { fireEvent.click(screen.getByTestId('document-picker-confirm')); });
  };

  it('closes on Escape pressed inside the dialog', () => {
    const { onClose } = renderPicker();
    fireEvent.keyDown(screen.getByTestId('document-picker-search'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores an Escape another handler already consumed', () => {
    const { onClose } = renderPicker();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    screen.getByTestId('document-picker-search').dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores the backdrop and Escape while the confirm runs, and honours them again after', async () => {
    const { onConfirm, finish } = pending();
    const { onClose } = renderPicker({ onConfirm });
    await startConfirm();
    fireEvent.click(screen.getByTestId('document-picker-overlay'));
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    fireEvent.click(screen.getByTestId('document-picker-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside the dialog', () => {
    renderPicker();
    const confirm = screen.getByTestId('document-picker-confirm');
    const close = screen.getByTestId('document-picker-close');
    expect(confirm).toBeDisabled();
    screen.getByTestId('document-picker-cancel').focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(dialog().contains(document.activeElement)).toBe(true);
    document.body.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });
});
