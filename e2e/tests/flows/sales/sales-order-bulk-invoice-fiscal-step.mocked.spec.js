// @covers artifacts/sales-order/custom/BulkOrderMoreMenu.jsx
// @covers tools/app-shell/src/windows/custom/shared/InvoiceSifStep.jsx
import { test, expect } from '../../helpers/test.js';
import { login } from '../../helpers/auth.js';

/**
 * Pedido de Venta — "Crear facturas" from the selection bar's kebab, with a fiscal system active
 * (mocked, no backend).
 *
 * Before creating one invoice per selected order, the "Datos fiscales" step shows ONE editable
 * set of fiscal values for all of them: a field the orders share shows its value, a field that
 * differs shows "Según cada cliente / pedido" until the user sets it. Mandatory fields carry the
 * red `*`, an empty one blocks the confirm, and whatever the user sets reaches EVERY order's
 * createDraftInvoice POST as `sifFields`.
 *
 * What only an E2E can see: the real Radix Select in the portal dialog, the selection bar → kebab
 * → step → POST chain, and the per-order bodies as they leave the browser. The unit side
 * (`bulkOrderMoreMenus.quotaRefusal.vitest.jsx`, `InvoiceSifStep.vitest.jsx`) stubs the Select.
 *
 * Routes: TWO registrations per glob (`header/**` and `header**`), never the brace form — the
 * action POSTs are two segments deep (`/header/{id}/action/<name>`). See docs/e2e-testing-guide.md.
 */

const SPEC = 'sales-order';

const ORDERS = [
  { id: 'so-a', documentNo: 'SO/7001', key: 'F1' },
  { id: 'so-b', documentNo: 'SO/7002', key: 'F2' },
];

function buildRows() {
  return ORDERS.map(({ id, documentNo }, i) => ({
    id,
    documentNo,
    orderDate: `2026-11-0${i + 1}`,
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    processed: 'Y',
    businessPartner: `bp-${i}`,
    'businessPartner$_identifier': `Cliente ${i + 1} S.L.`,
    'currency$_identifier': 'EUR',
    grandTotalAmount: 121,
    summedLineAmount: 100,
    posted: 'N',
  }));
}

/**
 * Each order's preview: SII + VERI*FACTU, the SII key differs per customer and VERI*FACTU's type
 * comes empty on both (a shared mandatory field the user has to fill).
 */
function sifPreview(key) {
  return {
    systems: ['SII', 'Verifactu'],
    sales: true,
    rectificative: false,
    fields: { etsgDateOperation: '2026-11-12', aeatsiiClaveTipo: key, etvfacInvType: null },
    fieldSpecs: [
      { name: 'etsgDateOperation', system: 'SII', type: 'date' },
      { name: 'aeatsiiClaveTipo', system: 'SII', type: 'option', options: ['F1', 'F2'] },
      { name: 'etvfacInvType', system: 'Verifactu', type: 'option', options: ['F1', 'F2'] },
    ],
    siiAuthorizationAvailable: false,
  };
}

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function installMocks(page, { rows, state }) {
  const handler = async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const action = url.match(/\/header\/([^/?]+)\/action\/(\w+)/);
    if (action && method === 'POST') {
      const [, id, name] = action;
      if (name === 'sifDefaults') {
        const order = ORDERS.find(o => o.id === id);
        await route.fulfill(json({ response: { data: sifPreview(order?.key ?? 'F1') } }));
        return;
      }
      if (name === 'createDraftInvoice') {
        state.invoicePosts.push({ id, body: req.postDataJSON() });
        await route.fulfill(json({ response: { data: { id: `inv-${id}` } } }));
        return;
      }
    }
    const detail = url.match(/\/header\/([^/?]+)(\?|$)/);
    if (method === 'GET' && detail && !['selectors', 'defaults', 'evaluate-display'].includes(detail[1])) {
      await route.fulfill(json({ response: { data: [rows.find(r => r.id === detail[1]) ?? rows[0]] } }));
      return;
    }
    if (method === 'GET') {
      await route.fulfill(json({ response: { data: rows, totalRows: rows.length } }));
      return;
    }
    await route.fulfill(json({ response: { data: [] } }));
  };
  await page.route(`**/sws/neo/${SPEC}/header/**`, handler);
  await page.route(`**/sws/neo/${SPEC}/header**`, handler);

  const empty = route => route.fulfill(json({ response: { data: [], totalRows: 0 } }));
  await page.route(`**/sws/neo/${SPEC}/lines/**`, empty);
  await page.route(`**/sws/neo/${SPEC}/lines**`, empty);
}

/** The row checkbox input is `sr-only` behind a styled div: `force` is required. */
async function selectRow(page, id) {
  await page.getByTestId(`row-${id}`).locator('input[type="checkbox"]').first().check({ force: true });
}

test.describe('sales-order — bulk "Crear facturas" with the editable fiscal data step', () => {
  let state;

  test.beforeEach(async ({ page }) => {
    state = { invoicePosts: [] };
    await login(page);
    await installMocks(page, { rows: buildRows(), state });
    await page.goto(`/${SPEC}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  });

  test('marks mandatory fields, blocks while one is empty, and sends the chosen values in every POST', async ({ page }) => {
    for (const { documentNo } of ORDERS) {
      await expect(page.locator('tbody tr').filter({ hasText: documentNo }).first()).toBeVisible({ timeout: 10_000 });
    }
    for (const { id } of ORDERS) await selectRow(page, id);

    const bar = page.getByTestId('SelectionToolbar__620cbc');
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await bar.getByTestId('Button__3f1293').click();
    await page.getByRole('menuitem', { name: /^(Crear facturas|Create invoices)/ }).click();

    const modal = page.getByTestId('invoice-sif-step-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    expect(state.invoicePosts).toHaveLength(0);

    // Editable, with the red `*` on the mandatory fields.
    const claveTipo = modal.getByTestId('SelectTrigger__sifstep_aeatsiiClaveTipo');
    const vfType = modal.getByTestId('SelectTrigger__sifstep_etvfacInvType');
    await expect(claveTipo).toBeEnabled();
    await expect(modal.getByTestId('RequiredMark__sifstep_sif-step-aeatsiiClaveTipo')).toBeVisible();
    await expect(modal.getByTestId('RequiredMark__sifstep_sif-step-etvfacInvType')).toBeVisible();
    await expect(vfType).toHaveAttribute('aria-required', 'true');
    // The SII key differs per customer: no value of its own, the "per customer" note instead.
    await expect(modal.getByTestId('Varies__sifstep_aeatsiiClaveTipo')).toBeVisible();

    // VERI*FACTU's type is empty on both orders: the confirm is blocked.
    const confirm = modal.getByTestId('invoice-sif-step-modal-confirm');
    await expect(confirm).toBeDisabled();
    await expect(modal.getByTestId('invoice-sif-step-required')).toBeVisible();

    await vfType.click();
    await page.getByTestId('SelectItem__sifstep_F2').click();
    await expect(vfType).toContainText('F2 - ');
    await expect(confirm).toBeEnabled();

    // Setting the varying SII key makes it apply to every order.
    await claveTipo.click();
    await page.getByTestId('SelectItem__sifstep_F1').click();
    await expect(modal.getByTestId('Varies__sifstep_aeatsiiClaveTipo')).toHaveCount(0);

    await confirm.click();
    await expect.poll(() => state.invoicePosts.length, { timeout: 15_000 }).toBe(2);
    const byId = Object.fromEntries(state.invoicePosts.map(p => [p.id, p.body]));
    for (const { id } of ORDERS) {
      expect(byId[id]).toEqual({
        sifFields: { etsgDateOperation: '2026-11-12', aeatsiiClaveTipo: 'F1', etvfacInvType: 'F2' },
      });
    }
  });
});
