import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { experimental_createMCPClient as createMCPClient, convertToCoreMessages, streamText, tool } from 'ai';
import { z } from 'zod';
import { StreamableHTTPTransport } from './streamable-http-transport.js';

const port = Number(process.env.BFF_PORT || 3400);
const mcpUrl = process.env.ETENDO_MCP_URL || 'http://localhost:8080/etendo/sws/mcp';
const modelId = process.env.OPENCODE_MODEL || 'kimi-k2.6';
const maxBodyBytes = Number(process.env.BFF_MAX_BODY_BYTES || 1_000_000);
const mcpTimeoutMs = Number(process.env.ETENDO_MCP_TIMEOUT_MS || 10_000);
const modelTimeoutMs = Number(process.env.OPENCODE_TIMEOUT_MS || 60_000);

export function hasConfiguredSecret(value) {
  return Boolean(value && !['null', 'undefined'].includes(value.trim().toLowerCase()));
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bodyBytes = 0;
    let settled = false;
    req.on('data', chunk => { body += chunk; });
    req.on('data', chunk => {
      if (settled) return;
      bodyBytes += Buffer.byteLength(chunk);
      if (bodyBytes > maxBodyBytes) {
        settled = true;
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', error => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

export async function handleChat(req, res) {
  if (!hasConfiguredSecret(process.env.OPENCODE_API_KEY)) {
    return json(res, 503, { error: 'OPENCODE_API_KEY is not configured' });
  }

  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return json(res, 401, { error: 'A user session Bearer token is required' });
  }

  const body = await readBody(req);
  let mcpClient;

  try {
    mcpClient = await createMCPClient({
      transport: new StreamableHTTPTransport({
        url: mcpUrl,
        headers: { Authorization: authorization },
        timeoutMs: mcpTimeoutMs,
      }),
    });
    const provider = createOpenAICompatible({
      name: 'opencode-go',
      baseURL: process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1',
      apiKey: process.env.OPENCODE_API_KEY,
    });
    const tools = {
      ...(await mcpClient.tools()),
      navigate_to: tool({
        description: 'Navigate the Etendo Go application to an allowed internal route.',
        parameters: z.object({ path: z.string().min(1) }),
      }),
      open_form: tool({
        description: 'Open an Etendo Go form or window in the current application.',
        parameters: z.object({ path: z.string().min(1), recordId: z.string().optional() }),
      }),
      get_current_context: tool({
        description: 'Read the current application route and window context from the browser.',
        parameters: z.object({}),
      }),
      open_copilot: tool({
        description: 'Open the application Copilot panel.',
        parameters: z.object({}),
      }),
    };
    const result = streamText({
      model: provider.chatModel(modelId),
      messages: convertToCoreMessages(body.messages || []),
      tools,
      maxSteps: 8,
      abortSignal: AbortSignal.timeout(modelTimeoutMs),
      onError: ({ error }) => {
        console.error('[ai-bff] model stream error:', error instanceof Error ? error.stack : error);
      },
      onFinish: async () => mcpClient.close(),
    });
    result.pipeDataStreamToResponse(res);
  } catch (error) {
    await mcpClient?.close().catch(() => {});
    json(res, 502, { error: error instanceof Error ? error.message : 'AI request failed' });
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true });
  if (req.method === 'POST' && req.url === '/api/ai/chat') {
    try { return await handleChat(req, res); } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : 'Request failed' });
    }
  }
  json(res, 404, { error: 'Not found' });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(port, () => console.log(`[ai-bff] listening on http://localhost:${port}`));
}
