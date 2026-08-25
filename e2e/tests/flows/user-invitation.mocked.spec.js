import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';

/**
 * Company user invitation and acceptance flows — ETP-4894 (mocked).
 *
 * Test 1 ("admin creates a user, invite fires automatically") was rewritten for
 * ETP-4830 (commit b02874e46, "Send invite email on admin-created users
 * (frontend)"): the old standalone `action-open-invite` / `InviteUserDialog.jsx`
 * flow was removed from `windows/custom/user/index.jsx` entirely. There is no more
 * separate "open invite dialog" UI — an admin fills the ordinary create-user form
 * (email is the mandatory, save-locking field per `artifacts/user/decisions.json`'s
 * `user.email` entry) and clicks Save; the invite email is sent server-side as part
 * of that same create call, surfaced by a single actionable `sonner` toast
 * (`userCreatedInvitationSentToast` / `configureRolesAction`, see
 * `windows/custom/user/index.jsx`'s `handleAfterCreate`). `InviteUserDialog.jsx` and
 * its own `__tests__/InviteUserDialog.vitest.jsx` are now dead code (zero imports
 * from app source) — left untouched here, flagged as a follow-up cleanup candidate.
 */

async function installUserCreateMocks(page) {
  await page.route('**/sws/neo/user/user/**', async (route) => route.fallback());
  await page.route('**/sws/neo/user/user**', async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: { data: [], totalRows: 0 } }),
      });
      return;
    }

    if (method === 'POST') {
      const body = request.postDataJSON() ?? {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          response: {
            data: [{
              id: 'user-mock-123',
              name: body.name || 'Invited Person',
              email: body.email || 'invited.person@example.com',
              active: true,
              invitationStatus: 'PENDING',
            }],
          },
        }),
      });
      return;
    }

    await route.fallback();
  });
}

test.describe('Company User Invitations — ETP-4894', () => {
  test('admin creates a user and gets a single actionable "invitation sent" toast (ETP-4830)', async ({
    page,
  }) => {
    await login(page);
    await installUserCreateMocks(page);

    await page.goto('/user/new');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // Fill the two fields the create form actually requires (decisions.json:
    // user.name and user.email — active is a checkbox, excluded from the
    // required-field gate by design, see requiredFields.js).
    const nameInput = page.getByTestId('field-name');
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill('Invited Person');

    const emailInput = page.getByTestId('field-email');
    await expect(emailInput).toBeVisible();
    await emailInput.fill('invited.person@example.com');

    const saveBtn = page.getByTestId('action-save');
    await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
    await saveBtn.click();

    // Single actionable toast, not the old banner/dialog — es_ES is the mock-mode
    // default locale (docs/e2e-testing-guide.md "Mock-mode Tests" section).
    const toast = page.locator('[data-sonner-toast][data-type="success"]').first();
    await expect(toast).toBeVisible({ timeout: 10_000 });
    await expect(toast).toContainText('Usuario creado. Invitación enviada por correo.');
    await expect(toast.getByRole('button', { name: 'Configurar roles' })).toBeVisible();

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-user-invitation-pending.png',
      fullPage: true,
    });
  });

  test('resolves and accepts invitation for existing account', async ({ page }) => {
    await page.route('**/sws/go/company-invitations/resolve?token=existing-token-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'SENT',
          clientName: 'Fictional Corp',
          email: 'existing.employee@example.com',
          maskedEmail: 'e***e@example.com',
          branch: 'existing_account',
          accountExists: true,
        }),
      });
    });

    // ETP-4575/4576: the login moved from the legacy bearer `/sws/go/login` to
    // `POST /sws/go/session`, which sets the `__Host-` cookie and returns the
    // CSRF proof bound to it instead of a token. LoginStep hands that proof to
    // the page's `onAuthenticated`, and the page sends it back on the accept.
    await page.route('**/sws/go/session', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          csrfToken: 'existing-session-csrf',
          account: { email: 'existing.employee@example.com' },
        }),
      });
    });

    let acceptRequested = false;
    await page.route('**/sws/go/company-invitations/accept', async (route) => {
      acceptRequested = true;
      // The credential is the cookie, which the browser attaches on its own; what
      // the page must prove is intent, and this POST is an unsafe method.
      expect(route.request().headers()['x-go-csrf']).toBe('existing-session-csrf');
      expect(route.request().headers().authorization).toBeUndefined();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          message: 'Invitation accepted',
          clientName: 'Fictional Corp',
        }),
      });
    });

    await page.goto('/invite?token=existing-token-e2e');

    await expect(page.getByTestId('invite-shared-login')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Etendo Go', { exact: true })).toBeVisible();
    await expect(page.locator('#login-email')).toHaveValue('existing.employee@example.com');
    await expect(page.locator('#login-email')).toBeDisabled();

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-existing-login.png',
      fullPage: true,
    });

    await page.locator('#login-password').fill('Existing.Password1!');
    await page.getByTestId('action-login-submit').click();
    await expect(page.getByTestId('invite-authenticated-step')).toBeVisible();

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-authenticated.png',
      fullPage: true,
    });

    const acceptBtn = page.getByTestId('action-accept-invitation');
    await acceptBtn.click();

    await expect(page.getByTestId('invite-success-state')).toBeVisible();
    await expect(page.getByTestId('invite-success-icon')).toBeVisible();
    expect(acceptRequested).toBe(true);

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-existing-account.png',
      fullPage: true,
    });
  });

  test('resolves invitation, registers new account locked to email, and accepts', async ({ page }) => {
    await page.route('**/sws/go/company-invitations/resolve?token=new-user-token-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'SENT',
          clientName: 'Fictional Corp',
          email: 'new.member@example.com',
          maskedEmail: 'n***r@example.com',
          branch: 'registration_required',
          accountExists: false,
        }),
      });
    });

    let registerBody = null;
    await page.route('**/sws/go/company-invitations/register-and-accept', async (route) => {
      registerBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          token: 'jwt-session-mock-token',
          account: {
            id: 'acc-new-123',
            email: 'new.member@example.com',
            name: 'New Member',
          },
          clientName: 'Fictional Corp',
        }),
      });
    });

    await page.goto('/invite?token=new-user-token-e2e');

    const newAccountBranch = page.getByTestId('invite-new-account');
    await expect(newAccountBranch).toBeVisible({ timeout: 10_000 });

    const emailInput = page.locator('#reg-email');
    await expect(emailInput).toHaveValue('new.member@example.com');
    await expect(emailInput).toBeDisabled();

    await page.locator('#reg-name').fill('New Member');
    await page.locator('#reg-password').fill('Strong.Member.Password1!');

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-new-account-registration.png',
      fullPage: true,
    });

    const registerAcceptBtn = page.getByTestId('action-register-submit');
    await registerAcceptBtn.click();

    await expect(page.getByTestId('invite-success-state')).toBeVisible();
    await expect(page.getByTestId('invite-success-icon')).toBeVisible();

    expect(registerBody).toEqual({
      token: 'new-user-token-e2e',
      name: 'New Member',
      password: 'Strong.Member.Password1!',
    });

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-new-account.png',
      fullPage: true,
    });
  });

  test('shows a safe error state for an invalid or expired invitation link', async ({ page }) => {
    await page.route('**/sws/go/company-invitations/resolve?token=expired-token-e2e', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: true,
          code: 'EXPIRED_TOKEN',
          message: 'This invitation link has expired',
        }),
      });
    });

    await page.goto('/invite?token=expired-token-e2e');

    await expect(page.getByTestId('invite-error-state')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('action-error-sign-in')).toBeVisible();
    await expect(page.getByText('Enlace inválido o caducado')).toBeVisible();

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-expired.png',
      fullPage: true,
    });
  });

  test('shows the Etendo Go loading state while resolving an invitation', async ({ page }) => {
    let releaseResolve;
    const resolvePending = new Promise((resolve) => { releaseResolve = resolve; });
    await page.route('**/sws/go/company-invitations/resolve?token=loading-token-e2e', async (route) => {
      await resolvePending;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: true, code: 'EXPIRED_TOKEN' }),
      });
    });

    await page.goto('/invite?token=loading-token-e2e');
    await expect(page.getByTestId('invite-loading')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Etendo Go', { exact: true })).toBeVisible();

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-loading.png',
      fullPage: true,
    });
    releaseResolve();
  });

  test('shows the Etendo Go confirmation for an already accepted invitation', async ({ page }) => {
    await page.route('**/sws/go/company-invitations/resolve?token=accepted-token-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ACCEPTED',
          clientName: 'Fictional Corp',
          branch: 'accepted',
        }),
      });
    });

    await page.goto('/invite?token=accepted-token-e2e');
    await expect(page.getByTestId('invite-success-state')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('action-go-to-app')).toBeVisible();

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-already-accepted.png',
      fullPage: true,
    });
  });

  test('shows an authenticated acceptance error in the Etendo Go shell', async ({ page }) => {
    await page.route('**/sws/go/company-invitations/resolve?token=accept-error-token-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'SENT',
          clientName: 'Fictional Corp',
          email: 'existing.employee@example.com',
          maskedEmail: 'e***e@example.com',
          branch: 'existing_account',
          accountExists: true,
        }),
      });
    });
    await page.route('**/sws/go/session', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          csrfToken: 'existing-session-csrf',
          account: { email: 'existing.employee@example.com' },
        }),
      });
    });
    await page.route('**/sws/go/company-invitations/accept', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: true, code: 'INVITATION_ALREADY_ACCEPTED' }),
      });
    });

    await page.goto('/invite?token=accept-error-token-e2e');
    await page.locator('#login-password').fill('Existing.Password1!');
    await page.getByTestId('action-login-submit').click();
    await page.getByTestId('action-accept-invitation').click();
    await expect(page.getByTestId('invite-action-error')).toBeVisible({ timeout: 10_000 });

    await page.screenshot({
      path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-invitation-accept-error.png',
      fullPage: true,
    });
  });
});
