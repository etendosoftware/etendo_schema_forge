// @covers tools/app-shell/src/components/contract-ui/selectorSelection.js
/**
 * Unit tests for the committed-value helpers shared by the paged selectors (ETP-5846, ETP-5903).
 *
 * Pure logic (no React) — Node test runner, per the repo's test-type table.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCATE_SELECTION_MAX_PAGES, resolveSelectedIndex, prependCurrentSelection, nextActiveIndex, arrowStartIndexFor,
  hasCommittedValue,
  shouldKeepLocating, centerOptionInPanel, committedItemFromRow, pinSearchTerms,
} from '../selectorSelection.js';

const ROWS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

test('hasCommittedValue treats null, undefined and empty as no value, 0 as a value', () => {
  assert.equal(hasCommittedValue(null), false);
  assert.equal(hasCommittedValue(undefined), false);
  assert.equal(hasCommittedValue(''), false);
  assert.equal(hasCommittedValue(0), true);
  assert.equal(hasCommittedValue('A1'), true);
});

test('resolveSelectedIndex matches ids as strings and returns -1 without a value', () => {
  assert.equal(resolveSelectedIndex([{ id: 1 }, { id: 2 }], '2'), 1);
  assert.equal(resolveSelectedIndex(ROWS, 'z'), -1);
  assert.equal(resolveSelectedIndex(ROWS, ''), -1);
  assert.equal(resolveSelectedIndex(ROWS, null), -1);
});

test('prependCurrentSelection pins only a value absent from the rows, never twice', () => {
  assert.deepEqual(prependCurrentSelection(ROWS, [{ id: 'z' }], 'z').map(r => r.id), ['z', 'a', 'b', 'c', 'd']);
  assert.equal(prependCurrentSelection(ROWS, [{ id: 'b' }], 'b'), ROWS);
  assert.equal(prependCurrentSelection(ROWS, [], 'z'), ROWS);
});

test('nextActiveIndex starts from the committed row when nothing is highlighted', () => {
  assert.equal(nextActiveIndex(-1, 2, 1, 4), 3);
  assert.equal(nextActiveIndex(-1, 2, -1, 4), 1);
});

test('nextActiveIndex starts from the top when there is no committed row, as before', () => {
  assert.equal(nextActiveIndex(-1, -1, 1, 4), 0);
  assert.equal(nextActiveIndex(-1, -1, -1, 4), 0);
});

test('nextActiveIndex moves from the highlight once there is one, clamped to the list', () => {
  assert.equal(nextActiveIndex(1, 3, 1, 4), 2);
  assert.equal(nextActiveIndex(3, 0, 1, 4), 3);
  assert.equal(nextActiveIndex(0, 3, -1, 4), 0);
  assert.equal(nextActiveIndex(-1, 3, 1, 4), 3);
});

test('arrowStartIndexFor starts from the committed row only while no search is typed', () => {
  assert.equal(arrowStartIndexFor('', 3), 3);
  assert.equal(arrowStartIndexFor('  ', 3), 3);
  assert.equal(arrowStartIndexFor('iva', 3), -1);
});

test('shouldKeepLocating stops when found, at the end of the list, on user interaction or at the cap', () => {
  const base = { found: false, hasMore: true, loadedRows: 50, pageSize: 50, interacted: false };
  assert.equal(shouldKeepLocating(base), true);
  assert.equal(shouldKeepLocating({ ...base, found: true }), false);
  assert.equal(shouldKeepLocating({ ...base, hasMore: false }), false);
  assert.equal(shouldKeepLocating({ ...base, interacted: true }), false);
  assert.equal(shouldKeepLocating({ ...base, loadedRows: (LOCATE_SELECTION_MAX_PAGES - 1) * 50 }), true);
  assert.equal(shouldKeepLocating({ ...base, loadedRows: LOCATE_SELECTION_MAX_PAGES * 50 }), false);
});

function fakeBox(top, height, extra = {}) {
  return { getBoundingClientRect: () => ({ top, height }), ...extra };
}

test('centerOptionInPanel scrolls the panel so the option sits in its middle', () => {
  // Panel at y=100, 200px tall, not scrolled; option 30px tall, 600px down the content.
  const panel = fakeBox(100, 200, { scrollTop: 0, clientHeight: 200 });
  centerOptionInPanel(panel, fakeBox(700, 30));
  assert.equal(panel.scrollTop, 600 - (200 - 30) / 2);
});

test('centerOptionInPanel accounts for the current scroll and never goes negative', () => {
  const panel = fakeBox(100, 200, { scrollTop: 400, clientHeight: 200 });
  // Option currently rendered 200px below the panel top -> 600px into the content.
  centerOptionInPanel(panel, fakeBox(300, 30));
  assert.equal(panel.scrollTop, 515);

  const top = fakeBox(100, 200, { scrollTop: 0, clientHeight: 200 });
  centerOptionInPanel(top, fakeBox(110, 30));
  assert.equal(top.scrollTop, 0);
});

test('centerOptionInPanel reports whether the option could be centred', () => {
  // 1000px of content: an option 600px down fits, one 950px down is clamped at the bottom.
  const panel = () => fakeBox(100, 200, { scrollTop: 0, clientHeight: 200, scrollHeight: 1000 });
  assert.equal(centerOptionInPanel(panel(), fakeBox(700, 30)), true);
  const clamped = panel();
  assert.equal(centerOptionInPanel(clamped, fakeBox(1050, 30)), false);
  assert.equal(clamped.scrollTop, 950 - 85);
});

test('centerOptionInPanel is a no-op without a panel or an option', () => {
  assert.doesNotThrow(() => centerOptionInPanel(null, fakeBox(0, 10)));
  assert.doesNotThrow(() => centerOptionInPanel(fakeBox(0, 10), null));
});

// ETP-5948 — the reverse of onSelectMappings: the stock drawer recognises its committed row by the
// locator the selection mapped onto the line.
test('committedItemFromRow writes each mapped target back at its source path', () => {
  const field = { onSelectMappings: [
    { from: '_aux._LOC', to: 'storageBin' },
    { from: 'uOM', to: 'uom' },
    { value: '0', to: 'movementQuantity' },
  ] };
  const row = { storageBin: 'LOC-1', uom: 'EA', movementQuantity: 5 };
  assert.deepEqual(committedItemFromRow(field, row, 'P1'), { id: 'P1', _aux: { _LOC: 'LOC-1' }, uOM: 'EA' });
});

test('committedItemFromRow skips empty targets and works without mappings', () => {
  const field = { onSelectMappings: [{ from: '_aux._LOC', to: 'storageBin' }] };
  assert.deepEqual(committedItemFromRow(field, { storageBin: null }, 'P1'), { id: 'P1' });
  assert.deepEqual(committedItemFromRow({}, {}, 'P1'), { id: 'P1' });
});

test('committedItemFromRow is null without a committed value', () => {
  assert.equal(committedItemFromRow({ onSelectMappings: [] }, {}, ''), null);
  assert.equal(committedItemFromRow({ onSelectMappings: [] }, {}, null), null);
});

test('pinSearchTerms tries the full label, then the segment before the first " - "', () => {
  assert.deepEqual(pinSearchTerms('60000000 - Compras de mercaderías'), ['60000000 - Compras de mercaderías', '60000000']);
  assert.deepEqual(pinSearchTerms('A - B - C'), ['A - B - C', 'A']);
  assert.deepEqual(pinSearchTerms('TestProduct'), ['TestProduct']);
  assert.deepEqual(pinSearchTerms(''), []);
  assert.deepEqual(pinSearchTerms(null), []);
});
