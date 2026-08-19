import { describe, it, expect } from 'vitest';
import { getContractGridColumns, getContractPanelFields } from '../contractColumns.js';

// These assertions run against the REAL window contract
// (artifacts/financial-account/contract.json): they pin the declarative
// source of the Movimientos grid — order and visibility come from
// decisions.json, not from JSX.
describe('getContractGridColumns', () => {
  it('returns the transaction grid columns in declared gridOrder', () => {
    const cols = getContractGridColumns('transaction').map((c) => c.name);
    expect(cols).toEqual([
      'transactionDate',
      'documentNo',
      'businessPartner',
      'description',
      'status',
      'transactionType',
      'gLItem',
    ]);
  });

  it('exposes contract labels as header fallbacks', () => {
    const byName = Object.fromEntries(getContractGridColumns('transaction').map((c) => [c.name, c]));
    expect(byName.documentNo.label).toBe('Payment No.');
  });

  it('returns the importedBankStatements (Extractos) grid columns in order', () => {
    const cols = getContractGridColumns('importedBankStatements').map((c) => c.name);
    expect(cols).toEqual([
      'documentNo',
      'name',
      'fileName',
      'notes',
      'importdate',
      'transactionDate',
    ]);
  });

  it('returns the bankStatementLines grid columns in order', () => {
    const cols = getContractGridColumns('bankStatementLines').map((c) => c.name);
    expect(cols).toEqual([
      'transactionDate',
      'description',
      'bpartnername',
      'businessPartner',
      'gLItem',
      'referenceNo',
      'dramount',
      'cramount',
    ]);
  });

  // `pendingCount` has no AD column behind it — the NeoHandler injects it in
  // afterHandle — so it is declared as an `entities.account.virtualFields[]` entry
  // in decisions.json. It reaches the contract like any other grid field, which is
  // what lets AccountsHeaderTable stop hand-appending it as a column literal.
  it('returns the account (Cuentas list) grid columns in order', () => {
    const cols = getContractGridColumns('account').map((c) => c.name);
    expect(cols).toEqual(['name', 'type', 'currentBalance', 'pendingCount']);
  });

  it('places the virtual pendingCount column last, per its declared gridOrder', () => {
    const cols = getContractGridColumns('account');
    expect(cols.at(-1).name).toBe('pendingCount');
  });

  // Regression guard: the mapper used to forward only { name, label, type }, so
  // `column` was always undefined. That silently killed the AD-dictionary tier of
  // resolveColumnLabel (headers fell through to the raw technical field name) and
  // degraded ListView's ReportDrawer mapping. `gridLabelKey` / `cellType` are what
  // make the header text and the cell renderer declarative.
  it('forwards the declarative header/renderer keys, not just name and label', () => {
    const byName = Object.fromEntries(getContractGridColumns('account').map((c) => [c.name, c]));

    expect(byName.name).toMatchObject({
      column: 'Name',
      gridLabelKey: 'financeAccountsColAccount',
      cellType: 'accountName',
      type: 'string',
    });
    expect(byName.type).toMatchObject({
      column: 'Type',
      gridLabelKey: 'financeAccountsColType',
      cellType: 'accountType',
    });
    expect(byName.currentBalance).toMatchObject({
      column: 'Currentbalance',
      gridLabelKey: 'financeAccountsColBalance',
      cellType: 'accountBalance',
      type: 'amount',
    });
  });

  it('exposes the AD column name for every column that has one', () => {
    for (const col of getContractGridColumns('transaction')) {
      expect(col.column, `${col.name} must carry its AD column`).toBeTruthy();
    }
  });

  // `appendVirtualFields` (resolve-curated.js) copies a closed 10-key whitelist and
  // `cellType` is not in it, so a virtual field cannot declare one — hence the
  // VIRTUAL_FIELD_CELL_TYPES fallback in accountCellTypes.jsx.
  it('leaves a virtual field without a declared cellType or gridLabelKey', () => {
    const pending = getContractGridColumns('account').find((c) => c.name === 'pendingCount');

    expect(pending.column).toBe('pendingCount');
    expect(pending.cellType ?? null).toBeNull();
    expect(pending.gridLabelKey ?? null).toBeNull();
  });

  it('returns an empty list for unknown entities', () => {
    expect(getContractGridColumns('nope')).toEqual([]);
  });

  it('only includes fields that explicitly opt in via gridOrder', () => {
    const cols = getContractGridColumns('transaction').map((c) => c.name);
    // depositAmount/paymentAmount are in the contract (export source) but have
    // no gridOrder — they must not leak into the grid.
    expect(cols).not.toContain('depositAmount');
    expect(cols).not.toContain('paymentAmount');
  });
});

// Pins the "more info" panel of the Movimientos row (ETP-4869): which accounting
// dimensions it shows and in what order come from decisions.json → contract.json
// (fields with `dimensionsPanel: true`, sorted by `seq`), not from a hardcoded
// array in MovementsTable.jsx.
describe('getContractPanelFields', () => {
  // The funds-transfer counterpart link is declared with a lower seq than every accounting
  // dimension precisely so it renders immediately BEFORE them, as the feature requires.
  it('returns the transaction panel fields in declared seq order', () => {
    const fields = getContractPanelFields('transaction').map((f) => f.name);
    expect(fields).toEqual(['eTGOFinaccTransDest', 'project', 'costCenter', 'product']);
  });

  it('only includes fields that explicitly opt in via dimensionsPanel', () => {
    const fields = getContractPanelFields('transaction').map((f) => f.name);
    // organization/activity/salesCampaign/salesRegion/stDimension/ndDimension are
    // accounting dimensions in the contract too, but are not declared for this
    // panel — they must not leak into it.
    expect(fields).not.toContain('organization');
    expect(fields).not.toContain('activity');
    expect(fields).not.toContain('salesCampaign');
  });

  it('exposes contract labels as fallbacks', () => {
    const byName = Object.fromEntries(getContractPanelFields('transaction').map((f) => [f.name, f]));
    expect(byName.costCenter.label).toBe('Cost Center');
  });

  it('returns an empty list for unknown entities', () => {
    expect(getContractPanelFields('nope')).toEqual([]);
  });
});
