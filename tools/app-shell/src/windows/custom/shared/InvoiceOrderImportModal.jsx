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
  buildOrderInvoiceLineBody,
} from './invoiceOrderImport.js';

/**
 * «Importar desde pedido» of an invoice — ONE component for sales and purchase invoices
 * (ETP-5828). `direction` picks the specs, the labels and the data path (`INVOICE_ORDER_IMPORT`,
 * `importVia`): `'server'` imports with the `importOrderLines` action (sales), `'client'` POSTs
 * each line from the browser and PATCHes the header % afterwards (purchases, until QA decides the
 * draft-pending rule, MCP-2). The look — the Figma popup, the global-discount notice, the footer
 * counting ORDERS — is the same for both.
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
  const viaServer = config.importVia === 'server';
  // The client path needs the header endpoint for its browser-side PATCH (the hook's afterImport).
  const { serverCarry, ...globalDiscountProps } = useOrderGlobalDiscountImport(
    viaServer ? undefined : { headerEndpoint: `${config.invoiceSpec}/header` },
  );

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
      {...(viaServer
        ? { submitImport }
        : { linesEndpoint: `${config.invoiceSpec}/lines`, buildLineBody: buildOrderInvoiceLineBody })}
      {...globalDiscountProps}
      data-testid="ImportLinesModal__52f314" />
  );
}
