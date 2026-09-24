import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/** Browser contract for the server-owned transfer row on a productive environment. */
const PRODUCTIVE_ENVIRONMENT = {
  clientId: 'e2e-mock-client', clientName: 'Productive Test', plan: 'productive',
};

async function openFirstSteps(page, { enabled = true, status = 'RUNNING' } = {}) {
  await login(page);
  const transfer = {
    status,
    products: { completed: 2, total: 5 },
    contacts: { completed: 1, total: 3 },
  };
  const retryRequests = [];

  // Install these after login(): its generic /sws/** route otherwise wins.
  await page.route('**/sws/go/environments', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ environments: [PRODUCTIVE_ENVIRONMENT] }),
  }));
  await page.route('**/sws/go/onboarding/first-steps**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ status: 'success', firstSteps: { v: 1, seen: true, completed: [] } }),
  }));
  await page.route('**/sws/go/demo-data-transfer/retry', (route) => {
    retryRequests.push(route.request().method());
    transfer.status = 'RUNNING';
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(transfer),
    });
  });
  await page.route('**/sws/go/demo-data-transfer', (route) => route.fulfill({
    status: enabled ? 200 : 404,
    contentType: 'application/json',
    body: JSON.stringify(enabled ? transfer : { error: { message: 'Unknown endpoint' } }),
  }));

  await page.goto('/first-steps');
  await expect(page.getByTestId('first-steps-page')).toBeVisible();
  return { transfer, retryRequests };
}

test.describe('First Steps demo data transfer', () => {
  test('shows server-owned progress while the transfer runs', async ({ page }) => {
    await openFirstSteps(page);

    await expect(page.getByTestId('first-steps-step-demo-data-transfer')).toBeVisible();
    await page.getByTestId('first-steps-title-demo-data-transfer').click();
    await expect(page.getByTestId('first-steps-data-transfer-progress')).toBeVisible();
    await expect(page.getByTestId('first-steps-done-demo-data-transfer')).toHaveCount(0);
    await expect(page.getByTestId('first-steps-data-transfer-retry')).toHaveCount(0);
    await expect(page.getByTestId('first-steps-toggle-demo-data-transfer')).toHaveCount(0);
  });

  test('retries a failed transfer through the server and returns to progress', async ({ page }) => {
    const { retryRequests } = await openFirstSteps(page, { status: 'FAILED' });

    await page.getByTestId('first-steps-title-demo-data-transfer').click();
    await expect(page.getByTestId('first-steps-data-transfer-retry')).toBeVisible();
    await page.getByTestId('first-steps-data-transfer-retry').click();

    await expect(page.getByTestId('first-steps-data-transfer-progress')).toBeVisible();
    await expect(page.getByTestId('first-steps-data-transfer-retry')).toHaveCount(0);
    expect(retryRequests).toEqual(['POST']);
  });

  test('hides the transfer row when the backend flag returns 404', async ({ page }) => {
    await openFirstSteps(page, { enabled: false });

    await expect(page.getByTestId('first-steps-step-demo-data-transfer')).toHaveCount(0);
    await expect(page.getByTestId('first-steps-data-transfer-retry')).toHaveCount(0);
  });
});
