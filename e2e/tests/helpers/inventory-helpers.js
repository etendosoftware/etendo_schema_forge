/**
 * Shared helper for live-backend integration specs that need a guaranteed
 * on-hand stock level for a specific product/warehouse BEFORE confirming a
 * document that will consume or reverse stock (e.g. a negative-quantity PO
 * line, which inverts the normal stock-movement direction once the PO is
 * confirmed into a Goods Receipt).
 *
 * Why this exists (ETP-4567 follow-up): purchase-order-full-flow.integration
 * .spec.js and sales-quotation-full-flow.integration.spec.js each add a
 * negative-quantity line by POSITIONAL INDEX in the product search drawer
 * (`productIndex: 1`) to exercise the negative-sign propagation fix. When the
 * resulting document is later confirmed (PO -> Receipt, Order -> Shipment),
 * Etendo's core M_CHECK_STOCK validation correctly rejects the confirm if the
 * actual on-hand stock for whatever product landed at that index is too low —
 * which happened for real on 2026-08-17 ("Cerveza", then "Queso Sardo" in
 * warehouse "Almacen GO" / locator "AG-0-0-0"), because repeated suite runs
 * kept draining it. The one-off fix that day was a raw
 * `UPDATE m_storage_detail SET qtyonhand = ...` — unaudited, no M_Transaction,
 * bypasses Etendo's own stock-tracking, and explicitly NOT to be repeated.
 *
 * The real fix: Etendo's own Physical Inventory ("Conteo físico") window is
 * the legitimate, audited mechanism for setting on-hand quantity for a
 * product at a locator — confirming a Physical Inventory document generates
 * the correct M_Transaction history, unlike a raw SQL write.
 *
 * ## API-only implementation (v2 — replaces the original UI-driven version)
 * The first version of this helper drove the real Physical Inventory UI
 * (navigate, click "New", fill the Warehouse field, open the product search
 * drawer, type into `inline-add-field-quantityCount`, click "confirm"...).
 * It guessed a `field-warehouse` testid that does not exist and cost hours
 * to debug. Physical Inventory line creation is a PLAIN NEO CRUD POST under
 * the hood — no UI automation is needed at all. This version talks to the
 * NEO Headless API directly via `page.request` (Playwright's
 * APIRequestContext, which shares the browser context's session/cookies —
 * no separate auth is needed beyond the bearer token already in
 * `localStorage`).
 *
 * Endpoints used (spec `physical-inventory`, confirmed live against a real
 * backend — see `docs/e2e-testing-guide.md` and the Java sources below for
 * how each was derived):
 *   - `GET  /sws/neo/physical-inventory/inventory/selectors/warehouse?q=...`
 *   - `GET  /sws/neo/physical-inventory/inventoryLine/selectors/product?q=...`
 *   - `POST /sws/neo/physical-inventory/inventory`                  (header create)
 *   - `POST /sws/neo/physical-inventory/inventoryLine`              (line create)
 *   - `PATCH /sws/neo/physical-inventory/inventoryLine/{id}`        (set quantityCount)
 *   - `POST /sws/neo/physical-inventory/inventory/{id}/action/processNow` (confirm)
 *   - `DELETE /sws/neo/physical-inventory/inventory/{id}`           (best-effort cleanup)
 *
 * The `/selectors/{column}` pattern, the `{apiBase}/sws/neo` prefix (proxied
 * by the Vite dev server's `/sws` rule — `tools/app-shell/vite.config.js` —
 * straight to `ETENDO_URL`), and the `POST {apiBaseUrl}/{entity}/{id}/action/{processField}`
 * shape used by every draftMode window's "confirm" button are all read
 * directly from source, not guessed:
 *   - selector URL construction: `buildEntitySelectorUrl()` in
 *     `tools/app-shell/src/components/contract-ui/ProductSearchDrawer.jsx`
 *     (`${apiBaseUrl}/${entity}/selectors/${column}`) and the server-search
 *     fetch in `CreatableSearchSelect.jsx` (`fetchServerOptions` — GET with a
 *     `q` param, response shaped `{ items: [...] }`).
 *   - the generic draftMode confirm call: `handleSaveAndProcess()` in
 *     `tools/app-shell/src/hooks/useEntity.js` — `POST
 *     {apiBaseUrl}/{entity}/{id}/action/{processField}` with body
 *     `{ fieldValues: { [processField]: processValue } }`. Physical
 *     Inventory's `processField`/`processValue` (`processNow`/`"Y"`) come
 *     from `artifacts/physical-inventory/decisions.json` → `window.draftMode`.
 *   - `apiBaseUrl` shape: `App.jsx`'s `API_BASE_URL` (`${apiBase}/sws/neo`,
 *     `apiBase` empty at the dev-server root) plus `WindowLoader.jsx`
 *     appending `/${windowName}` — i.e. `/sws/neo/physical-inventory`.
 *   - the bearer token lives in `localStorage['sf_auth_token']` in BOTH mock
 *     mode (`e2e/tests/helpers/auth.js`) and real mode (session.js's
 *     `sf_auth` prefix + `token` key in `@etendosoftware/app-shell-core`),
 *     so `page.evaluate(() => localStorage.getItem('sf_auth_token'))` after
 *     `login(page)` always yields a usable token — no separate login call.
 *   - `parentId`/`product`/`storageBin`/`bookQuantity` field names on
 *     `inventoryLine`, and the fact that `InventoryLineHandler.handlePostPreHook`
 *     (com.etendoerp.go's `InventoryLineHandler.java`) computes `bookQuantity`
 *     via `queryProductStock()` on EVERY plain POST create (not just UI
 *     callouts): `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/InventoryLineHandler.java`.
 *
 * ## Two data quirks discovered live (worked around here, NOT source bugs
 * this helper is meant to fix — see CLAUDE.md "Generated Files Policy" /
 * source-of-truth rules; these are pre-existing backend defaulting gaps that
 * only bite a *raw* CRUD POST, since the real UI always supplies these values
 * itself via user input + earlier defaults):
 *   1. `POST inventory` (header) with no explicit `movementDate` silently
 *      defaults to a nonsensical date (observed: year "0023"), which then
 *      makes the confirm action fail with "The Period does not exist or it
 *      is not opened" (no `c_periodcontrol` row covers year 23). Fixed here
 *      by always sending today's date explicitly as `movementDate`.
 *   2. `POST inventoryLine` with no explicit `uOM` silently defaults to an
 *      unrelated UOM (observed: "Centimeter"), which makes the confirm
 *      action fail at the DB trigger level ("Unit of Measure mismatch
 *      (product/transaction)"). Fixed here by reading the product's real
 *      UOM id off the `/selectors/product` response's `_aux._UOM` field
 *      (present on every row — global or warehouse-scoped) and sending it
 *      explicitly as `uOM` on line create.
 *
 * ## How the on-hand read works
 * `InventoryLineHandler.handlePostPreHook` resolves the header's default
 * warehouse locator and computes `bookQuantity` via `queryProductStock()`
 * (a live `SUM(m_storage_detail.qtyonhand)` scoped to that warehouse) on
 * EVERY plain POST create of a line — not just UI callouts. So creating a
 * line with `quantityCount` omitted (defaults to 0) and reading
 * `bookQuantity` straight back from the create response IS the current
 * real on-hand for that product+warehouse. No separate stock-report query
 * needed.
 *
 * Physical Inventory counts are always an ABSOLUTE counted value, never a
 * delta — `quantityCount` is set to `minQty` directly, not added to
 * `bookQuantity`.
 *
 * ## Cleanup
 * When on-hand is already sufficient, no document needs to exist at all —
 * the scaffolding header (created to read `bookQuantity`) is deleted via a
 * plain `DELETE` (verified live: deleting a header with an unprocessed line
 * attached succeeds and removes both in one call — no separate line delete
 * needed). Best-effort: a leftover empty, unprocessed draft is harmless (no
 * stock impact), so a delete failure here must not fail the caller's actual
 * stock-provisioning need. The same best-effort delete also fires if
 * anything fails BEFORE the confirm call succeeds (e.g. the line create or
 * patch step throws) — but never after a successful confirm, since the
 * document is processed by then and deleting it would reverse the very
 * stock movement the caller asked for.
 */

const SPEC = 'physical-inventory';
const HEADER_ENTITY = 'inventory';
const LINE_ENTITY = 'inventoryLine';
const PROCESS_FIELD = 'processNow';
const PROCESS_VALUE = 'Y';

function specBase() {
  return `/sws/neo/${SPEC}`;
}

function normalize(value) {
  return (value ?? '').toString().trim().toLowerCase();
}

async function getAuthHeaders(page) {
  const token = await page.evaluate(() => localStorage.getItem('sf_auth_token'));
  if (!token) {
    throw new Error(
      'ensureStockOnHand could not find an auth token in localStorage["sf_auth_token"] — '
      + 'call login(page) before ensureStockOnHand(page, ...).',
    );
  }
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** Extracts the single record object NEO wraps CRUD create/update responses in
 * ({ response: { data: [record] } }) — never the bare top-level id/data shape. */
function extractRecord(json) {
  return json?.response?.data?.[0] ?? null;
}

async function fetchSelectorItems(page, { entity, column, query, headers }) {
  const res = await page.request.get(`${specBase()}/${entity}/selectors/${column}`, {
    params: { q: query },
    headers,
  });
  if (!res.ok()) {
    throw new Error(
      `ensureStockOnHand: selector fetch failed for ${entity}/selectors/${column}?q=${query} `
      + `(${res.status()}): ${await res.text()}`,
    );
  }
  const body = await res.json();
  return body.items ?? [];
}

/**
 * Resolves the AD_Warehouse id for `warehouseName` via the header entity's
 * generic `/selectors/warehouse` endpoint. Matched by exact (trimmed,
 * case-insensitive) label — never positionally.
 */
async function resolveWarehouseId(page, { warehouseName, headers }) {
  const items = await fetchSelectorItems(page, {
    entity: HEADER_ENTITY, column: 'warehouse', query: warehouseName, headers,
  });
  const match = items.find((i) => normalize(i.label ?? i.name) === normalize(warehouseName));
  if (!match) {
    throw new Error(
      `ensureStockOnHand: warehouse "${warehouseName}" not found via `
      + `/${HEADER_ENTITY}/selectors/warehouse (got: ${items.map((i) => i.label).join(', ') || 'no results'}).`,
    );
  }
  return match.id;
}

/**
 * Resolves the M_Product id (and its real UOM id, needed to work around the
 * "silently defaults to the wrong UOM" quirk documented above) for
 * `productName` via the line entity's `/selectors/product` endpoint. Matched
 * BY NAME — never by positional index, which is the whole reason this helper
 * exists (the caller reads the name back from the actual line it added).
 * Prefers a row already scoped to `warehouseName` (present when the product
 * has existing stock there) but falls back to any row matching the name,
 * since a never-stocked product only returns the unscoped (global) row.
 */
async function resolveProduct(page, { productName, warehouseName, headers }) {
  const items = await fetchSelectorItems(page, {
    entity: LINE_ENTITY, column: 'product', query: productName, headers,
  });
  const byNameAndWarehouse = items.find(
    (i) => normalize(i.name ?? i.label) === normalize(productName) && normalize(i.warehouse) === normalize(warehouseName),
  );
  const byNameOnly = items.find((i) => normalize(i.name ?? i.label) === normalize(productName));
  const match = byNameAndWarehouse ?? byNameOnly;
  if (!match) {
    throw new Error(
      `ensureStockOnHand: product "${productName}" not found via `
      + `/${LINE_ENTITY}/selectors/product (got: ${items.map((i) => i.name).join(', ') || 'no results'}).`,
    );
  }
  return { productId: match.id, uomId: match._aux?._UOM ?? null };
}

/** Best-effort delete of the scaffolding/failed-provisioning header. Never
 * throws — see the file-level doc comment's Cleanup section. */
async function deleteHeaderBestEffort(page, { headerId, headers }) {
  if (!headerId) return;
  try {
    const res = await page.request.delete(`${specBase()}/${HEADER_ENTITY}/${headerId}`, { headers });
    if (!res.ok()) {
      // eslint-disable-next-line no-console
      console.warn(`[inventory-helpers] Best-effort delete of Physical Inventory header ${headerId} returned ${res.status()} (non-fatal).`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[inventory-helpers] Best-effort delete of Physical Inventory header ${headerId} failed (non-fatal): ${err.message}`);
  }
}

/**
 * Ensures at least `minQty` units of `productName` are on hand at
 * `warehouseName`, provisioning the gap (if any) through a real, audited
 * Physical Inventory count — never a raw SQL/DB write. Talks to the NEO
 * Headless API directly via `page.request` (no UI navigation/clicks).
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {string} opts.productName - Exact product name/identifier to match
 *   in the product selector (read back from the caller's own line row,
 *   e.g. via a `data-cell-key="product"` cell — never guessed).
 * @param {string} opts.warehouseName - Warehouse to count at (e.g. "Almacen GO").
 * @param {number} opts.minQty - Minimum units that must be on hand afterward.
 * @returns {Promise<{adjusted: boolean, previousOnHand: number, newOnHand?: number}>}
 */
export async function ensureStockOnHand(page, { productName, warehouseName, minQty }) {
  if (!productName) {
    throw new Error('ensureStockOnHand requires a non-empty productName (read it back from the actual line that was added).');
  }
  if (!warehouseName) {
    throw new Error('ensureStockOnHand requires a warehouseName.');
  }
  if (!(minQty > 0)) {
    throw new Error('ensureStockOnHand requires a positive minQty.');
  }

  const headers = await getAuthHeaders(page);

  const warehouseId = await resolveWarehouseId(page, { warehouseName, headers });
  const { productId, uomId } = await resolveProduct(page, { productName, warehouseName, headers });

  // ─── Create a scaffolding Physical Inventory header ───────────────────────
  // movementDate must be sent explicitly — see the file-level "data quirks" note.
  const movementDate = new Date().toISOString().slice(0, 10);
  const headerRes = await page.request.post(`${specBase()}/${HEADER_ENTITY}`, {
    headers,
    data: { warehouse: warehouseId, name: `E2E stock provisioning - ${productName}`, movementDate },
  });
  if (!headerRes.ok()) {
    throw new Error(`ensureStockOnHand: header create failed (${headerRes.status()}): ${await headerRes.text()}`);
  }
  const headerRecord = extractRecord(await headerRes.json());
  const headerId = headerRecord?.id;
  if (!headerId) {
    throw new Error(`ensureStockOnHand: header create response had no id: ${JSON.stringify(headerRecord)}`);
  }

  try {
    // ─── Create the line WITHOUT quantityCount — bookQuantity in the ────────
    // response is the current real on-hand (see file-level doc comment).
    const lineData = { parentId: headerId, product: productId };
    if (uomId) lineData.uOM = uomId; // see "data quirks" note — works around the wrong-UOM default

    const lineRes = await page.request.post(`${specBase()}/${LINE_ENTITY}`, { headers, data: lineData });
    if (!lineRes.ok()) {
      throw new Error(`ensureStockOnHand: line create failed (${lineRes.status()}): ${await lineRes.text()}`);
    }
    const lineRecord = extractRecord(await lineRes.json());
    const lineId = lineRecord?.id;
    const currentOnHand = Number(lineRecord?.bookQuantity ?? 0);

    if (currentOnHand >= minQty) {
      await deleteHeaderBestEffort(page, { headerId, headers });
      return { adjusted: false, previousOnHand: currentOnHand };
    }

    // ─── Not enough stock — count it up to minQty (absolute, never a delta) ─
    // `updated` is MANDATORY on every write since ETP-5073: NEO refuses an update that does not
    // carry the record version it was read with (400 `missing_updated`) rather than letting it
    // silently overwrite a concurrent edit. The create response already carries the version, so
    // no extra round-trip is needed; the GET is the fallback for a backend that omits it there.
    let lineUpdated = lineRecord?.updated;
    if (!lineUpdated) {
      const rereadRes = await page.request.get(`${specBase()}/${LINE_ENTITY}/${lineId}`, { headers });
      lineUpdated = extractRecord(await rereadRes.json())?.updated;
    }
    if (!lineUpdated) {
      throw new Error('ensureStockOnHand: could not resolve the line `updated` version required by NEO');
    }

    const patchRes = await page.request.patch(`${specBase()}/${LINE_ENTITY}/${lineId}`, {
      headers,
      data: { quantityCount: minQty, updated: lineUpdated },
    });
    if (!patchRes.ok()) {
      throw new Error(`ensureStockOnHand: line patch (quantityCount) failed (${patchRes.status()}): ${await patchRes.text()}`);
    }

    // ─── Confirm/process the header — turns the count into a real, audited ──
    // M_Transaction stock movement. Physical Inventory uses the same generic
    // draftMode "confirm" action (processField processNow, processValue Y)
    // as every other document window in this app (useEntity.js's
    // handleSaveAndProcess).
    const confirmRes = await page.request.post(`${specBase()}/${HEADER_ENTITY}/${headerId}/action/${PROCESS_FIELD}`, {
      headers,
      data: { fieldValues: { [PROCESS_FIELD]: PROCESS_VALUE } },
    });
    if (!confirmRes.ok()) {
      throw new Error(`ensureStockOnHand: confirm (processNow) failed (${confirmRes.status()}): ${await confirmRes.text()}`);
    }

    return { adjusted: true, previousOnHand: currentOnHand, newOnHand: minQty };
  } catch (err) {
    // Only reached before a successful confirm — safe to discard the scaffolding draft.
    await deleteHeaderBestEffort(page, { headerId, headers });
    throw err;
  }
}
