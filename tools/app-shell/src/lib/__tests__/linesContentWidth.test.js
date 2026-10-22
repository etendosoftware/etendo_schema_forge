// @covers tools/app-shell/src/lib/linesContentWidth.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNoTruncateColumn, contentWidthPx, withContentWidths, NO_TRUNCATE_CELL_CHROME_PX,
} from '../linesContentWidth.js';

// Node has no OffscreenCanvas, so measureTextPx takes the deterministic 8px/char cell estimate.
const CHAR_PX = 8;
const LOOKUP = { key: 'product', type: 'selector', lookup: true };

describe('linesContentWidth', () => {
  describe('isNoTruncateColumn', () => {
    it('defaults a lookup selector to no-truncate', () => {
      assert.equal(isNoTruncateColumn(LOOKUP), true);
    });

    it('lets an explicit noTruncate win either way', () => {
      assert.equal(isNoTruncateColumn({ ...LOOKUP, noTruncate: false }), false);
      assert.equal(isNoTruncateColumn({ key: 'd', type: 'string', noTruncate: true }), true);
    });

    it('keeps every other column truncating', () => {
      assert.equal(isNoTruncateColumn({ key: 'd', type: 'string' }), false);
      assert.equal(isNoTruncateColumn({ key: 'w', type: 'selector' }), false);
      assert.equal(isNoTruncateColumn({ key: 'w', type: 'search', lookup: true }), false);
      assert.equal(isNoTruncateColumn(undefined), false);
    });
  });

  describe('contentWidthPx', () => {
    it('measures the widest resolved identifier plus the cell chrome', () => {
      const rows = [
        { product: 'P1', 'product$_identifier': 'Short' },
        { product: 'P2', 'product$_identifier': 'A much longer product name' },
      ];
      assert.equal(contentWidthPx(LOOKUP, rows), 26 * CHAR_PX + NO_TRUNCATE_CELL_CHROME_PX);
    });

    it('is 0 with no rows or only empty values', () => {
      assert.equal(contentWidthPx(LOOKUP, []), 0);
      assert.equal(contentWidthPx(LOOKUP, undefined), 0);
      assert.equal(contentWidthPx(LOOKUP, [{ product: '' }]), 0);
    });
  });

  describe('withContentWidths', () => {
    it('sets contentWidthPx on the no-truncate column only', () => {
      const description = { key: 'description', type: 'string' };
      const rows = [{ product: 'P1', 'product$_identifier': 'Monitor 24 Full HD', description: 'x'.repeat(80) }];
      const [product, desc] = withContentWidths([LOOKUP, description], rows);
      assert.equal(product.contentWidthPx, 18 * CHAR_PX + NO_TRUNCATE_CELL_CHROME_PX);
      assert.equal(desc, description);
    });

    it('returns the same array when nothing changes (stable memo input)', () => {
      const columns = [{ key: 'description', type: 'string' }, LOOKUP];
      assert.equal(withContentWidths(columns, []), columns);
    });
  });
});
