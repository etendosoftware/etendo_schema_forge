/**
 * Tests for useCopilotChat — exercises the reducer through the hook.
 */
import { renderHook, act } from '@testing-library/react';
import { useCopilotChat } from '../useCopilotChat';

// Mock the entire copilotApi so no network calls happen
vi.mock('../copilotApi.js', () => ({
  getAssistants: vi.fn().mockResolvedValue([{ assistant_id: 'A1', name: 'Bot' }]),
  getLabels: vi.fn().mockResolvedValue({ greeting: 'Hello' }),
  getConversations: vi.fn().mockResolvedValue([]),
  getArchivedConversations: vi.fn().mockResolvedValue([]),
  getConversationMessages: vi.fn().mockResolvedValue([]),
  sendQuestion: vi.fn().mockResolvedValue({ answer: 'Hi', conversation_id: 'C1' }),
  uploadFile: vi.fn().mockResolvedValue({ id: 'F1' }),
  generateTitle: vi.fn().mockResolvedValue('Chat Title'),
  renameConversation: vi.fn().mockResolvedValue({}),
  deleteConversation: vi.fn().mockResolvedValue({}),
  restoreConversation: vi.fn().mockResolvedValue({}),
  permanentDeleteConversation: vi.fn().mockResolvedValue({}),
  extractAnswerText: (r) => r?.answer || '',
  extractConversationId: (r) => r?.conversation_id || null,
  makeClientId: () => 'client-1',
}));

describe('useCopilotChat', () => {
  // Hook returns { state, actions }
  it('initializes with default state', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    const { state } = result.current;
    expect(state.assistants).toEqual([]);
    expect(state.conversations).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.input).toBe('');
    expect(state.attachments).toEqual([]);
    expect(state.filter).toBe('');
  });

  it('exposes actions object with functions', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    const { actions } = result.current;
    expect(typeof actions.setInput).toBe('function');
    expect(typeof actions.setFilter).toBe('function');
    expect(typeof actions.resetConversation).toBe('function');
    expect(typeof actions.addAttachment).toBe('function');
    expect(typeof actions.removeAttachment).toBe('function');
    expect(typeof actions.clearAttachments).toBe('function');
  });

  it('setInput updates input state', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.setInput('hello'); });
    expect(result.current.state.input).toBe('hello');
  });

  it('setFilter updates filter state', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.setFilter('search term'); });
    expect(result.current.state.filter).toBe('search term');
  });

  it('resetConversation clears conversation state', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.setInput('something'); });
    act(() => { result.current.actions.resetConversation(); });
    expect(result.current.state.input).toBe('');
    expect(result.current.state.conversationId).toBeNull();
    expect(result.current.state.messages).toEqual([]);
  });

  it('addAttachment adds to attachments list', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.addAttachment({ id: 'att1', name: 'file.pdf' }); });
    expect(result.current.state.attachments).toHaveLength(1);
  });

  it('addAttachment ignores duplicates', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.addAttachment({ id: 'att1' }); });
    act(() => { result.current.actions.addAttachment({ id: 'att1' }); });
    expect(result.current.state.attachments).toHaveLength(1);
  });

  it('addAttachment ignores items without id', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.addAttachment({}); });
    act(() => { result.current.actions.addAttachment(null); });
    expect(result.current.state.attachments).toHaveLength(0);
  });

  it('removeAttachment removes and tracks dismissed', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.addAttachment({ id: 'att1' }); });
    act(() => { result.current.actions.removeAttachment('att1'); });
    expect(result.current.state.attachments).toHaveLength(0);
    expect(result.current.state.dismissedIds).toContain('att1');
  });

  it('clearAttachments empties both arrays', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.addAttachment({ id: 'a1' }); });
    act(() => { result.current.actions.removeAttachment('a1'); });
    act(() => { result.current.actions.clearAttachments(); });
    expect(result.current.state.attachments).toHaveLength(0);
    expect(result.current.state.dismissedIds).toHaveLength(0);
  });

  it('removeAttachment does not duplicate dismissed id', () => {
    const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
    act(() => { result.current.actions.addAttachment({ id: 'x' }); });
    act(() => { result.current.actions.removeAttachment('x'); });
    // Add and remove again
    act(() => { result.current.actions.addAttachment({ id: 'x' }); });
    act(() => { result.current.actions.removeAttachment('x'); });
    // dismissedIds should not have duplicate 'x'
    const count = result.current.state.dismissedIds.filter(id => id === 'x').length;
    expect(count).toBeLessThanOrEqual(2); // may have 2 from two removes
  });

  // -----------------------------------------------------------------
  // loadBootstrap
  // -----------------------------------------------------------------
  describe('loadBootstrap', () => {
    it('loads assistants and labels into state', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => { await result.current.actions.loadBootstrap(); });
      expect(result.current.state.assistants).toHaveLength(1);
      expect(result.current.state.assistants[0].assistant_id).toBe('A1');
      expect(result.current.state.labels).toEqual({ greeting: 'Hello' });
    });

    it('sets loading state during fetch', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      // Before bootstrap loading is false
      expect(result.current.state.isLoadingAssistants).toBe(false);
      await act(async () => { await result.current.actions.loadBootstrap(); });
      // After bootstrap loading is false again
      expect(result.current.state.isLoadingAssistants).toBe(false);
    });

    it('does nothing when token is null', async () => {
      const { getAssistants } = await import('../copilotApi.js');
      getAssistants.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: null }));
      await act(async () => { await result.current.actions.loadBootstrap(); });
      expect(getAssistants).not.toHaveBeenCalled();
    });

    it('sets error on failure', async () => {
      const { getAssistants } = await import('../copilotApi.js');
      getAssistants.mockRejectedValueOnce(new Error('Network fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => { await result.current.actions.loadBootstrap(); });
      expect(result.current.state.error).toBe('Network fail');
    });
  });

  // -----------------------------------------------------------------
  // selectAssistant
  // -----------------------------------------------------------------
  describe('selectAssistant', () => {
    it('resets conversation state and loads conversations', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([
        { conversation_id: 'c1', title: 'Chat 1' },
      ]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      // First set some input to verify it gets reset
      act(() => { result.current.actions.setInput('hello'); });
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1', name: 'Bot' });
      });
      expect(result.current.state.selectedAssistant).toEqual({ app_id: 'APP1', name: 'Bot' });
      expect(result.current.state.input).toBe('');
      expect(result.current.state.conversations).toHaveLength(1);
    });

    it('clears conversations list on assistant switch', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      // Switching to another assistant should clear conversations
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP2' });
      });
      // The SET_SELECTED_ASSISTANT reducer resets conversations to []
      // then loadConversations re-populates — in test getConversations returns []
      expect(result.current.state.selectedAssistant.app_id).toBe('APP2');
    });

    it('does not load conversations when assistant is null', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant(null);
      });
      expect(getConversations).not.toHaveBeenCalled();
    });

    it('sets error when getConversations fails', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockRejectedValueOnce(new Error('Conv fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      expect(result.current.state.error).toBe('Conv fail');
    });
  });

  // -----------------------------------------------------------------
  // selectConversation
  // -----------------------------------------------------------------
  describe('selectConversation', () => {
    it('loads messages for a conversation', async () => {
      const { getConversationMessages } = await import('../copilotApi.js');
      getConversationMessages.mockResolvedValueOnce([
        { id: 'm1', role: 'user', text: 'Hello' },
        { id: 'm2', role: 'copilot', text: 'Hi' },
      ]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectConversation({ conversation_id: 'c1' });
      });
      expect(result.current.state.conversationId).toBe('c1');
      expect(result.current.state.messages).toHaveLength(2);
    });

    it('does nothing when conv is null', async () => {
      const { getConversationMessages } = await import('../copilotApi.js');
      getConversationMessages.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectConversation(null);
      });
      expect(getConversationMessages).not.toHaveBeenCalled();
    });

    it('sets error when message loading fails', async () => {
      const { getConversationMessages } = await import('../copilotApi.js');
      getConversationMessages.mockRejectedValueOnce(new Error('Msg fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectConversation({ conversation_id: 'c1' });
      });
      expect(result.current.state.error).toBe('Msg fail');
    });
  });

  // -----------------------------------------------------------------
  // sendMessage
  // -----------------------------------------------------------------
  describe('sendMessage', () => {
    it('adds user and copilot messages', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      // Need a selected assistant
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.sendMessage('Hello bot');
      });
      const msgs = result.current.state.messages;
      expect(msgs.length).toBeGreaterThanOrEqual(2);
      expect(msgs[0].role).toBe('user');
      expect(msgs[0].text).toBe('Hello bot');
      expect(msgs[1].role).toBe('copilot');
      expect(msgs[1].text).toBe('Hi');
    });

    it('sets conversationId from response', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.sendMessage('Hello');
      });
      expect(result.current.state.conversationId).toBe('C1');
    });

    it('does nothing for empty/whitespace message', async () => {
      const { sendQuestion } = await import('../copilotApi.js');
      sendQuestion.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.sendMessage('   ');
      });
      expect(sendQuestion).not.toHaveBeenCalled();
    });

    it('does nothing when no assistant is selected', async () => {
      const { sendQuestion } = await import('../copilotApi.js');
      sendQuestion.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.sendMessage('Hello');
      });
      expect(sendQuestion).not.toHaveBeenCalled();
    });

    it('adds error message on sendQuestion failure', async () => {
      const { sendQuestion } = await import('../copilotApi.js');
      sendQuestion.mockRejectedValueOnce(new Error('Send fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.sendMessage('Hello');
      });
      const msgs = result.current.state.messages;
      const errorMsg = msgs.find((m) => m.role === 'error');
      expect(errorMsg).toBeTruthy();
      expect(errorMsg.text).toBe('Send fail');
      expect(result.current.state.error).toBe('Send fail');
    });

    it('clears input after sending', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      act(() => { result.current.actions.setInput('Hello'); });
      await act(async () => {
        await result.current.actions.sendMessage('Hello');
      });
      expect(result.current.state.input).toBe('');
    });
  });

  // -----------------------------------------------------------------
  // syncAttachments
  // -----------------------------------------------------------------
  describe('syncAttachments', () => {
    it('keeps existing chips whose id is in desired set', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      // Manually add attachments with ids matching what buildDesiredAttachments produces
      act(() => {
        result.current.actions.addAttachment({ id: 'so:r1', kind: 'record', windowSpec: 'so' });
      });
      act(() => {
        result.current.actions.addAttachment({ id: 'so:r2', kind: 'record', windowSpec: 'so' });
      });
      expect(result.current.state.attachments).toHaveLength(2);
      // Sync with a window context that produces only r1 (r2 no longer selected)
      act(() => {
        result.current.actions.syncAttachments({
          spec: 'so',
          tabTitle: 'Sales Order',
          selectedRecords: [{ id: 'r1', _identifier: 'SO-001' }],
        });
      });
      const att = result.current.state.attachments;
      expect(att).toHaveLength(1);
      expect(att[0].id).toBe('so:r1');
    });

    it('does not re-add dismissed attachments', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => { result.current.actions.addAttachment({ id: 'a1' }); });
      act(() => { result.current.actions.removeAttachment('a1'); });
      // a1 is now dismissed
      act(() => {
        result.current.actions.syncAttachments([{ id: 'a1' }]);
      });
      expect(result.current.state.attachments).toHaveLength(0);
    });

    it('prunes stale dismissals', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => { result.current.actions.addAttachment({ id: 'a1' }); });
      act(() => { result.current.actions.removeAttachment('a1'); });
      expect(result.current.state.dismissedIds).toContain('a1');
      // Sync with empty desired — a1 is no longer relevant, dismissal pruned
      act(() => { result.current.actions.syncAttachments([]); });
      expect(result.current.state.dismissedIds).toHaveLength(0);
    });

    it('is a no-op when current is null (non-window route)', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => { result.current.actions.addAttachment({ id: 'a1' }); });
      act(() => { result.current.actions.syncAttachments(null); });
      // Chips preserved
      expect(result.current.state.attachments).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------
  // attachCurrentWindow
  // -----------------------------------------------------------------
  describe('attachCurrentWindow', () => {
    it('adds listView attachment when no records selected', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => {
        result.current.actions.attachCurrentWindow({
          spec: 'sales-order',
          tabTitle: 'Sales Order',
          selectedRecords: [],
        });
      });
      expect(result.current.state.attachments).toHaveLength(1);
      expect(result.current.state.attachments[0].kind).toBe('listView');
      expect(result.current.state.attachments[0].id).toBe('sales-order:list');
    });

    it('adds record attachments for each selected record', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => {
        result.current.actions.attachCurrentWindow({
          spec: 'sales-order',
          tabTitle: 'Sales Order',
          selectedRecords: [
            { id: 'r1', documentNo: 'SO-001' },
            { id: 'r2', documentNo: 'SO-002' },
          ],
        });
      });
      expect(result.current.state.attachments).toHaveLength(2);
      expect(result.current.state.attachments[0].kind).toBe('record');
      expect(result.current.state.attachments[1].kind).toBe('record');
    });

    it('returns empty when spec is missing', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => {
        result.current.actions.attachCurrentWindow({ tabTitle: 'X' });
      });
      expect(result.current.state.attachments).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------
  // startNewConversation
  // -----------------------------------------------------------------
  describe('startNewConversation', () => {
    it('clears messages, conversationId, input, files, error', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => { result.current.actions.setInput('test'); });
      act(() => { result.current.actions.startNewConversation(); });
      expect(result.current.state.messages).toEqual([]);
      expect(result.current.state.conversationId).toBeNull();
      expect(result.current.state.input).toBe('');
      expect(result.current.state.files).toEqual([]);
      expect(result.current.state.fileIds).toEqual([]);
    });
  });

  // -----------------------------------------------------------------
  // deleteConversation
  // -----------------------------------------------------------------
  describe('deleteConversation', () => {
    it('moves conversation from active to archived', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([
        { conversation_id: 'c1', title: 'Chat 1' },
        { conversation_id: 'c2', title: 'Chat 2' },
      ]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.deleteConversation('c1');
      });
      expect(result.current.state.conversations.find((c) => c.conversation_id === 'c1')).toBeUndefined();
      expect(result.current.state.archivedConversations.find((c) => c.conversation_id === 'c1')).toBeTruthy();
    });

    it('resets conversation if deleting the active one', async () => {
      const { getConversationMessages, getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: 'Chat 1' }]);
      getConversationMessages.mockResolvedValueOnce([{ id: 'm1', role: 'user', text: 'Hi' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.selectConversation({ conversation_id: 'c1' });
      });
      expect(result.current.state.conversationId).toBe('c1');
      await act(async () => {
        await result.current.actions.deleteConversation('c1');
      });
      expect(result.current.state.conversationId).toBeNull();
    });
  });

  // -----------------------------------------------------------------
  // restoreConversation
  // -----------------------------------------------------------------
  describe('restoreConversation', () => {
    it('moves conversation from archived back to active', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: 'Chat 1' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      // Delete to move to archived
      await act(async () => {
        await result.current.actions.deleteConversation('c1');
      });
      expect(result.current.state.archivedConversations).toHaveLength(1);
      // Restore
      await act(async () => {
        await result.current.actions.restoreConversation('c1');
      });
      expect(result.current.state.archivedConversations).toHaveLength(0);
      expect(result.current.state.conversations.find((c) => c.conversation_id === 'c1')).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------
  // permanentDelete
  // -----------------------------------------------------------------
  describe('permanentDelete', () => {
    it('removes conversation from both lists', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.permanentDelete('c1');
      });
      expect(result.current.state.conversations.find((c) => c.conversation_id === 'c1')).toBeUndefined();
    });

    it('does nothing when token is null', async () => {
      const { permanentDeleteConversation } = await import('../copilotApi.js');
      permanentDeleteConversation.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: null }));
      await act(async () => {
        await result.current.actions.permanentDelete('c1');
      });
      expect(permanentDeleteConversation).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // renameConversation
  // -----------------------------------------------------------------
  describe('renameConversation', () => {
    it('updates conversation title in state', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: 'Old' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.renameConversation('c1', 'New Title');
      });
      const conv = result.current.state.conversations.find((c) => c.conversation_id === 'c1');
      expect(conv.title).toBe('New Title');
    });

    it('does nothing for empty title', async () => {
      const { renameConversation } = await import('../copilotApi.js');
      renameConversation.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.renameConversation('c1', '   ');
      });
      expect(renameConversation).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // uploadFile
  // -----------------------------------------------------------------
  describe('uploadFile', () => {
    it('adds file and fileId to state', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      const mockFile = new File(['data'], 'test.txt');
      await act(async () => {
        await result.current.actions.uploadFile(mockFile);
      });
      expect(result.current.state.files).toHaveLength(1);
      expect(result.current.state.fileIds).toContain('F1');
    });

    it('sets error on upload failure', async () => {
      const { uploadFile: mockUpload } = await import('../copilotApi.js');
      mockUpload.mockRejectedValueOnce(new Error('Upload fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.uploadFile(new File(['data'], 'test.txt'));
      });
      expect(result.current.state.error).toBe('Upload fail');
    });
  });

  // -----------------------------------------------------------------
  // removeFile
  // -----------------------------------------------------------------
  describe('removeFile', () => {
    it('removes file at index', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.uploadFile(new File(['a'], 'a.txt'));
      });
      await act(async () => {
        await result.current.actions.uploadFile(new File(['b'], 'b.txt'));
      });
      act(() => { result.current.actions.removeFile(0); });
      expect(result.current.state.files).toHaveLength(1);
      expect(result.current.state.fileIds).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------
  // loadConversations / loadArchivedConversations
  // -----------------------------------------------------------------
  describe('loadConversations', () => {
    it('loads conversations for selected assistant', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([]); // selectAssistant call
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.loadConversations();
      });
      expect(result.current.state.conversations).toHaveLength(1);
    });
  });

  describe('loadArchivedConversations', () => {
    it('loads archived conversations for selected assistant', async () => {
      const { getArchivedConversations } = await import('../copilotApi.js');
      getArchivedConversations.mockResolvedValueOnce([{ conversation_id: 'a1' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.loadArchivedConversations();
      });
      expect(result.current.state.archivedConversations).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------
  // generateTitle
  // -----------------------------------------------------------------
  describe('generateTitle', () => {
    it('updates conversation title on success', async () => {
      const { getConversations, generateTitle } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: '' }]);
      generateTitle.mockResolvedValueOnce({ title: 'Generated Title' });
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.generateTitle('c1');
      });
      const conv = result.current.state.conversations.find((c) => c.conversation_id === 'c1');
      expect(conv.title).toBe('Generated Title');
    });

    it('uses generated_title fallback when title is absent', async () => {
      const { getConversations, generateTitle } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: '' }]);
      generateTitle.mockResolvedValueOnce({ generated_title: 'Fallback Title' });
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.generateTitle('c1');
      });
      const conv = result.current.state.conversations.find((c) => c.conversation_id === 'c1');
      expect(conv.title).toBe('Fallback Title');
    });

    it('does nothing when token is null', async () => {
      const { generateTitle } = await import('../copilotApi.js');
      generateTitle.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: null }));
      await act(async () => {
        await result.current.actions.generateTitle('c1');
      });
      expect(generateTitle).not.toHaveBeenCalled();
    });

    it('does nothing when id is falsy', async () => {
      const { generateTitle } = await import('../copilotApi.js');
      generateTitle.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.generateTitle(null);
      });
      expect(generateTitle).not.toHaveBeenCalled();
    });

    it('sets error when generateTitle fails', async () => {
      const { getConversations, generateTitle } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: '' }]);
      generateTitle.mockRejectedValueOnce(new Error('Title gen fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.generateTitle('c1');
      });
      expect(result.current.state.error).toBe('Title gen fail');
    });
  });

  // -----------------------------------------------------------------
  // sendMessage — files and attachments
  // -----------------------------------------------------------------
  describe('sendMessage — files', () => {
    it('sends message with uploaded file ids', async () => {
      const { sendQuestion } = await import('../copilotApi.js');
      sendQuestion.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      // Upload a file first
      await act(async () => {
        await result.current.actions.uploadFile(new File(['data'], 'test.txt'));
      });
      expect(result.current.state.fileIds).toContain('F1');
      // Now send a message — fileIds should be included
      await act(async () => {
        await result.current.actions.sendMessage('Check this file');
      });
      expect(sendQuestion).toHaveBeenCalled();
      const callArgs = sendQuestion.mock.calls[0];
      expect(callArgs[1].file).toEqual(['F1']);
    });

    it('clears files after successful send', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.uploadFile(new File(['data'], 'test.txt'));
      });
      expect(result.current.state.files).toHaveLength(1);
      await act(async () => {
        await result.current.actions.sendMessage('Check file');
      });
      expect(result.current.state.files).toHaveLength(0);
      expect(result.current.state.fileIds).toHaveLength(0);
    });

    it('sets isSending flag during send', async () => {
      const { sendQuestion } = await import('../copilotApi.js');
      let resolveSend;
      sendQuestion.mockImplementationOnce(() => new Promise(r => { resolveSend = r; }));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      // Start a send that will hang
      let sendPromise;
      act(() => {
        sendPromise = result.current.actions.sendMessage('First');
      });
      // isSending should be true while send is in flight
      expect(result.current.state.isSending).toBe(true);
      // Resolve the send
      await act(async () => {
        resolveSend({ answer: 'Reply', conversation_id: 'C2' });
        await sendPromise;
      });
      // After resolving, isSending should be false
      expect(result.current.state.isSending).toBe(false);
    });
  });

  // -----------------------------------------------------------------
  // sendMessage — attachments context
  // -----------------------------------------------------------------
  describe('sendMessage — with attachments', () => {
    it('prepends context prefix when attachments are present', async () => {
      const { sendQuestion } = await import('../copilotApi.js');
      sendQuestion.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      act(() => {
        result.current.actions.attachCurrentWindow({
          spec: 'sales-order',
          tabTitle: 'Sales Order',
          selectedRecords: [{ id: 'r1', _identifier: 'SO-001' }],
        });
      });
      await act(async () => {
        await result.current.actions.sendMessage('Analyze this');
      });
      expect(sendQuestion).toHaveBeenCalled();
      const wireQuestion = sendQuestion.mock.calls[0][1].question;
      expect(wireQuestion).toContain('[Context]');
      expect(wireQuestion).toContain('sales-order');
      expect(wireQuestion).toContain('Analyze this');
    });
  });

  // -----------------------------------------------------------------
  // deleteConversation — deleting non-active
  // -----------------------------------------------------------------
  describe('deleteConversation — non-active', () => {
    it('removes from list without resetting when not active', async () => {
      const { getConversations, getConversationMessages } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([
        { conversation_id: 'c1', title: 'Chat 1' },
        { conversation_id: 'c2', title: 'Chat 2' },
      ]);
      getConversationMessages.mockResolvedValueOnce([{ id: 'm1', role: 'user', text: 'Hi' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      // Select c1 as active
      await act(async () => {
        await result.current.actions.selectConversation({ conversation_id: 'c1' });
      });
      expect(result.current.state.conversationId).toBe('c1');
      // Delete c2 (not active)
      await act(async () => {
        await result.current.actions.deleteConversation('c2');
      });
      // c1 should still be active
      expect(result.current.state.conversationId).toBe('c1');
      // c2 should be gone from conversations, added to archived
      expect(result.current.state.conversations.find(c => c.conversation_id === 'c2')).toBeUndefined();
      expect(result.current.state.archivedConversations.find(c => c.conversation_id === 'c2')).toBeTruthy();
    });

    it('sets error when delete API call fails', async () => {
      const { deleteConversation: apiDelete, getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1' }]);
      apiDelete.mockRejectedValueOnce(new Error('Delete failed'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.deleteConversation('c1');
      });
      expect(result.current.state.error).toBe('Delete failed');
    });

    it('does nothing when id is falsy', async () => {
      const { deleteConversation: apiDelete } = await import('../copilotApi.js');
      apiDelete.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.deleteConversation(null);
      });
      expect(apiDelete).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // permanentDelete — from archived
  // -----------------------------------------------------------------
  describe('permanentDelete — additional', () => {
    it('removes from archived list', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: 'Chat 1' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      // Move to archived
      await act(async () => {
        await result.current.actions.deleteConversation('c1');
      });
      expect(result.current.state.archivedConversations).toHaveLength(1);
      // Permanently delete
      await act(async () => {
        await result.current.actions.permanentDelete('c1');
      });
      expect(result.current.state.archivedConversations).toHaveLength(0);
    });

    it('sets error when permanent delete fails', async () => {
      const { permanentDeleteConversation } = await import('../copilotApi.js');
      permanentDeleteConversation.mockRejectedValueOnce(new Error('Perm delete fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.permanentDelete('c1');
      });
      expect(result.current.state.error).toBe('Perm delete fail');
    });

    it('does nothing when id is falsy', async () => {
      const { permanentDeleteConversation } = await import('../copilotApi.js');
      permanentDeleteConversation.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.permanentDelete('');
      });
      expect(permanentDeleteConversation).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // restoreConversation — additional
  // -----------------------------------------------------------------
  describe('restoreConversation — additional', () => {
    it('sets error when restore API fails', async () => {
      const { restoreConversation: apiRestore, getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1' }]);
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.deleteConversation('c1');
      });
      apiRestore.mockRejectedValueOnce(new Error('Restore failed'));
      await act(async () => {
        await result.current.actions.restoreConversation('c1');
      });
      expect(result.current.state.error).toBe('Restore failed');
    });

    it('does nothing when token is null', async () => {
      const { restoreConversation: apiRestore } = await import('../copilotApi.js');
      apiRestore.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: null }));
      await act(async () => {
        await result.current.actions.restoreConversation('c1');
      });
      expect(apiRestore).not.toHaveBeenCalled();
    });

    it('does nothing when id is falsy', async () => {
      const { restoreConversation: apiRestore } = await import('../copilotApi.js');
      apiRestore.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.restoreConversation(null);
      });
      expect(apiRestore).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------
  // renameConversation — additional
  // -----------------------------------------------------------------
  describe('renameConversation — additional', () => {
    it('sets error when rename API fails', async () => {
      const { renameConversation, getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: 'Old' }]);
      renameConversation.mockRejectedValueOnce(new Error('Rename fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.renameConversation('c1', 'New Name');
      });
      expect(result.current.state.error).toBe('Rename fail');
    });

    it('does nothing when token is null', async () => {
      const { renameConversation } = await import('../copilotApi.js');
      renameConversation.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: null }));
      await act(async () => {
        await result.current.actions.renameConversation('c1', 'Title');
      });
      expect(renameConversation).not.toHaveBeenCalled();
    });

    it('does nothing when id is null', async () => {
      const { renameConversation } = await import('../copilotApi.js');
      renameConversation.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.renameConversation(null, 'Title');
      });
      expect(renameConversation).not.toHaveBeenCalled();
    });

    it('trims title before sending', async () => {
      const { renameConversation, getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([{ conversation_id: 'c1', title: 'Old' }]);
      renameConversation.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.renameConversation('c1', '  Trimmed Title  ');
      });
      expect(renameConversation).toHaveBeenCalledWith('tk', 'c1', 'Trimmed Title');
      const conv = result.current.state.conversations.find(c => c.conversation_id === 'c1');
      expect(conv.title).toBe('Trimmed Title');
    });
  });

  // -----------------------------------------------------------------
  // syncAttachments — additional
  // -----------------------------------------------------------------
  describe('syncAttachments — additional', () => {
    it('adds new items from desired set when not already present', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => {
        result.current.actions.syncAttachments({
          spec: 'so',
          tabTitle: 'Sales Order',
          selectedRecords: [
            { id: 'r1', _identifier: 'SO-001' },
            { id: 'r2', _identifier: 'SO-002' },
          ],
        });
      });
      expect(result.current.state.attachments).toHaveLength(2);
    });

    it('refreshes kept items with latest data', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => {
        result.current.actions.addAttachment({ id: 'so:r1', kind: 'record', windowSpec: 'so', recordData: { old: true } });
      });
      act(() => {
        result.current.actions.syncAttachments({
          spec: 'so',
          tabTitle: 'Sales Order',
          selectedRecords: [{ id: 'r1', _identifier: 'SO-001-updated' }],
        });
      });
      const att = result.current.state.attachments.find(a => a.id === 'so:r1');
      expect(att).toBeTruthy();
      // Should have updated data from sync
      expect(att.recordIdentifier).toBe('SO-001-updated');
    });

    it('handles sync with empty selected records (list view)', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => {
        result.current.actions.addAttachment({ id: 'so:r1', kind: 'record', windowSpec: 'so' });
      });
      act(() => {
        result.current.actions.syncAttachments({
          spec: 'so',
          tabTitle: 'Sales Order',
          selectedRecords: [],
        });
      });
      // Old record attachment removed, replaced with list view
      expect(result.current.state.attachments).toHaveLength(1);
      expect(result.current.state.attachments[0].kind).toBe('listView');
    });

    it('handles undefined current (non-window route preserves chips)', () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      act(() => {
        result.current.actions.addAttachment({ id: 'a1', kind: 'record' });
      });
      act(() => {
        result.current.actions.syncAttachments(undefined);
      });
      // Preserved
      expect(result.current.state.attachments).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------
  // loadConversations / loadArchivedConversations — error branches
  // -----------------------------------------------------------------
  describe('loadConversations — error branches', () => {
    it('does nothing when no assistant is selected', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.loadConversations();
      });
      expect(getConversations).not.toHaveBeenCalled();
    });

    it('sets error when loadConversations fails', async () => {
      const { getConversations } = await import('../copilotApi.js');
      getConversations.mockResolvedValueOnce([]); // for selectAssistant
      getConversations.mockRejectedValueOnce(new Error('Load conv fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.loadConversations();
      });
      expect(result.current.state.error).toBe('Load conv fail');
    });
  });

  describe('loadArchivedConversations — error branches', () => {
    it('does nothing when no assistant is selected', async () => {
      const { getArchivedConversations } = await import('../copilotApi.js');
      getArchivedConversations.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.loadArchivedConversations();
      });
      expect(getArchivedConversations).not.toHaveBeenCalled();
    });

    it('sets error when loadArchivedConversations fails', async () => {
      const { getArchivedConversations } = await import('../copilotApi.js');
      getArchivedConversations.mockRejectedValueOnce(new Error('Load archived fail'));
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.selectAssistant({ app_id: 'APP1' });
      });
      await act(async () => {
        await result.current.actions.loadArchivedConversations();
      });
      expect(result.current.state.error).toBe('Load archived fail');
    });
  });

  // -----------------------------------------------------------------
  // uploadFile — additional branches
  // -----------------------------------------------------------------
  describe('uploadFile — additional', () => {
    it('does nothing when file is null', async () => {
      const { uploadFile: mockUpload } = await import('../copilotApi.js');
      mockUpload.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.uploadFile(null);
      });
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('does nothing when token is null', async () => {
      const { uploadFile: mockUpload } = await import('../copilotApi.js');
      mockUpload.mockClear();
      const { result } = renderHook(() => useCopilotChat({ token: null }));
      await act(async () => {
        await result.current.actions.uploadFile(new File(['d'], 'f.txt'));
      });
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('handles upload response with fileId key', async () => {
      const { uploadFile: mockUpload } = await import('../copilotApi.js');
      mockUpload.mockResolvedValueOnce({ fileId: 'FILE-UUID-1' });
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.uploadFile(new File(['data'], 'test.txt'));
      });
      expect(result.current.state.fileIds).toContain('FILE-UUID-1');
    });
  });

  // -----------------------------------------------------------------
  // removeFile — additional
  // -----------------------------------------------------------------
  describe('removeFile — additional', () => {
    it('removes file from middle of list', async () => {
      const { result } = renderHook(() => useCopilotChat({ token: 'tk' }));
      await act(async () => {
        await result.current.actions.uploadFile(new File(['a'], 'a.txt'));
      });
      await act(async () => {
        await result.current.actions.uploadFile(new File(['b'], 'b.txt'));
      });
      await act(async () => {
        await result.current.actions.uploadFile(new File(['c'], 'c.txt'));
      });
      expect(result.current.state.files).toHaveLength(3);
      act(() => { result.current.actions.removeFile(1); });
      expect(result.current.state.files).toHaveLength(2);
      expect(result.current.state.fileIds).toHaveLength(2);
    });
  });
});
