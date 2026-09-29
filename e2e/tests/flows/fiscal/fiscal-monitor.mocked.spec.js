import { test, expect } from '@playwright/test';
import { login, navigateTo } from '../../helpers/auth.js';
import { t } from '../../helpers/i18n.js';

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

test.describe('Fiscal Monitor — period toggle removed (ETP-5432)', () => {
  test('the SII section renders with no Periodo actual/anterior toggle', async ({ page }) => {
    await loginWithOrg(page);
    await installFiscalMonitorMocks(page, { siiCfg: SII_CFG, siiCount: 10 });
    await navigateTo(page, 'fiscal-monitor');

    // SII section renders normally...
    await expect(page.getByTestId('fm-tabs').first()).toBeVisible({ timeout: 8_000 });

    // ...but the previous-period selector (standard segmented control + compact
    // dropdown) is gone for good — see docs/generated-custom-windows/fiscal-monitor.md
    // "Period toggle" and commit ac71bc772 (root cause deferred, not fixed).
    await expect(page.getByTestId('fm-period-toggle')).toHaveCount(0);
    await expect(page.getByText(t('fiscalMonitor.sii.period.previous'))).toHaveCount(0);
  });
});
