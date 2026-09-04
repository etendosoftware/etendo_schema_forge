import { useReducer, useCallback, useMemo } from 'react';
import {
  getAssistants,
  getLabels,
  getConversations,
  getArchivedConversations,
  getConversationMessages,
  sendQuestion,
  uploadFile,
  generateTitle,
  renameConversation as apiRenameConversation,
  deleteConversation as apiDeleteConversation,
  restoreConversation as apiRestoreConversation,
  permanentDeleteConversation as apiPermanentDeleteConversation,
  extractAnswerText,
  extractConversationId,
  makeClientId,
} from './copilotApi.js';

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

const SET_ASSISTANTS = 'SET_ASSISTANTS';
const SET_LABELS = 'SET_LABELS';
const SET_CONVERSATIONS = 'SET_CONVERSATIONS';
const SET_ARCHIVED = 'SET_ARCHIVED';
const SET_MESSAGES = 'SET_MESSAGES';
const SET_CONVERSATION_ID = 'SET_CONVERSATION_ID';
const SET_SELECTED_ASSISTANT = 'SET_SELECTED_ASSISTANT';
const SET_INPUT = 'SET_INPUT';
const SET_FILES = 'SET_FILES';
const ADD_MESSAGE = 'ADD_MESSAGE';
const UPDATE_CONVERSATION = 'UPDATE_CONVERSATION';
const UPSERT_CONVERSATION = 'UPSERT_CONVERSATION';
const REMOVE_CONVERSATION = 'REMOVE_CONVERSATION';
const SET_LOADING = 'SET_LOADING';
const SET_ERROR = 'SET_ERROR';
const RESET_CONVERSATION = 'RESET_CONVERSATION';
const SET_FILTER = 'SET_FILTER';
const ADD_ATTACHMENT = 'ADD_ATTACHMENT';
const REMOVE_ATTACHMENT = 'REMOVE_ATTACHMENT';
const CLEAR_ATTACHMENTS = 'CLEAR_ATTACHMENTS';
const SYNC_ATTACHMENTS = 'SYNC_ATTACHMENTS';

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState = {
  assistants: [],
  labels: {},
  selectedAssistant: null,
  conversations: [],
  archivedConversations: [],
  messages: [],
  conversationId: null,
  input: '',
  files: [],
  fileIds: [],
  filter: '',
  attachments: [],
  dismissedIds: [],
  isLoadingAssistants: false,
  isLoadingConversations: false,
  isLoadingArchivedConversations: false,
  isLoadingMessages: false,
  isSending: false,
  error: '',
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state, action) {
  switch (action.type) {
    case SET_ASSISTANTS:
      return { ...state, assistants: action.payload };

    case SET_LABELS:
      return { ...state, labels: action.payload };

    case SET_CONVERSATIONS:
      return { ...state, conversations: action.payload };

    case SET_ARCHIVED:
      return { ...state, archivedConversations: action.payload };

    case SET_MESSAGES:
      return { ...state, messages: action.payload };

    case SET_CONVERSATION_ID:
      return { ...state, conversationId: action.payload };

    case SET_SELECTED_ASSISTANT:
      return {
        ...state,
        selectedAssistant: action.payload,
        // Reset per-conversation state when switching assistants.
        conversations: [],
        archivedConversations: [],
        messages: [],
        conversationId: null,
        input: '',
        files: [],
        fileIds: [],
        error: '',
      };

    case SET_INPUT:
      return { ...state, input: action.payload };

    case SET_FILES:
      return { ...state, files: action.files, fileIds: action.fileIds };

    case ADD_MESSAGE:
      return { ...state, messages: [...state.messages, action.payload] };

    case UPDATE_CONVERSATION: {
      const update = (list) =>
        list.map((conv) =>
          conv.conversation_id === action.id
            ? { ...conv, ...action.updates }
            : conv
        );
      return {
        ...state,
        conversations: update(state.conversations),
        archivedConversations: update(state.archivedConversations),
      };
    }

    case UPSERT_CONVERSATION: {
      const exists = state.conversations.some((c) => c.conversation_id === action.payload.conversation_id);
      if (exists) return state;
      return {
        ...state,
        conversations: [action.payload, ...state.conversations],
      };
    }

    case REMOVE_CONVERSATION:
      return {
        ...state,
        conversations: state.conversations.filter(
          (c) => c.conversation_id !== action.id
        ),
        archivedConversations: state.archivedConversations.filter(
          (c) => c.conversation_id !== action.id
        ),
      };

    case SET_LOADING:
      return { ...state, [action.key]: action.value };

    case SET_ERROR:
      return { ...state, error: action.payload };

    case RESET_CONVERSATION:
      return {
        ...state,
        messages: [],
        conversationId: null,
        input: '',
        files: [],
        fileIds: [],
        error: '',
      };

    case SET_FILTER:
      return { ...state, filter: action.payload };

    case ADD_ATTACHMENT: {
      const incoming = action.payload;
      if (!incoming || !incoming.id) return state;
      if (state.attachments.some((a) => a.id === incoming.id)) return state;
      return { ...state, attachments: [...state.attachments, incoming] };
    }

    case REMOVE_ATTACHMENT: {
      const alreadyDismissed = state.dismissedIds.includes(action.id);
      return {
        ...state,
        attachments: state.attachments.filter((a) => a.id !== action.id),
        dismissedIds: alreadyDismissed
          ? state.dismissedIds
          : [...state.dismissedIds, action.id],
      };
    }

    case CLEAR_ATTACHMENTS:
      return { ...state, attachments: [], dismissedIds: [] };

    case SYNC_ATTACHMENTS: {
      const desired = action.payload || [];
      const desiredIds = new Set(desired.map((d) => d.id));
      // Keep existing chips whose id is still in desired set (preserve live data).
      const kept = state.attachments.filter((a) => desiredIds.has(a.id));
      const keptIds = new Set(kept.map((a) => a.id));
      // Update kept chips to the latest payload (so recordData/formValues refresh).
      const refreshed = kept.map((a) => {
        const latest = desired.find((d) => d.id === a.id);
        return latest ? { ...a, ...latest } : a;
      });
      // Prune stale dismissals: only keep dismissedIds that are still in desired.
      const prunedDismissed = state.dismissedIds.filter((id) => desiredIds.has(id));
      const dismissedSet = new Set(prunedDismissed);
      // Add desired chips not already present and not dismissed.
      const additions = desired.filter(
        (d) => !keptIds.has(d.id) && !dismissedSet.has(d.id)
      );
      return {
        ...state,
        attachments: [...refreshed, ...additions],
        dismissedIds: prunedDismissed,
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

const makeMessageId = makeClientId;

/**
 * Build the structured context block prepended to the wire payload when there
 * are active attachments. The UI message shown to the user is NOT prefixed.
 */
function buildContextPrefix(attachments) {
  if (!attachments?.length) return '';
  const windows = [...new Set(attachments.map((a) => a.windowSpec).filter(Boolean))];
  const lines = ['[Context]', `Window(s): ${windows.join(', ')}`];
  for (const a of attachments) {
    const label = a.recordIdentifier || 'List view';
    lines.push(`- ${a.tabTitle} — ${label}`);
    if (a.kind === 'listView' || !a.recordData) {
      lines.push('  List view (no record selected)');
    } else {
      lines.push(`  ${JSON.stringify(a.recordData)}`);
    }
    if (a.formValues && Object.keys(a.formValues).length > 0) {
      lines.push(`  Form (editing): ${JSON.stringify(a.formValues)}`);
    }
  }
  lines.push('[End Context]', '');
  return lines.join('\n') + '\n';
}

/**
 * Build the desired attachments array from a CurrentWindowContext snapshot.
 * Pure helper shared by `attachCurrentWindow` (initial-open) and
 * `syncAttachments` (live navigation/selection sync).
 *
 *   - 0 selected records  -> one `listView` attachment for the window
 *   - N selected records  -> one `record` attachment per row
 *
 * Returns an empty array when `current` has no usable spec.
 */
function buildDesiredAttachments(current) {
  if (!current || !current.spec) return [];
  const { spec, tabTitle, selectedRecords = [], formValues, isFormEditing } = current;

  if (!selectedRecords.length) {
    return [
      {
        id: `${spec}:list`,
        kind: 'listView',
        windowSpec: spec,
        tabTitle,
      },
    ];
  }

  return selectedRecords.map((record) => {
    const recordId = record?.id ?? record?._identifier ?? null;
    const identifier = record?._identifier || record?.documentNo || record?.name || recordId || '';
    return {
      id: `${spec}:${recordId ?? JSON.stringify(record).slice(0, 32)}`,
      kind: 'record',
      windowSpec: spec,
      tabTitle,
      recordIdentifier: String(identifier || ''),
      recordData: record,
      formValues: isFormEditing ? (formValues || null) : null,
      isFormEditing: Boolean(isFormEditing),
    };
  });
}

function formatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useCopilotChat — centralized state management for the full copilot chat UI.
 *
 * @param {{ token: string|null }} options
 * @returns {{ state: object, actions: object }}
 */
export function useCopilotChat({ token }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ------------------------------------------------------------------
  // Bootstrap
  // ------------------------------------------------------------------

  /**
   * Fetch assistants and labels in parallel and populate the store.
   */
  const loadBootstrap = useCallback(async () => {

    dispatch({ type: SET_LOADING, key: 'isLoadingAssistants', value: true });
    dispatch({ type: SET_ERROR, payload: '' });

    try {
      const [assistants, labels] = await Promise.all([
        getAssistants(token),
        getLabels(token),
      ]);
      dispatch({ type: SET_ASSISTANTS, payload: assistants });
      dispatch({ type: SET_LABELS, payload: labels });
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to load assistants' });
    } finally {
      dispatch({ type: SET_LOADING, key: 'isLoadingAssistants', value: false });
    }
  }, [token]);

  // ------------------------------------------------------------------
  // Conversations
  // ------------------------------------------------------------------

  /**
   * Load active conversations for the currently selected assistant.
   */
  const loadConversations = useCallback(async () => {
    if (!state.selectedAssistant) return;

    dispatch({ type: SET_LOADING, key: 'isLoadingConversations', value: true });
    try {
      const convs = await getConversations(token, state.selectedAssistant.app_id);
      dispatch({ type: SET_CONVERSATIONS, payload: convs });
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to load conversations' });
    } finally {
      dispatch({ type: SET_LOADING, key: 'isLoadingConversations', value: false });
    }
  }, [token, state.selectedAssistant]);

  /**
   * Load archived conversations for the currently selected assistant.
   */
  const loadArchivedConversations = useCallback(async () => {
    if (!state.selectedAssistant) return;

    dispatch({ type: SET_LOADING, key: 'isLoadingArchivedConversations', value: true });
    try {
      const convs = await getArchivedConversations(token, state.selectedAssistant.app_id);
      dispatch({ type: SET_ARCHIVED, payload: convs });
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to load archived conversations' });
    } finally {
      dispatch({ type: SET_LOADING, key: 'isLoadingArchivedConversations', value: false });
    }
  }, [token, state.selectedAssistant]);

  // ------------------------------------------------------------------
  // Assistant selection
  // ------------------------------------------------------------------

  /**
   * Select an assistant, reset per-conversation state, and load its conversations.
   *
   * @param {object} assistant
   */
  const selectAssistant = useCallback(async (assistant) => {
    dispatch({ type: SET_SELECTED_ASSISTANT, payload: assistant });
    if (!assistant) return;

    dispatch({ type: SET_LOADING, key: 'isLoadingConversations', value: true });
    try {
      const convs = await getConversations(token, assistant.app_id);
      dispatch({ type: SET_CONVERSATIONS, payload: convs });
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to load conversations' });
    } finally {
      dispatch({ type: SET_LOADING, key: 'isLoadingConversations', value: false });
    }
  }, [token]);

  // ------------------------------------------------------------------
  // Message selection & navigation
  // ------------------------------------------------------------------

  /**
   * Load messages for the given conversation and make it the active one.
   *
   * @param {object} conv - Conversation object (must have conversation_id)
   */
  const selectConversation = useCallback(async (conv) => {
    if (!conv?.conversation_id) return;

    dispatch({ type: SET_CONVERSATION_ID, payload: conv.conversation_id });
    dispatch({ type: SET_LOADING, key: 'isLoadingMessages', value: true });
    dispatch({ type: SET_ERROR, payload: '' });

    try {
      const messages = await getConversationMessages(token, conv.conversation_id);
      dispatch({ type: SET_MESSAGES, payload: messages });
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to load messages' });
    } finally {
      dispatch({ type: SET_LOADING, key: 'isLoadingMessages', value: false });
    }
  }, [token]);

  /**
   * Clear the active conversation so the user can start fresh.
   * The selected assistant is preserved.
   */
  const startNewConversation = useCallback(() => {
    dispatch({ type: RESET_CONVERSATION });
  }, []);

  // ------------------------------------------------------------------
  // Messaging
  // ------------------------------------------------------------------

  /**
   * Send a message to the selected assistant and append both the user bubble
   * and the copilot response (or an error bubble) to the messages list.
   *
   * @param {string} question - Text to send
   */
  const sendMessage = useCallback(async (question) => {
    if (!question?.trim() || !state.selectedAssistant || state.isSending) return;

    dispatch({ type: SET_ERROR, payload: '' });
    dispatch({ type: SET_LOADING, key: 'isSending', value: true });

    const userMessage = {
      id: makeMessageId(),
      role: 'user',
      text: question.trim(),
      timestamp: formatTimestamp(),
      files: state.files,
    };

    dispatch({ type: ADD_MESSAGE, payload: userMessage });
    dispatch({ type: SET_INPUT, payload: '' });

    // Prepend structured context for attachments (the wire payload only — the
    // user-visible bubble stays with the original text).
    const wireQuestion = state.attachments.length > 0
      ? buildContextPrefix(state.attachments) + question.trim()
      : question.trim();

    try {
      const response = await sendQuestion(token, {
        app_id: state.selectedAssistant.app_id,
        question: wireQuestion,
        conversation_id: state.conversationId || undefined,
        file: state.fileIds.length > 0 ? state.fileIds : undefined,
      });

      const answerText = extractAnswerText(response) || 'No response received.';
      const newConversationId = extractConversationId(response);
      const isFirstReply = !state.conversationId && newConversationId;

      if (newConversationId) {
        dispatch({ type: SET_CONVERSATION_ID, payload: newConversationId });
        if (isFirstReply) {
          dispatch({
            type: UPSERT_CONVERSATION,
            payload: {
              conversation_id: newConversationId,
              title: '',
              app_id: state.selectedAssistant?.app_id,
            },
          });
        }
      }

      dispatch({
        type: ADD_MESSAGE,
        payload: {
          id: makeMessageId(),
          role: 'copilot',
          text: answerText,
          timestamp: formatTimestamp(),
        },
      });

      // Clear pending file attachments after a successful send.
      dispatch({ type: SET_FILES, files: [], fileIds: [] });

      // Auto-generate a title after the first reply in a new conversation.
      if (isFirstReply) {
        generateTitle(token, newConversationId)
          .then((res) => {
            const title = res?.title || res?.generated_title;
            if (title) {
              dispatch({ type: UPDATE_CONVERSATION, id: newConversationId, updates: { title } });
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      dispatch({
        type: ADD_MESSAGE,
        payload: {
          id: makeMessageId(),
          role: 'error',
          text: err.message || 'Failed to send message.',
          timestamp: formatTimestamp(),
        },
      });
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to send message.' });
    } finally {
      dispatch({ type: SET_LOADING, key: 'isSending', value: false });
    }
  }, [state.selectedAssistant, state.conversationId, state.fileIds, state.files, state.isSending, state.attachments, token]);

  // ------------------------------------------------------------------
  // Conversation management
  // ------------------------------------------------------------------

  /**
   * Soft-delete a conversation (moves it to the archived list).
   *
   * @param {string} id - conversation_id
   */
  const deleteConversationAction = useCallback(async (id) => {
    if (!id) return;
    try {
      await apiDeleteConversation(token, id);
      // Move from active to archived list.
      const archived = state.conversations.find((c) => c.conversation_id === id);
      dispatch({ type: REMOVE_CONVERSATION, id });
      if (archived) {
        dispatch({ type: SET_ARCHIVED, payload: [...state.archivedConversations, archived] });
      }
      // If the deleted conversation was the active one, reset the view.
      if (state.conversationId === id) {
        dispatch({ type: RESET_CONVERSATION });
      }
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to delete conversation.' });
    }
  }, [token, state.conversations, state.archivedConversations, state.conversationId]);

  /**
   * Restore an archived conversation back to the active list.
   *
   * @param {string} id - conversation_id
   */
  const restoreConversationAction = useCallback(async (id) => {
    if (!id) return;
    try {
      await apiRestoreConversation(token, id);
      const conv = state.archivedConversations.find((c) => c.conversation_id === id);
      dispatch({
        type: SET_ARCHIVED,
        payload: state.archivedConversations.filter((c) => c.conversation_id !== id),
      });
      if (conv) {
        dispatch({ type: SET_CONVERSATIONS, payload: [...state.conversations, conv] });
      }
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to restore conversation.' });
    }
  }, [token, state.archivedConversations, state.conversations]);

  /**
   * Permanently delete an archived conversation (irreversible).
   *
   * @param {string} id - conversation_id
   */
  const permanentDelete = useCallback(async (id) => {
    if (!id) return;
    try {
      await apiPermanentDeleteConversation(token, id);
      dispatch({ type: REMOVE_CONVERSATION, id });
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to permanently delete conversation.' });
    }
  }, [token]);

  /**
   * Rename a conversation and update it in the local list.
   *
   * @param {string} id - conversation_id
   * @param {string} title - New title
   */
  const renameConversationAction = useCallback(async (id, title) => {
    if (!id || !title?.trim()) return;
    try {
      await apiRenameConversation(token, id, title.trim());
      dispatch({ type: UPDATE_CONVERSATION, id, updates: { title: title.trim() } });
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to rename conversation.' });
    }
  }, [token]);

  /**
   * Auto-generate a title for a conversation and update it in the local list.
   *
   * @param {string} id - conversation_id
   */
  const generateTitleAction = useCallback(async (id) => {
    if (!id) return;
    try {
      const response = await generateTitle(token, id);
      const title = response?.title || response?.generated_title;
      if (title) {
        dispatch({ type: UPDATE_CONVERSATION, id, updates: { title } });
      }
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to generate title.' });
    }
  }, [token]);

  // ------------------------------------------------------------------
  // File management
  // ------------------------------------------------------------------

  /**
   * Upload a file and track it in the pending attachments list.
   *
   * @param {File} file
   */
  const uploadFileAction = useCallback(async (file) => {
    if (!file) return;
    try {
      const data = await uploadFile(token, file);
      const uploadId =
        data?.fileId ||
        data?.id ||
        Object.values(data || {}).find((v) => typeof v === 'string');
      dispatch({
        type: SET_FILES,
        files: [...state.files, file],
        fileIds: uploadId ? [...state.fileIds, uploadId] : state.fileIds,
      });
      dispatch({ type: SET_ERROR, payload: '' });
    } catch (err) {
      dispatch({ type: SET_ERROR, payload: err.message || 'Failed to upload file.' });
    }
  }, [token, state.files, state.fileIds]);

  /**
   * Remove a pending file attachment by index.
   *
   * @param {number} index
   */
  const removeFile = useCallback((index) => {
    dispatch({
      type: SET_FILES,
      files: state.files.filter((_, i) => i !== index),
      fileIds: state.fileIds.filter((_, i) => i !== index),
    });
  }, [state.files, state.fileIds]);

  // ------------------------------------------------------------------
  // Simple setters
  // ------------------------------------------------------------------

  /** @param {string} value */
  const setInput = useCallback((value) => {
    dispatch({ type: SET_INPUT, payload: value });
  }, []);

  /** @param {string} value */
  const setFilter = useCallback((value) => {
    dispatch({ type: SET_FILTER, payload: value });
  }, []);

  /** Reset messages, input, error, and pending files. */
  const resetConversation = useCallback(() => {
    dispatch({ type: RESET_CONVERSATION });
  }, []);

  // ------------------------------------------------------------------
  // Attachments (record/window context)
  // ------------------------------------------------------------------

  const addAttachment = useCallback((attachment) => {
    if (!attachment?.id) return;
    dispatch({ type: ADD_ATTACHMENT, payload: attachment });
  }, []);

  const removeAttachment = useCallback((id) => {
    dispatch({ type: REMOVE_ATTACHMENT, id });
  }, []);

  const clearAttachments = useCallback(() => {
    dispatch({ type: CLEAR_ATTACHMENTS });
  }, []);

  /**
   * Build attachments from a CurrentWindowContext `current` snapshot and add
   * them to the attachments list.
   *
   *   - 0 selected records  -> one `listView` attachment for the window
   *   - N selected records  -> one `record` attachment per row
   */
  const attachCurrentWindow = useCallback((current) => {
    const desired = buildDesiredAttachments(current);
    for (const payload of desired) {
      dispatch({ type: ADD_ATTACHMENT, payload });
    }
  }, []);

  /**
   * Live-sync attachments with the current window snapshot (mirror-minus-dismissals).
   * Freezes (no-op) when `current` is null — non-window routes preserve chips.
   */
  const syncAttachments = useCallback((current) => {
    if (current == null) return;
    const desired = buildDesiredAttachments(current);
    dispatch({ type: SYNC_ATTACHMENTS, payload: desired });
  }, []);

  // ------------------------------------------------------------------
  // Stable actions object
  // ------------------------------------------------------------------

  const actions = useMemo(() => ({
    loadBootstrap,
    loadConversations,
    loadArchivedConversations,
    selectAssistant,
    selectConversation,
    startNewConversation,
    sendMessage,
    deleteConversation: deleteConversationAction,
    restoreConversation: restoreConversationAction,
    permanentDelete,
    renameConversation: renameConversationAction,
    generateTitle: generateTitleAction,
    uploadFile: uploadFileAction,
    removeFile,
    setInput,
    setFilter,
    resetConversation,
    addAttachment,
    removeAttachment,
    clearAttachments,
    attachCurrentWindow,
    syncAttachments,
  }), [
    loadBootstrap,
    loadConversations,
    loadArchivedConversations,
    selectAssistant,
    selectConversation,
    startNewConversation,
    sendMessage,
    deleteConversationAction,
    restoreConversationAction,
    permanentDelete,
    renameConversationAction,
    generateTitleAction,
    uploadFileAction,
    removeFile,
    setInput,
    setFilter,
    resetConversation,
    addAttachment,
    removeAttachment,
    clearAttachments,
    attachCurrentWindow,
    syncAttachments,
  ]);

  return { state, actions };
}
