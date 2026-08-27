import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer, handleChat, hasConfiguredSecret } from './server.js';

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
