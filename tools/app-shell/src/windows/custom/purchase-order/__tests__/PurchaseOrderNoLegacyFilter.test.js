import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('PurchaseOrderWindow — pending reception filter (ETP-5487, supersedes ETP-4004)', () => {
  it('does not import buildPendingDeliveryFilter', () => {
    assert.doesNotMatch(src, /buildPendingDeliveryFilter/,
      'buildPendingDeliveryFilter must not be reintroduced without updating this guard — ' +
      'purchase-order currently composes the ?filter=pendingReception advanced filter inline (ETP-5487)');
  });

  it('does not reference the pendingDelivery filter string (purchase-order uses pendingReception)', () => {
    // purchase-order's own URL filter is `pendingReception` (see isPendingReception below).
    // `pendingDelivery` is sales-order's filter name (addPendingSalesDeliveries) and must
    // never leak into purchase-order.
    assert.doesNotMatch(src, /initialColumnFilters.*pendingDelivery/s,
      'purchase-order must not pass pendingDelivery as initialColumnFilters');
  });

  it('reads the pendingReception filter param from the URL', () => {
    assert.match(src, /isPendingReception\s*=\s*searchParams\.get\('filter'\)\s*===\s*'pendingReception'/,
      'purchase-order must read ?filter=pendingReception — the Dashboard "Recepciones" card ' +
      'navigates here with that param (ETP-5487, replacing the old goods-receipt ' +
      '?DocStatus=DR link that ETP-4004 originally removed)');
  });

  it('builds the pendingReception advanced filter for completed orders with reception < 100', () => {
    assert.match(src, /field:\s*'documentStatus',\s*operator:\s*'equals',\s*value:\s*'CO'/,
      'the pendingReception filter must scope to completed (CO) orders');
    assert.match(src, /field:\s*'deliveryStatusPurchase',\s*operator:\s*'lessThan',\s*value:\s*100/,
      'the pendingReception filter must scope to deliveryStatusPurchase < 100');
  });

  it('passes initialFiltersFromUrl so the URL filter outranks saved grid state', () => {
    assert.match(src, /initialFiltersFromUrl=\{isPendingReception\}/);
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

  it('does not hardcode hidePrint on ListView (ETP-4728 — print restored)', () => {
    assert.doesNotMatch(src, /hidePrint/,
      'the bulk "Print (N)" grid button must not be hidden via listViewOptions — ' +
      'ETP-4728 restored it for purchase-order, mirroring sales-order (ETP-4729)');
  });
});
