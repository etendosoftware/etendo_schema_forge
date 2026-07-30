/**
 * ETP-4656 — DataTable's `deselectTrigger`/`deselectRowIds` pair (partial
 * bulk-delete outcome: drop only the succeeded ids from the internal
 * selection Set, leaving the failed ones checked).
 *
 * QA gap: this mechanism was only exercised indirectly through ListView with
 * a fully mocked `Table` component (see ListView.bulkDelete.vitest.jsx, which
 * asserts what ListView *forwards* but never mounts the real DataTable). This
 * file drives the real DataTable component and asserts the actual checkbox
 * state, plus the interaction with the pre-existing `clearSelectionTrigger`
 * (both props are independent `useEffect`s reacting to different trigger
 * counters — this locks in what happens when both fire together).
 */
import { render, screen, within, fireEvent } from '@testing-library/react';

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
vi.mock('@/components/ui/status-tag', () => ({ StatusTag: ({ status, label }) => <span>{label || status}</span> }));
vi.mock('@/components/ui/tag', () => ({ Tag: ({ label }) => <span>{label}</span> }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (col) => col.label ?? col.key }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({ applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }) }));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

const COLUMNS = [{ key: 'name', label: 'Name', type: 'string' }];
const DATA = [
  { id: '1', name: 'Row A' },
  { id: '2', name: 'Row B' },
  { id: '3', name: 'Row C' },
];

function isRowChecked(rowId) {
  // The Checkbox primitive renders `role="checkbox"` on an outer <button> (see
  // @etendosoftware/app-shell-core/components/ui/checkbox.jsx) — the native
  // `<input type="checkbox">` is aria-hidden inside it, so `.checked` (a DOM
  // input property) is never present on the queried element. Read the
  // `aria-checked` attribute the button actually sets instead.
  return within(screen.getByTestId(`row-${rowId}`)).getByRole('checkbox').getAttribute('aria-checked') === 'true';
}

describe('DataTable — deselectTrigger/deselectRowIds (ETP-4656)', () => {
  it('selects all three rows via the header checkbox as a setup baseline', () => {
    const { rerender } = render(<DataTable columns={COLUMNS} data={DATA} />);
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(headerCheckbox);
    expect(isRowChecked('1')).toBe(true);
    expect(isRowChecked('2')).toBe(true);
    expect(isRowChecked('3')).toBe(true);
    rerender(<DataTable columns={COLUMNS} data={DATA} />);
  });

  it('removes only the ids in deselectRowIds, leaving the rest checked', () => {
    const { rerender } = render(
      <DataTable columns={COLUMNS} data={DATA} deselectTrigger={0} deselectRowIds={[]} />
    );
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(headerCheckbox);
    expect(isRowChecked('1')).toBe(true);
    expect(isRowChecked('2')).toBe(true);
    expect(isRowChecked('3')).toBe(true);

    // Bump deselectTrigger with row '2' as the succeeded id (rows '1'/'3' failed).
    rerender(
      <DataTable columns={COLUMNS} data={DATA} deselectTrigger={1} deselectRowIds={['2']} />
    );

    expect(isRowChecked('1')).toBe(true);
    expect(isRowChecked('2')).toBe(false);
    expect(isRowChecked('3')).toBe(true);
  });

  it('does nothing when deselectTrigger increments but deselectRowIds is empty', () => {
    const { rerender } = render(
      <DataTable columns={COLUMNS} data={DATA} deselectTrigger={0} deselectRowIds={[]} />
    );
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(headerCheckbox);
    expect(isRowChecked('1')).toBe(true);

    rerender(<DataTable columns={COLUMNS} data={DATA} deselectTrigger={1} deselectRowIds={[]} />);

    // Nothing should have been dropped — the effect bails out early.
    expect(isRowChecked('1')).toBe(true);
    expect(isRowChecked('2')).toBe(true);
    expect(isRowChecked('3')).toBe(true);
  });

  it('does not re-fire when deselectRowIds changes but deselectTrigger stays the same', () => {
    const { rerender } = render(
      <DataTable columns={COLUMNS} data={DATA} deselectTrigger={1} deselectRowIds={['1']} />
    );
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(headerCheckbox);
    expect(isRowChecked('1')).toBe(true);

    // Same trigger value, different ids array (new reference) — the effect's
    // dependency array is `[deselectTrigger]` only, so this must NOT re-fire.
    rerender(<DataTable columns={COLUMNS} data={DATA} deselectTrigger={1} deselectRowIds={['1', '2']} />);

    expect(isRowChecked('1')).toBe(true);
    expect(isRowChecked('2')).toBe(true);
  });

  it('clearSelectionTrigger firing together with deselectTrigger in the same update wins (full clear beats partial deselect)', () => {
    const { rerender } = render(
      <DataTable
        columns={COLUMNS}
        data={DATA}
        clearSelectionTrigger={0}
        deselectTrigger={0}
        deselectRowIds={[]}
      />
    );
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(headerCheckbox);
    expect(isRowChecked('1')).toBe(true);
    expect(isRowChecked('2')).toBe(true);
    expect(isRowChecked('3')).toBe(true);

    // Both triggers bump in the same render — e.g. a host that calls
    // clearSelection() and also has a stale deselect bump queued.
    rerender(
      <DataTable
        columns={COLUMNS}
        data={DATA}
        clearSelectionTrigger={1}
        deselectTrigger={1}
        deselectRowIds={['2']}
      />
    );

    // clearSelectionTrigger's effect always sets a brand-new empty Set; the
    // deselectTrigger effect's functional update runs against that same
    // empty Set (both effects commit in the same pass), so the net result
    // is simply "everything cleared" — no stale re-checked row.
    expect(isRowChecked('1')).toBe(false);
    expect(isRowChecked('2')).toBe(false);
    expect(isRowChecked('3')).toBe(false);
  });
});
