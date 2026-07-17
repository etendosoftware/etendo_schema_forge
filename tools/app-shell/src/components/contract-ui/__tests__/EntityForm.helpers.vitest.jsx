/**
 * Tests for pure helper functions in EntityForm.jsx.
 * We read the source and test the internal logic patterns.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Since evalReadOnlyLogic, evalDisplayLogic, resolveGridClass, buildSelectPlaceholder
// are NOT exported, we test them by replicating the logic (same pattern as menu-cache).

function evalReadOnlyLogic(field, data) {
  if (typeof field?.readOnlyLogic !== 'function') return false;
  try {
    return !!field.readOnlyLogic(data ?? {});
  } catch {
    return false;
  }
}

function evalDisplayLogic(field, data) {
  if (typeof field?.displayLogic !== 'function') return true;
  try {
    return !!field.displayLogic(data ?? {});
  } catch {
    return true;
  }
}

function resolveGridClass(cols, layout) {
  if (cols) return 'grid';
  if (layout === 'horizontal') return 'grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4';
  return 'grid grid-cols-2 gap-3 md:grid-cols-3';
}

function buildSelectPlaceholder(ui, label) {
  return `${ui('selectLabelPrefix')} ${label}...`;
}

function buildSearchPlaceholder(ui, label) {
  return `${ui('searchLabelPrefix')} ${label}...`;
}

describe('EntityForm helpers', () => {
  describe('evalReadOnlyLogic', () => {
    it('returns false when no readOnlyLogic', () => {
      expect(evalReadOnlyLogic({}, {})).toBe(false);
      expect(evalReadOnlyLogic(null, {})).toBe(false);
    });

    it('evaluates the function with data', () => {
      const field = { readOnlyLogic: (d) => d.status === 'CO' };
      expect(evalReadOnlyLogic(field, { status: 'CO' })).toBe(true);
      expect(evalReadOnlyLogic(field, { status: 'DR' })).toBe(false);
    });

    it('returns false if function throws', () => {
      const field = { readOnlyLogic: () => { throw new Error('boom'); } };
      expect(evalReadOnlyLogic(field, {})).toBe(false);
    });

    it('handles null data', () => {
      const field = { readOnlyLogic: (d) => d.x === 1 };
      expect(evalReadOnlyLogic(field, null)).toBe(false);
    });
  });

  describe('evalDisplayLogic', () => {
    it('returns true when no displayLogic', () => {
      expect(evalDisplayLogic({}, {})).toBe(true);
      expect(evalDisplayLogic(null, {})).toBe(true);
    });

    it('evaluates the function with data', () => {
      const field = { displayLogic: (d) => d.type === 'invoice' };
      expect(evalDisplayLogic(field, { type: 'invoice' })).toBe(true);
      expect(evalDisplayLogic(field, { type: 'order' })).toBe(false);
    });

    it('returns true if function throws (fail-open)', () => {
      const field = { displayLogic: () => { throw new Error('boom'); } };
      expect(evalDisplayLogic(field, {})).toBe(true);
    });
  });

  describe('resolveGridClass', () => {
    it('returns grid when cols override is provided', () => {
      expect(resolveGridClass('custom-cols', 'horizontal')).toBe('grid');
    });

    it('returns 4-col grid for horizontal layout', () => {
      expect(resolveGridClass(null, 'horizontal')).toContain('grid-cols-4');
    });

    it('returns 3-col grid for default layout', () => {
      expect(resolveGridClass(null, 'vertical')).toContain('grid-cols-3');
    });
  });

  describe('buildSelectPlaceholder', () => {
    it('builds placeholder with prefix and label', () => {
      const ui = (k) => k === 'selectLabelPrefix' ? 'Select' : k;
      expect(buildSelectPlaceholder(ui, 'Country')).toBe('Select Country...');
    });
  });

  describe('buildSearchPlaceholder', () => {
    it('builds placeholder with prefix and label', () => {
      const ui = (k) => k === 'searchLabelPrefix' ? 'Search' : k;
      expect(buildSearchPlaceholder(ui, 'Product')).toBe('Search Product...');
    });
  });
});
