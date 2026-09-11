import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { navigateTo } from '../helpers/auth.js';
import { loginAndAssertJsreport, PDF_MAGIC } from '../helpers/printable-helpers.js';

/**
 * List export ("Imprimir" in the list toolbar) — every window that offers it.
 *
 * This is a DIFFERENT print path from the document printables covered by
 * printable-download*.integration.spec.js, and the distinction matters because
 * the two are wired in different components and fail independently:
 *
 *   - list toolbar "Imprimir" → ReportDrawer  → exports the GRID (preview/PDF/
 *     Excel/CSV). Template, helpers and rows are all sent inline to jsreport, so
 *     it needs no `print-*` artifact and no per-window registration. That is why
 *     it works on windows that have no document printable at all.
 *   - detail printer icon → DocumentPrintDrawer → the DOCUMENT, which does need
 *     a documentPdfRegistry entry.
 *
 * Window list established EMPIRICALLY, by visiting each window and checking for
 * the button — not derived from decisions.json. Deriving it from config was
 * tried first and got 15 of 26 wrong: `hidePrint` is also passed directly to
 * ListView by custom components (e.g. custom/purchase-invoice/index.jsx), and
 * nine slugs with a decisions.json render "Window not found" because no
 * component is registered for them. Re-verify in the app, not in the config,
 * when adding a window here.
 *
 * Scoped to the DOCUMENT windows by team decision. The export also works on
 * master-data and configuration windows (chart-of-accounts, conversion-rates,
 * fiscal-calendar and simple-g-l-journal were all verified green), but they are
 * left out to keep this suite about the documents the business flows produce.
 *
 * Windows with an EMPTY list are still asserted, not skipped: `dataReady`
 * requires at least one row, so the export buttons are legitimately disabled
 * there. Asserting that disabled state is a real check (it is the app's
 * documented behaviour) and keeps every window visible in the report instead of
 * hiding it behind a skip.
 */

const WINDOWS = [
  'goods-shipment',
  'purchase-order',
  'return-material-receipt',
  'return-to-vendor-shipment',
  'sales-invoice',
  'sales-order',
  'sales-quotation',
];

test.describe('List export — every window with a list print button (integration)', () => {
  test.describe.configure({ timeout: 180_000 });

  for (const windowSlug of WINDOWS) {
    test(`list export renders a real PDF — ${windowSlug}`, async ({ page }) => {
      await loginAndAssertJsreport(page);

      await test.step(`Open ${windowSlug} and its report drawer`, async () => {
        await navigateTo(page, windowSlug);

        // Scoped to the list toolbar: once the drawer opens it renders an
        // "Imprimir" of its own, so an unscoped locator becomes ambiguous.
        const listPrintBtn = page.getByRole('button', { name: /^(imprimir|print)$/i }).first();
        await expect(listPrintBtn, `${windowSlug} should expose a list print button`)
          .toBeVisible({ timeout: 30_000 });
        await listPrintBtn.click();
      });

      const recordCount = await test.step('Wait for the drawer to finish loading records', async () => {
        const counter = page.getByText(/\d+\s+(registros|records)/i).first();
        await expect(counter, `${windowSlug}: drawer should report how many records it loaded`)
          .toBeVisible({ timeout: 60_000 });
        const text = (await counter.textContent()) || '';
        return Number(text.match(/(\d+)/)?.[1] ?? 0);
      });

      const pdfBtn = page.getByRole('button', { name: /^pdf$/i });

      if (recordCount === 0) {
        // Not a failure and not a skip: with no rows there is nothing to export,
        // and the app disables the formats on purpose. Assert exactly that.
        await expect(
          pdfBtn,
          `${windowSlug}: with 0 records the PDF export must be disabled, not silently broken`,
        ).toBeDisabled({ timeout: 15_000 });
        test.info().annotations.push({ type: 'no-data', description: `${windowSlug}: list is empty` });
        return;
      }

      await test.step(`Export ${recordCount} records to PDF`, async () => {
        await expect(
          pdfBtn,
          `${windowSlug}: PDF export should be enabled with ${recordCount} records `
          + `(it is disabled when jsreport is unreachable)`,
        ).toBeEnabled({ timeout: 30_000 });

        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 90_000 }),
          pdfBtn.click(),
        ]);

        const path = await download.path();
        expect(path, `${windowSlug}: Playwright should have persisted the download`).toBeTruthy();
        const bytes = readFileSync(path);

        // Assert the CONTENT, not merely that a download event fired: a 0-byte
        // file or an HTML error page would satisfy the event just as well.
        expect(
          bytes.subarray(0, PDF_MAGIC.length).toString('latin1'),
          `${windowSlug}: downloaded ${download.suggestedFilename()} should start with the PDF magic bytes`,
        ).toBe(PDF_MAGIC);
        expect(
          bytes.length,
          `${windowSlug}: a rendered listing should be more than a stub PDF`,
        ).toBeGreaterThan(1000);
      });
    });
  }
});
