import http from 'node:http';
import { randomUUID } from 'node:crypto';
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

export function mcpClientOptions(authorization) {
  return {
    transport: {
      type: 'http',
      url: mcpUrl,
      headers: { Authorization: authorization },
    },
    // Etendo Go currently implements the legacy initialize handshake, not
    // the optional stateless server/discover probe from newer MCP clients.
    protocolVersionDiscovery: false,
  };
}

export function opencodeSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    ? value
    : randomUUID();
}

export function opencodeProviderOptions(sessionId) {
  return {
    name: 'opencode-go',
    baseURL: process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1',
    apiKey: process.env.OPENCODE_API_KEY,
    headers: { 'x-opencode-session': sessionId },
  };
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

/**
 * Browser-side tools: the app executes these in the page, not the BFF.
 *
 * The schema field is `inputSchema`. In ai@5+ `tool()` renamed it from
 * `parameters` and does NOT warn on the old name: the tool is still
 * advertised to the model, just with no schema, so the model calls it with no
 * arguments at all. That is what made every navigation fail with "Unknown
 * window reference undefined" — the browser resolved `args.path === undefined`
 * and the model, seeing the required path rejected, reported it "could not
 * provide a path". server.test.js fails the build if a schema goes missing
 * again.
 */
export function browserTools() {
  return {
    navigate_to: tool({
      description: [
        'Navigate the Etendo Go application to an allowed internal route.',
        'Use this tool whenever the user asks to open or go to a window.',
        'Accepts either an internal path starting with "/" (e.g. /sales-order, /sales-order/new)',
        'or the window name as the user says it, in any UI language (e.g. "Sales Order", "Pedido de Venta").',
        'The browser resolves names against this user\'s own menu, so a window this role cannot access',
        'is reported as unreachable and lists the windows that are.',
        'When a name cannot be resolved the error names every reachable window slug: retry with one of them',
        'instead of telling the user to open the menu manually.',
      ].join(' '),
      inputSchema: z.object({ path: z.string().min(1) }),
    }),
    open_form: tool({
      description: [
        'Open an Etendo Go form or window in the current application.',
        'This is a browser-side UI tool. Use it for requests to work inside a specific window.',
        'The path is required and follows the same rules as navigate_to: an internal path or a window name.',
        'Use /<window>/new only when the user explicitly asks to create a new record.',
        'Use a recordId only when the user provided or the API returned that record ID.',
      ].join(' '),
      inputSchema: z.object({ path: z.string().min(1), recordId: z.string().optional() }),
    }),
    get_current_context: tool({
      description: 'Read the current application route and window context from the browser.',
      inputSchema: z.object({}),
    }),
    open_copilot: tool({
      description: 'Open the application Copilot panel.',
      inputSchema: z.object({}),
    }),
    inspect_page_dom: tool({
      description: [
        'Inspect the current Etendo Go page from the browser.',
        'Returns a compact accessibility-oriented list of visible interactive elements with temporary elementId values.',
        'Call this before interacting with a page element. Sensitive field values are not included.',
      ].join(' '),
      inputSchema: z.object({}),
    }),
    highlight_element: tool({
      description: [
        'Point at ONE element on the current Etendo Go page and explain it to the user, tutorial style.',
        'This tool only draws a highlight and shows your note next to the element: it never clicks, focuses, types or changes any value.',
        'Prefer fieldKey (a stable form field key reported by inspect_page_dom) over elementId, because a fieldKey survives a re-render.',
        'Use elementId from inspect_page_dom for anything that is not a form field, such as a button or a tab.',
        'Highlight one element per call; to walk the user through several elements, call this tool again — each call replaces the previous highlight.',
        'Put the explanation in note, written for the user in the language of the conversation. Password fields cannot be highlighted.',
      ].join(' '),
      inputSchema: z.object({
        fieldKey: z.string().min(1).optional(),
        elementId: z.string().min(1).optional(),
        note: z.string().optional(),
        durationMs: z.number().int().positive().optional(),
      }),
    }),
    interact_with_page: tool({
      description: [
        'Interact with a visible element on the current Etendo Go page using an elementId from inspect_page_dom.',
        'Supported actions are click, fill, type, and press. Do not invent elementIds and do not use CSS selectors or JavaScript.',
        'Use fill/type only for non-sensitive visible form fields and ask the user before consequential submissions.',
      ].join(' '),
      inputSchema: z.object({
        elementId: z.string().min(1),
        action: z.enum(['click', 'fill', 'type', 'press']),
        value: z.string().optional(),
      }),
    }),
  };
}

/**
 * Trace what the model asked for and what came back.
 *
 * MCP tools (neo_list, neo_get, ...) run HERE, inside the BFF — the browser
 * never sees them, so a failed data lookup leaves no trace in the React
 * console. Only the browser tools (navigate_to, open_form, ...) surface there.
 * Reading both halves is what tells a "the model never called the tool" bug
 * apart from a "the tool answered with an error" one.
 *
 * On by default because this process is a local development BFF; set
 * AI_BFF_TRACE=off to silence it.
 */
function trace(stage, payload) {
  if (process.env.AI_BFF_TRACE === 'off') return;
  console.log(`[ai-bff:${stage}]`, JSON.stringify(payload, null, 2).slice(0, Number(process.env.AI_BFF_TRACE_MAX || 1500)));
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
  const opencodeSession = opencodeSessionId(req.headers['x-opencode-session']);

  try {
    // Page help already includes the sanitized DOM in the user message. It
    // must not wait for or depend on the Etendo MCP endpoint.
    if (!isPageHelpRequest) {
      mcpClient = await createMCPClient(mcpClientOptions(authorization));
    }
    const provider = createOpenAICompatible(opencodeProviderOptions(opencodeSession));
    const tools = isPageHelpRequest ? {} : {
      ...(await mcpClient.tools()),
      ...browserTools(),
    };
    trace('tools', { mode: isPageHelpRequest ? 'page-help' : 'chat', available: Object.keys(tools) });
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
      onStepFinish: ({ text, toolCalls, toolResults, finishReason }) => {
        trace('step', {
          finishReason,
          text: text?.slice(0, 400),
          toolCalls: (toolCalls || []).map(call => ({
            toolName: call.toolName,
            toolCallId: call.toolCallId,
            input: call.input ?? call.args,
          })),
          toolResults: (toolResults || []).map(result => ({
            toolName: result.toolName,
            toolCallId: result.toolCallId,
            output: result.output ?? result.result,
          })),
        });
      },
      onError: ({ error }) => {
        console.error('[ai-bff] model stream error:', error instanceof Error ? error.stack : error);
        // An AI_APICallError carries the provider's own reply, and that is the
        // only place the real cause is written: the wrapped message is always
        // the generic "Provider returned error". Without this, a 400 from the
        // upstream model is indistinguishable from a bad tool schema, an
        // oversized context, or a malformed message.
        if (error && typeof error === 'object' && 'responseBody' in error) {
          console.error('[ai-bff] provider response:', {
            url: error.url,
            statusCode: error.statusCode,
            responseBody: error.responseBody,
          });
        }
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
