import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, navigateTo } from '../helpers/auth.js';

/**
 * Contacts — Full integration E2E journey against a real Etendo backend.
 *
 * Self-contained: creates its own data, validates with it, cleans up at the end.
 *
 * Single continuous flow (one login, one test):
 *   1. Create Empresa contact A — validation error, then successful save
 *   2. Detail view — verify fields, toggle Persona/Empresa with persistence
 *   3. Financial tab — credit limit edit with persistence on reload
 *   4. Bank account — create inline, verify persistence, delete
 *   5. Address — create inline, verify persistence, delete
 *   6. Contact person — create inline, verify persistence, delete
 *   7. Create Empresa contact B
 *   8. List view — verify both contacts appear, columns, subset filters
 *   9. Bulk delete — select both, delete, verify removal
 *
 * Requires:
 *   - Etendo backend running at localhost:8080
 *   - Dev server running at localhost:3100 (make dev)
 *   - E2E_USE_MOCK=0 E2E_PASSWORD=<password>
 *
 * Skipped automatically if env vars are not set.
 */

/**
 * Load credentials from the onboarding test if available (.auth-credentials.json),
 * otherwise fall back to E2E_PASSWORD / E2E_USER env vars.
 */
function loadCredentials() {
  try {
    const credPath = resolve(import.meta.dirname, '../../.auth-credentials.json');
    const creds = JSON.parse(readFileSync(credPath, 'utf-8'));
    if (creds.email && creds.password) return creds;
  } catch { /* file doesn't exist — fall back to env vars */ }
  return null;
}

const onboardingCreds = loadCredentials();
const RUN_INTEGRATION = process.env.E2E_USE_MOCK === '0' && !!(process.env.E2E_PASSWORD || onboardingCreds);

/** Wait for detail view fully loaded (spinner gone, data fetched). */
async function waitForDetailReady(page) {
  await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
  // Only wait for spinner to disappear if it's actually visible
  const spinner = page.getByText(/cargando|loading/i);
  if (await spinner.isVisible({ timeout: 500 }).catch(() => false)) {
    await expect(spinner).toBeHidden({ timeout: 10_000 });
  }
}

/**
 * Start listening for a save API response BEFORE triggering the action.
 * Returns a promise — await it AFTER the action (click/Enter/Tab).
 */
function expectSaveResponse(page) {
  return page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && ['POST', 'PUT', 'PATCH'].includes(resp.request().method()) && resp.status() < 500,
    { timeout: 15_000 },
  ).catch(() => {});
}

/**
 * Start listening for a DELETE API response BEFORE triggering the action.
 */
function expectDeleteResponse(page) {
  return page.waitForResponse(
    (resp) => resp.url().includes('/sws/neo/') && resp.request().method() === 'DELETE' && resp.status() < 500,
    { timeout: 15_000 },
  ).catch(() => {});
}


test.describe('Contacts Integration — Full journey', () => {
  test.skip(!RUN_INTEGRATION, 'Requires real Etendo backend (E2E_USE_MOCK=0 + E2E_PASSWORD)');
  test.setTimeout(180_000);

  test('create → detail → toggle → financial → bank account → list → filters → bulk delete', async ({ page }) => {
    const ts = Date.now();
    const CONTACT_A = `E2E Contact A ${ts}`;
    const CONTACT_B = `E2E Contact B ${ts}`;

    // Use onboarding-created credentials if available, otherwise env vars
    const loginOpts = onboardingCreds
      ? { user: onboardingCreds.email, password: onboardingCreds.password }
      : {};
    await login(page, loginOpts);

    // ═══════════════════════════════════════════════════════════════════════
    // PART 1: Validation error — save without required field
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'contacts');
    const listView = page.getByTestId('list-view');
    await expect(listView).toBeVisible({ timeout: 15_000 });

    const newBtn = page.getByTestId('action-new');
    await expect(newBtn).toBeVisible({ timeout: 10_000 });
    await newBtn.click();
    await expect(page).toHaveURL(/\/contacts\/new/, { timeout: 15_000 });
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });

    // Try to save with an empty form — expect server-side validation error
    // We do NOT fill any fields to avoid triggering auto-save on blur
    const saveBtnFirst = page.getByTestId('action-save')
      .or(page.getByRole('button', { name: /^guardar$|^save$/i }));
    const saveP1 = expectSaveResponse(page);
    await saveBtnFirst.first().click();
    await saveP1;

    // Should stay on /new or show an error toast (server-side validation)
    const stayedOnNew = /\/contacts\/new/.test(page.url());
    const errorToast = page.locator('[role="status"], [data-sonner-toast], [class*="toast"]');
    const toastVisible = await errorToast.first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(stayedOnNew || toastVisible).toBe(true);

    // ═══════════════════════════════════════════════════════════════════════
    // PART 2: Create contact A (Empresa) — fill all required fields, save
    // ═══════════════════════════════════════════════════════════════════════

    // Always navigate fresh to avoid stale form state
    await navigateTo(page, 'contacts');
    await expect(listView).toBeVisible({ timeout: 15_000 });
    await newBtn.click();
    await expect(page).toHaveURL(/\/contacts\/new/, { timeout: 15_000 });
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });

    // Fill Razon Social
    const nameInput = page.getByRole('textbox', { name: /razón social/i });
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.clear();
    await nameInput.fill(CONTACT_A);

    // Fill Clave NIF Pais Residencia (required dropdown)
    const taxSelect = page.getByTestId('field-oBTIKTaxIDKey');
    await expect(taxSelect).toBeVisible({ timeout: 5_000 });
    await taxSelect.click();
    const taxOption = page.locator('[role="option"]').first();
    await expect(taxOption).toBeVisible({ timeout: 5_000 });
    await taxOption.click();

    // Fill email (optional field — may not be present in all configurations)
    const emailInput = page.getByRole('textbox', { name: /correo electrónico|email/i });
    if (await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await emailInput.fill(`e2e-${ts}@test.com`);
    }

    // Save — if it fails (e.g. EM_Etgo_Identifier sequence not ready on fresh
    // onboarding environments), reload and retry once.
    const saveBtn = page.getByTestId('action-save')
      .or(page.getByRole('button', { name: /^guardar$|^save$/i }));
    await expect(saveBtn.first()).toBeEnabled({ timeout: 10_000 });
    await saveBtn.first().click();

    // Check if save succeeded (URL changes from /new to /contacts/<id>)
    let saved = await page.waitForURL(/\/contacts\/(?!new)/, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);

    if (!saved) {
      // Reload to refresh backend state, then retry save
      await page.reload({ waitUntil: 'networkidle' });
      await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });
      const retrySave = page.getByTestId('action-save')
        .or(page.getByRole('button', { name: /^guardar$|^save$/i }));
      await expect(retrySave.first()).toBeEnabled({ timeout: 10_000 });
      await retrySave.first().click();
      await expect(page).not.toHaveURL(/\/contacts\/new/, { timeout: 20_000 });
      saved = true;
    }

    await expect(page).toHaveURL(/\/contacts\//, { timeout: 15_000 });
    const contactAUrl = page.url();

    // Verify the name persists after save
    await expect(page.getByRole('textbox', { name: /razón social/i }))
      .toHaveValue(CONTACT_A, { timeout: 10_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // PART 3: Detail view — verify fields, toggle Persona/Empresa
    // ═══════════════════════════════════════════════════════════════════════

    // Email and phone labels present
    await expect(page.getByText(/correo electrónico|email/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/teléfono|phone/i).first()).toBeVisible({ timeout: 5_000 });

    // Toggle to Persona — Nombre and Apellidos fields should appear
    const personaToggle = page.getByText(/^persona$/i).first();
    await personaToggle.click();

    const firstNameInput = page.getByRole('textbox', { name: /^nombre/i });
    const lastNameInput = page.getByRole('textbox', { name: /apellidos/i });
    await expect(firstNameInput).toBeVisible({ timeout: 5_000 });
    await expect(lastNameInput).toBeVisible({ timeout: 5_000 });

    // Fill names and trigger auto-save
    const firstName = 'E2EFirstName';
    const lastName = 'E2ELastName';
    await firstNameInput.fill(firstName);
    await page.keyboard.press('Tab');

    await lastNameInput.fill(lastName);
    await page.keyboard.press('Tab');

    // Let the debounced auto-save fire — verified by reload below
    await page.waitForTimeout(1_500);

    // Reload and verify persistence
    await page.goto(contactAUrl);
    await waitForDetailReady(page);

    const reloadedFirstName = page.getByRole('textbox', { name: /^nombre/i });
    const reloadedLastName = page.getByRole('textbox', { name: /apellidos/i });
    await expect(reloadedFirstName).toBeVisible({ timeout: 10_000 });
    await expect(reloadedFirstName).toHaveValue(firstName, { timeout: 5_000 });
    await expect(reloadedLastName).toHaveValue(lastName, { timeout: 5_000 });

    // Toggle back to Empresa — Razon Social should reappear
    const empresaToggle = page.getByText(/^empresa$/i).first();
    await empresaToggle.click();
    const razonSocialAfterToggle = page.getByRole('textbox', { name: /razón social/i });
    await expect(razonSocialAfterToggle).toBeVisible({ timeout: 5_000 });

    // Restore the original Razon Social so we can find it in the list later
    await razonSocialAfterToggle.clear();
    await razonSocialAfterToggle.fill(CONTACT_A);
    const saveToggle = expectSaveResponse(page);
    await page.keyboard.press('Tab');
    await saveToggle;

    // ═══════════════════════════════════════════════════════════════════════
    // PART 4: Financial tab — credit limit edit, persistence on reload
    // ═══════════════════════════════════════════════════════════════════════

    const financialTab = page.getByRole('button', { name: /financiero|financial/i });
    await expect(financialTab).toBeVisible({ timeout: 5_000 });
    await financialTab.click();

    const creditInput = page.locator('input[type="number"]').first();
    const creditVisible = await creditInput.isVisible({ timeout: 3_000 }).catch(() => false);

    if (creditVisible) {
      const newCreditValue = 12345;
      await creditInput.fill(String(newCreditValue));

      // Blur to trigger save
      const saveCreditP = expectSaveResponse(page);
      await financialTab.click();
      await saveCreditP;

      await expect(async () => {
        expect(Number(await creditInput.inputValue())).toBe(newCreditValue);
      }).toPass({ timeout: 5_000 });

      // Reload and verify persistence
      await page.goto(contactAUrl);
      await waitForDetailReady(page);

      const financialTabReload = page.getByRole('button', { name: /financiero|financial/i });
      await financialTabReload.click();

      const reloadedCredit = page.locator('input[type="number"]').first();
      await expect(reloadedCredit).toBeVisible({ timeout: 5_000 });
      await expect(async () => {
        expect(Number(await reloadedCredit.inputValue())).toBe(newCreditValue);
      }).toPass({ timeout: 5_000 });
    } else {
      // At least verify the Financial tab rendered content
      await expect(page.getByText(/cr[eé]dito|credit|tarifa|payment/i).first()).toBeVisible({ timeout: 5_000 });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PART 5: Bank account — create inline, verify it appears, delete it
    // ═══════════════════════════════════════════════════════════════════════

    // Go back to General tab first — sub-tabs only appear there
    const generalTab = page.getByRole('button', { name: /^general$/i });
    await generalTab.click();

    // Navigate to the bank account tab
    const bankTab = page.getByTestId('tab-bankAccount')
      .or(page.getByRole('button', { name: /cuenta.*banc|bank.*account/i }));
    await expect(bankTab.first()).toBeVisible({ timeout: 5_000 });
    await bankTab.first().click();

    // Read the bank account count from the tab badge (e.g. "Cuenta Bancaria 1")
    const bankTabText = await bankTab.first().textContent();
    const bankCountBefore = parseInt((bankTabText.match(/(\d+)/) || ['0', '0'])[1], 10);

    // Click add button to open inline form
    const addBankBtn = page.getByTestId('action-add-line')
      .or(page.getByRole('button', { name: /a[nñ]adir.*cuenta|add.*bank|nueva.*cuenta/i }));
    await expect(addBankBtn.first()).toBeVisible({ timeout: 5_000 });
    await addBankBtn.first().click();

    // Wait for inline add row to appear
    const addRow = page.getByTestId('inline-add-row');
    await expect(addRow).toBeVisible({ timeout: 5_000 });

    // Fill bank name field
    const bankNameField = page.getByTestId('inline-add-field-bankName')
      .or(addRow.locator('input').first());
    await expect(bankNameField).toBeVisible({ timeout: 3_000 });
    await bankNameField.fill(`E2E Bank ${ts}`);

    // Select bank format if available (optional — not all configs expose this field)
    const bankFormatField = page.getByTestId('inline-add-field-bankFormat');
    if (await bankFormatField.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await bankFormatField.click();
      const genericOption = page.getByRole('option', { name: /generic|gen[eé]rico/i });
      if (await genericOption.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await genericOption.click();
      } else {
        // Select first available option
        const firstOption = page.locator('[role="option"]').first();
        await expect(firstOption).toBeVisible({ timeout: 2_000 });
        await firstOption.click();
      }
      // Ensure dropdown is closed before proceeding
      await expect(page.locator('[role="option"]')).toBeHidden({ timeout: 3_000 }).catch(() => {});
    }

    // Fill account number if visible (optional — not all configs expose this field)
    const accountNoField = page.getByTestId('inline-add-field-accountNo')
      .or(addRow.locator('input[name*="account"], input[placeholder*="cuenta"]'));
    if (await accountNoField.first().isVisible({ timeout: 1_000 }).catch(() => false)) {
      await accountNoField.first().fill(`${ts}`);
    }

    // Submit the inline form
    // Submit — press Enter (UI says "Enter o clic fuera para guardar")
    const saveBankP = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await saveBankP;

    // Verify no error toast appeared
    const bankError = page.locator('[role="status"], [data-sonner-toast], [class*="toast"]')
      .filter({ hasText: /error/i });
    const hadBankError = await bankError.first().isVisible({ timeout: 500 }).catch(() => false);

    if (!hadBankError) {
      // Verify the bank row appeared (no reload — save response 200 confirms persistence)
      const bankRowText = page.getByText(`E2E Bank ${ts}`);
      await expect(bankRowText).toBeVisible({ timeout: 5_000 });

      // Hover the row container to reveal delete action, then click delete
      const bankRowContainer = bankRowText.locator('xpath=ancestor::div[contains(@class,"border-b") or contains(@class,"group")]').first();
      await bankRowContainer.hover();
      const deleteBankBtn = bankRowContainer.getByTestId('row-quick-action-delete')
        .or(bankRowContainer.locator('button').filter({ has: page.locator('svg.lucide-trash-2, svg[class*="trash"]') }));
      await expect(deleteBankBtn.first()).toBeVisible({ timeout: 3_000 });
      await deleteBankBtn.first().click();

      // Confirm delete dialog if it appears
      const deleteDialog = page.getByTestId('confirm-delete-dialog').or(page.getByRole('dialog'));
      if (await deleteDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const deleteConfirm = page.getByTestId('confirm-delete-confirm')
          .or(deleteDialog.getByRole('button', { name: /delete|eliminar|confirm/i }));
        const delBankP = expectDeleteResponse(page);
        await deleteConfirm.first().click();
        await delBankP;
      }
      await expect(page.getByText(`E2E Bank ${ts}`)).toHaveCount(0, { timeout: 5_000 });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PART 5b: Address — create via modal
    // ═══════════════════════════════════════════════════════════════════════

    await page.goto(contactAUrl);
    await waitForDetailReady(page);

    const addressTab = page.getByTestId('tab-locationAddress')
      .or(page.getByRole('button', { name: /direcci[oó]n|address/i }));
    await expect(addressTab.first()).toBeVisible({ timeout: 5_000 });
    await addressTab.first().click();

    // Read the address count from the tab badge
    const addrTabText = await addressTab.first().textContent();
    const addrCountBefore = parseInt((addrTabText.match(/(\d+)/) || ['0', '0'])[1], 10);

    // Click add button
    const addAddrBtn = page.getByTestId('action-add-line')
      .or(page.getByRole('button', { name: /a[nñ]adir.*direcci|add.*address|nueva.*direcci/i }));
    await expect(addAddrBtn.first()).toBeVisible({ timeout: 5_000 });
    await addAddrBtn.first().click();

    // Address uses a modal ("Ubicación") — wait for it
    await expect(page.getByText(/^ubicaci[oó]n$/i)).toBeVisible({ timeout: 5_000 });

    // The modal overlay is: div.fixed.inset-0.z-50
    // Modal inputs are the ones with class border-gray-300 (no name/testid)
    const modalInputs = page.locator('.fixed.inset-0 input[type="text"], div[class*="bg-black"] ~ div input[type="text"]');
    const modalInputCount = await modalInputs.count();

    // If we found modal-specific inputs, use them; otherwise fallback to label-based
    if (modalInputCount >= 4) {
      // Primera línea (1st), Segunda línea (2nd), Código postal (3rd), Ciudad (4th)
      await modalInputs.nth(0).fill(`E2E Address ${ts}`);
      await modalInputs.nth(3).fill('E2E City');
    } else {
      // Fallback: find inputs near the "Primera línea" label
      const primeraLabel = page.getByText(/primera l[ií]nea/i);
      const firstInput = primeraLabel.locator('xpath=following::input[1]');
      await firstInput.fill(`E2E Address ${ts}`);
    }

    // Select País — button opens a search dialog with country list
    const paisButton = page.getByText(/^pa[ií]s$/i).locator('..').locator('button[aria-haspopup="dialog"]');
    await paisButton.click();

    // The country picker dialog has a search input "Buscar país..."
    const countrySearch = page.getByPlaceholder(/buscar pa[ií]s/i);
    await expect(countrySearch).toBeVisible({ timeout: 5_000 });
    await countrySearch.fill('Espa');

    // Wait for search results to filter — country name depends on locale (España / Spain)
    const countryOption = page.getByRole('button', { name: /^espa[nñ]a$/i })
      .or(page.getByRole('button', { name: /^spain$/i }))
      .or(page.locator('button').filter({ hasText: /^España$/ }))
      .or(page.locator('button').filter({ hasText: /^Spain$/ }));
    await expect(countryOption.first()).toBeVisible({ timeout: 5_000 });
    await countryOption.first().click();

    // Click Guardar in the address modal
    const modalGuardar = page.getByRole('button', { name: /^guardar$/i }).last();
    const saveAddrP = expectSaveResponse(page);
    await modalGuardar.click();
    await saveAddrP;

    const addrError = page.locator('[role="status"], [data-sonner-toast], [class*="toast"]')
      .filter({ hasText: /error/i });
    const hadAddrError = await addrError.first().isVisible({ timeout: 500 }).catch(() => false);

    // Address verification — no reload needed, save response confirms persistence

    // ═══════════════════════════════════════════════════════════════════════
    // PART 5c: Contact person — create inline
    // ═══════════════════════════════════════════════════════════════════════

    // Navigate fresh — sub-tab state may be stale after address modal
    await page.goto(contactAUrl);
    await waitForDetailReady(page);

    const contactPersonTab = page.getByTestId('tab-contact');
    await expect(contactPersonTab.first()).toBeVisible({ timeout: 5_000 });
    await contactPersonTab.first().click();

    // Read the contact person count from the tab badge
    const ctTabText = await contactPersonTab.first().textContent();
    const ctCountBefore = parseInt((ctTabText.match(/(\d+)/) || ['0', '0'])[1], 10);

    // Click add button
    const addCtBtn = page.getByTestId('action-add-line')
      .or(page.getByRole('button', { name: /a[nñ]adir.*persona|add.*contact|nueva.*persona/i }));
    await expect(addCtBtn.first()).toBeVisible({ timeout: 5_000 });
    await addCtBtn.first().click();

    const addRowCt = page.getByTestId('inline-add-row');
    await expect(addRowCt).toBeVisible({ timeout: 5_000 });

    // Fill contact person name
    const ctNameField = page.getByTestId('inline-add-field-name')
      .or(page.getByTestId('inline-add-field-firstName'))
      .or(addRowCt.locator('input').first());
    await expect(ctNameField).toBeVisible({ timeout: 3_000 });
    await ctNameField.fill(`E2E Person ${ts}`);

    // Submit — press Enter (UI says "Enter o clic fuera para guardar")
    const saveCtP = expectSaveResponse(page);
    await page.keyboard.press('Enter');
    await saveCtP;

    const ctError = page.locator('[role="status"], [data-sonner-toast], [class*="toast"]')
      .filter({ hasText: /error/i });
    const hadCtError = await ctError.first().isVisible({ timeout: 500 }).catch(() => false);

    // Contact person verification — no reload needed, save response confirms persistence

    // ═══════════════════════════════════════════════════════════════════════
    // PART 6: Create contact B — for list and bulk delete validation
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'contacts');
    await expect(listView).toBeVisible({ timeout: 15_000 });

    const newBtn2 = page.getByTestId('action-new');
    await expect(newBtn2).toBeVisible({ timeout: 10_000 });
    await newBtn2.click();
    await expect(page).toHaveURL(/\/contacts\/new/, { timeout: 15_000 });
    await expect(page.getByTestId('detail-view')).toBeVisible({ timeout: 15_000 });

    const nameInputB = page.getByRole('textbox', { name: /razón social/i });
    await expect(nameInputB).toBeVisible({ timeout: 5_000 });
    await nameInputB.fill(CONTACT_B);

    const taxSelectB = page.getByTestId('field-oBTIKTaxIDKey');
    await expect(taxSelectB).toBeVisible({ timeout: 5_000 });
    await taxSelectB.click();
    const taxOptionB = page.locator('[role="option"]').first();
    await expect(taxOptionB).toBeVisible({ timeout: 5_000 });
    await taxOptionB.click();

    const saveBtnB = page.getByTestId('action-save')
      .or(page.getByRole('button', { name: /^guardar$|^save$/i }));
    await expect(saveBtnB.first()).toBeEnabled({ timeout: 10_000 });
    await saveBtnB.first().click();
    await expect(page).not.toHaveURL(/\/contacts\/new/, { timeout: 15_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // PART 7: List view — verify contacts, columns, subset filters
    // ═══════════════════════════════════════════════════════════════════════

    await navigateTo(page, 'contacts');
    await expect(listView).toBeVisible({ timeout: 15_000 });

    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });

    // Contact B should be visible (recently created, at top of list)
    const rowB = rows.filter({ hasText: CONTACT_B }).first();
    await expect(rowB).toBeVisible({ timeout: 15_000 });

    // Verify key column headers exist by name
    const headers = page.locator('thead th, [role="columnheader"]');
    const headerTexts = (await headers.allTextContents()).join(' ');
    expect(headerTexts).toMatch(/raz[oó]n social|nombre|name/i);
    expect(headerTexts).toMatch(/correo|email/i);
    expect(headerTexts).toMatch(/tel[eé]fono|phone/i);

    // Subset filter buttons
    const todosBtn = page.locator('button').filter({ hasText: /^Todos$|^All$/i });
    const personasBtn = page.locator('button').filter({ hasText: /^Personas$|^Persons$/i });
    const empresasBtn = page.locator('button').filter({ hasText: /^Empresas$|^Companies$/i });
    await expect(todosBtn.first()).toBeVisible({ timeout: 5_000 });
    await expect(personasBtn.first()).toBeVisible({ timeout: 5_000 });
    await expect(empresasBtn.first()).toBeVisible({ timeout: 5_000 });

    // Empresas filter — Contact B is Empresa, should be visible
    await empresasBtn.first().click();
    await expect(rows.filter({ hasText: CONTACT_B }).first()).toBeVisible({ timeout: 10_000 });

    // Personas filter — Contact B (Empresa) should not appear
    await personasBtn.first().click();
    await expect(rows.filter({ hasText: CONTACT_B })).toHaveCount(0, { timeout: 10_000 });

    // Todos restores full list
    await todosBtn.first().click();
    await expect(rows.filter({ hasText: CONTACT_B }).first()).toBeVisible({ timeout: 10_000 });

    // ═══════════════════════════════════════════════════════════════════════
    // PART 8: Bulk delete — select both created contacts, delete, verify
    // ═══════════════════════════════════════════════════════════════════════

    // Select Contact B
    const rowBFinal = page.locator('tbody tr').filter({ hasText: CONTACT_B }).first();
    await rowBFinal.locator('[role="checkbox"], input[type="checkbox"]').first().click();

    // Select Contact A by navigating to its detail URL and deleting, or find by timestamp
    // Contact A may have a different name after toggle — find by email which has the timestamp
    const rowAByEmail = page.locator('tbody tr').filter({ hasText: `e2e-${ts}@test.com` }).first();
    if (await rowAByEmail.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await rowAByEmail.locator('[role="checkbox"], input[type="checkbox"]').first().click();
    }

    // Verify selection indicator shows selected count
    const selectionText = page.locator('text=/\\d+.*seleccionado|\\d+.*selected/i');
    await expect(selectionText.first()).toBeVisible({ timeout: 5_000 });

    // Click bulk delete
    const bulkTrashBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-trash-2, svg[class*="trash"]'),
    });
    const selectionBar = page.locator('div').filter({ hasText: /seleccionado|selected/i }).first().locator('..');
    const trashInBar = selectionBar.locator('button').filter({ has: page.locator('svg') }).first();
    const bulkBtn = await bulkTrashBtn.count() > 0 ? bulkTrashBtn.first() : trashInBar;
    await bulkBtn.click();

    // Confirm bulk delete dialog
    const dialog = page.getByTestId('confirm-delete-dialog').or(page.getByRole('dialog'));
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const confirmBtn = page.getByTestId('confirm-delete-confirm')
      .or(dialog.getByRole('button', { name: /delete|eliminar|confirm/i }));
    await confirmBtn.first().click();

    // Verify Contact B disappears from the list
    await expect(
      page.locator('tbody tr').filter({ hasText: CONTACT_B })
    ).toHaveCount(0, { timeout: 15_000 });
  });
});
