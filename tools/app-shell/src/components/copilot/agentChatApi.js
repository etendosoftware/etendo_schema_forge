import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { detectBaseUrl, normalizeConversation, normalizeMessage, parseJsonResponse } from './copilotApi.js';

/**
 * agentChatApi.js — history of the agent chat.
 *
 * Talks to `/sws/agent-chat/*` (module com.etendoerp.go), which stores the conversations in the
 * same Copilot tables the legacy panel reads. It exists because `/sws/copilot/*` accepts a bearer
 * JWT only and answers 401 to the cookie session; `/sws/agent-chat/*` authenticates like every
 * other Go endpoint. The legacy `copilotApi.js` paths are untouched and still serve the legacy hook.
 *
 * Every call is non-fatal by design: a 401/404 here is a domain answer (history unavailable), never
 * an expired session, so `on401: 'ignore'` keeps `apiFetch` from logging the user out. The caller
 * gets an Error carrying `status` and degrades. No token is passed: the credential is resolved
 * per request from the active session scheme (docs/request-policy.md).
 */

const ROOT = 'agent-chat';

/** `/sws/agent-chat/<path>` under the app base URL. */
function agentChatUrl(path) {
  return `${detectBaseUrl()}/sws/${ROOT}/${path}`;
}

async function agentChatRequest(path, { method = 'GET', body } = {}) {
  const response = await apiFetch(agentChatUrl(path), {
    method,
    baseUrl: '',
    on401: 'ignore',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `Agent chat request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const conversationPath = (id, suffix = '') => `conversations/${encodeURIComponent(id)}${suffix}`;
const listOf = (data) => (Array.isArray(data) ? data : (data?.conversations ?? [])).map(normalizeConversation);

/** Active conversations of the session user. */
export async function getAgentConversations() {
  return listOf(await agentChatRequest('conversations'));
}

/** Archived conversations of the session user. */
export async function getArchivedAgentConversations() {
  return listOf(await agentChatRequest('conversations/archived'));
}

/** Messages of one of the user's conversations, oldest first. */
export async function getAgentConversationMessages(conversationId) {
  const data = await agentChatRequest(conversationPath(conversationId, '/messages'));
  return (Array.isArray(data) ? data : (data?.messages ?? [])).map(normalizeMessage);
}

/** Create an empty conversation. Idempotent for the owner of `external_id`. */
export async function createAgentConversation({ title, external_id } = {}) {
  return agentChatRequest('conversations', { method: 'POST', body: { title, external_id } });
}

/** Append messages in one call. A message whose `external_id` is already stored is skipped. */
export async function appendAgentMessages({ conversation_id, messages }) {
  return agentChatRequest(conversationPath(conversation_id, '/messages'), { method: 'POST', body: { messages } });
}

export async function renameAgentConversation(conversationId, title) {
  return agentChatRequest(conversationPath(conversationId, '/rename'), { method: 'POST', body: { title } });
}

export async function archiveAgentConversation(conversationId) {
  return agentChatRequest(conversationPath(conversationId, '/archive'), { method: 'POST', body: {} });
}

export async function restoreAgentConversation(conversationId) {
  return agentChatRequest(conversationPath(conversationId, '/restore'), { method: 'POST', body: {} });
}

export async function permanentDeleteAgentConversation(conversationId) {
  return agentChatRequest(conversationPath(conversationId, '/permanent-delete'), { method: 'POST', body: {} });
}
