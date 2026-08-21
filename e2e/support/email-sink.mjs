import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.E2E_EMAIL_SINK_PORT || 8025);
const host = process.env.E2E_EMAIL_SINK_HOST || '0.0.0.0';
const apiKey = process.env.E2E_EMAIL_SINK_API_KEY || 'e2e-only-secret';
const messages = [];

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  response.end(status === 204 ? '' : JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, x-api-key',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    json(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && request.url === '/messages') {
    json(response, 200, { messages });
    return;
  }

  if (request.method === 'DELETE' && request.url === '/messages') {
    messages.length = 0;
    json(response, 204, {});
    return;
  }

  if (request.method === 'POST' && request.url === '/send') {
    if (request.headers['x-api-key'] !== apiKey) {
      json(response, 401, { error: 'invalid sink api key' });
      return;
    }
    try {
      const payload = JSON.parse(await readBody(request));
      messages.push({ id: randomUUID(), receivedAt: new Date().toISOString(), ...payload });
      json(response, 202, { accepted: true });
    } catch {
      json(response, 400, { error: 'invalid json' });
    }
    return;
  }

  json(response, 404, { error: 'not found' });
});

server.listen(port, host, () => {
  process.stdout.write(`email sink listening on http://${host}:${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
