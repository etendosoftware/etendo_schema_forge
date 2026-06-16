import * as React from 'react';
import { useApiFetch } from '@/auth/useApiFetch';

const TEXT_MIME_TYPES = new Set([
  'text/plain', 'text/csv', 'text/html', 'text/xml', 'text/markdown',
  'application/json', 'application/xml', 'application/csv',
]);
const TEXT_EXTS = /\.(txt|csv|json|xml|md|log|tsv|yaml|yml|ini|conf|sql)$/i;

function isTextFile(file) {
  return TEXT_MIME_TYPES.has(file.type) || TEXT_EXTS.test(file.name) ||
    (file.type && file.type.startsWith('text/'));
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function serializeFile(file) {
  const mimeType = file.type || 'application/octet-stream';
  if (isTextFile(file)) {
    const text = await readAsText(file);
    return { name: file.name, mimeType, text };
  }
  // Images and PDFs go as base64 — GPT-4o handles both via vision/file API
  const data = await readAsBase64(file);
  return { name: file.name, mimeType, data };
}

async function serializeFiles(files) {
  if (!files || files.length === 0) return [];
  return Promise.all(files.map(serializeFile));
}

const SupportChatContext = React.createContext(null);

const INITIAL_STATE = {
  isOpen: false,
  activeTab: 'inicio',
  conversations: [],
  activeConversationId: null,
  messages: [],
  input: '',
  isSending: false,
  isLoadingConversations: false,
  isLoadingMessages: false,
  error: null,
  pendingFiles: [],
  pendingRatingConversationId: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'OPEN':
      return { ...state, isOpen: true };
    case 'CLOSE':
      return { ...state, isOpen: false };
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations, isLoadingConversations: false };
    case 'SET_LOADING_CONVERSATIONS':
      return { ...state, isLoadingConversations: true, error: null };
    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversationId: action.id, messages: [] };
    case 'SET_MESSAGES':
      return { ...state, messages: action.messages, isLoadingMessages: false };
    case 'SET_LOADING_MESSAGES':
      return { ...state, isLoadingMessages: true };
    case 'APPEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'SET_INPUT':
      return { ...state, input: action.input };
    case 'SET_SENDING':
      return { ...state, isSending: action.sending };
    case 'SET_ERROR':
      return { ...state, error: action.error, isSending: false, isLoadingConversations: false };
    case 'ADD_CONVERSATION':
      return {
        ...state,
        conversations: [action.conversation, ...state.conversations],
        activeConversationId: action.conversation.id,
        // keep messages — optimistic user message stays visible while AI reply loads
      };
    case 'UPDATE_CONVERSATION':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversation.id ? { ...c, ...action.conversation } : c
        ),
      };
    case 'DISMISS_RATING':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.id ? { ...c, csatDismissed: true } : c
        ),
      };
    case 'ADD_PENDING_FILE':
      return { ...state, pendingFiles: [...state.pendingFiles, action.file] };
    case 'REMOVE_PENDING_FILE':
      return {
        ...state,
        pendingFiles: state.pendingFiles.filter((_, i) => i !== action.index),
      };
    case 'CLEAR_PENDING_FILES':
      return { ...state, pendingFiles: [] };
    case 'SET_PENDING_RATING':
      return { ...state, pendingRatingConversationId: action.conversationId };
    case 'MARK_CONVERSATION_READ':
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.id ? { ...c, unread: false } : c
        ),
      };
    default:
      return state;
  }
}

export function SupportChatProvider({ children }) {
  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE);
  const apiFetch = useApiFetch();
  const stateRef = React.useRef(state);
  React.useEffect(() => { stateRef.current = state; }, [state]);
  const apiFetchRef = React.useRef(apiFetch);
  React.useEffect(() => { apiFetchRef.current = apiFetch; }, [apiFetch]);

  const loadConversations = React.useCallback(async () => {
    dispatch({ type: 'SET_LOADING_CONVERSATIONS' });
    try {
      const res = await apiFetch('/sws/support/conversations');
      if (!res.ok) throw new Error('Failed to load conversations');
      const data = await res.json();
      dispatch({ type: 'SET_CONVERSATIONS', conversations: data.conversations || [] });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    }
  }, [apiFetch]);

  const loadMessages = React.useCallback(async (conversationId, silent = false) => {
    if (!silent) dispatch({ type: 'SET_LOADING_MESSAGES' });
    try {
      const res = await apiFetch(`/sws/support/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();
      dispatch({ type: 'SET_MESSAGES', messages: data.messages || [] });
      dispatch({ type: 'MARK_CONVERSATION_READ', id: conversationId });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    }
  }, [apiFetch]);

  const startConversation = React.useCallback(async (text, files) => {
    const attachmentMeta = (files || []).map(f => ({ name: f.name, size: f.size }));
    const optimistic = {
      id: `tmp-${Date.now()}`,
      sender: 'user',
      senderName: 'Tú',
      text,
      timestamp: new Date().toISOString(),
      attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
    };
    dispatch({ type: 'APPEND_MESSAGE', message: optimistic });
    dispatch({ type: 'SET_SENDING', sending: true });
    dispatch({ type: 'SET_INPUT', input: '' });
    dispatch({ type: 'CLEAR_PENDING_FILES' });
    try {
      const attachments = await serializeFiles(files);
      const body = { message: text, attachments };
      const res = await apiFetch('/sws/support/conversations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to start conversation');
      const data = await res.json();
      dispatch({ type: 'ADD_CONVERSATION', conversation: data.conversation });
      dispatch({ type: 'SET_MESSAGES', messages: data.messages || [] });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    } finally {
      dispatch({ type: 'SET_SENDING', sending: false });
    }
  }, [apiFetch]);

  const sendMessage = React.useCallback(async (conversationId, text, files) => {
    if (!text.trim() && (!files || files.length === 0)) return;
    const attachmentMeta = (files || []).map(f => ({ name: f.name, size: f.size }));
    const optimistic = {
      id: `tmp-${Date.now()}`,
      sender: 'user',
      senderName: 'Tú',
      text,
      timestamp: new Date().toISOString(),
      attachments: attachmentMeta.length > 0 ? attachmentMeta : undefined,
    };
    dispatch({ type: 'APPEND_MESSAGE', message: optimistic });
    dispatch({ type: 'SET_INPUT', input: '' });
    dispatch({ type: 'CLEAR_PENDING_FILES' });
    dispatch({ type: 'SET_SENDING', sending: true });
    try {
      const attachments = await serializeFiles(files);
      const res = await apiFetch(`/sws/support/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text, attachments }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      const data = await res.json();
      if (data.messages) {
        dispatch({ type: 'SET_MESSAGES', messages: data.messages });
      } else if (data.reply) {
        dispatch({ type: 'APPEND_MESSAGE', message: data.reply });
      }
      if (data.conversation) {
        dispatch({ type: 'UPDATE_CONVERSATION', conversation: data.conversation });
      }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    } finally {
      dispatch({ type: 'SET_SENDING', sending: false });
    }
  }, [apiFetch]);

  const closeConversation = React.useCallback(async (conversationId) => {
    try {
      const res = await apiFetch(`/sws/support/conversations/${conversationId}/close`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to close conversation');
      const data = await res.json();
      if (data.conversation) {
        dispatch({ type: 'UPDATE_CONVERSATION', conversation: data.conversation });
      }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    }
  }, [apiFetch]);

  const reopenConversation = React.useCallback(async (conversationId) => {
    try {
      const res = await apiFetch(`/sws/support/conversations/${conversationId}/reopen`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reopen conversation');
      const data = await res.json();
      if (data.conversation) {
        dispatch({ type: 'UPDATE_CONVERSATION', conversation: data.conversation });
      }
      if (data.messages) {
        dispatch({ type: 'SET_MESSAGES', messages: data.messages });
      }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    }
  }, [apiFetch]);

  const submitRating = React.useCallback(async (conversationId, score, comment) => {
    try {
      await apiFetch(`/sws/support/conversations/${conversationId}/rating`, {
        method: 'POST',
        body: JSON.stringify({ score, comment }),
      });
      dispatch({
        type: 'UPDATE_CONVERSATION',
        conversation: {
          ...(state.conversations.find((c) => c.id === conversationId) || {}),
          id: conversationId,
          rated: true,
        },
      });
      dispatch({ type: 'SET_PENDING_RATING', conversationId: null });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    }
  }, [apiFetch, state.conversations]);

  const openChat = React.useCallback(() => {
    dispatch({ type: 'OPEN' });
  }, []);

  const closeChat = React.useCallback(() => {
    dispatch({ type: 'CLOSE' });
  }, []);

  const setTab = React.useCallback((tab) => {
    dispatch({ type: 'SET_TAB', tab });
  }, []);

  const selectConversation = React.useCallback((id) => {
    dispatch({ type: 'SET_ACTIVE_CONVERSATION', id });
  }, []);

  const setInput = React.useCallback((input) => {
    dispatch({ type: 'SET_INPUT', input });
  }, []);

  const dismissRating = React.useCallback((id) => {
    dispatch({ type: 'DISMISS_RATING', id });
  }, []);

  const addPendingFile = React.useCallback((file) => {
    dispatch({ type: 'ADD_PENDING_FILE', file });
  }, []);

  const removePendingFile = React.useCallback((index) => {
    dispatch({ type: 'REMOVE_PENDING_FILE', index });
  }, []);

  // Polling: refresh messages every 5s when a conversation is open
  React.useEffect(() => {
    const id = setInterval(async () => {
      const s = stateRef.current;
      if (!s.isOpen || !s.activeConversationId || s.activeConversationId === 'new') return;
      if (s.isSending) return;
      try {
        const res = await apiFetchRef.current(`/sws/support/conversations/${s.activeConversationId}/messages`);
        if (!res.ok) return;
        const data = await res.json();
        const incoming = data.messages || [];
        const current = stateRef.current;
        if (current.activeConversationId !== s.activeConversationId) return;
        if (incoming.length !== current.messages.length ||
            incoming[incoming.length - 1]?.id !== current.messages[current.messages.length - 1]?.id) {
          dispatch({ type: 'SET_MESSAGES', messages: incoming });
        }
      } catch (_) { /* silent */ }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Initial silent load so unread badge shows immediately on page load
  React.useEffect(() => {
    (async () => {
      try {
        const res = await apiFetchRef.current('/sws/support/conversations');
        if (!res.ok) return;
        const data = await res.json();
        const convs = data.conversations || [];
        if (convs.length > 0) dispatch({ type: 'SET_CONVERSATIONS', conversations: convs });
      } catch (_) { /* silent */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling: refresh conversation list every 15s regardless of widget state
  React.useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await apiFetchRef.current('/sws/support/conversations');
        if (!res.ok) return;
        const data = await res.json();
        const incoming = data.conversations || [];
        const current = stateRef.current;
        const hasChange =
          incoming.length !== current.conversations.length ||
          incoming.some((c) => {
            const existing = current.conversations.find((e) => e.id === c.id);
            return existing && existing.unread !== c.unread;
          });
        if (hasChange) dispatch({ type: 'SET_CONVERSATIONS', conversations: incoming });
      } catch (_) { /* silent */ }
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const unreadCount = state.conversations.filter((c) => c.unread).length;

  const value = React.useMemo(() => ({
    state: { ...state, unreadCount },
    actions: {
      open: openChat,
      close: closeChat,
      setTab,
      loadConversations,
      loadMessages,
      startConversation,
      sendMessage,
      closeConversation,
      reopenConversation,
      submitRating,
      dismissRating,
      selectConversation,
      setInput,
      addPendingFile,
      removePendingFile,
    },
  }), [
    state, unreadCount, openChat, closeChat, setTab,
    loadConversations, loadMessages, startConversation, sendMessage,
    closeConversation, reopenConversation,
    submitRating, dismissRating, selectConversation, setInput, addPendingFile, removePendingFile,
  ]);

  return (
    <SupportChatContext.Provider value={value}>
      {children}
    </SupportChatContext.Provider>
  );
}

export function useSupportChat() {
  const ctx = React.useContext(SupportChatContext);
  if (!ctx) throw new Error('useSupportChat must be used inside SupportChatProvider');
  return ctx;
}
