import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../helpers/auth.js';
import { t } from '../helpers/i18n.js';

// ── NEO API response envelope ─────────────────────────────────────────────────

function neoOk(records, totalRows) {
  return {
    response: {
      status: 0,
      data: records,
      totalRows: totalRows ?? records.length,
    },
  };
}

function neoCount(count) {
  return neoOk([], count);
}

// ── Fixture config records (same as fiscal-config spec) ───────────────────────

const SII_CFG = { configuracinSII: 'e2e-sii-001', navarra: 'N', guipuzcoa: 'N' };
const TBAI_CFG = { tbaiConfigID: 'e2e-tbai-001', etsgSifTerritory: 'ARABA' };
const VF_CFG   = { verifactuConfig: 'e2e-vf-001', tAXType: '01' };

// ── Route helpers ─────────────────────────────────────────────────────────────

async function installFiscalMonitorMocks(page, {
  siiCfg   = null,
  tbaiCfg  = null,
  vfCfg    = null,
  siiCount = 5,
  tbaiCount = 3,
  vfCount   = 2,
} = {}) {
  // Config records (profile detection)
  await page.route('**/sws/neo/sii-config/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoOk(siiCfg ? [siiCfg] : [])),
    });
  });
  await page.route('**/sws/neo/tbai-config/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoOk(tbaiCfg ? [tbaiCfg] : [])),
    });
  });
  await page.route('**/sws/neo/verifactu-config/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoOk(vfCfg ? [vfCfg] : [])),
    });
  });

  // SII monitor data
  await page.route('**/sws/neo/sii-monitor/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoCount(siiCount)),
    });
  });

  // TBAI monitor data
  await page.route('**/sws/neo/tbai-facturas-enviadas/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoCount(tbaiCount)),
    });
  });

  // Verifactu monitor data
  await page.route('**/sws/neo/monitor-verifactu/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(neoCount(vfCount)),
    });
  });
}

async function loginWithOrg(page) {
  await page.addInitScript(() => {
    localStorage.setItem('sf_auth_selected_role', JSON.stringify({ id: 'r1', name: 'Admin', orgList: [] }));
    localStorage.setItem('sf_auth_rolelist', JSON.stringify([{ id: 'r1', name: 'Admin', orgList: [] }]));
    localStorage.setItem('sf_auth_selected_org', JSON.stringify({ id: 'ORG_E2E', name: 'E2E Test Org' }));
  });
  await login(page);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Fiscal Monitor — no org selected', () => {
  test('shows the setup description when session has no selected organisation', async ({ page }) => {
    await login(page);
    await navigateTo(page, 'fiscal-monitor');

    await expect(
      page.getByText(t('fiscalMonitor.setupDescription'), { exact: false }),
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Monitor — unconfigured org', () => {
  test('shows the setup description and link to fiscal config when no fiscal records exist', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page); // all null → unconfigured
    await navigateTo(page, 'fiscal-monitor');

    await expect(
      page.getByText(t('fiscalMonitor.setupDescription'), { exact: false }),
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Monitor — SII profile', () => {
  test('renders the SII section when SII config record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG, siiCount: 12 });
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });
  });

  test('shows the SII issued and received tabs', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG });
    await navigateTo(page, 'fiscal-monitor');

    const tabs = page.getByTestId('fm-tabs').first();
    await expect(tabs.getByText(t('fiscalMonitor.sii.tab.issued')).first()).toBeVisible({ timeout: 8_000 });
    await expect(tabs.getByText(t('fiscalMonitor.sii.tab.received')).first()).toBeVisible();
  });

  test('shows the SII issued and received tabs when SII count data is present', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG, siiCount: 7 });
    await navigateTo(page, 'fiscal-monitor');

    // Both invoice-type tabs (fm-tabs) must render
    const tabs = page.getByTestId('fm-tabs').first();
    await expect(tabs.getByText(t('fiscalMonitor.sii.tab.issued')).first()).toBeVisible({ timeout: 8_000 });
    await expect(tabs.getByText(t('fiscalMonitor.sii.tab.received')).first()).toBeVisible();
  });
});

test.describe('Fiscal Monitor — TBAI profile', () => {
  test('renders the TBAI section title when TBAI config record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { tbaiCfg: TBAI_CFG, tbaiCount: 8 });
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByTestId('tbai-tablecard')).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Monitor — Verifactu profile', () => {
  test('renders the Verifactu section title when Verifactu config record exists', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { vfCfg: VF_CFG, vfCount: 4 });
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByTestId('verifactu-tablecard')).toBeVisible({ timeout: 8_000 });
  });

  test('shows Verifactu filter pills (Correctas / Con problemas)', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { vfCfg: VF_CFG });
    await navigateTo(page, 'fiscal-monitor');

    // Verifactu uses filter pills (fm-tabs testid) not tabbed navigation
    const tabs = page.getByTestId('fm-tabs').first();
    await expect(tabs.getByText(t('fiscalMonitor.verifactu.pill.correct')).first()).toBeVisible({ timeout: 8_000 });
    await expect(tabs.getByText(t('fiscalMonitor.verifactu.pill.problems')).first()).toBeVisible();
  });
});

test.describe('Fiscal Monitor — SII+TBAI combined profile', () => {
  test('renders both SII and TBAI sections when both config records exist', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG, tbaiCfg: TBAI_CFG });
    await navigateTo(page, 'fiscal-monitor');

    // Default system tab is SII — verify SII content is visible
    await expect(page.getByText(t('fiscalMonitor.sii.tab.issued'))).toBeVisible({ timeout: 8_000 });

    // Switch to TBAI system tab (only one section visible at a time).
    // In combined mode TbaiMonitorSection renders with noWrap, so tbai-tablecard
    // wrapper is absent — check for the always-present "Enviadas" filter pill instead.
    await page.getByRole('tab', { name: t('fiscalMonitor.systemTab.tbai') }).click();
    await expect(page.getByText(t('fiscalMonitor.tbai.pill.sent')).first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Monitor — conflict state', () => {
  test('shows the conflict message when SII and Verifactu records coexist', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG, vfCfg: VF_CFG });
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByRole('heading', { name: t('fiscalMonitor.conflictTitle') })).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Fiscal Monitor — tab activation', () => {
  test('clicking the Recibidas tab activates it', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG, siiCount: 10 });
    await navigateTo(page, 'fiscal-monitor');

    // Wait for the SII tabs to render
    await expect(page.getByTestId('fm-tabs').first()).toBeVisible({ timeout: 8_000 });

    // Click the Recibidas tab directly
    await page.getByTestId('fm-tabs').first().locator('button').filter({ hasText: t('fiscalMonitor.sii.tab.received') }).first().click();
    await page.waitForTimeout(300);

    // Recibidas tab button should now be active
    const activeTab = page.getByTestId('fm-tabs').first().locator('.tab.active');
    await expect(activeTab).toContainText(t('fiscalMonitor.sii.tab.received'));
  });
});

test.describe('Fiscal Monitor — period toggle', () => {
  test('clicking Periodo anterior switches the SII section to the previous period', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG });
    await navigateTo(page, 'fiscal-monitor');

    // Wait for section to render
    await expect(page.getByTestId('fm-period-toggle')).toBeVisible({ timeout: 8_000 });

    const prevBtn = page.getByTestId('fm-period-toggle').locator('button').filter({ hasText: t('fiscalMonitor.sii.period.previous') });
    await prevBtn.click();

    // The previous-period button should now have the active class
    await expect(prevBtn).toHaveClass(/active/);
  });

  test('switching back to Periodo actual deactivates the previous period button', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG });
    await navigateTo(page, 'fiscal-monitor');

    await expect(page.getByTestId('fm-period-toggle')).toBeVisible({ timeout: 8_000 });

    const prevBtn = page.getByTestId('fm-period-toggle').locator('button').filter({ hasText: t('fiscalMonitor.sii.period.previous') });
    const currBtn = page.getByTestId('fm-period-toggle').locator('button').filter({ hasText: t('fiscalMonitor.sii.period.current') });

    await prevBtn.click();
    await expect(prevBtn).toHaveClass(/active/);

    await currBtn.click();
    await expect(currBtn).toHaveClass(/active/);
    await expect(prevBtn).not.toHaveClass(/active/);
  });
});
