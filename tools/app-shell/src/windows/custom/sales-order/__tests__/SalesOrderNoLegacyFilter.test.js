import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('SalesOrderWindow — pending delivery filter (ETP-5487, supersedes ETP-4004)', () => {
  it('does not import buildPendingDeliveryFilter', () => {
    assert.doesNotMatch(src, /buildPendingDeliveryFilter/,
      'buildPendingDeliveryFilter must not be reintroduced without updating this guard — ' +
      'sales-order currently composes the ?filter=pendingDelivery advanced filter inline (ETP-5487)');
  });

  it('reads the pendingDelivery filter param from the URL', () => {
    assert.match(src, /isPendingDelivery\s*=\s*searchParams\.get\('filter'\)\s*===\s*'pendingDelivery'/,
      'sales-order must read ?filter=pendingDelivery — the Dashboard "Envios" card ' +
      'navigates here with that param (ETP-5487, replacing the old goods-shipment ' +
      '?DocStatus=DR link that ETP-4004 originally removed)');
  });

  it('builds the pendingDelivery advanced filter for completed orders with delivery < 100', () => {
    assert.match(src, /field:\s*'documentStatus',\s*operator:\s*'equals',\s*value:\s*'CO'/,
      'the pendingDelivery filter must scope to completed (CO) orders');
    assert.match(src, /field:\s*'deliveryStatus',\s*operator:\s*'lessThan',\s*value:\s*100/,
      'the pendingDelivery filter must scope to deliveryStatus < 100');
  });

  it('passes initialFiltersFromUrl so the URL filter outranks saved grid state', () => {
    assert.match(src, /initialFiltersFromUrl=\{isPendingDelivery\}/);
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
