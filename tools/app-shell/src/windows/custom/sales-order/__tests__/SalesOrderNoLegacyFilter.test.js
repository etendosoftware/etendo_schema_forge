import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('SalesOrderWindow — legacy pendingDelivery filter removed (ETP-4004)', () => {
  it('does not import buildPendingDeliveryFilter', () => {
    assert.doesNotMatch(src, /buildPendingDeliveryFilter/,
      'buildPendingDeliveryFilter must be removed — ' +
      'the dashboard now navigates to goods-shipment for pending sales deliveries, not sales-order');
  });

  it('does not reference isPendingDelivery', () => {
    assert.doesNotMatch(src, /isPendingDelivery/,
      'isPendingDelivery must be removed — sales-order no longer handles pending-delivery filtering');
  });

  it('does not reference the pendingDelivery filter string as an initialColumnFilter', () => {
    assert.doesNotMatch(src, /initialColumnFilters.*pendingDelivery/s,
      'sales-order must not pass pendingDelivery as initialColumnFilters');
  });

  it('exports a default function component named SalesOrderWindow', () => {
    assert.match(src, /export default function SalesOrderWindow/,
      'must export SalesOrderWindow as the default export');
  });

  it('still imports GeneratedApp from the sales-order generated index', () => {
    assert.match(src, /import GeneratedApp from.*sales-order.*index\.jsx/,
      'must still import GeneratedApp from the generated sales-order window');
  });

  it('still imports ListView from its own contract-ui module', () => {
    assert.match(src, /import \{ ListView \} from ['"]@\/components\/contract-ui\/ListView\.jsx['"]/,
      'must still import ListView — used for the list view when recordId is not present');
  });
});
