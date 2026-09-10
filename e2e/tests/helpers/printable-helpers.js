import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login } from './auth.js';
import { waitForDetailReady } from './purchase-helpers.js';

/**
 * Shared helpers for the printable-download specs (sales and purchase flows).
 *
 * A document printable is produced by the app itself and rendered by jsreport:
 * the browser POSTs template + helpers + data inline to `/jsreport/api/report`,
 * so jsreport needs no database and no mounted templates. Only the seven windows
 * in `documentPdfRegistry.js` take that path; every other window's print button
 * resolves to a `print-<window>` artifact served by report-server instead — a
 * different service, and one that is NOT reachable under `vite preview`.
 */

// Reached through vite's `/jsreport` proxy rather than :5488 directly, so the
// checks below also prove the proxy hop the browser actually uses — not just
// that some service happens to be listening on the host.
export const JSREPORT_PING = '/jsreport/api/ping';

export const PDF_MAGIC = '%PDF-';

export function loadOnboardingCredentials() {
  try {
    return JSON.parse(readFileSync(resolve(import.meta.dirname, '../../.auth-credentials.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Log in and assert jsreport is reachable.
 *
 * The precondition is an ASSERTION, never a skip: an absent service that skips
 * reads as a pass, which is exactly the failure these specs exist to catch.
 * `scripts/run-e2e-full.sh` provisions jsreport best-effort; this is what makes
 * its absence loud.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function loginAndAssertJsreport(page) {
  const creds = loadOnboardingCredentials();

  await test.step('Login', async () => {
    await login(page, {
      user: creds?.email || process.env.E2E_USER,
      password: creds?.password || process.env.E2E_PASSWORD,
    });
  });

  await test.step('jsreport must be reachable (asserted, never skipped)', async () => {
    const ping = await page.request.get(JSREPORT_PING);
    expect(
      ping.ok(),
      `jsreport must answer ${JSREPORT_PING} (got HTTP ${ping.status()}). It renders every `
      + `printable, so without it this spec proves nothing. Locally: `
      + `make report-build && make report-serve-detach. In CI it is the pod's jsreport sidecar.`,
    ).toBeTruthy();
  });
}

/**
 * Reload until the document reports a completed status.
 *
 * Confirming fires several POSTs to /sws/neo/ and the status is not necessarily
 * committed by the time the one we awaited resolves, so a single reload-then-
 * assert is racy (it flaked on the invoice stage, reading "Borrador" for 15s).
 * Retrying the whole navigate-and-check makes it wait for the real state change
 * instead of for a request that may not have been the confirm.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label document under test, used in failure messages
 */
export async function waitUntilCompleted(page, label) {
  await expect(async () => {
    await page.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForDetailReady(page);
    await expect(page.getByTestId('document-status-pill').first())
      .toContainText(/completado|registrado|booked|completed/i, { timeout: 5_000 });
  }, `${label} should reach a completed status after confirming`).toPass({ timeout: 90_000 });
}

/**
 * Open the detail print drawer, download, and assert the bytes are a real PDF.
 *
 * The printer button is icon-only, so its accessible name comes from its title.
 * It only renders once the document reached the status its `hidePrintWhen`
 * allows — a "button not found" here means the document is not printable yet,
 * not that the page needed more time.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} label document under test, used in failure messages
 * @returns {Promise<number>} size of the downloaded PDF in bytes
 */
export async function downloadAndAssertPdf(page, label) {
  await page.getByRole('button', { name: /^(imprimir|print)$/i }).click();

  // Opening the drawer is what triggers the jsreport render; Download then
  // saves the blob that render produced.
  const downloadBtn = page.getByRole('button', { name: /^(descargar|download)$/i });
  await expect(downloadBtn, `${label}: print drawer should expose a Download button`)
    .toBeVisible({ timeout: 30_000 });
  await expect(downloadBtn).toBeEnabled({ timeout: 60_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    downloadBtn.click(),
  ]);

  const path = await download.path();
  expect(path, `${label}: Playwright should have persisted the downloaded file`).toBeTruthy();
  const bytes = readFileSync(path);

  // Assert the CONTENT, not merely that a download event fired: a 0-byte file or
  // an HTML error page would satisfy the event and hide a broken render.
  expect(
    bytes.subarray(0, PDF_MAGIC.length).toString('latin1'),
    `${label}: downloaded ${download.suggestedFilename()} should start with the PDF magic bytes`,
  ).toBe(PDF_MAGIC);
  expect(
    bytes.length,
    `${label}: a rendered document should be more than a stub PDF`,
  ).toBeGreaterThan(1000);

  // Leave the drawer closed so the next stage can navigate freely.
  await page.keyboard.press('Escape');
  return bytes.length;
}
