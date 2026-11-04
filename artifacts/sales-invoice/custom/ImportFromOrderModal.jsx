import InvoiceOrderImportModal from '@/windows/custom/shared/InvoiceOrderImportModal.jsx';

/**
 * «Importar desde pedido» on a sales invoice: the shared invoice order-import popup in its sales
 * direction (ETP-5828). Kept as the window's entry point so InvoiceBottomPanel's wiring is stable;
 * all the logic lives in `tools/app-shell/src/windows/custom/shared/InvoiceOrderImportModal.jsx`.
 */
export default function ImportFromOrderModal(props) {
  return <InvoiceOrderImportModal {...props} direction="sales" />;
}
