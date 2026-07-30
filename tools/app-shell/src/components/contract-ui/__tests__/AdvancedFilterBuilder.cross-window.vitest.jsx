import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Radix Select cannot run in JSDOM — same native-<select> replacement used by
// AdvancedFilterBuilder.vitest.jsx (see that file for the full rationale).
vi.mock('@/components/ui/select.jsx', () => ({
  Select: ({ children, value, onValueChange, disabled }) => (
    <select
      data-testid="select-control"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }) => <>{children}</>,
  SelectValue: ({ placeholder }) => (
    placeholder ? <option value="" disabled>{placeholder}</option> : null
  ),
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

vi.mock('@/lib/gridQuery', () => ({
  resolveFilterMode: (col) => {
    if (col.type === 'date') return 'date';
    if (col.type === 'number' || col.type === 'amount') return 'numeric';
    if (col.type === 'status') return 'enumLabel';
    if (col.type === 'boolean') return 'booleanLabel';
    return 'text';
  },
  getDisplayText: () => '',
}));

vi.mock('@/hooks/useDistinctValues.js', () => ({
  useDistinctValues: () => ({
    values: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    search: '',
    setSearch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock('../DistinctValuesList.jsx', () => ({
  DistinctValuesList: () => null,
}));

// The local AdvancedFilterBuilder is a shim to app-shell-core (see
// AdvancedFilterBuilder.vitest.jsx for the full rationale): the rendered
// component's internal imports resolve through the core package's exports map,
// so the '@/...' mocks above no longer bind. Mock the core subpath instead.
vi.mock('@etendosoftware/app-shell-core/components/ui/select.jsx', () => ({
  Select: ({ children, value, onValueChange, disabled }) => (
    <select
      data-testid="select-control"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }) => <>{children}</>,
  SelectValue: ({ placeholder }) => (
    placeholder ? <option value="" disabled>{placeholder}</option> : null
  ),
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

vi.mock('@etendosoftware/app-shell-core/hooks/useDistinctValues.js', () => ({
  useDistinctValues: () => ({
    values: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    search: '',
    setSearch: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock('@etendosoftware/app-shell-core/components/contract-ui/DistinctValuesList.jsx', () => ({
  DistinctValuesList: () => null,
}));

import { AdvancedFilterBuilder } from '../AdvancedFilterBuilder.jsx';

// ============================================================
// ETP-4609 QA cross-window regression check
//
// The two AdvancedFilterBuilder.jsx behavior changes (isFilterableColumn
// excluding bare `type: 'custom'` columns, and the operator list dropping
// isNull/isNotNull for `required: true` columns) are SHARED — every window's
// grid funnel goes through this same component. The Product-scoped unit/E2E
// coverage that shipped with the fix does not exercise any other window.
//
// Each `columns` array below is transcribed verbatim from the real
// production source (not a synthetic analog) so these tests catch the actual
// shipped shape, not an idealized one. Source file is noted per block.
// ============================================================

describe('cross-window regression — warehouse (WarehouseCustomTable.jsx)', () => {
  // tools/app-shell/src/windows/custom/warehouse/WarehouseCustomTable.jsx
  const WAREHOUSE_COLUMNS = [
    { key: 'name', column: 'Name', type: 'custom', required: true },
    { key: 'searchKey', column: 'Value', type: 'custom', required: true },
    { key: 'locationAddress', type: 'custom', sortable: false },
    { key: 'productCount', type: 'custom', sortable: false },
  ];

  it('still offers required custom columns that have a real `column` (name, searchKey)', () => {
    render(<AdvancedFilterBuilder columns={WAREHOUSE_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    const values = within(fieldSelect).getAllByRole('option').map((o) => o.value);
    expect(values).toContain('name');
    expect(values).toContain('searchKey');
  });

  it('excludes isNull/isNotNull for `name` (required custom column with a column)', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder columns={WAREHOUSE_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    await user.selectOptions(fieldSelect, 'name');
    expect(screen.queryByRole('option', { name: 'opIsEmpty' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'opIsNotEmpty' })).not.toBeInTheDocument();
  });

  // Bonus finding (not a regression from this PR): locationAddress/productCount
  // are purely client-rendered cells with no AD `column` and no
  // `backendFilterKey` — before this fix they were still offered in the field
  // selector (isFilterableColumn only checked `filterable !== false`), so
  // selecting them built a criteria filtering on `fieldName: 'locationAddress'`
  // / `'productCount'` — neither is a real backend-queryable property, so the
  // filter was silently broken. The fix's `type === 'custom'` + no `column`/
  // `backendFilterKey` exclusion correctly removes this latent dead-end.
  it('excludes locationAddress and productCount (custom, no column/backendFilterKey) — latent bug fixed', () => {
    render(<AdvancedFilterBuilder columns={WAREHOUSE_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    const values = within(fieldSelect).getAllByRole('option').map((o) => o.value);
    expect(values).not.toContain('locationAddress');
    expect(values).not.toContain('productCount');
  });
});

describe('cross-window regression — physical-inventory (windows/custom/physical-inventory/index.jsx)', () => {
  const PHYSICAL_INVENTORY_COLUMNS = [
    { key: 'movementDate', column: 'MovementDate', type: 'date', dot: false },
    { key: 'name', column: 'Name', type: 'string' },
    { key: 'warehouse', column: 'M_Warehouse_ID', type: 'custom', required: true },
    { key: 'processed', column: 'Processed', type: 'status' },
    { key: 'posted', column: 'Posted', type: 'boolean' },
  ];

  it('still offers the required custom `warehouse` column (it declares `column`)', () => {
    render(<AdvancedFilterBuilder columns={PHYSICAL_INVENTORY_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    const values = within(fieldSelect).getAllByRole('option').map((o) => o.value);
    expect(values).toContain('warehouse');
  });

  it('excludes isNull/isNotNull for the required `warehouse` column', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder columns={PHYSICAL_INVENTORY_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    await user.selectOptions(fieldSelect, 'warehouse');
    expect(screen.queryByRole('option', { name: 'opIsEmpty' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'opIsNotEmpty' })).not.toBeInTheDocument();
  });

  // No-regression spot-check: a non-required column in the SAME window must
  // still offer the full operator set, incl. date-specific relabeling and
  // isNull/isNotNull — guards against the required-filter being applied too
  // broadly (e.g. by mistake, to the whole row instead of just that column).
  it('still offers isNull/isNotNull and date ops for the non-required `movementDate` column', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder columns={PHYSICAL_INVENTORY_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    await user.selectOptions(fieldSelect, 'movementDate');
    expect(screen.getByRole('option', { name: 'opBefore' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'opAfter' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'opBetween' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'opIsEmpty' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'opIsNotEmpty' })).toBeInTheDocument();
  });
});

describe('cross-window regression — tax-category (generated TaxCategoryTable.jsx, no custom override)', () => {
  // artifacts/tax-category/generated/web/tax-category/TaxCategoryTable.jsx
  // Edge case: EVERY column on this grid is required:true, and one of them
  // (`default`) is boolean — booleanLabel mode never had isNull/isNotNull to
  // begin with (OPERATORS_BY_MODE.booleanLabel = ['equals']), so this guards
  // against the required-filter crashing/erroring on an already-nullish-free
  // operator list.
  const TAX_CATEGORY_COLUMNS = [
    { key: 'name', column: 'Name', type: 'string', required: true },
    { key: 'default', column: 'IsDefault', type: 'boolean', required: true },
  ];

  it('excludes isNull/isNotNull for the required `name` column', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder columns={TAX_CATEGORY_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    await user.selectOptions(fieldSelect, 'name');
    expect(screen.getByRole('option', { name: 'opIs' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'opIsEmpty' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'opIsNotEmpty' })).not.toBeInTheDocument();
  });

  it('does not crash on a required boolean column that never had isNull ops (default)', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder columns={TAX_CATEGORY_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    await user.selectOptions(fieldSelect, 'default');
    const [, opSelect] = screen.getAllByTestId('select-control');
    const opValues = within(opSelect).getAllByRole('option').map((o) => o.value).filter(Boolean);
    expect(opValues).toEqual(['equals']);
  });

  it('still lists both required columns in the field selector (no over-exclusion)', () => {
    render(<AdvancedFilterBuilder columns={TAX_CATEGORY_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    const values = within(fieldSelect).getAllByRole('option').map((o) => o.value);
    expect(values).toContain('name');
    expect(values).toContain('default');
  });
});

describe('cross-window regression — purchase-invoice (PurchaseInvoiceHeaderTable.jsx)', () => {
  // tools/app-shell/src/windows/custom/purchase-invoice/PurchaseInvoiceHeaderTable.jsx
  // `_siiStatus` is a purely derived badge column (fiscal status) with no
  // `column`/`backendFilterKey` — same latent-bug shape as warehouse's
  // locationAddress/productCount above.
  const PURCHASE_INVOICE_COLUMNS = [
    { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', dot: false },
    { key: 'transactionDocument', column: 'C_DocTypeTarget_ID', type: 'custom' },
    { key: 'orderReference', column: 'POReference', type: 'string' },
    { key: 'eTGODueDate', column: 'EM_Etgo_Due_Date', type: 'custom' },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
    { key: 'documentStatus', column: 'DocStatus', type: 'status' },
    { key: 'posted', column: 'Posted', type: 'boolean' },
    { key: '_siiStatus', type: 'custom' },
    { key: 'grandTotalAmount', column: 'GrandTotal', type: 'custom' },
    { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'custom' },
  ];

  it('excludes `_siiStatus` (custom, no column/backendFilterKey) — latent bug fixed', () => {
    render(<AdvancedFilterBuilder columns={PURCHASE_INVOICE_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    const values = within(fieldSelect).getAllByRole('option').map((o) => o.value);
    expect(values).not.toContain('_siiStatus');
  });

  it('still offers every other `type: custom` column that declares a `column` (no over-exclusion)', () => {
    render(<AdvancedFilterBuilder columns={PURCHASE_INVOICE_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    const values = within(fieldSelect).getAllByRole('option').map((o) => o.value);
    expect(values).toContain('transactionDocument');
    expect(values).toContain('eTGODueDate');
    expect(values).toContain('grandTotalAmount');
    expect(values).toContain('outstandingAmount');
  });
});

describe('cross-window regression — business-partner-category (all columns required)', () => {
  // artifacts/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryTable.jsx
  // Edge case: a window where every grid column is required:true.
  const BP_CATEGORY_COLUMNS = [
    { key: 'searchKey', column: 'Value', type: 'string', required: true },
    { key: 'name', column: 'Name', type: 'string', required: true },
  ];

  it('excludes isNull/isNotNull for both required columns, and both remain selectable', async () => {
    const user = userEvent.setup();
    render(<AdvancedFilterBuilder columns={BP_CATEGORY_COLUMNS} />);
    const [fieldSelect] = screen.getAllByTestId('select-control');
    const values = within(fieldSelect).getAllByRole('option').map((o) => o.value);
    expect(values).toContain('searchKey');
    expect(values).toContain('name');

    await user.selectOptions(fieldSelect, 'searchKey');
    expect(screen.queryByRole('option', { name: 'opIsEmpty' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'opIsNotEmpty' })).not.toBeInTheDocument();

    await user.selectOptions(fieldSelect, 'name');
    expect(screen.queryByRole('option', { name: 'opIsEmpty' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'opIsNotEmpty' })).not.toBeInTheDocument();
  });
});
