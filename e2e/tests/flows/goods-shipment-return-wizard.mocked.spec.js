import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Goods Shipment — Return Wizard (mocked) — ETP-4031
 *
 * Validates ReturnWizard step 2 quality:
 *   - "Crear Devolución" button gating (isCompleted && canCreateReturn)
 *   - Wizard dialog opens with Spanish title
 *   - Step 1: lines load, "Siguiente" enabled when lines have qty > 0
 *   - Step 2: document card shows correct translated strings,
 *             no credit-note card (was removed), confirm button in Spanish
 *
 * No backend required — all API calls are intercepted after login() (LIFO order).
 *
 * Route isolation: "goodsShipmentLine" URLs must NOT be captured by the
 * "goodsShipment" handler. We use URL predicate functions.
 */

// ---------------------------------------------------------------------------
// Shared mock data helpers
// ---------------------------------------------------------------------------

function makeShipment(overrides) {
  return {
    id: 'mock-gs-001',
    documentNo: 'GS-TEST-001',
    documentStatus: 'CO',
    'documentStatus$_identifier': 'Completado',
    processed: true,
    businessPartner: 'bp-001',
    'businessPartner$_identifier': 'Test Client',
    movementDate: '2026-05-01',
    warehouse: 'wh-001',
    'warehouse$_identifier': 'Almacén Principal',
    invoiceStatus: 0,
    completelyInvoiced: false,
    invoiced: false,
    returnReceipts: [],
    linkedOrders: [],
    ...overrides,
  };
}

/**
 * Install the base goods-shipment mock.
 * Must be called AFTER login() so it takes priority (LIFO) over the generic catch-all.
 *
 * Additional route overrides (e.g. lines with real data, createReturn) must be
 * registered AFTER this function so they win over it (LIFO: last registered = first checked).
 */
async function installGoodsShipmentMock(page, records) {
  // Lines endpoint — installed FIRST (lower LIFO priority). Default: empty.
  await page.route(
    (url) => url.href.includes('/sws/neo/goods-shipment/goodsShipmentLine'),
    async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
        });
        return;
      }
      route.fallback();
    }
  );

  // Header entity (list + detail) — installed SECOND (higher LIFO priority).
  await page.route(
    (url) =>
      url.href.includes('/sws/neo/goods-shipment/goodsShipment') &&
      !url.href.includes('/goodsShipmentLine'),
    async (route) => {
      const req = route.request();
      const url = req.url();

      if (req.method() !== 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [] } }),
        });
        return;
      }

      const detailMatch = url.match(/\/goodsShipment\/([^/?]+)(\?.*)?$/);
      if (
        detailMatch &&
        !['evaluate-display', 'defaults', 'selectors', 'action'].includes(detailMatch[1])
      ) {
        const id = detailMatch[1];
        const found = records.find((r) => r.id === id) ?? records[0];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: { data: [found] } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: records, totalRows: records.length } }),
      });
    }
  );
}

// ---------------------------------------------------------------------------
// Return Wizard spec
// ---------------------------------------------------------------------------

test.describe('Goods Shipment — Return Wizard step 2 quality (no credit note, translated strings)', () => {
  test('opens wizard, advances to step 2, asserts Spanish content and no credit note', async ({ page }) => {
    // 1. Completed shipment with canCreateReturn=true (backend-computed field, shows "Crear Devolución" button)
    const shipment = makeShipment({
      id: 'gs-return-001',
      documentNo: 'GS-RETURN-001',
      documentStatus: 'CO',
      'documentStatus$_identifier': 'Completado',
      processed: true,
      returnReceipts: [],
      canCreateReturn: true,
    });

    await login(page);
    await installGoodsShipmentMock(page, [shipment]);

    // 2. Mock the action endpoint the wizard uses to fetch available return lines.
    //    ETP-4299 changed the fetch from GET goodsShipmentLine to POST availableShipmentLines.
    //    Registered AFTER installGoodsShipmentMock → takes LIFO priority.
    await page.route(
      (url) => url.href.includes('/sws/neo/return-material-receipt/returnMaterialReceipt/_/action/availableShipmentLines'),
      async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              response: {
                data: [
                  {
                    id: 'line-001',
                    'product$_identifier': 'Producto A',
                    movementQuantity: 5,
                    product: 'prod-001',
                  },
                  {
                    id: 'line-002',
                    'product$_identifier': 'Producto B',
                    movementQuantity: 3,
                    product: 'prod-002',
                  },
                ],
                totalRows: 2,
              },
            }),
          });
          return;
        }
        route.fallback();
      }
    );

    // 3. Mock createReturn POST (for when wizard submits at step 2)
    //    URL pattern used by ReturnWizard: ${apiBaseUrl}/goodsShipment/${shipmentData.id}/action/createReturn
    await page.route(
      (url) =>
        url.href.includes('/goodsShipment/gs-return-001/action/createReturn'),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            response: { data: { id: 'ret-001' } },
          }),
        });
      }
    );

    // 4. Navigate to the shipment detail
    await page.goto('/goods-shipment/gs-return-001');
    await page.getByTestId('action-cancel').waitFor({ state: 'visible', timeout: 15_000 });

    // 5. "Crear Devolución" button is visible (isCompleted && !hasReturn)
    const createReturnBtn = page.getByRole('button', { name: 'Crear Devolución' });
    await expect(createReturnBtn).toBeVisible({ timeout: 10_000 });

    // 6. Click "Crear Devolución"
    await createReturnBtn.click();

    // 7. Dialog opens with the correct Spanish title
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await expect(
      dialog.getByRole('heading', { name: 'Crear Devolución desde Envío' })
    ).toBeVisible({ timeout: 5_000 });

    // 8. Step indicator is visible (StepIndicator renders dots + text like "1 de 2")
    //    The component renders: ui('stepOf').replace('{step}', 1).replace('{total}', 2)
    //    In es_ES this renders as "1 de 2"
    await expect(dialog.getByText(/1 de 2/)).toBeVisible({ timeout: 5_000 });

    // 9. Wait for lines to load (fetched when wizardOpen becomes true)
    //    Lines appear in the table — assert "Producto A" and "Producto B" are visible
    await expect(dialog.getByText('Producto A')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Producto B')).toBeVisible({ timeout: 5_000 });

    // 10. "Siguiente" button is enabled
    //    canProceed = selectedLines.length > 0 && selectedLines.every(l => quantities[l.id] > 0)
    //    Both lines are selected by default and have movementQuantity > 0
    const nextBtn = dialog.getByRole('button', { name: 'Siguiente' });
    await expect(nextBtn).toBeVisible({ timeout: 5_000 });
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 });

    // 11. Click "Siguiente" to advance to step 2
    await nextBtn.click();

    // 12. Step 2: "Se crearán los siguientes documentos:" visible
    await expect(
      dialog.getByText('Se crearán los siguientes documentos:')
    ).toBeVisible({ timeout: 5_000 });

    // 13. "Recepción de Devolución" card visible
    await expect(dialog.getByText('Recepción de Devolución')).toBeVisible({ timeout: 5_000 });

    // 14. Card subtitle: "Movimiento de stock de vuelta al almacén"
    await expect(
      dialog.getByText('Movimiento de stock de vuelta al almacén')
    ).toBeVisible({ timeout: 5_000 });

    // 15. NO credit-note card — the word "nota" or "crédito" must not appear
    await expect(dialog.getByText(/nota de crédito/i)).toHaveCount(0);
    await expect(dialog.getByText(/credit note/i)).toHaveCount(0);
    await expect(dialog.getByText(/nota crédito/i)).toHaveCount(0);

    // 16. Confirm button text is "Crear Devolución" in Spanish — NOT English "Confirm return"
    //    The footer in step 2 renders: loading ? ui('creating') : ui('createReturn')
    //    ui('createReturn') = "Crear Devolución"
    const confirmBtn = dialog.getByRole('button', { name: 'Crear Devolución' });
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });

    // 17. "Confirm return" text must have count 0 — no English leakage
    await expect(page.getByText('Confirm return', { exact: true })).toHaveCount(0);

    // 18. "Creating..." text must have count 0 — translated to "Creando..."
    await expect(page.getByText('Creating...', { exact: true })).toHaveCount(0);

    // 19. "Atrás" button visible in footer (step 2 back button)
    await expect(dialog.getByRole('button', { name: 'Atrás' })).toBeVisible({ timeout: 5_000 });

    // 20. Step 2 indicator shows "2 de 2"
    await expect(dialog.getByText(/2 de 2/)).toBeVisible({ timeout: 5_000 });
  });
});
