import { describe, it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { buildOperations } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import {
  TEST_BEARER_TOKEN,
  declareBearerSession,
} from '@/test/sessionContract.js';
import '../productImportDescriptor.js'; // side-effecting import: registers the 'product' descriptor on load

// The descriptor caches each resolved price-list version in a module-level Map keyed by
// token + direction (see resolvePlv). That cache is NOT reset between tests, so every test
// that triggers a PLV fetch uses its OWN unique token — this both keeps tests isolated and
// matches the real "once per import run, keyed by token" contract. The memoization tests
// deliberately reuse a single token across their calls to prove the shared-fetch behavior.

const SALES_ITEMS = [
  { id: 'PLV-SALES-1', salesPriceList: true },
  { id: 'PLV-PURCHASE-1', salesPriceList: false },
];

function stubFetch(items) {
  // Declared per stub rather than inherited: src/test/setup.js resets the scheme to
  // the bearer default before every test, so asserting a credential without
  // declaring one only ever exercises that default.
  declareBearerSession();
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
  it('carries the configured product UOM default into batch product operations', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/sws/neo/product/product/defaults')) {
        return { ok: true, json: async () => ({ defaults: { uOM: 'configured-unit-id' } }) };
      }
      return { ok: true, json: async () => ({ items: SALES_ITEMS }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const ops = await buildOperations({ ...baseRow }, productConfig('tok-uom-default'));

    assert.equal(ops[0].body.uOM, 'configured-unit-id');
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.ok(fetchMock.mock.calls[0][0].includes('/sws/neo/product/product/defaults'));
  });

  it('builds a product op plus a parentRef-linked price op when the row has a valid price, resolving the sales PLV once', async () => {
    const fetchMock = stubFetch(SALES_ITEMS);
    const ops = await buildOperations({ ...baseRow, salesPrice: '1234.50' }, productConfig('tok-valid'));
    assert.equal(ops.length, 2);
    const [product, price] = ops;
    // Product op carries the copied columns plus the AD-defaulted product type.
    assert.equal(product.id, 'product');
    assert.equal(product.entity, 'product');
    assert.deepEqual(product.body, { searchKey: 'P-001', name: 'Widget', description: 'A widget', productType: 'I' });
    // Price op mirrors ProductPriceBar's add flow: standard/list/limit all set to the price,
    // linked to the not-yet-committed product op via parentRef.
    assert.equal(price.id, 'salesPrice');
    assert.equal(price.entity, 'price');
    assert.equal(price.parentRef, 'product');
    assert.equal(price.body.priceListVersion, 'PLV-SALES-1');
    assert.equal(price.body.standardPrice, '1234.5');
    assert.equal(price.body.listPrice, '1234.5');
    assert.equal(price.body.priceLimit, '1234.5');
    // The selector endpoint was hit with the spec-scoped URL and the bearer token.
    const priceFetchCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/price/selectors/'));
    assert.equal(priceFetchCalls.length, 1);
    const [url, opts] = priceFetchCalls[0];
    assert.ok(url.includes('/sws/neo/product/price/selectors/M_PriceList_Version_ID'), `unexpected url: ${url}`);
    // ETP-4576 — the descriptor asks the shared builder for its credential instead
    // of pinning `Authorization` from the token it was configured with. That token
    // still keys the module-level PLV cache (see the note at the top of this file),
    // which is why the config keeps it; it just no longer authenticates the call.
    assert.equal(opts.headers.Authorization, `Bearer ${TEST_BEARER_TOKEN}`);
    assert.equal(opts.credentials, 'include');
  });

  it('parses both plain and es-ES price formats (comma decimal, dot thousands) into the price op body', async () => {
    stubFetch(SALES_ITEMS);
    const dotThousandsCommaDecimal = await buildOperations({ ...baseRow, salesPrice: '1.234,50' }, productConfig('tok-fmt-1'));
    assert.equal(dotThousandsCommaDecimal[1].body.standardPrice, '1234.5');
    const commaDecimal = await buildOperations({ ...baseRow, salesPrice: '1234,50' }, productConfig('tok-fmt-2'));
    assert.equal(commaDecimal[1].body.standardPrice, '1234.5');
    const plainDotDecimal = await buildOperations({ ...baseRow, salesPrice: '99.90' }, productConfig('tok-fmt-3'));
    assert.equal(plainDotDecimal[1].body.standardPrice, '99.9');
  });

  it('imports the product only (no price op, no PLV fetch) when both price cells are blank or absent', async () => {
    const fetchMock = stubFetch(SALES_ITEMS);
    const blank = await buildOperations({ ...baseRow, salesPrice: '   ' }, productConfig('tok-blank-1'));
    assert.equal(blank.length, 1);
    assert.equal(blank[0].id, 'product');
    const absent = await buildOperations({ ...baseRow }, productConfig('tok-blank-2'));
    assert.equal(absent.length, 1);
    assert.equal(absent[0].id, 'product');
    // A product-only row must never touch the price-list selector.
    const priceFetchCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/price/selectors/'));
    assert.equal(priceFetchCalls.length, 0);
  });

  it('throws a classified invalid-price error for a non-numeric cell — localized via config.translate, English fallback without', async () => {
    stubFetch(SALES_ITEMS);
    await assert.rejects(
      () => buildOperations({ ...baseRow, salesPrice: 'abc' }, productConfig('tok-invalid-1')),
      /The price "abc" is not a valid number\./,
    );
    const translate = vi.fn((key, params) => `Precio inválido: "${params.value}".`);
    await assert.rejects(
      () => buildOperations({ ...baseRow, salesPrice: 'abc' }, productConfig('tok-invalid-2', { translate })),
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
      () => buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-noplv-1')),
      /No sales price list is configured/,
    );
    stubFetch([{ id: 'PLV-PURCHASE-1', salesPriceList: false }]); // only purchase-flagged → still no sales PLV
    const translate = vi.fn(() => 'No hay lista de precios de venta configurada.');
    await assert.rejects(
      () => buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-noplv-2', { translate })),
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
      { searchKey: 'P-1', name: 'A', salesPrice: '10' },
      { searchKey: 'P-2', name: 'B', salesPrice: '20' },
      { searchKey: 'P-3', name: 'C', salesPrice: '30' },
    ];
    const results = await Promise.all(rows.map((r) => buildOperations(r, productConfig('tok-memo'))));
    for (const ops of results) {
      assert.equal(ops.length, 2);
      assert.equal(ops[1].body.priceListVersion, 'PLV-SALES-1');
    }
    // The PENDING promise is cached synchronously, so even concurrent rows fire the fetch once.
    const priceFetchCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/price/selectors/'));
    assert.equal(priceFetchCalls.length, 1);
  });

  // ETP-4995 ------------------------------------------------------------------------
  describe('product type (AD-coded column)', () => {
    it('imports a service through the productType column', async () => {
      stubFetch(SALES_ITEMS);
      const [product] = await buildOperations({ ...baseRow, productType: 'Servicio' }, productConfig('tok-pt-1'));
      assert.equal(product.body.productType, 'S');
    });

    it('accepts the English label and the raw AD code alike', async () => {
      stubFetch(SALES_ITEMS);
      const [byLabel] = await buildOperations({ ...baseRow, productType: 'service' }, productConfig('tok-pt-2'));
      const [byCode] = await buildOperations({ ...baseRow, productType: 'E' }, productConfig('tok-pt-3'));
      assert.equal(byLabel.body.productType, 'S');
      assert.equal(byCode.body.productType, 'E');
    });

    it('falls back to the AD default (Item) when the column is blank or absent', async () => {
      stubFetch(SALES_ITEMS);
      const [blank] = await buildOperations({ ...baseRow, productType: '  ' }, productConfig('tok-pt-4'));
      const [absent] = await buildOperations({ ...baseRow }, productConfig('tok-pt-5'));
      assert.equal(blank.body.productType, 'I');
      assert.equal(absent.body.productType, 'I');
    });

    it('fails the row, naming the accepted values, when the type is unrecognized', async () => {
      stubFetch(SALES_ITEMS);
      await assert.rejects(
        () => buildOperations({ ...baseRow, productType: 'Suscripcion' }, productConfig('tok-pt-6')),
        /Suscripcion.*Accepted values.*S \(Servicio\)/s,
      );
    });
  });

  describe('unit of measure', () => {
    const resolveUomFn = vi.fn(async (value) => (value === 'Kilogramo'
      ? { status: 'auto-resolved', id: 'UOM-KG' }
      : { status: 'needs-review', candidates: [] }));

    it("resolves the row's own unit of measure instead of always using the org default", async () => {
      const fetchMock = vi.fn(async (url) => (url.includes('/product/defaults')
        ? { ok: true, json: async () => ({ defaults: { uOM: 'UOM-DEFAULT' } }) }
        : { ok: true, json: async () => ({ items: SALES_ITEMS }) }));
      vi.stubGlobal('fetch', fetchMock);
      const [product] = await buildOperations(
        { ...baseRow, uOM: 'Kilogramo' },
        productConfig('tok-uom-row', { resolveUomFn }),
      );
      assert.equal(product.body.uOM, 'UOM-KG');
    });

    it('keeps the org default when the unit column is blank', async () => {
      const fetchMock = vi.fn(async (url) => (url.includes('/product/defaults')
        ? { ok: true, json: async () => ({ defaults: { uOM: 'UOM-DEFAULT' } }) }
        : { ok: true, json: async () => ({ items: SALES_ITEMS }) }));
      vi.stubGlobal('fetch', fetchMock);
      const [product] = await buildOperations(
        { ...baseRow, uOM: '   ' },
        productConfig('tok-uom-blank', { resolveUomFn }),
      );
      assert.equal(product.body.uOM, 'UOM-DEFAULT');
    });

    it('fails the row rather than importing under the wrong unit when it cannot be matched', async () => {
      stubFetch(SALES_ITEMS);
      await assert.rejects(
        () => buildOperations(
          { ...baseRow, uOM: 'Furlong' },
          productConfig('tok-uom-bad', { resolveUomFn }),
        ),
        /"Furlong" could not be matched/,
      );
    });
  });

  describe('purchase and sales prices', () => {
    it('builds one price op per direction, each against its own price list version', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, salesPrice: '150', purchasePrice: '100' },
        productConfig('tok-both-prices'),
      );
      assert.equal(ops.length, 3);
      const sales = ops.find((op) => op.id === 'salesPrice');
      const purchase = ops.find((op) => op.id === 'purchasePrice');
      assert.equal(sales.body.priceListVersion, 'PLV-SALES-1');
      assert.equal(sales.body.standardPrice, '150');
      assert.equal(purchase.body.priceListVersion, 'PLV-PURCHASE-1');
      assert.equal(purchase.body.standardPrice, '100');
      assert.equal(purchase.parentRef, 'product');
    });

    it('imports a purchase price on its own, without a sales price', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, purchasePrice: '42' },
        productConfig('tok-purchase-only'),
      );
      assert.equal(ops.length, 2);
      assert.equal(ops[1].id, 'purchasePrice');
      assert.equal(ops[1].body.priceListVersion, 'PLV-PURCHASE-1');
    });

    // An unflagged version is treated as a sales list (a human sees those in the Sales tab),
    // but must NOT be assumed to be a purchase one — that would silently file a purchase
    // price against a sales list.
    it('refuses a purchase price when the catalog has no purchase-flagged price list', async () => {
      stubFetch([{ id: 'PLV-UNFLAGGED' }]);
      await assert.rejects(
        () => buildOperations({ ...baseRow, purchasePrice: '10' }, productConfig('tok-nopurchase')),
        /No purchase price list is configured/,
      );
    });

    it('resolves each direction once per run and caches them separately', async () => {
      const fetchMock = stubFetch(SALES_ITEMS);
      const rows = [
        { searchKey: 'P-1', name: 'A', salesPrice: '10', purchasePrice: '5' },
        { searchKey: 'P-2', name: 'B', salesPrice: '20', purchasePrice: '9' },
      ];
      await Promise.all(rows.map((r) => buildOperations(r, productConfig('tok-plv-cache'))));
      const priceFetchCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/price/selectors/'));
      assert.equal(priceFetchCalls.length, 2); // one for sales, one for purchase
    });
  });

  describe('category resolution and auto-creation', () => {
    const existingCategories = [
      { id: 'CAT-ELEC', searchKey: 'ELEC', name: 'Electrónica' },
      { id: 'CAT-FOOD', searchKey: 'FOOD', name: 'Alimentos' },
      { id: 'CAT-DUP-1', searchKey: 'SERV-1', name: 'Servicios' },
      { id: 'CAT-DUP-2', searchKey: 'SERV-2', name: 'Servicios' },
    ];

    it('resolves existing category by exact code in the single category column', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, category: 'ELEC' },
        productConfig('tok-cat-1', { existingCategories }),
      );
      assert.equal(ops[0].body.productCategory, 'CAT-ELEC');
    });

    it('resolves existing category by normalized name in the single category column', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, category: '  electrónica  ' },
        productConfig('tok-cat-2', { existingCategories }),
      );
      assert.equal(ops[0].body.productCategory, 'CAT-ELEC');
    });

    it('resolves existing category by name through the category column', async () => {
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

    it('throws an ambiguity error when the category name matches multiple categories', async () => {
      stubFetch(SALES_ITEMS);
      await assert.rejects(
        () => buildOperations(
          { ...baseRow, category: 'Servicios' },
          productConfig('tok-cat-ambig', { existingCategories }),
        ),
        /Multiple records match "Servicios"/,
      );
    });

    it('preserves legacy behavior (product-only without category field) when category fields are empty or absent', async () => {
      stubFetch(SALES_ITEMS);
      const ops = await buildOperations(
        { ...baseRow, category: '' },
        productConfig('tok-cat-legacy', { existingCategories }),
      );
      assert.equal(ops.length, 1);
      assert.equal(ops[0].body.productCategory, undefined);
    });
  });
});
