/**
 * AccountRowActions — structural contract (source-reading).
 *
 * Behaviour is covered by `AccountRowActions.vitest.jsx`; this file locks the structural
 * invariants that motivated the ETP-4658 extraction out of `AccountsTable/AccountRow.jsx`:
 * one definition of the per-row testids, one sync-visibility rule, and no <TableCell> of
 * its own (the two hosts — the legacy AccountsTable and the generic DataTable — each supply
 * their own cell wrapper).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'AccountRowActions.jsx'), 'utf8');

describe('AccountRowActions — module shape', () => {
  it('exports the component as a named export', () => {
    assert.match(src, /export function AccountRowActions\(\{/);
  });

  it('accepts the full handler set both hosts pass through', () => {
    for (const prop of ['account', 'onOpen', 'onEdit', 'onArchive', 'onPsd2Action', 'onTransfer', 'onNewMovement']) {
      assert.match(src, new RegExp(`\\b${prop},`));
    }
  });

  it('delegates the kebab to the shared AccountRowMenu', () => {
    assert.match(src, /import \{ AccountRowMenu \} from '\.\/AccountRowMenu\.jsx'/);
    assert.match(src, /<AccountRowMenu/);
  });
});

describe('AccountRowActions — E2E testid contract', () => {
  it('keeps the per-row edit testid', () => {
    assert.match(src, /data-testid=\{`account-row-edit-\$\{account\.id\}`\}/);
  });

  it('keeps the per-row sync testid', () => {
    assert.match(src, /data-testid=\{`account-row-refresh-\$\{account\.id\}`\}/);
  });

  it('labels both icon-only buttons through i18n (no hardcoded strings)', () => {
    assert.match(src, /aria-label=\{ui\('financeAccountsMenuEdit'\)\}/);
    assert.match(src, /aria-label=\{ui\('financeAccountsMenuSyncNow'\)\}/);
    assert.match(src, /import \{ useUI \} from '@\/i18n'/);
  });
});

describe('AccountRowActions — host-agnostic markup', () => {
  it('gates the sync button on an explicit psd2Connected === true', () => {
    assert.match(src, /account\.psd2Connected === true \?/);
  });

  it('does not wrap itself in a TableCell — each host supplies its own', () => {
    assert.doesNotMatch(src, /<TableCell/);
    assert.doesNotMatch(src, /from '@\/components\/ui\/table'/);
  });
});
