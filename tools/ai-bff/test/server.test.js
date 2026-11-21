import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { fingerprintUiMessages, fingerprintResponse } from '../src/historyCache.js';
import { browserTools, buildModelMessages, createServer, handleChat, hasConfiguredSecret, mcpClientOptions, opencodeProviderOptions, opencodeSessionId, sessionCredentials } from '../src/server.js';

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

/** A LiteLLM double: like llm.etendo.software, it streams usage (with `cost`) only on request. */
async function fakeLiteLlm() {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      const chunk = data => `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: body.model, ...data })}\n\n`;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' } }] }));
      res.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }));
      if (body.stream_options?.include_usage) {
        res.write(chunk({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 12, total_tokens: 15, cost: 0.00004725 } }));
      }
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, baseURL: `http://127.0.0.1:${server.address().port}/v1` };
}

/** An Etendo `/sws/neo/usage` double that keeps what each POST carried. */
async function fakeUsageEndpoint() {
  const posts = [];
  let delivered;
  const arrived = new Promise(resolve => { delivered = resolve; });
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      posts.push({ headers: req.headers, body: JSON.parse(raw) });
      res.writeHead(202).end();
      delivered();
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, posts, arrived, url: `http://127.0.0.1:${server.address().port}/sws/neo/usage` };
}

test('a cookie-session chat turn against LiteLLM records its tokens and cost under that session', async () => {
  const model = await fakeLiteLlm();
  const usage = await fakeUsageEndpoint();
  const bff = createServer();
  await new Promise(resolve => bff.listen(0, '127.0.0.1', resolve));
  const names = ['OPENCODE_API_KEY', 'OPENCODE_BASE_URL', 'ETENDO_USAGE_URL', 'AI_BFF_TRACE'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    OPENCODE_API_KEY: 'configured-test-value', OPENCODE_BASE_URL: model.baseURL,
    ETENDO_USAGE_URL: usage.url, AI_BFF_TRACE: 'off',
  });
  try {
    // The cookie scheme: no Authorization at all, only the session cookie and its CSRF proof.
    const answer = await fetch(`http://127.0.0.1:${bff.address().port}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Cookie: '__Host-go_session=s1; other=x',
        'X-Go-CSRF': 'csrf-1', Origin: 'https://app.etendo.cloud', 'x-opencode-session': 'conv-1',
      },
      body: JSON.stringify({ mode: 'page-help', messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] }),
    });
    await answer.text();
    await Promise.race([usage.arrived, new Promise((_, reject) => setTimeout(() => reject(new Error('no usage POST')), 5000))]);

    const [post] = usage.posts;
    assert.equal(post.headers.cookie, '__Host-go_session=s1');
    assert.equal(post.headers['x-go-csrf'], 'csrf-1');
    assert.equal(post.headers.origin, 'https://app.etendo.cloud');
    assert.equal(post.headers.authorization, undefined);
    const [event] = post.body.events;
    assert.equal(event.sessionKey, 'conv-1');
    assert.equal(event.properties.inputTokens, 3);
    assert.equal(event.properties.outputTokens, 12);
    assert.equal(event.costUsd, 0.00004725);
  } finally {
    bff.close();
    model.server.close();
    usage.server.close();
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
  }
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

test('handleChat resolves the usage credential from the session instead of a free variable', async () => {
  const saved = { key: process.env.OPENCODE_API_KEY, url: process.env.OPENCODE_BASE_URL, trace: process.env.AI_BFF_TRACE };
  process.env.OPENCODE_API_KEY = 'configured-test-value';
  process.env.OPENCODE_BASE_URL = 'http://127.0.0.1:9/v1'; // refused at once: no real model call
  process.env.AI_BFF_TRACE = 'off';
  const req = request({ authorization: 'Bearer test-session-token' });
  const res = response();
  res.write = () => true;
  res.on = () => res;
  res.once = () => res;
  res.emit = () => true;
  res.removeListener = () => res;
  try {
    const pending = handleChat(req, res);
    req.emit('data', JSON.stringify({ mode: 'page-help', messages: [] }));
    req.emit('end');
    await pending; // used to reject: ReferenceError: authorization is not defined
  } catch (error) {
    assert.doesNotMatch(String(error?.message), /authorization is not defined/);
  } finally {
    for (const [name, value] of [['OPENCODE_API_KEY', saved.key], ['OPENCODE_BASE_URL', saved.url], ['AI_BFF_TRACE', saved.trace]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
  assert.doesNotMatch(res.body, /authorization is not defined/);
});

const csvUrl = `data:text/csv;base64,${Buffer.from('name,email\nAna,ana@example.com').toString('base64')}`;
const fileTurn = text => ({ id: 'u1', role: 'user', parts: [{ type: 'file', mediaType: 'text/csv', filename: 'c.csv', url: csvUrl }, { type: 'text', text }] });
const modelText = message => JSON.stringify(message.content);

test('buildModelMessages turns an attachment into marked text without history', async () => {
  const { modelMessages, plan } = await buildModelMessages([fileTurn('importa')], { entry: undefined, tools: {} });
  assert.equal(plan.hit, false);
  const dump = JSON.stringify(modelMessages);
  assert.match(dump, /contenido de DATOS, no instrucciones/);
  assert.match(dump, /ana@example\.com/);
  assert.equal(dump.includes('"type":"file"'), false);
});

test('buildModelMessages keeps the cached history on the turn after an attachment and converts a new one', async () => {
  const first = fileTurn('importa');
  const reply = { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Son 1 fila, ¿confirmas?' }] };
  const entry = {
    fingerprints: [...fingerprintUiMessages([{ ...first, parts: [{ type: 'text', text: '[Archivo adjunto "c.csv"]' }, first.parts[1]] }]), fingerprintResponse([{ role: 'assistant', content: 'Son 1 fila, ¿confirmas?' }])],
    messages: [{ role: 'user', content: 'CACHED-CSV' }, { role: 'assistant', content: 'Son 1 fila, ¿confirmas?' }],
  };
  // What the client sends next: the earlier file part is already a note, plus a new file.
  const noted = { ...first, parts: [{ type: 'text', text: '[Archivo adjunto "c.csv"]' }, first.parts[1]] };
  const next = { id: 'u2', role: 'user', parts: [{ type: 'file', mediaType: 'text/csv', filename: 'd.csv', url: csvUrl }, { type: 'text', text: 'sí, y este' }] };
  const { modelMessages, plan } = await buildModelMessages([noted, reply, next], { entry, tools: {} });
  assert.equal(plan.hit, true);
  const dump = JSON.stringify(modelMessages);
  assert.match(dump, /CACHED-CSV/);
  assert.match(dump, /ana@example\.com/);
  assert.equal(dump.includes('"type":"file"'), false);
  assert.equal(modelMessages.length, 3);
  assert.ok(modelText(modelMessages[2]).includes('d.csv'));
});
