import InvoiceOrderImportModal from '@/windows/custom/shared/InvoiceOrderImportModal.jsx';

/**
 * «Importar desde pedido» on a purchase invoice: the shared invoice order-import popup in its
 * purchase direction (ETP-5828). Since QA MCP-2 it lists and imports exactly like sales and the
 * MCP: the invoice's `availableOrders` / `availableOrderLines` with the server pending rule (drafts
 * deducted), and ONE `importOrderLines` call that also carries the global discount. Kept as the
 * window's entry point so PurchaseInvoiceBottomPanel's wiring is stable.
 */
export default function ImportFromPurchaseOrderModal(props) {
  return <InvoiceOrderImportModal {...props} direction="purchase" />;
}
