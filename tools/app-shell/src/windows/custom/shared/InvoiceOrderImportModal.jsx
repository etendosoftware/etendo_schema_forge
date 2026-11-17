import { useMemo, useRef } from 'react';
import { toast } from 'sonner';
import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useUI } from '@/i18n';
import { formatGroupedNumber } from '@/lib/formatCurrency.js';
import useOrderGlobalDiscountImport from './useOrderGlobalDiscountImport.jsx';
import {
  invoiceOrderImportConfig,
  fetchOrderDocuments,
  fetchOrderLines,
  describeLoadFailure,
  getOrderDisplay,
  getOrderTotal,
  isOrderCovered,
  orderLineNote,
  submitOrderImport,
} from './invoiceOrderImport.js';

/**
 * «Importar desde pedido» of an invoice — ONE component for sales and purchase invoices
 * (ETP-5828). `direction` picks the specs and the labels (`INVOICE_ORDER_IMPORT`); both directions
 * list through the invoice's `availableOrders` / `availableOrderLines` (ETP-6099) and import with
 * ONE `importOrderLines` call (purchases too since QA MCP-2), the same actions the MCP uses. The
 * look — the Figma popup, the global-discount notice, the footer counting the selected lines — is
 * the same for both.
 *
 * @param {object} props  the parent's ImportLinesModal props (invoiceId, bpId, base, onClose, …)
 * @param {'sales'|'purchase'} props.direction
 */
// Quantities may be fractional (kg, hours): up to 4 decimals, grouped like every quantity.
const fmtQty = (value) => formatGroupedNumber(value, { maximumFractionDigits: 4 });

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
  // ETP-5828 — a failed read is told with the toast the popup already uses for its import errors;
  // the list then shows what it showed before (no orders / an empty order). Both directions list
  // through the invoice's actions since ETP-6099, so both toast. `ui` is read through a ref so the
  // handlers keep their identity: the modal refetches when they change.
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const handlers = useMemo(() => ({
    fetchDocuments: (args) => fetchOrderDocuments({ ...args, apiFetch, config }).catch((err) => {
      toast.error(describeLoadFailure(err, uiRef.current));
      return { documents: [], sharedContext: { invoiceId: args.invoiceId }, excludedByCurrency: false };
    }),
    fetchLines: (args) => fetchOrderLines({ ...args, apiFetch, config }).catch((err) => {
      toast.error(describeLoadFailure(err, uiRef.current));
      return [];
    }),
  }), [apiFetch, config]);

  const submitImport = (args) => submitOrderImport({ ...args, apiFetch, config, serverCarry, ui });
  // QA UI-4 / OBS-2 — a line taken (wholly or partly) by other drafts names them.
  const describeLine = (line, state) => orderLineNote(line, state, ui, fmtQty);

  return (
    <ImportLinesModal
      {...props}
      titleKey={config.titleKey}
      searchPlaceholderKey={config.searchPlaceholderKey}
      emptyMessageKey={config.emptyMessageKey}
      noSearchResultsKey="noOrdersMatchYourSearch"
      noCurrencyMatchMessageKey={config.noCurrencyMatchMessageKey}
      successMessageKey={config.successMessageKey}
      fetchDocuments={handlers.fetchDocuments}
      fetchLines={handlers.fetchLines}
      getDocDisplay={getOrderDisplay}
      // ETP-6099 — the lines are read when an order is opened; the row hides a covered order and
      // shows its total from the `availableOrders` row.
      eagerLoadLines={false}
      isDocumentCovered={isOrderCovered}
      getDocumentTotal={getOrderTotal}
      submitImport={submitImport}
      describeLine={describeLine}
      // QA UI-6 — only the order popups count lines in the footer («2 líneas seleccionadas»).
      countLinesInFooter
      {...globalDiscountProps}
      data-testid="ImportLinesModal__52f314" />
  );
}
