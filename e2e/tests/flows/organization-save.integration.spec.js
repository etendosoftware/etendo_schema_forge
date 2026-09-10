import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { loadCredentials } from '../helpers/purchase-helpers.js';

/**
 * Organization save — live backend regression for ETP-5112 (REAL BACKEND).
 *
 * The mocked companion (`organization-save.mocked.spec.js`) proves the CLIENT contract:
 * every PATCH carries the `updated` token its own GET returned, and the two PATCHes are
 * serialized. It cannot prove the half that only exists on the server — that core
 * actually ACCEPTS both writes. Both bugs this ticket fixed were server responses:
 *
 *   - 400 `missing_updated` (ETP-5073's optimistic-locking token was never sent), and
 *   - 500 "The record you are saving has already been changed by another user", a FALSE
 *     conflict produced by core's non-thread-safe `SimpleDateFormat` in
 *     `JsonToDataConverter` when both PATCHes were parsed in the same millisecond.
 *
 * So this spec asserts on the real status codes: both `/organization/{id}` and
 * `/information/{id}` must answer 200. Before the fix, one of them answered 500 (or 400)
 * reproducibly.
 *
 * Skipped unless `E2E_ORGANIZATION_INTEGRATION=1` — it needs a live Etendo GO backend and
 * it WRITES to the tenant's own AD_Org/AD_OrgInfo record. Not run by any CI job.
 *
 * Run it explicitly against local Etendo (dev server on :3100, `make dev`):
 *
 *   cd e2e
 *   E2E_ORGANIZATION_INTEGRATION=1 E2E_USE_MOCK=0 E2E_PASSWORD=<pass> \
 *     npx playwright test tests/flows/organization-save.integration.spec.js --project=integration
 *
 * `E2E_USER`/`E2E_PASSWORD` are used unless `e2e/.auth-credentials.json` exists (written by
 * the onboarding project), same as the other integration specs.
 *
 * Isolation: the phone field is the only value written, it is set to a unique
 * timestamp-derived number, and the ORIGINAL value is restored in a `finally` — so a run
 * leaves the tenant exactly as it found it, and repeated runs never collide.
 * The phone is deliberately the chosen field: it is optional, free-text, has no callout,
 * no uniqueness constraint and no downstream effect, so writing it cannot invalidate any
 * other record. It also lives on `AD_OrgInfo` (the `information` entity) while the save
 * ALWAYS patches `AD_Org` (the `organization` entity) too — which is what makes a
 * single-field edit still exercise the two-entity write this ticket is about.
 */

const onboardingCreds = loadCredentials();
const RUN_INTEGRATION = process.env.E2E_ORGANIZATION_INTEGRATION === '1';

/** A unique, format-valid phone (digits only — see `isValidPhone` in recipientEdits.js). */
function uniquePhone() {
  return `6${String(Date.now()).slice(-8)}`;
}

/** Matches a PATCH response for one entity of the `organization` spec. */
function isOrganizationPatch(response, entity) {
  return response.request().method() === 'PATCH'
    && new RegExp(`/sws/neo/organization/${entity}/[^/?]+`).test(response.url());
}

/**
 * Saves the form and returns both PATCH responses.
 *
 * Both waiters are registered BEFORE the click so neither response can land first and be
 * missed. They are collected with `Promise.all` on the TEST side only — that is just how
 * two independent waiters are awaited; the app itself still issues the two PATCHes in
 * sequence, which is the behaviour under test.
 */
async function saveAndCaptureBothPatches(page) {
  const orgPatch = page.waitForResponse((r) => isOrganizationPatch(r, 'organization'), { timeout: 30_000 });
  const infoPatch = page.waitForResponse((r) => isOrganizationPatch(r, 'information'), { timeout: 30_000 });
  await page.getByTestId('OrganizationPage__save').click();
  return Promise.all([orgPatch, infoPatch]);
}

/** Asserts a PATCH succeeded, naming the two failure modes ETP-5112 fixed. */
async function expectPatchOk(response, entity) {
  const status = response.status();
  let body = '';
  if (status !== 200) body = await response.text().catch(() => '<unreadable body>');
  expect(
    status,
    `PATCH /${entity}/{id} answered ${status}. 400 means the \`updated\` token was not sent `
    + '(ETP-5073 / bug 1); 500 with "already been changed by another user" means the two PATCHes '
    + `overlapped again (bug 2 — useOrganizationData.js must await them in sequence). Body: ${body}`,
  ).toBe(200);

  // Bug 1 guard at the request level: a 200 could also be reached by a backend that stopped
  // enforcing the token, so assert the client actually sent one.
  const sent = response.request().postData();
  expect(
    sent && JSON.parse(sent).updated,
    `PATCH /${entity}/{id} went out without an \`updated\` token: ${sent}`,
  ).toBeTruthy();
}

test.describe('Organization save — two-entity write (ETP-5112, integration)', () => {
  test.describe.configure({ timeout: 300_000 });

  test.skip(
    !RUN_INTEGRATION,
    'Set E2E_ORGANIZATION_INTEGRATION=1 (plus E2E_USE_MOCK=0 and credentials) to run this live organization-save integration test.',
  );

  test('saves both entities with 200 and persists the change across a reload', async ({ page }) => {
    const user = onboardingCreds?.email || process.env.E2E_USER;
    const password = onboardingCreds?.password || process.env.E2E_PASSWORD;

    await test.step('Login and open /organization', async () => {
      await login(page, { user, password });
      await page.goto('/organization');
      await expect(page.getByTestId('OrganizationPage__phone')).toBeVisible({ timeout: 30_000 });
    });

    const phoneField = page.getByTestId('OrganizationPage__phone');
    // Captured AFTER the form has been seeded from the two GETs, so it is the real stored
    // value and not the empty initial state — restoring an empty string would otherwise
    // wipe a real phone number off the tenant.
    const originalPhone = await phoneField.inputValue();
    const newPhone = uniquePhone();
    expect(newPhone, 'The unique phone must differ from the stored one, or nothing is dirty and there is no save to make').not.toBe(originalPhone);

    try {
      await test.step('Change the phone and save — both PATCHes must answer 200', async () => {
        await phoneField.fill(newPhone);
        const [orgResponse, infoResponse] = await saveAndCaptureBothPatches(page);
        await expectPatchOk(orgResponse, 'organization');
        await expectPatchOk(infoResponse, 'information');
        await expect(page.locator('[data-type="error"]')).toHaveCount(0);
      });

      await test.step('Reload — the change persisted', async () => {
        await page.reload();
        await expect(page.getByTestId('OrganizationPage__phone')).toHaveValue(newPhone, { timeout: 30_000 });
      });
    } finally {
      // Restore in a finally so a failed assertion above still leaves the tenant clean.
      // Re-read the field after a reload: the record's `updated` token moved on with the
      // write, and the restoring PATCH needs the CURRENT one, which only a fresh GET
      // through the app can supply.
      await page.reload();
      const field = page.getByTestId('OrganizationPage__phone');
      await field.waitFor({ state: 'visible', timeout: 30_000 });
      if (await field.inputValue() !== originalPhone) {
        await field.fill(originalPhone);
        const [restoreOrg, restoreInfo] = await saveAndCaptureBothPatches(page);
        expect(restoreOrg.status(), 'Restoring the original phone must succeed, or the tenant is left dirty').toBe(200);
        expect(restoreInfo.status(), 'Restoring the original phone must succeed, or the tenant is left dirty').toBe(200);
      }
    }
  });
});
