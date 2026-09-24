import { apiFetch } from '@/auth/api.js';

// Enriches a raw source-document line (shipment/receipt) with the fields
// ImportLinesModal expects for display and qty clamping. Shared between the
// return-material-receipt and return-to-vendor-shipment "Importar desde"
// wrappers — the source line shape is identical on both sides.
export function enrichReturnLine(line) {
  return {
    ...line,
    _maxQty: Math.max(0, Number(line.movementQuantity) || 0),
    _productName: line['product$_identifier'] || line.id,
  };
}

export const getReturnDocDisplay = (doc) => ({ docNo: doc.documentNo || doc.id, date: doc.movementDate });

// Batch-submits the selected return lines to a NEO action endpoint shaped
// POST {lines:[{sourceLineId, returnQuantity}]} -> {response:{data:{importedCount}}}.
// `actionUrl(base, invoiceId)` is per-window (different action name/path).
export async function submitReturnImportBatch({ lines, base, invoiceId, actionUrl }) {
  const res = await apiFetch(actionUrl(base, invoiceId), {
    baseUrl: '',
    method: 'POST',
    body: JSON.stringify({ lines: lines.map(({ line, qty }) => ({ sourceLineId: line.id, returnQuantity: qty })) }),
  });
  if (!res.ok) return { ok: false };
  const body = await res.json();
  return { ok: true, count: body?.response?.data?.importedCount ?? lines.length };
}
