import {
  buildNameSearchCriteria,
  buildSearchUrl,
  deriveSelectorUrl,
  deriveSpecBase,
  isSelectorUrl,
  readSearchRows,
} from '../ocrQuery.js';

const paramsOf = (url) => new URL(url, 'http://x').searchParams;

describe('ocrQuery', () => {
  describe('deriveSpecBase / deriveSelectorUrl', () => {
    it('swaps the host spec for the sibling one', () => {
      expect(deriveSpecBase('/etendo/sws/neo/purchase-invoice', 'contacts')).toBe('/etendo/sws/neo/contacts');
    });

    it('falls back to the domain-root NEO path without a base', () => {
      expect(deriveSpecBase(undefined, 'contacts')).toBe('/sws/neo/contacts');
    });

    it('builds the selector path of an entity column', () => {
      expect(deriveSelectorUrl('/etendo/sws/neo/purchase-invoice', 'purchase-invoice', 'header', 'C_BPartner_ID'))
        .toBe('/etendo/sws/neo/purchase-invoice/header/selectors/C_BPartner_ID');
    });
  });

  it('tells a selector URL from a CRUD list URL', () => {
    expect(isSelectorUrl('/sws/neo/product/product/selectors/C_UOM_ID')).toBe(true);
    expect(isSelectorUrl('/sws/neo/product/product')).toBe(false);
    expect(isSelectorUrl(null)).toBe(false);
  });

  it('buildNameSearchCriteria keeps active-only and adds iContains on name when there is text', () => {
    expect(buildNameSearchCriteria('  ')).toEqual({
      _constructor: 'AdvancedCriteria',
      operator: 'and',
      criteria: [{ fieldName: 'active', operator: 'equals', value: true }],
    });
    expect(buildNameSearchCriteria(" O'Brien ").criteria).toEqual([
      { fieldName: 'name', operator: 'iContains', value: "O'Brien" },
      { fieldName: 'active', operator: 'equals', value: true },
    ]);
  });

  // The production WAF answers an HQL predicate in the query string with 403. Neither shape
  // may emit one.
  describe('buildSearchUrl', () => {
    it('searches a selector with q, its context params and the limit', () => {
      const url = buildSearchUrl('/sws/neo/purchase-invoice/header/selectors/C_BPartner_ID', {
        query: ' Distr ',
        limit: 2,
        params: { isSOTrx: 'N', isVendor: 'Y', skipped: null, empty: '' },
      });
      const params = paramsOf(url);
      expect(params.get('q')).toBe('Distr');
      expect(params.get('isSOTrx')).toBe('N');
      expect(params.get('isVendor')).toBe('Y');
      expect(params.get('limit')).toBe('2');
      expect(params.has('skipped')).toBe(false);
      expect(params.has('empty')).toBe(false);
      expect(params.has('criteria')).toBe(false);
      expect(url).not.toContain('_neoWhere');
    });

    it('omits q on a selector when there is no text', () => {
      const url = buildSearchUrl('/sws/neo/x/y/selectors/C_Z_ID', { params: { C_BPartner_ID: 'bp-1' } });
      expect(paramsOf(url).has('q')).toBe(false);
      expect(paramsOf(url).get('C_BPartner_ID')).toBe('bp-1');
      expect(paramsOf(url).has('limit')).toBe(false);
    });

    it('searches a CRUD list with criteria', () => {
      const url = buildSearchUrl('/sws/neo/product/product', { query: 'tornillo', limit: 50 });
      const params = paramsOf(url);
      expect(JSON.parse(params.get('criteria'))).toEqual(buildNameSearchCriteria('tornillo'));
      expect(params.get('limit')).toBe('50');
      expect(params.has('q')).toBe(false);
      expect(url).not.toContain('_neoWhere');
    });
  });

  describe('readSearchRows', () => {
    it('normalizes selector items to carry a name, dropping rows without id', () => {
      expect(readSearchRows({ items: [{ id: 'a', label: 'A' }, { label: 'no id' }, { id: 'b', _identifier: 'B' }] }))
        .toEqual([
          { id: 'a', label: 'A', name: 'A' },
          { id: 'b', _identifier: 'B', name: 'B' },
        ]);
    });

    it('reads CRUD responses from response.data or data', () => {
      expect(readSearchRows({ response: { data: [{ id: '1' }] } })).toEqual([{ id: '1' }]);
      expect(readSearchRows({ data: [{ id: '2' }] })).toEqual([{ id: '2' }]);
    });

    it('returns [] for anything else', () => {
      expect(readSearchRows(null)).toEqual([]);
      expect(readSearchRows({})).toEqual([]);
      expect(readSearchRows({ response: { data: { not: 'array' } } })).toEqual([]);
    });
  });
});
