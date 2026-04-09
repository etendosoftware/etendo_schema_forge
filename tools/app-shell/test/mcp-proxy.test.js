import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL = resolve(import.meta.dirname, '..');
const SOURCE = resolve(APP_SHELL, 'vite-plugins/mcp-proxy.js');

describe('mcp-proxy plugin structure', () => {
  it('file exists at vite-plugins/mcp-proxy.js', () => {
    assert.ok(existsSync(SOURCE), 'mcp-proxy.js should exist');
  });

  it('exports a default function', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('export default function mcpRetryProxy'), 'should export default mcpRetryProxy function');
  });

  it('returns a Vite plugin object with name and configureServer', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("name: 'mcp-retry-proxy'"), 'plugin should have name mcp-retry-proxy');
    assert.ok(src.includes('configureServer(server)'), 'plugin should implement configureServer');
  });

  it('rewrites /mcp path to /sws/mcp on the upstream', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("req.url.replace(/^\\/mcp/, '/sws/mcp')"), 'should rewrite /mcp -> /sws/mcp');
  });

  it('defines retry constants MAX_RETRIES=10 and exponential backoff', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('MAX_RETRIES = 10'), 'should set MAX_RETRIES to 10');
    assert.ok(src.includes('BASE_DELAY_MS = 1000'), 'should set BASE_DELAY_MS to 1000');
    assert.ok(src.includes('MAX_DELAY_MS = 10000'), 'should cap delay at 10000ms');
    assert.ok(src.includes('2 **'), 'should use exponential (2^attempt) backoff');
  });

  it('handles retryable network error codes', () => {
    const src = readFileSync(SOURCE, 'utf8');
    const retryCodes = ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];
    for (const code of retryCodes) {
      assert.ok(src.includes(`'${code}'`), `should handle retryable error code ${code}`);
    }
  });

  it('returns 502 JSON error after exhausting retries', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('502'), 'should respond with 502 on final failure');
    assert.ok(src.includes('upstream_unavailable'), 'should include upstream_unavailable in error payload');
  });

  it('guards against writing to already-ended responses', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('res.headersSent'), 'should check headersSent before writing');
    assert.ok(src.includes('res.writableEnded'), 'should check writableEnded before ending');
  });

  it('only intercepts requests starting with /mcp', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("startsWith('/mcp')"), 'middleware should only intercept /mcp requests');
    assert.ok(src.includes('return next()'), 'non-mcp requests should be passed to next()');
  });

  it('uses keepAlive http/https agents', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('keepAlive: true'), 'should use keepAlive agent for connection reuse');
  });
});

describe('mcp-proxy plugin runtime', () => {
  it('plugin factory returns object with correct name', async () => {
    const { default: mcpRetryProxy } = await import('../vite-plugins/mcp-proxy.js');
    const plugin = mcpRetryProxy('http://localhost:8080/etendo');
    assert.equal(plugin.name, 'mcp-retry-proxy');
    assert.equal(typeof plugin.configureServer, 'function');
  });

  it('works with HTTPS target URL', async () => {
    const { default: mcpRetryProxy } = await import('../vite-plugins/mcp-proxy.js');
    // Should not throw when initializing with https URL
    assert.doesNotThrow(() => mcpRetryProxy('https://my-etendo.example.com/etendo'));
  });

  it('configureServer registers middleware on server.middlewares', async () => {
    const { default: mcpRetryProxy } = await import('../vite-plugins/mcp-proxy.js');
    const plugin = mcpRetryProxy('http://localhost:8080/etendo');

    let middlewareRegistered = false;
    const mockServer = {
      middlewares: {
        use(fn) {
          assert.equal(typeof fn, 'function', 'middleware should be a function');
          middlewareRegistered = true;
        },
      },
    };

    plugin.configureServer(mockServer);
    assert.ok(middlewareRegistered, 'configureServer should register middleware');
  });

  it('middleware calls next() for non-/mcp requests', async () => {
    const { default: mcpRetryProxy } = await import('../vite-plugins/mcp-proxy.js');
    const plugin = mcpRetryProxy('http://localhost:8080/etendo');

    let capturedMiddleware;
    const mockServer = {
      middlewares: { use(fn) { capturedMiddleware = fn; } },
    };
    plugin.configureServer(mockServer);

    let nextCalled = false;
    capturedMiddleware({ url: '/some-other-path' }, {}, () => { nextCalled = true; });
    assert.ok(nextCalled, 'non-/mcp requests should call next()');
  });
});
