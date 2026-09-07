/**
 * Deterministic WAREHOUSE master-data fixture for live-backend integration specs.
 *
 * ## Why this exists (ETP-5079)
 * The GOClient onboarding dataset used to seed TWO warehouses — `Almacen GO`
 * (value `AG`, bin `AG-0-0-0`) and `Almacén Secundario` (value `AS`, bin
 * `AS-0-0-0`). ETP-5079 reduced it to ONE: `Almacen Principal` (value `AG`, bin
 * `AG-0-0-0`, see `DEFAULT_WAREHOUSE_NAME` in inventory-helpers.js).
 *
 * That silently invalidated the ETP-4772 backend regression guard in
 * `purchase-order-full-flow.integration.spec.js` ("an explicitly picked
 * Warehouse survives the server-side business-partner callout on create"). The
 * guard works by picking a warehouse OTHER than the one the business-partner
 * callout derives, saving, and asserting the server echoed back the user's pick
 * rather than the BP default. With a single warehouse in the tenant there is no
 * "other" option to pick, so the guard proves nothing.
 *
 * The spec is explicit that this must FAIL rather than skip:
 *
 *     // Hard precondition — never a skip. A single-warehouse tenant makes the
 *     // guard vacuous, and that must surface as a failure, not as a green run.
 *
 * (An earlier live version of that guard, added ETP-4903 and deleted ETP-4909,
 * carried exactly such a mid-test `test.skip` and reported green while proving
 * nothing. Weakening the `>= 2` assertion or re-adding a skip would recreate
 * that bug.) So the fix is to PROVIDE the second warehouse, the same way
 * `ensureProductSetup()` provides the products ETP-5079 deleted and
 * `ensureVendorSetup()` provides the contact the dataset never had.
 *
 * ## Why API-only (no UI automation)
 * Same reasoning as `ensureProductSetup()` (product-helpers.js) and
 * `ensureStockOnHand()` (inventory-helpers.js): creating a warehouse and its
 * storage bin is plain NEO CRUD under the hood. Driving the real Warehouse
 * window (custom index.jsx, `LocationModalField` -> portaled
 * `LocationEditorModal` with its own country/region pickers, the Storage Bin
 * secondary tab) would buy nothing but flakiness. Everything below talks to
 * `/sws/neo/warehouse/**` through `page.request` (Playwright's
 * APIRequestContext), authenticated with the bearer token `login(page)` already
 * put in `localStorage['sf_auth_token']`.
 *
 * Endpoints used — all read from source (`ETGO_SF_ENTITY.xml` for the entity
 * names, `ETGO_SF_FIELD.xml` + `artifacts/warehouse/contract.json` for the
 * writable field set), none guessed:
 *   - `GET  /sws/neo/warehouse/warehouse`                 (fixture lookup + reference row)
 *   - `POST /sws/neo/warehouse/warehouse`                 (create)
 *   - `GET  /sws/neo/warehouse/storageBin?parentId={id}`  (existing bins)
 *   - `POST /sws/neo/warehouse/storageBin`                (create the bin)
 *
 * ## What the backend fills in for us, and what it does NOT
 * Neither `warehouse` nor `storageBin` has a `Java_Qualifier` in
 * `ETGO_SF_ENTITY` — both go through generic `NeoCrudHandler` CRUD. So:
 *
 *   - `NeoMandatoryDefaultsService.injectMandatoryDefaults` iterates EVERY
 *     active AD column of the tab's table and injects its AD default for any
 *     column absent from the body. That covers `M_Warehouse.Separator` (AD
 *     default `*`, `NOT NULL` with no DB default — a raw INSERT without it
 *     would fail), `IsAllocated` (`N`), `AD_Org_ID` (`@AD_Org_ID@` -> the
 *     session's current org, exactly what a human creating a warehouse in the
 *     real window gets), plus `M_Locator.PriorityNo` (50),
 *     `M_InventoryStatus_ID` and `Change_Status` (`N`) on the bin.
 *   - It does NOT create the `C_Location` and it does NOT create the
 *     `M_Locator`. `M_Warehouse.C_Location_ID` is `NOT NULL`, and a warehouse
 *     with no storage bin can never receive stock — so this helper owns both.
 *   - It does NOT create the `AD_Org_Warehouse` link row — and neither does this
 *     helper, because NEO exposes no route to it. See the next section.
 *
 * ## The `AD_Org_Warehouse` link row — exists, but is NOT reachable via NEO
 * A warehouse is bound to the organisations that may use it through the
 * `AD_Org_Warehouse` link table (core model file
 * `etendo_core/src-db/database/model/tables/AD_ORG_WAREHOUSE.xml`; surfaced as
 * the `Warehouse` tab of the Organization window, AD_Tab
 * `9F030341690C4BB3A3C15835AEC0FF39` -> AD_Table `OrganizationWarehouse` ->
 * DAL entity `OrgWarehouse`). The GOClient onboarding dataset ships exactly one
 * row (`referencedata/sampledata/GOClient/AD_ORG_WAREHOUSE.xml`) binding the
 * operational org to the seeded warehouse — and ETP-5079 deleted the second row
 * along with the second warehouse. So a fixture warehouse with no link row does
 * NOT match the shape of the one the tenant already has.
 *
 * That row is NOT created here, because there is no API path to it. The
 * `organization` spec DOES carry a `warehouse` entity pointing at that tab, and
 * it reads `ISGET=Y, ISPOST=Y` — but it is `ISINCLUDED=N`, and
 * `NeoServlet#findEntity` adds `Restrictions.eq(PROPERTY_ISINCLUDED, true)` to
 * its lookup. The entity is therefore unroutable BEFORE
 * `NeoMethodPolicy#isMethodEnabled` (the `ISGET`/`ISPOST` check) is ever
 * consulted, which is why a request there answers
 * `404 Entity not found in spec: warehouse` and not `405`. Verified live: an
 * earlier revision of this helper tried exactly that POST and died on the
 * preceding GET, deterministically, on a healthy backend. **`ISPOST=Y` does not
 * mean an entity is reachable — always check `ISINCLUDED` first.** (7 of the 11
 * entities in the `organization` spec are `ISINCLUDED=N`; only `organization`,
 * `information` and `actividadesDelIae` are exposed.)
 *
 * Not creating it is acceptable here, because the link row is not what makes a
 * warehouse selectable in the purchase order under test: the only consumer of
 * `ad_org_warehouse` anywhere in `com.etendoerp.go/src/` is
 * `ReportSelectorsServlet` (an `EXISTS` clause), which serves REPORT selectors.
 * `NeoSelectorService` — the generic path behind the PO header's
 * `M_Warehouse_ID` field — never consults it; core's
 * `SecureWebServicesUtils#getOrganizationWarehouses` uses it to resolve the JWT's
 * `warehouse` claim. So the fixture is one row short of the seeded warehouse's
 * exact shape, and closing that gap needs a backend change (flipping that entity
 * to `ISINCLUDED=Y`), not a change here.
 *
 * One asymmetry in the same area, also unfixable from here and worth knowing:
 * the SEEDED warehouse carries `M_WAREHOUSE.AD_ORG_ID = '0'` (org `*`, readable
 * from every org), whereas the fixture gets the session's current org from the
 * `@AD_Org_ID@` default. `AD_Org_ID` is `IsIncluded=N` on the `warehouse` entity
 * and is not a link-to-parent column there, so a value sent for it would simply
 * be dropped by `filterCreateRequest`. The fixture is therefore readable from the
 * session's own org — which is the org the purchase order under test runs in —
 * but not from unrelated sibling orgs.
 *
 * ## Why the address is REUSED, not created
 * `M_Warehouse.C_Location_ID` is a plain FK to `C_Location` with no uniqueness
 * constraint, so two warehouses may legitimately share one address row — the
 * real-world "second warehouse in the same building" case. Reusing the address
 * of the warehouse the tenant already has means this helper never has to invent
 * one, and in particular never has to pick a country: creating a fresh
 * `C_Location` requires `country` (`WarehouseLocationHandler#applyGeoLocFields`,
 * and `LocationEditorModal#handleSave` refuses to submit without it), which
 * would mean either hardcoding a country name — the exact class of brittleness
 * ETP-5079 just punished — or blindly taking item 0 of a ~250-row, locale-
 * ordered selector.
 *
 * The reference warehouse is resolved POSITIONALLY-BY-AGE (oldest row that is
 * not the fixture itself), never by name. `DEFAULT_WAREHOUSE_NAME` deliberately
 * is not imported here: the whole ETP-5079 breakage was hardcoded warehouse
 * names going stale, and this helper does not care WHICH warehouse it borrows an
 * address from — only that one exists.
 *
 * ## Idempotency
 * Safe to call repeatedly in the same tenant, and in any order relative to the
 * other `ensure*` helpers. Lookup is by `searchKey` (`M_Warehouse.Value`, which
 * carries a real `(VALUE, AD_CLIENT_ID)` unique constraint), never positional. A
 * run that finds the fixture already created and already binned performs ZERO
 * writes. A run that finds it half-provisioned (warehouse created but the bin
 * POST died) repairs only the missing part.
 *
 * ## Known side effect on the rest of the suite — read before calling this
 * from a NEW spec
 * A warehouse is durable tenant master data: once created it is visible to every
 * spec that later runs against that tenant, not just the one that called this.
 * The consequence worth knowing is that `M_PRODUCT_PRICE_WAREHOUSE_V` — the view
 * behind the document-line product search drawer — joins `m_productprice` to
 * `m_warehouse` on `ad_client_id` alone (a per-client CROSS join), so a second
 * warehouse DOUBLES that view's row count for every priced product.
 * `ProductPriceSelectorPolicy#deduplicateProductItems` collapses those back to
 * one row per product, but only when the selector call carries a `priceList`
 * context param. That is why this helper is wired into exactly one spec: adding
 * it to a spec that picks a product by drawer POSITION could change which row
 * lands at that index.
 */

const SPEC_BASE = '/sws/neo/warehouse';
const WAREHOUSE_ENTITY = 'warehouse';
const STORAGE_BIN_ENTITY = 'storageBin';

/**
 * The deterministic secondary-warehouse fixture.
 *
 * Fixed (never timestamped) key/name so the SAME record is found on every run
 * instead of piling up a new warehouse per run — same rule as
 * `PRODUCT_FIXTURE_ALPHA` in product-helpers.js and `VENDOR_FIXTURE_NAME` in
 * purchase-helpers.js.
 *
 * `E2E-`-prefixed rather than an ERP-style short code (`AG2`) for three reasons:
 * it matches the `E2E-ALPHA` / `E2E-BETA` product fixtures and the cash-close
 * spec's `Caja E2E` account, it makes the row obviously suite-owned (and
 * therefore safe to delete) when a human browses the Warehouse list, and it
 * cannot collide with a future onboarding-dataset value, which uses exactly
 * those short codes. `M_Warehouse` is unique on BOTH `(VALUE, AD_CLIENT_ID)` and
 * `(NAME, AD_CLIENT_ID)`, so the name has to be as collision-proof as the key.
 *
 * The name shares no substring with the seeded `Almacen Principal`, so a loose
 * text locator in some other spec can never match both.
 *
 * `binSearchKey` mirrors the seeded bin's `AG-0-0-0` shape
 * (`<warehouse>-<x>-<y>-<z>`), and `rowX`/`stackY`/`levelZ` are the matching
 * `'0'` strings — `M_Locator.X/Y/Z` are VARCHAR, not numbers.
 */
export const SECONDARY_WAREHOUSE_FIXTURE = {
  searchKey: 'E2E-WH2',
  name: 'E2E Warehouse Secondary',
  binSearchKey: 'E2E-WH2-0-0-0',
};

async function getAuthHeaders(page) {
  const token = await page.evaluate(() => localStorage.getItem('sf_auth_token'));
  if (!token) {
    throw new Error(
      'ensureSecondaryWarehouse could not find an auth token in localStorage["sf_auth_token"] — '
      + 'call login(page) before ensureSecondaryWarehouse(page).',
    );
  }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** NEO wraps CRUD create/read responses in `{ response: { data: [...] } }`. */
function extractRows(json) {
  const rows = json?.response?.data;
  return Array.isArray(rows) ? rows : [];
}

/**
 * Reads an FK value off a NEO row as a plain id string. DefaultJsonDataService
 * emits foreign keys as the bare id (plus a sibling `<field>$_identifier`), but
 * accept the object form too rather than silently producing `[object Object]`
 * as a warehouse's address id.
 */
function toId(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
}

/**
 * GETs warehouse rows, oldest-first, so that whenever more than one row comes
 * back the FIRST one is the same one across runs.
 *
 * `useCriteria: true` sends the exact-match AdvancedCriteria filter the
 * ListView's own filter bar sends (`buildBackendFilter()` in
 * tools/app-shell/src/lib/gridQuery.js, merged by `mergeFilterCriteria()` in
 * useEntity.js). `useCriteria: false` fetches an unfiltered bounded page — see
 * `findWarehouseFixture()` for why that second mode exists, and
 * `resolveReferenceLocationId()` for the other caller that needs it.
 */
async function queryWarehouses(page, { headers, searchKey = null }) {
  const params = { _sortBy: 'creationDate', _startRow: '0', _endRow: '500' };
  if (searchKey) {
    params.criteria = JSON.stringify({
      _constructor: 'AdvancedCriteria',
      operator: 'and',
      criteria: [{ fieldName: 'searchKey', operator: 'equals', value: searchKey }],
    });
  }
  const res = await page.request.get(`${SPEC_BASE}/${WAREHOUSE_ENTITY}`, { params, headers });
  if (!res.ok()) {
    throw new Error(
      `ensureSecondaryWarehouse: warehouse lookup failed (${res.status()}): ${await res.text()}`,
    );
  }
  return extractRows(await res.json());
}

/**
 * Picks the deterministic fixture out of one or more candidates (already sorted
 * oldest-first) and warns if there was more than one. `M_Warehouse.Value` is
 * unique per client so a same-tenant duplicate should be impossible, but
 * silently picking whichever row the backend felt like returning would let the
 * suite ping-pong between homonyms across runs instead of surfacing it.
 */
function pickDeterministicFixture(candidates, searchKey) {
  if (candidates.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureSecondaryWarehouse] Found ${candidates.length} warehouses with searchKey "${searchKey}" `
      + `in this tenant (ids: ${candidates.map((c) => c.id).join(', ')}). Using the oldest one `
      + `(${candidates[0].id}) deterministically — the tenant likely needs a manual data cleanup.`,
    );
  }
  return candidates[0];
}

/**
 * Read-only lookup of the warehouse fixture.
 *
 * A zero-row result from the filtered query is re-verified against an
 * unfiltered (bounded) page before it is trusted enough to justify a create —
 * the same guard `findVendorFixture()` grew after a broken/ignored filter
 * silently produced a duplicate contact, and `findProductFixture()` copied. The
 * create path has no other way to tell "the criteria query is broken" apart from
 * "this really is the first run", and here the mistake would be worse than a
 * duplicate: `M_Warehouse` is unique on both Value AND Name per client, so the
 * create would just fail with a raw constraint violation.
 */
async function findWarehouseFixture(page, { searchKey, headers }) {
  const filtered = (await queryWarehouses(page, { headers, searchKey }))
    // Filter client-side too: a backend that silently ignored an unsupported
    // `criteria` param would otherwise hand back the whole page and the first
    // unrelated warehouse would be mistaken for the fixture.
    .filter((row) => row?.searchKey === searchKey);
  if (filtered.length > 0) {
    return pickDeterministicFixture(filtered, searchKey);
  }

  const unfiltered = (await queryWarehouses(page, { headers }))
    .filter((row) => row?.searchKey === searchKey);
  if (unfiltered.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureSecondaryWarehouse] The criteria-filtered lookup for searchKey "${searchKey}" returned 0 rows, `
      + `but an unfiltered scan found ${unfiltered.length} match(es) — the "searchKey equals" filter may `
      + 'be misbehaving for this entity/backend version. Using the unfiltered match instead of creating a duplicate.',
    );
    return pickDeterministicFixture(unfiltered, searchKey);
  }

  return null;
}

/**
 * Resolves the `C_Location` id to file the fixture warehouse under, by borrowing
 * it from the oldest warehouse that is NOT the fixture — see this file's header
 * for why an address is reused rather than created.
 *
 * Deliberately name-agnostic: it does not look for `Almacen Principal`, only for
 * "some other warehouse that already has an address".
 */
async function resolveReferenceLocationId(page, { fixtureSearchKey, headers }) {
  const rows = await queryWarehouses(page, { headers });
  const reference = rows.find(
    (row) => row?.searchKey !== fixtureSearchKey && toId(row?.locationAddress),
  );
  if (!reference) {
    throw new Error(
      'ensureSecondaryWarehouse: the tenant has no existing warehouse carrying an address to borrow '
      + `(scanned ${rows.length} row(s) via GET /${WAREHOUSE_ENTITY}). M_Warehouse.C_Location_ID is NOT NULL, `
      + 'so a warehouse cannot be created without one. A tenant with zero warehouses is a data-setup gap '
      + 'this helper will not paper over by inventing an address (which would mean guessing a country).',
    );
  }
  return toId(reference.locationAddress);
}

/**
 * Creates the fixture warehouse.
 *
 * Only the four fields `ETGO_SF_FIELD` marks `IsIncluded=Y, IsReadOnly=N` for
 * this entity are sent (`searchKey`, `name`, `description`, `locationAddress`),
 * plus `active` — which `NeoFieldFilter#forEntity` grants explicitly alongside
 * `id` and the link-to-parent columns. Anything else (`organization`,
 * `storageBinSeparator`, `allocated`, …) is `IsIncluded=N` and would be silently
 * DROPPED by `filterCreateRequest`, so it is not sent at all: those come from
 * the AD-default injection pass described in this file's header.
 */
async function createWarehouseFixture(page, { fixture, locationAddressId, headers }) {
  const res = await page.request.post(`${SPEC_BASE}/${WAREHOUSE_ENTITY}`, {
    headers,
    data: {
      searchKey: fixture.searchKey,
      name: fixture.name,
      description: 'E2E integration fixture — safe to delete when no suite is running.',
      locationAddress: locationAddressId,
      active: true,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `ensureSecondaryWarehouse: warehouse create failed for "${fixture.name}" (${res.status()}): ${await res.text()}`,
    );
  }
  const record = extractRows(await res.json())[0];
  if (!record?.id) {
    throw new Error(`ensureSecondaryWarehouse: warehouse create response had no id: ${JSON.stringify(record)}`);
  }
  return record;
}

/** Storage bins currently attached to the warehouse. */
async function fetchStorageBins(page, { warehouseId, headers }) {
  const res = await page.request.get(`${SPEC_BASE}/${STORAGE_BIN_ENTITY}`, {
    params: { parentId: warehouseId, _startRow: '0', _endRow: '200' },
    headers,
  });
  if (!res.ok()) {
    throw new Error(
      `ensureSecondaryWarehouse: storage bin lookup failed (${res.status()}): ${await res.text()}`,
    );
  }
  return extractRows(await res.json());
}

/**
 * Creates the warehouse's single default storage bin, if it has none.
 *
 * A warehouse with no `M_Locator` can never hold stock, so this is part of
 * "provisioned", not an optional extra — the check is "has ANY bin", not "has
 * THIS bin", because any bin at all makes the warehouse usable and re-creating
 * one next to a human-made bin would be a surprise.
 *
 * `default: true` because this is the warehouse's only bin and every warehouse
 * needs a default locator (the seeded `AG-0-0-0` is `AG`'s). It is sent
 * explicitly rather than left to the defaults pass: `M_Locator.IsDefault` is
 * mandatory but has NO AD column default, so nothing would fill it in.
 *
 * `parentLocatorID` is deliberately NEVER sent. It is `IsIncluded=Y,
 * IsReadOnly=Y` with no AD default on an entity with no `Java_Qualifier`, which
 * puts it in `NeoFieldFilter#rejectableOnCreateFields` — sending it would earn a
 * structured 422 (IMP-28 clause 2). Leaving it null is also what the
 * `M_LOCATOR_VIRTUAL_EMPTY_CHECK` constraint requires for a non-virtual bin.
 */
async function ensureStorageBin(page, { warehouseId, fixture, headers }) {
  const existing = await fetchStorageBins(page, { warehouseId, headers });
  if (existing.length > 0) {
    return { created: false, id: existing[0]?.id ?? null };
  }

  const res = await page.request.post(`${SPEC_BASE}/${STORAGE_BIN_ENTITY}`, {
    headers,
    data: {
      parentId: warehouseId,
      searchKey: fixture.binSearchKey,
      rowX: '0',
      stackY: '0',
      levelZ: '0',
      relativePriority: 50,
      default: true,
      active: true,
    },
  });
  if (!res.ok()) {
    throw new Error(
      `ensureSecondaryWarehouse: storage bin create failed for "${fixture.binSearchKey}" `
      + `on warehouse ${warehouseId} (${res.status()}): ${await res.text()}`,
    );
  }
  const record = extractRows(await res.json())[0];
  if (!record?.id) {
    throw new Error(`ensureSecondaryWarehouse: storage bin create response had no id: ${JSON.stringify(record)}`);
  }
  return { created: true, id: record.id };
}

/**
 * Ensure the tenant exposes a SECOND, deterministically-named warehouse with a
 * usable default storage bin — find-or-create/repair, never "whatever warehouse
 * happens to sit at index N of the selector".
 *
 * Exists so the ETP-4772 backend regression guard in
 * `purchase-order-full-flow.integration.spec.js` has something other than the
 * business-partner-derived default to pick. See this file's header for the full
 * rationale, for what the backend fills in on its own, and for the
 * `M_PRODUCT_PRICE_WAREHOUSE_V` side effect that is the reason this is wired
 * into exactly one spec.
 *
 * @param {import('@playwright/test').Page} page - Must already be logged in
 *   (`login(page)`), so the bearer token is in localStorage.
 * @param {object} [fixture=SECONDARY_WAREHOUSE_FIXTURE] - `{ searchKey, name, binSearchKey }`.
 * @returns {Promise<{id: string, name: string, searchKey: string, created: boolean,
 *   binId: string|null, binCreated: boolean}>}
 */
export async function ensureSecondaryWarehouse(page, fixture = SECONDARY_WAREHOUSE_FIXTURE) {
  if (!fixture?.searchKey || !fixture?.name || !fixture?.binSearchKey) {
    throw new Error('ensureSecondaryWarehouse requires a fixture with a searchKey, a name and a binSearchKey.');
  }

  const headers = await getAuthHeaders(page);

  let record = await findWarehouseFixture(page, { searchKey: fixture.searchKey, headers });
  const created = !record;
  if (!record) {
    const locationAddressId = await resolveReferenceLocationId(page, {
      fixtureSearchKey: fixture.searchKey, headers,
    });
    record = await createWarehouseFixture(page, { fixture, locationAddressId, headers });
  }

  const bin = await ensureStorageBin(page, { warehouseId: record.id, fixture, headers });

  return {
    id: record.id,
    // Read the name/key back off the record rather than echoing the descriptor:
    // on the "already existed" path the persisted values are what the Warehouse
    // list and any `field-warehouse-chip` will actually render.
    name: record.name ?? fixture.name,
    searchKey: record.searchKey ?? fixture.searchKey,
    created,
    binId: bin.id,
    binCreated: bin.created,
  };
}
