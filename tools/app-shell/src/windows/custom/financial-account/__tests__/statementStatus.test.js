/**
 * isDraftStatement — the single predicate the delete/edit/process gates on an imported
 * statement all key off (row hover actions, the kebab's Procesar/Reactivar, and the bulk-delete
 * bar's disabled state). Pure JS, so node:test runs it directly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDraftStatement } from '../statementStatus.js';

describe('isDraftStatement', () => {
  it('is a draft when status is DRAFT', () => {
    assert.equal(isDraftStatement({ status: 'DRAFT', processed: 'N' }), true);
  });

  // The backend's actual guard is the `processed` flag (BankStatementsHandler.requireDraft),
  // not the derived status label — a row whose status field lagged behind must still be
  // treated as a draft if the DB flag says so.
  it('is a draft when processed is N even if status disagrees', () => {
    assert.equal(isDraftStatement({ status: 'PENDING', processed: 'N' }), true);
  });

  it('is NOT a draft once processed, regardless of reconciliation status', () => {
    assert.equal(isDraftStatement({ status: 'PENDING', processed: 'Y' }), false);
    assert.equal(isDraftStatement({ status: 'PARTIAL', processed: 'Y' }), false);
    assert.equal(isDraftStatement({ status: 'RECONCILED', processed: 'Y' }), false);
  });

  it('treats a missing processed field as not-draft when status says so', () => {
    assert.equal(isDraftStatement({ status: 'RECONCILED' }), false);
  });
});
