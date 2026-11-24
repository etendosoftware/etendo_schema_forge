// @covers tools/app-shell/src/components/reports/reportCategories.js
import { CATEGORY_LABELS, reportCategoryMenuKey } from '../reportCategories.js';

// A report's category names the first breadcrumb level and the catalog section heading, through
// the same menu key as the sidebar group (Tesorería for the aging reports).
describe('reportCategoryMenuKey', () => {
  it.each([
    ['treasury', 'Treasury'],
    ['finance', 'Finance'],
    ['inventory', 'Inventory'],
    ['purchases', 'Purchases'],
    ['sales', 'Sales'],
    ['other', 'Other'],
  ])('%s maps to the menu key %s', (category, key) => {
    expect(reportCategoryMenuKey(category, 'Finance')).toBe(key);
  });

  it.each([undefined, null, '', 'no-such-category'])('falls back to the given key for %j', (category) => {
    expect(reportCategoryMenuKey(category, 'Finance')).toBe('Finance');
  });

  it.each([undefined, null, '', 'no-such-category'])('answers null for %j when no fallback is given', (category) => {
    expect(reportCategoryMenuKey(category)).toBeNull();
  });

  it('does not resolve inherited object keys as categories', () => {
    expect(reportCategoryMenuKey('toString', 'Finance')).toBe('Finance');
  });
});

describe('CATEGORY_LABELS', () => {
  it('labels the treasury category Treasury / Tesorería', () => {
    expect(CATEGORY_LABELS.treasury).toEqual({ en: 'Treasury', es: 'Tesorería' });
  });

  it('keeps finance as Finance / Finanzas', () => {
    expect(CATEGORY_LABELS.finance).toEqual({ en: 'Finance', es: 'Finanzas' });
  });

  it('cannot be mutated', () => {
    expect(Object.isFrozen(CATEGORY_LABELS)).toBe(true);
  });
});
