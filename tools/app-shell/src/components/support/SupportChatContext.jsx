import * as React from 'react';
import { useApiFetch } from '@/auth/useApiFetch';
import { getStoredLocale } from '@/i18n';
import { track } from '@/lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '@/lib/observability/events.js';
import { playReceiveSound } from './chatSounds.js';

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
    // Text files carry both the readable `text` (for the AI) and the base64
    // `data` (so the backend can also upload the original file to Jira as a
    // real, downloadable attachment — today only `text` reaches the AI).
    const [text, data] = await Promise.all([readAsText(file), readAsBase64(file)]);
    return { name: file.name, mimeType, text, data };
  }
  // Images and PDFs go as base64 — GPT-4o handles both via vision/file API
  const data = await readAsBase64(file);
  return { name: file.name, mimeType, data };
}

async function serializeFiles(files) {
  if (!files || files.length === 0) return [];
  return Promise.all(files.map(serializeFile));
}

// Maximum number of local image preview blob URLs kept alive at once. The
// browser never gives us the raw bytes back for an outgoing attachment once
// it round-trips through the server (only `{filename, mimeType}` survives),
// so this cache is the ONLY way to keep showing a thumbnail for an image the
// user just sent. Capped + FIFO-evicted so a long chat session with many
// image sends can't leak blob URLs indefinitely.
const MAX_LOCAL_IMAGE_URLS = 20;

// Fire-and-forget telemetry: a failed track() call should never block the UI.
function trackSupportEvent(eventDefinition, properties = {}) {
  const event = buildObservabilityEvent(eventDefinition, properties);
  Promise.resolve(track(event.name, event.properties)).catch(() => {});
}

const SupportChatContext = React.createContext(null);

// In-memory only (not persisted): once the user dismisses the floating launcher (it can sit
// on top of another window's own buttons — e.g. an onboarding "Continuar", or the
// reconciliation action bar), it stays hidden for the rest of this page load. Reloading the
// page, or reopening the chat from anywhere (the FAB itself, "Ayuda y soporte" in the nav),
// brings it back — a dismissal is a "hide it for now" gesture, not "hide it forever".
const INITIAL_STATE = {
  isOpen: false,
  fabDismissed: false,
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
      // Opening the chat — from the FAB, "Ayuda y soporte" in the nav, or anywhere else —
      // un-dismisses the FAB: once the user has engaged with the chat again, closing it back
      // should show the FAB normally, and it only hides again if they explicitly dismiss it.
      return { ...state, isOpen: true, fabDismissed: false };
    case 'DISMISS_FAB':
      return { ...state, fabDismissed: true };
    case 'CLOSE':
      return { ...state, isOpen: false };
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations, isLoadingConversations: false };
    case 'SET_LOADING_CONVERSATIONS':
      return { ...state, isLoadingConversations: true, error: null };
    case 'SET_ACTIVE_CONVERSATION':
      // Resets the shared draft here, not on widget close — this is the only action that
      // represents the user actually navigating to a DIFFERENT conversation (from the
      // Mensajes list, or starting a fresh one). `input` otherwise survives closing/reopening
      // the widget, so a message the user was mid-typing isn't lost just because they closed
      // the chat panel; it's the 'new' → real-id promotion after the first AI reply (handled
      // by ADD_CONVERSATION, not this action) that must NOT clear it.
      return { ...state, activeConversationId: action.id, messages: [], input: '' };
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
        conversations: state.conversations
          .map((c) => {
            if (c.id !== action.conversation.id) return c;
            const incoming = action.conversation;
            // A request that touches one conversation (sendMessage, closeConversation, a
            // rating, ...) snapshots that conversation's summary at the START of the
            // request. If it's slow (the AI/Jira round trip can take several seconds) and a
            // faster response — another request, or the 15s background poll — already
            // landed newer server state in the meantime, this stale snapshot must not
            // overwrite it. `updatedAt` is the entity's real audit timestamp (bumped by
            // every server-side save, including the async human-takeover flip, which never
            // touches lastActivity/lastMessage) — the only reliable way to tell which
            // response actually reflects newer DB state, since network responses don't
            // resolve in dispatch order. Confirmed bug without this: the "talk to a human"
            // bar could flicker hidden→visible→hidden as a stale response landed after a
            // fresher one and reverted assigneeKind back to 'ai'.
            const incomingIsStale = incoming.updatedAt && c.updatedAt &&
              new Date(incoming.updatedAt) < new Date(c.updatedAt);
            return incomingIsStale ? c : { ...c, ...incoming };
          })
          .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0)),
      };
    case 'MERGE_CONVERSATIONS': {
      // Used by the 15s background poll instead of SET_CONVERSATIONS: that poll's response
      // can land out of order relative to another in-flight request for the same
      // conversation (another poll tick, or a slow sendMessage/close/rating round trip).
      // Same updatedAt-based staleness guard as UPDATE_CONVERSATION, applied per-item across
      // the whole incoming list — see its comment for why arrival order can't be trusted.
      const currentById = new Map(state.conversations.map((c) => [c.id, c]));
      const merged = action.conversations.map((incoming) => {
        const existing = currentById.get(incoming.id);
        if (!existing) return incoming;
        const incomingIsStale = incoming.updatedAt && existing.updatedAt &&
          new Date(incoming.updatedAt) < new Date(existing.updatedAt);
        return incomingIsStale ? existing : incoming;
      });
      return {
        ...state,
        conversations: merged.sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0)),
      };
    }
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

  // filename -> local blob URL, insertion-ordered (Map preserves insertion
  // order) so the oldest entry is always the first one evicted. Lives on a
  // ref (not component state) so it survives the optimistic-message → real
  // server message swap without triggering re-renders of its own.
  const localImageUrlsRef = React.useRef(new Map());

  const cacheLocalImageUrl = React.useCallback((file) => {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const cache = localImageUrlsRef.current;
    const previous = cache.get(file.name);
    if (previous) {
      URL.revokeObjectURL(previous);
      cache.delete(file.name);
    }
    cache.set(file.name, URL.createObjectURL(file));
    while (cache.size > MAX_LOCAL_IMAGE_URLS) {
      const oldestKey = cache.keys().next().value;
      URL.revokeObjectURL(cache.get(oldestKey));
      cache.delete(oldestKey);
    }
  }, []);

  const getLocalImageUrl = React.useCallback((filename) => {
    if (!filename) return null;
    return localImageUrlsRef.current.get(filename) || null;
  }, []);

  // Revoke every cached blob URL when the provider unmounts (app teardown) —
  // this cache's lifetime spans the whole widget session, not a single
  // AttachmentItem instance, so it must clean up at its own level.
  React.useEffect(() => {
    return () => {
      localImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      localImageUrlsRef.current.clear();
    };
  }, []);

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
    const attachmentMeta = (files || []).map(f => ({ name: f.name, size: f.size, mimeType: f.type || undefined }));
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
      const body = { message: text, attachments, locale: getStoredLocale() };
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
    const attachmentMeta = (files || []).map(f => ({ name: f.name, size: f.size, mimeType: f.type || undefined }));
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
      trackSupportEvent(OBSERVABILITY_EVENTS.SUPPORT_CSAT_SUBMITTED, {
        category: 'support',
        source: 'support_chat',
        score,
        hasComment: Boolean(comment && comment.trim()),
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

  const dismissFab = React.useCallback(() => {
    dispatch({ type: 'DISMISS_FAB' });
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
    // Cache the local preview at pick-time — before the file ever reaches the
    // server — so it can keep being shown after the optimistic message is
    // replaced by the server's response (which has no raw bytes to fetch).
    cacheLocalImageUrl(file);
    dispatch({ type: 'ADD_PENDING_FILE', file });
  }, [cacheLocalImageUrl]);

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
        const currentLastId = current.messages[current.messages.length - 1]?.id;
        const incomingLast = incoming[incoming.length - 1];
        if (incoming.length !== current.messages.length || incomingLast?.id !== currentLastId) {
          // A reply (ValerIA or a human agent) that lands here — as opposed to via the direct
          // sendMessage response, which already updates `messages` before this poll ever sees
          // a difference — is exactly the "chat is open, someone replied while I was just
          // looking at it" case. The send→reply round trip is handled separately by
          // ConversationView's isSending-based effect and never reaches this branch, since by
          // the time this poll runs the direct response already delivered that message.
          if (incomingLast && incomingLast.id !== currentLastId && incomingLast.sender !== 'user') {
            playReceiveSound();
          }
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
            return existing && (
              existing.unread !== c.unread ||
              existing.status !== c.status ||
              existing.rated !== c.rated ||
              existing.lastActivity !== c.lastActivity ||
              // Escalation to a human takes effect via a background webhook, asynchronous to
              // the message-send response that triggered it (see _do_escalate on the ADK
              // side) — this poll is what eventually picks up assigneeKind flipping to
              // 'human' so the "talk to a human" bar hides once escalation actually lands.
              existing.assigneeKind !== c.assigneeKind
            );
          });
        if (hasChange) {
          // Ding for a reply (ValerIA or a human agent from Jira) that arrives while the
          // conversation isn't the one actively open — that in-conversation case already
          // gets its own sound from ConversationView, so this would otherwise double-play.
          // Keyed off `lastActivity` (not just the `unread` flag): `unread` stays stuck at
          // true across multiple back-to-back replies once it first flips, so a second or
          // third reply that arrives before the conversation is read would otherwise be
          // silent. `lastActivity` changes on every single message.
          incoming.forEach((c) => {
            const existing = current.conversations.find((e) => e.id === c.id);
            const arrived = existing && c.unread && existing.lastActivity !== c.lastActivity;
            const isActiveOpenConversation = current.isOpen && current.activeConversationId === c.id;
            if (arrived && !isActiveOpenConversation) {
              playReceiveSound();
            }
          });
          dispatch({ type: 'MERGE_CONVERSATIONS', conversations: incoming });
        }
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
      dismissFab,
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
      getLocalImageUrl,
    },
  }), [
    state, unreadCount, openChat, closeChat, dismissFab, setTab,
    loadConversations, loadMessages, startConversation, sendMessage,
    closeConversation, reopenConversation,
    submitRating, dismissRating, selectConversation, setInput, addPendingFile, removePendingFile,
    getLocalImageUrl,
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

// Same defensive-fallback shape as useFavorites() in FavoritesContext.jsx — for
// callers (e.g. a page-level "help" menu item) that need to work whether or not
// they're mounted under SupportChatProvider (unit tests that render a page in
// isolation, Storybook, etc.), instead of hard-throwing like useSupportChat().
// Real app usage always has the provider (see AppLayout.jsx), so production
// behavior is unaffected — only the missing-provider case gets a safe no-op.
export function useSupportChatSafe() {
  const ctx = React.useContext(SupportChatContext);
  if (!ctx) {
    return {
      state: { ...INITIAL_STATE, unreadCount: 0 },
      actions: {
        open: () => {},
        close: () => {},
        setTab: () => {},
        loadConversations: () => {},
        loadMessages: () => {},
        startConversation: () => {},
        sendMessage: () => {},
        closeConversation: () => {},
        reopenConversation: () => {},
        submitRating: () => {},
        dismissRating: () => {},
        selectConversation: () => {},
        setInput: () => {},
        addPendingFile: () => {},
        removePendingFile: () => {},
        getLocalImageUrl: () => null,
      },
    };
  }
  return ctx;
}
