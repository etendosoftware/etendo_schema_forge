import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSystemPrompt } from '../src/systemPrompt.js';

function withEnv(value, fn) {
  const previous = process.env.AI_BFF_SYSTEM_PROMPT_FILE;
  if (value === undefined) delete process.env.AI_BFF_SYSTEM_PROMPT_FILE;
  else process.env.AI_BFF_SYSTEM_PROMPT_FILE = value;
  try { return fn(); } finally {
    if (previous === undefined) delete process.env.AI_BFF_SYSTEM_PROMPT_FILE;
    else process.env.AI_BFF_SYSTEM_PROMPT_FILE = previous;
  }
}

test('default prompt is non-empty and differs per mode', () => withEnv(undefined, () => {
  const chat = buildSystemPrompt({ mode: 'chat' });
  const help = buildSystemPrompt({ mode: 'page-help' });
  assert.ok(chat.length > 0);
  assert.ok(help.length > 0);
  assert.notEqual(chat, help);
  assert.match(chat, /neo_discover/);
  assert.match(chat, /neo_schema/);
  assert.doesNotMatch(help, /neo_discover/);
  assert.equal(buildSystemPrompt(), chat);
}));

test('AI_BFF_SYSTEM_PROMPT_FILE replaces the default', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'bff-prompt-')), 'p.md');
  writeFileSync(file, '  custom prompt \n');
  withEnv(file, () => {
    assert.equal(buildSystemPrompt({ mode: 'chat' }), 'custom prompt');
    assert.equal(buildSystemPrompt({ mode: 'page-help' }), 'custom prompt');
  });
});

test('unreadable or empty override falls back to the default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bff-prompt-'));
  const empty = join(dir, 'empty.md');
  writeFileSync(empty, '   \n');
  const base = withEnv(undefined, () => buildSystemPrompt({ mode: 'chat' }));
  withEnv(join(dir, 'missing.md'), () => assert.equal(buildSystemPrompt({ mode: 'chat' }), base));
  withEnv(empty, () => assert.equal(buildSystemPrompt({ mode: 'chat' }), base));
});

test('the chat handler passes the server prompt and never reads body.system', () => {
  const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(source, /system:\s*buildSystemPrompt\(/);
  assert.doesNotMatch(source, /body\.system/);
});

test('chat prompt is grounded on the docs tool and uses the current product name', () => withEnv(undefined, () => {
  const chat = buildSystemPrompt({ mode: 'chat' });
  assert.match(chat, /`docs`/);
  assert.match(chat, /Etendo Classic/);
  for (const mode of ['chat', 'page-help']) {
    const prompt = buildSystemPrompt({ mode });
    assert.doesNotMatch(prompt, /Etendo GO/i);
    assert.doesNotMatch(prompt, /assistant/i);
  }
  const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const toolText = source.slice(source.indexOf('export function browserTools'), source.indexOf('function trace'));
  assert.doesNotMatch(toolText, /Etendo Go|assistant/i);
}));

test('chat prompt targets end users, points only to functional docs and reports via neo_feedback', () => withEnv(undefined, () => {
  const chat = buildSystemPrompt({ mode: 'chat' });
  const help = buildSystemPrompt({ mode: 'page-help' });
  const docsUrl = 'https://etendosoftware.github.io/etendo-docs/';
  assert.ok(chat.includes(docsUrl));
  assert.ok(help.includes(docsUrl));
  assert.match(chat, /end user/i);
  assert.match(chat, /Etendo support/);
  assert.match(chat, /neo_feedback/);
  assert.match(chat, /outcome/);
  assert.match(chat, /never in a loop/i);
  assert.match(chat, /Never send the user to technical or developer documentation/);
  assert.match(help, /Never point to technical or developer documentation/);
  // No URL other than the functional docs may appear in either prompt.
  for (const prompt of [chat, help]) {
    const urls = prompt.match(/https?:\/\/[^\s)]+/g) || [];
    assert.ok(urls.every((u) => u.startsWith(docsUrl)), `unexpected URL: ${urls}`);
    assert.doesNotMatch(prompt, /docs\.etendo\.software|wiki\.etendo|Etendo GO/i);
  }
  assert.doesNotMatch(help, /neo_feedback/);
}));
