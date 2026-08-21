import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * NEO batch atomicity — live integration (IMP-23 / ETP-4793).
 *
 * `BatchService` used to run every operation through core's self-committing
 * `DefaultJsonDataService`, which ends its success branch with an unconditional
 * `OBDal.getInstance().commitAndClose()`. A failure at op *n* therefore left ops
 * `0..n-1` durable even though the response said `committed:false` — the caller had
 * no reason to suspect a record existed. The fix routes the loop through
 * `NeoBatchJsonDataService` (deferred commit) so the whole batch really does roll
 * back as a unit.
 *
 * This spec proves the fix by reading the DATABASE, not just the response body:
 * the response shape alone would have looked identical before the fix (see the
 * BatchService class javadoc). Two operations are sent — a valid `sales-order`
 * header, then a line that reaches Postgres and is rejected there (a non-existent
 * `tax` foreign key, i.e. a persist-time failure, not a pre-flight validation one)
 * — and the test asserts the header is durably GONE afterwards.
 *
 * `committed`/`atomic`/`persisted`/`hint` are `BatchService`'s public outcome contract
 * (`FIELD_COMMITTED`/`FIELD_ATOMIC`/`FIELD_PERSISTED`/`FIELD_HINT`, all `public static final`
 * precisely so callers — this spec included — stop branching on string literals). All four
 * are asserted unconditionally below: a response missing any of them is a contract break,
 * not something to tolerate.
 *
 * Requires a live Etendo GO backend with a loaded F&B dataset AND built at or after the
 * ETP-4793 commit that introduces the deferred-commit write path — a build predating it
 * lacks `NeoBatchJsonDataService.class` entirely, and every op still commits itself through
 * core's `DefaultJsonDataService`, which is precisely the bug this spec exists to catch (a
 * failed batch that still leaves earlier ops durable, and — pre-IMP-23 — a failure response
 * that never carried `atomic`/`persisted`/`hint` at all). A red run here is either a stale
 * deploy or a real regression; the assertion does not try to tell those apart, and must not.
 *
 * Gated by E2E_NEO_ETP4793_CONTRACTS=1 (see docs/e2e-testing-guide.md).
 */

const RUN = process.env.E2E_NEO_ETP4793_CONTRACTS === '1';
const ETENDO_BASE_URL = trimTrailingSlash(process.env.ETENDO_URL || 'http://localhost:8080/etendo');
const TOKEN = process.env.E2E_ETENDOGO_JWT || resolveJwt();

// Fixture ids from the stock F&B demo dataset (F&B International Group / F&B US, Inc.).
const BUSINESS_PARTNER_ID = '2C4C71BC828B47A0AF2A79855FD3BA7A'; // Sleep Well Hotels, Co.
const PARTNER_ADDRESS_ID = '41309C18643643B4844BF4F45B0D2194'; // its only (ship-to + bill-to) address
const WAREHOUSE_ID = '4D45FE4C515041709047F51D139A21AC'; // US West Coast
const PRICE_LIST_ID = '8366EAF1EDF442A98377D74A199084A8'; // General Sales
const PAYMENT_TERMS_ID = 'B62EDD9166D146539E9A19C05BCF85E5'; // 120 days
const CURRENCY_ID = '100'; // USD
const TRANSACTION_DOCUMENT_ID = '897373C4F935405DA8030E3F4237711F'; // Standard Order
const PRODUCT_ID = '20FBF069AC804DE9BF16670000B9562E'; // Cherry Cola (priced in General Sales)
const REAL_TAX_ID = '88F1D5EDAF7F4A339446875736F9D538'; // a genuinely valid sales tax for this product/org
const UOM_ID = '100'; // Unit
const NONEXISTENT_TAX_ID = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'; // syntactically valid, does not exist

const MARKER = 'E2E-ETP4793';
const ISO_TODAY = new Date().toISOString().slice(0, 10);

test.describe('NEO batch atomicity — sales-order (integration)', () => {
  test.skip(!RUN, 'Set E2E_NEO_ETP4793_CONTRACTS=1 to run this live NEO batch atomicity contract test.');

  test.describe.configure({ timeout: 60_000 });

  test('a persist-time failure on op1 leaves op0 durably rolled back, not just reported as such', async ({ request }) => {
    const headerBody = {
      businessPartner: BUSINESS_PARTNER_ID,
      partnerAddress: PARTNER_ADDRESS_ID,
      invoiceAddress: PARTNER_ADDRESS_ID,
      warehouse: WAREHOUSE_ID,
      priceList: PRICE_LIST_ID,
      paymentTerms: PAYMENT_TERMS_ID,
      currency: CURRENCY_ID,
      transactionDocument: TRANSACTION_DOCUMENT_ID,
      orderDate: ISO_TODAY,
      accountingDate: ISO_TODAY,
      scheduledDeliveryDate: ISO_TODAY,
      description: `${MARKER} batch atomicity probe — should NOT survive a failed batch`,
    };

    const operations = [
      { id: 'hdr', spec: 'sales-order', entity: 'header', body: headerBody },
      {
        id: 'ln1',
        spec: 'sales-order',
        entity: 'lines',
        parentRef: 'hdr',
        body: {
          product: PRODUCT_ID,
          orderedQuantity: 1,
          // A well-formed but non-existent FK: passes every pre-flight "field present"
          // check and reaches the DAL, where Postgres rejects it as an FK violation —
          // exactly the "persist-time, not validation-time" failure IMP-23 targets.
          tax: NONEXISTENT_TAX_ID,
          uOM: UOM_ID,
          unitPrice: 0.83,
          listPrice: 0.83,
          priceLimit: 0,
          warehouse: WAREHOUSE_ID,
          orderDate: ISO_TODAY,
          currency: CURRENCY_ID,
        },
      },
    ];

    const response = await request.post(`${ETENDO_BASE_URL}/sws/neo/batch`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      data: { operations },
    });

    const body = await response.json();

    // The op1 failure must be reported as such — and, now that BatchService owns a
    // real deferred-commit transaction (IMP-23), as an atomic one: nothing survived.
    expect(body.committed, `expected committed:false, got: ${JSON.stringify(body)}`).toBe(false);
    expect(body.failedAt?.id).toBe('ln1');
    expect(body.atomic, `expected atomic:true, got: ${JSON.stringify(body)}`).toBe(true);
    expect(body.persisted, `expected an empty persisted array, got: ${JSON.stringify(body)}`).toEqual([]);
    expect(typeof body.hint, `expected a hint string, got: ${JSON.stringify(body)}`).toBe('string');
    expect(body.hint.length).toBeGreaterThan(0);

    // The response body is not the proof — the database is. Before IMP-23 this same
    // response shape could still hide a durable orphan header. Confirm op0's header
    // genuinely does not exist by searching for its unique marker description.
    const listResp = await request.get(`${ETENDO_BASE_URL}/sws/neo/sales-order/header`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      params: { limit: 50, offset: 0 },
    });
    expect(listResp.ok()).toBe(true);
    const listBody = await listResp.json();
    const rows = listBody.response?.data ?? [];
    const orphan = rows.find((row) => row.description === headerBody.description);
    expect(
      orphan,
      orphan
        ? `IMP-23 regression: op0's header (id=${orphan.id}) survived a failed batch — the ` +
          'rollback did not undo it. This is the exact bug the atomicity fix exists to prevent.'
        : undefined,
    ).toBeUndefined();

    // Best-effort cleanup for the documented escape hatch: if a process handler
    // committed underneath the batch, `persisted` names surviving records to delete.
    for (const survivor of body.persisted ?? []) {
      await request.delete(`${ETENDO_BASE_URL}/sws/neo/sales-order/header/${survivor.recordId}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      }).catch(() => {});
    }
  });
});

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
    throw new Error(`Could not get Etendo GO JWT for the batch atomicity contract test: ${error.stderr || error.message}`);
  }
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}
