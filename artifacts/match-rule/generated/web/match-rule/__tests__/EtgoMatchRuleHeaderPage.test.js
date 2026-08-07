/**
 * Match Rule — EtgoMatchRuleHeaderPage.jsx structural tests.
 *
 * This page's window-access wiring is the pattern TransactionTypePage's own test
 * later cited as "already proven" (see the docblock there), but this file was
 * never actually written — same generator, same wiring, just missing coverage.
 * Locks in the useWindowAccess/WindowAccessGuard wiring so a future regen can't
 * silently drop it, plus the list-modal-specific shape (columns/fields/config/api)
 * this layoutType emits that TransactionTypePage's plain header page does not.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(__dirname, '..', 'EtgoMatchRuleHeaderPage.jsx'), 'utf8');

const WINDOW_ID = '24963D64E83B4543A7F6BD248CF944EE';

describe('EtgoMatchRuleHeaderPage — window access wiring', () => {
  it('imports useWindowAccess and WindowAccessGuard from AuthContext', () => {
    assert.match(
      src,
      /import\s*\{\s*useWindowAccess,\s*WindowAccessGuard\s*\}\s*from\s*'@\/auth\/AuthContext\.jsx'/
    );
  });

  it('calls useWindowAccess with the real match-rule window id', () => {
    assert.match(src, new RegExp(`useWindowAccess\\('${WINDOW_ID}'\\)`));
  });

  it('guards the "none" access tier by rendering WindowAccessGuard', () => {
    assert.match(src, /windowAccessTier === 'none'/);
    assert.match(src, new RegExp(`<WindowAccessGuard windowId="${WINDOW_ID}"\\s*/>`));
  });

  it('downgrades to read-only window state on the "read-only" access tier', () => {
    assert.match(src, /windowAccessTier === 'read-only'/);
    assert.match(src, /readOnly:\s*true/);
  });

  it('exports the default EtgoMatchRuleHeaderPage component and the api object', () => {
    assert.match(src, /export default function EtgoMatchRuleHeaderPage/);
    assert.match(src, /export const api = \{/);
  });

  it('declares the api.window.category as finance (matches decisions.json)', () => {
    assert.match(src, /"window":\s*\{\s*"category":\s*"finance"\s*\}/);
  });
});

describe('EtgoMatchRuleHeaderPage — list-modal shape', () => {
  it('renders through ListModalWindow, not a header/detail split', () => {
    assert.match(src, /import\s*\{\s*ListModalWindow\s*\}\s*from\s*'@\/components\/contract-ui'/);
    assert.match(src, /<ListModalWindow\b/);
  });

  it('binds the priority column to the inline-editable priorityPill renderer', () => {
    assert.match(src, /key:\s*'priority'.*?cellType:\s*'priorityPill'/);
  });

  it('binds the textCondition column to the conditionChip renderer with its kind/pattern fields', () => {
    // `.*?` (not `[^}]*`) because textCondition's own entry nests an `enumLabels: {...}`
    // object literal before cellType — a brace-excluding class would stop there.
    assert.match(src, /key:\s*'textCondition'.*?cellType:\s*'conditionChip'/);
    assert.match(src, /kindField:\s*'textCondition'/);
    assert.match(src, /patternField:\s*'textPattern'/);
  });

  it('forwards the entity name the api.crud block declares (etgoMatchRuleHeader)', () => {
    assert.match(src, /entity="etgoMatchRuleHeader"/);
    assert.match(src, /"etgoMatchRuleHeader":\s*\{/);
  });

  it('carries both es_ES and en_US labelOverrides for every AD column shown', () => {
    assert.match(src, /"labelOverrides":\s*\{/);
    assert.match(src, /"es_ES":\s*\{/);
    assert.match(src, /"en_US":\s*\{/);
  });
});
