import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('PurchaseOrderWindow — legacy pendingDelivery filter removed (ETP-4004)', () => {
  it('does not import buildPendingDeliveryFilter', () => {
    assert.doesNotMatch(src, /buildPendingDeliveryFilter/,
      'buildPendingDeliveryFilter must be removed — ' +
      'the dashboard now navigates to goods-receipt for pending receptions, not purchase-order');
  });

  it('does not reference the pendingDelivery filter string for receptions', () => {
    // The pendingDelivery filter is still used by sales-order (addPendingSalesDeliveries).
    // Purchase-order must not apply it as an initialColumnFilter for receptions.
    assert.doesNotMatch(src, /initialColumnFilters.*pendingDelivery/s,
      'purchase-order must not pass pendingDelivery as initialColumnFilters');
  });

  it('exports a default function component named PurchaseOrderWindow', () => {
    assert.match(src, /export default function PurchaseOrderWindow/,
      'must export PurchaseOrderWindow as the default export');
  });

  it('still imports GeneratedApp from the purchase-order generated index', () => {
    assert.match(src, /import GeneratedApp from.*purchase-order.*index\.jsx/,
      'must still import GeneratedApp from the generated purchase-order window');
  });

  // ETP-4520 — the hand-rolled ListView bypasses GeneratedApp, so it must
  // separately receive the runtime per-tier read-only override.
  it('passes the runtime read-only effectiveWindow through to ListView', () => {
    assert.match(src, /windowAccessTier === 'read-only'/);
    assert.match(src, /window=\{effectiveWindow\}/);
  });
});
