/**
 * Helpers for the live ETP-4536 rectificative-doctype-SIF integration spec.
 *
 * These wrap the reusable pieces of the flow (SII config create/delete via the
 * NEO API, building a sales invoice from the /new form, and confirming it) so
 * the spec stays readable. They talk to the same backend the app talks to
 * through the dev-server proxy (BASE_URL, default http://localhost:3100).
 *
 * All selectors are `data-testid` / role based and language-independent where
 * possible; the two document-type option labels ("Nota de crédito", "Factura de
 * devolución", "Factura") are matched with locale-tolerant regexes.
 */
import { expect } from '@playwright/test';

// ── NEO API (direct, for SIF config setup + teardown) ────────────────────────

/**
 * Read the bearer token the app stored in localStorage after a real login.
 */
export async function getAuthToken(page) {
  return page.evaluate(() => localStorage.getItem('sf_auth_token'));
}

/**
 * Read the currently selected organization ({ id, name }) from localStorage.
 */
export async function getSelectedOrg(page) {
  const raw = await page.evaluate(() => localStorage.getItem('sf_auth_selected_org'));
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function neoUrl(baseURL, path) {
  return new URL(`/sws/neo${path}`, baseURL).toString();
}

/**
 * List the SII configuration records the backend currently holds.
 * Returns an array of record ids.
 */
export async function listSiiConfigIds(page, baseURL, token) {
  const res = await page.request.get(
    neoUrl(baseURL, '/sii-config/siiConfiguration?_startRow=0&_endRow=50'),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok()) return [];
  const json = await res.json().catch(() => null);
  const rows = json?.response?.data ?? json?.data ?? [];
  return rows.map((r) => r.id).filter(Boolean);
}

/**
 * Create a SII configuration for the given org (España/Baleares common regime,
 * IVA), mirroring buildOnboardingPayloads('SII', 'baleares') PLUS the "Acogida
 * al SII" enrollment toggle the user flips in SiiSection.
 *
 * `acogidaAlSII:'Y'` is what actually enrolls the org: it sets the record's
 * insiisystem='Y', whose DB trigger (aeatsii_check_sifs_configs_trg) flips
 * AD_ORGINFO.EM_ETSG_HAS_SII_CONFIG='Y' on the legal-entity org. That flag is
 * the exact gate the completion trigger (etsg_check_rectif_inv_doc, ETP-4548)
 * reads — without it the org is NOT considered SIF-enrolled and none of the
 * rectificative restrictions apply. Just creating a config row with the flag
 * off is a no-op for the gate.
 *
 * `fechaAcogidaSII` (the enrollment date → insiisystemdate) is MANDATORY once
 * enrolled: with insiisystem='Y' but no date, the backend rejects EVERY invoice
 * save with "The 'In SII system date' field in the configuration window is
 * empty." An early date (well before any invoice) is used so it never trips the
 * "operation date after invoice date" guard.
 *
 * Production stays OFF (test/sandbox): entornoDeProduccin is left unset ('N'),
 * so nothing is ever sent to the real AEAT. Returns the created record id.
 */
export async function createSiiConfig(page, baseURL, token, orgId, enrollDate = '2020-01-01') {
  const res = await page.request.post(neoUrl(baseURL, '/sii-config/siiConfiguration'), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { adOrgId: orgId, taxtype: 'IVA', acogidaAlSII: 'Y', fechaAcogidaSII: enrollDate },
  });
  expect(res.ok(), `SII config POST should succeed (got ${res.status()})`).toBeTruthy();
  const json = await res.json();
  const record = json?.response?.data?.[0] ?? json?.data?.[0] ?? null;
  expect(record?.id, 'SII config POST should return a record id').toBeTruthy();
  return record.id;
}

/**
 * Delete every SII configuration record (cleanup). The GO UI cannot delete a
 * SIF config, so teardown goes straight to the NEO DELETE endpoint. Robust:
 * never throws, so it can run in afterAll/afterEach even after a failure.
 */
export async function deleteAllSiiConfigs(page, baseURL, token) {
  try {
    const ids = await listSiiConfigIds(page, baseURL, token);
    for (const id of ids) {
      await page.request.delete(
        neoUrl(baseURL, `/sii-config/siiConfiguration/${id}`),
        { headers: { Authorization: `Bearer ${token}` } },
      ).catch(() => {});
    }
  } catch { /* best-effort cleanup */ }
}

/**
 * Fetch a sales-invoice header record by id (for status assertions).
 */
export async function fetchInvoice(page, baseURL, token, id) {
  const res = await page.request.get(
    neoUrl(baseURL, `/sales-invoice/header/${id}`),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok()) return null;
  const json = await res.json().catch(() => null);
  return json?.response?.data?.[0] ?? json?.data?.[0] ?? null;
}

// ── UI: build + confirm a sales invoice ──────────────────────────────────────

// Document-type option labels (es_ES primary, en_US fallback).
export const DOC_TYPE = {
  invoice: /^Factura$|^Invoice$/i,
  creditNote: /Nota de cr[eé]dito|Credit\s*(Memo|Note)/i,
  return: /Factura de devoluci[oó]n|Return/i,
};

/**
 * Open /sales-invoice/new and wait for the header form to be interactive.
 */
export async function openNewInvoice(page) {
  await page.goto('/sales-invoice/new');
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('field-transactionDocument')).toBeVisible({ timeout: 15_000 });
}

/**
 * Select a document type by its label regex in the transactionDocument combobox.
 */
export async function selectDocType(page, labelRegex) {
  await page.getByTestId('field-transactionDocument').click();
  const option = page.getByRole('option', { name: labelRegex }).first();
  await expect(option).toBeVisible({ timeout: 8_000 });
  await option.click();
  // Let the doc-type change settle (it re-derives isRectificative / doc no).
  await page.waitForTimeout(1_000);
}

/**
 * Select a business partner in the Contacto selector — DATASET-AGNOSTIC.
 *
 * By default it picks the FIRST available option (the same pattern the other
 * integration specs use — see sales-order-happy-path.integration.spec.js and
 * purchase-helpers.selectVendorBP), so the spec runs on ANY dataset (Jenkins PR
 * pipelines run against a standard dataset, not the local one). Picking "first
 * option" is deterministic within a run, so the original invoice and the credit
 * note that references it use the same BP.
 *
 * Optional override: set E2E_RECT_BP to a specific BP display name to force that
 * partner (BP names are master data, not translated, so matching by text is
 * safe). When set, the option list is filtered by that name instead.
 */
export async function selectBusinessPartner(page) {
  const overrideName = process.env.E2E_RECT_BP || null;
  await page.getByTestId('field-businessPartner').click();

  let option;
  if (overrideName) {
    option = page.locator('[data-testid^="option-businessPartner-"]')
      .filter({ hasText: overrideName }).first();
    await expect(option, `BP "${overrideName}" (E2E_RECT_BP) should appear in the selector`)
      .toBeVisible({ timeout: 15_000 });
  } else {
    option = page.locator('[data-testid^="option-businessPartner-"]')
      .filter({ hasNotText: /crear|create/i }).first();
    await expect(option, 'at least one business partner should appear').toBeVisible({ timeout: 15_000 });
  }
  await option.click();
  // Wait for the BP callout (address / payment terms / price list) to settle.
  await page.waitForResponse(
    (r) => r.url().includes('/sws/neo/') && r.status() < 500,
    { timeout: 10_000 },
  ).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
}

/**
 * Save the current /new draft and wait until the URL carries the record id.
 * Returns the saved record id.
 *
 * The BP callout is debounced; in some runs the "Guardar" click lands before
 * every dependent field is committed, so the required-field guard silently
 * blocks the POST and the URL stays on /new. Retry once after letting network
 * activity settle — mirrors the same guard the purchase integration spec uses.
 */
export async function saveDraftAndGetId(page) {
  const saveBtn = page.getByTestId('action-save-draft');

  async function attempt() {
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
    // Let any in-flight BP callout finish committing before clicking save.
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    const postPromise = page.waitForResponse(
      (r) => /\/sales-invoice\/header(\?|$)/.test(r.url())
        && r.request().method() === 'POST',
      { timeout: 15_000 },
    ).catch(() => null);
    await saveBtn.click();
    await postPromise;
    return page.waitForURL(/\/sales-invoice\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 15_000 })
      .then(() => true).catch(() => false);
  }

  let saved = await attempt();
  if (!saved && page.url().endsWith('/new')) {
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(3_000);
    saved = await attempt();
  }

  await expect(page, 'draft save should navigate to the record URL')
    .toHaveURL(/\/sales-invoice\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  const m = page.url().match(/\/sales-invoice\/([a-zA-Z0-9]+)$/);
  return m?.[1] ?? null;
}

/**
 * Add a single product line via the inline-add row on the Lines tab.
 * A completion flow needs at least one line before "Confirmar" enables.
 */
export async function addProductLine(page) {
  // Ensure the Lines tab is active.
  const linesTab = page.getByTestId('tab-lines');
  if (await linesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await linesTab.click();
    await page.waitForTimeout(500);
  }

  // Empty-state "+ Añadir líneas" button (no testid — matched by label).
  const addLines = page.getByRole('button', { name: /a[ñn]adir l[íi]neas|add lines/i }).first();
  await expect(addLines).toBeVisible({ timeout: 10_000 });
  await addLines.click();

  const productField = page.getByTestId('inline-add-field-product');
  await expect(productField).toBeVisible({ timeout: 10_000 });
  await productField.click();

  const firstProduct = page.locator('[data-testid^="product-search-option-"]').first();
  await expect(firstProduct, 'at least one product should be available').toBeVisible({ timeout: 10_000 });
  await firstProduct.click();
  await page.waitForResponse(
    (r) => r.url().includes('/sws/neo/') && r.status() < 500,
    { timeout: 10_000 },
  ).catch(() => {});

  // Commit the inline row.
  await page.keyboard.press('Enter');
  await page.waitForResponse(
    (r) => r.url().includes('/sws/neo/')
      && ['POST', 'PUT', 'PATCH'].includes(r.request().method())
      && r.status() < 300,
    { timeout: 15_000 },
  ).catch(() => {});
  await expect(page.getByTestId('tab-lines')).toContainText(/1/, { timeout: 10_000 });
}

/**
 * Click "Confirmar" (draftMode action-save = save-draft then POST
 * .../action/documentAction with docAction=CO) and report the outcome without
 * asserting it:
 *   { blocked, errorText }
 * blocked=true  → the documentAction POST failed (completion refused by the
 *                 backend DB trigger); the invoice stays Draft.
 * blocked=false → the documentAction POST returned 2xx (completion succeeded).
 *
 * The outcome is decided by the documentAction response status itself — not by
 * a toast — because a stale "record processed" toast from a prior line-add can
 * otherwise be mistaken for success. The error text is read from the failure
 * body (and the error toast, if present) for the assertion message.
 */
export async function clickConfirm(page) {
  const confirm = page.getByTestId('action-save');
  await expect(confirm).toBeEnabled({ timeout: 10_000 });

  // Dismiss any lingering toast from a previous step so the error toast read
  // below reflects only this action.
  await page.locator('[data-type]').first().waitFor({ state: 'hidden', timeout: 6_000 }).catch(() => {});

  const actionResponse = page.waitForResponse(
    (r) => /\/action\/documentAction/.test(r.url()) && r.request().method() === 'POST',
    { timeout: 30_000 },
  );

  await confirm.click();

  let res;
  try {
    res = await actionResponse;
  } catch {
    // No documentAction call fired at all — treat as blocked-with-unknown so the
    // caller's assertion surfaces it rather than silently passing.
    return { blocked: true, errorText: 'documentAction was never called' };
  }

  const ok = res.ok();
  if (ok) {
    // Give the UI a beat to show its success modal / refresh the status.
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    return { blocked: false, errorText: '' };
  }

  // Failure: prefer the server message, fall back to the visible error toast.
  let errorText = '';
  try {
    const body = await res.json();
    errorText = body?.response?.message || body?.message || '';
  } catch { /* non-JSON body */ }
  if (!errorText) {
    errorText = (await page.locator('[data-type="error"]').first().textContent().catch(() => '')) || '';
  }
  return { blocked: true, errorText: errorText.trim() };
}

/**
 * Dismiss the post-completion success modal ("Cerrar") if present.
 */
export async function dismissSuccessModal(page) {
  const close = page.getByRole('button', { name: /^Cerrar$|^Close$/i });
  if (await close.first().isVisible({ timeout: 4_000 }).catch(() => false)) {
    await close.first().click().catch(() => {});
  }
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
}

/**
 * Open the Rectificaciones tab and return the panel locator.
 */
export async function openRectificacionesTab(page) {
  const tab = page.getByTestId('tab-custom:reversedInvoices');
  await expect(tab).toBeVisible({ timeout: 10_000 });
  await tab.click();
  const panel = page.getByTestId('reversed-invoices-panel');
  await expect(panel).toBeVisible({ timeout: 8_000 });
  return panel;
}

/**
 * Assert that the Rectificaciones panel is READ-ONLY for a NON-rectificative
 * invoice: neither add affordance is rendered. Call this AFTER the header has
 * been enriched with isRectificative=false — in practice, after at least one
 * product line has been added (any header refresh resolves the doc type). On a
 * brand-new draft the field is still undefined and the add button appears
 * transiently, so this must not be called before that enrichment.
 *
 * SIF-GATED (ETP-4536): ReversedInvoicesPanel now applies the non-rectificative
 * restriction ONLY when a SIF is configured (or while the fiscal profile is
 * still loading):
 *   sifRestrictionActive = notRectificative && (sifConfigured || fiscalLoading)
 *   isReadOnly           = (processed && !isVoid) || sifRestrictionActive
 * So call this on a normal invoice ONLY WHEN a SIF is configured — that is the
 * state in which the panel is read-only. Without a SIF, use
 * expectRectificacionesPanelEditable instead (the add button IS present).
 */
export async function expectRectificacionesPanelReadOnly(page) {
  const panel = await openRectificacionesTab(page);
  await expect(panel).toBeVisible({ timeout: 8_000 });
  // Give the panel a beat to receive the enriched (isRectificative=false) data
  // and the fiscal profile to resolve to a configured SIF.
  await page.waitForTimeout(1_000);
  await expect(
    panel.getByTestId('btn__addFirstRectificacion'),
    'with a SIF configured, a non-rectificative invoice must not offer the empty-state add button',
  ).toHaveCount(0);
  await expect(
    panel.getByTestId('btn__addReversedInvoice'),
    'with a SIF configured, a non-rectificative invoice must not offer the inline add-more button',
  ).toHaveCount(0);
  return panel;
}

/**
 * Regression variant of expectRectificacionesPanelReadOnly for the exact bug
 * found in manual testing (ETP-4536): a SAVED NORMAL invoice with NO product
 * lines yet, WITH a SIF configured, must ALREADY show a READ-ONLY Rectificaciones
 * panel (no empty-state / inline add button).
 *
 * This is the case the component tweak targets: ReversedInvoicesPanel now treats
 * an UNKNOWN rectificative status as non-rectificative
 *   notRectificative = data?.isRectificative !== true && data?.isRectificative !== 'true'
 * (previously `=== false`). On a freshly-saved normal draft with no lines the
 * header is not yet enriched, so isRectificative is undefined — under the OLD
 * logic notRectificative was false and the add button leaked through; under the
 * NEW logic notRectificative is true, so with a SIF configured
 *   sifRestrictionActive = notRectificative && (sifConfigured || fiscalLoading)
 * is true and the panel is read-only even before any line exists.
 *
 * Unlike expectRectificacionesPanelReadOnly this must NOT assume a product line
 * has been added — it is called in the no-lines state right after save. It waits
 * for the fiscal profile to resolve to a configured SIF, then asserts BOTH add
 * affordances are absent.
 */
export async function expectRectificacionesPanelReadOnlyNoLines(page) {
  const panel = await openRectificacionesTab(page);
  await expect(panel).toBeVisible({ timeout: 8_000 });
  // Give the fiscal profile a beat to resolve to a configured SIF so the
  // UNKNOWN-status restriction has definitively kicked in.
  await page.waitForTimeout(2_000);
  await expect(
    panel.getByTestId('btn__addFirstRectificacion'),
    'with a SIF configured, a saved normal invoice with NO lines must not offer the empty-state add button',
  ).toHaveCount(0);
  await expect(
    panel.getByTestId('btn__addReversedInvoice'),
    'with a SIF configured, a saved normal invoice with NO lines must not offer the inline add-more button',
  ).toHaveCount(0);
  return panel;
}

/**
 * Assert that the Rectificaciones panel is EDITABLE for a NON-rectificative
 * invoice — the empty-state add button (btn__addFirstRectificacion) IS present.
 *
 * SIF-GATED (ETP-4536): with NO SIF configured, sifRestrictionActive is false
 * for a non-rectificative invoice, so isReadOnly is false and the panel keeps
 * offering the add affordance. This is the exact behavior the product owner
 * asked for: without a SIF a normal invoice can still gain a rectification and
 * complete (backend allows it — ETP-4548).
 *
 * Call this AFTER a product line has been added (so the header is enriched with
 * isRectificative=false) and the fiscal profile has resolved to 'unconfigured'.
 * Returns the panel locator so the caller can drive the add flow.
 */
export async function expectRectificacionesPanelEditable(page) {
  const panel = await openRectificacionesTab(page);
  await expect(panel).toBeVisible({ timeout: 8_000 });
  // Give the panel a beat to receive the enriched (isRectificative=false) data
  // AND the fiscal profile to resolve to 'unconfigured' (fiscalLoading=false),
  // otherwise the transient loading state would keep the restriction active.
  await page.waitForTimeout(2_000);
  await expect(
    panel.getByTestId('btn__addFirstRectificacion'),
    'with NO SIF configured, a non-rectificative invoice must still offer the empty-state add button',
  ).toBeVisible({ timeout: 8_000 });
  return panel;
}

/**
 * Add a rectification linking a completed original invoice, via the panel:
 * open the add form, pick the original invoice through the picker modal
 * (matched by its document number text), then save the line.
 */
export async function addRectification(page, panel, originalDocNo) {
  // Either the empty-state or the inline add-link, depending on existing rows.
  const addFirst = panel.getByTestId('btn__addFirstRectificacion');
  const addMore = panel.getByTestId('btn__addReversedInvoice');
  // Decide which affordance to click WITHOUT racing on a single isVisible
  // snapshot. After a blocked completion attempt the header is refetched, so the
  // panel re-settles asynchronously (isRectificative resolves to true, which is
  // what enables the empty-state button in the SIF lines-first flow) and the
  // empty-state button can transiently detach/re-attach while it renders. Prefer
  // the empty-state button by WAITING for it up to a generous timeout; only fall
  // back to the inline add-more button if the empty-state one never appears
  // (i.e. rows already exist). This is the deterministic ordering the flaky
  // isVisible poll got wrong.
  const emptyStateReady = await addFirst
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (emptyStateReady) {
    await addFirst.click();
  } else {
    await expect(addMore).toBeVisible({ timeout: 6_000 });
    await addMore.click();
  }

  // Open the invoice picker ("Seleccionar..." is a literal placeholder).
  await panel.getByText('Seleccionar...').first().click();
  const search = page.getByPlaceholder(/Buscar factura|Search invoice/i);
  await expect(search).toBeVisible({ timeout: 8_000 });
  await search.fill(String(originalDocNo));
  await page.waitForTimeout(500);

  await page.getByText(String(originalDocNo), { exact: false }).first().click();

  const save = panel.getByTestId('btn__saveNewLine');
  await expect(save).toBeEnabled({ timeout: 8_000 });
  await save.click();
  await page.waitForResponse(
    (r) => r.url().includes('/reversedInvoices')
      && r.request().method() === 'POST',
    { timeout: 15_000 },
  ).catch(() => {});
  await page.waitForTimeout(1_000);
}
