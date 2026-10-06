import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createHistoryStore, elideOldToolResults, fingerprintResponse, fingerprintUiMessages,
  historyConfigFromEnv, resolveHistory,
} from '../src/historyCache.js';

const ui = (role, text, id = `${role}-${text}`) => ({ id, role, parts: [{ type: 'text', text }] });
const assistantResponse = text => [{ role: 'assistant', content: [{ type: 'text', text }] }];

function warmEntry(uiMessages, reply) {
  return {
    fingerprints: [...fingerprintUiMessages(uiMessages), fingerprintResponse(assistantResponse(reply))],
    messages: [],
  };
}

test('hit: cached prefix plus new trailing user messages', () => {
  const first = [ui('user', 'hola')];
  const entry = warmEntry(first, 'buenas');
  const plan = resolveHistory(entry, [...first, ui('assistant', 'buenas', 'other-id'), ui('user', 'y ahora?')]);
  assert.equal(plan.hit, true);
  assert.deepEqual(plan.trailing.map(m => m.role), ['user']);
});

test('miss: no entry falls back to the client messages', () => {
  assert.deepEqual(resolveHistory(undefined, [ui('user', 'hola')]), { hit: false, reason: 'miss' });
});

test('regenerate, edit and retry are ignored', () => {
  const first = [ui('user', 'hola')];
  const entry = warmEntry(first, 'buenas');
  // regenerate: the assistant reply was dropped, same length as the prefix's user part
  assert.equal(resolveHistory(entry, first).reason, 'no-new-message');
  // edited earlier user text
  assert.equal(resolveHistory(entry, [ui('user', 'HOLA!'), ui('assistant', 'buenas'), ui('user', 'x')]).reason, 'diverged');
  // the assistant reply the client holds differs from what the server produced
  assert.equal(resolveHistory(entry, [...first, ui('assistant', 'otra cosa'), ui('user', 'x')]).reason, 'diverged');
  // trailing message is not a user message
  assert.equal(resolveHistory(entry, [...first, ui('assistant', 'buenas'), ui('assistant', 'extra')]).reason, 'trailing-not-user');
});

test('whitespace differences in the assistant text do not defeat the cache', () => {
  const first = [ui('user', 'hola')];
  const entry = warmEntry(first, 'linea 1\nlinea 2 ');
  assert.equal(resolveHistory(entry, [...first, ui('assistant', 'linea 1 linea 2'), ui('user', 'x')]).hit, true);
});

test('sliding TTL with an injected clock', () => {
  let t = 0;
  const store = createHistoryStore({ ttlMs: 1000, now: () => t });
  store.set('s', { messages: [], fingerprints: [] });
  t = 900;
  assert.ok(store.get('s')); // touching slides the window
  t = 1800;
  assert.ok(store.get('s'));
  t = 2801;
  assert.equal(store.get('s'), undefined);
  assert.equal(store.size, 0);
});

test('TTL 0 disables the store', () => {
  const store = createHistoryStore({ ttlMs: 0 });
  assert.equal(store.set('s', { messages: [], fingerprints: [] }), false);
  assert.equal(store.get('s'), undefined);
});

test('LRU cap evicts the least recently used entry', () => {
  const store = createHistoryStore({ maxEntries: 2 });
  store.set('a', { messages: [], fingerprints: [] });
  store.set('b', { messages: [], fingerprints: [] });
  store.get('a'); // a is now most recent
  store.set('c', { messages: [], fingerprints: [] });
  assert.ok(store.get('a'));
  assert.equal(store.get('b'), undefined);
  assert.ok(store.get('c'));
});

test('an oversized entry is not stored and drops the stale one', () => {
  const store = createHistoryStore({ maxEntryChars: 100 });
  store.set('s', { messages: [{ role: 'user', content: 'ok' }], fingerprints: [] });
  assert.ok(store.get('s'));
  assert.equal(store.set('s', { messages: [{ role: 'user', content: 'x'.repeat(500) }], fingerprints: [] }), false);
  assert.equal(store.get('s'), undefined);
});

const call = id => ({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName: 'neo_discover', input: {} }] });
const result = (id, size) => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: id, toolName: 'neo_discover', output: { type: 'json', value: { blob: 'x'.repeat(size) } } }],
});

test('elision shrinks old big results, keeps the latest turn and every call/result pair', () => {
  const history = [
    { role: 'user', content: 'q1' }, call('c1'), result('c1', 9000), { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'q2' }, call('c2'), result('c2', 9000), { role: 'assistant', content: 'a2' },
  ];
  const out = elideOldToolResults(history, 1000);
  assert.match(out[2].content[0].output.value, /^\[elided \d+ chars\]$/);
  assert.equal(out[2].content[0].toolCallId, 'c1');
  assert.equal(out[2].content[0].toolName, 'neo_discover');
  assert.equal(out[6], history[6], 'latest turn result untouched');
  const calls = out.flatMap(m => m.role === 'assistant' && Array.isArray(m.content) ? m.content.filter(p => p.type === 'tool-call') : []);
  const results = out.flatMap(m => m.role === 'tool' ? m.content : []);
  assert.deepEqual(calls.map(c => c.toolCallId), results.map(r => r.toolCallId));
  assert.equal(history[2].content[0].output.type, 'json', 'input not mutated');
});

test('elision leaves small old results alone', () => {
  const history = [{ role: 'user', content: 'q1' }, call('c1'), result('c1', 10), { role: 'user', content: 'q2' }];
  assert.equal(elideOldToolResults(history, 1000)[2], history[2]);
});

test('env config falls back to safe defaults', () => {
  const cfg = historyConfigFromEnv({});
  assert.equal(cfg.ttlMs, 3600000);
  assert.ok(cfg.maxEntries > 0 && cfg.toolResultBudget > 0);
  assert.equal(historyConfigFromEnv({ AI_BFF_HISTORY_TTL_MS: 'nope' }).ttlMs, 3600000);
  assert.equal(historyConfigFromEnv({ AI_BFF_HISTORY_TTL_MS: '5000' }).ttlMs, 5000);
});

test('page-help never reads or writes the store, and chat traces the cache decision', () => {
  const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(source, /const cacheKey = !isPageHelpRequest &&/);
  assert.match(source, /trace\('history'/);
  assert.match(source, /if \(!key\) return;/);
});
