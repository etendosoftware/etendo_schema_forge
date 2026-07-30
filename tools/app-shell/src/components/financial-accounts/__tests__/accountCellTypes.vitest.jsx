/**
 * accountCellTypes — the Cuentas list's cellType → renderer registry.
 *
 * ETP-4658 made the Cuentas columns declarative: `artifacts/financial-account/decisions.json`
 * names a `cellType` per grid field and this window-scoped registry resolves it to a cell
 * body. Two properties are load-bearing and covered here:
 *
 *  - `resolveCellType` must fall back to VIRTUAL_FIELD_CELL_TYPES for `pendingCount`,
 *    because `appendVirtualFields` (resolve-curated.js) copies a closed 10-key whitelist
 *    that does not include `cellType` — a virtual field can never declare one;
 *  - an unknown cellType must resolve to `undefined`, so AccountsHeaderTable leaves the
 *    column without a `render` and DataTable falls back to its generic type renderer.
 *    Degradation, never a crash.
 */
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => {
    if (key === 'financeAccountsReconcilePending') return `Conciliar (${params.count})`;
    return key;
  },
}));

import {
  ACCOUNT_CELL_TYPES,
  VIRTUAL_FIELD_CELL_TYPES,
  resolveCellType,
} from '../accountCellTypes.jsx';

const ACCOUNT = {
  id: 'acc-1',
  name: 'BBVA Principal',
  type: 'B',
  currentBalance: 1234.56,
  currencyIso: 'EUR',
  iban: 'ES1212340000000000000001',
  pendingCount: 3,
  bankConnected: true,
};

function renderCell(cellType, row = ACCOUNT, ctx = {}) {
  const renderer = ACCOUNT_CELL_TYPES[cellType];
  const fullCtx = { ui: (key) => key, ...ctx };
  return render(<div data-testid="cell">{renderer(row, fullCtx)}</div>);
}

// The renderers take `ui` from the cell context, not from a hook — AccountsHeaderTable
// builds that context once per column set. Only ReconcilePill calls useUI itself.
const UI = (key, params = {}) => {
  if (key === 'financeAccountsReconcilePending') return `Conciliar (${params.count})`;
  return key;
};

describe('ACCOUNT_CELL_TYPES — registry shape', () => {
  it('exposes exactly the cellTypes the Cuentas list can bind', () => {
    expect(Object.keys(ACCOUNT_CELL_TYPES).sort()).toEqual([
      'accountBalance', 'accountName', 'accountType', 'reconcilePill',
    ]);
  });

  it('maps every cellType to a renderer function', () => {
    for (const [cellType, renderer] of Object.entries(ACCOUNT_CELL_TYPES)) {
      expect(typeof renderer, `${cellType} must be a renderer`).toBe('function');
    }
  });
});

describe('ACCOUNT_CELL_TYPES — accountName', () => {
  it('renders the NameCell with the account name', () => {
    renderCell('accountName', ACCOUNT, { ui: UI });

    expect(screen.getByTestId('cell')).toHaveTextContent('BBVA Principal');
  });

  it('renders the offline badge for a bank account that is not bank-connected', () => {
    renderCell('accountName', { ...ACCOUNT, bankConnected: false }, { ui: UI });

    expect(screen.getByTestId('cell')).toHaveTextContent('financeAccountsBadgeOffline');
  });

  it('wires the connect affordance to the context onConnect', () => {
    const onConnect = vi.fn();
    renderCell('accountName', { ...ACCOUNT, bankConnected: false }, { ui: UI, onConnect });

    fireEvent.click(screen.getByTestId('account-sync-connect-acc-1'));

    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }));
  });
});

describe('ACCOUNT_CELL_TYPES — accountType', () => {
  it('renders the translated type label and the chunked IBAN', () => {
    renderCell('accountType', ACCOUNT, { ui: UI });

    const cell = screen.getByTestId('cell');
    expect(cell).toHaveTextContent('financeAccountsTypeBank');
    expect(cell).toHaveTextContent('ES12 1234 0000 0000 0000 0001');
  });

  it('renders the masked PAN for a card account with no IBAN', () => {
    renderCell(
      'accountType',
      { ...ACCOUNT, type: 'CA', iban: '', maskedPan: '**** 4321' },
      { ui: UI },
    );

    expect(screen.getByTestId('account-row-card-number-acc-1')).toHaveTextContent('**** 4321');
  });
});

describe('ACCOUNT_CELL_TYPES — accountBalance', () => {
  it('renders the currency-formatted balance', () => {
    renderCell('accountBalance');

    expect(screen.getByTestId('cell')).toHaveTextContent('1.234,56');
  });

  it('renders a negative balance in the destructive treatment', () => {
    renderCell('accountBalance', { ...ACCOUNT, currentBalance: -42.5 });

    const amount = screen.getByTestId('cell').firstChild;
    expect(amount.className).toMatch(/text-\[hsl\(var\(--destructive\)\)\]/);
  });

  it('needs no context — the balance cell reads everything off the row', () => {
    expect(() => renderCell('accountBalance', ACCOUNT, {})).not.toThrow();
  });
});

describe('ACCOUNT_CELL_TYPES — reconcilePill', () => {
  it('renders the pending pill with the count', () => {
    renderCell('reconcilePill', ACCOUNT, { onReconcile: vi.fn() });

    expect(screen.getByTestId('reconcile-status-pending')).toHaveTextContent('Conciliar (3)');
  });

  it('renders the reconciled badge when nothing is pending', () => {
    renderCell('reconcilePill', { ...ACCOUNT, pendingCount: 0 }, { onReconcile: vi.fn() });

    expect(screen.getByTestId('reconcile-status-reconciled')).toBeInTheDocument();
  });

  it('calls onReconcile with the row when the pill is clicked', () => {
    const onReconcile = vi.fn();
    renderCell('reconcilePill', ACCOUNT, { onReconcile });

    fireEvent.click(screen.getByTestId('reconcile-status-pending'));

    expect(onReconcile).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }));
  });

  // The whole row navigates to the detail, so the pill has to swallow its own click.
  it('stops the click from bubbling to the row', () => {
    const onRowClick = vi.fn();
    const renderer = ACCOUNT_CELL_TYPES.reconcilePill;
    render(
      <div data-testid="row" role="presentation" onClick={onRowClick}>
        {renderer(ACCOUNT, { ui: UI, onReconcile: vi.fn() })}
      </div>,
    );

    fireEvent.click(screen.getByTestId('reconcile-status-pending'));

    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('resolveCellType', () => {
  it('prefers the cellType the contract field declares', () => {
    expect(resolveCellType({ name: 'name', cellType: 'accountName' })).toBe('accountName');
    expect(resolveCellType({ name: 'type', cellType: 'accountType' })).toBe('accountType');
    expect(resolveCellType({ name: 'currentBalance', cellType: 'accountBalance' }))
      .toBe('accountBalance');
  });

  it('falls back to the virtual-field map for pendingCount', () => {
    expect(resolveCellType({ name: 'pendingCount' })).toBe('reconcilePill');
    // The contract emits `cellType: null` (not undefined) for a virtual field, so the
    // fallback has to be nullish-coalescing rather than a plain `||`-free lookup.
    expect(resolveCellType({ name: 'pendingCount', cellType: null })).toBe('reconcilePill');
  });

  it('lets a declared cellType win over the virtual-field fallback', () => {
    expect(resolveCellType({ name: 'pendingCount', cellType: 'accountBalance' }))
      .toBe('accountBalance');
  });

  it('returns undefined for a column with neither a declared nor an inferred cellType', () => {
    expect(resolveCellType({ name: 'description' })).toBeUndefined();
    expect(resolveCellType({ name: 'description', cellType: null })).toBeUndefined();
  });

  // The graceful-degradation path: AccountsHeaderTable does
  // `ACCOUNT_CELL_TYPES[resolveCellType(col)]`, so an unknown cellType must leave the
  // column without a `render` instead of throwing.
  it('resolves an unknown cellType to no renderer at all', () => {
    expect(ACCOUNT_CELL_TYPES[resolveCellType({ name: 'description' })]).toBeUndefined();
    expect(ACCOUNT_CELL_TYPES[resolveCellType({ name: 'x', cellType: 'notARenderer' })])
      .toBeUndefined();
  });
});

describe('VIRTUAL_FIELD_CELL_TYPES', () => {
  it('covers exactly the virtual fields the account entity declares', () => {
    expect(VIRTUAL_FIELD_CELL_TYPES).toEqual({ pendingCount: 'reconcilePill' });
  });

  it('only maps onto cellTypes the registry can actually render', () => {
    for (const cellType of Object.values(VIRTUAL_FIELD_CELL_TYPES)) {
      expect(ACCOUNT_CELL_TYPES[cellType], `${cellType} has no renderer`).toBeTypeOf('function');
    }
  });
});
