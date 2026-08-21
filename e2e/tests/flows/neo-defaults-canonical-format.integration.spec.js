import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * NEO /defaults wire format — live integration (IMP-16 / ETP-4793).
 *
 * `NeoDefaultsService` now post-processes every resolved default: date-valued entries are
 * canonicalized to ISO (`yyyy-MM-dd`) regardless of which of three shapes produced them
 * (`@#Date@`'s hardcoded `dd-MM-yyyy`, an already-ISO callout writeback, or a raw Postgres
 * timestamp), and boolean-valued entries become a real JSON boolean instead of the `"Y"`/`"N"`
 * string several producers left behind. Both are read by two consumers that only understand
 * the canonical shape — the DAL write path (`JsonUtils.createDateFormat`) and the React form
 * (`dateOnly.js`) — so any other shape is a defect, not a style difference.
 *
 * This spec checks GET .../defaults for sales-order and purchase-order headers, which both
 * carry known date columns (`DateAcct`/`accountingDate`, `DateOrdered`/`orderDate`,
 * `DatePromised`/`scheduledDeliveryDate`, all `Date`-typed on `C_Order`) and known boolean
 * columns (`Iscashvat`/`cashVAT`, `IsDelivered`/`delivered`, `IsDiscountPrinted`/`printDiscount`,
 * `IsInvoiced`/`reinvoice`, `IsPrinted`/`print`, `IsSelected`/`selected`,
 * `IsSelfService`/`selfService`, `IsSOTrx`/`salesTransaction`, `Processed`/`processed`,
 * `Iscancelled`/`iscancelled`, all `YesNo`-typed on `C_Order`).
 *
 * Requires a live Etendo GO backend with a loaded F&B dataset AND built at or after the
 * ETP-4793 commit that introduces this post-processing — a build predating it lacks
 * `util/NeoDateFormat.class` and `util/NeoBooleanFormat.class` entirely, so `/defaults`
 * still returns the raw shapes each producer happened to leave behind. Before treating a red
 * run here as a real regression, check the deploy is current with a one-line live check:
 * `GET /sws/neo/purchase-order/header/defaults` returning `"orderDate": "14-08-2026"`
 * (dd-MM-yyyy) instead of `"2026-08-14"` (ISO) means the backend is stale, not that the
 * assertion is wrong.
 *
 * Gated by E2E_NEO_ETP4793_CONTRACTS=1 (see docs/e2e-testing-guide.md).
 */

const RUN = process.env.E2E_NEO_ETP4793_CONTRACTS === '1';
const ETENDO_BASE_URL = trimTrailingSlash(process.env.ETENDO_URL || 'http://localhost:8080/etendo');
const TOKEN = process.env.E2E_ETENDOGO_JWT || resolveJwt();

const NON_ISO_DATE = /^\d{2}-\d{2}-\d{4}$/; // dd-MM-yyyy — the shape that must NOT appear
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

// java_qualifier (API key) -> underlying AD_Column, confirmed Date-typed on C_Order.
const KNOWN_DATE_FIELDS = ['accountingDate', 'orderDate', 'scheduledDeliveryDate'];
// java_qualifier (API key) -> underlying AD_Column, confirmed YesNo-typed on C_Order.
const KNOWN_BOOLEAN_FIELDS = [
  'cashVAT', 'delivered', 'printDiscount', 'reinvoice', 'print',
  'selected', 'selfService', 'salesTransaction', 'processed', 'iscancelled',
];

const SPECS = ['sales-order', 'purchase-order'];

for (const spec of SPECS) {
  test.describe(`NEO /defaults canonical wire format — ${spec}/header (integration)`, () => {
    test.skip(!RUN, 'Set E2E_NEO_ETP4793_CONTRACTS=1 to run this live NEO defaults-format contract test.');

    test.describe.configure({ timeout: 60_000 });

    test('every date default is ISO (yyyy-MM-dd), never dd-MM-yyyy', async ({ request }) => {
      const defaults = await fetchDefaults(request, spec);

      // Generic scan: no value anywhere in `defaults` may look like dd-MM-yyyy — a value in
      // that exact shape is either an unconverted date or, worse, silently reinterpreted by
      // the DAL's lenient parser (see NeoDateFormat's class javadoc).
      for (const [key, value] of Object.entries(defaults)) {
        if (typeof value === 'string') {
          expect(value, `defaults.${key} = '${value}' looks like dd-MM-yyyy, not ISO`).not.toMatch(NON_ISO_DATE);
        }
      }

      // Specific assertion on the known date columns for this window.
      const checked = [];
      for (const field of KNOWN_DATE_FIELDS) {
        if (!(field in defaults)) continue; // not every window carries every field
        checked.push(field);
        const value = defaults[field];
        expect(typeof value, `defaults.${field} should be a string, got ${typeof value}`).toBe('string');
        expect(value, `defaults.${field} = '${value}' is not ISO (yyyy-MM-dd…)`).toMatch(ISO_DATE_PREFIX);
      }

      // A payload that stops carrying any of the known date fields would let this test pass
      // having asserted nothing — that disappearance is itself a regression worth catching,
      // not a silent no-op.
      expect(
        checked.length,
        `${spec}/header/defaults carried none of the known date fields ` +
          `(${KNOWN_DATE_FIELDS.join(', ')}) — payload keys were: ${Object.keys(defaults).join(', ')}`,
      ).toBeGreaterThanOrEqual(1);
    });

    test('every boolean default is a real JSON boolean, never "Y"/"N"', async ({ request }) => {
      const defaults = await fetchDefaults(request, spec);

      const checked = [];
      for (const field of KNOWN_BOOLEAN_FIELDS) {
        if (!(field in defaults)) continue; // not every window carries every field
        checked.push(field);
        const value = defaults[field];
        expect(
          typeof value,
          `defaults.${field} = ${JSON.stringify(value)} should be typeof 'boolean', not a 'Y'/'N' string`,
        ).toBe('boolean');
      }

      // Same reasoning as the date test above: zero checked fields must fail loudly, not
      // pass vacuously.
      expect(
        checked.length,
        `${spec}/header/defaults carried none of the known boolean fields ` +
          `(${KNOWN_BOOLEAN_FIELDS.join(', ')}) — payload keys were: ${Object.keys(defaults).join(', ')}`,
      ).toBeGreaterThanOrEqual(1);
    });
  });
}

async function fetchDefaults(request, spec) {
  const response = await request.get(`${ETENDO_BASE_URL}/sws/neo/${spec}/header/defaults`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  expect(response.ok(), `${spec}/header/defaults should return HTTP 2xx: ${await response.text()}`).toBe(true);
  const body = await response.json();
  return body.response?.defaults ?? body.defaults ?? {};
}

function resolveJwt() {
  if (!RUN) return '';
  try {
    return execFileSync(
      resolve(import.meta.dirname, '..', '..', '..', 'scripts', 'neo-token-groupadmin.sh'),
      {
        encoding: 'utf8',
        env: { ...process.env, ETENDO_URL: ETENDO_BASE_URL },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
  } catch (error) {
    throw new Error(`Could not get Etendo GO JWT for the defaults-canonical-format contract test: ${error.stderr || error.message}`);
  }
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}
