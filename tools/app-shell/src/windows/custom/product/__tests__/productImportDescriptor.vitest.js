import { describe, it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { buildOperations } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
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
    assert.equal(opts.headers.Authorization, 'Bearer tok-valid');
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

  // ETP-5245 ------------------------------------------------------------------------
  // The selector now exposes the tenant's own M_PriceList.IsDefault flag
  // (ProductPriceHandler.enrichSelectorItem). Within a direction the import must land on THAT
  // tariff, so an imported price and the price shown in the product list (which comes from the
  // ETGO_PRODUCT_*_PRICE computed columns, themselves keyed off the default tariff) agree.
  describe('default tariff preference', () => {
    it('picks the tariff the tenant flagged as default among several sales price lists', async () => {
      stubFetch([
        { id: 'PLV-SALES-OTHER', salesPriceList: true, default: false },
        { id: 'PLV-SALES-DEFAULT', salesPriceList: true, default: true },
        { id: 'PLV-SALES-THIRD', salesPriceList: true, default: false },
      ]);
      const ops = await buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-def-sales'));
      assert.equal(ops[1].body.priceListVersion, 'PLV-SALES-DEFAULT');
    });

    it('reads the flag from the priceListVersion$default alias too', async () => {
      stubFetch([
        { id: 'PLV-SALES-OTHER', salesPriceList: true },
        { id: 'PLV-SALES-DEFAULT', salesPriceList: true, 'priceListVersion$default': true },
      ]);
      const ops = await buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-def-alias'));
      assert.equal(ops[1].body.priceListVersion, 'PLV-SALES-DEFAULT');
    });

    it("accepts Etendo's 'Y'/'N' char booleans for the flag", async () => {
      stubFetch([
        { id: 'PLV-SALES-OTHER', salesPriceList: 'Y', default: 'N' },
        { id: 'PLV-SALES-DEFAULT', salesPriceList: 'Y', default: 'Y' },
      ]);
      const ops = await buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-def-yn'));
      assert.equal(ops[1].body.priceListVersion, 'PLV-SALES-DEFAULT');
    });

    it('keeps the pre-ETP-5245 behaviour (first match wins) when no tariff is flagged', async () => {
      stubFetch([
        { id: 'PLV-SALES-FIRST', salesPriceList: true },
        { id: 'PLV-SALES-SECOND', salesPriceList: true },
      ]);
      const ops = await buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-def-none'));
      assert.equal(ops[1].body.priceListVersion, 'PLV-SALES-FIRST');
    });

    it('keeps the pre-ETP-5245 behaviour when every tariff is flagged false', async () => {
      stubFetch([
        { id: 'PLV-SALES-FIRST', salesPriceList: true, default: false },
        { id: 'PLV-SALES-SECOND', salesPriceList: true, default: false },
      ]);
      const ops = await buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-def-allfalse'));
      assert.equal(ops[1].body.priceListVersion, 'PLV-SALES-FIRST');
    });

    // Direction is still decided BEFORE the default flag: an unflagged version is only a
    // fallback for sales, so a default-flagged unflagged one must not outrank a real sales list.
    it('never lets a default-flagged unflagged version outrank an explicitly sales-flagged one', async () => {
      stubFetch([
        { id: 'PLV-UNFLAGGED-DEFAULT', default: true },
        { id: 'PLV-SALES-PLAIN', salesPriceList: true },
      ]);
      const ops = await buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-def-order'));
      assert.equal(ops[1].body.priceListVersion, 'PLV-SALES-PLAIN');
    });

    it('still falls back to an unflagged version for sales, preferring the flagged-default one', async () => {
      stubFetch([
        { id: 'PLV-UNFLAGGED-FIRST' },
        { id: 'PLV-UNFLAGGED-DEFAULT', default: true },
      ]);
      const ops = await buildOperations({ ...baseRow, salesPrice: '10' }, productConfig('tok-def-unflagged'));
      assert.equal(ops[1].body.priceListVersion, 'PLV-UNFLAGGED-DEFAULT');
    });

    it('picks the default purchase tariff among several purchase price lists', async () => {
      stubFetch([
        { id: 'PLV-PURCHASE-OTHER', salesPriceList: false },
        { id: 'PLV-PURCHASE-DEFAULT', salesPriceList: false, default: true },
      ]);
      const ops = await buildOperations({ ...baseRow, purchasePrice: '10' }, productConfig('tok-def-purchase'));
      assert.equal(ops[1].body.priceListVersion, 'PLV-PURCHASE-DEFAULT');
    });

    // REGRESSION GUARD: purchase still requires salesPriceList === false explicitly. Filing a
    // purchase price against an unflagged (possibly sales) tariff would corrupt the sale price of
    // every product in it — so "no purchase list" must stay an error, never a silent fallback.
    it('never files a purchase price on an unflagged version, even one flagged as default', async () => {
      stubFetch([{ id: 'PLV-UNFLAGGED-DEFAULT', default: true }]);
      await assert.rejects(
        () => buildOperations({ ...baseRow, purchasePrice: '10' }, productConfig('tok-def-nopurchase')),
        /No purchase price list is configured/,
      );
    });

    it('never files a purchase price on a sales tariff flagged as default', async () => {
      stubFetch([{ id: 'PLV-SALES-DEFAULT', salesPriceList: true, default: true }]);
      await assert.rejects(
        () => buildOperations({ ...baseRow, purchasePrice: '10' }, productConfig('tok-def-salesonly')),
        /No purchase price list is configured/,
      );
    });

    it('resolves each direction to its own default tariff in the same row', async () => {
      stubFetch([
        { id: 'PLV-SALES-OTHER', salesPriceList: true },
        { id: 'PLV-SALES-DEFAULT', salesPriceList: true, default: true },
        { id: 'PLV-PURCHASE-OTHER', salesPriceList: false },
        { id: 'PLV-PURCHASE-DEFAULT', salesPriceList: false, default: true },
      ]);
      const ops = await buildOperations(
        { ...baseRow, salesPrice: '150', purchasePrice: '100' },
        productConfig('tok-def-both'),
      );
      assert.equal(ops.find((op) => op.id === 'salesPrice').body.priceListVersion, 'PLV-SALES-DEFAULT');
      assert.equal(ops.find((op) => op.id === 'purchasePrice').body.priceListVersion, 'PLV-PURCHASE-DEFAULT');
    });
  });
});

/**
 * ETP-5227 — "importar con codigoCategoria existente falla persistentemente".
 *
 * The catalogue read used to swallow every failure into `[]`, which is indistinguishable from
 * "this tenant has no categories": the resolver then auto-created a category that already
 * existed and the database rejected it on its unique index, so the user was shown a raw English
 * backend complaint about a category plainly visible in the UI. And because that `[]` was cached
 * per token, every retry for the life of the tab replayed it.
 */
describe('ETP-5227 — a category catalogue that cannot be read', () => {
  const translate = (key, params = {}) => (key === 'importErrorCategoryLookupFailed'
    ? `No se pudieron consultar las categorías, no se pudo asignar "${params.category}".`
    : key);

  /** Fails the category endpoint, serves everything else normally. */
  function stubCategoryFailure(shouldFail) {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/product-category/')) {
        return shouldFail() ? { ok: false, status: 500, json: async () => ({}) }
          : { ok: true, json: async () => ({ response: { data: [{ id: 'CAT-HERR', searchKey: 'HERRAMIENTAS', name: 'Herramientas' }] } }) };
      }
      return { ok: true, json: async () => ({ items: SALES_ITEMS }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('fails the row with a translated message rather than creating a category that already exists', async () => {
    stubCategoryFailure(() => true);
    await assert.rejects(
      () => buildOperations(
        { ...baseRow, category: 'HERRAMIENTAS' },
        productConfig('tok-5227-lookup', { translate }),
      ),
      /No se pudieron consultar las categorías, no se pudo asignar "HERRAMIENTAS"\./,
    );
  });

  it('does not remember the failure — the next attempt reads the catalogue again and resolves', async () => {
    // The "persistente" half of the report: the failed read was cached per token, so retrying
    // could never succeed until the tab was reloaded.
    let failing = true;
    stubCategoryFailure(() => failing);
    const token = 'tok-5227-retry';

    await assert.rejects(
      () => buildOperations({ ...baseRow, category: 'HERRAMIENTAS' }, productConfig(token, { translate })),
      /No se pudieron consultar/,
    );

    failing = false;
    const ops = await buildOperations({ ...baseRow, category: 'HERRAMIENTAS' }, productConfig(token, { translate }));
    assert.equal(ops[0].body.productCategory, 'CAT-HERR');
  });
});

/**
 * ETP-5350 — the cost and its starting date, both rows of M_Costing.
 *
 * A cost is not a product column: it is a record of the costing engine's own table, reached
 * through the `costing` entity, which `artifacts/product/decisions.json` already wires to
 * `productCostingHandler`. `/batch` runs handler hooks whenever the entity declares a
 * `Java_Qualifier`, so an imported cost takes exactly the path the Costing tab takes — which is
 * why this op carries only two fields and the tests below assert what is NOT sent as carefully
 * as what is.
 */
describe('product import descriptor — cost (ETP-5350)', () => {
  it('adds a parentRef-linked costing op, with no price-list lookup of its own', async () => {
    const fetchMock = stubFetch(SALES_ITEMS);
    const ops = await buildOperations({ ...baseRow, cost: '7,40' }, productConfig('tok-cost-1'));

    const cost = ops.find((o) => o.entity === 'costing');
    assert.ok(cost, `expected a costing op, got: ${ops.map((o) => o.entity).join(', ')}`);
    assert.equal(cost.parentRef, 'product');
    assert.equal(cost.body.cost, '7.4');
    // No PRICE-LIST fetch: the handler derives the organisation and its currency server-side,
    // so a cost-only row must not pay for a price-list-version lookup it has no use for. (The
    // one call it does make is `/defaults`, which every row makes for the UOM.)
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    assert.ok(!urls.some((u) => u.includes('M_PriceList_Version_ID')), `unexpected PLV lookup: ${urls.join(', ')}`);
  });

  it('never sends endingDate — the key\'s absence is what makes the handler infer 31-12-9999', async () => {
    // CostingUtils.getLastDate() only runs when the field is missing. Sending it empty, or
    // null, stops the inference and leaves the cost with no end of validity.
    stubFetch(SALES_ITEMS);
    const ops = await buildOperations({ ...baseRow, cost: '10' }, productConfig('tok-cost-2'));
    const cost = ops.find((o) => o.entity === 'costing');
    assert.ok(!('endingDate' in cost.body), `expected endingDate to be absent, got: ${JSON.stringify(cost.body)}`);
  });

  it('sends only cost and startingDate — everything else is the handler\'s to decide', async () => {
    // costType/manual/permanent/production, the organisation and ITS currency (not the AD
    // default, which is USD) all come from ProductCostingHandler. Sending any of them from here
    // would be a second source of truth for values the Costing tab already gets right.
    stubFetch(SALES_ITEMS);
    const ops = await buildOperations({ ...baseRow, cost: '10' }, productConfig('tok-cost-3'));
    const cost = ops.find((o) => o.entity === 'costing');
    assert.deepEqual(Object.keys(cost.body).sort(), ['cost', 'startingDate']);
  });

  it('emits NO costing op for a blank cost, so one empty cell cannot lose the whole product', async () => {
    // `/batch` is all-or-nothing per row and the handler rejects a blank cost, so a row that
    // says nothing about cost must produce no op at all — same contract buildPriceOperation has.
    stubFetch(SALES_ITEMS);
    const blank = await buildOperations({ ...baseRow, cost: '   ' }, productConfig('tok-cost-4'));
    const absent = await buildOperations({ ...baseRow }, productConfig('tok-cost-5'));
    assert.equal(blank.find((o) => o.entity === 'costing'), undefined);
    assert.equal(absent.find((o) => o.entity === 'costing'), undefined);
  });

  it('defaults startingDate to the LOCAL calendar today, never the UTC one', async () => {
    // `new Date().toISOString().slice(0, 10)` is yesterday for most of the evening under
    // America/Argentina/Buenos_Aires, which would silently backdate every imported cost.
    // ETP-4031 / ETP-4850 are the same bug class, twice shipped.
    stubFetch(SALES_ITEMS);
    const ops = await buildOperations({ ...baseRow, cost: '10' }, productConfig('tok-cost-6'));
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    assert.equal(ops.find((o) => o.entity === 'costing').body.startingDate, localToday);
  });

  it('normalizes the four date shapes a file can carry to yyyy-MM-dd', async () => {
    // Day-first for every separated form, matching the template's example and all three
    // locales: 01/08/2026 is 1 August, never 8 January.
    stubFetch(SALES_ITEMS);
    const shapes = ['01/08/2026', '01-08-2026', '01.08.2026', '2026-08-01'];
    for (const [i, raw] of shapes.entries()) {
      const ops = await buildOperations(
        { ...baseRow, cost: '10', costStartingDate: raw },
        productConfig(`tok-cost-date-${i}`),
      );
      assert.equal(ops.find((o) => o.entity === 'costing').body.startingDate, '2026-08-01', `for ${raw}`);
    }
  });

  it('rejects a negative cost rather than letting the handler 400 at confirm time', async () => {
    stubFetch(SALES_ITEMS);
    await assert.rejects(
      () => buildOperations({ ...baseRow, cost: '-5' }, productConfig('tok-cost-neg')),
      /negative/i,
    );
  });

  it('localizes its own errors through the injected translate', async () => {
    stubFetch(SALES_ITEMS);
    const translate = (key) => (key === 'importErrorNegativeCost' ? 'El coste no puede ser negativo.' : key);
    await assert.rejects(
      () => buildOperations({ ...baseRow, cost: '-5' }, productConfig('tok-cost-neg-i18n', { translate })),
      /El coste no puede ser negativo\./,
    );
  });
});
