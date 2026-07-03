import { renderHook, act } from '@testing-library/react';

const mockApiFetch = vi.fn();
const mockTrack = vi.fn();

vi.mock('@/auth/useApiFetch', () => ({
  useApiFetch: () => mockApiFetch,
}));

vi.mock('@/i18n', () => ({
  getStoredLocale: () => 'es_ES',
}));

vi.mock('@/lib/observability.js', () => ({
  track: (...args) => mockTrack(...args),
}));

import { SupportChatProvider, useSupportChat } from '../SupportChatContext.jsx';

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

// The provider fires an initial silent GET /sws/support/conversations on mount.
// Render, flush that effect against the default empty-conversations response,
// then let each test queue its own mockResolvedValueOnce for the call under test.
async function renderSupportChat() {
  const view = renderHook(() => useSupportChat(), { wrapper: SupportChatProvider });
  await act(async () => {});
  return view;
}

describe('SupportChatContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApiFetch.mockReset();
    mockTrack.mockReset();
    mockApiFetch.mockResolvedValue(jsonResponse({ conversations: [] }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when used outside a SupportChatProvider', () => {
    expect(() => renderHook(() => useSupportChat())).toThrow(
      'useSupportChat must be used inside SupportChatProvider',
    );
  });

  it('starts closed, on the inicio tab, with no conversations', async () => {
    const { result } = await renderSupportChat();
    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.activeTab).toBe('inicio');
    expect(result.current.state.conversations).toEqual([]);
    expect(result.current.state.unreadCount).toBe(0);
  });

  it('open/close/setTab update the widget UI state', async () => {
    const { result } = await renderSupportChat();
    act(() => result.current.actions.open());
    expect(result.current.state.isOpen).toBe(true);
    act(() => result.current.actions.setTab('mensajes'));
    expect(result.current.state.activeTab).toBe('mensajes');
    act(() => result.current.actions.close());
    expect(result.current.state.isOpen).toBe(false);
  });

  it('loadConversations populates the conversation list on success', async () => {
    const { result } = await renderSupportChat();
    const conversations = [{ id: 'c1', subject: 'Hola', unread: false }];
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ conversations }));
    await act(async () => {
      await result.current.actions.loadConversations();
    });
    expect(result.current.state.conversations).toEqual(conversations);
    expect(result.current.state.isLoadingConversations).toBe(false);
  });

  it('loadConversations records an error when the request fails', async () => {
    const { result } = await renderSupportChat();
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}, false));
    await act(async () => {
      await result.current.actions.loadConversations();
    });
    expect(result.current.state.error).toBe('Failed to load conversations');
  });

  it('startConversation optimistically appends the user message, then merges the server reply', async () => {
    const { result } = await renderSupportChat();
    mockApiFetch.mockResolvedValueOnce(jsonResponse({
      conversation: { id: 'c9', subject: 'Ayuda' },
      messages: [{ id: 'm1', sender: 'user', text: 'Hola' }, { id: 'm2', sender: 'ai', text: 'Hola, ¿en qué te ayudo?' }],
    }));
    await act(async () => {
      await result.current.actions.startConversation('Hola', []);
    });
    expect(result.current.state.activeConversationId).toBe('c9');
    expect(result.current.state.messages).toHaveLength(2);
    expect(result.current.state.isSending).toBe(false);
    expect(result.current.state.conversations[0].id).toBe('c9');
  });

  it('sendMessage does nothing for an empty message with no attachments', async () => {
    const { result } = await renderSupportChat();
    mockApiFetch.mockClear();
    await act(async () => {
      await result.current.actions.sendMessage('c1', '   ', []);
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('sendMessage appends the AI reply returned by the server', async () => {
    const { result } = await renderSupportChat();
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ reply: { id: 'm3', sender: 'ai', text: 'Respuesta' } }));
    await act(async () => {
      await result.current.actions.sendMessage('c1', 'Pregunta', []);
    });
    const texts = result.current.state.messages.map((m) => m.text);
    expect(texts).toContain('Pregunta');
    expect(texts).toContain('Respuesta');
  });

  it('addPendingFile / removePendingFile manage the pending attachment list', async () => {
    const { result } = await renderSupportChat();
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    act(() => result.current.actions.addPendingFile(file));
    expect(result.current.state.pendingFiles).toHaveLength(1);
    act(() => result.current.actions.removePendingFile(0));
    expect(result.current.state.pendingFiles).toHaveLength(0);
  });

  it('submitRating marks the conversation as rated and tracks a CSAT event', async () => {
    const { result } = await renderSupportChat();
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ conversations: [{ id: 'c1', subject: 'X', status: 'closed' }] }));
    await act(async () => {
      await result.current.actions.loadConversations();
    });
    mockApiFetch.mockResolvedValueOnce(jsonResponse({}));
    await act(async () => {
      await result.current.actions.submitRating('c1', 5, 'great');
    });
    expect(result.current.state.conversations[0].rated).toBe(true);
    expect(mockTrack).toHaveBeenCalledWith(
      'support_csat_submitted',
      expect.objectContaining({ score: 5, hasComment: true }),
    );
  });

  it('dismissRating flags the conversation as csatDismissed without contacting the server', async () => {
    const { result } = await renderSupportChat();
    mockApiFetch.mockClear();
    act(() => result.current.actions.dismissRating('c1'));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  describe('closeConversation', () => {
    it('updates the conversation with the server response on success', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ conversations: [{ id: 'c1', subject: 'X', status: 'open' }] }));
      await act(async () => {
        await result.current.actions.loadConversations();
      });
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ conversation: { id: 'c1', status: 'closed' } }));
      await act(async () => {
        await result.current.actions.closeConversation('c1');
      });
      expect(mockApiFetch).toHaveBeenLastCalledWith('/sws/support/conversations/c1/close', { method: 'POST' });
      expect(result.current.state.conversations[0].status).toBe('closed');
    });

    it('records an error when the request fails', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockResolvedValueOnce(jsonResponse({}, false));
      await act(async () => {
        await result.current.actions.closeConversation('c1');
      });
      expect(result.current.state.error).toBe('Failed to close conversation');
    });
  });

  describe('reopenConversation', () => {
    it('updates the conversation and replaces messages when the server returns both', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ conversations: [{ id: 'c1', subject: 'X', status: 'closed' }] }));
      await act(async () => {
        await result.current.actions.loadConversations();
      });
      mockApiFetch.mockResolvedValueOnce(jsonResponse({
        conversation: { id: 'c1', status: 'open' },
        messages: [{ id: 'm1', sender: 'user', text: 'Hola de nuevo' }],
      }));
      await act(async () => {
        await result.current.actions.reopenConversation('c1');
      });
      expect(mockApiFetch).toHaveBeenLastCalledWith('/sws/support/conversations/c1/reopen', { method: 'POST' });
      expect(result.current.state.conversations[0].status).toBe('open');
      expect(result.current.state.messages).toHaveLength(1);
    });

    it('updates the conversation without touching messages when the server omits them', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ conversations: [{ id: 'c1', subject: 'X', status: 'closed' }] }));
      await act(async () => {
        await result.current.actions.loadConversations();
      });
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ conversation: { id: 'c1', status: 'open' } }));
      await act(async () => {
        await result.current.actions.reopenConversation('c1');
      });
      expect(result.current.state.conversations[0].status).toBe('open');
      expect(result.current.state.messages).toEqual([]);
    });

    it('records an error when the request fails', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockResolvedValueOnce(jsonResponse({}, false));
      await act(async () => {
        await result.current.actions.reopenConversation('c1');
      });
      expect(result.current.state.error).toBe('Failed to reopen conversation');
    });
  });

  describe('loadMessages', () => {
    it('loads the thread and marks the conversation as read', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ conversations: [{ id: 'c1', subject: 'X', unread: true }] }));
      await act(async () => {
        await result.current.actions.loadConversations();
      });
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1', sender: 'user', text: 'Hola' }] }));
      await act(async () => {
        await result.current.actions.loadMessages('c1');
      });
      expect(result.current.state.messages).toHaveLength(1);
      expect(result.current.state.conversations[0].unread).toBe(false);
    });

    it('sets the loading-messages flag while the request is in flight when not silent', async () => {
      const { result } = await renderSupportChat();
      let resolveFetch;
      mockApiFetch.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; }));
      let callPromise;
      act(() => {
        callPromise = result.current.actions.loadMessages('c1');
      });
      expect(result.current.state.isLoadingMessages).toBe(true);
      await act(async () => {
        resolveFetch(jsonResponse({ messages: [] }));
        await callPromise;
      });
      expect(result.current.state.isLoadingMessages).toBe(false);
    });

    it('never raises the loading-messages flag when called silently', async () => {
      const { result } = await renderSupportChat();
      let resolveFetch;
      mockApiFetch.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; }));
      let callPromise;
      act(() => {
        callPromise = result.current.actions.loadMessages('c1', true);
      });
      expect(result.current.state.isLoadingMessages).toBe(false);
      await act(async () => {
        resolveFetch(jsonResponse({ messages: [{ id: 'm1', sender: 'ai', text: 'Silencioso' }] }));
        await callPromise;
      });
      expect(result.current.state.isLoadingMessages).toBe(false);
      expect(result.current.state.messages).toHaveLength(1);
    });

    it('records an error when the request fails', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockResolvedValueOnce(jsonResponse({}, false));
      await act(async () => {
        await result.current.actions.loadMessages('c1');
      });
      expect(result.current.state.error).toBe('Failed to load messages');
    });
  });

  describe('polling', () => {
    it('the 5s message poll refreshes the thread when the server has new messages', async () => {
      const { result } = await renderSupportChat();
      act(() => {
        result.current.actions.open();
        result.current.actions.selectConversation('c1');
      });
      mockApiFetch.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'm1', sender: 'ai', text: 'Nuevo' }] }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(result.current.state.messages).toHaveLength(1);
      expect(result.current.state.messages[0].id).toBe('m1');
    });

    it('the 5s message poll does nothing while the widget is closed', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(result.current.state.messages).toEqual([]);
    });

    it('the 5s message poll does nothing when there is no active conversation', async () => {
      const { result } = await renderSupportChat();
      act(() => result.current.actions.open());
      mockApiFetch.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('the 5s message poll does nothing for an unsent draft conversation ("new")', async () => {
      const { result } = await renderSupportChat();
      act(() => {
        result.current.actions.open();
        result.current.actions.selectConversation('new');
      });
      mockApiFetch.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('the 5s message poll does nothing while a message is being sent', async () => {
      const { result } = await renderSupportChat();
      act(() => {
        result.current.actions.open();
        result.current.actions.selectConversation('c1');
      });
      mockApiFetch.mockClear();
      let resolveSend;
      mockApiFetch.mockImplementationOnce(() => new Promise((resolve) => { resolveSend = resolve; }));
      let sendPromise;
      await act(async () => {
        sendPromise = result.current.actions.sendMessage('c1', 'Hola', []);
        // Flush the microtasks between the SET_SENDING dispatch and the actual
        // apiFetch(...) call (sendMessage awaits serializeFiles() first), so
        // the in-flight call is registered before we clear the mock below.
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.state.isSending).toBe(true);
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      mockApiFetch.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(mockApiFetch).not.toHaveBeenCalled();
      await act(async () => {
        resolveSend(jsonResponse({}));
        await sendPromise;
      });
    });

    it('the 15s conversation-list poll refreshes conversations when unread/status/rated differ', async () => {
      const { result } = await renderSupportChat();
      mockApiFetch.mockResolvedValueOnce(jsonResponse({
        conversations: [{ id: 'c1', subject: 'X', unread: false, status: 'open', rated: false }],
      }));
      await act(async () => {
        await result.current.actions.loadConversations();
      });
      mockApiFetch.mockResolvedValueOnce(jsonResponse({
        conversations: [{ id: 'c1', subject: 'X', unread: true, status: 'open', rated: false }],
      }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });
      expect(result.current.state.conversations[0].unread).toBe(true);
    });
  });
});
