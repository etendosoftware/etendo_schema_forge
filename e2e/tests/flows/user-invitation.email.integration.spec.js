import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  clearEmailSink,
  invitationLinkFromEmail,
  waitForEmail,
} from '../helpers/email-sink.js';
import { captureScreenshot } from '../helpers/captureScreenshot.js';

function loadCredentials(accountNumber = 1) {
  try {
    const credentialsFile = accountNumber === 1
      ? '.auth-credentials.json'
      : `.auth-credentials-${accountNumber}.json`;
    const credentialsPath = resolve(import.meta.dirname, '../../', credentialsFile);
    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    if (credentials.email && credentials.password) return credentials;
  } catch {
    // Fall back to E2E_USER/E2E_PASSWORD when onboarding did not create a credentials file.
  }
  return null;
}

const onboardingCredentials = loadCredentials();
const secondAdminCredentials = loadCredentials(2);
// The email sink is an opt-in dependency: playwright.config.js only starts
// `support/email-sink.mjs` when E2E_EMAIL_SINK=1, and the backend additionally
// has to be pointed at its POST /send endpoint. Without it every test here dies
// in setup on `clearEmailSink` with ECONNREFUSED 127.0.0.1:8025 — which is what
// the pre-push integration leg hit, since the gate never sets the flag. Declare
// it as a precondition so an absent optional dependency skips instead of
// failing the gate for everyone.
const RUN_EMAIL_SINK = process.env.E2E_EMAIL_SINK === '1'
  || Boolean(process.env.E2E_EMAIL_SINK_URL);
const RUN_INTEGRATION = process.env.E2E_USE_MOCK === '0'
  && Boolean(process.env.BASE_URL)
  && Boolean(process.env.E2E_PASSWORD || onboardingCredentials)
  && RUN_EMAIL_SINK;
const RUN_CROSS_CLIENT = RUN_INTEGRATION && Boolean(secondAdminCredentials);
const EMAIL_SINK_URL = process.env.E2E_EMAIL_SINK_URL || 'http://127.0.0.1:8025';
const invitationCredential = process.env.E2E_INVITATION_PASSWORD
  || onboardingCredentials?.password
  || secondAdminCredentials?.password
  || process.env.E2E_PASSWORD;

function uniqueEmail(label) {
  return `e2e-${label}-${Date.now()}@example.com`;
}

// Counts sink messages already addressed to `recipient` at the moment this is called
// (no waiting/polling) — used to assert a dedup no-op did NOT send a second email, by
// comparing the count immediately before and after the no-op call. The backend sends
// synchronously within the HTTP request/response it belongs to (see
// CompanyInvitationService#issueFreshInvitation), so by the time that call's HTTP
// response has returned, any email it might have sent is already in the sink.
async function countEmailMessages(request, recipient, baseURL = EMAIL_SINK_URL) {
  const response = await request.get(`${baseURL}/messages`);
  const { messages = [] } = await response.json();
  return messages.filter((candidate) => candidate.to === recipient
    || candidate.to?.includes?.(recipient)).length;
}

async function expectInvitationResolves(request, inviteLink) {
  const parsed = new URL(inviteLink);
  const response = await request.get(
    `/sws/go/company-invitations/resolve?token=${encodeURIComponent(parsed.searchParams.get('token'))}`,
  );
  const responseText = await response.text();
  expect(response.status(), responseText).toBe(200);
  const body = JSON.parse(responseText);
  expect(body.branch).toMatch(/existing_account|registration_required/);
  return body;
}

async function createStandaloneAccount(request, email) {
  const response = await request.post('/sws/go/register', {
    data: {
      email,
      name: 'Existing Invitation User',
      password: invitationCredential,
      language: 'en_US',
    },
  });
  const responseText = await response.text();
  expect(response.status(), responseText).toBe(201);
  const body = JSON.parse(responseText);
  expect(body.status).toBe('success');
  expect(body.token).toEqual(expect.any(String));
  return body;
}

async function loginAsAdmin(request, configuredCredentials = onboardingCredentials) {
  const credentials = configuredCredentials || {
    email: process.env.E2E_USER || 'goadmin@etendo.software',
    password: process.env.E2E_PASSWORD,
  };
  const loginResponse = await request.post('/sws/go/login', {
    data: { email: credentials.email, password: credentials.password },
  });
  const loginText = await loginResponse.text();
  expect(loginResponse.status(), loginText).toBe(200);
  const loginBody = JSON.parse(loginText);
  expect(loginBody.token).toEqual(expect.any(String));

  const environmentsResponse = await request.get('/sws/go/environments', {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  const environmentsText = await environmentsResponse.text();
  expect(environmentsResponse.status(), environmentsText).toBe(200);
  const environmentsBody = JSON.parse(environmentsText);
  const environment = environmentsBody?.environments?.find((item) => item.adminUserId);
  expect(environment?.adminUserId, environmentsText).toEqual(expect.any(String));

  const neoLoginResponse = await request.get(
    `/sws/go/login?userId=${encodeURIComponent(environment.adminUserId)}`,
    { headers: { Authorization: `Bearer ${loginBody.token}` } },
  );
  const neoLoginText = await neoLoginResponse.text();
  expect(neoLoginResponse.status(), neoLoginText).toBe(200);
  const neoLoginBody = JSON.parse(neoLoginText);
  expect(neoLoginBody.token).toEqual(expect.any(String));

  return {
    sessionToken: loginBody.token,
    neoToken: neoLoginBody.token,
    environment,
    environments: environmentsBody.environments || [],
  };
}

/**
 * Creates (or reuses) the AD_User for `email` and assigns it a default role via
 * `POST`/`PATCH /sws/neo/user/user`.
 *
 * ETP-4830: when this actually creates a NEW user, that `POST` itself now auto-fires
 * a company invitation as part of user creation
 * (`UserRoleAssignmentHandler.afterHandle` -> `inviteNewlyCreatedUser`,
 * `com.etendoerp.go/.../handlers/UserRoleAssignmentHandler.java`). So calling this for
 * an email that does not exist yet IS the invite trigger — the caller should wait for
 * that email directly rather than issuing a separate explicit
 * `POST /sws/go/company-invitations` afterward, which would just dedup to a no-op
 * against the invitation this call already sent
 * (`CompanyInvitationService#existingInvitationResponse`). The explicit endpoint is
 * still needed to invite a user that already existed before this flow started (see
 * the first test in this file, which never calls this helper).
 */
async function prepareInvitedUser(request, neoToken, email) {
  const criteria = encodeURIComponent(JSON.stringify([
    { fieldName: 'email', operator: 'equals', value: email },
  ]));
  const existingResponse = await request.get(
    `/sws/neo/user/user?criteria=${criteria}&_startRow=0&_endRow=100`,
    { headers: { Authorization: `Bearer ${neoToken}` } },
  );
  const existingText = await existingResponse.text();
  expect(existingResponse.status(), existingText).toBe(200);
  const existingBody = JSON.parse(existingText);
  const existingUsers = existingBody?.response?.data || existingBody?.data || [];
  let user = existingUsers.find((candidate) => candidate?.email?.toLowerCase() === email.toLowerCase());
  let userResponseText = existingText;

  if (!user) {
    const userResponse = await request.post('/sws/neo/user/user', {
      headers: { Authorization: `Bearer ${neoToken}` },
      data: {
        name: 'E2E Invitation User',
        email,
        locked: false,
      },
    });
    userResponseText = await userResponse.text();
    expect([200, 201], userResponseText).toContain(userResponse.status());
    const userBody = JSON.parse(userResponseText);
    user = userBody?.response?.data?.[0] || userBody?.data?.[0] || userBody?.user;
  }
  expect(user?.id, userResponseText).toEqual(expect.any(String));

  const roleOptionsResponse = await request.get('/sws/neo/user/userRoles/selectors/role?limit=50&offset=0', {
    headers: { Authorization: `Bearer ${neoToken}` },
  });
  const roleOptionsText = await roleOptionsResponse.text();
  expect(roleOptionsResponse.status(), roleOptionsText).toBe(200);
  const roleOptionsBody = JSON.parse(roleOptionsText);
  const role = roleOptionsBody?.items?.[0] || roleOptionsBody?.response?.data?.[0];
  expect(role?.id, roleOptionsText).toEqual(expect.any(String));

  const roleResponse = await request.patch(`/sws/neo/user/user/${user.id}`, {
    headers: { Authorization: `Bearer ${neoToken}` },
    data: { defaultRole: role.id },
  });
  const roleText = await roleResponse.text();
  expect([200, 201], roleText).toContain(roleResponse.status());
  return { userId: user.id, roleId: role.id };
}

async function createInvitationAsAdmin(request, sessionToken, email) {
  const invitationResponse = await request.post('/sws/go/company-invitations', {
    headers: { Authorization: `Bearer ${sessionToken}` },
    data: { email },
  });
  const invitationText = await invitationResponse.text();
  expect(invitationResponse.status(), invitationText).toBe(201);
  const invitationBody = JSON.parse(invitationText);
  expect(invitationBody.status).toBe('success');
  expect(invitationBody.invitation.status).toBe('SENT');
  return invitationBody;
}

async function acceptExistingInvitation(browser, inviteLink, email, password, {
  evidenceStem = 'ETP-4894-existing-account',
  afterDashboard = null,
} = {}) {
  const context = await browser.newContext({ baseURL: process.env.BASE_URL });
  const page = await context.newPage();
  const httpSignals = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/sws/go/company-invitations')
      || url.pathname === '/sws/go/login'
      || url.pathname === '/sws/go/environments') {
      httpSignals.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });
  try {
    await page.goto(inviteLink);
    await expect(page.getByTestId('invite-shared-login')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#login-email')).toHaveValue(email);
    await expect(page.locator('#login-email')).toBeDisabled();
    await page.locator('#login-password').fill(password);
    await page.getByTestId('action-login-submit').click();
    await expect(page.getByTestId('invite-authenticated-step')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('action-accept-invitation').click();
    await expect(page.getByTestId('invite-success-state')).toBeVisible({ timeout: 30_000 });
    await captureScreenshot(page, {
      path: `../artifacts/delivery-evidence/ETP-4894/${evidenceStem}-joined-company.png`,
      fullPage: true,
    });
    await page.getByTestId('action-go-to-app').click();
    await page.waitForURL('**/dashboard', { timeout: 60_000 });
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/Estas son tus tareas pendientes|These are your pending tasks/)).toBeVisible({ timeout: 60_000 });
    await captureScreenshot(page, {
      path: `../artifacts/delivery-evidence/ETP-4894/${evidenceStem}-dashboard.png`,
      fullPage: true,
    });
    if (afterDashboard) await afterDashboard(page);
    return httpSignals;
  } finally {
    await context.close();
  }
}

async function verifyAcceptedLinkIsIdempotent(browser, inviteLink, evidencePath) {
  const context = await browser.newContext({ baseURL: process.env.BASE_URL });
  const page = await context.newPage();
  try {
    await page.goto(inviteLink);
    await expect(page.getByTestId('invite-success-state')).toBeVisible({ timeout: 30_000 });
    await captureScreenshot(page, { path: evidencePath, fullPage: true });
  } finally {
    await context.close();
  }
}

async function acceptNewInvitation(browser, inviteLink, email) {
  const context = await browser.newContext({ baseURL: process.env.BASE_URL });
  const page = await context.newPage();
  try {
    await page.goto(inviteLink);
    await expect(page.getByTestId('invite-new-account')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#reg-email')).toHaveValue(email);
    await expect(page.locator('#reg-email')).toBeDisabled();
    await page.locator('#reg-name').fill('New Invitation User');
    await page.locator('#reg-password').fill(invitationCredential);
    await page.getByTestId('action-register-submit').click();
    await expect(page.getByTestId('invite-success-state')).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.close();
  }
}

test.describe('Company User Invitations — email integration E2E — ETP-4894', () => {
  test.skip(!RUN_INTEGRATION, 'Requires real Etendo Go, E2E_USE_MOCK=0, BASE_URL, credentials, and the email sink (E2E_EMAIL_SINK=1).');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('captures the real invitation link and completes the existing-account flow', async ({
    request,
    browser,
  }) => {
    const credentials = onboardingCredentials || {
      email: process.env.E2E_USER || 'goadmin@etendo.software',
      password: process.env.E2E_PASSWORD,
    };
    const email = credentials.email;

    await clearEmailSink(request, EMAIL_SINK_URL);
    const adminTokens = await loginAsAdmin(request);

    await createInvitationAsAdmin(request, adminTokens.sessionToken, email);
    const message = await waitForEmail(request, {
      recipient: email,
      template: 'custom',
      baseURL: EMAIL_SINK_URL,
    });

    expect(message.to).toBe(email);
    expect(message.template).toBe('custom');
    expect(message.data?.link).toEqual(expect.stringContaining('/invite?token='));
    expect(message.data?.body).toContain(message.data.link);
    const inviteLink = invitationLinkFromEmail(message);
    await expectInvitationResolves(request, inviteLink);
    await acceptExistingInvitation(browser, inviteLink, email, credentials.password);
  });

  test('captures the real invitation link and completes the new-account flow without onboarding', async ({
    request,
    browser,
  }) => {
    const email = uniqueEmail('new');

    await clearEmailSink(request, EMAIL_SINK_URL);
    const adminTokens = await loginAsAdmin(request);
    // Creating the user IS the invite trigger now (see prepareInvitedUser's doc
    // comment) — wait for the email it auto-sends directly, no separate explicit
    // invite call needed to make it arrive.
    await prepareInvitedUser(request, adminTokens.neoToken, email);
    const message = await waitForEmail(request, {
      recipient: email,
      template: 'custom',
      baseURL: EMAIL_SINK_URL,
    });

    expect(message.to).toBe(email);
    expect(message.data?.link).toEqual(expect.stringContaining('/invite?token='));
    expect(message.data?.body).toContain(message.data.link);
    const inviteLink = invitationLinkFromEmail(message);
    await expectInvitationResolves(request, inviteLink);

    // Lock in the dedup contract this now depends on
    // (CompanyInvitationService#existingInvitationResponse): an explicit admin
    // invite for the same (client, email) that already has an open invitation must
    // report success against that SAME invitation, and must NOT send a second email.
    const messagesBeforeDedup = await countEmailMessages(request, email, EMAIL_SINK_URL);
    const dedupResult = await createInvitationAsAdmin(request, adminTokens.sessionToken, email);
    expect(dedupResult.message).toMatch(/already pending/i);
    const messagesAfterDedup = await countEmailMessages(request, email, EMAIL_SINK_URL);
    expect(messagesAfterDedup).toBe(messagesBeforeDedup);

    await acceptNewInvitation(browser, inviteLink, email);
  });

  test('completes the same-account cross-client invitation flow and switches back', async ({
    request,
    browser,
  }, testInfo) => {
    test.skip(!RUN_CROSS_CLIENT, 'Requires the two onboarding credentials generated by the JSON account fixture.');

    const invitee = onboardingCredentials;
    const adminA = await loginAsAdmin(request, onboardingCredentials);
    const adminB = await loginAsAdmin(request, secondAdminCredentials);
    const org1Name = adminA.environment.clientName;
    const org2Name = adminB.environment.clientName;
    expect(org1Name).not.toBe(org2Name);

    // Client 2 needs the same AD_User, with a role in Admin B's organization,
    // before it can receive an invitation there. This is the same action performed
    // by the administrator in the User window — and, since ETP-4830, creating the
    // user this way is ITSELF what fires client B's company invitation
    // (see prepareInvitedUser's doc comment). Capture that invitation right here,
    // before any clearEmailSink() call can wipe it and before the client-A flow
    // below runs — a later explicit invite for this same (client B, email) pair
    // would just dedup to a no-op against the invitation this call already sent.
    await clearEmailSink(request, EMAIL_SINK_URL);
    const preparedUser = await prepareInvitedUser(request, adminB.neoToken, invitee.email);
    expect(preparedUser.userId).toEqual(expect.any(String));
    expect(preparedUser.roleId).toEqual(expect.any(String));

    const secondMessage = await waitForEmail(request, {
      recipient: invitee.email,
      template: 'custom',
      baseURL: EMAIL_SINK_URL,
    });
    const secondInviteLink = invitationLinkFromEmail(secondMessage);
    const secondResolution = await expectInvitationResolves(request, secondInviteLink);
    expect(secondResolution.clientName).toBe(org2Name);

    // Client A's invitation is a genuinely fresh dedup key ((client A, email) has no
    // open invitation yet), so the explicit endpoint is still the right way to fire it.
    await clearEmailSink(request, EMAIL_SINK_URL);
    await createInvitationAsAdmin(request, adminA.sessionToken, invitee.email);
    const firstMessage = await waitForEmail(request, {
      recipient: invitee.email,
      template: 'custom',
      baseURL: EMAIL_SINK_URL,
    });
    const firstInviteLink = invitationLinkFromEmail(firstMessage);
    const firstResolution = await expectInvitationResolves(request, firstInviteLink);
    expect(firstResolution.clientName).toBe(org1Name);

    const firstHttpSignals = await acceptExistingInvitation(
      browser,
      firstInviteLink,
      invitee.email,
      invitee.password,
      { evidenceStem: 'ETP-4894-cross-client-org1' },
    );
    await verifyAcceptedLinkIsIdempotent(
      browser,
      firstInviteLink,
      '../artifacts/delivery-evidence/ETP-4894/ETP-4894-cross-client-idempotent.png',
    );

    const secondHttpSignals = await acceptExistingInvitation(
      browser,
      secondInviteLink,
      invitee.email,
      invitee.password,
      {
        evidenceStem: 'ETP-4894-cross-client-org2',
        afterDashboard: async (page) => {
          // The dashboard opens with the Etendo side menu collapsed. Expand it
          // before asserting the company switcher, matching the real user path.
          const expandMenu = page.getByLabel(/Expandir menú|Expand menu/);
          if (await expandMenu.isVisible()) await expandMenu.click();
          await expect(page.getByLabel('switchCompany')).toContainText(org2Name);
          await page.getByLabel('switchCompany').click();
          const options = page.locator('[data-testid^="company-option-"]');
          await expect(options).toHaveCount(2, { timeout: 30_000 });
          await options.filter({ hasText: org1Name }).click();
          await page.waitForURL('**/dashboard', { timeout: 60_000 });
          await expect(page.getByLabel('switchCompany')).toContainText(org1Name);
          await expect(page.getByText(/Estas son tus tareas pendientes|These are your pending tasks/)).toBeVisible({ timeout: 60_000 });
          await captureScreenshot(page, {
            path: '../artifacts/delivery-evidence/ETP-4894/ETP-4894-cross-client-return-org1.png',
            fullPage: true,
          });
        },
      },
    );

    const inviteeAfterAcceptance = await loginAsAdmin(request, invitee);
    const visibleClients = new Set(inviteeAfterAcceptance.environments.map((env) => env.clientId));
    expect(visibleClients).toContain(adminA.environment.clientId);
    expect(visibleClients).toContain(adminB.environment.clientId);

    const evidenceDir = resolve(import.meta.dirname, '../../../artifacts/delivery-evidence/ETP-4894');
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      resolve(evidenceDir, 'ETP-4894-cross-client-http.json'),
      JSON.stringify({
        environment: 'local',
        clientCount: visibleClients.size,
        clientNames: [org1Name, org2Name],
        firstInvitation: { resolve: firstResolution.status, browser: firstHttpSignals },
        secondInvitation: { resolve: secondResolution.status, browser: secondHttpSignals },
        idempotentFirstLink: true,
        returnedTo: org1Name,
      }, null, 2),
    );
    await testInfo.attach('cross-client-http-signals', {
      body: JSON.stringify({ firstHttpSignals, secondHttpSignals }, null, 2),
      contentType: 'application/json',
    });
  });
});
