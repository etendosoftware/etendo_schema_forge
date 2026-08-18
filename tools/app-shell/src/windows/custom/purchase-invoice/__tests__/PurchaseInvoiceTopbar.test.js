import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PurchaseInvoiceTopbar.jsx'), 'utf8');

describe('PurchaseInvoiceTopbar', () => {
  it('opens InvoicePaymentHistoryModal without passing a token prop', () => {
    const modalBlock = src.match(/<InvoicePaymentHistoryModal[\s\S]*?\/>/);
    assert.ok(modalBlock, 'expected InvoicePaymentHistoryModal to be rendered');
    assert.doesNotMatch(modalBlock[0], /token=\{token\}/);
  });

  it('calls onRefresh (not window.location.reload) for invoice-updated and modal close', () => {
    assert.match(src, /onRefresh\?\.\(\)/, 'expected onRefresh?.() call');
    assert.doesNotMatch(src, /window\.location\.reload\(\)/, 'expected no window.location.reload()');
  });
});

// ── ETP-4841: payment state follows the SIGN of the total ────────────────────
// The topbar used to select its credit branch with
// `getApSubtype(data) === 'RECTIFICATIVA'`, which mislabelled a POSITIVE Factura
// Rectificativa as "Saldo a favor" and a NEGATIVE ordinary Factura as "Pagada".

describe('PurchaseInvoiceTopbar — sign-driven payment badge (ETP-4841)', () => {
  it('imports the shared resolveInvoicePaymentBadge helper', () => {
    assert.match(
      src,
      /import \{ resolveInvoicePaymentBadge \} from '@\/windows\/custom\/shared\/invoicePaymentBadge\.js'/,
    );
  });

  it('no longer imports or calls getApSubtype', () => {
    assert.doesNotMatch(
      src,
      /getApSubtype/,
      'the document type must not decide the payment badge any more (ETP-4841)',
    );
    assert.doesNotMatch(src, /isCreditType/);
  });

  it('resolves the badge once and branches on badge.isCredit / badge.kind', () => {
    assert.match(src, /const badge = resolveInvoicePaymentBadge\(data\)/);
    assert.match(src, /if \(badge\.isCredit\)/);
    assert.match(src, /badge\.kind === 'credit-applied'/);
  });

  it('never lets paymentComplete turn a credit into the paid badge', () => {
    assert.match(
      src,
      /const isFullyPaid = !badge\.isCredit[\s\S]{0,200}?paymentComplete/,
      'isFullyPaid must be gated on !badge.isCredit so a credit never renders as paid',
    );
  });

  it('renders the outstanding figure from badge.amount (always non-negative)', () => {
    assert.match(src, /formatCurrency\(currency \|\| 'USD', badge\.amount\)/);
    assert.doesNotMatch(
      src,
      /Math\.abs\(parseFloat\(outstanding\)/,
      'the absolute value is computed inside resolveInvoicePaymentBadge, not here',
    );
  });

  it('renders the credit labels through i18n, not hardcoded Spanish literals', () => {
    assert.match(src, /ui\('cpFavorBadge'\)/);
    assert.match(src, /ui\('cpCreditFullyApplied'\)/);
    // Strip `//` comments: the source still *describes* the badge as
    // "Saldo a favor" in prose, which must not fail this assertion.
    const code = src.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /Saldo a favor/);
    assert.doesNotMatch(code, />Aplicada/);
  });
});
