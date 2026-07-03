import { docUrl, getHelpPages, groupHelpCollections, searchHelpDocs } from '../helpDocs.js';

describe('helpDocs', () => {
  describe('docUrl', () => {
    it('builds the full doc URL from a location', () => {
      expect(docUrl('facturas/factura-de-venta/')).toBe(
        'https://etendosoftware.github.io/etendo-go-docs/facturas/factura-de-venta/',
      );
    });

    it('handles an empty location (home page)', () => {
      expect(docUrl('')).toBe('https://etendosoftware.github.io/etendo-go-docs/');
    });
  });

  describe('getHelpPages', () => {
    it('keeps only page-level entries (no # fragment)', () => {
      const docs = [
        { location: 'inicio/', title: 'Inicio' },
        { location: 'inicio/#section-1', title: 'Section 1' },
        { location: 'facturas/', title: 'Facturas' },
      ];
      expect(getHelpPages(docs)).toEqual([
        { location: 'inicio/', title: 'Inicio' },
        { location: 'facturas/', title: 'Facturas' },
      ]);
    });

    it('returns an empty array when every entry has a fragment', () => {
      const docs = [{ location: 'inicio/#a' }, { location: 'inicio/#b' }];
      expect(getHelpPages(docs)).toEqual([]);
    });

    it('returns an empty array for an empty input', () => {
      expect(getHelpPages([])).toEqual([]);
    });
  });

  describe('groupHelpCollections', () => {
    it('groups pages by their first path segment', () => {
      const docs = [
        { location: 'facturas/factura-de-venta/', title: 'Factura de venta' },
        { location: 'facturas/factura-de-compra/', title: 'Factura de compra' },
        { location: 'inventario/stock/', title: 'Stock' },
      ];
      const groups = groupHelpCollections(docs);
      expect(groups).toHaveLength(2);
      const facturas = groups.find((g) => g.id === 'facturas');
      expect(facturas.title).toBe('Facturas');
      expect(facturas.pages).toHaveLength(2);
    });

    it('titles multi-word segments from kebab-case', () => {
      const docs = [{ location: 'punto-de-venta/', title: 'POS' }];
      const [group] = groupHelpCollections(docs);
      expect(group.title).toBe('Punto De Venta');
    });

    it('falls back to "inicio" when the first path segment is empty', () => {
      const docs = [{ location: '/', title: 'Home' }];
      const [group] = groupHelpCollections(docs);
      expect(group.id).toBe('inicio');
    });

    it('excludes fragment-only entries from every group', () => {
      const docs = [
        { location: 'facturas/', title: 'Facturas' },
        { location: 'facturas/#detalle', title: 'Detalle' },
      ];
      const [group] = groupHelpCollections(docs);
      expect(group.pages).toHaveLength(1);
    });
  });

  describe('searchHelpDocs', () => {
    const docs = [
      { location: 'facturas/factura-de-venta/', title: 'Factura de venta', text: 'Cómo crear una factura de venta' },
      { location: 'facturas/factura-de-venta/#detalle', title: 'Detalle de línea', text: 'Detalle de una línea de factura' },
      { location: 'inventario/stock/', title: 'Stock', text: 'Gestión de inventario y stock' },
    ];

    it('returns an empty array for a blank query', () => {
      expect(searchHelpDocs(docs, '   ')).toEqual([]);
    });

    it('matches entries whose title or text contain every search term', () => {
      const results = searchHelpDocs(docs, 'factura venta');
      expect(results).toHaveLength(1);
      expect(results[0].location).toBe('facturas/factura-de-venta/');
    });

    it('is case-insensitive', () => {
      const results = searchHelpDocs(docs, 'STOCK');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Stock');
    });

    it('collapses heading-level matches into their parent page, preferring the title match', () => {
      const results = searchHelpDocs(docs, 'factura');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Factura de venta');
    });

    it('returns no results when no entry matches all terms', () => {
      expect(searchHelpDocs(docs, 'factura inexistente-xyz')).toEqual([]);
    });
  });

  // fetchHelpDocs caches its result in a module-level variable, so each test
  // resets the module registry and re-imports it fresh to get isolated state.
  describe('fetchHelpDocs', () => {
    const SEARCH_INDEX_URL = 'https://etendosoftware.github.io/etendo-go-docs/search/search_index.json';
    const MKDOCS_YML_URL = 'https://raw.githubusercontent.com/etendosoftware/etendo-go-docs/main/mkdocs.yml';

    beforeEach(() => {
      vi.resetModules();
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      delete global.fetch;
    });

    it('fetches, filters out English pages and pages missing from the mkdocs nav, then caches the result', async () => {
      global.fetch.mockImplementation((url) => {
        if (url === SEARCH_INDEX_URL) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              docs: [
                { location: 'facturas/', title: 'Facturas' },
                { location: 'en/invoices/', title: 'Invoices' },
                { location: 'orphan/', title: 'Orphan' },
              ],
            }),
          });
        }
        if (url === MKDOCS_YML_URL) {
          return Promise.resolve({ ok: true, text: async () => 'nav:\n  - Facturas: facturas/index.md\n' });
        }
        throw new Error(`unexpected url ${url}`);
      });
      const { fetchHelpDocs } = await import('../helpDocs.js');
      const docs = await fetchHelpDocs();
      expect(docs).toEqual([{ location: 'facturas/', title: 'Facturas' }]);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Second call is served from the module-level cache — no extra fetches.
      const docs2 = await fetchHelpDocs();
      expect(docs2).toBe(docs);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent calls into a single in-flight fetch', async () => {
      global.fetch.mockImplementation((url) => {
        if (url === SEARCH_INDEX_URL) {
          return Promise.resolve({ ok: true, json: async () => ({ docs: [] }) });
        }
        return Promise.resolve({ ok: true, text: async () => '' });
      });
      const { fetchHelpDocs } = await import('../helpDocs.js');
      const [a, b] = await Promise.all([fetchHelpDocs(), fetchHelpDocs()]);
      expect(a).toBe(b);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects when the search index request fails', async () => {
      global.fetch.mockImplementation((url) => {
        if (url === SEARCH_INDEX_URL) return Promise.resolve({ ok: false, status: 500 });
        return Promise.resolve({ ok: true, text: async () => '' });
      });
      const { fetchHelpDocs } = await import('../helpDocs.js');
      await expect(fetchHelpDocs()).rejects.toThrow('search_index.json: 500');
    });

    it('rejects when the mkdocs.yml request fails', async () => {
      global.fetch.mockImplementation((url) => {
        if (url === SEARCH_INDEX_URL) return Promise.resolve({ ok: true, json: async () => ({ docs: [] }) });
        return Promise.resolve({ ok: false, status: 404 });
      });
      const { fetchHelpDocs } = await import('../helpDocs.js');
      await expect(fetchHelpDocs()).rejects.toThrow('mkdocs.yml: 404');
    });
  });
});
