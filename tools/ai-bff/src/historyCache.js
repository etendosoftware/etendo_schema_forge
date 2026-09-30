import { createHash } from 'node:crypto';

/**
 * In-memory conversation history, keyed by the `x-opencode-session` id.
 *
 * The browser already sends every UIMessage (tool parts included) while its tab
 * stays open. What it cannot send is the tool traffic of a conversation resumed
 * from the history panel or after a reload: the database only keeps user and
 * assistant text. This store keeps the FULL model history (tool calls and tool
 * results) for a while so such a turn still sees what the agent did earlier.
 *
 * It is a per-process cache, not a source of truth: it is lost on restart, is
 * not shared between replicas, and any divergence from what the client sends
 * makes it step aside (see `resolveHistory`).
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_MAX_ENTRY_CHARS = 2_000_000;
export const DEFAULT_TOOL_RESULT_BUDGET = 4000;

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function historyConfigFromEnv(env = process.env) {
  return {
    ttlMs: positiveInt(env.AI_BFF_HISTORY_TTL_MS, DEFAULT_TTL_MS),
    maxEntries: positiveInt(env.AI_BFF_HISTORY_MAX_ENTRIES, DEFAULT_MAX_ENTRIES),
    maxEntryChars: positiveInt(env.AI_BFF_HISTORY_MAX_ENTRY_CHARS, DEFAULT_MAX_ENTRY_CHARS),
    toolResultBudget: positiveInt(env.AI_BFF_HISTORY_TOOL_RESULT_BUDGET, DEFAULT_TOOL_RESULT_BUDGET),
  };
}

/** A store with a sliding TTL, an LRU entry cap and a per-entry size guard. A TTL of 0 disables it. */
export function createHistoryStore({
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxEntryChars = DEFAULT_MAX_ENTRY_CHARS,
  now = Date.now,
} = {}) {
  const entries = new Map(); // insertion order == least recently used first

  function sweep() {
    const t = now();
    for (const [key, entry] of entries) if (entry.expiresAt <= t) entries.delete(key);
  }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      entry.expiresAt = now() + ttlMs;
      entries.delete(key);
      entries.set(key, entry);
      return entry;
    },
    /** Returns false (and drops any previous entry) when the value was not stored. */
    set(key, value) {
      entries.delete(key);
      if (ttlMs <= 0 || maxEntries <= 0) return false;
      if (JSON.stringify(value.messages).length > maxEntryChars) return false;
      sweep();
      entries.set(key, { ...value, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return true;
    },
    delete(key) { entries.delete(key); },
    get size() { return entries.size; },
  };
}

const digest = text => createHash('sha1').update(text).digest('hex');
const normalize = text => text.replace(/\s+/g, ' ').trim();

function uiText(message) {
  if (Array.isArray(message?.parts)) {
    return message.parts.filter(p => p?.type === 'text').map(p => p.text ?? '').join('');
  }
  return typeof message?.content === 'string' ? message.content : '';
}

/** Order-preserving fingerprints of client UIMessages: role + normalized text (ids are not stable). */
export function fingerprintUiMessages(messages = []) {
  return messages.map(m => `${m?.role}:${digest(normalize(uiText(m)))}`);
}

/** Fingerprint of the single assistant UIMessage the client builds from a turn's response messages. */
export function fingerprintResponse(responseMessages = []) {
  const assistant = responseMessages.filter(m => m?.role === 'assistant');
  if (assistant.length === 0) return undefined;
  const text = assistant.map(m => (typeof m.content === 'string'
    ? m.content
    : (m.content || []).filter(p => p?.type === 'text').map(p => p.text ?? '').join(''))).join('');
  return `assistant:${digest(normalize(text))}`;
}

/**
 * Decide whether the cached history may stand in for the client's prior turns.
 * Hit only if the incoming messages are exactly the cached prefix followed by
 * one or more new user messages. Anything else (edit, regenerate, retry,
 * different count) is ignored, so the cache can never override the client.
 */
export function resolveHistory(entry, uiMessages = []) {
  if (!entry) return { hit: false, reason: 'miss' };
  const prefix = entry.fingerprints;
  if (uiMessages.length <= prefix.length) return { hit: false, reason: 'no-new-message' };
  const incoming = fingerprintUiMessages(uiMessages);
  for (let i = 0; i < prefix.length; i++) {
    if (incoming[i] !== prefix[i]) return { hit: false, reason: 'diverged' };
  }
  const trailing = uiMessages.slice(prefix.length);
  if (!trailing.every(m => m?.role === 'user')) return { hit: false, reason: 'trailing-not-user' };
  return { hit: true, reason: 'hit', trailing };
}

/**
 * Replace the payload of OLD tool results larger than `budget` chars with a
 * short marker. Only the results before the last user message are touched, so
 * the most recent turn stays intact; the tool-result part itself (toolCallId,
 * toolName) is always kept, so a call is never separated from its result.
 */
export function elideOldToolResults(messages, budget = DEFAULT_TOOL_RESULT_BUDGET) {
  let lastUser = -1;
  messages.forEach((m, i) => { if (m?.role === 'user') lastUser = i; });
  return messages.map((message, index) => {
    if (index >= lastUser || message?.role !== 'tool' || !Array.isArray(message.content)) return message;
    let changed = false;
    const content = message.content.map(part => {
      if (part?.type !== 'tool-result') return part;
      const size = JSON.stringify(part.output ?? null).length;
      if (size <= budget) return part;
      changed = true;
      return { ...part, output: { type: 'text', value: `[elided ${size} chars]` } };
    });
    return changed ? { ...message, content } : message;
  });
}
