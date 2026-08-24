import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  // The AD dictionary translator. Returning null for everything makes resolveColumnLabel fall
  // through to `col.labels` / `col.label`, which is the interesting branch here.
  useLabel: () => () => null,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

import { ListSortPopover } from '../ListSortPopover.jsx';

/**
 * ListSortPopover — the toolbar "Ordenar por" control.
 *
 * Extracted out of ListView's idle bar so `financial-account`, which replaces that bar with its
 * own toolbar (`hideListBar: true`), can still offer it instead of leaving clickable headers as
 * the only sort affordance.
 */
const COLUMNS = [
  { key: 'name', column: 'Name', labels: { es_ES: 'Cuenta' } },
  { key: 'type', column: 'Type', labels: { es_ES: 'Tipo' } },
  { key: 'currentBalance', column: 'Currentbalance', label: 'Balance' },
  { key: '_rowActions', labels: { es_ES: '' }, sortable: false },
];

const renderPopover = (over = {}) => render(
  <ListSortPopover
    columns={COLUMNS}
    sortColumn={null}
    sortDirection="asc"
    onSelect={vi.fn()}
    onClear={vi.fn()}
    isDefaultSort
    {...over}
  />,
);

const open = () => fireEvent.click(screen.getByTestId('list-sort-toggle'));

describe('ListSortPopover', () => {
  it('renders only the toggle until it is opened', () => {
    renderPopover();

    expect(screen.getByTestId('list-sort-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('list-sort-popover')).not.toBeInTheDocument();
  });

  it('lists one entry per sortable column and drops the opt-outs', () => {
    renderPopover();
    open();

    expect(screen.getByTestId('list-sort-option-name')).toBeInTheDocument();
    expect(screen.getByTestId('list-sort-option-type')).toBeInTheDocument();
    expect(screen.getByTestId('list-sort-option-currentBalance')).toBeInTheDocument();
    // sortable: false — the actions column must never appear as something to sort by.
    expect(screen.queryByTestId('list-sort-option-_rowActions')).not.toBeInTheDocument();
  });

  // The regression this guards: the inline version resolved labels as
  // `t(col.column) ?? col.label`, never consulting `col.labels`. A window whose headers come
  // from a declared gridLabelKey would have listed raw English contract labels here.
  it('labels each entry the way the column header does', () => {
    renderPopover();
    open();

    expect(screen.getByTestId('list-sort-option-name').textContent).toContain('Cuenta');
    expect(screen.getByTestId('list-sort-option-type').textContent).toContain('Tipo');
    // No `labels`, so it falls through to the contract's own label.
    expect(screen.getByTestId('list-sort-option-currentBalance').textContent).toContain('Balance');
  });

  it('reports the picked column and closes', () => {
    const onSelect = vi.fn();
    renderPopover({ onSelect });
    open();

    fireEvent.click(screen.getByTestId('list-sort-option-type'));

    expect(onSelect).toHaveBeenCalledWith('type');
    expect(screen.queryByTestId('list-sort-popover')).not.toBeInTheDocument();
  });

  it('marks the active column with its direction arrow', () => {
    renderPopover({ sortColumn: 'type', sortDirection: 'desc', isDefaultSort: false });
    open();

    expect(screen.getByTestId('list-sort-option-type').textContent).toContain('▼');
    expect(screen.getByTestId('list-sort-option-name').textContent).not.toContain('▼');
  });

  // Offering "clear" while already at the default would be a visible no-op.
  it('offers the clear row only once the sort has left the default', () => {
    const { unmount } = renderPopover({ isDefaultSort: true });
    open();
    expect(screen.queryByTestId('list-sort-clear')).not.toBeInTheDocument();
    unmount();

    const onClear = vi.fn();
    renderPopover({ isDefaultSort: false, sortColumn: 'type', onClear });
    open();
    fireEvent.click(screen.getByTestId('list-sort-clear'));
    expect(onClear).toHaveBeenCalled();
  });

  it('closes on an outside click', () => {
    renderPopover();
    open();
    expect(screen.getByTestId('list-sort-popover')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId('list-sort-popover')).not.toBeInTheDocument();
  });

  it('renders no popover body when every column opted out', () => {
    renderPopover({ columns: [{ key: 'a', sortable: false }] });
    open();

    expect(screen.queryByTestId('list-sort-popover')).not.toBeInTheDocument();
  });
});
