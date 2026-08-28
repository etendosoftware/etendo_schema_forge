import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Proof of Concept menu (`proof-of-concept-menu`) — visibility gate. ETP-4694.
 *
 * The Vite environment is fixed when the server starts. Skips itself
 * (E2E_PROOF_OF_CONCEPT_MENU_FLAG) if run against a server started with
 * VITE_FEATURE_FLAGS='{"proof-of-concept-menu":true}'.
 *
 *   npx vite --port 3103
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3103 \
 *     npx playwright test tests/flows/proof-of-concept-menu.mocked.spec.js --project=mocked
 */

const FLAG_ON = process.env.E2E_PROOF_OF_CONCEPT_MENU_FLAG === 'on';

test.describe('Proof of Concept menu — flag gating', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('flag off: the internal section is not offered', async ({ page }) => {
    test.skip(FLAG_ON, 'Requires a dev server started without VITE_FEATURE_FLAGS');

    await expect(page.getByTestId('menu-group-proof-of-concept')).toHaveCount(0);
  });
});
