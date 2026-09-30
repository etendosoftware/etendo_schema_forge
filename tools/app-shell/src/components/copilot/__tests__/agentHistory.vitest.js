import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_TITLE_MAX,
  conversationTitle,
  hasPendingTool,
  toUiMessages,
  unsavedMessages,
  uiMessageText,
} from '../agentHistory.js';

const text = (t) => ({ type: 'text', text: t });

describe('uiMessageText', () => {
  it('joins text parts and ignores tool parts', () => {
    const message = { parts: [text('a'), { type: 'tool-neo_list', input: { secret: 1 }, output: 'big' }, text('b')] };
    expect(uiMessageText(message)).toBe('ab');
  });
});

describe('conversationTitle', () => {
  it('collapses whitespace and keeps short text as is', () => {
    expect(conversationTitle('  hola\n  mundo ')).toBe('hola mundo');
  });
  it('truncates long text to the title limit with an ellipsis', () => {
    const title = conversationTitle('x'.repeat(200));
    expect(title.length).toBe(CONVERSATION_TITLE_MAX);
    expect(title.endsWith('…')).toBe(true);
  });
  it('is empty for empty input', () => {
    expect(conversationTitle(undefined)).toBe('');
  });
});

describe('unsavedMessages', () => {
  const messages = [
    { id: 'u1', role: 'user', parts: [text('hi')] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'tool-neo_list', state: 'output-available' }] },
    { id: 'a2', role: 'assistant', parts: [text('answer')] },
    { id: 's1', role: 'system', parts: [text('ignored')] },
  ];
  it('returns text messages in order with their id as external_id, skipping tool-only and other roles', () => {
    expect(unsavedMessages(messages, new Set())).toEqual([
      { id: 'u1', role: 'user', text: 'hi', external_id: 'u1' },
      { id: 'a2', role: 'assistant', text: 'answer', external_id: 'a2' },
    ]);
  });
  it('leaves out messages already saved', () => {
    expect(unsavedMessages(messages, new Set(['u1'])).map(m => m.id)).toEqual(['a2']);
  });
});

describe('hasPendingTool', () => {
  it('is true while a tool part has no result', () => {
    expect(hasPendingTool({ parts: [{ type: 'tool-navigate_to', state: 'input-available' }] })).toBe(true);
  });
  it('is false once every tool part is resolved', () => {
    expect(hasPendingTool({ parts: [{ type: 'tool-navigate_to', state: 'output-available' }, text('ok')] })).toBe(false);
  });
});

describe('toUiMessages', () => {
  it('maps backend roles case-insensitively and drops error/system/empty rows', () => {
    const stored = [
      { id: 'm1', role: 'USER', text: 'q' },
      { id: 'm2', role: 'ASSISTANT', text: 'a' },
      { id: 'm3', role: 'copilot', content: 'b' },
      { id: 'm4', role: 'ERROR', text: 'boom' },
      { id: 'm5', role: 'SYSTEM', text: 'sys' },
      { id: 'm6', role: 'USER', text: '' },
    ];
    expect(toUiMessages(stored)).toEqual([
      { id: 'm1', role: 'user', parts: [text('q')] },
      { id: 'm2', role: 'assistant', parts: [text('a')] },
      { id: 'm3', role: 'assistant', parts: [text('b')] },
    ]);
  });
});
