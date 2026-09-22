/**
 * ETP-5133 (QA point #1) — the add-row's per-line "saving" spinner must stay
 * pixel-aligned with the checkbox column on the saved rows above it.
 *
 * Before this fix, InlineAddRow's leading spinner cell reserved its own
 * independently-guessed `w-10` Tailwind width instead of the SAME
 * `CHECKBOX_COLUMN_WIDTH` constant InlineLinesPanel's real checkbox cell
 * uses — the two happened to agree today (both 40px) but nothing tied them
 * together, exactly the class of drift ETP-5245 already hit once for a
 * sibling column. This spec locks the spinner cell to the exported constant
 * (not a hardcoded "40") so a future change to `CHECKBOX_COLUMN_WIDTH` cannot
 * silently desync the two again, and locks the spinner's `aria-label` to the
 * new `ui('savingLineTooltip')` i18n key instead of a hardcoded English
 * string.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  getStatusTone: () => 'neutral',
  statusLabel: (raw) => raw,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));
vi.mock('@/components/ui/tag', () => ({ Tag: ({ label }) => <span>{label}</span> }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (col) => col.label ?? col.key }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';
import { CHECKBOX_COLUMN_WIDTH } from '../InlineLinesPanel.jsx';

function renderSelectableAddRow(onAdd) {
  const fields = [{ key: 'name', label: 'Name', type: 'string', required: true }];
  const columns = fields.map((f) => ({ key: f.key, label: f.label, type: f.type }));
  return render(
    <DataTable
      columns={columns}
      data={[]}
      addRow={{ active: true, fields, onAdd, onCancel: vi.fn(), catalogs: {} }}
      selectable
    />,
  );
}

describe('DataTable add-row saving spinner alignment (ETP-5133)', () => {
  it('sizes the leading spinner cell to the exported CHECKBOX_COLUMN_WIDTH constant, not an independent guess', () => {
    renderSelectableAddRow(vi.fn(() => Promise.resolve(true)));
    const spinnerCell = screen.getByTestId('inline-add-row').querySelector('td');
    expect(spinnerCell).not.toBeNull();
    expect(spinnerCell.style.width).toBe(`${CHECKBOX_COLUMN_WIDTH}px`);
  });

  it('renders no spinner while idle (before a save is in flight)', () => {
    renderSelectableAddRow(vi.fn(() => Promise.resolve(true)));
    expect(screen.queryByTestId('Loader2__eb5261')).not.toBeInTheDocument();
  });

  it('shows the spinner with an i18n-keyed aria-label (not a hardcoded English string) while a save is in flight', async () => {
    let resolveAdd;
    const onAdd = vi.fn(() => new Promise((resolve) => { resolveAdd = resolve; }));
    renderSelectableAddRow(onAdd);

    fireEvent.change(screen.getByTestId('inline-add-field-name'), { target: { value: 'Widget' } });
    fireEvent.keyDown(screen.getByTestId('inline-add-field-name'), { key: 'Enter' });

    await waitFor(() => expect(screen.getByTestId('Loader2__eb5261')).toBeInTheDocument());
    const spinner = screen.getByTestId('Loader2__eb5261');
    expect(spinner).toHaveAttribute('aria-label', 'savingLineTooltip');
    expect(spinner.getAttribute('aria-label')).not.toMatch(/Saving line/i);

    // Settle the in-flight promise so the test doesn't leak a pending act().
    resolveAdd(true);
    await waitFor(() => expect(screen.queryByTestId('Loader2__eb5261')).not.toBeInTheDocument());
  });
});
