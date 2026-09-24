import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { browserTools, createServer, handleChat, hasConfiguredSecret, mcpClientOptions, opencodeProviderOptions, opencodeSessionId, sessionCredentials } from '../src/server.js';

function request(headers = {}) {
  const req = new EventEmitter();
  req.headers = headers;
  req.destroy = () => {};
  return req;
}

function response() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

test('rejects missing and literal null model credentials', () => {
  assert.equal(hasConfiguredSecret(undefined), false);
  assert.equal(hasConfiguredSecret(''), false);
  assert.equal(hasConfiguredSecret('null'), false);
  assert.equal(hasConfiguredSecret(' undefined '), false);
  assert.equal(hasConfiguredSecret('configured-secret'), true);
});

test('uses the legacy MCP handshake supported by Etendo Go', () => {
  const options = mcpClientOptions({ authorization: 'Bearer test-session-token' });
  assert.equal(options.protocolVersionDiscovery, false);
  assert.equal(options.transport.type, 'http');
  assert.equal(options.transport.headers.Authorization, 'Bearer test-session-token');
});

/**
 * ETP-4576 — under the cookie scheme the browser holds no token, so a gate on
 * `Authorization: Bearer` rejected every in-app conversation with a 401 that read
 * like an expired login. Both schemes must be accepted while the migration lands.
 */
test('accepts either credential scheme and rejects only a request carrying neither', () => {
  assert.deepEqual(
    sessionCredentials({ authorization: 'Bearer t' }),
    { authorization: 'Bearer t' });

  const cookie = sessionCredentials({
    cookie: 'other=1; __Host-go_session=abc; analytics=xyz',
    'x-go-csrf': 'csrf-1',
    origin: 'http://localhost:3100',
  });
  // Only the credential travels: ETENDO_MCP_URL is configuration, and forwarding the whole
  // jar would hand unrelated cookies to whatever it points at.
  assert.equal(cookie.cookie, '__Host-go_session=abc');
  assert.equal(cookie.csrfToken, 'csrf-1');

  assert.equal(sessionCredentials({}), null);
  assert.equal(sessionCredentials({ authorization: 'Basic nope' }), null);
  // A cookie jar without the session cookie is not a credential.
  assert.equal(sessionCredentials({ cookie: 'locale=es_ES' }), null);
});

/**
 * `Origin` is the one that is easy to drop: GoSessionSecurity.isOriginAllowed() fails
 * closed on unsafe methods, so losing it turns the 401 this fixes into a 403 that reads
 * like an unrelated bug.
 */
test('forwards every header the cookie session needs to reach the MCP endpoint', () => {
  const headers = mcpClientOptions(sessionCredentials({
    cookie: '__Host-go_session=abc',
    'x-go-csrf': 'csrf-1',
    origin: 'http://localhost:3100',
    referer: 'http://localhost:3100/sales-order',
  })).transport.headers;

  assert.equal(headers.Cookie, '__Host-go_session=abc');
  assert.equal(headers['X-Go-CSRF'], 'csrf-1');
  assert.equal(headers.Origin, 'http://localhost:3100');
  assert.equal(headers.Referer, 'http://localhost:3100/sales-order');
  assert.equal(headers.Authorization, undefined);
});

test('preserves a valid OpenCode session and creates a fallback when absent', () => {
  assert.equal(opencodeSessionId('chat-session-1'), 'chat-session-1');
  assert.match(opencodeSessionId(undefined), /^[0-9a-f-]{36}$/);
  assert.match(opencodeSessionId('x'.repeat(129)), /^[0-9a-f-]{36}$/);
});

test('forwards the OpenCode session header to the model provider', () => {
  const options = opencodeProviderOptions('chat-session-1');
  assert.equal(options.headers['x-opencode-session'], 'chat-session-1');
});

test('creates an HTTP server without opening a listener on import', () => {
  const server = createServer();
  assert.equal(typeof server.listen, 'function');
  server.close();
});

test('protects chat requests with model configuration and a user session', async () => {
  const originalKey = process.env.OPENCODE_API_KEY;
  delete process.env.OPENCODE_API_KEY;
  const missingKeyResponse = response();
  await handleChat(request(), missingKeyResponse);
  assert.equal(missingKeyResponse.statusCode, 503);

  process.env.OPENCODE_API_KEY = 'configured-test-value';
  const missingSessionResponse = response();
  await handleChat(request(), missingSessionResponse);
  assert.equal(missingSessionResponse.statusCode, 401);

  if (originalKey === undefined) delete process.env.OPENCODE_API_KEY;
  else process.env.OPENCODE_API_KEY = originalKey;
});

/**
 * Browser tools are only useful if the model is told what to pass them.
 * `tool({ parameters })` — the ai@4 field name — is accepted silently by
 * ai@7 and yields a tool with NO schema, so the model calls it with no
 * arguments and every navigation fails as "Unknown window reference
 * undefined". These tests fail instead.
 */
test('every browser tool declares an input schema', () => {
  const tools = browserTools();
  assert.ok(Object.keys(tools).length > 0);
  for (const [name, definition] of Object.entries(tools)) {
    assert.ok(definition.inputSchema, `${name} has no inputSchema`);
    assert.equal(definition.parameters, undefined, `${name} still uses the retired 'parameters' field`);
  }
});

test('the navigation tools require the path the model must resolve', () => {
  const { navigate_to: navigateTo, open_form: openForm } = browserTools();

  assert.deepEqual(navigateTo.inputSchema.parse({ path: '/sales-order' }), { path: '/sales-order' });
  assert.throws(() => navigateTo.inputSchema.parse({}));
  assert.throws(() => navigateTo.inputSchema.parse({ path: '' }));

  assert.deepEqual(openForm.inputSchema.parse({ path: 'Pedido de Venta' }), { path: 'Pedido de Venta' });
  assert.throws(() => openForm.inputSchema.parse({ recordId: 'abc' }));
});

test('the argument-free tools accept an empty object', () => {
  for (const name of ['get_current_context', 'open_copilot', 'inspect_page_dom']) {
    assert.deepEqual(browserTools()[name].inputSchema.parse({}), {});
  }
});

test('page interaction only allows the four supported actions', () => {
  const { inputSchema } = browserTools().interact_with_page;
  assert.deepEqual(inputSchema.parse({ elementId: 'dom-1', action: 'click' }), { elementId: 'dom-1', action: 'click' });
  assert.throws(() => inputSchema.parse({ elementId: 'dom-1', action: 'evaluate' }));
});
