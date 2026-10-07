// @covers tools/app-shell/src/windows/custom/fiscal-models/fiscal-models.css
// Source-reading test: the AEAT349 key badge colours (`.fm-key--{E,S,A,I}`) are grouped by
// operation type — sales/issued keys E and S use the information tokens, purchases/received keys
// A and I the warning tokens (key I used to be painted like the sales keys). jsdom does not
// resolve stylesheet colours, so the rule bodies are read as text, same pattern as
// fiscal-models.css.stickyLayout.test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Comments stripped so a selector mentioned in prose never counts as a rule.
const css = readFileSync(join(__dirname, '..', 'fiscal-models.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule body whose selector list contains `selector` as an exact entry.
function ruleBodiesFor(selector) {
  const bodies = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(css)) !== null) {
    const selectors = m[1].split(',').map(s => s.trim());
    if (selectors.includes(selector)) bodies.push(m[2]);
  }
  return bodies;
}

function assertTokens(selector, role) {
  const bodies = ruleBodiesFor(selector);
  assert.equal(bodies.length, 1, `${selector} must be declared by exactly one rule`);
  const body = bodies[0];
  assert.match(body, new RegExp(`background:\\s*var\\(--status-${role}-bg\\)`));
  assert.match(body, new RegExp(`border-color:\\s*var\\(--status-${role}-border\\)`));
  assert.match(body, new RegExp(`(^|[;\\s])color:\\s*var\\(--status-${role}-fg\\)`));
}

describe('fiscal-models.css — 349 key badge colours grouped by operation type', () => {
  for (const key of ['E', 'S']) {
    it(`.fm-key--${key} (sales/issued) uses the info tokens`, () => {
      assertTokens(`.fm-key--${key}`, 'info');
    });
  }

  for (const key of ['A', 'I']) {
    it(`.fm-key--${key} (purchases/received) uses the warning tokens`, () => {
      assertTokens(`.fm-key--${key}`, 'warning');
    });
  }

  it('no key badge rule mixes in the other group\'s tokens', () => {
    for (const key of ['E', 'S']) {
      assert.doesNotMatch(ruleBodiesFor(`.fm-key--${key}`)[0], /--status-warning-/);
    }
    for (const key of ['A', 'I']) {
      assert.doesNotMatch(ruleBodiesFor(`.fm-key--${key}`)[0], /--status-info-/);
    }
  });
});
