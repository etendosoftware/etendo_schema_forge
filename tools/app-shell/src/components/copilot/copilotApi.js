/**
 * copilotApi.js — HTTP client layer for the Copilot service.
 * All endpoints are relative to /sws/copilot/*.
 */
import {
  jsonHeaders,
  readCredentialHeaders,
  writeCredentialHeaders,
  writeHeaders,
} from '@/lib/sessionHeaders.js';

/**
 * Detect the application base URL by inspecting the current pathname.
 * Falls back to VITE_API_BASE env var when running outside Etendo.
 *
 * @returns {string}
 */
export function detectBaseUrl() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) {
    return path.substring(0, webIdx);
  }
  return import.meta.env.VITE_API_BASE || '';
}

/**
 * Build a full URL for a copilot endpoint path.
 *
 * @param {string} path - Path segment after /sws/copilot/ (e.g. "assistants")
 * @returns {string}
 */
export function buildCopilotUrl(path) {
  return `${detectBaseUrl()}/sws/copilot/${path}`;
}

/**
 * Parse a fetch Response body as JSON, tolerating empty or non-JSON bodies.
 *
 * @param {Response} response
 * @returns {Promise<object|null>}
 */
export async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Perform an authenticated request to a copilot endpoint.
 * Automatically sets Content-Type: application/json unless the body is FormData.
 *
 * @param {string} path - Endpoint path (e.g. "question")
 * @param {string|null} token - Bearer token
 * @param {RequestInit} [options] - Additional fetch options
 * @returns {Promise<object|null>}
 */
export async function copilotRequest(path, options = {}) {
  // ETP-4576 — the credential is the active scheme's, not a token threaded down
  // from useAuth(). Under the cookie scheme no token is ever held, so every
  // caller in this module used to send no Authorization at all AND be gated out
  // by `!token` upstream: the entire Copilot feature went silent, with nothing
  // logged anywhere.
  //
  // Four builders rather than one, because two axes matter here:
  //  - method safety: only unsafe methods may carry the CSRF proof.
  //  - multipart: a FormData body must NOT declare Content-Type, or the browser
  //    cannot attach its boundary and the backend cannot parse the upload. The
  //    *CredentialHeaders variants exist for exactly that.
  const method = String(options.method || 'GET').toUpperCase();
  const unsafe = method !== 'GET' && method !== 'HEAD';
  const multipart = options.body instanceof FormData;
  // One builder per (multipart, unsafe) pair. A lookup rather than nested
  // ternaries so each of the four combinations is named where it is chosen.
  const BUILDERS = {
    'multipart:write': writeCredentialHeaders,
    'multipart:read': readCredentialHeaders,
    'json:write': writeHeaders,
    'json:read': jsonHeaders,
  };
  const base = BUILDERS[`${multipart ? 'multipart' : 'json'}:${unsafe ? 'write' : 'read'}`]();

  const headers = new Headers(base);
  // Caller-supplied headers last so a call site can still override, e.g. a
  // different Content-Type for a non-JSON body.
  for (const [key, value] of new Headers(options.headers || {})) {
    headers.set(key, value);
  }

  const response = await fetch(buildCopilotUrl(path), {
    ...options,
    credentials: 'include',
    headers,
  });
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const message = data?.error || data?.message || `Copilot request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

/**
 * Perform an authenticated GET request to a copilot endpoint with optional query params.
 *
 * @param {string} path - Endpoint path
 * @param {string|null} token - Bearer token
 * @param {Record<string, string>} [params] - Query string parameters
 * @returns {Promise<object|null>}
 */
export async function copilotGet(path, params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  const query = entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : '';
  return copilotRequest(`${path}${query}`, { method: 'GET' });
}

/**
 * Extract the text answer from a copilot response payload.
 *
 * @param {object|null} payload
 * @returns {string}
 */
export function extractAnswerText(payload) {
  if (!payload) return '';
  if (typeof payload.answer === 'string') return payload.answer;
  if (payload.answer?.response) return payload.answer.response;
  if (payload.response) return payload.response;
  if (payload.message) return payload.message;
  if (payload.raw) return payload.raw;
  return '';
}

/**
 * Extract the conversation ID from a copilot response payload.
 *
 * @param {object|null} payload
 * @returns {string|null}
 */
export function extractConversationId(payload) {
  return payload?.answer?.conversation_id || payload?.conversation_id || null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a stable client-side id for messages that arrive without one.
 * Uses Web Crypto's randomUUID() — required by all browsers Etendo targets
 * (Chrome 92+, Firefox 95+, Safari 15.4+, Edge 92+).
 */
export function makeClientId() {
  return globalThis.crypto.randomUUID();
}

/**
 * Normalize a conversation object from the backend.
 * The backend returns `id`; our UI uses `conversation_id` consistently.
 */
function normalizeConversation(conv) {
  if (!conv) return conv;
  return {
    ...conv,
    conversation_id: conv.conversation_id || conv.id,
    title: conv.title || conv.name || '',
  };
}

/**
 * Normalize a message from the backend.
 * The backend uses `sender`; our UI uses `role`. Map "bot"/"assistant" → "copilot".
 */
function normalizeMessage(msg) {
  if (!msg) return msg;
  const raw = msg.role || msg.sender || 'copilot';
  let role = raw;
  if (raw === 'bot' || raw === 'assistant') role = 'copilot';
  return {
    ...msg,
    id: msg.id || makeClientId(),
    role,
    text: msg.text || msg.content || msg.message || '',
    timestamp: msg.timestamp || '',
  };
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the list of available assistants.
 *
 * @param {string} token
 * @returns {Promise<Array>}
 */
export async function getAssistants() {
  const data = await copilotGet('assistants');
  return Array.isArray(data) ? data : [];
}

/**
 * Fetch UI labels from the copilot service.
 *
 * @param {string} token
 * @returns {Promise<Record<string, string>>}
 */
export async function getLabels() {
  const data = await copilotGet('labels').catch(() => ({}));
  return data && typeof data === 'object' ? data : {};
}

/**
 * Fetch active conversations for the given assistant app ID.
 *
 * @param {string} token
 * @param {string} appId
 * @returns {Promise<Array>}
 */
export async function getConversations(appId) {
  const data = await copilotGet('conversations', { app_id: appId });
  const list = Array.isArray(data) ? data : (data?.conversations ?? []);
  return list.map(normalizeConversation);
}

/**
 * Fetch archived conversations for the given assistant app ID.
 *
 * @param {string} token
 * @param {string} appId
 * @returns {Promise<Array>}
 */
export async function getArchivedConversations(appId) {
  const data = await copilotGet('archivedConversations', { app_id: appId });
  const list = Array.isArray(data) ? data : (data?.conversations ?? []);
  return list.map(normalizeConversation);
}

/**
 * Fetch all messages for a specific conversation.
 *
 * @param {string} token
 * @param {string} conversationId
 * @returns {Promise<Array>}
 */
export async function getConversationMessages(conversationId) {
  const data = await copilotGet('conversationMessages', { conversation_id: conversationId });
  const list = Array.isArray(data) ? data : (data?.messages ?? []);
  return list.map(normalizeMessage);
}

/**
 * Send a question to a copilot assistant (non-streaming).
 *
 * @param {string} token
 * @param {{ app_id: string, question: string, conversation_id?: string, file?: string[] }} params
 * @returns {Promise<object>}
 */
export async function sendQuestion({ app_id, question, conversation_id, file }) {
  const body = { app_id, question };
  if (conversation_id) body.conversation_id = conversation_id;
  if (file && file.length > 0) body.file = file;
  return copilotRequest('question', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Invoke a registered copilot tool directly, bypassing the agent layer.
 * Faster than {@link sendQuestion} because it skips agent reasoning and
 * response formatting — use when the caller already knows which tool to run.
 *
 * When the tool needs a file, upload it first with {@link uploadFile} and
 * pass the returned path inside `params` (e.g. `params.path`).
 *
 * @param {string} token
 * @param {{
 *   toolName: string,
 *   params?: Record<string, unknown>,
 *   agentId?: string,
 * }} input
 * @returns {Promise<object>} payload with `answer` containing the tool output
 */
export async function executeTool({ toolName, params, agentId }) {
  const body = { tool_name: toolName, params: params || {} };
  if (agentId) body.agent_id = agentId;
  return copilotRequest('executeTool', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Upload a file to the copilot service and return the response (contains fileId).
 *
 * @param {string} token
 * @param {File} file
 * @returns {Promise<object>}
 */
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  return copilotRequest('file', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Ask the service to auto-generate a title for a conversation.
 *
 * @param {string} token
 * @param {string} conversationId
 * @returns {Promise<object>}
 */
export async function generateTitle(conversationId) {
  return copilotRequest('generateTitleConversation', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}

/**
 * Rename a conversation.
 *
 * @param {string} token
 * @param {string} conversationId
 * @param {string} title
 * @returns {Promise<object>}
 */
export async function renameConversation(conversationId, title) {
  return copilotRequest('renameConversation', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId, title }),
  });
}

/**
 * Soft-delete (archive) a conversation.
 *
 * @param {string} token
 * @param {string} conversationId
 * @returns {Promise<object>}
 */
export async function deleteConversation(conversationId) {
  return copilotRequest('deleteConversation', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}

/**
 * Restore a previously archived conversation.
 *
 * @param {string} token
 * @param {string} conversationId
 * @returns {Promise<object>}
 */
export async function restoreConversation(conversationId) {
  return copilotRequest('restoreConversation', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}

/**
 * Permanently delete an archived conversation (cannot be undone).
 *
 * @param {string} token
 * @param {string} conversationId
 * @returns {Promise<object>}
 */
export async function permanentDeleteConversation(conversationId) {
  return copilotRequest('permanentDeleteConversation', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId }),
  });
}

