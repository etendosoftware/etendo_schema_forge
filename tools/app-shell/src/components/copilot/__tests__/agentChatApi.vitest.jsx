/**
 * agentChatApi.js — the agent chat history client (/sws/agent-chat/*).
 * Runs the real apiFetch over a mocked fetch, with a registered session whose 401 handler is a spy.
 */
import { registerApiSession, resetApiSessionForTests } from '@etendosoftware/app-shell-core/auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendAgentMessages,
  archiveAgentConversation,
  createAgentConversation,
  getAgentConversationMessages,
  getAgentConversations,
  getArchivedAgentConversations,
  permanentDeleteAgentConversation,
  renameAgentConversation,
  restoreAgentConversation,
} from '../agentChatApi.js';

const onUnauthorized = vi.fn();

function respond(status, data) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => (data === undefined ? '' : JSON.stringify(data)),
  });
}
const lastCall = () => {
  const [url, init] = globalThis.fetch.mock.calls[0];
  return { url, init, body: init.body ? JSON.parse(init.body) : undefined };
};

describe('agentChatApi', () => {
  beforeEach(() => {
    onUnauthorized.mockClear();
    registerApiSession({ getToken: () => null, onUnauthorized, baseUrl: '' });
  });
  afterEach(() => resetApiSessionForTests());

  it('lists active and archived conversations from /sws/agent-chat, normalized, without any app id', async () => {
    respond(200, { conversations: [{ id: 'C1', title: 'Hola' }] });
    const list = await getAgentConversations();
    expect(lastCall().url).toMatch(/\/sws\/agent-chat\/conversations$/);
    expect(lastCall().init.method).toBe('GET');
    expect(list).toEqual([expect.objectContaining({ conversation_id: 'C1', title: 'Hola' })]);

    respond(200, { conversations: [{ id: 'C9' }] });
    await getArchivedAgentConversations();
    expect(lastCall().url).toMatch(/\/sws\/agent-chat\/conversations\/archived$/);
  });

  it('reads messages of a conversation, encoding the id', async () => {
    respond(200, { messages: [{ id: 'm1', role: 'USER', content: 'hi' }] });
    const messages = await getAgentConversationMessages('a b/c');
    expect(lastCall().url).toMatch(/\/sws\/agent-chat\/conversations\/a%20b%2Fc\/messages$/);
    expect(messages[0].text).toBe('hi');
  });

  it('creates a conversation and appends a batch with POST bodies', async () => {
    respond(200, { success: true, conversation_id: 'X1', created: true });
    await createAgentConversation({ title: 'T', external_id: 'X1' });
    expect(lastCall().url).toMatch(/\/sws\/agent-chat\/conversations$/);
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().body).toEqual({ title: 'T', external_id: 'X1' });

    const messages = [{ role: 'user', text: 'a', external_id: 'm1' }];
    respond(200, { success: true, saved: 1, skipped: 0 });
    await appendAgentMessages({ conversation_id: 'X1', messages });
    expect(lastCall().url).toMatch(/\/sws\/agent-chat\/conversations\/X1\/messages$/);
    expect(lastCall().body).toEqual({ messages });
  });

  it.each([
    ['rename', () => renameAgentConversation('C1', 'New'), 'rename', { title: 'New' }],
    ['archive', () => archiveAgentConversation('C1'), 'archive', {}],
    ['restore', () => restoreAgentConversation('C1'), 'restore', {}],
    ['permanent delete', () => permanentDeleteAgentConversation('C1'), 'permanent-delete', {}],
  ])('%s POSTs to the matching action route', async (_name, call, route, body) => {
    respond(200, { success: true });
    await call();
    expect(lastCall().url).toMatch(new RegExp(`/sws/agent-chat/conversations/C1/${route}$`));
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().body).toEqual(body);
  });

  it.each([401, 404])('a %i is an error with its status and never logs the user out', async (status) => {
    respond(status);
    await expect(getAgentConversations()).rejects.toMatchObject({ status });
    await expect(createAgentConversation({ external_id: 'X' })).rejects.toMatchObject({ status });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('surfaces the backend error message', async () => {
    respond(400, { error: 'Invalid role' });
    await expect(appendAgentMessages({ conversation_id: 'X', messages: [] })).rejects.toThrow('Invalid role');
  });
});
