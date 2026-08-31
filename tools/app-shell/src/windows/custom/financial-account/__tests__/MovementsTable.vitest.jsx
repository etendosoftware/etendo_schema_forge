import { render, screen, fireEvent, within } from '@testing-library/react';

// i18n translator returns the key itself, so we assert on key strings.
vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

// Stub the leaf cell components — their internals are out of scope here.
vi.mock('../MovementStatusBadge', () => ({
  MovementStatusBadge: ({ status }) => <span data-testid="status-badge">{status}</span>,
}));
vi.mock('../PostingStatusDot', () => ({
  PostingStatusDot: () => <span data-testid="posting-dot" />,
}));
vi.mock('../MovementRowKebab', () => ({
  MovementRowKebab: () => <span data-testid="row-kebab" />,
}));
vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value }) => <span data-testid="money">{String(value)}</span>,
}));

// Inject an extra contract column with NO renderer in MOVEMENT_CELL_RENDERERS so
// the plain-text fallback branch of renderContractCell is exercised. The known
// columns keep their bespoke renderers.
vi.mock('@/components/financial-accounts/contractColumns', () => ({
  getContractGridColumns: () => [
    { name: 'documentNo', label: 'Doc' },
    // Its registry entry declares header `parts`, so this is the column that exercises the
    // multi-segment header branch (ETP-4921).
    { name: 'transactionType', label: 'Type' },
    { name: 'reference', label: 'Reference' }, // no registry entry → fallback cell
  ],
  // Same panel fields as the real financial-account contract, in `seq` order: the
  // funds-transfer counterpart link first, then the three fixed dimensions.
  getContractPanelFields: () => [
    { name: 'eTGOFinaccTransDest', label: 'Destination Financial Account' },
    { name: 'project', label: 'Project' },
    { name: 'costCenter', label: 'Cost Center' },
    { name: 'product', label: 'Product' },
  ],
}));

import * as React from 'react';
import { useClientSort } from '@/hooks/useClientSort';
import {
  MovementsTable,
  buildMovementSortCtx,
  buildMovementSortAccessors,
} from '../MovementsTable.jsx';
import {
  backgroundUtilities,
  hoverBackgroundUtilities,
  countBackgroundUtilities,
} from '@/test/rowShading.js';

const baseMovement = (over = {}) => ({
  id: 'm1',
  date: '2026-05-10',
  documentNo: 'DOC-001',
  contact: 'ACME',
  description: 'office',
  paymentStatus: 'RPR',
  trxType: 'BPD',
  glItem: 'EXP',
  amount: 100,
  balance: 1000,
  currencyIso: 'EUR',
  dimensions: {},
  ...over,
});

// The table is CONTROLLED since the sort state moved up to the tab (whose toolbar hosts the
// "Ordenar por" popover). This harness supplies that state with the same hook the tab uses, so
// header clicks stay exercised end to end.
function Harness(props) {
  const accessors = React.useMemo(
    () => buildMovementSortAccessors(buildMovementSortCtx((k) => k, (m) => m.trxType)),
    [],
  );
  const { sorted, sortKey, sortDirection, toggleSort } = useClientSort(
    props.movements ?? [baseMovement()],
    { accessors },
  );
  return (
    <MovementsTable
      movements={sorted}
      loading={props.loading ?? false}
      enabledDimensions={props.enabledDimensions ?? []}
      selectedIds={props.selectedIds ?? new Set()}
      onSelectionChange={props.onSelectionChange ?? vi.fn()}
      highlightTxnId={props.highlightTxnId}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={toggleSort}
    />
  );
}

function renderTable(props = {}) {
  return render(<Harness {...props} />);
}

describe('MovementsTable — payment link', () => {
  beforeEach(() => navigate.mockClear());

  it('navigates to payment-in for a receipt payment', () => {
    renderTable({
      movements: [baseMovement({ paymentId: 'pay-1', paymentIsReceipt: 'Y' })],
    });
    fireEvent.click(screen.getByText('DOC-001'));
    expect(navigate).toHaveBeenCalledWith('/payment-in/pay-1');
  });

  it('navigates to payment-out for a non-receipt payment', () => {
    renderTable({
      movements: [baseMovement({ paymentId: 'pay-2', paymentIsReceipt: 'N' })],
    });
    fireEvent.click(screen.getByText('DOC-001'));
    expect(navigate).toHaveBeenCalledWith('/payment-out/pay-2');
  });

  it('renders documentNo as plain text (no navigation) when there is no paymentId', () => {
    renderTable({ movements: [baseMovement({ paymentId: undefined })] });
    const docCell = screen.getByText('DOC-001');
    expect(docCell.tagName).toBe('SPAN');
    fireEvent.click(docCell);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('MovementsTable — expandable dimensions panel', () => {
  it('renders no expand control when enabledDimensions is empty', () => {
    renderTable({ enabledDimensions: [] });
    expect(screen.queryByTestId('movement-expand-m1')).not.toBeInTheDocument();
  });

  it('expands and collapses the more-info panel on click', () => {
    renderTable({
      enabledDimensions: ['project'],
      movements: [baseMovement({ dimensions: { project: 'Proj A' } })],
    });
    const expand = screen.getByTestId('movement-expand-m1');
    expect(screen.queryByTestId('movement-moreinfo-m1')).not.toBeInTheDocument();

    fireEvent.click(expand);
    expect(screen.getByTestId('movement-moreinfo-m1')).toBeInTheDocument();

    fireEvent.click(expand);
    expect(screen.queryByTestId('movement-moreinfo-m1')).not.toBeInTheDocument();
  });

  it('shows only project, cost center and product as read-only fields (never organization)', () => {
    renderTable({
      enabledDimensions: ['organization', 'project', 'costcenter', 'product', 'campaign', 'bpartner'],
      movements: [
        baseMovement({
          dimensions: {
            organization: 'Org Y',  // must NOT show — organization is excluded from the panel
            project: 'Proj A',
            costcenter: '',          // shown as an empty read-only field
            product: 'Prod X',
            campaign: 'Camp Z',      // must NOT show — only the three fixed dimensions are rendered
            bpartner: 'Should Not Show',
          },
        }),
      ],
    });
    fireEvent.click(screen.getByTestId('movement-expand-m1'));
    const panel = screen.getByTestId('movement-moreinfo-m1');

    // The three fixed dimensions render (project + product carry values; cost center is empty).
    expect(within(panel).getByText('financeAccountMovementsDimProject')).toBeInTheDocument();
    expect(within(panel).getByText('financeAccountMovementsDimCostcenter')).toBeInTheDocument();
    expect(within(panel).getByText('financeAccountMovementsDimProduct')).toBeInTheDocument();
    expect(within(panel).getByDisplayValue('Proj A')).toBeDisabled();
    expect(within(panel).getByDisplayValue('Prod X')).toBeInTheDocument();

    // Organization, campaign and bpartner are never rendered in the panel.
    expect(within(panel).queryByText('financeAccountMovementsDimOrganization')).not.toBeInTheDocument();
    expect(within(panel).queryByText('financeAccountMovementsDimCampaign')).not.toBeInTheDocument();
    expect(within(panel).queryByText('financeAccountMovementsDimBpartner')).not.toBeInTheDocument();
    expect(within(panel).queryByDisplayValue('Org Y')).not.toBeInTheDocument();
    expect(within(panel).queryByDisplayValue('Should Not Show')).not.toBeInTheDocument();
  });

  it('hides a displayable dimension that is NOT enabled in the chart of accounts (e.g. product)', () => {
    // Product is deactivated → it must not appear even though the movement carries a value.
    renderTable({
      enabledDimensions: ['project', 'costcenter'],
      movements: [baseMovement({ dimensions: { project: 'Proj A', costcenter: 'CC 1', product: 'Prod X' } })],
    });
    fireEvent.click(screen.getByTestId('movement-expand-m1'));
    const panel = screen.getByTestId('movement-moreinfo-m1');
    expect(within(panel).getByText('financeAccountMovementsDimProject')).toBeInTheDocument();
    expect(within(panel).getByText('financeAccountMovementsDimCostcenter')).toBeInTheDocument();
    expect(within(panel).queryByText('financeAccountMovementsDimProduct')).not.toBeInTheDocument();
    expect(within(panel).queryByDisplayValue('Prod X')).not.toBeInTheDocument();
  });

  it('renders no expand control when only non-displayable dimensions are enabled (e.g. bpartner)', () => {
    renderTable({
      enabledDimensions: ['bpartner'],
      movements: [baseMovement({ dimensions: { product: 'Prod X' } })],
    });
    expect(screen.queryByTestId('movement-expand-m1')).not.toBeInTheDocument();
  });
});

// The funds-transfer counterpart link (ETP-4882). One panel slot serves both directions:
// the backend collapses em_etgo_finacc_trans_dest / em_aprm_finacc_trans_origin into the
// same transfer* props and flags the side via transferDirection.
describe('MovementsTable — funds-transfer counterpart link', () => {
  const transferMovement = (over = {}) => baseMovement({
    transferTxnId: 'txn-far',
    transferAccountId: 'acct-far',
    transferAccountName: 'Banco Santander',
    transferDirection: 'out',
    ...over,
  });

  it('labels the link "destination" on the source (BPW) leg', () => {
    renderTable({ enabledDimensions: ['project'], movements: [transferMovement({ trxType: 'BPW' })] });
    fireEvent.click(screen.getByTestId('movement-expand-m1'));
    const panel = screen.getByTestId('movement-moreinfo-m1');

    expect(within(panel).getByText('financeAccountMovementsTransferTo')).toBeInTheDocument();
    expect(within(panel).queryByText('financeAccountMovementsTransferFrom')).not.toBeInTheDocument();
    expect(within(panel).getByTestId('movement-transfer-link-m1')).toHaveTextContent('Banco Santander');
  });

  it('labels the link "origin" on the destination (BPD) leg', () => {
    renderTable({
      enabledDimensions: ['project'],
      movements: [transferMovement({ trxType: 'BPD', transferDirection: 'in' })],
    });
    fireEvent.click(screen.getByTestId('movement-expand-m1'));
    const panel = screen.getByTestId('movement-moreinfo-m1');

    expect(within(panel).getByText('financeAccountMovementsTransferFrom')).toBeInTheDocument();
    expect(within(panel).queryByText('financeAccountMovementsTransferTo')).not.toBeInTheDocument();
  });

  it('renders the link BEFORE the accounting dimensions', () => {
    renderTable({
      enabledDimensions: ['project', 'costcenter', 'product'],
      movements: [transferMovement({ dimensions: { project: 'Proj A' } })],
    });
    fireEvent.click(screen.getByTestId('movement-expand-m1'));
    const panel = screen.getByTestId('movement-moreinfo-m1');

    const labels = within(panel).getAllByText(/^financeAccountMovements(TransferTo|Dim)/).map((n) => n.textContent);
    expect(labels[0]).toBe('financeAccountMovementsTransferTo');
    expect(labels).toContain('financeAccountMovementsDimProject');
  });

  it('navigates to the counterpart transaction in the other account', () => {
    renderTable({ enabledDimensions: ['project'], movements: [transferMovement()] });
    fireEvent.click(screen.getByTestId('movement-expand-m1'));
    fireEvent.click(screen.getByTestId('movement-transfer-link-m1'));

    expect(navigate).toHaveBeenCalledWith('/financial-account/acct-far?tab=movements&txn=txn-far');
  });

  it('omits the link on a movement that is not part of a transfer', () => {
    renderTable({
      enabledDimensions: ['project'],
      movements: [baseMovement({ dimensions: { project: 'Proj A' } })],
    });
    fireEvent.click(screen.getByTestId('movement-expand-m1'));
    const panel = screen.getByTestId('movement-moreinfo-m1');

    expect(within(panel).queryByTestId('movement-transfer-link-m1')).not.toBeInTheDocument();
    expect(within(panel).queryByText('financeAccountMovementsTransferTo')).not.toBeInTheDocument();
  });

  // Regression guard: expandability used to be a single global flag, so a client with no
  // accounting dimension enabled got no chevron at all and the link was unreachable.
  it('still exposes the expand control when NO accounting dimension is enabled', () => {
    renderTable({ enabledDimensions: [], movements: [transferMovement()] });

    const expand = screen.getByTestId('movement-expand-m1');
    fireEvent.click(expand);
    expect(within(screen.getByTestId('movement-moreinfo-m1'))
      .getByTestId('movement-transfer-link-m1')).toBeInTheDocument();
  });

  it('keeps non-transfer rows unexpandable when no dimension is enabled', () => {
    renderTable({ enabledDimensions: [], movements: [baseMovement()] });
    expect(screen.queryByTestId('movement-expand-m1')).not.toBeInTheDocument();
  });
});

describe('MovementsTable — selection', () => {
  it('reflects selectedIds and calls onSelectionChange for a row checkbox', () => {
    const onSelectionChange = vi.fn();
    renderTable({
      movements: [baseMovement({ id: 'm1' })],
      selectedIds: new Set(['m1']),
      onSelectionChange,
    });
    const checkboxes = screen.getAllByRole('checkbox');
    // [0] = header select-all, [1] = the single row checkbox.
    const rowCheckbox = checkboxes[1];
    expect(rowCheckbox).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(rowCheckbox);
    expect(onSelectionChange).toHaveBeenCalledWith('m1');
  });

  it('header select-all is indeterminate and toggles only the unselected rows', () => {
    const onSelectionChange = vi.fn();
    renderTable({
      movements: [
        baseMovement({ id: 'm1' }),
        baseMovement({ id: 'm2' }),
        baseMovement({ id: 'm3' }),
      ],
      selectedIds: new Set(['m1']), // partially selected
      onSelectionChange,
    });
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    expect(headerCheckbox).toHaveAttribute('aria-checked', 'mixed');

    fireEvent.click(headerCheckbox);
    // Toggles only the currently-unselected rows: m2 and m3.
    expect(onSelectionChange).toHaveBeenCalledTimes(2);
    expect(onSelectionChange).toHaveBeenCalledWith('m2');
    expect(onSelectionChange).toHaveBeenCalledWith('m3');
    expect(onSelectionChange).not.toHaveBeenCalledWith('m1');
  });

  it('header select-all deselects every row when all are selected', () => {
    const onSelectionChange = vi.fn();
    renderTable({
      movements: [baseMovement({ id: 'm1' }), baseMovement({ id: 'm2' })],
      selectedIds: new Set(['m1', 'm2']),
      onSelectionChange,
    });
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    expect(headerCheckbox).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(headerCheckbox);
    expect(onSelectionChange).toHaveBeenCalledTimes(2);
    expect(onSelectionChange).toHaveBeenCalledWith('m1');
    expect(onSelectionChange).toHaveBeenCalledWith('m2');
  });

  it('clicking a row checkbox does not navigate (stopPropagation on the cell)', () => {
    const onSelectionChange = vi.fn();
    renderTable({
      movements: [baseMovement({ id: 'm1', paymentId: 'pay-1', paymentIsReceipt: 'Y' })],
      enabledDimensions: ['project'],
      onSelectionChange,
    });
    navigate.mockClear();
    const rowCheckbox = screen.getAllByRole('checkbox')[1];
    fireEvent.click(rowCheckbox);
    expect(onSelectionChange).toHaveBeenCalledWith('m1');
    expect(navigate).not.toHaveBeenCalled();
    // Expand panel should not open from the checkbox click either.
    expect(screen.queryByTestId('movement-moreinfo-m1')).not.toBeInTheDocument();
  });
});

describe('MovementsTable — contract cell fallback', () => {
  it('renders a contract column with no renderer as plain text', () => {
    renderTable({ movements: [baseMovement({ reference: 'REF-42' })] });
    expect(screen.getByText('REF-42')).toBeInTheDocument();
  });

  it('renders an em dash when the fallback field value is missing', () => {
    renderTable({ movements: [baseMovement({ reference: undefined })] });
    // The fallback cell renders '—' for a nullish value.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('MovementsTable — loading and empty states', () => {
  it('renders skeleton placeholder rows while loading', () => {
    renderTable({ loading: true });
    // No data rows are rendered while loading.
    expect(screen.queryByText('DOC-001')).not.toBeInTheDocument();
    // Skeleton rows expose the stubbed money/badge cells of real rows for none of them.
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5); // SKELETON_ROWS
  });

  it('renders the empty-state message when there are no movements', () => {
    renderTable({ movements: [], loading: false });
    expect(screen.getByText('financeAccountMovementsEmpty')).toBeInTheDocument();
    expect(screen.getByText('financeAccountMovementsEmptyHint')).toBeInTheDocument();
  });
});

describe('MovementsTable — highlightTxnId deep-link', () => {
  beforeEach(() => {
    // jsdom does not implement scrollIntoView — provide a no-op by default.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('auto-expands the highlighted row when dimensions are enabled', () => {
    renderTable({
      enabledDimensions: ['project'],
      movements: [
        baseMovement({ id: 'm1' }),
        baseMovement({ id: 'm2', dimensions: { project: 'P' } }),
      ],
      highlightTxnId: 'm2',
    });
    // The useEffect sets expandedId to the highlighted row id.
    expect(screen.getByTestId('movement-moreinfo-m2')).toBeInTheDocument();
    expect(screen.queryByTestId('movement-moreinfo-m1')).not.toBeInTheDocument();
  });

  it('marks the highlighted row but does not auto-expand without dimensions', () => {
    renderTable({
      enabledDimensions: [],
      movements: [baseMovement({ id: 'm1' })],
      highlightTxnId: 'm1',
    });
    const row = screen.getByTestId('movement-row-m1');
    expect(row.className).toContain('bg-[hsl(var(--muted))]');
    expect(screen.queryByTestId('movement-moreinfo-m1')).not.toBeInTheDocument();
  });

  it('scrolls the highlighted row into view', () => {
    const scrollSpy = vi.fn();
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView = scrollSpy;
    renderTable({
      enabledDimensions: ['project'],
      movements: [baseMovement({ id: 'm1' })],
      highlightTxnId: 'm1',
    });
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('does nothing when highlightTxnId is null', () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    renderTable({
      enabledDimensions: ['project'],
      movements: [baseMovement({ id: 'm1' })],
      highlightTxnId: null,
    });
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('movement-moreinfo-m1')).not.toBeInTheDocument();
  });
});

describe('MovementsTable — column sorting (ETP-4921)', () => {
  const ROWS = [
    baseMovement({ id: 'm1', documentNo: 'DOC-003', amount: 300, balance: 900 }),
    baseMovement({ id: 'm2', documentNo: 'DOC-001', amount: 100, balance: 700 }),
    baseMovement({ id: 'm3', documentNo: 'DOC-002', amount: -50, balance: 800 }),
  ];
  const rowIds = () => [...document.querySelectorAll('[data-testid^="movement-row-"]')]
    .map((el) => el.getAttribute('data-testid').replace('movement-row-', ''));

  // Client-side, because the movements endpoint is a bespoke Java handler that takes no sort
  // parameter and returns the whole unpaged list — see lib/clientSort.js.
  it('sorts by a contract column, ascending then descending', () => {
    renderTable({ movements: ROWS });
    expect(rowIds()).toEqual(['m1', 'm2', 'm3']);

    fireEvent.click(screen.getByTestId('column-header-sort-documentNo'));
    expect(rowIds()).toEqual(['m2', 'm3', 'm1']);

    fireEvent.click(screen.getByTestId('column-header-sort-documentNo'));
    expect(rowIds()).toEqual(['m1', 'm3', 'm2']);
  });

  it('restores the backend order on the third click', () => {
    renderTable({ movements: ROWS });

    const header = screen.getByTestId('column-header-sort-documentNo');
    fireEvent.click(header);
    fireEvent.click(header);
    fireEvent.click(header);

    expect(rowIds()).toEqual(['m1', 'm2', 'm3']);
  });

  it('sorts Amount numerically, so a negative outflow leads', () => {
    renderTable({ movements: ROWS });

    fireEvent.click(screen.getByTestId('column-header-sort-amount'));
    expect(rowIds()).toEqual(['m3', 'm2', 'm1']);
  });

  // Balance is a RUNNING balance, anchored to the account's current balance and computed as
  // `currentbalance − SUM(subsequent)` over `statementdate ASC, line ASC`. It is order-dependent
  // by construction, so offering to reorder by it would produce a meaningless column.
  it('offers no sort control on the running-balance column', () => {
    renderTable({ movements: ROWS });

    expect(screen.queryByTestId('column-header-sort-balance')).not.toBeInTheDocument();
    // ...while the header text itself is still there.
    expect(screen.getByText('financeAccountMovementsColBalance')).toBeInTheDocument();
  });

  it('marks only the active column with a direction arrow', () => {
    renderTable({ movements: ROWS });

    const header = screen.getByTestId('column-header-sort-documentNo');
    expect(header.textContent).not.toContain('\u25B2');

    fireEvent.click(header);
    expect(screen.getByTestId('column-header-sort-documentNo').textContent).toContain('\u25B2');
    expect(screen.getByTestId('column-header-sort-amount').textContent).not.toContain('\u25B2');

    fireEvent.click(screen.getByTestId('column-header-sort-documentNo'));
    expect(screen.getByTestId('column-header-sort-documentNo').textContent).toContain('\u25BC');
  });
});

describe('MovementsTable — Tipo header segments (ETP-4921)', () => {
  const rowIds = () => [...document.querySelectorAll('[data-testid^="movement-row-"]')]
    .map((el) => el.getAttribute('data-testid').replace('movement-row-', ''));

  // The Tipo cell stacks the transaction type over the posting status, so a single header could
  // only ever sort by one of them — the hand-rolled equivalent of the Cuentas list's multiField
  // "Tipo & IBAN".
  it('renders one sortable segment for the type and one for the posting status', () => {
    renderTable({ movements: [baseMovement()] });

    expect(screen.getByTestId('column-header-sort-transactionType')).toBeInTheDocument();
    expect(screen.getByTestId('column-header-sort-posted')).toBeInTheDocument();
  });

  it('sorts by the posting status independently of the type', () => {
    renderTable({
      movements: [
        baseMovement({ id: 'm1', trxType: 'BPD', posted: 'Y' }),
        baseMovement({ id: 'm2', trxType: 'BPD', posted: 'N' }),
        baseMovement({ id: 'm3', trxType: 'BPW', posted: 'Y' }),
      ],
    });

    fireEvent.click(screen.getByTestId('column-header-sort-posted'));
    // Keys echo as labels, so 'financeAccountMovementsNotPosted' < 'financeAccountMovementsPosted'.
    expect(rowIds()).toEqual(['m2', 'm1', 'm3']);

    fireEvent.click(screen.getByTestId('column-header-sort-posted'));
    expect(rowIds()).toEqual(['m1', 'm3', 'm2']);
  });

  it('arrows only the segment that is active', () => {
    renderTable({ movements: [baseMovement()] });

    fireEvent.click(screen.getByTestId('column-header-sort-posted'));

    expect(screen.getByTestId('column-header-sort-posted').textContent).toContain('\u25B2');
    expect(screen.getByTestId('column-header-sort-transactionType').textContent)
      .not.toContain('\u25B2');
  });
});

// ── ETP-5030 — selected-row shading ───────────────────────────────────────────
// GROUP A (Tailwind utility on the row element). MovementsTable resolves the
// row class through `computeMovementRowClassName`, which is module-private, so
// every assertion below goes through the rendered <tr>'s real class list.
//
// The row is a `TableRow`, whose own base class is `hover:bg-muted/50` and which
// merges through `cn` (tailwind-merge). That merge is load-bearing: without the
// `hover:bg-primary/5` half of the fix the base hover survives and repaints over
// the tint at exactly the moment the pointer is on the row — i.e. while the user
// is clicking the checkbox. That is the reported bug, so the hover assertions
// here are the ones that actually lock it.
describe('MovementsTable — ETP-5030 selected-row shading', () => {
  // The file-level `Harness` holds `selectedIds` as a fixed prop; these tests
  // need the real tick → re-render loop, so selection lives in state here.
  function SelectableMovements({ movements, highlightTxnId = null, enabledDimensions = [] }) {
    const [selectedIds, setSelectedIds] = React.useState(() => new Set());
    const toggle = (id) => setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    return (
      <MovementsTable
        movements={movements}
        loading={false}
        enabledDimensions={enabledDimensions}
        selectedIds={selectedIds}
        onSelectionChange={toggle}
        highlightTxnId={highlightTxnId}
        sortKey={null}
        sortDirection="asc"
        onSort={() => {}}
      />
    );
  }

  const TWO_ROWS = [
    baseMovement({ id: 'm1', documentNo: 'DOC-001' }),
    baseMovement({ id: 'm2', documentNo: 'DOC-002' }),
  ];

  /** Row checkboxes in DOM order; index 0 is the header select-all. */
  const rowCheckbox = (index) => screen.getAllByRole('checkbox')[index + 1];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('tints ONLY the ticked row and leaves the others on the default background', () => {
    render(<SelectableMovements movements={TWO_ROWS} />);

    fireEvent.click(rowCheckbox(0));

    const row1 = screen.getByTestId('movement-row-m1');
    const row2 = screen.getByTestId('movement-row-m2');
    expect(backgroundUtilities(row1)).toEqual(['bg-primary/5']);
    // Negative half: the untouched row must NOT have picked up the tint, and it
    // must still carry its own default background (so this cannot pass just
    // because the class list came back empty).
    expect(backgroundUtilities(row2)).toEqual(['bg-card']);
  });

  it('removes the tint when the row is unticked', () => {
    render(<SelectableMovements movements={TWO_ROWS} />);

    fireEvent.click(rowCheckbox(0));
    expect(backgroundUtilities(screen.getByTestId('movement-row-m1'))).toEqual(['bg-primary/5']);

    fireEvent.click(rowCheckbox(0));
    expect(backgroundUtilities(screen.getByTestId('movement-row-m1'))).toEqual(['bg-card']);
  });

  it('keeps the tint under the pointer: the selected row carries hover:bg-primary/5 and no competing hover background', () => {
    render(<SelectableMovements movements={TWO_ROWS} />);

    fireEvent.click(rowCheckbox(0));

    const row1 = screen.getByTestId('movement-row-m1');
    // Exactly one hover background, and it is the tint — not `hover:bg-card`
    // (the old hardcoded value) and not TableRow's own `hover:bg-muted/50`,
    // which tailwind-merge must have dropped.
    expect(hoverBackgroundUtilities(row1)).toEqual(['hover:bg-primary/5']);
    expect(row1.className).not.toContain('hover:bg-muted/50');
    expect(row1.className).not.toContain('hover:bg-card');
    // The unselected sibling keeps the original hover background.
    expect(hoverBackgroundUtilities(screen.getByTestId('movement-row-m2'))).toEqual(['hover:bg-card']);
  });

  it('collision — selected + deep-link highlighted: selection wins the background, the highlight keeps its ring, and exactly one background is emitted', () => {
    render(<SelectableMovements movements={TWO_ROWS} highlightTxnId="m1" />);

    const beforeTick = screen.getByTestId('movement-row-m1');
    // Sanity: highlighted-but-unselected still uses the highlight background,
    // so the assertion after the tick is a real change of state.
    expect(backgroundUtilities(beforeTick)).toEqual(['bg-[hsl(var(--muted))]']);

    fireEvent.click(rowCheckbox(0));

    const row1 = screen.getByTestId('movement-row-m1');
    // The trap this whole ticket is about: two background utilities on one
    // element do NOT let the last one win (Tailwind resolves them by stylesheet
    // order), so the row could carry `bg-primary/5` and still render grey.
    expect(countBackgroundUtilities(row1)).toBe(1);
    expect(backgroundUtilities(row1)).toEqual(['bg-primary/5']);
    expect(hoverBackgroundUtilities(row1)).toEqual(['hover:bg-primary/5']);
    // The highlight cue survives as a ring (box-shadow, no layout cost).
    expect(row1.className).toContain('ring-1');
    expect(row1.className).toContain('ring-focus-ring');
  });
});
