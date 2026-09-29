/**
 * Pure helpers that map the agent chat (AI SDK UIMessages) to and from the conversation
 * history stored by the Copilot backend (ETCOP_CONVERSATION / ETCOP_MESSAGE).
 */

export const CONVERSATION_TITLE_MAX = 60;
const TOOL_DONE_STATES = ['output-available', 'output-error', 'output-denied'];

/** Text of a UIMessage: only `text` parts, never tool inputs or outputs. */
export function uiMessageText(message) {
  if (typeof message?.content === 'string') return message.content;
  return (message?.parts || [])
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
}

/** Conversation title from the first user message, single-line and truncated. */
export function conversationTitle(text) {
  const oneLine = String(text || '').replace(/\s+/g, ' ').trim();
  return oneLine.length > CONVERSATION_TITLE_MAX
    ? `${oneLine.slice(0, CONVERSATION_TITLE_MAX - 1).trimEnd()}…`
    : oneLine;
}

/** True while the last assistant message still waits for a tool result. */
export function hasPendingTool(message) {
  return (message?.parts || []).some(part => (
    part.type?.startsWith('tool-') && !TOOL_DONE_STATES.includes(part.state)
  ));
}

/**
 * The messages of a finished turn that have not been saved yet, as the backend expects
 * them. Messages without text (a tool-only assistant message) are left out.
 *
 * @param {Array} uiMessages — chat.messages
 * @param {Set<string>} savedIds — ids already stored (or deliberately skipped)
 * @returns {Array<{id: string, role: 'user'|'assistant', text: string, external_id: string}>}
 */
export function unsavedMessages(uiMessages, savedIds) {
  const out = [];
  for (const message of uiMessages || []) {
    if (savedIds.has(message.id)) continue;
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const text = uiMessageText(message).trim();
    if (!text) continue;
    out.push({ id: message.id, role: message.role, text, external_id: message.id });
  }
  return out;
}

const ASSISTANT_ROLES = ['assistant', 'copilot', 'bot'];

/** Maps a backend role to a UIMessage role; anything unknown (error/system) yields null. */
function toUiRole(role) {
  if (role === 'user') return 'user';
  if (ASSISTANT_ROLES.includes(role)) return 'assistant';
  return null;
}

/** Backend message -> UIMessage for `chat.setMessages`. Unknown roles (error/system) are dropped. */
export function toUiMessages(backendMessages) {
  const out = [];
  for (const msg of backendMessages || []) {
    const role = String(msg.role || '').toLowerCase();
    const uiRole = toUiRole(role);
    const text = msg.text || msg.content || msg.message || '';
    if (!uiRole || !text) continue;
    out.push({ id: msg.id, role: uiRole, parts: [{ type: 'text', text }] });
  }
  return out;
}
