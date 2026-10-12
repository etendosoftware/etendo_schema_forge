/**
 * History wiring of the agent chat: lazy conversation creation, one batch append per finished
 * turn, no save on error/abort, hydration, and resilience to save failures.
 * `useChat` is replaced by a small controllable fake so turns can be scripted.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ai-sdk/react', async () => {
  const React = await import('react');
  const idle = () => ({
    messages: [], status: 'ready', error: undefined, sendMessage: vi.fn(), addToolOutput: vi.fn(),
    stop: vi.fn(), setMessages: vi.fn(), clearError: vi.fn(), regenerate: vi.fn(),
  });
  return {
    useChat: (options) => {
      if (options.id === 'etendo-go-page-help') return idle();
      const [messages, setMessages] = React.useState([]);
      const [status, setStatus] = React.useState('ready');
      const [error, setError] = React.useState(undefined);
      globalThis.__chat = { setMessages, setStatus, setError };
      return {
        messages, status, error, setMessages,
        stop: vi.fn(() => setStatus('ready')),
        clearError: () => setError(undefined),
        sendMessage: vi.fn(), addToolOutput: vi.fn(), regenerate: vi.fn(),
      };
    },
  };
});

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    DefaultChatTransport: class {
      constructor(options) { globalThis.__transportOptions = options; }
    },
  };
});

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/', search: '', hash: '' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/auth/api.js', () => ({ buildWriteHeaders: () => ({}) }));
vi.mock('@/i18n', () => ({ useMenuLabel: () => (key) => key }));

vi.mock('../agentChatApi.js', () => ({
  createAgentConversation: vi.fn().mockResolvedValue({ success: true }),
  appendAgentMessages: vi.fn().mockResolvedValue({ success: true }),
  getAgentConversationMessages: vi.fn().mockResolvedValue([]),
  getAgentConversations: vi.fn().mockResolvedValue([]),
  getArchivedAgentConversations: vi.fn().mockResolvedValue([]),
  renameAgentConversation: vi.fn(),
  archiveAgentConversation: vi.fn().mockResolvedValue({}),
  restoreAgentConversation: vi.fn(),
  permanentDeleteAgentConversation: vi.fn(),
}));

import * as api from '../agentChatApi.js';
import { useAiCopilotChat } from '../useAiCopilotChat.js';

const text = (t) => ({ type: 'text', text: t });
const user = (id, t) => ({ id, role: 'user', parts: [text(t)] });
const assistant = (id, t, extra = []) => ({ id, role: 'assistant', parts: [...extra, text(t)] });

function setup() {
  return renderHook(() => useAiCopilotChat({ onOpenCopilot: vi.fn(), menuGroups: [] }));
}

/** Script one turn: user message sent, assistant streamed, then the chat settles on `end`. */
async function runTurn(messages, end = 'ready') {
  await act(async () => { globalThis.__chat.setMessages(messages.slice(0, -1)); globalThis.__chat.setStatus('submitted'); });
  await act(async () => { globalThis.__chat.setMessages(messages); globalThis.__chat.setStatus('streaming'); });
  await act(async () => { globalThis.__chat.setStatus(end); });
  await act(async () => { await Promise.resolve(); });
}

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

describe('agent chat history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.createAgentConversation.mockResolvedValue({ success: true });
    api.appendAgentMessages.mockResolvedValue({ success: true });
    api.getAgentConversationMessages.mockResolvedValue([]);
    api.archiveAgentConversation.mockResolvedValue({});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('uses one UUID as external_id and as the BFF session header', async () => {
    const { result } = setup();
    const id = result.current.conversationId;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(globalThis.__transportOptions.headers()['x-opencode-session']).toBe(id);
    await runTurn([user('u1', 'hola'), assistant('a1', 'que tal')]);
    await flush();
    expect(api.createAgentConversation).toHaveBeenCalledWith({ title: 'hola', external_id: id });
  });

  it('creates the conversation once and appends each finished turn as one batch', async () => {
    const { result } = setup();
    const id = result.current.conversationId;
    const turn1 = [user('u1', 'hola'), assistant('a1', 'que tal')];
    await runTurn(turn1);
    await flush();
    expect(api.createAgentConversation).toHaveBeenCalledTimes(1);
    expect(api.appendAgentMessages).toHaveBeenCalledWith({
      conversation_id: id,
      messages: [
        { role: 'user', text: 'hola', external_id: 'u1' },
        { role: 'assistant', text: 'que tal', external_id: 'a1' },
      ],
    });
    await runTurn([...turn1, user('u2', 'otra'), assistant('a2', 'claro')]);
    await flush();
    expect(api.createAgentConversation).toHaveBeenCalledTimes(1);
    expect(api.appendAgentMessages).toHaveBeenCalledTimes(2);
    expect(api.appendAgentMessages.mock.calls[1][0].messages.map(m => m.external_id)).toEqual(['u2', 'a2']);
  });

  it('saves only text: tool parts never reach the backend', async () => {
    setup();
    const tool = { type: 'tool-etendo_list', state: 'output-available', input: { secret: 1 }, output: { rows: [1] } };
    await runTurn([user('u1', 'lista'), assistant('a1', 'hecho', [{ type: 'step-start' }, tool, { type: 'step-start' }])]);
    await flush();
    expect(JSON.stringify(api.appendAgentMessages.mock.calls)).not.toContain('secret');
    expect(api.appendAgentMessages.mock.calls[0][0].messages[1].text).toBe('hecho');
  });

  it('does not save while a tool round-trip is still in flight', async () => {
    setup();
    const pending = { type: 'tool-navigate_to', state: 'input-available', input: { path: '/x' } };
    await runTurn([user('u1', 'abre'), assistant('a1', 'voy', [pending])]);
    await flush();
    expect(api.createAgentConversation).not.toHaveBeenCalled();
    expect(api.appendAgentMessages).not.toHaveBeenCalled();
  });

  it('does not save a turn that ended in error, and saves the retry', async () => {
    setup();
    await runTurn([user('u1', 'hola'), assistant('a1', 'par')], 'error');
    await flush();
    expect(api.createAgentConversation).not.toHaveBeenCalled();
    await act(async () => { globalThis.__chat.setStatus('ready'); });
    await runTurn([user('u1', 'hola'), assistant('a2', 'respuesta completa')]);
    await flush();
    expect(api.appendAgentMessages.mock.calls[0][0].messages.map(m => m.external_id)).toEqual(['u1', 'a2']);
  });

  it('does not save the assistant text of a turn the user stopped', async () => {
    const { result } = setup();
    await act(async () => { globalThis.__chat.setMessages([user('u1', 'hola')]); globalThis.__chat.setStatus('submitted'); });
    await act(async () => { globalThis.__chat.setMessages([user('u1', 'hola'), assistant('a1', 'medio')]); globalThis.__chat.setStatus('streaming'); });
    await act(async () => { result.current.actions.stop(); });
    await flush();
    expect(api.appendAgentMessages).not.toHaveBeenCalled();
    await runTurn([user('u1', 'hola'), user('u2', 'de nuevo'), assistant('a2', 'listo')]);
    await flush();
    const saved = api.appendAgentMessages.mock.calls[0][0].messages.map(m => m.external_id);
    expect(saved).toEqual(['u1', 'u2', 'a2']);
  });

  it('a failing save never breaks the chat and is retried with the next turn without duplicates', async () => {
    const { result } = setup();
    api.appendAgentMessages.mockRejectedValueOnce(new Error('backend down'));
    await runTurn([user('u1', 'hola'), assistant('a1', 'que tal')]);
    await flush();
    expect(result.current.error).toBe('');
    expect(console.warn).toHaveBeenCalled();
    await runTurn([user('u1', 'hola'), assistant('a1', 'que tal'), user('u2', 'y?'), assistant('a2', 'si')]);
    await flush();
    expect(api.createAgentConversation).toHaveBeenCalledTimes(1);
    const last = api.appendAgentMessages.mock.calls.at(-1)[0].messages.map(m => m.external_id);
    expect(last).toEqual(['u1', 'a1', 'u2', 'a2']);
  });

  it('a failing create is also swallowed and retried on the next turn', async () => {
    const { result } = setup();
    api.createAgentConversation.mockRejectedValueOnce(new Error('nope'));
    await runTurn([user('u1', 'hola'), assistant('a1', 'ok')]);
    await flush();
    expect(result.current.error).toBe('');
    expect(api.appendAgentMessages).not.toHaveBeenCalled();
    await runTurn([user('u1', 'hola'), assistant('a1', 'ok'), user('u2', 'x'), assistant('a2', 'y')]);
    await flush();
    expect(api.createAgentConversation).toHaveBeenCalledTimes(2);
    expect(api.appendAgentMessages).toHaveBeenCalledTimes(1);
  });

  it('selecting a conversation reuses its id, hydrates the chat and does not re-save stored messages', async () => {
    const { result } = setup();
    api.getAgentConversationMessages.mockResolvedValue([
      { id: 'm1', role: 'USER', text: 'pregunta' },
      { id: 'm2', role: 'ASSISTANT', text: 'respuesta' },
    ]);
    await act(async () => { await result.current.actions.selectConversation({ conversation_id: 'OLD-1' }); });
    expect(result.current.conversationId).toBe('OLD-1');
    expect(api.getAgentConversationMessages).toHaveBeenCalledWith('OLD-1');
    expect(result.current.messages).toEqual([
      { id: 'm1', role: 'user', text: 'pregunta' },
      { id: 'm2', role: 'copilot', text: 'respuesta' },
    ]);
    expect(globalThis.__transportOptions.headers()['x-opencode-session']).toBe('OLD-1');
    const hydrated = [user('m1', 'pregunta'), assistant('m2', 'respuesta')];
    await runTurn([...hydrated, user('u3', 'mas'), assistant('a3', 'vale')]);
    await flush();
    expect(api.createAgentConversation).not.toHaveBeenCalled();
    expect(api.appendAgentMessages).toHaveBeenCalledWith({
      conversation_id: 'OLD-1',
      messages: [
        { role: 'user', text: 'mas', external_id: 'u3' },
        { role: 'assistant', text: 'vale', external_id: 'a3' },
      ],
    });
  });

  it('a slow history load that lost the race to another selection is ignored', async () => {
    const { result } = setup();
    let releaseFirst;
    api.getAgentConversationMessages
      .mockImplementationOnce(() => new Promise(resolve => { releaseFirst = () => resolve([{ id: 'x', role: 'USER', text: 'old' }]); }))
      .mockResolvedValueOnce([{ id: 'y', role: 'USER', text: 'new' }]);
    await act(async () => { result.current.actions.selectConversation({ conversation_id: 'A' }); });
    await act(async () => { await result.current.actions.selectConversation({ conversation_id: 'B' }); });
    await act(async () => { releaseFirst(); });
    expect(result.current.conversationId).toBe('B');
    expect(result.current.messages.map(m => m.text)).toEqual(['new']);
  });

  it('a failed history load shows the error and leaves the chat usable', async () => {
    const { result } = setup();
    api.getAgentConversationMessages.mockRejectedValueOnce(new Error('cannot load'));
    await act(async () => { await result.current.actions.selectConversation({ conversation_id: 'A' }); });
    expect(result.current.error).toBe('cannot load');
    expect(result.current.isLoadingMessages).toBe(false);
    act(() => { result.current.actions.dismissError(); });
    expect(result.current.error).toBe('');
  });

  it('a new conversation gets a fresh id, empty messages, and is created again on its first turn', async () => {
    const { result } = setup();
    const first = result.current.conversationId;
    await runTurn([user('u1', 'hola'), assistant('a1', 'ok')]);
    await flush();
    act(() => { result.current.actions.startNewConversation(); });
    expect(result.current.conversationId).not.toBe(first);
    expect(result.current.messages).toEqual([]);
    expect(globalThis.__transportOptions.headers()['x-opencode-session']).toBe(result.current.conversationId);
    await runTurn([user('u9', 'nuevo'), assistant('a9', 'si')]);
    await flush();
    expect(api.createAgentConversation).toHaveBeenCalledTimes(2);
    expect(api.createAgentConversation.mock.calls[1][0].external_id).toBe(result.current.conversationId);
  });

  it('archiving the open conversation starts a fresh chat', async () => {
    const { result } = setup();
    await act(async () => { await result.current.actions.selectConversation({ conversation_id: 'OPEN' }); });
    await act(async () => { await result.current.actions.loadConversations(); });
    await act(async () => { await result.current.actions.deleteConversation('OPEN'); });
    expect(result.current.conversationId).not.toBe('OPEN');
  });

  it('caps the title at 60 characters', async () => {
    setup();
    await runTurn([user('u1', 'p'.repeat(300)), assistant('a1', 'ok')]);
    await flush();
    expect(api.createAgentConversation.mock.calls[0][0].title.length).toBe(60);
  });

  it('a backend that refuses the session (401) is not retried every turn and never surfaces an error', async () => {
    const { result } = setup();
    const refused = Object.assign(new Error('Copilot request failed (401)'), { status: 401 });
    api.createAgentConversation.mockRejectedValue(refused);
    await runTurn([user('u1', 'hola'), assistant('a1', 'ok')]);
    await flush();
    await runTurn([user('u1', 'hola'), assistant('a1', 'ok'), user('u2', 'x'), assistant('a2', 'y')]);
    await flush();
    expect(api.createAgentConversation).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('');
  });

  it('a server without the history endpoints (404) is also given up on after the first attempt', async () => {
    setup();
    api.createAgentConversation.mockRejectedValue(Object.assign(new Error('Agent chat request failed (404)'), { status: 404 }));
    await runTurn([user('u1', 'hola'), assistant('a1', 'ok')]);
    await flush();
    await runTurn([user('u1', 'hola'), assistant('a1', 'ok'), user('u2', 'x'), assistant('a2', 'y')]);
    await flush();
    expect(api.createAgentConversation).toHaveBeenCalledTimes(1);
  });

  it('a history list that answers 401 leaves the sidebar empty without an error banner', async () => {
    const { result } = setup();
    const refused = Object.assign(new Error('Copilot request failed (401)'), { status: 401 });
    api.getAgentConversations.mockRejectedValue(refused);
    api.getArchivedAgentConversations.mockRejectedValue(refused);
    await act(async () => {
      await result.current.actions.loadConversations();
      await result.current.actions.loadArchivedConversations();
    });
    expect(result.current.conversations).toEqual([]);
    expect(result.current.archivedConversations).toEqual([]);
    expect(result.current.error).toBe('');
  });
});
