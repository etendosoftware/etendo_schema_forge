import { registerImportDescriptor } from '@etendosoftware/app-shell-core/lib/import/buildOperations.js';
import { parseBoolean } from '@/lib/parseBoolean.js';

// The simplified Products CSV import supports exactly 4 columns: searchKey (código),
// name (nombre), description (descripción) and price (precio). uOM/productCategory/
// taxCategory were dropped — their free-text CSV values don't fuzzy-match real records,
// and all three resolve on their own server-side (productCategory via its AD_Column @SQL
// default; uOM/taxCategory via NeoDefaultsService.tryInjectFirstFromLookup, which picks
// the first active record for combo-style TableDir refs — ETP-3894).
const PRODUCT_TARGETS = ['searchKey', 'name', 'description'];

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

// The org's default SALES price list version, resolved ONCE per import run (not per row)
// and reused for every priced row. Keyed by token, and the PENDING promise is stored
// synchronously so the bounded-concurrency pool's first few rows don't each fire the fetch.
const salesPlvCache = new Map();

async function fetchSalesPriceListVersion(spec, token) {
  const base = detectEtendoBase();
  const url = `${base}/sws/neo/${spec}/price/selectors/${PLV_SELECTOR_COLUMN}`;
  const res = await fetch(url, { credentials: 'include', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const payload = await res.json().catch(() => null);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  // Prefer an explicitly sales-flagged version; otherwise an unflagged one (the catalog
  // may not expose the flag — a human sees those in the Sales tab too). A catalog that has
  // ONLY purchase-flagged versions (or is empty) yields no sales PLV → null → row error.
  const chosen = items.find((it) => getSalesFlag(it) === true)
    ?? items.find((it) => getSalesFlag(it) === null)
    ?? null;
  return chosen ? extractId(chosen.id ?? chosen) : null;
}

function resolveSalesPlv(spec, token) {
  const key = token || '';
  if (!salesPlvCache.has(key)) {
    salesPlvCache.set(key, fetchSalesPriceListVersion(spec, token));
  }
  return salesPlvCache.get(key);
}

registerImportDescriptor('product', async (row, config) => {
  const productOp = { id: 'product', spec: config.spec, entity: config.entity, body: pick(row, PRODUCT_TARGETS) };
  const ops = [productOp];

  const price = parsePrice(row.price);
  if (price === null) return ops; // no price cell → import the product only

  if (Number.isNaN(price)) {
    const msg = typeof config.translate === 'function'
      ? config.translate('importErrorInvalidPrice', { value: row.price })
      : `The price "${row.price}" is not a valid number.`;
    throw new Error(msg);
  }

  const plvId = await resolveSalesPlv(config.spec, config.token);
  if (!plvId) {
    const msg = typeof config.translate === 'function'
      ? config.translate('importErrorNoPriceList')
      : 'No sales price list is configured in this environment, so the price could not be imported.';
    throw new Error(msg);
  }

  // Single CSV `price` → standardPrice/listPrice/priceLimit, matching ProductPriceBar's add
  // flow (priceLimit defaults to the list price). parentRef links this to the product op's
  // created id in the same batch — no explicit `product`/`parentId` here (unknown until the
  // product commits), exactly like contactsImportDescriptor's locationAddress/contact ops.
  const priceStr = String(price);
  ops.push({
    id: 'price',
    spec: config.spec,
    entity: 'price',
    parentRef: 'product',
    body: { priceListVersion: plvId, standardPrice: priceStr, listPrice: priceStr, priceLimit: priceStr },
  });
  return ops;
});
