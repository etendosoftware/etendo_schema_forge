import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SalesInvoiceTopbar.jsx'), 'utf8');

// Also read the generated HeaderPage to verify the reversedInvoices api spec.
const headerPageSrc = readFileSync(
  join(__dirname, '../../../../../../..', 'artifacts/sales-invoice/generated/web/sales-invoice/HeaderPage.jsx'),
  'utf8',
);

describe('SalesInvoiceTopbar', () => {
  it('delegates invoice-updated handling to useInvoiceUpdatedListener (not window.location.reload)', () => {
    assert.match(src, /useInvoiceUpdatedListener/, 'expected useInvoiceUpdatedListener to be used');
    assert.doesNotMatch(src, /window\.location\.reload\(\)/, 'expected no window.location.reload() in topbar');
  });

  it('delegates topbar actions to InvoiceTopbarExtra component', () => {
    assert.match(
      src,
      /InvoiceTopbarExtra/,
      'expected InvoiceTopbarExtra to be imported and used for delegation',
    );
  });
});

// ETP-4404: the reversedInvoices entity must stay declared in the generated
// api spec (the Rectificaciones custom tab CRUDs against it)
describe('SalesInvoice HeaderPage — ETP-4404 api spec contract', () => {
  it('reversedInvoices entity is declared in the api spec', () => {
    assert.match(
      headerPageSrc,
      /reversedInvoices/,
      'expected reversedInvoices entity to appear in the api spec',
    );
  });
});
