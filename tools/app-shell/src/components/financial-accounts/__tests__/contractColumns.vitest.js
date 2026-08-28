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

  // `eTGOPendingCount` ("Por conciliar") is the EM_ETGO_Pending_Count stored computed
  // column. It used to be an `entities.account.virtualFields[]` entry the NeoHandler
  // injected in afterHandle; either way it reaches the contract like any other grid
  // field, which is what lets AccountsHeaderTable stop hand-appending it as a literal.
  it('returns the account (Cuentas list) grid columns in order', () => {
    const cols = getContractGridColumns('account').map((c) => c.name);
    // ETP-4896 follow-up: Country inserted right after Type (gridOrder 3).
    expect(cols).toEqual(['name', 'type', 'country', 'currentBalance', 'eTGOPendingCount']);
  });

  it('places the pending column last, per its declared gridOrder', () => {
    const cols = getContractGridColumns('account');
    expect(cols.at(-1).name).toBe('eTGOPendingCount');
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

  // The inverse of the assertion this replaced. While "Por conciliar" was a virtual field,
  // `appendVirtualFields` (resolve-curated.js) copied a closed whitelist that excluded
  // `cellType` and `gridLabelKey`, so both had to be routed around it — the
  // VIRTUAL_FIELD_CELL_TYPES map and `window.labelOverrides` respectively. As a real
  // AD-backed field it declares both, and the mapper must forward them.
  it('forwards the pending column cellType and gridLabelKey like any real field', () => {
    const pending = getContractGridColumns('account').find((c) => c.name === 'eTGOPendingCount');

    expect(pending.column).toBe('EM_ETGO_Pending_Count');
    expect(pending.cellType).toBe('reconcilePill');
    expect(pending.gridLabelKey).toBe('financeAccountsColPending');
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
