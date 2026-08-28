import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createMCPClient } from '@ai-sdk/mcp';
import { convertToModelMessages, pipeUIMessageStreamToResponse, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const port = Number(process.env.BFF_PORT || 3400);
const mcpUrl = process.env.ETENDO_MCP_URL || 'http://localhost:8080/etendo/sws/mcp';
const modelId = process.env.OPENCODE_MODEL || 'kimi-k2.6';
const maxBodyBytes = Number(process.env.BFF_MAX_BODY_BYTES || 1_000_000);
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
  const isPageHelpRequest = body.mode === 'page-help';

  try {
    // Page help already includes the sanitized DOM in the user message. It
    // must not wait for or depend on the Etendo MCP endpoint.
    if (!isPageHelpRequest) {
      mcpClient = await createMCPClient({
        transport: {
          type: 'http',
          url: mcpUrl,
          headers: { Authorization: authorization },
        },
      });
    }
    const provider = createOpenAICompatible({
      name: 'opencode-go',
      baseURL: process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1',
      apiKey: process.env.OPENCODE_API_KEY,
    });
    const tools = isPageHelpRequest ? {} : {
      ...(await mcpClient.tools()),
      navigate_to: tool({
        description: [
          'Navigate the Etendo Go application to an allowed internal route.',
          'Use this tool whenever the user asks to open or go to a window.',
          'Known menu routes include Goods Receipt (purchase receipts): /goods-receipt,',
          'Goods Shipment (sales deliveries): /goods-shipment, Sales Order: /sales-order,',
          'Purchase Order: /purchase-order, Sales Invoice: /sales-invoice, and Purchase Invoice: /purchase-invoice.',
          'Do not instruct the user to open the menu manually when one of these routes matches the request.',
        ].join(' '),
        parameters: z.object({ path: z.string().min(1) }),
      }),
      open_form: tool({
        description: [
          'Open an Etendo Go form or window in the current application.',
          'This is a browser-side UI tool. Use it for requests to work inside a specific window,',
          'including Goods Receipt at /goods-receipt and Goods Shipment at /goods-shipment.',
          'The path may be omitted when the requested window is clear from the conversation; the browser resolves it from the user request.',
          'Use /<window>/new only when the user explicitly asks to create a new record.',
          'Use a recordId only when the user provided or the API returned that record ID.',
        ].join(' '),
        parameters: z.object({ path: z.string().min(1).optional(), recordId: z.string().optional() }),
      }),
      get_current_context: tool({
        description: 'Read the current application route and window context from the browser.',
        parameters: z.object({}),
      }),
      open_copilot: tool({
        description: 'Open the application Copilot panel.',
        parameters: z.object({}),
      }),
      inspect_page_dom: tool({
        description: [
          'Inspect the current Etendo Go page from the browser.',
          'Returns a compact accessibility-oriented list of visible interactive elements with temporary elementId values.',
          'Call this before interacting with a page element. Sensitive field values are not included.',
        ].join(' '),
        parameters: z.object({}),
      }),
      interact_with_page: tool({
        description: [
          'Interact with a visible element on the current Etendo Go page using an elementId from inspect_page_dom.',
          'Supported actions are click, fill, type, and press. Do not invent elementIds and do not use CSS selectors or JavaScript.',
          'Use fill/type only for non-sensitive visible form fields and ask the user before consequential submissions.',
        ].join(' '),
        parameters: z.object({
          elementId: z.string().min(1),
          action: z.enum(['click', 'fill', 'type', 'press']),
          value: z.string().optional(),
        }),
      }),
    };
    const result = streamText({
      model: provider.chatModel(modelId),
      messages: await convertToModelMessages(body.messages || [], { tools }),
      tools,
      ...(isPageHelpRequest ? {
        // Page help is a lightweight observation, not an agentic task.
        providerOptions: { openaiCompatible: { reasoningEffort: 'none' } },
        maxOutputTokens: 220,
        temperature: 0.1,
      } : {}),
      stopWhen: stepCountIs(8),
      abortSignal: AbortSignal.timeout(modelTimeoutMs),
      onError: ({ error }) => {
        console.error('[ai-bff] model stream error:', error instanceof Error ? error.stack : error);
      },
      onFinish: async () => mcpClient?.close(),
    });
    await pipeUIMessageStreamToResponse({ response: res, stream: result.toUIMessageStream() });
  } catch (error) {
    if (mcpClient) await mcpClient.close().catch(() => {});
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
