import { resolveBackendSort } from '@/lib/gridQuery.js';
import { getDateBounds, toDateParam } from '@/lib/dateRangeBounds.js';

// ETP-5889 — pure helpers behind the Product "Movements" tab: how a view (direction, period, warehouse,
// sort) becomes a NEO list query, and how a transaction row becomes its type label and colour.

export const MOVEMENTS_PAGE_SIZE = 50;

// The design opens on the last 7 days.
export const DEFAULT_MOVEMENTS_PERIOD = Object.freeze({ presetId: 'last7' });

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

/** Path + query string of one page of the product's transactions (`start` is the first row, 0-based). */
export function buildMovementsQuery({ productId, filters = {}, sort = MOVEMENTS_DEFAULT_SORT, start = 0, pageSize = MOVEMENTS_PAGE_SIZE }) {
  const column = SORT_COLUMNS[sort?.key] ?? SORT_COLUMNS[MOVEMENTS_DEFAULT_SORT.key];
  const params = new URLSearchParams();
  params.append('parentId', productId);
  params.append('_sortBy', resolveBackendSort(column, sort?.direction ?? MOVEMENTS_DEFAULT_SORT.direction));
  params.append('_startRow', String(start));
  params.append('_endRow', String(start + pageSize - 1));
  const criteria = buildMovementsCriteria(filters);
  if (criteria.length) params.append('criteria', JSON.stringify(criteria));
  return `/transactions?${params.toString()}`;
}

/** Total movements of the product, whatever the filters: one row is requested, only `totalRows` is read. */
export function buildMovementsCountQuery(productId) {
  return `/transactions?parentId=${encodeURIComponent(productId)}&_startRow=0&_endRow=0`;
}

// Source-document kind -> label key. A return keeps the base movement type and is told apart by the
// IsReturn flag of its document type; the backend resolves that into `etgoDocKind`.
const KIND_LABELS = {
  'goods-receipt': 'productMovementsTypeVendorReceipt',
  'return-to-vendor-shipment': 'movTypeVendorReturn',
  'goods-shipment': 'productMovementsTypeCustomerShipment',
  'return-material-receipt': 'movTypeCustomerReturn',
  'goods-movements': 'productMovementsTypeTransfer',
  'internal-consumption': 'movTypeInternalConsumption',
};

// Rows with no document kind (production, work orders) fall back to the movement type code.
const CODE_LABELS = {
  'V+': 'productMovementsTypeVendorReceipt',
  'V-': 'movTypeVendorReturn',
  'C-': 'productMovementsTypeCustomerShipment',
  'C+': 'movTypeCustomerReturn',
  'I+': 'productMovementsTypeInventoryIn',
  'I-': 'productMovementsTypeInventoryOut',
  'M+': 'productMovementsTypeTransfer',
  'M-': 'productMovementsTypeTransfer',
  'D+': 'movTypeInternalConsumption',
  'D-': 'movTypeInternalConsumption',
};

/**
 * Label key and colour of a transaction. The sign decides the colour (green in, orange out) except for
 * a transfer between warehouses, which is neutral. The sign also corrects the label of a purchase
 * receipt or sales shipment that moved the other way (a vendor return, a customer return).
 *
 * @returns {{ labelKey: string|null, tone: 'in'|'out'|'neutral' }} `labelKey` is null when nothing maps
 */
export function resolveMovementType(row) {
  const quantity = Number(row?.movementQuantity);
  const kind = row?.etgoDocKind ?? null;
  const direction = quantityTone(quantity);

  let labelKey = kind ? KIND_LABELS[kind] ?? null : null;
  if (kind === 'goods-receipt' && quantity < 0) labelKey = KIND_LABELS['return-to-vendor-shipment'];
  if (kind === 'goods-shipment' && quantity > 0) labelKey = KIND_LABELS['return-material-receipt'];
  if (kind === 'physical-inventory') labelKey = quantity < 0 ? 'productMovementsTypeInventoryOut' : 'productMovementsTypeInventoryIn';
  if (!labelKey) labelKey = CODE_LABELS[row?.movementType] ?? null;

  const tone = labelKey === 'productMovementsTypeTransfer' ? 'neutral' : direction;
  return { labelKey, tone };
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
