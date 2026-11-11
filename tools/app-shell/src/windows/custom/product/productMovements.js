import { resolveBackendSort } from '@/lib/gridQuery.js';
import { getDateBounds, toDateParam } from '@/lib/dateRangeBounds.js';

// ETP-5889 — pure helpers behind the Product "Movements" tab: how a view (direction, period, warehouse,
// sort) becomes a NEO list query, and how a transaction row becomes its type label and colour.

export const MOVEMENTS_PAGE_SIZE = 50;

// Request parameter carrying the order of the type buckets (contract: neo-headless.md §5.3.4.a).
export const TYPE_ORDER_PARAM = 'typeLabelOrder';

// The updated design (2026-11-11) opens on the last 30 days (it was 7): fewer empty opens for products
// without recent activity.
export const DEFAULT_MOVEMENTS_PERIOD = Object.freeze({ presetId: 'last30' });

// Sortable columns -> backend column. The foreign key is sorted by its identifier (the warehouse name),
// not by its id; every other key is a physical column of M_Transaction, so the backend can order by it.
// `etgoWarehouse` and `etgoDocKind` are stored computed columns (EM_Etgo_*), for that reason.
const SORT_COLUMNS = Object.freeze({
  date: { key: 'movementDate' },
  type: { key: 'etgoDocKind' },
  warehouse: { key: 'etgoWarehouse', sortMode: 'identifier' },
  quantity: { key: 'movementQuantity' },
  cost: { key: 'transactionCost' },
});

export const MOVEMENTS_DEFAULT_SORT = Object.freeze({ key: 'date', direction: 'desc' });

export function isMovementsSortKey(key) {
  return Object.hasOwn(SORT_COLUMNS, key);
}

/** The Movements tab only applies to stocked items: a service, expense or resource has no stock. */
export function isStorableProduct(product) {
  if (!product?.id) return false;
  const stocked = product.stocked;
  const notStocked = stocked === false || stocked === 'N';
  return product.productType === 'I' && !notStocked;
}

/**
 * Whether the tab is offered at all. A saved product that is not stocked has no use for it, so it is
 * hidden; an unsaved one is offered, because DetailView shows a tab that `requiresSavedRecord`
 * disabled with its hint (ETP-5309) instead of making it disappear.
 */
export function shouldShowMovementsTab(product) {
  return product?.id ? isStorableProduct(product) : true;
}

/** Filters of the view as the criteria NEO understands (the same shape `buildBackendFilter` emits). */
export function buildMovementsCriteria({ direction = 'all', dateRange = null, warehouseId = null } = {}) {
  const criteria = [];
  if (direction === 'in') criteria.push({ fieldName: 'movementQuantity', operator: 'greaterThan', value: 0 });
  if (direction === 'out') criteria.push({ fieldName: 'movementQuantity', operator: 'lessThan', value: 0 });

  const { from, to } = getDateBounds(dateRange);
  const fromParam = toDateParam(from);
  const toParam = toDateParam(to);
  if (fromParam) criteria.push({ fieldName: 'movementDate', operator: 'greaterOrEqual', value: fromParam });
  if (toParam) criteria.push({ fieldName: 'movementDate', operator: 'lessOrEqual', value: toParam });

  if (warehouseId) criteria.push({ fieldName: 'etgoWarehouse', operator: 'equals', value: warehouseId });
  return criteria;
}

// Several movements of a product share a movement date (it carries no time), so the date alone leaves their
// order to the database. The stock after each movement is summed by (movement date, processing time, id);
// ordering by the same keys keeps the list reading in the order the stock was computed, and keeps the
// pages stable. Another column leaves its ties to the most recent movement first.
function tieBreakers(sortKey, direction) {
  const dir = sortKey === 'date' && direction === 'asc' ? '' : '-';
  const keys = ['transactionProcessDate', 'id'].map((key) => `${dir}${key}`);
  return sortKey === 'date' ? keys : ['-movementDate', ...keys];
}

// A list of sort criteria is read with one convention: a `-` prefix for descending, none for ascending.
// `resolveBackendSort` answers `<column> <direction>` for a plain column, so it is put in that convention
// before the tie-breakers are appended; the two forms are not mixed in one `_sortBy`.
function prefixed(sortBy) {
  const [, column, direction] = /^(\S+) (asc|desc)$/.exec(sortBy) ?? [];
  if (!column) return sortBy;
  return direction === 'desc' ? `-${column}` : column;
}

/** Path + query string of one page of the product's transactions (`start` is the first row, 0-based). */
export function buildMovementsQuery({ productId, filters = {}, sort = MOVEMENTS_DEFAULT_SORT, start = 0, pageSize = MOVEMENTS_PAGE_SIZE, typeOrder = null }) {
  // An unknown column falls back to the default sort, tie-breakers included.
  const sortKey = isMovementsSortKey(sort?.key) ? sort.key : MOVEMENTS_DEFAULT_SORT.key;
  const column = SORT_COLUMNS[sortKey];
  const params = new URLSearchParams();
  params.append('parentId', productId);
  const direction = sort?.direction ?? MOVEMENTS_DEFAULT_SORT.direction;
  params.append('_sortBy', [prefixed(resolveBackendSort(column, direction)), ...tieBreakers(sortKey, direction)].join(','));
  // The Type column is sorted by what the user reads (the translated label), which no column holds: the
  // order of the label buckets in the active language travels with the sort, the backend ranks by it. A
  // backend that does not know the parameter ignores it and keeps ordering by the stored code.
  if (sortKey === 'type' && typeOrder) params.append(TYPE_ORDER_PARAM, typeOrder);
  params.append('_startRow', String(start));
  params.append('_endRow', String(start + pageSize - 1));
  const criteria = buildMovementsCriteria(filters);
  if (criteria.length) params.append('criteria', JSON.stringify(criteria));
  return `/transactions?${params.toString()}`;
}

/** True when the filters (period, direction, warehouse) leave the product's movements untouched. */
export function isUnfilteredMovements(filters = {}) {
  return buildMovementsCriteria(filters).length === 0;
}

/** Path + query string of the probe: ONE record of the product, no period/direction/warehouse criteria. */
export function buildAnyMovementQuery({ productId, sort = MOVEMENTS_DEFAULT_SORT }) {
  return buildMovementsQuery({ productId, filters: {}, sort, start: 0, pageSize: 1 });
}

/**
 * Which empty state an empty page deserves.
 *  - 'none'      the product has no movement at all (the design's empty state);
 *  - 'filtered'  it has movements, the filters match none of them;
 *  - 'checking'  the probe is still in flight (nothing is shown yet).
 * `probe` is the answer of the probe: 'any', 'none', 'failed' or absent. A failed probe falls back to 'filtered'.
 */
export function resolveMovementsEmptyKind({ filters, probe }) {
  if (isUnfilteredMovements(filters)) return 'none';
  if (probe === 'none') return 'none';
  if (probe === 'any' || probe === 'failed') return 'filtered';
  return 'checking';
}

// The visible type of a movement is one of eight BUCKETS, one per distinct label. The rule that picks it is
// mirrored in SQL by `ProductMovementTypeOrder#bucketCase` (com.etendoerp.go), which ranks rows for the Type
// sort; both are covered by the same table of cases (BUCKET_CASES in productMovements.vitest.js and
// ProductTransactionsHandlerTest), so a change to the rule has to change both sides and both tests.
export const MOVEMENT_BUCKETS = Object.freeze([
  'vendor-receipt', 'vendor-return', 'customer-shipment', 'customer-return',
  'transfer', 'internal-consumption', 'inventory-in', 'inventory-out',
]);

const BUCKET_LABELS = {
  'vendor-receipt': 'productMovementsTypeVendorReceipt',
  'vendor-return': 'movTypeVendorReturn',
  'customer-shipment': 'productMovementsTypeCustomerShipment',
  'customer-return': 'movTypeCustomerReturn',
  transfer: 'productMovementsTypeTransfer',
  'internal-consumption': 'movTypeInternalConsumption',
  'inventory-in': 'productMovementsTypeInventoryIn',
  'inventory-out': 'productMovementsTypeInventoryOut',
};

// Source-document kind -> bucket. A return keeps the base movement type and is told apart by the
// IsReturn flag of its document type; the backend resolves that into `etgoDocKind`.
const KIND_BUCKETS = {
  'goods-receipt': 'vendor-receipt',
  'return-to-vendor-shipment': 'vendor-return',
  'goods-shipment': 'customer-shipment',
  'return-material-receipt': 'customer-return',
  'goods-movements': 'transfer',
  'internal-consumption': 'internal-consumption',
};

// Rows with no document kind (production, work orders) fall back to the movement type code.
const CODE_BUCKETS = {
  'V+': 'vendor-receipt',
  'V-': 'vendor-return',
  'C-': 'customer-shipment',
  'C+': 'customer-return',
  'I+': 'inventory-in',
  'I-': 'inventory-out',
  'M+': 'transfer',
  'M-': 'transfer',
  'D+': 'internal-consumption',
  'D-': 'internal-consumption',
};

/**
 * The bucket (the visible type) of a transaction row, or null when nothing maps. The sign of the quantity
 * corrects a purchase receipt or sales shipment that moved the other way (a vendor return, a customer
 * return) and splits a physical inventory into in / out.
 */
export function resolveMovementBucket(row) {
  const quantity = Number(row?.movementQuantity);
  const kind = row?.etgoDocKind ?? null;

  let bucket = kind ? KIND_BUCKETS[kind] ?? null : null;
  if (kind === 'goods-receipt' && quantity < 0) bucket = 'vendor-return';
  if (kind === 'goods-shipment' && quantity > 0) bucket = 'customer-return';
  if (kind === 'physical-inventory') bucket = quantity < 0 ? 'inventory-out' : 'inventory-in';
  return bucket ?? CODE_BUCKETS[row?.movementType] ?? null;
}

/**
 * Label key and colour of a transaction. The sign decides the colour (green in, orange out) except for
 * a transfer between warehouses, which is neutral.
 *
 * @returns {{ labelKey: string|null, tone: 'in'|'out'|'neutral' }} `labelKey` is null when nothing maps
 */
export function resolveMovementType(row) {
  const bucket = resolveMovementBucket(row);
  const labelKey = bucket ? BUCKET_LABELS[bucket] : null;
  const tone = bucket === 'transfer' ? 'neutral' : quantityTone(Number(row?.movementQuantity));
  return { labelKey, tone };
}

// `es_ES` (the app's locale code) -> `es-ES` (BCP 47). An unusable code falls back to the default collation.
const toLanguageTag = (locale) => String(locale ?? '').replace('_', '-') || undefined;

/**
 * The bucket ids sorted alphabetically by their visible label in the active language, comma-separated
 * (the value of `typeLabelOrder`). `translate` is the UI dictionary lookup (`useUI()`), `locale` the app
 * locale code, so the order is the one the user sees in that language and changes with it.
 */
export function buildTypeLabelOrder(translate, locale) {
  let collator;
  try {
    collator = new Intl.Collator(toLanguageTag(locale));
  } catch {
    collator = new Intl.Collator();
  }
  return MOVEMENT_BUCKETS
    .map((bucket, index) => ({ bucket, index, label: String(translate(BUCKET_LABELS[bucket]) ?? '') }))
    .sort((a, b) => collator.compare(a.label, b.label) || a.index - b.index)
    .map(({ bucket }) => bucket)
    .join(',');
}

/** Colour of a quantity by its sign: green in, orange out, neutral for zero or not a number. */
export function quantityTone(value) {
  const quantity = Number(value);
  if (quantity > 0) return 'in';
  if (quantity < 0) return 'out';
  return 'neutral';
}

/** Quantity with its sign always visible (`+4`, `−4`), the way the design shows it. */
export function signedQuantity(value, formatNumber) {
  // A missing quantity is not a zero: Number(null) is 0, so it is ruled out first.
  if (value == null || value === '') return '—';
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return '—';
  const text = formatNumber(Math.abs(quantity));
  if (quantity > 0) return `+${text}`;
  if (quantity < 0) return `−${text}`;
  return text;
}

const PROCESS_TIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d)/;

/**
 * `HH:mm` of the movement's `etgoProcessTime` (`YYYY-MM-DDTHH:mm:ss`, already the wall clock, no zone).
 * Read straight from the string: no `Date`, no `Intl`, no zone math, so a `Z`/offset suffix is ignored,
 * never applied. Null when the value is absent or malformed, so the cell shows no second line.
 */
export function formatProcessTime(raw) {
  if (typeof raw !== 'string') return null;
  const match = PROCESS_TIME.exec(raw);
  return match ? `${match[1]}:${match[2]}` : null;
}
