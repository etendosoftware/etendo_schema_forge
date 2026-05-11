import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const RUN_DEPLOYED_SMOKE = process.env.E2E_MCP_OAUTH_SMOKE === '1';

const PUBLIC_BASE_URL = trimTrailingSlash(
  process.env.E2E_MCP_PUBLIC_BASE_URL || 'https://go.experimental.etendo.cloud'
);
const MCP_RESOURCE = process.env.E2E_MCP_RESOURCE || `${PUBLIC_BASE_URL}/mcp`;
const MCP_ENDPOINT = process.env.E2E_MCP_ENDPOINT || `${PUBLIC_BASE_URL}/mcp`;
const AUTHORIZATION_ENDPOINT = process.env.E2E_MCP_OAUTH_AUTHORIZE_URL ||
  `${PUBLIC_BASE_URL}/etendo/oauth2/authorize`;
const TOKEN_ENDPOINT = process.env.E2E_MCP_OAUTH_TOKEN_URL ||
  `${PUBLIC_BASE_URL}/etendo/oauth2/token`;
const REGISTRATION_ENDPOINT = process.env.E2E_MCP_OAUTH_REGISTRATION_URL ||
  `${PUBLIC_BASE_URL}/etendo/oauth2/register`;
const REQUESTED_SCOPES = process.env.E2E_MCP_OAUTH_SCOPES ||
  'neo:read neo:write neo:process neo:report neo:*';

const SMOKE_USER = process.env.E2E_MCP_SMOKE_USER || process.env.E2E_USER;
const SMOKE_PASSCODE = process.env.E2E_MCP_SMOKE_PASSWORD || process.env.E2E_PASSWORD;
const STATIC_CLIENT_ID = process.env.E2E_MCP_OAUTH_CLIENT_ID;
const STATIC_CLIENT_CREDENTIAL = process.env.E2E_MCP_OAUTH_CLIENT_SECRET;
const ENABLE_DCR = process.env.E2E_MCP_OAUTH_ENABLE_DCR === '1';
const INITIAL_DCR_TOKEN = process.env.E2E_MCP_OAUTH_DCR_INITIAL_ACCESS_TOKEN;
const TOKEN_AUTH_METHOD = process.env.E2E_MCP_OAUTH_TOKEN_AUTH_METHOD || 'client_secret_post';
const CONFIGURED_REDIRECT_URI = process.env.E2E_MCP_OAUTH_REDIRECT_URI;

test.describe('MCP OAuth2 Authorization Code + PKCE deployed smoke', () => {
  test.skip(
    !RUN_DEPLOYED_SMOKE,
    'Set E2E_MCP_OAUTH_SMOKE=1 to run this deployed integration smoke.'
  );

  test('metadata and edge routes are public JSON and pass WAF method checks', async ({ request }) => {
    const authorizationServer = await getJson(
      request,
      `${PUBLIC_BASE_URL}/.well-known/oauth-authorization-server`,
      'OAuth authorization server metadata'
    );
    expectPublicEndpoint(authorizationServer.issuer, PUBLIC_BASE_URL, 'issuer');
    expectPublicEndpoint(
      authorizationServer.authorization_endpoint,
      PUBLIC_BASE_URL,
      'authorization_endpoint'
    );
    expectPublicEndpoint(authorizationServer.token_endpoint, PUBLIC_BASE_URL, 'token_endpoint');
    if (authorizationServer.registration_endpoint) {
      expectPublicEndpoint(
        authorizationServer.registration_endpoint,
        PUBLIC_BASE_URL,
        'registration_endpoint'
      );
    }

    const protectedResource = await getJson(
      request,
      `${PUBLIC_BASE_URL}/.well-known/oauth-protected-resource`,
      'OAuth protected resource metadata'
    );
    expect(protectedResource.resource).toBe(MCP_RESOURCE);
    expect(Array.isArray(protectedResource.authorization_servers)).toBe(true);
    for (const server of protectedResource.authorization_servers) {
      expectHttpsEndpoint(server, 'authorization_servers[]');
    }

    const mcpResponse = await request.post(MCP_ENDPOINT, {
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'schema-forge-oauth-smoke', version: '0.0.0' },
        },
      },
    });
    expect(mcpResponse.status(), 'CloudFront/WAF must not reject POST /mcp by method').not.toBe(403);
    if (!mcpResponse.ok()) {
      const contentType = mcpResponse.headers()['content-type'] || '';
      expect(contentType, 'MCP errors should not be returned as HTML').not.toContain('text/html');
    }
  });

  test('unauthenticated browser can complete OAuth2 authorization code flow with PKCE', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    test.skip(Boolean(!SMOKE_USER || !SMOKE_PASSCODE), 'Set smoke user credentials in E2E_MCP_SMOKE_USER/E2E_MCP_SMOKE_PASSWORD or E2E_USER/E2E_PASSWORD.');
    test.skip(Boolean(!STATIC_CLIENT_ID && !ENABLE_DCR), 'Set E2E_MCP_OAUTH_CLIENT_ID or enable DCR with E2E_MCP_OAUTH_ENABLE_DCR=1.');

    const callbackServer = await startCallbackServer(CONFIGURED_REDIRECT_URI);
    const redirectUri = callbackServer.redirectUri;
    const state = `sf-smoke-${randomBytes(12).toString('hex')}`;
    const codeVerifier = base64Url(randomBytes(64));
    const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());

    try {
      const client = await resolveOAuthClient(request, redirectUri);
      const authorizeUrl = buildAuthorizeUrl({
        clientId: client.clientId,
        codeChallenge,
        redirectUri,
        state,
      });

      const directAuthorizeResponse = await request.get(authorizeUrl.toString(), {
        maxRedirects: 0,
      });
      if (directAuthorizeResponse.status() === 200) {
        const body = await directAuthorizeResponse.text();
        expect(
          looksLikeOnlyPwaShell(body),
          'Unauthenticated authorize response must not end as only the Vite/PWA shell'
        ).toBe(false);
      } else if (directAuthorizeResponse.status() >= 400) {
        const contentType = directAuthorizeResponse.headers()['content-type'] || '';
        const body = await directAuthorizeResponse.text();
        expect(contentType, `Authorize error must be OAuth JSON, body: ${body.slice(0, 300)}`)
          .toContain('application/json');
        throw new Error(
          `Authorize rejected the request before login with HTTP ${directAuthorizeResponse.status()}: ${body}`
        );
      } else {
        expect(
          directAuthorizeResponse.status(),
          'Unauthenticated authorize should redirect to login or return a real login response'
        ).toBeGreaterThanOrEqual(300);
        expect(directAuthorizeResponse.status()).toBeLessThan(400);
      }

      await page.context().clearCookies();
      await page.goto(authorizeUrl.toString(), { waitUntil: 'domcontentloaded' });
      await expectNotOnlyPwaShell(page);
      await expectLoginFlow(page);

      await fillLoginForm(page, SMOKE_USER, SMOKE_PASSCODE);
      await approveConsentIfNeeded(page, callbackServer.callbackPromise);

      const callback = await callbackServer.callbackPromise;
      expect(callback.state).toBe(state);
      expect(callback.error, `OAuth callback returned error: ${callback.error_description || callback.error || ''}`).toBeFalsy();
      expect(callback.code, 'OAuth callback must include an authorization code').toBeTruthy();

      const tokenResponse = await exchangeCodeForToken(request, {
        client,
        code: callback.code,
        codeVerifier,
        redirectUri,
      });
      expect(tokenResponse.access_token, 'Token endpoint must return access_token').toBeTruthy();
    } finally {
      await callbackServer.close();
    }
  });
});

async function resolveOAuthClient(request, redirectUri) {
  if (STATIC_CLIENT_ID) {
    return {
      clientId: STATIC_CLIENT_ID,
      clientCredential: STATIC_CLIENT_CREDENTIAL,
      tokenAuthMethod: TOKEN_AUTH_METHOD,
    };
  }

  const headers = { 'content-type': 'application/json' };
  if (INITIAL_DCR_TOKEN) {
    headers.authorization = `Bearer ${INITIAL_DCR_TOKEN}`;
  }

  const response = await request.post(REGISTRATION_ENDPOINT, {
    headers,
    data: {
      client_name: 'Schema Forge MCP OAuth smoke',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: REQUESTED_SCOPES,
    },
  });
  const body = await parseOAuthJsonResponse(response, 'DCR registration');
  expect(response.ok(), `DCR registration failed: ${JSON.stringify(body)}`).toBe(true);
  expect(body.client_id, 'DCR response must include client_id').toBeTruthy();

  return {
    clientId: body.client_id,
    clientCredential: body.client_secret,
    tokenAuthMethod: body.token_endpoint_auth_method || 'client_secret_basic',
  };
}

function buildAuthorizeUrl({ clientId, codeChallenge, redirectUri, state }) {
  const authorizeUrl = new URL(AUTHORIZATION_ENDPOINT);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', REQUESTED_SCOPES);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('resource', MCP_RESOURCE);
  return authorizeUrl;
}

async function exchangeCodeForToken(request, { client, code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: client.clientId,
    code_verifier: codeVerifier,
  });
  if (client.clientCredential && client.tokenAuthMethod === 'client_secret_post') {
    body.set('client_secret', client.clientCredential);
  }

  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (client.clientCredential && client.tokenAuthMethod === 'client_secret_basic') {
    headers.authorization = `Basic ${base64(
      `${formEncode(client.clientId)}:${formEncode(client.clientCredential)}`
    )}`;
  }

  const response = await request.post(TOKEN_ENDPOINT, {
    headers,
    data: body.toString(),
  });
  const json = await parseOAuthJsonResponse(response, 'authorization_code token exchange');
  expect(response.ok(), `Token exchange failed: ${JSON.stringify(json)}`).toBe(true);
  return json;
}

async function startCallbackServer(configuredRedirectUri) {
  const configuredUrl = configuredRedirectUri ? new URL(configuredRedirectUri) : null;
  const defaultCallbackPath = '/mcp/oauth/callback';
  const callbackPath = configuredUrl?.pathname || defaultCallbackPath;
  const port = configuredUrl ? requireExplicitPort(configuredUrl) : 0;
  const listenHost = resolveCallbackListenHost(configuredUrl);

  let resolveCallback;
  const callbackPromise = new Promise((resolve) => {
    resolveCallback = resolve;
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', configuredRedirectUri || 'http://127.0.0.1');
    if (url.pathname !== callbackPath) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const params = Object.fromEntries(url.searchParams.entries());
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>OAuth smoke callback</title><p>OAuth callback received.</p>');
    resolveCallback(params);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    if (listenHost) {
      server.listen(port, listenHost, resolve);
    } else {
      server.listen(port, resolve);
    }
  });

  const actualPort = server.address().port;
  return {
    callbackPromise: withTimeout(callbackPromise, 120_000, 'Timed out waiting for OAuth callback'),
    redirectUri: configuredRedirectUri || `http://127.0.0.1:${actualPort}${defaultCallbackPath}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function fillLoginForm(page, user, password) {
  const switchToLogin = page.getByTestId('action-switch-to-login');
  if (await switchToLogin.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await switchToLogin.click();
  }

  const userField = await firstVisibleLocator(page, [
    () => page.locator('#login-email').first(),
    () => page.locator('input[name="username"], input[name="email"], input[type="email"]').first(),
    () => page.getByLabel(/user(name)?|email/i).first(),
    () => page.getByPlaceholder(/user(name)?|email/i).first(),
    () => page.getByRole('textbox', { name: /user(name)?|email/i }).first(),
  ], 30_000);
  await userField.fill(user);

  const passwordField = await firstVisibleLocator(page, [
    () => page.locator('#login-password').first(),
    () => page.locator('input[name="password"], input[type="password"]').first(),
    () => page.getByLabel(/password/i).first(),
    () => page.getByPlaceholder(/password/i).first(),
  ], 15_000);
  await passwordField.fill(password);

  const submit = await firstVisibleLocator(page, [
    () => page.getByTestId('action-login-submit'),
    () => page.getByRole('button', { name: /sign in|log in|login|continue/i }).first(),
    () => page.locator('button[type="submit"]').first(),
  ], 15_000);
  await submit.click();
}

async function approveConsentIfNeeded(page, callbackPromise) {
  let callbackReceived = false;
  callbackPromise.then(() => {
    callbackReceived = true;
  }).catch(() => {});

  const consentButtonCandidates = [
    () => page.getByRole('button', { name: /authorize|allow|approve|accept/i }).first(),
    () => page.getByTestId('action-oauth-authorize'),
  ];

  const deadline = Date.now() + 120_000;
  while (!callbackReceived && Date.now() < deadline) {
    for (const candidate of consentButtonCandidates) {
      const locator = candidate();
      if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
        await locator.click();
        return;
      }
    }
    await page.waitForTimeout(500);
  }
}

async function expectLoginFlow(page) {
  const loginDetected = await Promise.race([
    page.locator('#login-email, input[name="username"], input[name="email"], input[type="email"]').first()
      .waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false),
    page.getByRole('button', { name: /sign in|log in|login/i }).first()
      .waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false),
    page.waitForURL(/login|onboarding|security/i, { timeout: 30_000 }).then(() => true).catch(() => false),
  ]);
  expect(loginDetected, 'Unauthenticated OAuth authorize must reach the standard login flow').toBe(true);
}

async function expectNotOnlyPwaShell(page) {
  const html = await page.locator('html').evaluate((node) => node.outerHTML).catch(() => '');
  expect(looksLikeOnlyPwaShell(html), 'Page must not be only the Vite/PWA shell').toBe(false);
}

function looksLikeOnlyPwaShell(html) {
  return /<div[^>]+id=["']root["'][^>]*>\s*<\/div>/i.test(html) &&
    /<script[^>]+src=["'][^"']*(\/src\/main|\/assets\/index-)[^"']*["']/i.test(html) &&
    !/login|sign in|username|password|authorize/i.test(html);
}

async function getJson(request, url, label) {
  const response = await request.get(url, { headers: { accept: 'application/json' } });
  expect(response.ok(), `${label} request failed with HTTP ${response.status()}`).toBe(true);
  return parseOAuthJsonResponse(response, label);
}

async function parseOAuthJsonResponse(response, label) {
  const contentType = response.headers()['content-type'] || '';
  const text = await response.text();
  expect(contentType, `${label} must return JSON, body: ${text.slice(0, 300)}`).toContain('application/json');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}. Body: ${text.slice(0, 300)}`);
  }
}

async function firstVisibleLocator(page, factories, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const factory of factories) {
      const locator = factory();
      if (await locator.isVisible({ timeout: 250 }).catch(() => false)) {
        return locator;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Could not find a visible login control within ${timeout}ms`);
}

function expectPublicEndpoint(value, publicBaseUrl, label) {
  expect(value, `${label} must be present`).toBeTruthy();
  const parsed = new URL(value);
  const publicOrigin = new URL(publicBaseUrl).origin;
  expect(parsed.origin, `${label} must use the public origin`).toBe(publicOrigin);
  expect(parsed.protocol, `${label} must be HTTPS`).toBe('https:');
}

function expectHttpsEndpoint(value, label) {
  expect(value, `${label} must be present`).toBeTruthy();
  const parsed = new URL(value);
  expect(parsed.protocol, `${label} must be HTTPS`).toBe('https:');
}

function requireExplicitPort(url) {
  if (!url.port) {
    throw new Error(
      'E2E_MCP_OAUTH_REDIRECT_URI must include an explicit local callback port, ' +
        'for example http://127.0.0.1:49152/mcp/oauth/callback.'
    );
  }
  return Number(url.port);
}

function resolveCallbackListenHost(url) {
  if (!url) return '127.0.0.1';

  const host = url.hostname;
  if (host === '127.0.0.1') return host;
  if (host === '[::1]' || host === '::1') return '::1';
  if (host === 'localhost') return null;

  throw new Error(
    'E2E_MCP_OAUTH_REDIRECT_URI must use a loopback host: 127.0.0.1, localhost, or [::1].'
  );
}

function withTimeout(promise, timeoutMs, message) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function base64Url(value) {
  return base64(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64(value) {
  return Buffer.from(value).toString('base64');
}

function formEncode(value) {
  return encodeURIComponent(value)
    .replace(/[!'()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}
