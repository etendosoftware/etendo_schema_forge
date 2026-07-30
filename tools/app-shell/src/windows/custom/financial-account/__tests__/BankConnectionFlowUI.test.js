/**
 * Source-level guard for BankConnectionFlowUI.jsx — the two native surfaces of the
 * bank connect flow: a non-dismissable "connecting" overlay while the Salt Edge
 * popup is open, and the bank-account selection modal shown when the connection
 * returns accounts.
 *
 * The component imports React, lucide-react, the dialog primitives and i18n, so
 * we follow the repo convention (main.toaster.test.js) and assert the source
 * invariants directly without a browser environment.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'BankConnectionFlowUI.jsx'), 'utf8');

describe('BankConnectionFlowUI — exports & deps', () => {
  it('exports the BankConnectionFlowUI component', () => {
    assert.match(src, /export function BankConnectionFlowUI\s*\(\{ flow \}\)/);
  });

  it('uses the i18n useUI hook (no hardcoded user strings)', () => {
    assert.match(src, /useUI\(\)/);
  });

  it('consumes the flow controls produced by useBankConnectionFlow', () => {
    assert.match(src, /const \{ connecting, selection, confirmSelection, cancelSelection \} = flow/);
  });
});

describe('BankConnectionFlowUI — connecting overlay', () => {
  it('opens the overlay while connecting', () => {
    assert.match(src, /<Dialog open=\{connecting\}/);
    assert.match(src, /data-testid=["']bank-connection-connecting-overlay["']/);
  });

  it('is non-dismissable (blocks outside-click and escape)', () => {
    assert.match(src, /onPointerDownOutside=\{\(e\) => e\.preventDefault\(\)\}/);
    assert.match(src, /onEscapeKeyDown=\{\(e\) => e\.preventDefault\(\)\}/);
  });

  it('shows a spinner and the connecting label', () => {
    assert.match(src, /Loader2/);
    assert.match(src, /animate-spin/);
    assert.match(src, /financeAccountsBankConnectionConnecting/);
  });
});

describe('BankConnectionFlowUI — account select modal', () => {
  it('renders the BankConnectionAccountSelectModal wired to the flow callbacks', () => {
    assert.match(src, /<BankConnectionAccountSelectModal/);
    assert.match(src, /selection=\{selection\}/);
    assert.match(src, /onConfirm=\{confirmSelection\}/);
    assert.match(src, /onCancel=\{cancelSelection\}/);
  });

  it('opens the modal only when there is a selection', () => {
    assert.match(src, /const open = !!selection/);
    assert.match(src, /<Dialog\s+open=\{open\}/);
  });

  it('renders the bank logo when a provider logo url is present', () => {
    assert.match(src, /providerLogoUrl \?/);
    assert.match(src, /<img/);
  });

  it('renders a bank-aware title when a provider name is present', () => {
    assert.match(src, /financeAccountsBankConnectionSelectTitleBank/);
    assert.match(src, /\{ bank: providerName \}/);
    assert.match(src, /financeAccountsBankConnectionSelectTitle/);
  });

  it('lists each returned account as a selectable option', () => {
    assert.match(src, /accounts\.map\(\(acc\)/);
    assert.match(src, /data-testid=\{`bank-connection-account-option-\$\{acc\.saltEdgeAccountId\}`\}/);
    assert.match(src, /setSelected\(acc\.saltEdgeAccountId\)/);
  });

  it('provides cancel and confirm controls', () => {
    assert.match(src, /data-testid=["']bank-connection-account-select-cancel["']/);
    assert.match(src, /data-testid=["']bank-connection-account-select-confirm["']/);
    assert.match(src, /financeAccountsBankConnectionSelectConfirm/);
  });

  it('disables confirm until an account is selected', () => {
    assert.match(src, /disabled=\{!selected\}/);
    assert.match(src, /onConfirm\?\.\(selected\)/);
  });
});
