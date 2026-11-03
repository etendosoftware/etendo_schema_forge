import { useMemo } from 'react';
import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import useOrderGlobalDiscountImport from './useOrderGlobalDiscountImport.jsx';
import {
  invoiceOrderImportConfig,
  fetchOrderDocuments,
  fetchOrderLines,
  getOrderDisplay,
  submitOrderImport,
} from './invoiceOrderImport.js';

/**
 * «Importar desde pedido» of an invoice — ONE component for sales and purchase invoices
 * (ETP-5828). `direction` picks the specs and the labels (`INVOICE_ORDER_IMPORT`); everything
 * else — the server-side `importOrderLines` action, the pending of `availableOrderLines`, the
 * global-discount notice and the footer counting ORDERS — is the same for both.
 *
 * @param {object} props  the parent's ImportLinesModal props (invoiceId, bpId, base, onClose, …)
 * @param {'sales'|'purchase'} props.direction
 */
export default function InvoiceOrderImportModal({ direction, ...props }) {
  const config = invoiceOrderImportConfig(direction);
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: the popup pulls from ANOTHER spec than its own window (an invoice
  // importing order lines), and resolveApiUrl only skips a prefix that matches - so a configured
  // base doubles it and 404s. The URLs already carry `base`.
  const apiFetch = useApiFetch('');
  const ui = useUI();
  const { serverCarry, ...globalDiscountProps } = useOrderGlobalDiscountImport();

  // Stable per apiFetch/direction: ImportLinesModal re-reads the documents when fetchDocuments
  // changes identity.
  const handlers = useMemo(() => ({
    fetchDocuments: (args) => fetchOrderDocuments({ ...args, apiFetch, config }),
    fetchLines: (args) => fetchOrderLines({ ...args, apiFetch, config }),
  }), [apiFetch, config]);

  const submitImport = (args) => submitOrderImport({ ...args, apiFetch, config, serverCarry, ui });

  return (
    <ImportLinesModal
      {...props}
      titleKey={config.titleKey}
      searchPlaceholderKey={config.searchPlaceholderKey}
      emptyMessageKey={config.emptyMessageKey}
      noSearchResultsKey="noOrdersMatchYourSearch"
      noCurrencyMatchMessageKey={config.noCurrencyMatchMessageKey}
      successMessageKey={config.successMessageKey}
      selectedDocumentsKey="importOrdersSelectedCount"
      importButtonKey="importSelectedOrders"
      fetchDocuments={handlers.fetchDocuments}
      fetchLines={handlers.fetchLines}
      getDocDisplay={getOrderDisplay}
      submitImport={submitImport}
      {...globalDiscountProps}
      data-testid="ImportLinesModal__52f314" />
  );
}
