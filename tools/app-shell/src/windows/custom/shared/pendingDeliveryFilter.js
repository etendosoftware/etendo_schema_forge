/**
 * Builds the initialAdvancedFilter, initialColumnFilters, and isPendingDelivery
 * flag for order list views that support the ?filter=pendingDelivery URL param.
 *
 * @param {URLSearchParams} searchParams - from useSearchParams()
 * @param {string} deliveryField - key of the delivery-status field in the contract
 *   (e.g. 'deliveryStatusPurchase' for purchase orders, 'deliveryStatus' for sales orders)
 */
export function buildPendingDeliveryFilter(searchParams, deliveryField) {
  const docStatus = searchParams.get('DocStatus');
  const filterParam = searchParams.get('filter');
  const isPendingDelivery = filterParam === 'pendingDelivery';

  return {
    initialColumnFilters: docStatus ? { documentStatus: docStatus } : undefined,
    isPendingDelivery,
    // ETP-5009 — tells ListView that the filters above came from the URL, so they
    // outrank the grid state saved from a previous visit to this window.
    initialFiltersFromUrl: isPendingDelivery || Boolean(docStatus),
    initialAdvancedFilter: isPendingDelivery
      ? {
          rowOperator: 'and',
          conditions: [
            { field: 'documentStatus', operator: 'equals', value: 'CO' },
            { field: deliveryField, operator: 'lessThan', value: 100 },
          ],
        }
      : null,
  };
}
