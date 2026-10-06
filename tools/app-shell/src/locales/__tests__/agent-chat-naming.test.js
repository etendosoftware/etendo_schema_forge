import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The agent chat is branded "Etendo AI" (not the retired "Etendo Go" codename) and
 * calls itself an "agent", not an "assistant".
 */
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');
const locale = name => JSON.parse(read(`../${name}.json`)).genericLabels;

describe('agent chat naming', () => {
  it('the chat title is "Etendo AI"', () => {
    const source = read('../../components/CopilotContext.jsx');
    assert.match(source, /name: 'Etendo AI'/);
    assert.doesNotMatch(source, /Etendo Go AI/);
  });

  it('copilotWelcome says agent/agente in every locale', () => {
    assert.match(locale('en_US').copilotWelcome, /\bagent\b/);
    assert.doesNotMatch(locale('en_US').copilotWelcome, /assistant/i);
    for (const name of ['es_ES', 'es_AR']) {
      assert.match(locale(name).copilotWelcome, /\bagente\b/);
      assert.doesNotMatch(locale(name).copilotWelcome, /asistente/i);
    }
  });
});
