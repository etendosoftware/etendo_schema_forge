/**
 * ETP-5245 — a `type: 'date'` line column edits through the app's DateField, never a
 * bare text box or the browser's native `<input type="date">`.
 *
 * Two independent renderers reach the user for the same column, and they used to
 * disagree:
 *  - the ADD row is `DataTable`'s `InlineAddRow` (an `inlineEditable` tab renders a
 *    header-hidden `<DataTable hideHeader hideDataRows>` next to `InlineLinesPanel` —
 *    see any generated `<Window>Table.jsx`). Its `renderInlineAddFieldControl` had no
 *    `date` branch at all, so the field fell through to `renderInputCell`: a plain
 *    `type="text"` box whose only affordance was the field label as a placeholder,
 *    posting whatever free text the user typed.
 *  - the INLINE EDIT of an existing row is `InlineLinesPanel`'s `EditCell`, which used
 *    the browser's native `<input type="date">` — a third, OS-dependent look.
 *
 * `EntityForm` (form mode) already used `DateField`. This locks all three onto it, and
 * pins the wire format: whatever the control emits must stay `yyyy-MM-dd`, the format
 * the rest of the pipeline assumes for a date (see `normalizeCreationDefaults` in
 * hooks/useEntity.js).
 *
 * Affected windows beyond Product > Cost: price-list (priceListVersion.validFromDate),
 * purchase-order (orderLine.scheduledDeliveryDate), requisition (lines.needByDate),
 * sii-monitor (issuedInvoices, 4 date fields).
 */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createRef } from 'react';
import { DataTable } from '../DataTable.jsx';
import InlineLinesPanel from '../InlineLinesPanel.jsx';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => 'en_US',
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row[`${key}$_identifier`] || row[key] || '',
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label || col.key,
}));

vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));

vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field }) => <span data-testid={`inline-combo-${field.key}`} />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => null,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));

// The real Product > Cost tab: `cost` is the first add-row field, the two dates follow.
const COSTING_COLUMNS = [
  { key: 'cost', column: 'Cost', type: 'amount', label: 'Cost', required: true },
  { key: 'startingDate', column: 'DateFrom', type: 'date', label: 'Starting Date', required: true },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date' },
];

const ADD_LINE_FIELDS = [
  { key: 'cost', column: 'Cost', type: 'number', required: true, label: 'Cost' },
  { key: 'startingDate', column: 'DateFrom', type: 'date', required: true, label: 'Starting Date' },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date' },
];

function renderAddRow(onValuesChange = vi.fn()) {
  return render(
    <DataTable
      columns={COSTING_COLUMNS}
      data={[]}
      entity="costing"
      specName="product"
      token="test"
      apiBaseUrl="/api"
      hideHeader
      hideDataRows
      linesLayout="inlineEditable"
      addRow={{
        ref: createRef(),
        active: true,
        fields: ADD_LINE_FIELDS,
        onAdd: vi.fn(),
        onCancel: vi.fn(),
        catalogs: {},
        onValuesChange,
      }}
    />,
  );
}

describe('ETP-5245 — add-row date fields use the app date picker', () => {
  it('renders a DateField, not a bare text input, for every date add-row field', () => {
    renderAddRow();

    for (const key of ['startingDate', 'endingDate']) {
      const input = screen.getByTestId(`inline-add-field-${key}`);
      // DateField's own input: masked text, never type="date" and never a label placeholder.
      expect(input.tagName).toBe('INPUT');
      expect(input.getAttribute('type')).toBe('text');
      expect(input).toHaveAttribute('inputMode', 'numeric');
      expect(input).toHaveAttribute('maxLength', '10');
      // The regression: renderInputCell used the field label as the placeholder.
      expect(input.getAttribute('placeholder')).not.toBe('Starting Date');
      expect(input.getAttribute('placeholder')).not.toBe('Ending Date');
    }
  });

  it('gives each date field its own calendar trigger', () => {
    renderAddRow();
    // One trigger per date field (and none for `cost`).
    expect(screen.getAllByLabelText('datePickerOpen')).toHaveLength(2);
  });

  it('leaves the non-date add-row fields on the plain text input', () => {
    renderAddRow();
    const cost = screen.getByTestId('inline-add-field-cost');
    expect(cost.getAttribute('type')).toBe('text');
    expect(cost).toHaveAttribute('placeholder', 'Cost');
    expect(cost).not.toHaveAttribute('maxLength', '10');
  });

  it('feeds the add-row values yyyy-MM-dd when a day is picked', async () => {
    const user = userEvent.setup();
    const onValuesChange = vi.fn();
    renderAddRow(onValuesChange);

    await user.click(screen.getAllByLabelText('datePickerOpen')[0]);
    // "Today" is the one calendar action whose expected ISO value we can compute here.
    await user.click(screen.getByText('dateRangeToday'));

    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const last = onValuesChange.mock.calls.at(-1)?.[0] ?? {};
    expect(last.startingDate).toBe(expected);
    expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

function renderLinesPanel(props = {}) {
  return render(
    <InlineLinesPanel
      columns={COSTING_COLUMNS}
      data={[{ id: 'C1', cost: 98.47, startingDate: '2026-04-16', endingDate: '9999-12-31' }]}
      entity="costing"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
      {...props}
    />,
  );
}

describe('ETP-5245 — inline edit of an existing row uses the app date picker', () => {
  it('replaces the native date input with DateField when a row enters edit mode', async () => {
    const user = userEvent.setup();
    renderLinesPanel();

    const row = screen.getByTestId('line-row-C1');
    await user.click(row.querySelector('[data-cell-key="startingDate"]'));

    const input = screen.getByTestId('field-startingDate');
    expect(input.getAttribute('type')).toBe('text');
    expect(input).toHaveAttribute('maxLength', '10');
    expect(screen.getAllByLabelText('datePickerOpen').length).toBeGreaterThan(0);
  });

  it('commits yyyy-MM-dd through onUpdateRow when a day is picked', async () => {
    const user = userEvent.setup();
    const onUpdateRow = vi.fn().mockResolvedValue();
    renderLinesPanel({ onUpdateRow });

    const row = screen.getByTestId('line-row-C1');
    await user.click(row.querySelector('[data-cell-key="startingDate"]'));
    await user.click(screen.getAllByLabelText('datePickerOpen')[0]);
    await user.click(screen.getByText('dateRangeToday'));

    await act(async () => {});

    const call = onUpdateRow.mock.calls.at(-1);
    expect(call).toBeTruthy();
    expect(call[1]).toBe('startingDate');
    expect(call[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps the read-mode cell rendering untouched', () => {
    renderLinesPanel();
    const row = screen.getByTestId('line-row-C1');
    // Read mode still formats through renderDateCell — no input, no calendar trigger.
    expect(row.querySelector('[data-cell-key="startingDate"] input')).toBeNull();
    expect(screen.queryByLabelText('datePickerOpen')).toBeNull();
  });
});
