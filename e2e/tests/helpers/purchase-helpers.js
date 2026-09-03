/**
 * Shared helpers for Purchase Order integration E2E tests.
 *
 * Centralizes credential loading, page-wait utilities, save-response
 * listeners, and common interaction patterns (vendor setup, PO creation,
 * line addition) so individual spec files stay focused on their flow.
 */
import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Credentials ──────────────────────────────────────────────────────────────

export function loadCredentials() {
  try {
    const credPath = resolve(import.meta.dirname, '../../.auth-credentials.json');
    const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
    if (creds.email && creds.password) return creds;
  } catch { /* file doesn't exist */ }
  return null;
}

// ── Page-wait utilities ──────────────────────────────────────────────────────

const SLOW_MS = Number(process.env.E2E_SLOW_MS || 0);

export async function slow(page) {
  if (SLOW_MS > 0) await page.waitForTimeout(SLOW_MS);
}

/**
 * Wait for the detail view to be visible and any loading spinner to disappear.
 */
export async function waitForDetailReady(page) {
  await expect(page.getByTestId('detail-view'),
    'Detail view should be visible — page may not have loaded correctly',
  ).toBeVisible({ timeout: 20_000 });
  // Wait for any loading indicator to disappear (covers late-appearing spinners)
  await expect(page.getByText(/cargando|loading/i)).toBeHidden({ timeout: 15_000 })
    .catch(() => {}); // OK if spinner never appeared
}

/**
 * Register a listener for a successful save/create/update API response.
 * MUST be called BEFORE the action that triggers the request.
 */
export function expectSaveResponse(page) {
  return page.waitForResponse(
    (resp) =>
      resp.url().includes('/sws/neo/') &&
      ['POST', 'PUT', 'PATCH'].includes(resp.request().method()) &&
      resp.status() < 400,
    { timeout: 20_000 },
  );
}

/**
 * Wait for any in-flight navigation to settle, then safely reload.
 * Avoids ERR_ABORTED by catching reload failures (e.g. SPA redirect in progress).
 */
export async function safeReload(page) {
  // Use goto on current URL instead of reload to avoid ERR_ABORTED
  // when the confirm process triggers internal navigation
  const currentUrl = page.url();
  await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
}

/**
 * Dismiss the "Cerrar" success modal if it appears after a confirmation action.
 * Waits for the page to settle after dismissal.
 */
export async function dismissSuccessModal(page) {
  const closeBtn = page.getByRole('button', { name: /^(Cerrar|Close)$/ });
  await expect(closeBtn).toBeVisible({ timeout: 30_000 });
  await closeBtn.click();
  await slow(page);
}

/**
 * Wait for a NEO API POST response to complete after a confirmation action.
 */
export async function waitForConfirmResponse(page) {
  await page.waitForResponse(
    (resp) =>
      resp.url().includes('/sws/neo/') &&
      ['POST', 'PUT', 'PATCH'].includes(resp.request().method()) &&
      resp.status() < 400,
    { timeout: 30_000 },
  );
}

/**
 * Wait for the documentAction confirmation request itself, scoped to a specific
 * entity path — precise alternative to the generic waitForConfirmResponse() above,
 * which resolves on ANY successful NEO write and can race ahead of the actual
 * confirmation request (autosave, background poll, etc. resolving first).
 * Defaults to 'purchase-order' for backward compatibility with existing call sites.
 */
export function waitForDocumentActionResponse(page, entityPath = 'purchase-order') {
  return page.waitForResponse(
    (resp) => resp.url().includes(`/${entityPath}/header/`)
      && resp.url().includes('/action/documentAction')
      && resp.request().method() === 'POST',
    { timeout: 30_000 },
  );
}

/**
 * Wait for the "Líneas N" summary button to show the expected count and
 * REMAIN showing it — guards against a transient reload flash observed right
 * after navigating into a freshly-created document (e.g. via a "Ver
 * factura"/"Ver pedido" result-modal link): a related panel (the
 * "Documentos" related-records panel) can finish its own async load right
 * after the header/lines data first renders, momentarily resetting the
 * detail view back to a loading state (0 lines, totals at 0.00) before the
 * real data repopulates. A single toBeVisible() check on the lines button
 * can pass DURING that in-between flash, so line-row assertions that run
 * immediately after would read stale/reset DOM instead of the settled data.
 *
 * Mirrors the spinner-wait idiom already used by waitForDetailReady() — wait
 * for any lingering "cargando/loading" text to clear — then also waits for
 * the network to go idle (covers the related-panel fetch) and RE-ASSERTS the
 * lines count actually stuck, instead of just increasing a timeout.
 */
export async function waitForLinesSettled(page, count, message) {
  const linesPattern = new RegExp(`l[ií]neas\\s+${count}|lines\\s+${count}`, 'i');
  const linesBtn = page.getByRole('button', { name: linesPattern });

  // Wait out any load-in-progress spinner BEFORE the first count check —
  // otherwise a slow initial load (a fresh navigation, or a reload) eats into
  // the same budget as the count check itself, and the two failures (still
  // loading vs. genuinely wrong count) become indistinguishable in the error.
  await page.getByText(/cargando|loading/i).first()
    .waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});

  await expect(linesBtn,
    message || `Lines count should reach ${count}`,
  ).toBeVisible({ timeout: 30_000 });

  const spinner = page.getByText(/cargando|loading/i);
  await spinner.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  await expect(linesBtn,
    `Lines count should still read ${count} after related panels finish loading (no reload flash)`,
  ).toBeVisible({ timeout: 15_000 });
}

// ── Common interactions ──────────────────────────────────────────────────────

// Fixed (never timestamped) name so ensureVendorSetup is idempotent across runs:
// find the SAME dedicated fixture every time instead of creating a fresh one
// each run or mutating an arbitrary real contact.
export const VENDOR_FIXTURE_NAME = 'E2E Vendor Fixture';
const VENDOR_FIXTURE_ADDRESS_LINE = 'E2E Vendor Fixture Address';
const VENDOR_FIXTURE_CITY = 'E2E City';

/**
 * GETs businessPartner candidates for the vendor fixture, sorted oldest-first
 * (`_sortBy=creationDate`, per `queryParams.sorting` in the Contacts window's
 * own generated api doc — BusinessPartnerPage.jsx), so that whenever more than
 * one row comes back the FIRST one is always the same one across runs. When
 * `useCriteria` is true this is the same exact-match AdvancedCriteria filter
 * the ListView's own filter bar sends (see `buildBackendFilter()` in
 * tools/app-shell/src/lib/gridQuery.js and `mergeFilterCriteria()` in
 * tools/app-shell/src/hooks/useEntity.js); when false it fetches an unfiltered
 * (bounded) page and matches by name client-side — see findVendorFixture()'s
 * doc comment for why that second mode exists.
 */
async function queryVendorFixtureCandidates(page, token, { useCriteria }) {
  const params = { _sortBy: 'creationDate', _startRow: '0', _endRow: '500' };
  if (useCriteria) {
    params.criteria = JSON.stringify({
      _constructor: 'AdvancedCriteria',
      operator: 'and',
      criteria: [{ fieldName: 'name', operator: 'equals', value: VENDOR_FIXTURE_NAME }],
    });
  }
  const res = await page.request.get('/sws/neo/contacts/businessPartner', {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`ensureVendorSetup: fixture lookup failed (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
  const rows = Array.isArray(body?.response?.data) ? body.response.data : [];
  return useCriteria ? rows : rows.filter((row) => row?.name === VENDOR_FIXTURE_NAME);
}

/**
 * Picks the deterministic vendor fixture out of one or more candidates
 * (already sorted oldest-first by the caller) and warns if there was more
 * than one — a same-tenant duplicate should never happen, but silently
 * picking whichever the backend feels like returning would let the suite
 * ping-pong between homonyms across runs instead of surfacing the problem.
 */
function pickDeterministicFixture(candidates) {
  if (candidates.length > 1) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureVendorSetup] Found ${candidates.length} business partners named `
      + `"${VENDOR_FIXTURE_NAME}" in this tenant (ids: ${candidates.map((c) => c.id).join(', ')}). `
      + `Using the oldest one (${candidates[0].id}) deterministically — the tenant likely needs a `
      + 'manual data cleanup to remove the duplicates.',
    );
  }
  return candidates[0];
}

/**
 * Read-only lookup of the vendor fixture business partner via the Contacts
 * window's own `businessPartner` entity. Confirmed live: the endpoint returns
 * the full record — including the `vendor` boolean — in one GET, so the
 * caller can skip all UI navigation entirely on the common "already set up"
 * path.
 *
 * A prior version trusted a zero-row filtered result outright as "does not
 * exist yet", which is what let a genuinely failing/mismatched filter
 * silently trigger `createVendorFixture()` and produce a same-tenant
 * duplicate contact — the create path has no way to tell "the criteria query
 * is broken" apart from "this really is the first run". So a zero-row result
 * from the filtered query is re-verified against an unfiltered (bounded) page
 * of the same entity, matched by name client-side, before it is trusted
 * enough to justify a create. (Investigated the specific incident reported
 * for this fixture: the two `E2E Vendor Fixture` rows found by a raw
 * cross-tenant DB query turned out to belong to two different `AD_Client_ID`s
 * — i.e. two separate onboarding-created tenants, each correctly creating its
 * own fixture once — not a same-tenant lookup miss. No evidence of the
 * `criteria` param itself being broken was found, but the fallback below is
 * cheap insurance against exactly that class of bug regardless.)
 */
async function findVendorFixture(page) {
  const token = await page.evaluate(() => localStorage.getItem('sf_auth_token'));
  if (!token) {
    throw new Error(
      'ensureVendorSetup could not find an auth token in localStorage["sf_auth_token"] — '
      + 'call login(page) before ensureVendorSetup(page, ...).',
    );
  }

  const filtered = await queryVendorFixtureCandidates(page, token, { useCriteria: true });
  if (filtered.length > 0) {
    return pickDeterministicFixture(filtered);
  }

  const unfiltered = await queryVendorFixtureCandidates(page, token, { useCriteria: false });
  if (unfiltered.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureVendorSetup] The criteria-filtered lookup for "${VENDOR_FIXTURE_NAME}" returned 0 rows, `
      + `but an unfiltered scan found ${unfiltered.length} match(es) by name — the "name equals" filter `
      + 'may be misbehaving for this entity/backend version. Using the unfiltered match instead of creating a duplicate.',
    );
    return pickDeterministicFixture(unfiltered);
  }

  return null;
}

/**
 * Ensure the "Clave NIF País Residencia" combobox ends up with a value before
 * saving a new contact — mirrors `ensureTaxIdKeySelected` in
 * contacts-integration.spec.js (same required-field default-race handling;
 * duplicated here rather than imported since that helper is not exported from
 * a spec file).
 */
async function ensureTaxIdKeySelected(page) {
  const taxInput = page.getByTestId('field-oBTIKTaxIDKey');
  const taxChip = page.getByTestId('field-oBTIKTaxIDKey-chip');

  const defaultArrived = await taxChip.waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!defaultArrived) {
    await expect(taxInput).toBeVisible({ timeout: 5_000 });
    await taxInput.click();
    const taxOption = page.locator('[role="option"]').first();
    await expect(taxOption).toBeVisible({ timeout: 5_000 });
    await taxOption.click();
  }
  await expect(taxChip).toBeVisible({ timeout: 10_000 });
}

async function fillVendorFixtureForm(page) {
  const nameInput = page.getByRole('textbox', { name: /razón social/i });
  await expect(nameInput).toBeVisible({ timeout: 5_000 });
  await nameInput.clear();
  await nameInput.fill(VENDOR_FIXTURE_NAME);
  await ensureTaxIdKeySelected(page);
}

/**
 * Create the vendor fixture contact via the /contacts window's own "New"
 * form — the same minimal-required-fields flow (Razón social + Clave NIF
 * default) already exercised by `fillNewContactForm` in
 * contacts-integration.spec.js, including its retry-once-after-reload
 * fallback for the known flaky "sequence not ready on fresh onboarding
 * environments" backend hiccup on first save.
 */
async function createVendorFixture(page) {
  await fillVendorFixtureForm(page);

  const saveBtn = page.getByTestId('action-save').or(page.getByRole('button', { name: /^guardar$|^save$/i }));
  await expect(saveBtn.first()).toBeEnabled({ timeout: 10_000 });
  await saveBtn.first().click();

  const saved = await page.waitForURL(/\/contacts\/(?!new)/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (!saved) {
    await page.reload({ waitUntil: 'networkidle' });
    await waitForDetailReady(page);
    await fillVendorFixtureForm(page);
    const retrySave = page.getByTestId('action-save').or(page.getByRole('button', { name: /^guardar$|^save$/i }));
    await expect(retrySave.first()).toBeEnabled({ timeout: 10_000 });
    await retrySave.first().click();
    await expect(page,
      'ensureVendorSetup: creating the vendor fixture contact failed even after one retry',
    ).not.toHaveURL(/\/contacts\/new/, { timeout: 20_000 });
  }
  await waitForDetailReady(page);
}

/**
 * Ensure the "Proveedor" (isVendor) checkbox on the currently-open contact
 * detail is checked, saving only if it was not already.
 */
async function ensureVendorFlagChecked(page) {
  const financieroTab = page.getByRole('button', { name: /financiero|financial/i });
  await expect(financieroTab).toBeVisible({ timeout: 10_000 });
  await financieroTab.click();
  await page.waitForTimeout(1_000);

  // The "Proveedor" checkbox is rendered by SquareCheckbox (windows/custom/shared/SquareCheckbox.jsx):
  // a visible <span> box + label text, followed by a visually-hidden (`sr-only`) native
  // <input type="checkbox">, all wrapped in a single <label>. The testid lives on the hidden
  // input, so it must be located with an exact `getByTestId` (not a `[data-testid*="vendor"]`
  // substring match, which is ambiguous — it can also match the conditionally-rendered
  // "BlockingToggle__…-vendor" once the vendor section expands). Because the input itself is
  // not visible, click the wrapping <label> instead — that's the native, hit-testable way a
  // browser toggles a checkbox nested inside a label, and avoids relying on `force: true`
  // clicks against a clipped 1px element.
  const vendorInput = page.getByTestId('SquareCheckbox__7f0756-vendor');
  const isChecked = await vendorInput.isChecked().catch(() => false);

  if (!isChecked) {
    const vendorLabel = vendorInput.locator('xpath=ancestor::label[1]');
    await vendorLabel.click();
    await page.waitForTimeout(1_000);

    const saveBtn = page.getByTestId('action-save').or(
      page.getByRole('button', { name: /guardar|save/i }),
    ).first();
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    const savePromise = expectSaveResponse(page);
    await saveBtn.click();
    await savePromise;
    await slow(page);
  }
}

/**
 * Select the first available option of a CreatableSearchSelect-backed combo
 * field (`field-<key>` trigger, `option-<key>-<id>` items — same shape as
 * `selectVendorBP`'s businessPartner picker), but ONLY if the field does not
 * already hold a value (i.e. its `-chip` variant is not showing). Idempotent:
 * safe to call on a fixture that already has the value set from a prior run.
 */
async function ensureComboFieldSelected(page, fieldKey) {
  const chip = page.getByTestId(`field-${fieldKey}-chip`);
  const alreadySet = await chip.isVisible({ timeout: 2_000 }).catch(() => false);
  if (alreadySet) return;

  const trigger = page.getByTestId(`field-${fieldKey}`);
  await expect(trigger, `"${fieldKey}" field should be visible on the vendor fixture`).toBeVisible({ timeout: 10_000 });

  const firstOption = page.locator(`[data-testid^="option-${fieldKey}-"]`).first();
  await expect(async () => {
    await trigger.click({ timeout: 3_000 });
    await expect(firstOption).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 15_000 });

  await firstOption.click();
  await slow(page);
}

/**
 * Ensure the vendor fixture's "Purchase Pricelist" (`purchasePricelist`), "PO
 * Payment Terms" (`pOPaymentTerms`) and "PO Payment Method"
 * (`pOPaymentMethod`) fields — all rendered by VendorForm.jsx under the
 * "Financiero" tab once `vendor` is checked (`displayLogic: record.vendor`)
 * — hold a value.
 *
 * PO Payment Terms/Method are required by
 * `ReturnShipmentUtils.applyBusinessPartnerFinancials` (com.etendoerp.go):
 * generating a purchase rectificative invoice via `createReturnInvoice`
 * throws "Business Partner is missing mandatory PO Payment Terms or PO
 * Payment Method" when either is null on the vendor BP record.
 *
 * Purchase Pricelist is required for a DIFFERENT, non-obvious reason: that
 * same `applyBusinessPartnerFinancials` path only runs when the return has no
 * traceable source invoice (`findSourceInvoice()` returns null — true for
 * this fixture's flow, since the PO is confirmed as receipt-only, no invoice
 * at PO- or receipt-confirm time). In that path it sets
 * `invoice.setCurrency(bp.getPurchasePricelist().getCurrency())` ONLY inside
 * an `if (bp.getPurchasePricelist() != null)` guard — with no pricelist, the
 * invoice's `Currency` column is silently left null, and `OBDal.save()`/
 * `flush()` then fails with a raw (non-`OBException`) constraint-violation
 * exception, which `createReturnInvoice`'s generic catch turns into an opaque
 * "An internal error occurred while creating the return invoice" (HTTP 500)
 * — a much harder failure to diagnose than the explicit payment-terms
 * `OBException` (HTTP 400) above it, since none of the mandatory-field logic
 * ever runs.
 *
 * None of the three were covered by `ensureVendorFlagChecked()` (isVendor +
 * address only).
 *
 * Assumes the caller is already on the vendor fixture's "Financiero" tab
 * (true right after `ensureVendorFlagChecked()`, which leaves that tab
 * active) and that the `vendor` checkbox is checked, so all three fields are
 * already rendered in the DOM. Picks whichever option comes first for each —
 * this fixture only needs a NON-NULL value to satisfy the mandatory checks
 * above, not a specific one.
 */
async function ensureVendorPaymentFieldsSet(page) {
  const fieldKeys = ['purchasePricelist', 'pOPaymentTerms', 'pOPaymentMethod'];
  const chipVisibility = await Promise.all(
    fieldKeys.map((key) => page.getByTestId(`field-${key}-chip`).isVisible({ timeout: 2_000 }).catch(() => false)),
  );
  if (chipVisibility.every(Boolean)) return;

  for (const key of fieldKeys) {
    // eslint-disable-next-line no-await-in-loop -- each selection depends on the previous field's dropdown having closed
    await ensureComboFieldSelected(page, key);
  }

  const saveBtn = page.getByTestId('action-save').or(
    page.getByRole('button', { name: /guardar|save/i }),
  ).first();
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  const savePromise = expectSaveResponse(page);
  await saveBtn.click();
  await savePromise;
  await slow(page);
}

/**
 * Read-only lookup of how many C_BPartner_Location rows the vendor fixture
 * already has, via the same `parentId={id}` child-entity filter the
 * secondaryTabs machinery itself documents (see
 * `queryParams.parentFilter` in artifacts/contacts/generated/web/contacts/
 * BusinessPartnerPage.jsx and LocationEditorModal's own create call,
 * `${apiBase}/locationAddress?parentId=${bpId}`) — not an invented param
 * shape.
 *
 * Deliberately NOT read from the "Direcciones" tab's count badge: that badge
 * is rendered as `count={childCount}` (buildInitialTabs() in
 * detailViewHelpers.jsx) and the DetailView only prints it once the related
 * records have actually finished fetching — `count != null` gates the whole
 * `<span>` (TabStripButton in DetailView.jsx). Sampling the tab's textContent
 * shortly after clicking it races that fetch: while it's still in flight the
 * badge span isn't in the DOM at all, so `(text.match(/(\d+)/) || ['0','0'])`
 * silently falls back to "0" even when the fixture already has an address —
 * this caused ensureVendorAddress() to create a brand-new duplicate address
 * on almost every run instead of reusing the existing one.
 */
async function fetchVendorLocationCount(page, bpId) {
  const token = await page.evaluate(() => localStorage.getItem('sf_auth_token'));
  if (!token) {
    throw new Error(
      'ensureVendorAddress could not find an auth token in localStorage["sf_auth_token"] — '
      + 'call login(page) before ensureVendorSetup(page, ...).',
    );
  }
  const res = await page.request.get('/sws/neo/contacts/locationAddress', {
    params: { parentId: bpId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) {
    throw new Error(`ensureVendorAddress: location lookup failed (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
  return Array.isArray(body?.response?.data) ? body.response.data.length : 0;
}

/**
 * Ensure the vendor fixture business partner has at least one address (a
 * C_BPartner_Location row) — the BP callout that populates `partnerAddress`
 * on Purchase/Sales Order needs a location to auto-select; with zero
 * locations it has nothing to offer and
 * `waitForDerivedFieldValue(page, 'partnerAddress')` times out.
 *
 * On the common "already has one" path this never touches the UI at all —
 * mirrors ensureVendorSetup()'s own vendor-flag lookup. Only opens the
 * "Direcciones" tab and the LocationEditorModal (the exact flow already
 * exercised by contacts-integration.spec.js, PART 5b: Address — create via
 * modal) when the API confirms there are truly zero locations. Assumes the
 * contact detail for `bpId` is already the currently-open page.
 */
async function ensureVendorAddress(page, bpId) {
  const existingCount = await fetchVendorLocationCount(page, bpId);
  if (existingCount > 0) return;

  const addressTab = page.getByTestId('tab-locationAddress')
    .or(page.getByRole('button', { name: /direcci[oó]n|address/i }));
  await expect(addressTab.first(), 'Address tab should be visible on the vendor fixture').toBeVisible({ timeout: 10_000 });
  await addressTab.first().click();
  await slow(page);

  const addAddrBtn = page.getByTestId('action-add-line')
    .or(page.getByRole('button', { name: /a[nñ]adir.*direcci|add.*address|nueva.*direcci/i }));
  await expect(addAddrBtn.first()).toBeVisible({ timeout: 5_000 });
  await addAddrBtn.first().click();

  // Address uses LocationEditorModal ("Dirección") — scope to the modal
  // overlay (inline style position:fixed + z-index:150) since the background
  // grid's "Dirección" column header also matches the text.
  const addressModal = page.locator('div[style*="z-index: 150"]');
  await expect(addressModal.getByText(/^direcci[oó]n$/i).first()).toBeVisible({ timeout: 5_000 });

  const modalInputs = page.locator('.fixed.inset-0 input[type="text"], div[class*="bg-black"] ~ div input[type="text"]');
  const modalInputCount = await modalInputs.count();
  if (modalInputCount >= 4) {
    // Primera línea (1st), Segunda línea (2nd), Código postal (3rd), Ciudad (4th)
    await modalInputs.nth(0).fill(VENDOR_FIXTURE_ADDRESS_LINE);
    await modalInputs.nth(3).fill(VENDOR_FIXTURE_CITY);
  } else {
    const primeraLabel = page.getByText(/primera l[ií]nea/i);
    const firstInput = primeraLabel.locator('xpath=following::input[1]');
    await firstInput.fill(VENDOR_FIXTURE_ADDRESS_LINE);
  }

  // Select País — button opens a search dialog with country list
  const paisButton = page.getByText(/^pa[ií]s$/i).locator('..').locator('button[aria-haspopup="dialog"]');
  await paisButton.click();

  const countrySearch = page.getByPlaceholder(/buscar pa[ií]s/i);
  await expect(countrySearch).toBeVisible({ timeout: 5_000 });
  await countrySearch.fill('spa');

  const countryOption = page.getByRole('button', { name: /^espa[nñ]a$/i })
    .or(page.getByRole('button', { name: /^spain$/i }))
    .or(page.locator('button').filter({ hasText: /^España$/ }))
    .or(page.locator('button').filter({ hasText: /^Spain$/ }));
  await expect(countryOption.first()).toBeVisible({ timeout: 5_000 });
  await countryOption.first().click();

  const modalGuardar = page.getByRole('button', { name: /^guardar$/i }).last();
  const saveAddrP = expectSaveResponse(page);
  await modalGuardar.click();
  await saveAddrP;
  await slow(page);
}

/**
 * Ensure a dedicated, deterministically-named vendor contact exists, has
 * isVendor = true, AND has at least one address — find-or-create/repair,
 * never "whatever the first row happens to be".
 *
 * Replaces the previous `tbody tr`-position-0 approach, which:
 *   - depended on grid ordering and on whatever data a previous run left behind
 *   - could silently resolve to the grid's own empty-state placeholder row
 *     (`data-empty-state`, still a real, visible `<tr>`) when Contacts had 0
 *     records — producing an opaque `tbody tr` visibility timeout instead of a
 *     clear "could not find/create a vendor" error
 *   - mutated an ARBITRARY real business partner's vendor flag every run
 *
 * The vendor-fixture lookup alone reports whether `vendor` is already true,
 * but it does NOT report whether the fixture has any location, so
 * `ensureVendorAddress()` always does its own read-only API check (see its
 * doc comment) — it just never needs the UI to do so on the common path.
 */
export async function ensureVendorSetup(page, { navigateTo }) {
  await navigateTo(page, 'contacts');
  await slow(page);

  const listView = page.getByTestId('list-view');
  await expect(listView, 'Contacts list view should load').toBeVisible({ timeout: 15_000 });

  const existing = await findVendorFixture(page);

  if (existing) {
    await page.goto(`/contacts/${existing.id}`);
  } else {
    const newBtn = page.getByTestId('action-new');
    await expect(newBtn, 'Contacts "New" button should be visible').toBeVisible({ timeout: 10_000 });
    await newBtn.click();
    await expect(page, 'Should navigate to /contacts/new').toHaveURL(/\/contacts\/new/, { timeout: 15_000 });
  }
  await waitForDetailReady(page);

  if (!existing) {
    await createVendorFixture(page);
  }

  // Resolve the fixture's own id (needed by ensureVendorAddress()'s API
  // check) from whichever path we took: the lookup's id when it already
  // existed, or the id the save redirect assigned when creating it fresh.
  const bpId = existing?.id ?? (page.url().match(/\/contacts\/([^/?]+)/) || [])[1];
  if (!bpId) {
    throw new Error(`ensureVendorSetup: could not resolve the vendor fixture's id from URL "${page.url()}"`);
  }

  // Capture the settled detail URL (either the pre-existing fixture's, or the
  // one assigned on create) BEFORE switching tabs, so the address step below
  // can navigate back to a clean "General" tab view.
  const contactUrl = page.url();

  // ensureVendorFlagChecked() checks the checkbox state itself and only saves
  // when it isn't already checked, so calling it unconditionally is safe and
  // idempotent (mirrors ensureVendorAddress()'s own "already has one" guard).
  await ensureVendorFlagChecked(page);

  // Same idempotent "check state, only act if missing" pattern as the vendor
  // flag above — PO Payment Terms/Method are mandatory for createReturnInvoice
  // (see ensureVendorPaymentFieldsSet's doc comment). Still on the
  // "Financiero" tab here, where both fields render once vendor is checked.
  await ensureVendorPaymentFieldsSet(page);

  // ensureVendorFlagChecked() leaves the "Financiero" tab active, but the
  // address tab lives under "General" — reload the detail view fresh
  // (same idiom as contacts-integration.spec.js's PART 5c comment: "sub-tab
  // state may be stale" after switching tabs) instead of assuming a
  // sub-tab-switch UI exists.
  await page.goto(contactUrl);
  await waitForDetailReady(page);

  await ensureVendorAddress(page, bpId);
}

/**
 * Re-pick the currently displayed (or first) option of an EntityForm Select,
 * but ONLY when the field is not already holding a real, valid value.
 *
 * Needed when a callout CLEARS a field's value in the editing state while the
 * shadcn Select keeps displaying the stale label (uncontrolled→controlled):
 * the form looks filled but required-field validation blocks the save. Opening
 * the dropdown and clicking an option commits a real value again.
 */
export async function reselectComboOption(page, fieldKey) {
  const trigger = page.getByTestId(`field-${fieldKey}`);
  if (!await trigger.isVisible({ timeout: 2_000 }).catch(() => false)) return;
  await trigger.click();
  const option = page.getByRole('option').first();
  if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await option.click();
  } else {
    // No options (or not a Select) — close the dropdown and move on.
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(300);
}

/**
 * Locator for the current value of a chip-or-input FK/dependent field.
 *
 * CreatableSearchSelect (and its PartnerAddressPicker/DependentFkField wrappers
 * — see EntityForm.jsx / PartnerAddressPicker.jsx) render EITHER a `-chip`
 * (SelectorChip, `data-testid="field-<key>-chip"`) when a value is selected,
 * OR the plain search `<input data-testid="field-<key>">` otherwise — never
 * both at once. Callers must check whichever one currently exists in the DOM
 * rather than assuming a fixed testid suffix.
 */
export function derivedFieldLocator(page, fieldKey) {
  return page.getByTestId(`field-${fieldKey}-chip`).or(page.getByTestId(`field-${fieldKey}`));
}

/**
 * Wait until a callout/derivation-populated field shows a real value — not the
 * placeholder and not an empty chip/input. Uses an auto-retrying `expect.poll()`
 * instead of a one-shot `textContent()` sample, because fields routed through
 * PartnerAddressPicker (e.g. `partnerAddress`) settle via an ADDITIONAL
 * client-side round trip — CreatableSearchSelect fetches its own selector
 * options and auto-selects the first one — which is separate from (and can
 * resolve later than) the backend callout response that fills fields like
 * `paymentTerms`/`priceList` directly.
 *
 * `derivedFieldLocator()` resolves to EITHER a chip (its value lives in
 * `textContent`) OR a plain `<input>` (its value lives in the `value`
 * attribute, never in `textContent`, which is always `""`) — never both at
 * once. `not.toHaveText()` against the `.or()`-combined locator can therefore
 * never pass on the input shape, no matter how long the field takes to settle.
 * Poll each shape with the accessor that actually holds its value instead.
 */
export async function waitForDerivedFieldValue(page, fieldKey, { timeout = 30_000 } = {}) {
  const field = derivedFieldLocator(page, fieldKey);
  await expect(field).toBeVisible({ timeout });

  const placeholderPattern = /^$|buscar|search|seleccionar|select/i;
  const chip = page.getByTestId(`field-${fieldKey}-chip`);
  const input = page.getByTestId(`field-${fieldKey}`);

  await expect.poll(async () => {
    if (await chip.isVisible().catch(() => false)) {
      return (await chip.textContent().catch(() => null)) ?? '';
    }
    if (await input.isVisible().catch(() => false)) {
      return (await input.inputValue().catch(() => null)) ?? '';
    }
    return ''; // neither shape present yet — treated as "still placeholder"
  }, {
    message: `Field "${fieldKey}" should show a real derived value (not the placeholder)`,
    timeout,
    intervals: [100, 200, 200, 500, 500, 1_000],
  }).not.toMatch(placeholderPattern);

  return field;
}

/**
 * Select a vendor BP in a selector field and wait for callout.
 *
 * By default (no `name`) selects whichever vendor happens to be FIRST in the
 * dropdown — the original behavior, unchanged, since most PO-flow specs only
 * need ANY valid vendor for basic CRUD and don't care which one.
 *
 * Pass `{ name }` to instead type it into the field's server-search input
 * (CreatableSearchSelect `serverSearch` mode — same `?q=` filter the field
 * already supports) and select the matching option — needed by flows that
 * require a SPECIFIC, pre-configured vendor (e.g. the `VENDOR_FIXTURE_NAME`
 * fixture set up by `ensureVendorSetup`, which has PO Payment Terms/Method
 * set — required by `createReturnInvoice` — where "whichever is first" is
 * not good enough).
 */
export async function selectVendorBP(page, { name } = {}) {
  const bpInput = page.getByTestId('field-businessPartner');
  await expect(bpInput).toBeVisible({ timeout: 10_000 });

  // Open the BP dropdown — retry if click doesn't register
  await expect(async () => {
    await bpInput.click({ timeout: 3_000 });
    await expect(page.locator('[data-testid^="option-businessPartner-"]').first())
      .toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 15_000 });

  if (name) {
    await bpInput.fill(name);
    // Debounced server-search fetch — give it time to settle before reading options.
    await page.waitForTimeout(800);
  }

  const bpOption = name
    ? page.locator('[data-testid^="option-businessPartner-"]').filter({ hasText: name }).first()
    : page.locator('[data-testid^="option-businessPartner-"]').filter({ hasNotText: /crear|create/i }).first();
  await expect(bpOption,
    name ? `Vendor option matching "${name}" should appear` : 'At least one vendor option should appear',
  ).toBeVisible({ timeout: 15_000 });
  await bpOption.click();

  // BP selection triggers multiple chained callouts/fetches (price list, payment
  // terms, address). paymentTerms/priceList are filled directly by the backend
  // callout response, but partnerAddress (PartnerAddressPicker) needs an EXTRA
  // client-side round trip (see waitForDerivedFieldValue above) — so waiting on
  // paymentTerms alone does NOT prove partnerAddress has settled too. This gap
  // let a flaky partnerAddress assertion slip through in
  // purchase-order-to-invoice.integration.spec.js (deterministic failure: the
  // address callout hadn't landed yet when the caller sampled its value).
  await waitForDerivedFieldValue(page, 'paymentTerms', { timeout: 30_000 });
  await waitForDerivedFieldValue(page, 'partnerAddress', { timeout: 30_000 });
  await slow(page);
}

/**
 * Save the current document as draft. Tries action-save-draft first, falls back to Guardar.
 * Uses a combined approach: click then wait for networkidle, avoiding response listener
 * race conditions in slow mode.
 */
export async function saveDraft(page) {
  const saveBtn = page.getByTestId('action-save-draft')
    .or(page.getByRole('button', { name: /guardar|save/i }));
  // Wait for the button to be enabled — it stays disabled while BP callouts
  // (price list, payment terms, currency, address) are still propagating.
  await expect(saveBtn.first()).toBeEnabled({ timeout: 15_000 });
  const savePromise = expectSaveResponse(page);
  await saveBtn.first().click();
  await savePromise;
  await slow(page);
}

/**
 * Add a product line using the inline-add row.
 * @param {Object} opts
 * @param {number} [opts.productIndex=0] - Which product to pick from the drawer (0-based)
 * @param {string} [opts.quantity] - Optional quantity to set
 * @param {boolean} [opts.isFirst=false] - True if this is the first line (uses empty-state button)
 */
export async function addProductLine(page, { productIndex = 0, quantity, isFirst = false } = {}) {
  // Click add-line button — retry the whole click→inline-add-row sequence
  if (isFirst) {
    const emptyStateBtn = page.getByTestId('action-add-lines-empty-state')
      .or(page.getByRole('button', { name: /añadir líneas|add lines/i }).first());

    await expect(async () => {
      const addLinesResponse = page.waitForResponse(
        (r) => r.url().includes('/sws/neo/') && r.status() < 400,
        { timeout: 15_000 },
      );
      await emptyStateBtn.click({ timeout: 3_000 });
      await addLinesResponse;
      await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  } else {
    const addLineBtn = page.getByRole('button', { name: /añadir línea|add line/i });
    await expect(async () => {
      await addLineBtn.click({ timeout: 3_000 });
      await expect(page.getByTestId('inline-add-row')).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
  }
  await slow(page);

  // Click product field WITHIN the inline-add-row — opens ProductSearchDrawer
  // Scope to inline-add-row to avoid clicking the product field of an already-saved line
  const inlineRow = page.getByTestId('inline-add-row');
  const productField = inlineRow.getByTestId('inline-add-field-product');
  const searchDrawer = page.getByTestId('product-search-drawer');

  await expect(async () => {
    await productField.click({ timeout: 3_000 });
    await expect(searchDrawer).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 20_000 });
  await slow(page);

  // Select the product by index — fall back to first if nth doesn't exist.
  // Retry the whole click sequence if the element detaches from the DOM mid-click
  // (the ProductSearchDrawer re-renders its entire list when waterfall/pagination
  // fetches complete, which can replace the <button> between locator resolution
  // and the actual pointer event — see ETP-4567 QA flaky-test investigation).
  const allProducts = page.locator('[data-testid^="product-search-option-"]');
  // Two different async events, not one: the drawer opening (checked above) and
  // its product list finishing its OWN fetch. 20s covered the drawer; under a
  // slower environment the list can still be mid-fetch when that budget was
  // built, so this needs its own separate wait rather than sharing the first.
  await expect(allProducts.first()).toBeVisible({ timeout: 30_000 });

  let productCalloutResponse;
  await expect(async () => {
    const count = await allProducts.count();
    const product = allProducts.nth(Math.min(productIndex, count - 1));

    // Start listening for callout (price/tax fill) BEFORE clicking the product
    productCalloutResponse = page.waitForResponse(
      (resp) => resp.url().includes('/sws/neo/') && resp.status() < 400,
      { timeout: 30_000 },
    );
    await product.click({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  await expect(searchDrawer).toBeHidden({ timeout: 10_000 }).catch(() => {});
  await productCalloutResponse;
  await slow(page);

  if (quantity) {
    const qtyField = page.getByTestId('inline-add-field-orderedQuantity');
    if (await qtyField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await qtyField.clear();
      await qtyField.fill(quantity);
    }
  }

  // Submit the line — declare response listener BEFORE pressing Enter
  const linePromise = expectSaveResponse(page);
  await page.keyboard.press('Enter');
  await linePromise;
  await slow(page);

  // Verify the line was saved: the inline-add-row must disappear (or be
  // replaced by the next empty row) and the saved line must appear in the
  // grid. Without this gate the caller can race into a second
  // addProductLine() before the first line is committed to the DOM.
  await expect(page.getByTestId('inline-add-row')).toBeHidden({ timeout: 15_000 })
    .catch(() => {}); // OK if already gone or immediately replaced

  // Two different grid renderers share this helper: the classic <table> (real
  // <tbody><tr> rows) and InlineLinesPanel.jsx (data-testid="line-row-<ID>"
  // divs, used by e.g. the purchase-order/rectificativa windows). A bare
  // 'tbody tr' silently matches on BOTH kinds of window, because every page
  // also carries a hidden (display:none) attachments <table> — so on an
  // InlineLinesPanel window this gate used to report the line saved by
  // finding that unrelated hidden row, before the real one had rendered.
  // ':visible' excludes that hidden table without needing to know which
  // renderer this window uses.
  await expect(page.locator('tbody tr:visible, [data-testid^="line-row-"]').first(),
    'Saved line should appear in the lines grid',
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Visible status text per document status code, used ONLY as a fallback for
 * lists whose rows do not carry `data-row-status` (see rowByDocumentStatus).
 * Both locales, since the UI language depends on the test user's profile.
 */
const DOCUMENT_STATUS_TEXT = {
  DR: /borrador|draft/i,
  CO: /completado|completed/i,
  VO: /anulado|void/i,
  CL: /cerrado|closed/i,
};

/**
 * Locator for the first list row in a given document status.
 *
 * Prefers the `data-row-status` attribute that DataTable emits for every row
 * whose record carries a `documentStatus` (`data-row-status={row.documentStatus}`
 * in tools/app-shell/src/components/contract-ui/DataTable.jsx) — the documented,
 * language-independent way to assert document status, see
 * docs/e2e-testing-guide.md § "Document status attributes". The translated-text
 * filter is kept as an `.or()` fallback for lists that do not expose the
 * attribute (a list whose header entity has no documentStatus column).
 *
 * Prefer `page.getByTestId('row-<id>')` over this helper whenever the test
 * already knows the record id — that targets THE record under test instead of
 * "whichever row happens to be first in this status".
 */
export function rowByDocumentStatus(page, status = 'DR') {
  const textPattern = DOCUMENT_STATUS_TEXT[status];
  if (!textPattern) {
    throw new Error(`rowByDocumentStatus: unknown document status "${status}" (expected one of ${Object.keys(DOCUMENT_STATUS_TEXT).join(', ')})`);
  }
  const byAttribute = page.locator(`tbody tr[data-row-status="${status}"]`);
  const byText = page.locator('tbody tr').filter({ hasText: textPattern });
  return byAttribute.or(byText).first();
}

/**
 * Close the row-preview overlay (GenericPreviewModal) if it is open.
 *
 * Windows that pass `renderPreview` to ListView (purchase-invoice,
 * sales-invoice, …) open this overlay on row activation, and it also opens by
 * itself on arrival at the list when a record was just saved/confirmed
 * (`externalPreviewRow` ← `location.state.savedRecord`). It renders as a
 * full-viewport `fixed inset-0` backdrop, so it swallows every pointer event
 * aimed at a row underneath it.
 *
 * It has NO Escape handler — verified in
 * tools/app-shell/src/windows/custom/shared/GenericPreviewModal.jsx, whose only
 * exits are the header close button and a click on the backdrop (`onClick={triggerClose}`
 * on the backdrop div, with the card itself stopping propagation). So
 * `keyboard.press('Escape')` does NOT dismiss it. The backdrop is the modal
 * card's parent element; the card is inset by 8px on every side, so a click at
 * y < 8 lands on the backdrop whatever the card's width.
 */
export async function dismissPreviewModal(page) {
  const modal = page.getByTestId('generic-preview-modal');
  // Deliberately a one-shot check (isVisible() never waits): the overlay is
  // either already up by the time we get here or it is not coming at all, and
  // this runs on every openListRow() call, including the many where no window
  // renders a preview.
  if (!await modal.isVisible().catch(() => false)) return;

  await modal.locator('xpath=..').click({ position: { x: 4, y: 2 } });
  await expect(modal,
    'The row-preview overlay should close on a backdrop click — it blocks pointer events on the list underneath',
  ).toBeHidden({ timeout: 10_000 });
}

/**
 * Open a list row's detail view via its row quick action (pencil).
 *
 * Handles the three things a bare `row.dblclick()` gets wrong:
 *   1. The row-preview overlay, which intercepts pointer events (see
 *      dismissPreviewModal) — closed first.
 *   2. The quick-action pill is revealed on row hover
 *      (`opacity-0 group-hover/row:opacity-100` in RowQuickActions.jsx) — the
 *      row is hovered before the button is located.
 *   3. The edit button is icon-only: its label lives in `aria-label`/`title`,
 *      never in text, so a `hasText: /editar|edit/i` locator can NEVER match it
 *      and silently falls through to something else on the page. Located by the
 *      canonical `row-quick-action-edit` testid, scoped to the row.
 */
export async function openListRow(page, targetRow, { label = 'row' } = {}) {
  await dismissPreviewModal(page);
  // Close transient popovers/drawers that DO listen for Escape (search selects,
  // product drawers, ConfirmInOutModal…) — harmless when nothing is open.
  await page.keyboard.press('Escape');

  await expect(targetRow, `The ${label} should be visible in the list`).toBeVisible({ timeout: 10_000 });
  await targetRow.hover();
  await slow(page);

  // `row-quick-action-edit` is the canonical testid (RowQuickActions.jsx); the
  // Pencil icon testids are the same button's child, kept for lists that render
  // an older edit affordance. `.or()` resolves in DOM order, so the button wins
  // over its own icon when both match.
  const editBtn = targetRow.getByTestId('row-quick-action-edit')
    .or(targetRow.locator('[data-testid*="Pencil"], [data-testid*="pencil"]'))
    .first();

  // waitFor(), not isVisible({ timeout }) — the latter's timeout option is
  // ignored by Playwright, so it would sample the DOM once with no retry.
  const hasEditBtn = await editBtn.waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  if (hasEditBtn) {
    await editBtn.click();
  } else {
    // Row activation only navigates on lists whose window does NOT pass
    // `renderPreview` to ListView — see buildRowNavigateHandler() in
    // components/contract-ui/ListView.jsx. On a preview-enabled list this opens
    // the overlay instead, which is a test-setup problem worth naming rather
    // than an opaque `detail-view` timeout 20s later.
    await targetRow.dblclick();
    const previewOpened = await page.getByTestId('generic-preview-modal')
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (previewOpened) {
      throw new Error(
        `openListRow: activating the ${label} opened the row-preview overlay instead of the detail `
        + 'view, and the row exposed no "row-quick-action-edit" button to click. This list needs row '
        + 'quick actions enabled for a test to open a record from it.',
      );
    }
  }
  await slow(page);
  await waitForDetailReady(page);
}

/**
 * Open the first list row in a given document status (default: draft).
 * Thin wrapper over openListRow + rowByDocumentStatus.
 */
export async function openRowByStatus(page, { status = 'DR', label = 'row' } = {}) {
  const rows = page.locator('tbody tr');
  await expect(rows.first(),
    `${label} list should have at least one row`,
  ).toBeVisible({ timeout: 10_000 });

  const targetRow = rowByDocumentStatus(page, status);
  await expect(targetRow,
    `There should be a ${status} ${label}`,
  ).toBeVisible({ timeout: 10_000 });

  await openListRow(page, targetRow, { label });
}

/**
 * Open a draft row from a list view. Kept as the default-status wrapper so
 * existing call sites keep their exact behaviour.
 */
export async function openDraftRow(page, { label = 'draft row' } = {}) {
  await openRowByStatus(page, { status: 'DR', label });
}

/**
 * Click the confirm button (action-save) on a draft document.
 * In draft mode, action-save is the "Confirmar" button.
 */
export async function clickConfirmButton(page) {
  const confirmBtn = page.getByTestId('action-save');
  await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
  // Wait for enabled — the button stays disabled while a save is in-flight
  // or while BP callouts are still propagating derived fields.
  await expect(confirmBtn).toBeEnabled({ timeout: 15_000 });
  await confirmBtn.click();
  // Caller is responsible for waiting on the modal/response that follows
  await slow(page);
}

/**
 * Verify a document's status pill contains the expected text.
 */
export async function expectStatusPill(page, pattern, message, timeout = 10_000) {
  const pill = page.getByTestId('document-status-pill').first();
  await expect(pill, message).toContainText(pattern, { timeout });
}

// ── Price / totals utilities ─────────────────────────────────────────────────

/**
 * Parse a formatted amount string (e.g. "47,96 EUR", "38.00 EUR", "-20.00 EUR")
 * into a numeric value. Handles Spanish locale (comma as decimal separator).
 */
export function parseAmount(text) {
  if (!text) return 0;
  // Remove currency symbols, letters, spaces — keep digits, dots, commas, minus
  let cleaned = text.replace(/[^0-9.,-]/g, '');
  // If the text uses comma as decimal separator (Spanish: "1.234,56"), convert
  if (cleaned.includes(',') && cleaned.indexOf(',') > cleaned.lastIndexOf('.')) {
    cleaned = cleaned.replaceAll('.', '').replace(',', '.');
  }
  return Number.parseFloat(cleaned) || 0;
}

/**
 * Read the document totals panel values (subtotal, tax, total) from the detail view.
 * Uses the data-testid attributes on DocumentTotalsPanel.
 * Scrolls the total row into view first to ensure values are rendered.
 * @returns {{ subtotal: number, tax: number, total: number }}
 */
export async function readDocumentTotals(page) {
  // Wait for the totals panel to render and scroll it into view
  const totalRow = page.getByTestId('totals-row-total-value');
  await expect(totalRow, 'Total row should be visible in the totals panel').toBeVisible({ timeout: 10_000 });
  await totalRow.scrollIntoViewIfNeeded().catch(() => {});

  // Wait for totals to compute from the latest lines
  await page.waitForTimeout(1_000);

  const subtotalEl = page.getByTestId('totals-row-subtotal-value');
  const taxEl = page.getByTestId('totals-row-tax-value');

  const subtotalText = await subtotalEl.textContent({ timeout: 5_000 }).catch(() => '0');
  const taxText = await taxEl.textContent({ timeout: 5_000 }).catch(() => '0');
  const totalText = await totalRow.textContent({ timeout: 5_000 }).catch(() => '0');
  const result = {
    subtotal: parseAmount(subtotalText),
    tax: parseAmount(taxText),
    total: parseAmount(totalText),
    _raw: { subtotalText, taxText, totalText },
  };
  return result;
}

/**
 * Verify that the document totals are internally consistent and match expected constraints.
 * Checks: subtotal > 0, tax >= 0, total ≈ subtotal + tax (within rounding tolerance).
 * Optionally compares against a reference totals object (e.g. PO totals should match invoice totals).
 *
 * @param {object} totals - { subtotal, tax, total } from readDocumentTotals
 * @param {string} docLabel - Label for assertion messages (e.g. 'PO', 'Invoice')
 * @param {object} [referenceTotals] - Optional reference to compare against
 */
export function verifyTotalsConsistency(totals, docLabel, referenceTotals) {
  const { subtotal, tax, total, _raw } = totals;

  expect(subtotal,
    `[${docLabel}] Subtotal should be > 0 — lines should carry prices (raw: "${_raw?.subtotalText}")`,
  ).toBeGreaterThan(0);

  // Tax can be negative in purchase invoices (e.g. deductible VAT with RE surcharge)
  expect(tax,
    `[${docLabel}] Tax amount should not be zero — tax should be applied (raw: "${_raw?.taxText}")`,
  ).not.toBe(0);

  // Total should equal subtotal + tax within rounding tolerance (0.05 EUR for multi-line tax rounding)
  const expectedTotal = subtotal + tax;
  expect(Math.abs(total - expectedTotal),
    `[${docLabel}] Total (${total}) should ≈ subtotal (${subtotal}) + tax (${tax}) = ${expectedTotal.toFixed(2)} (raw: "${_raw?.totalText}")`,
  ).toBeLessThanOrEqual(0.05);

  // Compare subtotals between documents (e.g. PO vs Invoice should have same line amounts).
  // Tax and total may differ between document types (e.g. purchase invoices compute tax differently
  // from POs when using net-price lists with deductible VAT), so only subtotals are compared.
  if (referenceTotals) {
    expect(Math.abs(subtotal - referenceTotals.subtotal),
      `[${docLabel}] Subtotal (${subtotal}) should match reference (${referenceTotals.subtotal})`,
    ).toBeLessThanOrEqual(0.05);
  }
}
