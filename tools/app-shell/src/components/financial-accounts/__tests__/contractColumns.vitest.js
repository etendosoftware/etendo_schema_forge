import { describe, it, expect } from 'vitest';
import { getContractGridColumns } from '../contractColumns.js';

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

  it('returns the account (Cuentas list) grid columns in order', () => {
    const cols = getContractGridColumns('account').map((c) => c.name);
    expect(cols).toEqual(['name', 'type', 'currentBalance']);
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
