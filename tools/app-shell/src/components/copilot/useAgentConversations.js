import { useCallback, useState } from 'react';
import {
  getAgentConversations,
  getArchivedAgentConversations,
  renameAgentConversation,
  archiveAgentConversation,
  restoreAgentConversation,
  permanentDeleteAgentConversation,
} from './agentChatApi.js';

const byId = id => c => c.conversation_id === id;

/**
 * Conversation list state for the agent chat: same backend and same list/action shape as
 * `useCopilotChat`, but with no assistant — the agent's conversations have no app, so the
 * list endpoints are called without `app_id`.
 *
 * Backed by `/sws/agent-chat/*` (agentChatApi.js), which accepts the cookie session.
 *
 * @param {object} options
 * @param {string} options.activeId — the id of the open conversation
 * @param {() => void} options.onActiveRemoved — the open conversation was archived or removed
 */
export function useAgentConversations({ activeId, onActiveRemoved }) {
  const [conversations, setConversations] = useState([]);
  const [archivedConversations, setArchived] = useState([]);
  const [isLoadingConversations, setLoadingConversations] = useState(false);
  const [isLoadingArchivedConversations, setLoadingArchived] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const clearHistoryError = useCallback(() => setHistoryError(''), []);
  // A failed ACTION (rename, archive, ...) is reported; a failed LIST load is not: the
  // sidebar just stays empty. History is secondary and must never put an error banner in
  // the chat (for example when the backend does not accept this session at all).
  const fail = useCallback(error => setHistoryError(error?.message || ''), []);
  const failQuietly = useCallback(error => {
    // eslint-disable-next-line no-console -- not user-facing, but must not be silent
    console.warn('[copilot:history] list unavailable', error?.message);
  }, []);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      setConversations(await getAgentConversations());
    } catch (error) {
      failQuietly(error);
    } finally {
      setLoadingConversations(false);
    }
  }, [failQuietly]);

  const loadArchivedConversations = useCallback(async () => {
    setLoadingArchived(true);
    try {
      setArchived(await getArchivedAgentConversations());
    } catch (error) {
      failQuietly(error);
    } finally {
      setLoadingArchived(false);
    }
  }, [failQuietly]);

  /** Show a conversation in the list right away (before the next reload confirms it). */
  const upsertConversation = useCallback(conv => {
    setConversations(prev => (prev.some(byId(conv.conversation_id)) ? prev : [conv, ...prev]));
  }, []);

  const renameConversation = useCallback(async (id, title) => {
    const value = title?.trim();
    if (!id || !value) return;
    try {
      await renameAgentConversation(id, value);
      const rename = list => list.map(c => (byId(id)(c) ? { ...c, title: value } : c));
      setConversations(rename);
      setArchived(rename);
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const deleteConversation = useCallback(async id => {
    if (!id) return;
    try {
      await archiveAgentConversation(id);
      const moved = conversations.find(byId(id));
      setConversations(prev => prev.filter(c => !byId(id)(c)));
      if (moved) setArchived(prev => [...prev, moved]);
      if (activeId === id) onActiveRemoved?.();
    } catch (error) {
      fail(error);
    }
  }, [activeId, conversations, fail, onActiveRemoved]);

  const restoreConversation = useCallback(async id => {
    if (!id) return;
    try {
      await restoreAgentConversation(id);
      const restored = archivedConversations.find(byId(id));
      setArchived(prev => prev.filter(c => !byId(id)(c)));
      if (restored) setConversations(prev => [...prev, restored]);
    } catch (error) {
      fail(error);
    }
  }, [archivedConversations, fail]);

  const permanentDelete = useCallback(async id => {
    if (!id) return;
    try {
      await permanentDeleteAgentConversation(id);
      setArchived(prev => prev.filter(c => !byId(id)(c)));
      setConversations(prev => prev.filter(c => !byId(id)(c)));
      if (activeId === id) onActiveRemoved?.();
    } catch (error) {
      fail(error);
    }
  }, [activeId, fail, onActiveRemoved]);

  return {
    conversations,
    archivedConversations,
    isLoadingConversations,
    isLoadingArchivedConversations,
    historyError,
    clearHistoryError,
    loadConversations,
    loadArchivedConversations,
    upsertConversation,
    renameConversation,
    deleteConversation,
    restoreConversation,
    permanentDelete,
  };
}
