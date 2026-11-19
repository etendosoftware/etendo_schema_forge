import { apiAuthHeaders } from './auth.js';
import { clickBpOptionWithAddress } from './purchase-helpers.js';

/**
 * sales-helpers.js — shared fixtures/guards for the real-backend SALES specs.
 *
 * The purchase side already stopped trusting grid/dropdown position: see
 * `ensureVendorSetup()` in purchase-helpers.js, whose own doc says it is a
 * "find-or-create/repair, never 'whatever the first row happens to be'" because the
 * position-0 approach "depended on grid ordering and on whatever data a previous run
 * left behind". The sales specs never got that treatment and kept picking
 * `[data-testid^="option-businessPartner-"] … .first()`, which is what broke them all
 * at once once an earlier spec left address-less contacts behind (ETP-5283).
 */

/**
 * Picks a customer from the open businessPartner dropdown that has an address, so the BP
 * callout can derive `partnerAddress` and `action-save-draft` actually becomes enabled.
 *
 * Thin sales-side name for `clickBpOptionWithAddress`, which lives beside the location
 * lookup it uses and is shared with the purchase path (`selectVendorBP` without a named
 * fixture). One implementation, two vocabularies — the full rationale is on that
 * function.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<string>} the id of the customer that was clicked
 */
export async function selectCustomerWithAddress(page, options) {
  return clickBpOptionWithAddress(page, options);
}

// ── Customer fixture ─────────────────────────────────────────────────────────

/**
 * The customer the sales specs sell to. Fixed name, so re-runs reuse it; it shares no
 * substring with `VENDOR_FIXTURE_NAME` (purchase-helpers.js).
 */
export const CUSTOMER_FIXTURE = {
  name: 'E2E Customer Fixture',
  addressLine1: 'E2E Customer Fixture Address',
  cityName: 'E2E City',
  postalCode: '28013',
  countryQuery: 'spa',
  countryLabels: ['España', 'Spain'],
};

const CONTACTS_API = '/sws/neo/contacts';

async function customerFixtureHeaders(page) {
  return { ...(await apiAuthHeaders(page)), 'Content-Type': 'application/json' };
}

function responseRows(json) {
  const rows = json?.response?.data;
  return Array.isArray(rows) ? rows : [];
}

/** The fixture customer, oldest first, filtered by exact name; `null` when absent. */
async function findCustomerFixture(page, headers) {
  const res = await page.request.get(`${CONTACTS_API}/businessPartner`, {
    params: {
      _sortBy: 'creationDate',
      _startRow: '0',
      _endRow: '50',
      criteria: JSON.stringify({
        _constructor: 'AdvancedCriteria',
        operator: 'and',
        criteria: [{ fieldName: 'name', operator: 'equals', value: CUSTOMER_FIXTURE.name }],
      }),
    },
    headers,
  });
  if (!res.ok()) {
    throw new Error(`ensureCustomerSetup: customer lookup failed (${res.status()}): ${await res.text()}`);
  }
  return responseRows(await res.json()).find((row) => row?.name === CUSTOMER_FIXTURE.name) ?? null;
}

/**
 * Creates the customer from the Contacts window's own defaults, exactly as the "New"
 * form does. The defaults carry no payment method, so creating it needs no financial
 * account — which is the point: this runs on a tenant that has none.
 */
async function createCustomerFixture(page, headers) {
  const res = await page.request.get(`${CONTACTS_API}/businessPartner/defaults`, { headers });
  if (!res.ok()) {
    throw new Error(`ensureCustomerSetup: contact defaults failed (${res.status()}): ${await res.text()}`);
  }
  const defaults = (await res.json())?.defaults ?? {};
  const body = Object.fromEntries(
    Object.entries(defaults).filter(([key]) => !key.endsWith('$_identifier')),
  );
  body.name = CUSTOMER_FIXTURE.name;
  body.customer = true;

  const created = await page.request.post(`${CONTACTS_API}/businessPartner`, { headers, data: body });
  if (!created.ok()) {
    throw new Error(
      `ensureCustomerSetup: creating "${CUSTOMER_FIXTURE.name}" failed (${created.status()}): `
      + `${await created.text()}`,
    );
  }
  const row = responseRows(await created.json())[0];
  if (!row?.id) {
    throw new Error(`ensureCustomerSetup: creating "${CUSTOMER_FIXTURE.name}" returned no id`);
  }
  return row;
}

/** The country id for the fixture address, from the same selector the address modal uses. */
async function resolveFixtureCountry(page, headers) {
  const res = await page.request.get(`${CONTACTS_API}/locationAddress/selectors/country`, {
    params: { q: CUSTOMER_FIXTURE.countryQuery, limit: '20' },
    headers,
  });
  if (!res.ok()) {
    throw new Error(`ensureCustomerSetup: country selector failed (${res.status()}): ${await res.text()}`);
  }
  const json = await res.json();
  const items = Array.isArray(json?.items) ? json.items : responseRows(json);
  const match = items.find((item) => CUSTOMER_FIXTURE.countryLabels
    .includes(item?.label || item?.name || item?._identifier));
  if (!match) {
    throw new Error(
      `ensureCustomerSetup: the country selector offered no ${CUSTOMER_FIXTURE.countryLabels.join('/')} `
      + `for q="${CUSTOMER_FIXTURE.countryQuery}"`,
    );
  }
  return match.id;
}

/**
 * Gives the customer one ship-to/invoice-to address when it has none. Without it the BP
 * callout cannot derive `partnerAddress` and the document never becomes saveable
 * (see `clickBpOptionWithAddress` in purchase-helpers.js).
 */
async function ensureCustomerAddress(page, headers, bpId) {
  const res = await page.request.get(`${CONTACTS_API}/locationAddress`, { params: { parentId: bpId }, headers });
  if (!res.ok()) {
    throw new Error(`ensureCustomerSetup: address lookup failed (${res.status()}): ${await res.text()}`);
  }
  if (responseRows(await res.json()).length > 0) return;

  const country = await resolveFixtureCountry(page, headers);
  const created = await page.request.post(`${CONTACTS_API}/locationAddress`, {
    params: { parentId: bpId },
    headers,
    // The same body LocationEditorModal sends with `structured-address-for-sepa` off; the
    // backend's legacy branch takes Address1 as is when streetName is blank.
    data: {
      name: `${CUSTOMER_FIXTURE.cityName}, ${CUSTOMER_FIXTURE.addressLine1}`,
      addressLine1: CUSTOMER_FIXTURE.addressLine1,
      addressLine2: null,
      streetName: null,
      buildingNumber: null,
      buildingName: null,
      postalCode: CUSTOMER_FIXTURE.postalCode,
      cityName: CUSTOMER_FIXTURE.cityName,
      country,
      region: null,
      shipToAddress: 'Y',
      invoiceToAddress: 'Y',
      businessPartner: bpId,
    },
  });
  if (!created.ok()) {
    throw new Error(
      `ensureCustomerSetup: creating the fixture address failed (${created.status()}): ${await created.text()}`,
    );
  }
}

/**
 * Guarantees the tenant has a customer with an address to sell to.
 *
 * A tenant fresh from onboarding has no contacts. The sales specs used to pick whichever
 * customer an earlier spec had left behind (the contacts import, the purchase vendor
 * fixture), so they only passed when they ran after those. This provisions the
 * customer itself, so they pass on a fresh tenant, in any order, in isolation.
 *
 * API only and navigation-free: call it after `login()` and before the document form
 * opens, since the businessPartner dropdown fetches its options when it opens. It never
 * touches payment methods or financial accounts, so it is safe in
 * `flows/before-financial-accounts/`. Idempotent: finds the fixture by name and only
 * creates what is missing.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ id: string, name: string, created: boolean }>}
 */
export async function ensureCustomerSetup(page) {
  const headers = await customerFixtureHeaders(page);
  let customer = await findCustomerFixture(page, headers);
  const created = !customer;
  if (!customer) customer = await createCustomerFixture(page, headers);
  await ensureCustomerAddress(page, headers, customer.id);
  return { id: customer.id, name: CUSTOMER_FIXTURE.name, created };
}
