// Source-reading tests for ETP-5456 (sticky-layout follow-up) on
// FmModel303Page.jsx's CasillasTab: the left section-nav sidebar must be
// `position: sticky` docked at `top: 49` (directly under `.fm-tabs-sticky`),
// its parent flex row must set `alignItems: 'flex-start'` (otherwise the
// default `stretch` defeats sticky by making the sidebar as tall as its
// scrollable sibling), and no ancestor between it and `.fm-page` may
// reintroduce `overflow`/`transform`/`filter`/`contain` — the exact
// regression class the user hit during manual testing (redundant nested
// `overflow: auto` wrappers). jsdom does not compute real sticky geometry, so
// this stays a source-level assertion, following the pattern in
// FmModel303Page.test.js / FmCommon.test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmModel303Page.jsx'), 'utf8');

// Isolate the CasillasTab function body so assertions can't accidentally
// match unrelated code elsewhere in this (large) file.
function extractFunctionBody(source, functionSignaturePattern) {
  const match = source.match(functionSignaturePattern);
  assert.ok(match, `function matching ${functionSignaturePattern} not found`);
  const startIdx = match.index;
  // The signature's own parameter list is itself a destructuring pattern
  // (`({ decl, ... })`), which contains braces — skip past the matching
  // closing paren of the parameter list first, THEN find the function
  // body's opening brace, so brace-balancing below starts at the right spot.
  const parenOpenIdx = source.indexOf('(', startIdx);
  assert.ok(parenOpenIdx !== -1, 'no opening paren found for CasillasTab params');
  let parenDepth = 0;
  let parenCloseIdx = parenOpenIdx;
  for (; parenCloseIdx < source.length; parenCloseIdx++) {
    if (source[parenCloseIdx] === '(') parenDepth++;
    else if (source[parenCloseIdx] === ')') {
      parenDepth--;
      if (parenDepth === 0) break;
    }
  }
  assert.ok(parenDepth === 0, 'unbalanced parens while scanning CasillasTab signature');

  const openIdx = source.indexOf('{', parenCloseIdx);
  assert.ok(openIdx !== -1, 'no opening brace found for CasillasTab body');
  let depth = 0;
  let i = openIdx;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  assert.ok(depth === 0, 'unbalanced braces while scanning CasillasTab');
  return source.slice(startIdx, i + 1);
}

const casillasTab = extractFunctionBody(src, /function CasillasTab\(/);

describe('FmModel303Page — CasillasTab sticky nav sidebar (ETP-5456)', () => {
  it('the nav sidebar is position: sticky at top: 49 (docks under .fm-tabs-sticky)', () => {
    assert.match(casillasTab, /position:\s*'sticky'/);
    assert.match(casillasTab, /top:\s*49\b/);
  });

  it("the sidebar's parent flex row sets alignItems: 'flex-start' (stretch would defeat sticky)", () => {
    assert.match(casillasTab, /alignItems:\s*'flex-start'/);
  });

  it('no wrapper inside CasillasTab sets overflow (would break sticky by becoming the scroll ancestor)', () => {
    assert.doesNotMatch(casillasTab, /overflow:\s*'auto'/);
    assert.doesNotMatch(casillasTab, /overflowY:\s*'auto'/);
    assert.doesNotMatch(casillasTab, /overflowX:\s*'auto'/);
  });

  it('no wrapper inside CasillasTab sets transform, filter or contain (all break position: sticky)', () => {
    assert.doesNotMatch(casillasTab, /transform:/);
    assert.doesNotMatch(casillasTab, /filter:/);
    assert.doesNotMatch(casillasTab, /contain:/);
  });

  it('sticky sits on the width:200 nav sidebar wrapper, not the outer content-flow wrapper', () => {
    // Guards against the sticky style drifting onto the wrong element on a future edit.
    const stickyIdx = casillasTab.indexOf("position: 'sticky'");
    const widthIdx = casillasTab.indexOf('width: 200');
    assert.ok(stickyIdx !== -1 && widthIdx !== -1);
    // Both declarations belong to the same style object — the width declaration
    // must appear before the sticky declaration within a short window (same object).
    assert.ok(stickyIdx - widthIdx > 0 && stickyIdx - widthIdx < 200,
      'position: sticky is not co-located with the width:200 sidebar style object');
  });
});
