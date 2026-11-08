import { test, expect } from '../../helpers/test.js';

/**
 * Company user invitation accepted through Google SSO (mocked) — ETP-4960.
 *
 * The issue that created this file (a follow-up to ETP-4958) exists because the
 * consumer test used to mock `LoginStep` away and the real SSO branch was
 * rendered in no test in either repo, so an SSO sign-in on the invitation page
 * authenticated the user and then never resumed the acceptance flow. The unit
 * test (`InviteAcceptancePage.vitest.jsx`) now renders the real component and
 * stubs only the SSO provider SDK; this spec is its end-to-end counterpart.
 *
 * The file name is the one the issue asks for. It sits under `flows/system/`
 * because ETP-5383 moved the specs into per-section folders and later dropped
 * the old, order-coupled invitation mocked file; this spec deliberately keeps a
 * single, self-contained case instead of reviving that set.
 *
 * Boundaries stubbed here: the backend (`page.route`) and Google's Identity SDK,
 * which Playwright cannot stub as a module in a production E2E build. Everything
 * between — `InviteAcceptancePage`, the shared `LoginStep`, its provider button
 * and its continuation — is the real component under test.
 *
 * @covers tools/app-shell/src/pages/InviteAcceptancePage.jsx
 */

const INVITE_TOKEN = 'sso-invite-token-e2e';
const INVITE_EMAIL = 'existing.employee@example.com';
const SSO_CREDENTIAL = 'e2e-google-credential';
const SSO_SESSION_TOKEN = 'sso-session-token';

/**
 * Define `window.google.accounts.id` before any app script. The shared
 * `LoginStep` renders its Google button through
 * `etendo-go-core`'s `renderSsoProviderButton` -> `loadGoogleIdentityScript`,
 * which short-circuits when `window.google.accounts.id` already exists and
 * otherwise loads `https://accounts.google.com/gsi/client` from Google's CDN.
 * The stub `renderButton` appends a button whose click fires the credential
 * callback `initialize` captured, i.e. the E2E analogue of the unit test
 * mocking `onboarding/sso`.
 *
 * `window.google` is only reached when the app is built with a
 * `VITE_GOOGLE_CLIENT_ID` (see `etendo-go-core/src/onboarding/sso.js` and the
 * mocked E2E build in `scripts/run-e2e-full.sh`); without it the provider list
 * is empty and no SSO button renders.
 */
async function stubGoogleIdentityProvider(page) {
  await page.addInitScript((credential) => {
    let credentialCallback = null;
    window.google = {
      accounts: {
        id: {
          initialize: (options) => { credentialCallback = options?.callback ?? null; },
          renderButton: (container) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('data-testid', 'google-sso-button');
            button.textContent = 'Acceder con Google';
            button.addEventListener('click', () => credentialCallback?.({ credential }));
            container.replaceChildren(button);
          },
        },
      },
    };
  }, SSO_CREDENTIAL);
}

test.describe('Company user invitation accepted through SSO — ETP-4960', () => {
  test('resumes the acceptance flow after an SSO login on the existing-account branch', async ({ page }) => {
    // ETP-5202's guard asks GET /sws/neo/session who is signed in and fails safe:
    // any answer that is not a 401 renders the "otra sesión abierta" conflict
    // screen instead of the acceptance flow. Unmocked, the request reaches the
    // preview server and answers the SPA shell, so declare "nobody is signed in".
    await page.route('**/sws/neo/session', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'unauthenticated', status: 401 } }),
    }));

    await page.route(`**/sws/go/company-invitations/resolve?token=${INVITE_TOKEN}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'SENT',
        clientName: 'Fictional Corp',
        email: INVITE_EMAIL,
        maskedEmail: 'e***e@example.com',
        branch: 'existing_account',
        accountExists: true,
      }),
    }));

    // The SSO session the real LoginStep obtains by posting the Google credential.
    let ssoRequestBody = null;
    await page.route('**/sws/go/session/sso/google', async (route) => {
      ssoRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: SSO_SESSION_TOKEN, account: { email: INVITE_EMAIL } }),
      });
    });

    // The acceptance the page must reach, authenticated with the SSO session.
    let acceptAuthorization = null;
    await page.route('**/sws/go/company-invitations/accept', async (route) => {
      acceptAuthorization = route.request().headers().authorization;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'Invitation accepted', clientName: 'Fictional Corp' }),
      });
    });

    await stubGoogleIdentityProvider(page);

    await page.goto(`/invite?token=${INVITE_TOKEN}`);

    // The page renders the real shared LoginStep, not a page-level stub.
    await expect(page.getByTestId('invite-shared-login')).toBeVisible({ timeout: 10_000 });

    const ssoButton = page.getByTestId('google-sso-button');
    await expect(ssoButton).toBeVisible();
    await ssoButton.click();

    // ETP-4958 regression: SSO authenticated the user but never returned control
    // to the page, so the acceptance step was never reached and the invitation
    // token stayed unconsumed. The page must now leave the login form and expose
    // the acceptance action instead.
    const acceptButton = page.getByTestId('action-accept-invitation');
    await expect(acceptButton).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('action-login-submit')).toHaveCount(0);

    expect(ssoRequestBody).toEqual({ credential: SSO_CREDENTIAL });

    await acceptButton.click();

    await expect(page.getByTestId('invite-success-state')).toBeVisible();
    expect(acceptAuthorization).toBe(`Bearer ${SSO_SESSION_TOKEN}`);
  });
});
