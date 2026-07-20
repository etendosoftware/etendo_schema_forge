import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const runnerPath = join(__dirname, 'stress', 'runner.js');

function runStressCli(args, env = {}) {
  return new Promise((resolve) => {
    const child = fork(runnerPath, args, {
      env: { ...process.env, ...env },
      silent: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data;
    });

    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe('Email Send Stress Test Runner', () => {
  let server;
  let port;
  let seenKeys = new Set();
  let requestCount = 0;
  let mockMode = 'double-send'; // 'double-send', 'double-send-fail', 'concurrent-load', 'concurrent-load-fail'

  before((t, done) => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const url = req.url;

        // Preview File cache endpoint
        if (url.includes('/preview-file')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'cached' }));
          return;
        }

        // Email send endpoint
        if (url.includes('/email-contracts/sales-order-send/send')) {
          const payload = JSON.parse(body);
          const idempotencyKey = payload.idempotencyKey;

          if (mockMode === 'double-send') {
            if (seenKeys.has(idempotencyKey)) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ deduplicated: true }));
            } else {
              seenKeys.add(idempotencyKey);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ accepted: true }));
            }
            return;
          }

          if (mockMode === 'double-send-fail') {
            // Dedup fails, all requests are treated as new/accepted
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ accepted: true }));
            return;
          }

          if (mockMode === 'concurrent-load') {
            requestCount++;
            if (requestCount > 2) {
              res.writeHead(429, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Too Many Requests' }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'success' }));
            }
            return;
          }

          if (mockMode === 'concurrent-load-fail') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
            return;
          }
        }

        res.writeHead(404);
        res.end();
      });
    });

    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      done();
    });
  });

  // Teardown server after tests
  after((t, done) => {
    server.close(done);
  });

  // Edge Case 1: double-send success path
  it('passes double-send when exactly 1 accepted and remaining deduplicated', async () => {
    seenKeys.clear();
    mockMode = 'double-send';

    const { code, stdout, stderr } = await runStressCli([
      '--scenario', 'double-send',
      '--workers', '5',
      '--document-id', 'DOC-12345',
      '--window-name', 'sales-order',
      '--base-url', `http://127.0.0.1:${port}`,
      '--token', 'mock-jwt-token',
    ]);

    assert.equal(code, 0, `Process exited with error: ${stderr}`);
    assert.match(stdout, /PASS — idempotency dedup working correctly/);
    assert.match(stdout, /Accepted:\s+1/);
    assert.match(stdout, /Deduplicated:\s+4/);
  });

  // Edge Case 2: double-send failure path (multiple accepted)
  it('fails double-send when more than 1 request is accepted', async () => {
    mockMode = 'double-send-fail';

    const { code, stdout } = await runStressCli([
      '--scenario', 'double-send',
      '--workers', '3',
      '--document-id', 'DOC-12345',
      '--window-name', 'sales-order',
      '--base-url', `http://127.0.0.1:${port}`,
      '--token', 'mock-jwt-token',
    ]);

    assert.equal(code, 1);
    assert.match(stdout, /FAIL — expected exactly 1 accepted/);
    assert.match(stdout, /Accepted:\s+3/);
    assert.match(stdout, /Deduplicated:\s+0/);
  });

  // Edge Case 3: concurrent-load throttling path
  it('passes concurrent-load with throttled requests but zero unexpected errors', async () => {
    requestCount = 0;
    mockMode = 'concurrent-load';

    const { code, stdout } = await runStressCli([
      '--scenario', 'concurrent-load',
      '--workers', '4',
      '--window-name', 'sales-order',
      '--base-url', `http://127.0.0.1:${port}`,
      '--token', 'mock-jwt-token',
    ]);

    assert.equal(code, 0);
    assert.match(stdout, /PASS — concurrent load test finished successfully/);
    assert.match(stdout, /Accepted:\s+2/);
    assert.match(stdout, /Throttled:\s+2/);
    assert.match(stdout, /Errors:\s+0/);
    assert.match(stdout, /First Throttle At:\s+Worker index \d/);
  });

  it('generates synthetic document IDs when --count is provided for concurrent-load', async () => {
    requestCount = 0;
    mockMode = 'concurrent-load';

    const { code, stdout } = await runStressCli([
      '--scenario', 'concurrent-load',
      '--workers', '3',
      '--count', '3',
      '--window-name', 'sales-order',
      '--base-url', `http://127.0.0.1:${port}`,
      '--token', 'mock-jwt-token',
    ]);

    assert.equal(code, 0);
    assert.match(stdout, /PASS — concurrent load test finished successfully/);
  });

  // Edge Case 4: concurrent-load with unexpected errors
  it('fails concurrent-load when unexpected server errors occur', async () => {
    mockMode = 'concurrent-load-fail';

    const { code, stdout } = await runStressCli([
      '--scenario', 'concurrent-load',
      '--workers', '3',
      '--window-name', 'sales-order',
      '--base-url', `http://127.0.0.1:${port}`,
      '--token', 'mock-jwt-token',
    ]);

    assert.equal(code, 1);
    assert.match(stdout, /FAIL — unexpected errors occurred/);
    assert.match(stdout, /Errors:\s+3/);
  });

  // Edge Case 5: parameter validation errors
  it('fails with parameter validation errors when required arguments are missing', async () => {
    // Missing scenario
    const res1 = await runStressCli([
      '--workers', '3',
      '--token', 'mock-jwt',
    ]);
    assert.equal(res1.code, 1);
    assert.match(res1.stderr, /Error: --scenario must be either/);

    // Missing token
    const res2 = await runStressCli([
      '--scenario', 'double-send',
      '--document-id', 'DOC-1',
    ]);
    assert.equal(res2.code, 1);
    assert.match(res2.stderr, /Error: --token .* is required/);

    // Missing document-id for double-send
    const res3 = await runStressCli([
      '--scenario', 'double-send',
      '--token', 'mock-jwt',
    ]);
    assert.equal(res3.code, 1);
    assert.match(res3.stderr, /Error: --document-id .* is required/);
  });
});
