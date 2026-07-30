import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAnchorDropdownRight } from '../dropdownAnchor.js';

// shouldAnchorDropdownRight reads `window.innerWidth` directly — Node's test
// runner has no browser globals, so stub the minimal shape it needs and
// restore whatever was there afterwards (there shouldn't be anything, but
// this keeps the test hermetic if the file is ever run alongside jsdom-based
// suites in the same process).
let previousWindow;

before(() => {
  previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 1000 };
});

after(() => {
  globalThis.window = previousWindow;
});

function makeButtons(scrollWidths) {
  const buttons = scrollWidths.map((scrollWidth) => ({ scrollWidth }));
  buttons.forEach = Array.prototype.forEach.bind(buttons);
  return buttons;
}

function makeRoot({ left = 0, right = 100, width = 100 } = {}) {
  return { getBoundingClientRect: () => ({ left, right, width }) };
}

function makeDropdown(scrollWidths) {
  return { querySelectorAll: () => makeButtons(scrollWidths) };
}

describe('shouldAnchorDropdownRight', () => {
  it('anchors left (returns false) when there is plenty of space on the right', () => {
    // window.innerWidth=1000, root at left=50 -> spaceRight = 1000-50-12 = 938
    const root = makeRoot({ left: 50, right: 150, width: 100 });
    const dropdown = makeDropdown([120]); // naturalWidth stays <= root width (100) or slightly above
    assert.equal(shouldAnchorDropdownRight(root, dropdown), false);
  });

  it('flips to the right when content overflows right AND left has more room', () => {
    // Place root near the right edge of a narrow viewport so spaceRight is tiny,
    // while spaceLeft (rect.right - 12) is comparatively large.
    globalThis.window = { innerWidth: 200 };
    const root = makeRoot({ left: 180, right: 190, width: 10 });
    // spaceRight = 200-180-12 = 8; spaceLeft = 190-12 = 178
    const dropdown = makeDropdown([50]); // naturalWidth=50 > spaceRight(8) -> overflowsRight=true
    assert.equal(shouldAnchorDropdownRight(root, dropdown), true);
    globalThis.window = { innerWidth: 1000 };
  });

  it('does not flip when it overflows on both sides equally (spaceLeft <= spaceRight)', () => {
    globalThis.window = { innerWidth: 200 };
    // Symmetric placement: spaceRight and spaceLeft end up equal, so the
    // `spaceLeft > spaceRight` half of the AND must be false.
    const root = makeRoot({ left: 90, right: 110, width: 20 });
    // spaceRight = 200-90-12 = 98; spaceLeft = 110-12 = 98
    const dropdown = makeDropdown([150]); // overflows both sides
    assert.equal(shouldAnchorDropdownRight(root, dropdown), false);
    globalThis.window = { innerWidth: 1000 };
  });

  it('uses the widest button scrollWidth, not just the first one', () => {
    globalThis.window = { innerWidth: 200 };
    const root = makeRoot({ left: 180, right: 190, width: 10 });
    // First button is small (never updates naturalWidth), second is the widest.
    const dropdown = makeDropdown([5, 90, 20]);
    assert.equal(shouldAnchorDropdownRight(root, dropdown), true);
    globalThis.window = { innerWidth: 1000 };
  });

  it('falls back to the trigger rect width when there are no buttons', () => {
    const root = makeRoot({ left: 10, right: 60, width: 50 });
    const dropdown = makeDropdown([]);
    // naturalWidth stays at rect.width (50); spaceRight = 1000-10-12 = 978 -> no overflow
    assert.equal(shouldAnchorDropdownRight(root, dropdown), false);
  });
});
