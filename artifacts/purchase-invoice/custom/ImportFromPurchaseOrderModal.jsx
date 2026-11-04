import InvoiceOrderImportModal from '@/windows/custom/shared/InvoiceOrderImportModal.jsx';

/**
 * «Importar desde pedido» on a purchase invoice: the shared invoice order-import popup in its
 * purchase direction (ETP-5828). Until QA decides the draft-pending rule (MCP-2) it imports
 * client-side (`INVOICE_ORDER_IMPORT.purchase.importVia = 'client'`): one line POST per selected
 * line, then the header % PATCHed from the browser, as before the unification. Kept as the window's entry point so PurchaseInvoiceBottomPanel's wiring is stable.
 */
export default function ImportFromPurchaseOrderModal(props) {
  return <InvoiceOrderImportModal {...props} direction="purchase" />;
}
