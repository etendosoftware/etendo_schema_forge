/**
 * Deterministic PRODUCT master-data fixtures for live-backend integration specs.
 *
 * ## Why this exists (ETP-5079)
 * The GOClient onboarding dataset used to seed four demo products — "Agua"
 * (SK-001), "Cerveza" (SK-002), "Fernet" (SK-003) and "Queso Sardo" (SK-004) —
 * plus the eight `M_PRODUCTPRICE` rows that made them appear in the product
 * search drawer. ETP-5079 deleted all four so a NEW tenant is born clean: the
 * only `M_PRODUCT` row left is `ETGO_DTO` ("Discount"), and that one is
 * INVISIBLE in the UI because its category is flagged
 * `EM_Etgo_IsSystemCategory='Y'` (hidden by `ProductDefaultsHandler
 * #hideSystemCategoryProducts` on GET, and by `ProductCategorySystemFlagSelector
 * Policy` on every category selector). A fresh tenant's Products list is empty.
 *
 * Every sales/purchase integration spec therefore has nothing to put on a
 * document line. Specs that named a seeded product ("Queso Sardo", "Agua") now
 * match nothing; specs that picked one POSITIONALLY (`productIndex: 0/1`) find
 * an empty drawer and time out on an unrelated locator. Both failure modes look
 * like UI bugs and are not.
 *
 * The fix is the same one `ensureVendorSetup()` (purchase-helpers.js) applies to
 * contacts: a dedicated, deterministically-named fixture that the suite
 * find-or-creates (and repairs) itself, instead of depending on seed data,
 * on grid ordering, or on whatever a previous run left behind.
 *
 * ## Why API-only (no UI automation)
 * Same reasoning as `ensureStockOnHand()` in inventory-helpers.js: creating a
 * product and attaching prices is plain NEO CRUD under the hood, so driving the
 * real Product window (gallery layout, sidebar form, `ProductPriceBar` add-row,
 * portaled `CreatableSearchSelect` dropdown) would buy nothing but flakiness.
 * Everything below talks to `/sws/neo/product/**` through `page.request`
 * (Playwright's APIRequestContext), authenticated with the bearer token
 * `login(page)` already put in `localStorage['sf_auth_token']`.
 *
 * Endpoints used — all read from source, none guessed:
 *   - `GET  /sws/neo/product/product`                          (fixture lookup)
 *   - `GET  /sws/neo/product/product/selectors/M_Product_Category_ID`
 *   - `POST /sws/neo/product/product`                          (create)
 *   - `GET  /sws/neo/product/price?parentId={id}`              (existing prices)
 *   - `GET  /sws/neo/product/price/selectors/M_PriceList_Version_ID`
 *   - `POST /sws/neo/product/price`                            (attach a price)
 * The `/price` shapes mirror `ProductPriceBar.jsx` exactly (`refreshPrices()`,
 * the `adding` effect's `/price/selectors/${selectorColumn}?limit=200` fetch and
 * `handleAdd()`'s POST body). The selector path segment may be either the DB
 * column or the DAL property name — `NeoSelectorService#findFieldByColumnName`
 * tries the column first and falls back to the property — the column form is
 * used here to match ProductPriceBar.
 *
 * ## Why the product must be PRICED, not merely created
 * The product search drawer on a document line does not query `M_Product`. It
 * queries the `ProductPriceWarehouse` view (`M_PRODUCT_PRICE_WAREHOUSE_V`,
 * `FROM m_productprice pp ... JOIN m_product p`), and
 * `ContextParamSelectorPolicy#resolveProductByPriceFilter` narrows it further by
 * the document's own price list — `productPrice.priceListVersion.priceList.id`
 * when the header already resolved one, otherwise
 * `...salesPriceList = true/false` from `isSOTrx`. A product with no
 * `M_ProductPrice` row is invisible in EVERY drawer; a product priced only on
 * the sales tariff is invisible in a purchase order's drawer and vice versa.
 * That is why `ensurePrices()` below attaches a price to EVERY price list
 * version the tenant has (2 on a fresh tenant: "Version Tarifa de venta
 * principal" and "Version Tarifa de compra principal") rather than guessing
 * which one a given document will land on.
 *
 * ## What the backend fills in for us
 * `ProductDefaultsHandler` (`@Named("productDefaultsHandler")`, wired via
 * `ETGO_SF_ENTITY.Java_Qualifier` on the `product` entity) injects `uOM` and
 * `taxCategory` on POST create, resolving the client's own `IsDefault='Y'` row
 * with a fallback to the System client — the same values a human filling the
 * real form would get. They are deliberately NOT hardcoded here: pinning a tax
 * category id would make this fixture lie about what a real user gets, and the
 * downstream `verifyTotalsConsistency()` "tax must not be zero" assertion is
 * exactly the check that should catch it if the tenant's default tax category
 * ever resolves to a 0% tax.
 *
 * `productCategory` IS resolved explicitly: its `@SQL=` default selects the row
 * flagged `ISDEFAULT='Y'`, and neither GOClient category ("Generic", "Discounts")
 * carries that flag, so the default silently yields nothing and the required
 * field would be rejected. The category selector already excludes
 * system-flagged categories, so its first row is the tenant's real, user-facing
 * category.
 *
 * ## Idempotency
 * Safe to call repeatedly in the same tenant, and in any order relative to the
 * other `ensure*` helpers. Lookup is by `searchKey` (`M_Product.Value`, unique
 * per client), never positional. A run that finds the fixture already created
 * and already priced performs zero writes. A run that finds it half-provisioned
 * (created but missing a price, e.g. a previous run that died between the two
 * POSTs) repairs only the missing part.
 */

const SPEC_BASE = '/sws/neo/product';
const PRODUCT_ENTITY = 'product';
const PRICE_ENTITY = 'price';
const PRODUCT_CATEGORY_COLUMN = 'M_Product_Category_ID';
const PRICE_LIST_VERSION_COLUMN = 'M_PriceList_Version_ID';

/**
 * The two deterministic product fixtures the integration specs use.
 *
 * TWO of them, not one, because several specs deliberately put two DIFFERENT
 * products on the same document (`sales-order-happy-path` asserts both names
 * are visible on the generated invoice; the full-flow specs add a positive
 * baseline line and then a negative-quantity line and later tell them apart).
 *
 * Fixed (never timestamped) names/keys so the SAME fixture is found on every
 * run instead of creating a fresh one each time — same rule as
 * `VENDOR_FIXTURE_NAME` in purchase-helpers.js. The names share no substring
 * with each other, so a `getByText(/e2e product alpha/i)` assertion can never
 * accidentally match the other one.
 *
 * Prices are distinct and non-zero: `verifyTotalsConsistency()` asserts
 * `subtotal > 0`, and `sales-quotation-full-flow` asserts the document subtotal
 * DECREASES once a negative-quantity line of the second product is added — both
 * are vacuous at price 0.
 */
export const PRODUCT_FIXTURE_ALPHA = {
  searchKey: 'E2E-ALPHA',
  name: 'E2E Product Alpha',
  standardPrice: 12,
  listPrice: 12,
};

export const PRODUCT_FIXTURE_BETA = {
  searchKey: 'E2E-BETA',
  name: 'E2E Product Beta',
  standardPrice: 25,
  listPrice: 25,
};

export const PRODUCT_FIXTURES = [PRODUCT_FIXTURE_ALPHA, PRODUCT_FIXTURE_BETA];

async function getAuthHeaders(page) {
  const token = await page.evaluate(() => localStorage.getItem('sf_auth_token'));
  if (!token) {
    throw new Error(
      'ensureProductSetup could not find an auth token in localStorage["sf_auth_token"] — '
      + 'call login(page) before ensureProductSetup(page, ...).',
    );
  }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** NEO wraps CRUD create/read responses in `{ response: { data: [...] } }`. */
function extractRows(json) {
  const rows = json?.response?.data;
  return Array.isArray(rows) ? rows : [];
}

async function fetchSelectorItems(page, { entity, column, headers, limit = 200 }) {
  const res = await page.request.get(`${SPEC_BASE}/${entity}/selectors/${column}`, {
    params: { limit: String(limit) },
    headers,
  });
  if (!res.ok()) {
    throw new Error(
      `ensureProductSetup: selector fetch failed for ${entity}/selectors/${column} `
      + `(${res.status()}): ${await res.text()}`,
    );
  }
  const body = await res.json();
  return Array.isArray(body?.items) ? body.items : [];
}

/**
 * GETs product candidates for `searchKey`, oldest-first, so that whenever more
 * than one row comes back the FIRST one is the same one across runs.
 *
 * `useCriteria: true` sends the exact-match AdvancedCriteria filter the
 * ListView's own filter bar sends (`buildBackendFilter()` in
 * tools/app-shell/src/lib/gridQuery.js, merged by `mergeFilterCriteria()` in
 * useEntity.js). `useCriteria: false` fetches an unfiltered bounded page and
 * matches client-side — see `findProductFixture()` for why that second mode
 * exists.
 */
async function queryProductCandidates(page, { searchKey, headers, useCriteria }) {
  const params = { _sortBy: 'creationDate', _startRow: '0', _endRow: '500' };
  if (useCriteria) {
    params.criteria = JSON.stringify({
      _constructor: 'AdvancedCriteria',
      operator: 'and',
      criteria: [{ fieldName: 'searchKey', operator: 'equals', value: searchKey }],
    });
  }
  const res = await page.request.get(`${SPEC_BASE}/${PRODUCT_ENTITY}`, { params, headers });
  if (!res.ok()) {
    throw new Error(`ensureProductSetup: fixture lookup failed (${res.status()}): ${await res.text()}`);
  }
  const rows = extractRows(await res.json());
  // Filter client-side in BOTH modes: a backend that silently ignores an
  // unsupported `criteria` param would otherwise hand back the whole page and
  // the first unrelated product would be mistaken for the fixture.
  return rows.filter((row) => row?.searchKey === searchKey);
}

/**
 * Picks the deterministic fixture out of one or more candidates (already sorted
 * oldest-first) and warns if there was more than one. `M_Product.Value` is
 * unique per client so a same-tenant duplicate should be impossible, but
 * silently picking whichever row the backend felt like returning would let the
 * suite ping-pong between homonyms across runs instead of surfacing it.
 */
function pickDeterministicFixture(candidates, searchKey) {
  if (candidates.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureProductSetup] Found ${candidates.length} products with searchKey "${searchKey}" `
      + `in this tenant (ids: ${candidates.map((c) => c.id).join(', ')}). Using the oldest one `
      + `(${candidates[0].id}) deterministically — the tenant likely needs a manual data cleanup.`,
    );
  }
  return candidates[0];
}

/**
 * Read-only lookup of the product fixture.
 *
 * A zero-row result from the filtered query is re-verified against an
 * unfiltered (bounded) page before it is trusted enough to justify a create —
 * the same guard `findVendorFixture()` grew after a broken/ignored filter
 * silently produced a duplicate contact. The create path has no other way to
 * tell "the criteria query is broken" apart from "this really is the first
 * run", and here the mistake would be worse than a duplicate: `M_Product.Value`
 * is unique per client, so the create would just fail with a raw constraint
 * violation.
 */
async function findProductFixture(page, { searchKey, headers }) {
  const filtered = await queryProductCandidates(page, { searchKey, headers, useCriteria: true });
  if (filtered.length > 0) {
    return pickDeterministicFixture(filtered, searchKey);
  }

  const unfiltered = await queryProductCandidates(page, { searchKey, headers, useCriteria: false });
  if (unfiltered.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureProductSetup] The criteria-filtered lookup for searchKey "${searchKey}" returned 0 rows, `
      + `but an unfiltered scan found ${unfiltered.length} match(es) — the "searchKey equals" filter may `
      + 'be misbehaving for this entity/backend version. Using the unfiltered match instead of creating a duplicate.',
    );
    return pickDeterministicFixture(unfiltered, searchKey);
  }

  return null;
}

/**
 * Resolves the product category to file the fixture under. Required, and its
 * AD `@SQL=` default cannot fire on a GO tenant (no category is flagged
 * `ISDEFAULT='Y'`), so it must be sent explicitly on create.
 *
 * The selector is already filtered by `ProductCategorySystemFlagSelectorPolicy`
 * to exclude `EM_Etgo_IsSystemCategory='Y'` rows, so its first item is a real
 * user-facing category and never the hidden "Discounts" one that only exists to
 * carry `ETGO_DTO`. On a fresh tenant that first item is the starter category
 * seeded by `GOClient/M_PRODUCT_CATEGORY.xml`: base name and `VALUE` "Generic"
 * since ETP-5079 (it was "Otros"), displayed as "Genérico" through its es_ES
 * `M_PRODUCT_CATEGORY_TRL` row. Resolution stays positional-by-selector and
 * never matches on that label — the base name, the search key and the rendered
 * identifier are now three different strings, and only the id is stable.
 */
async function resolveProductCategoryId(page, { headers }) {
  const items = await fetchSelectorItems(page, {
    entity: PRODUCT_ENTITY, column: PRODUCT_CATEGORY_COLUMN, headers, limit: 100,
  });
  const match = items.find((item) => item?.id);
  if (!match) {
    throw new Error(
      'ensureProductSetup: the tenant has no selectable product category via '
      + `/${PRODUCT_ENTITY}/selectors/${PRODUCT_CATEGORY_COLUMN} — a product cannot be created without one. `
      + 'This is a tenant data-setup gap, not something this helper should invent a category for.',
    );
  }
  return match.id;
}

/**
 * Creates the fixture product.
 *
 * `uOM` and `taxCategory` are intentionally omitted — `ProductDefaultsHandler`
 * injects the tenant's real defaults for both on POST create (see this file's
 * header). Everything else is sent explicitly because a raw CRUD POST does not
 * get the AD column defaults the real form applies:
 *   - `productType: 'I'` (Item) — a Service product ('S') is force-unstocked by
 *     the same handler and could never be shipped or counted.
 *   - `stocked` — required for the Goods Shipment / Goods Receipt legs and for
 *     `ensureStockOnHand()`'s Physical Inventory count to mean anything.
 *   - `purchase` / `sale` — the fixture is used by BOTH purchase and sales
 *     flows, so both flags must be on.
 *   - `returnable` — `sales-order-return-rectificativa` drives this product
 *     through the return wizard.
 */
async function createProductFixture(page, { fixture, categoryId, headers }) {
  const res = await page.request.post(`${SPEC_BASE}/${PRODUCT_ENTITY}`, {
    headers,
    data: {
      searchKey: fixture.searchKey,
      name: fixture.name,
      description: 'E2E integration fixture — safe to delete when no suite is running.',
      productCategory: categoryId,
      productType: 'I',
      stocked: true,
      purchase: true,
      sale: true,
      returnable: true,
      active: true,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `ensureProductSetup: product create failed for "${fixture.name}" (${res.status()}): ${await res.text()}`,
    );
  }
  const record = extractRows(await res.json())[0];
  if (!record?.id) {
    throw new Error(`ensureProductSetup: product create response had no id: ${JSON.stringify(record)}`);
  }
  return record;
}

/** Currently attached price rows, keyed by the price list version they belong to. */
async function fetchPricedVersionIds(page, { productId, headers }) {
  const res = await page.request.get(`${SPEC_BASE}/${PRICE_ENTITY}`, {
    params: { parentId: productId, _startRow: '0', _endRow: '200' },
    headers,
  });
  if (!res.ok()) {
    throw new Error(`ensureProductSetup: price lookup failed (${res.status()}): ${await res.text()}`);
  }
  return new Set(extractRows(await res.json()).map((row) => String(row?.priceListVersion)));
}

/**
 * Attaches the fixture's price to EVERY price list version the tenant has that
 * does not already carry one. See this file's header for why "every version"
 * and not "the right one": the drawer's own selector filter keys off the
 * document's price list, which is resolved by the business partner / org and is
 * not knowable from here.
 *
 * `priceLimit` is sent explicitly as 0 rather than left out. `ProductPriceHandler
 * #handlePost` defaults an omitted `priceLimit` to `listPrice`, which would make
 * the fixture's list price its own floor — harmless on the GOClient tariffs
 * (both `ENFORCEPRICELIMIT='N'`) but a latent "price under limit" rejection on
 * any tenant whose tariff does enforce it.
 */
async function ensurePrices(page, { productId, fixture, headers }) {
  const versions = await fetchSelectorItems(page, {
    entity: PRICE_ENTITY, column: PRICE_LIST_VERSION_COLUMN, headers,
  });
  if (versions.length === 0) {
    throw new Error(
      'ensureProductSetup: the tenant has no price list version via '
      + `/${PRICE_ENTITY}/selectors/${PRICE_LIST_VERSION_COLUMN}. Without one, no product can ever appear `
      + 'in a document line\'s product search drawer (it queries M_PRODUCT_PRICE_WAREHOUSE_V, which is '
      + 'driven by M_ProductPrice). This is a tenant data-setup gap.',
    );
  }

  const alreadyPriced = await fetchPricedVersionIds(page, { productId, headers });
  const missing = versions.filter((version) => version?.id && !alreadyPriced.has(String(version.id)));

  for (const version of missing) {
    // eslint-disable-next-line no-await-in-loop -- sequential on purpose: each POST hits the
    // (M_PriceList_Version_ID, M_Product_ID) unique constraint, and a serial loop keeps a
    // failure attributable to one specific version instead of an unordered Promise.all reject.
    const res = await page.request.post(`${SPEC_BASE}/${PRICE_ENTITY}`, {
      headers,
      data: {
        parentId: productId,
        product: productId,
        priceListVersion: version.id,
        standardPrice: String(fixture.standardPrice),
        listPrice: String(fixture.listPrice),
        priceLimit: '0',
      },
    });
    if (!res.ok()) {
      throw new Error(
        `ensureProductSetup: attaching a price for "${fixture.name}" to price list version `
        + `${version.id} failed (${res.status()}): ${await res.text()}`,
      );
    }
  }

  return { total: versions.length, added: missing.length };
}

/**
 * Ensure a dedicated, deterministically-named product exists AND is priced on
 * every price list version of the tenant — find-or-create/repair, never
 * "whatever product happens to sit at index N of the drawer".
 *
 * Replaces the previous approach across the integration specs, which either
 * named a demo product ETP-5079 deleted from the onboarding dataset ("Queso
 * Sardo", "Agua", "Cerveza", "Fernet") or picked one by drawer position
 * (`productIndex: 0/1`) — the first now matches nothing, the second now finds
 * an empty drawer, and on a long-lived dev tenant the second also silently
 * bound the assertions to whatever leftover data a previous run created.
 *
 * @param {import('@playwright/test').Page} page - Must already be logged in
 *   (`login(page)`), so the bearer token is in localStorage.
 * @param {object} [fixture=PRODUCT_FIXTURE_ALPHA] - One of the exported
 *   `PRODUCT_FIXTURE_*` descriptors: `{ searchKey, name, standardPrice, listPrice }`.
 * @returns {Promise<{id: string, name: string, searchKey: string, created: boolean,
 *   pricedVersions: number, pricesAdded: number}>}
 */
export async function ensureProductSetup(page, fixture = PRODUCT_FIXTURE_ALPHA) {
  if (!fixture?.searchKey || !fixture?.name) {
    throw new Error('ensureProductSetup requires a fixture with a searchKey and a name.');
  }

  const headers = await getAuthHeaders(page);

  let record = await findProductFixture(page, { searchKey: fixture.searchKey, headers });
  const created = !record;
  if (!record) {
    const categoryId = await resolveProductCategoryId(page, { headers });
    record = await createProductFixture(page, { fixture, categoryId, headers });
  }

  const { total, added } = await ensurePrices(page, { productId: record.id, fixture, headers });

  return {
    id: record.id,
    // Read the name back off the record rather than echoing the descriptor: on
    // the "already existed" path the persisted name is what the drawer and the
    // line's `data-cell-key="product"` cell will actually render, and that is
    // what callers pass on to `ensureStockOnHand()`.
    name: record.name ?? fixture.name,
    searchKey: record.searchKey ?? fixture.searchKey,
    created,
    pricedVersions: total,
    pricesAdded: added,
  };
}

/**
 * Convenience wrapper for the specs that need two distinct products on the same
 * document. Sequential, not `Promise.all`: both calls resolve the same product
 * category and price list versions, and racing two creates through the same
 * backend session buys nothing but harder-to-read failures.
 *
 * @returns {Promise<{alpha: object, beta: object}>} the two `ensureProductSetup` results.
 */
export async function ensureProductFixtures(page) {
  const alpha = await ensureProductSetup(page, PRODUCT_FIXTURE_ALPHA);
  const beta = await ensureProductSetup(page, PRODUCT_FIXTURE_BETA);
  return { alpha, beta };
}
