import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth.js';
import { t } from '../helpers/i18n.js';

/**
 * Copilot agent navigation — smoke (mocked).
 *
 * ETP-5064. The agent's `navigate_to` / `open_form` tools used to resolve a
 * window through a hardcoded alias table that knew only the two goods
 * documents, so "llevame a sales order" raised
 * "Only internal application paths are allowed" — the message meant for an
 * external URL — and the model concluded navigation was unavailable and told
 * the user to open the menu by hand.
 *
 * This spec isolates the browser half of the loop: it serves a fabricated AI
 * SDK UI-message stream in place of the BFF, so what is asserted is the tool
 * call landing in the router (and the error text handed back on a bad one),
 * with no model, no OpenCode credential and no `/sws/mcp` involved. The model
 * half — whether it CHOOSES to call the tool — is not testable here by design.
 *
 * It rides the generic /sws/** interception that login() seeds, but the dev
 * server must NOT run with VITE_MOCK: in mock mode the app patches
 * `window.fetch` and its API base is `/api` (App.jsx), so `/api/ai/chat`
 * matches that prefix and mockFetch.js answers it in-page — the request never
 * reaches the network, and neither page.route nor the BFF ever sees it. The
 * flag is fixed when the server starts and defaults to off, so it has to be
 * passed there too (same constraint as proof-of-concept-menu.mocked.spec.js):
 *
 *   VITE_FEATURE_FLAGS='{"webmcp-agent-chat":true}' npx vite --port 3104
 *   E2E_USE_MOCK=1 BASE_URL=http://localhost:3104 E2E_WEBMCP_AGENT_CHAT_FLAG=on \
 *     npx playwright test tests/flows/copilot-agent-navigation.mocked.spec.js --project=mocked
 */

// Without the flag the agent chat (and its client tools) does not exist, so
// there is nothing to assert — skip rather than fail on an absent feature.
const FLAG_ON = process.env.E2E_WEBMCP_AGENT_CHAT_FLAG === 'on';

const CHAT_ENDPOINT = '**/api/ai/chat';

/** Chunk stream in AI SDK v7 UI-message SSE format (see JsonToSseTransformStream). */
function sseBody(chunks) {
  return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

/**
 * One assistant turn that calls a client-side tool. `useAiCopilotChat` runs it
 * through `onToolCall`, so the browser executes the navigation itself.
 */
function toolCallTurn({ toolName, input, callId = 'call-1' }) {
  return sseBody([
    { type: 'start' },
    { type: 'start-step' },
    { type: 'tool-input-available', toolCallId: callId, toolName, input },
    { type: 'finish-step' },
    { type: 'finish' },
  ]);
}

/** A plain text turn, used for the follow-up request the SDK sends automatically. */
function textTurn(text, id = 'msg-2') {
  return sseBody([
    { type: 'start' },
    { type: 'start-step' },
    { type: 'text-start', id },
    { type: 'text-delta', id, delta: text },
    { type: 'text-end', id },
    { type: 'finish-step' },
    { type: 'finish' },
  ]);
}

/**
 * Serve `firstTurn` to the tool-calling request and a text turn afterwards,
 * capturing every request body so the tool result the browser reports back is
 * observable.
 */
async function mockChat(page, firstTurn) {
  const requests = [];
  let served = 0;
  await page.route(CHAT_ENDPOINT, async (route) => {
    requests.push(JSON.parse(route.request().postData() || '{}'));
    const body = served === 0 ? firstTurn : textTurn('Listo.');
    served += 1;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
      body,
    });
  });
  return requests;
}

/** Tool outputs/errors the browser sent back, flattened across all requests. */
function toolParts(requests) {
  return requests
    .flatMap(request => request.messages || [])
    .flatMap(message => message.parts || [])
    .filter(part => typeof part.type === 'string' && part.type.startsWith('tool-'));
}

async function openCopilotAndSend(page, text) {
  // AppLayout renders the widget with `hideTrigger`, so the panel is opened
  // from the TopBar's Copilot action (aria-label = genericLabels.aiAssistant).
  await page.getByRole('button', { name: t('aiAssistant'), exact: true }).click();
  const input = page.getByPlaceholder(t('askSomething'));
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press('Enter');
}

test.describe('Copilot agent navigation (ETP-5064)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!FLAG_ON, 'Requires a dev server started with VITE_FEATURE_FLAGS webmcp-agent-chat=true');
    await login(page);
  });

  test('navigates when the model sends a window name instead of a path', async ({ page }) => {
    const requests = await mockChat(page, toolCallTurn({
      toolName: 'navigate_to',
      input: { path: 'Sales Order' },
    }));
    await page.goto('/contacts');
    await openCopilotAndSend(page, 'llevame a sales order');

    await expect(page).toHaveURL(/\/sales-order$/);
    await expect.poll(() => toolParts(requests).some(part => part.state === 'output-available'))
      .toBe(true);
  });

  test('navigates when the model sends the Spanish label the user reads', async ({ page }) => {
    await mockChat(page, toolCallTurn({
      toolName: 'navigate_to',
      input: { path: 'Pedido de Venta' },
    }));
    await page.goto('/contacts');
    await openCopilotAndSend(page, 'abrí pedidos de venta');

    await expect(page).toHaveURL(/\/sales-order$/);
  });

  test('opens a form at an explicit path', async ({ page }) => {
    await mockChat(page, toolCallTurn({
      toolName: 'open_form',
      input: { path: '/sales-order/new' },
    }));
    await page.goto('/contacts');
    await openCopilotAndSend(page, 'creá un pedido');

    await expect(page).toHaveURL(/\/sales-order\/new$/);
  });

  test('reports an unresolved name as recoverable and stays put', async ({ page }) => {
    const requests = await mockChat(page, toolCallTurn({
      toolName: 'navigate_to',
      input: { path: 'Ventana Inexistente' },
    }));
    await page.goto('/contacts');
    await openCopilotAndSend(page, 'llevame a la ventana inexistente');

    await expect.poll(() => toolParts(requests).find(part => part.state === 'output-error')?.errorText)
      .toContain('/sales-order');
    // The security wording must not appear for a mere lookup miss — reading it
    // is what made the agent give up on navigation entirely.
    const errors = toolParts(requests).filter(part => part.state === 'output-error');
    expect(errors.some(part => part.errorText?.includes('Only internal application paths'))).toBe(false);
    await expect(page).toHaveURL(/\/contacts$/);
  });

  test('refuses an external URL with the security error', async ({ page }) => {
    const requests = await mockChat(page, toolCallTurn({
      toolName: 'navigate_to',
      input: { path: 'https://example.com/phish' },
    }));
    await page.goto('/contacts');
    await openCopilotAndSend(page, 'abrí este link');

    await expect.poll(() => toolParts(requests).find(part => part.state === 'output-error')?.errorText)
      .toContain('Only internal application paths are allowed');
    await expect(page).toHaveURL(/\/contacts$/);
  });
});
