import { describe, it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { buildOperations } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import '../productImportDescriptor.js'; // side-effecting import: registers the 'product' descriptor on load

// The descriptor caches the resolved sales price-list version in a module-level Map keyed by
// token (see resolveSalesPlv). That cache is NOT reset between tests, so every test that
// triggers a PLV fetch uses its OWN unique token — this both keeps tests isolated and matches
// the real "once per import run, keyed by token" contract. The memoization test deliberately
// reuses a single token across its calls to prove the shared-fetch behavior.

const SALES_ITEMS = [
  { id: 'PLV-SALES-1', salesPriceList: true },
  { id: 'PLV-PURCHASE-1', salesPriceList: false },
];

function stubFetch(items) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ items }) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function productConfig(token, extra = {}) {
  return { spec: 'product', entity: 'product', descriptorName: 'product', token, ...extra };
}

const baseRow = { searchKey: 'P-001', name: 'Widget', description: 'A widget' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('product import descriptor', () => {
  it('builds a product op plus a parentRef-linked price op when the row has a valid price, resolving the sales PLV once', async () => {
    const fetchMock = stubFetch(SALES_ITEMS);
    const ops = await buildOperations({ ...baseRow, price: '1234.50' }, productConfig('tok-valid'));
    assert.equal(ops.length, 2);
    const [product, price] = ops;
    // Product op carries only the 4-column-minus-price mapping (searchKey/name/description).
    assert.equal(product.id, 'product');
    assert.equal(product.entity, 'product');
    assert.deepEqual(product.body, { searchKey: 'P-001', name: 'Widget', description: 'A widget' });
    // Price op mirrors ProductPriceBar's add flow: standard/list/limit all set to the price,
    // linked to the not-yet-committed product op via parentRef.
    assert.equal(price.id, 'price');
    assert.equal(price.entity, 'price');
    assert.equal(price.parentRef, 'product');
    assert.equal(price.body.priceListVersion, 'PLV-SALES-1');
    assert.equal(price.body.standardPrice, '1234.5');
    assert.equal(price.body.listPrice, '1234.5');
    assert.equal(price.body.priceLimit, '1234.5');
    // The selector endpoint was hit with the spec-scoped URL and the bearer token.
    assert.equal(fetchMock.mock.calls.length, 1);
    const [url, opts] = fetchMock.mock.calls[0];
    assert.ok(url.includes('/sws/neo/product/price/selectors/M_PriceList_Version_ID'), `unexpected url: ${url}`);
    assert.equal(opts.headers.Authorization, 'Bearer tok-valid');
  });

  it('parses both plain and es-ES price formats (comma decimal, dot thousands) into the price op body', async () => {
    stubFetch(SALES_ITEMS);
    const dotThousandsCommaDecimal = await buildOperations({ ...baseRow, price: '1.234,50' }, productConfig('tok-fmt-1'));
    assert.equal(dotThousandsCommaDecimal[1].body.standardPrice, '1234.5');
    const commaDecimal = await buildOperations({ ...baseRow, price: '1234,50' }, productConfig('tok-fmt-2'));
    assert.equal(commaDecimal[1].body.standardPrice, '1234.5');
    const plainDotDecimal = await buildOperations({ ...baseRow, price: '99.90' }, productConfig('tok-fmt-3'));
    assert.equal(plainDotDecimal[1].body.standardPrice, '99.9');
  });

  it('imports the product only (no price op, no PLV fetch) when the price cell is blank or absent', async () => {
    const fetchMock = stubFetch(SALES_ITEMS);
    const blank = await buildOperations({ ...baseRow, price: '   ' }, productConfig('tok-blank-1'));
    assert.equal(blank.length, 1);
    assert.equal(blank[0].id, 'product');
    const absent = await buildOperations({ ...baseRow }, productConfig('tok-blank-2'));
    assert.equal(absent.length, 1);
    assert.equal(absent[0].id, 'product');
    // A product-only row must never touch the price-list selector.
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  it('throws a classified invalid-price error for a non-numeric cell — localized via config.translate, English fallback without', async () => {
    stubFetch(SALES_ITEMS);
    await assert.rejects(
      () => buildOperations({ ...baseRow, price: 'abc' }, productConfig('tok-invalid-1')),
      /The price "abc" is not a valid number\./,
    );
    const translate = vi.fn((key, params) => `Precio inválido: "${params.value}".`);
    await assert.rejects(
      () => buildOperations({ ...baseRow, price: 'abc' }, productConfig('tok-invalid-2', { translate })),
      /Precio inválido: "abc"\./,
    );
    assert.ok(
      translate.mock.calls.some(([key, params]) => key === 'importErrorInvalidPrice' && params?.value === 'abc'),
      'expected translate to be called with importErrorInvalidPrice and the offending value',
    );
  });

  it('throws a no-price-list error when no sales price list version can be resolved (empty or purchase-only catalog)', async () => {
    stubFetch([]); // empty catalog → no sales PLV
    await assert.rejects(
      () => buildOperations({ ...baseRow, price: '10' }, productConfig('tok-noplv-1')),
      /No sales price list is configured/,
    );
    stubFetch([{ id: 'PLV-PURCHASE-1', salesPriceList: false }]); // only purchase-flagged → still no sales PLV
    const translate = vi.fn(() => 'No hay lista de precios de venta configurada.');
    await assert.rejects(
      () => buildOperations({ ...baseRow, price: '10' }, productConfig('tok-noplv-2', { translate })),
      /No hay lista de precios de venta configurada\./,
    );
    assert.ok(
      translate.mock.calls.some(([key]) => key === 'importErrorNoPriceList'),
      'expected translate to be called with importErrorNoPriceList',
    );
  });

  it('resolves the sales price list version once per import run — concurrent rows sharing a token share a single fetch', async () => {
    const fetchMock = stubFetch(SALES_ITEMS);
    const rows = [
      { searchKey: 'P-1', name: 'A', price: '10' },
      { searchKey: 'P-2', name: 'B', price: '20' },
      { searchKey: 'P-3', name: 'C', price: '30' },
    ];
    const results = await Promise.all(rows.map((r) => buildOperations(r, productConfig('tok-memo'))));
    for (const ops of results) {
      assert.equal(ops.length, 2);
      assert.equal(ops[1].body.priceListVersion, 'PLV-SALES-1');
    }
    // The PENDING promise is cached synchronously, so even concurrent rows fire the fetch once.
    assert.equal(fetchMock.mock.calls.length, 1);
  });

  describe('category resolution and auto-creation', () => {
    const existingCategories = [
      { id: 'CAT-ELEC', searchKey: 'ELEC', name: 'Electrónica' },
      { id: 'CAT-FOOD', searchKey: 'FOOD', name: 'Alimentos' },
      { id: 'CAT-DUP-1', searchKey: 'SERV-1', name: 'Servicios' },
      { id: 'CAT-DUP-2', searchKey: 'SERV-2', name: 'Servicios' },
    ];

    it('resolves existing category by explicit categoryCode', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, categoryCode: 'ELEC' },
        productConfig('tok-cat-1', { existingCategories }),
      );
      assert.equal(ops[0].body.productCategory, 'CAT-ELEC');
    });

    it('resolves existing category by normalized name when categoryName is supplied', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, categoryName: '  electrónica  ' },
        productConfig('tok-cat-2', { existingCategories }),
      );
      assert.equal(ops[0].body.productCategory, 'CAT-ELEC');
    });

    it('resolves existing category via fallback category column', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, category: 'Alimentos' },
        productConfig('tok-cat-3', { existingCategories }),
      );
      assert.equal(ops[0].body.productCategory, 'CAT-FOOD');
    });

    it('auto-creates new category when no match exists and assigns the created id', async () => {
      stubFetch(SALES_ITEMS);
      let createdCalls = 0;
      const createCategoryFn = vi.fn(async ({ searchKey, name }) => {
        createdCalls += 1;
        return { id: 'CAT-NEW-1', searchKey, name };
      });

      const ops = await buildOperations(
        { ...baseRow, category: 'Muebles y Hogar' },
        productConfig('tok-cat-4', { existingCategories: [...existingCategories], createCategoryFn }),
      );
      assert.equal(ops[0].body.productCategory, 'CAT-NEW-1');
      assert.equal(createdCalls, 1);
      assert.equal(createCategoryFn.mock.calls[0][0].searchKey, 'MUEBLES_Y_HOGAR');
      assert.equal(createCategoryFn.mock.calls[0][0].name, 'Muebles y Hogar');
    });

    it('reuses auto-created category across concurrent rows in the same import run', async () => {
      stubFetch(SALES_ITEMS);
      let createdCalls = 0;
      const createCategoryFn = vi.fn(async ({ searchKey, name }) => {
        createdCalls += 1;
        return { id: 'CAT-HERR', searchKey, name };
      });

      const rows = [
        { searchKey: 'P-1', name: 'Martillo', category: 'Herramientas' },
        { searchKey: 'P-2', name: 'Destornillador', category: 'Herramientas' },
        { searchKey: 'P-3', name: 'Taladro', category: 'Herramientas' },
      ];

      const results = await Promise.all(
        rows.map((r) => buildOperations(r, productConfig('tok-cat-concurrency', { existingCategories: [...existingCategories], createCategoryFn }))),
      );

      assert.equal(createdCalls, 1);
      for (const ops of results) {
        assert.equal(ops[0].body.productCategory, 'CAT-HERR');
      }
    });

    it('throws an ambiguity error when categoryName matches multiple categories', async () => {
      stubFetch(SALES_ITEMS);
      await assert.rejects(
        () => buildOperations(
          { ...baseRow, categoryName: 'Servicios' },
          productConfig('tok-cat-ambig', { existingCategories }),
        ),
        /Multiple records match "Servicios"/,
      );
    });

    it('preserves legacy behavior (product-only without category field) when category fields are empty or absent', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, category: '', categoryCode: null, categoryName: undefined },
        productConfig('tok-cat-legacy', { existingCategories }),
      );
      assert.equal(ops.length, 1);
      assert.equal(ops[0].body.productCategory, undefined);
    });
  });
});
