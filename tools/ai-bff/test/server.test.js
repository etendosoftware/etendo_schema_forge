import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { browserTools, createServer, handleChat, hasConfiguredSecret } from '../src/server.js';

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
