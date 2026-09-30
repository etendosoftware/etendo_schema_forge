import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../agentChatApi.js', () => ({
  getAgentConversations: vi.fn(),
  getArchivedAgentConversations: vi.fn(),
  renameAgentConversation: vi.fn().mockResolvedValue({}),
  archiveAgentConversation: vi.fn().mockResolvedValue({}),
  restoreAgentConversation: vi.fn().mockResolvedValue({}),
  permanentDeleteAgentConversation: vi.fn().mockResolvedValue({}),
}));

import * as api from '../agentChatApi.js';
import { useAgentConversations } from '../useAgentConversations.js';

const conv = (id, title = id) => ({ conversation_id: id, title });

function setup(activeId = 'C1') {
  const onActiveRemoved = vi.fn();
  const hook = renderHook(() => useAgentConversations({ activeId, onActiveRemoved }));
  return { ...hook, onActiveRemoved };
}

describe('useAgentConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAgentConversations.mockResolvedValue([conv('C1'), conv('C2')]);
    api.getArchivedAgentConversations.mockResolvedValue([conv('C9')]);
  });

  it('loads both lists without an app id', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.loadConversations();
      await result.current.loadArchivedConversations();
    });
    expect(api.getAgentConversations).toHaveBeenCalledWith();
    expect(api.getArchivedAgentConversations).toHaveBeenCalledWith();
    expect(result.current.conversations.map(c => c.conversation_id)).toEqual(['C1', 'C2']);
    expect(result.current.archivedConversations.map(c => c.conversation_id)).toEqual(['C9']);
  });

  it('archiving the open conversation moves it to archived and asks for a fresh chat', async () => {
    const { result, onActiveRemoved } = setup('C1');
    await act(async () => { await result.current.loadConversations(); });
    await act(async () => { await result.current.deleteConversation('C1'); });
    expect(api.archiveAgentConversation).toHaveBeenCalledWith('C1');
    expect(result.current.conversations.map(c => c.conversation_id)).toEqual(['C2']);
    expect(result.current.archivedConversations.map(c => c.conversation_id)).toEqual(['C1']);
    expect(onActiveRemoved).toHaveBeenCalledTimes(1);
  });

  it('archiving another conversation does not touch the open one', async () => {
    const { result, onActiveRemoved } = setup('C1');
    await act(async () => { await result.current.loadConversations(); });
    await act(async () => { await result.current.deleteConversation('C2'); });
    expect(onActiveRemoved).not.toHaveBeenCalled();
  });

  it('restores an archived conversation into the active list', async () => {
    const { result } = setup();
    await act(async () => { await result.current.loadArchivedConversations(); });
    await act(async () => { await result.current.restoreConversation('C9'); });
    expect(api.restoreAgentConversation).toHaveBeenCalledWith('C9');
    expect(result.current.archivedConversations).toEqual([]);
    expect(result.current.conversations.map(c => c.conversation_id)).toEqual(['C9']);
  });

  it('renames in place and ignores blank titles', async () => {
    const { result } = setup();
    await act(async () => { await result.current.loadConversations(); });
    await act(async () => { await result.current.renameConversation('C2', '  New name '); });
    await act(async () => { await result.current.renameConversation('C2', '   '); });
    expect(api.renameAgentConversation).toHaveBeenCalledTimes(1);
    expect(api.renameAgentConversation).toHaveBeenCalledWith('C2', 'New name');
    expect(result.current.conversations.find(c => c.conversation_id === 'C2').title).toBe('New name');
  });

  it('permanent delete removes the row and resets the chat when it was open', async () => {
    const { result, onActiveRemoved } = setup('C9');
    await act(async () => { await result.current.loadArchivedConversations(); });
    await act(async () => { await result.current.permanentDelete('C9'); });
    expect(result.current.archivedConversations).toEqual([]);
    expect(onActiveRemoved).toHaveBeenCalledTimes(1);
  });

  it('keeps the list and reports the error when the backend fails', async () => {
    const { result } = setup();
    await act(async () => { await result.current.loadConversations(); });
    api.archiveAgentConversation.mockRejectedValueOnce(new Error('nope'));
    await act(async () => { await result.current.deleteConversation('C2'); });
    await waitFor(() => expect(result.current.historyError).toBe('nope'));
    expect(result.current.conversations).toHaveLength(2);
  });

  it('upsertConversation shows a new conversation once', async () => {
    const { result } = setup();
    act(() => { result.current.upsertConversation(conv('N1', 'Fresh')); });
    act(() => { result.current.upsertConversation(conv('N1', 'Fresh')); });
    expect(result.current.conversations).toEqual([conv('N1', 'Fresh')]);
  });
});
