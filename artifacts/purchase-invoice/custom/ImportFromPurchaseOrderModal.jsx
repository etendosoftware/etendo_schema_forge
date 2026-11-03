import InvoiceOrderImportModal from '@/windows/custom/shared/InvoiceOrderImportModal.jsx';

/**
 * «Importar desde pedido» on a purchase invoice: the shared invoice order-import popup in its
 * purchase direction (ETP-5828). Like sales, it imports through the server `importOrderLines`
 * action of `purchase-invoice` — no line is created from the browser and no header PATCH follows.
 * Kept as the window's entry point so PurchaseInvoiceBottomPanel's wiring is stable.
 */
export default function ImportFromPurchaseOrderModal(props) {
  return <InvoiceOrderImportModal {...props} direction="purchase" />;
}
