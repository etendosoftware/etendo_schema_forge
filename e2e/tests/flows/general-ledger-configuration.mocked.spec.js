import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { login } from '../helpers/auth.js';

/**
 * General Ledger Configuration ("Configuración contable", AD window 125) —
 * visual-capture spec (mocked).
 *
 * PURPOSE: this is the Phase-4 G11 *capture seed*, NOT the full acceptance suite.
 * The backend is greenfield (no NEO spec serves window 125), so the window draws
 * entirely from its local `mockCatalogs.js`. login() seeds a fake token + a
 * generic /sws/** stub; no window-specific NEO mock is needed because the hook
 * never fetches on mount.
 *
 * It switches to each of the 4 tabs (General · Valores por defecto · Dimensiones ·
 * Documentos), waits for that tab's content to render, runs a light sanity check
 * (no pixel/layout fidelity assertion — a human compares the PNGs to the Figma),
 * and writes a full-page screenshot per tab to e2e/test-results/.
 *
 * Selectors used are the stable data-testids already emitted by the window:
 *   glc-tab-0..3, glc-save, glc-section-identity, glc-defaults-group-*,
 *   glc-section-dimensions, glc-doc-*.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Spec lives in e2e/tests/flows/ → test-results is two levels up.
const OUT_DIR = path.resolve(__dirname, '..', '..', 'test-results');

const TABS = [
  { index: 0, file: 'glc-01-general.png',     anchor: (p) => p.getByTestId('glc-section-identity') },
  { index: 1, file: 'glc-02-valores.png',     anchor: (p) => p.locator('[data-testid^="glc-defaults-group-"]').first() },
  { index: 2, file: 'glc-03-dimensiones.png', anchor: (p) => p.getByTestId('glc-section-dimensions') },
  { index: 3, file: 'glc-04-documentos.png',  anchor: (p) => p.locator('[data-testid^="glc-doc-"]').first() },
];

test.describe('General Ledger Configuration — visual capture (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/general-ledger-configuration');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // The window shell renders once the tab bar is present.
    await expect(page.getByTestId('glc-tab-0')).toBeVisible({ timeout: 15_000 });
    // No React error boundary leaked through.
    await expect(page.getByText(/Something went wrong|Algo salió mal/i)).toHaveCount(0);
  });

  for (const tab of TABS) {
    test(`captures tab ${tab.index} → ${tab.file}`, async ({ page }) => {
      await page.getByTestId(`glc-tab-${tab.index}`).click();

      // Wait for this tab's content to mount (each tab swaps the panel).
      const anchor = tab.anchor(page);
      await expect(anchor).toBeVisible({ timeout: 10_000 });

      // The dirty-state save button is part of the window chrome on every tab.
      await expect(page.getByTestId('glc-save')).toBeVisible();

      // Let fonts/transitions settle, then capture the full page for human review.
      mkdirSync(OUT_DIR, { recursive: true });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT_DIR, tab.file), fullPage: true });
    });
  }
});

/**
 * General Ledger Configuration — behavioral suite (mocked).
 *
 * Builds on the capture seed: drives the real dirty-state → aggregate-save flow,
 * the inverted period toggle, dimension toggles, the unbacked placeholders, and
 * the read-only surfaces. The `Guardar cambios` button is gated on a selected
 * organization (`useGeneralLedgerConfig` only POSTs when `selectedOrg.id` is set),
 * so we seed `sf_auth_selected_org` in localStorage before React boots and install
 * a window-specific route for the aggregate endpoint after login() (LIFO wins over
 * the generic /sws/** stub).
 */

const SEED_ORG = { id: 'ES-NORTE', name: 'F&B España - Región Norte' };

/**
 * Intercept the aggregate endpoint. GET (mount load) returns an empty envelope so
 * the hook renders the local seed; POST records the dirty payload and echoes an
 * empty saved record. `sink.last` holds the most recent POST body.
 */
async function installAggregateMock(page, sink) {
  // Scope to the NEO endpoint only. A loose glob would also swallow Vite's source
  // module fetches (GeneralTab.jsx, GeneralLedgerConfigPage.jsx) and break the
  // dynamic import of the window. The endpoint always lives under /sws/neo/.
  await page.route(/\/sws\/neo\/general-ledger-configuration\/General(\?|$)/, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      try {
        sink.last = JSON.parse(req.postData() || '{}');
      } catch {
        sink.last = null;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [] } }),
      });
      return;
    }
    // Mount GET → empty so the hook falls back to its mock seed.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ response: { data: [] } }),
    });
  });
}

test.describe('General Ledger Configuration — behavioral (mocked)', () => {
  /** @type {{ last: any }} */
  let post;

  test.beforeEach(async ({ page }) => {
    post = { last: null };
    await login(page);
    // Seed a selected org before boot so the save boundary is reachable.
    await page.addInitScript((org) => {
      localStorage.setItem('sf_auth_selected_org', JSON.stringify(org));
    }, SEED_ORG);
    await installAggregateMock(page, post);
    await page.goto('/general-ledger-configuration');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page.getByTestId('glc-tab-0')).toBeVisible({ timeout: 15_000 });
  });

  test('renders the 4 tabs in order with the documents count badge and a disabled save', async ({ page }) => {
    for (let i = 0; i < 4; i++) {
      await expect(page.getByTestId(`glc-tab-${i}`)).toBeVisible();
    }
    // Pristine form → save disabled.
    await expect(page.getByTestId('glc-save')).toBeDisabled();
    // Documentos badge shows the seed count (8).
    await expect(page.getByTestId('glc-tab-3')).toContainText('8');
  });

  test('navigates across all 4 tabs', async ({ page }) => {
    await page.getByTestId('glc-tab-0').click();
    await expect(page.getByTestId('glc-section-identity')).toBeVisible();

    await page.getByTestId('glc-tab-1').click();
    await expect(page.locator('[data-testid^="glc-defaults-group-"]').first()).toBeVisible();

    await page.getByTestId('glc-tab-2').click();
    await expect(page.getByTestId('glc-section-dimensions')).toBeVisible();

    await page.getByTestId('glc-tab-3').click();
    await expect(page.locator('[data-testid^="glc-doc-"]').first()).toBeVisible();
  });

  test('editing a General field flips dirty state, enables save, and POSTs the dirty payload', async ({ page }) => {
    const save = page.getByTestId('glc-save');
    await expect(save).toBeDisabled();

    const nameInput = page.getByTestId('glc-field-name').getByRole('textbox');
    await nameInput.fill('Contabilidad España — Norte');

    await expect(save).toBeEnabled();
    await save.click();

    await expect.poll(() => post.last).not.toBeNull();
    expect(post.last).toMatchObject({
      general: { name: 'Contabilidad España — Norte' },
      defaults: {},
      dimensions: [],
      selectedOrgId: SEED_ORG.id,
    });
    // Unbacked placeholders never leak into the payload.
    expect(post.last.general).not.toHaveProperty('conversionType');
    expect(post.last.general).not.toHaveProperty('costPrecision');
    expect(post.last.general).not.toHaveProperty('autoReconciliation');
    expect(post.last.general).not.toHaveProperty('journalNumbering');
  });

  test('inverted period toggle: turning "closed periods" ON maps to automaticPeriodControl=false', async ({ page }) => {
    const toggle = page.getByTestId('glc-toggle-closed-periods-switch');
    // Seed automaticPeriodControl=true ⇒ "closed periods" starts OFF.
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();

    await page.getByTestId('glc-save').click();

    await expect.poll(() => post.last).not.toBeNull();
    expect(post.last.general).toMatchObject({ automaticPeriodControl: false });
  });

  test('dimensions: toggling an optional row marks dirty and POSTs the dimension change', async ({ page }) => {
    await page.getByTestId('glc-tab-2').click();
    await expect(page.getByTestId('glc-section-dimensions')).toBeVisible();

    // dim-pr (Producto) is active + optional in the seed → deactivate it.
    const producto = page.getByTestId('glc-dim-dim-pr-switch');
    await expect(producto).toBeEnabled();
    await expect(producto).toBeChecked();
    await producto.click();
    await expect(producto).not.toBeChecked();

    await page.getByTestId('glc-save').click();

    await expect.poll(() => post.last).not.toBeNull();
    expect(post.last.dimensions).toContainEqual({ id: 'dim-pr', active: false, mandatory: false });
  });

  test('dimensions: a mandatory row cannot be deactivated', async ({ page }) => {
    await page.getByTestId('glc-tab-2').click();
    // dim-cc (Centro de coste) is mandatory → switch is disabled.
    const mandatory = page.getByTestId('glc-dim-dim-cc-switch');
    await expect(mandatory).toBeDisabled();
    await expect(mandatory).toBeChecked();
  });

  test('the 4 unbacked placeholders render their marker and stay non-persistent', async ({ page }) => {
    // Two selects on the General tab.
    await expect(page.getByTestId('glc-field-conversion-type').getByTestId('glc-unbacked-hint')).toBeVisible();
    await expect(page.getByTestId('glc-field-cost-precision').getByTestId('glc-unbacked-hint')).toBeVisible();
    // Two toggles in Políticas contables — disabled + marked.
    await expect(page.getByTestId('glc-toggle-auto-reconciliation').getByTestId('glc-unbacked-hint')).toBeVisible();
    await expect(page.getByTestId('glc-toggle-journal-numbering').getByTestId('glc-unbacked-hint')).toBeVisible();
    await expect(page.getByTestId('glc-toggle-auto-reconciliation-switch')).toBeDisabled();
    await expect(page.getByTestId('glc-toggle-journal-numbering-switch')).toBeDisabled();
  });

  test('read-only: Calendario fiscal and Organización are not editable inputs', async ({ page }) => {
    const org = page.getByTestId('glc-field-organization');
    await expect(org).toBeVisible();
    await expect(org.getByRole('textbox')).toHaveCount(0);

    const calendar = page.getByTestId('glc-field-calendar');
    await expect(calendar).toBeVisible();
    await expect(calendar.getByRole('textbox')).toHaveCount(0);
  });

  test('Documentos tab is read-only with "Mapeado" chips and no edit controls', async ({ page }) => {
    await page.getByTestId('glc-tab-3').click();
    const rows = page.locator('[data-testid^="glc-doc-"]');
    await expect(rows.first()).toBeVisible();
    await expect(rows).toHaveCount(8);

    // Every row shows a green "Mapeado" status chip.
    await expect(page.getByText(/mapeado/i).first()).toBeVisible();
    // No switches, inputs or comboboxes in the read-only table.
    const panel = page.getByTestId('DocumentsTab__79cd86');
    await expect(panel.getByRole('switch')).toHaveCount(0);
    await expect(panel.getByRole('textbox')).toHaveCount(0);
  });
});
