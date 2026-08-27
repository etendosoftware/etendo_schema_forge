import { registerImportDescriptor } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import { resolveOrAutoCreateDependentEntity, getResolutionCache } from '@etendosoftware/app-shell-core/lib/import/resolveDependentEntity.js';
import { getFkResolver } from '@etendosoftware/app-shell-core/lib/import/fkResolvers.js';
import { parseBoolean } from '@/lib/parseBoolean.js';
import { resolveCodedCellOrThrow } from '@/lib/codedValue.js';
import { asDependentEntityInput } from '@/lib/dependentEntityCell.js';
import { jsonHeaders, writeHeaders } from '@/lib/sessionHeaders.js';

// Columns copied verbatim onto the product body. Everything else declared in
// `window.import.fields` needs interpreting first: `productType` and `uOM` are resolved
// below, the two price columns become their own operations, and `category` resolves to a
// productCategory id. taxCategory still resolves server-side through the product handler.
const PRODUCT_TARGETS = ['searchKey', 'name', 'description'];

// AD_Ref_List for M_Product.ProductType, read straight from the instance: I=Item
// (es: Artículo), S=Service (Servicio), E=Expense type (Gasto), R=Resource (Recurso),
// O=Online. The column is mandatory with an AD default of 'I'. Without a column here the
// descriptor never wrote the field, so services could not be imported at all.
const PRODUCT_TYPE_VALUES = {
  I: ['Articulo', 'Item', 'Producto', 'Bien'],
  S: ['Servicio', 'Service'],
  E: ['Gasto', 'Expense', 'Expense type'],
  R: ['Recurso', 'Resource'],
  O: ['Online'],
};

const DEFAULT_PRODUCT_TYPE = 'I';

// `price` is NOT a product field — in this system prices live in a separate M_ProductPrice
// record tied to a priceListVersion. This descriptor mirrors ProductPriceBar.jsx's own
// "add tariff" flow (POST /sws/neo/product/price with standardPrice/listPrice/priceLimit),
// expressed here as a second op in the SAME /batch call, parentRef-linked to the product op
// exactly like contactsImportDescriptor links businessPartner → locationAddress/contact.
const PLV_SELECTOR_COLUMN = 'M_PriceList_Version_ID';

// Mirrors simSearch.js's private detectEtendoBase: strip a `/web/...` suffix so the request
// targets Etendo's servlet root (honoring the deploy's context path), falling back to
// VITE_API_BASE. Duplicated rather than threaded through config.apiBaseUrl because that
// would need a change to app-shell-core's ImportDialog (a different repo/PR); this keeps the
// whole Products import fix inside the functional repo.
function detectEtendoBase() {
  if (typeof window !== 'undefined' && window.location) {
    const path = window.location.pathname;
    const webIdx = path.indexOf('/web/');
    if (webIdx !== -1) return path.substring(0, webIdx);
  }
  return import.meta.env?.VITE_API_BASE || '';
}

function pick(row, targets) {
  const body = {};
  for (const t of targets) if (row[t] !== undefined) body[t] = row[t];
  return body;
}

// Uses the shared parseBoolean() (see ProductPriceBar.jsx's own salesPriceList flag
// detection) so the import resolves the SAME price list version a human would land
// on in the Price tab.
function getSalesFlag(item) {
  if (!item || typeof item !== 'object') return null;
  for (const [key, value] of Object.entries(item)) {
    if (!key.toLowerCase().includes('salespricelist')) continue;
    const parsed = parseBoolean(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function extractId(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'object') return extractId(value.id ?? value.value ?? value.key ?? null);
  return null;
}

// CSV prices arrive as strings and this app is used primarily in Spanish, so accept both
// "1234.50" and the es-ES "1.234,50" / "1234,50" forms. Returns null for an empty cell
// (product imported without a price), a finite number when parseable, or NaN when the cell
// is non-empty but not a number (a real row error, surfaced by the descriptor).
function parsePrice(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s/g, '');
  if (s === '') return null;
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.'); // es-ES: '.' thousands, ',' decimal
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// The org's default price list versions (one for sales, one for purchase), each resolved
// ONCE per import run (not per row) and reused for every priced row. Keyed by
// token + direction, and the PENDING promise is stored synchronously so the
// bounded-concurrency pool's first few rows don't each fire the same fetch.
const salesPlvCache = new Map();

// Batch operations do not pass through the product NeoHandler, so they cannot
// receive the product defaults injected by ProductDefaultsHandler. Resolve the
// same official defaults endpoint once per import run and carry the UOM into
// every product operation explicitly. This keeps the value tenant-configurable
// and avoids duplicating a database ID in the frontend.
const productDefaultsCache = new Map();

async function fetchProductDefaults(token) {
  const base = detectEtendoBase();
  const url = `${base}/sws/neo/product/product/defaults`;
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: jsonHeaders(),
    });
    if (!res.ok) return {};
    const json = await res.json().catch(() => null);
    return json?.defaults ?? json?.response?.defaults ?? {};
  } catch (e) {
    return {};
  }
}

function resolveProductDefaults(token) {
  const key = token || 'default';
  if (!productDefaultsCache.has(key)) {
    productDefaultsCache.set(key, fetchProductDefaults(token));
  }
  return productDefaultsCache.get(key);
}

async function fetchPriceListVersion(spec, token, wantSales) {
  const base = detectEtendoBase();
  const url = `${base}/sws/neo/${spec}/price/selectors/${PLV_SELECTOR_COLUMN}`;
  const res = await fetch(url, { credentials: 'include', headers: jsonHeaders() });
  if (!res.ok) return null;
  const payload = await res.json().catch(() => null);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  // Sales: prefer an explicitly sales-flagged version, otherwise an unflagged one (the
  // catalog may not expose the flag — a human sees those in the Sales tab too).
  // Purchase: require the flag to be explicitly false. An unflagged version must NOT be
  // assumed to be a purchase list, or a sale price would silently land on it.
  const chosen = wantSales
    ? (items.find((it) => getSalesFlag(it) === true) ?? items.find((it) => getSalesFlag(it) === null) ?? null)
    : (items.find((it) => getSalesFlag(it) === false) ?? null);
  return chosen ? extractId(chosen.id ?? chosen) : null;
}

function resolvePlv(spec, token, wantSales) {
  const key = `${token || ''}|${wantSales ? 'sales' : 'purchase'}`;
  if (!salesPlvCache.has(key)) {
    salesPlvCache.set(key, fetchPriceListVersion(spec, token, wantSales));
  }
  return salesPlvCache.get(key);
}

// Existing product categories cache per token/run
const productCategoriesCache = new Map();

async function fetchProductCategories(token) {
  const base = detectEtendoBase();
  const url = `${base}/sws/neo/product-category/productCategory?limit=1000`;
  try {
    const res = await fetch(url, { credentials: 'include', headers: jsonHeaders() });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const data = json?.response?.data ?? json?.data ?? [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function getExistingCategories(token, existingCategoriesOverride) {
  if (existingCategoriesOverride) return Promise.resolve(existingCategoriesOverride);
  const key = token || 'default';
  if (!productCategoriesCache.has(key)) {
    productCategoriesCache.set(key, fetchProductCategories(token));
  }
  return productCategoriesCache.get(key);
}

/**
 * Resolve the row's Unit of Measure. A blank cell keeps the org default from the product
 * defaults endpoint (the previous, unconditional behaviour); a filled one is matched
 * against C_UOM through the registered `product-uom` resolver and fails the row when it
 * cannot be matched, rather than silently importing under the wrong unit.
 */
async function resolveUom(row, config, productDefaults) {
  const raw = String(row.uOM ?? '').trim();
  if (!raw) return productDefaults.uOM ?? undefined;
  const resolveUomFn = config.resolveUomFn || getFkResolver('product-uom');
  const result = await resolveUomFn(raw, { token: config.token });
  if (result.status !== 'auto-resolved') {
    const message = typeof config.translate === 'function'
      ? config.translate('importErrorUomUnresolved', { uom: raw })
      : `The unit of measure "${raw}" could not be matched to an existing record.`;
    throw new Error(message);
  }
  return result.id;
}

async function resolveCategory(row, config) {
  if (!row.category) return null;
  const categories = await getExistingCategories(config.token, config.existingCategories);
  const runCache = getResolutionCache(config.token || 'product-import');

  const createFn = config.createCategoryFn || (async ({ searchKey, name }) => {
    const base = detectEtendoBase();
    const url = `${base}/sws/neo/product-category/productCategory`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: writeHeaders(),
      body: JSON.stringify({ searchKey, name }),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const errDetail = errJson?.error?.message || errJson?.message || 'Category creation failed';
      throw new Error(errDetail);
    }
    const json = await res.json().catch(() => null);
    const record = json?.response?.data?.[0] ?? json?.data?.[0] ?? json;
    const createdId = record?.id ?? record?.M_Product_Category_ID;
    // Add newly created category to cached list for subsequent lookups
    if (createdId) {
      categories.push({ id: createdId, searchKey, name });
    }
    return { id: createdId, searchKey, name };
  });

  const categoryResolution = await resolveOrAutoCreateDependentEntity({
    // ETP-4995: categoryCode/categoryName/category were three separate columns for one
    // concept. `category` is now the only declared column, so the cell is probed against
    // the existing codes first and only then treated as a name.
    ...asDependentEntityInput(row.category, categories),
    existingRecords: categories,
    allowCreate: true,
    createFn,
    cache: runCache,
    translate: config.translate,
  });

  if (categoryResolution.status === 'error' || categoryResolution.status === 'unresolved') {
    throw categoryResolution.error || new Error('Category could not be resolved');
  }
  return categoryResolution.id ?? null;
}

/**
 * Build the M_ProductPrice operation for one direction, or null when the row carries no
 * price for it. Prices are not product fields — they live in a separate record tied to a
 * price list version — so each one becomes its own parentRef-linked op in the SAME /batch
 * call, mirroring ProductPriceBar.jsx's "add tariff" flow.
 *
 * ETP-4995: this used to exist only for sales, with one `price` column, so a purchase
 * price could not be imported at all.
 */
async function buildPriceOperation(rawPrice, { opId, wantSales, config }) {
  const price = parsePrice(rawPrice);
  if (price === null) return null; // no price cell → nothing to create for this direction

  if (Number.isNaN(price)) {
    const msg = typeof config.translate === 'function'
      ? config.translate('importErrorInvalidPrice', { value: rawPrice })
      : `The price "${rawPrice}" is not a valid number.`;
    throw new Error(msg);
  }

  const plvId = await resolvePlv(config.spec, config.token, wantSales);
  if (!plvId) {
    const key = wantSales ? 'importErrorNoPriceList' : 'importErrorNoPurchasePriceList';
    const fallback = wantSales
      ? 'No sales price list is configured in this environment, so the price could not be imported.'
      : 'No purchase price list is configured in this environment, so the purchase price could not be imported.';
    const msg = typeof config.translate === 'function' ? config.translate(key) : fallback;
    throw new Error(msg);
  }

  // One CSV price → standardPrice/listPrice/priceLimit, matching ProductPriceBar's add
  // flow (priceLimit defaults to the list price).
  const priceStr = String(price);
  return {
    id: opId,
    spec: config.spec,
    entity: 'price',
    parentRef: 'product',
    body: { priceListVersion: plvId, standardPrice: priceStr, listPrice: priceStr, priceLimit: priceStr },
  };
}

registerImportDescriptor('product', async (row, config) => {
  const productBody = pick(row, PRODUCT_TARGETS);

  const productDefaults = await resolveProductDefaults(config.token);
  const uOM = await resolveUom(row, config, productDefaults);
  if (uOM) productBody.uOM = uOM;

  productBody.productType = resolveCodedCellOrThrow(row.productType, PRODUCT_TYPE_VALUES, {
    defaultCode: DEFAULT_PRODUCT_TYPE,
    fieldLabelKey: 'importFieldProductType',
    fieldLabelFallback: 'Product Type',
    translate: config.translate,
  });

  const categoryId = await resolveCategory(row, config);
  if (categoryId) productBody.productCategory = categoryId;

  const ops = [{ id: 'product', spec: config.spec, entity: config.entity, body: productBody }];

  const priceOps = await Promise.all([
    buildPriceOperation(row.salesPrice, { opId: 'salesPrice', wantSales: true, config }),
    buildPriceOperation(row.purchasePrice, { opId: 'purchasePrice', wantSales: false, config }),
  ]);
  ops.push(...priceOps.filter(Boolean));
  return ops;
});
