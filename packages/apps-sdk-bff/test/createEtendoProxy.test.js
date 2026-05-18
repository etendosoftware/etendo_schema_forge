import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createEtendoProxy } from '../src/createEtendoProxy.js';

async function startUpstream(handler) {
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, r));
  return { server, port: server.address().port };
}

test('proxy rewrites path to /sws/* and replaces inbound Authorization with service token', async () => {
  let receivedAuth = null;
  let receivedPath = null;
  const { server: upstream, port: upstreamPort } = await startUpstream((req, res) => {
    receivedAuth = req.headers.authorization;
    receivedPath = req.url;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });

  const etendoAuth = { getToken: async () => 'service-tok-123' };
  const app = express();
  app.use('/api/etendo',
    ...createEtendoProxy({ target: `http://127.0.0.1:${upstreamPort}`, etendoAuth }));

  const bff = app.listen(0);
  const port = bff.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/api/etendo/neo/product/product`, {
    headers: { Authorization: 'Bearer inbound-app-jwt-DO-NOT-FORWARD' },
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(receivedPath, '/sws/neo/product/product',
    'path must be rewritten to /sws/* after Express strips the mount prefix');
  assert.equal(receivedAuth, 'Bearer service-tok-123',
    'inbound app JWT must NEVER reach upstream — it must be replaced by the service token');

  bff.close();
  upstream.close();
});

test('proxy returns 502 when service token fetch fails', async () => {
  const etendoAuth = { getToken: async () => { throw new Error('login down'); } };
  const app = express();
  app.use('/api/etendo',
    ...createEtendoProxy({ target: 'http://127.0.0.1:1', etendoAuth }));

  const bff = app.listen(0);
  const port = bff.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/api/etendo/neo/x`);
  const body = await res.json();
  assert.equal(res.status, 502);
  assert.equal(body.error, 'upstream_auth_failed');
  assert.equal(body.detail, 'login down');
  bff.close();
});

test('proxy retries with fresh token on 403 and succeeds', async () => {
  let calls = 0;
  const { server: upstream, port: upstreamPort } = await startUpstream((req, res) => {
    calls += 1;
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization === 'Bearer stale-token') {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'token rejected' }));
    } else {
      res.end(JSON.stringify({ ok: true }));
    }
  });

  let refreshed = false;
  const etendoAuth = {
    getToken: async () => 'stale-token',
    forceRefresh: async () => { refreshed = true; return 'fresh-token'; },
  };
  const app = express();
  app.use('/api/etendo',
    ...createEtendoProxy({ target: `http://127.0.0.1:${upstreamPort}`, etendoAuth }));

  const bff = app.listen(0);
  const port = bff.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/api/etendo/neo/product`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true });
  assert.equal(refreshed, true, 'forceRefresh must be called on 403');
  assert.equal(calls, 2, 'upstream must receive exactly 2 requests (original + retry)');

  bff.close();
  upstream.close();
});

test('proxy passes through 403 when retry also fails', async () => {
  const { server: upstream, port: upstreamPort } = await startUpstream((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'still forbidden' }));
  });

  const etendoAuth = {
    getToken: async () => 'tok',
    forceRefresh: async () => 'tok2',
  };
  const app = express();
  app.use('/api/etendo',
    ...createEtendoProxy({ target: `http://127.0.0.1:${upstreamPort}`, etendoAuth }));

  const bff = app.listen(0);
  const port = bff.address().port;

  const res = await fetch(`http://127.0.0.1:${port}/api/etendo/neo/x`);
  assert.equal(res.status, 403);

  bff.close();
  upstream.close();
});
