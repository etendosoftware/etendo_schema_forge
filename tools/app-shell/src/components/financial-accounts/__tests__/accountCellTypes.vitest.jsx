/**
 * accountCellTypes — the Cuentas list's cellType → renderer registry.
 *
 * ETP-4658 made the Cuentas columns declarative: `artifacts/financial-account/decisions.json`
 * names a `cellType` per grid field and this window-scoped registry resolves it to a cell
 * body. Two properties are load-bearing and covered here:
 *
 *  - `resolveCellType` is a plain `col.cellType` read. It used to nullish-coalesce onto a
 *    VIRTUAL_FIELD_CELL_TYPES map, because while "Por conciliar" was a virtual field
 *    `appendVirtualFields` (resolve-curated.js) copied a closed whitelist that excluded
 *    `cellType`. It is the `EM_ETGO_Pending_Count` stored computed column now and declares
 *    its own, so that fallback is gone and must not come back — a name-keyed map would
 *    silently outrank a declared cellType;
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

import * as registry from '../accountCellTypes.jsx';
import { ACCOUNT_CELL_TYPES, resolveCellType } from '../accountCellTypes.jsx';

const ACCOUNT = {
  id: 'acc-1',
  name: 'BBVA Principal',
  type: 'B',
  currentBalance: 1234.56,
  currencyIso: 'EUR',
  // ES on purpose: the accountName cell's connect affordance is Spain-only since ETP-4896
  // (see saltEdgeEligibility.js), so a fixture without it would hide the button.
  countryIso: 'ES',
  countryName: 'Spain',
  iban: 'ES1212340000000000000001',
  // The key the W spec's generic CRUD serves for EM_ETGO_Pending_Count. The pill's own
  // prop is still called `pendingCount`; the registry is what bridges the two.
  eTGOPendingCount: 3,
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
      'accountBalance', 'accountCountry', 'accountName', 'accountType', 'reconcilePill',
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

describe('ACCOUNT_CELL_TYPES — accountCountry', () => {
  it('renders the country name', () => {
    renderCell('accountCountry', { ...ACCOUNT, countryName: 'Spain', countryIso: 'ES' });

    expect(screen.getByTestId('cell')).toHaveTextContent('Spain');
  });

  it('falls back to the ISO code when countryName is absent', () => {
    renderCell('accountCountry', { ...ACCOUNT, countryName: '', countryIso: 'ES' });

    expect(screen.getByTestId('cell')).toHaveTextContent('ES');
  });

  it('renders an em dash for an account with no country (pre-ETP-4896 data)', () => {
    renderCell('accountCountry', { ...ACCOUNT, countryName: '', countryIso: '' });

    expect(screen.getByTestId('cell')).toHaveTextContent('—');
  });

  it('needs no context — the country cell reads everything off the row', () => {
    expect(() => renderCell('accountCountry', ACCOUNT, {})).not.toThrow();
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
    renderCell('reconcilePill', { ...ACCOUNT, eTGOPendingCount: 0 }, { onReconcile: vi.fn() });

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

  it('reads the pending column cellType off the contract like any other', () => {
    expect(resolveCellType({ name: 'eTGOPendingCount', cellType: 'reconcilePill' }))
      .toBe('reconcilePill');
  });

  // Regression guard for the retired fallback: no field name may imply a renderer, or a
  // future decisions.json change to `cellType` would be silently ignored.
  it('infers nothing from the field name', () => {
    expect(resolveCellType({ name: 'eTGOPendingCount' })).toBeUndefined();
    expect(resolveCellType({ name: 'pendingCount' })).toBeUndefined();
    // The resolver forwards the declared value verbatim, so an explicit null stays null
    // rather than becoming undefined. What matters is that neither binds a renderer.
    expect(resolveCellType({ name: 'eTGOPendingCount', cellType: null })).toBeNull();
    expect(ACCOUNT_CELL_TYPES[resolveCellType({ name: 'eTGOPendingCount' })]).toBeUndefined();
    expect(ACCOUNT_CELL_TYPES[resolveCellType({ name: 'eTGOPendingCount', cellType: null })])
      .toBeUndefined();
  });

  it('binds no renderer for a column with no declared cellType', () => {
    expect(resolveCellType({ name: 'description' })).toBeUndefined();
    expect(resolveCellType({ name: 'description', cellType: null })).toBeNull();
    expect(ACCOUNT_CELL_TYPES[resolveCellType({ name: 'description' })]).toBeUndefined();
    expect(ACCOUNT_CELL_TYPES[resolveCellType({ name: 'description', cellType: null })])
      .toBeUndefined();
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

describe('module surface', () => {
  // The account entity has no virtual fields left, so nothing needs a name-keyed cellType
  // map. Asserted on the module surface so reintroducing the export fails here.
  it('no longer exports a virtual-field cellType map', () => {
    expect(registry.VIRTUAL_FIELD_CELL_TYPES).toBeUndefined();
  });

  it('every exposed cellType resolves to a renderer function', () => {
    for (const [cellType, renderer] of Object.entries(ACCOUNT_CELL_TYPES)) {
      expect(renderer, `${cellType} has no renderer`).toBeTypeOf('function');
    }
  });
});
