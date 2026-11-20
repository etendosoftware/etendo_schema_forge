// @covers tools/app-shell/src/lib/escapeHtml.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../escapeHtml.js';

describe('escapeHtml', () => {
  it('encodes the five HTML-significant characters', () => {
    assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
  it('does not double-decode encoded payloads', () => {
    assert.equal(escapeHtml('&lt;script&gt;'), '&amp;lt;script&amp;gt;');
  });
  it('keeps legitimate names readable', () => {
    assert.equal(escapeHtml("O'Brien"), 'O&#39;Brien');
  });
  it('maps null/undefined to empty and stringifies numbers', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(42), '42');
  });
});
