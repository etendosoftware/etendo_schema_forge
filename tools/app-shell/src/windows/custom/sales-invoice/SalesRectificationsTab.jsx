import { useEffect, useRef } from 'react';
import { getArSubtype } from '@generated/sales-invoice/custom/invoiceSubtype.js';
import ReversedInvoicesPanel from './ReversedInvoicesPanel.jsx';

/**
 * Whether a sales invoice shows the "Rectificaciones" tab: only when its document type is a
 * rectificative (ETP-6002, CP-26). Decided by the same AR subtype rule the rest of the window
 * uses (`getArSubtype`): the server's `arInvoiceSubtype` once the invoice has been read, and the
 * selected document type's identifier on a new invoice, which has no detail GET yet.
 *
 * An ORIGINAL invoice never shows the tab, even when something rectifies it: it sees its
 * rectificatives as related-documents chips (`rectifyingInvoices`) instead. The in-tab view of
 * those incoming rows (ETP-5745 CP-12) is dropped on purpose by ETP-6002.
 *
 * @param {object|null|undefined} data — the record the detail view is editing
 * @returns {boolean}
 */
export function isRectificationsTabVisible(data) {
  return getArSubtype(data) === 'RECTIFICATIVA';
}

/**
 * Sales-only wrapper of the shared `ReversedInvoicesPanel` (the purchase window mounts the panel
 * directly). The tab is a `window.extraTabs` entry, which `DetailView` always shows unless its
 * component reports `onVisibilityChange(false)`; the `reversedInvoices` entity's `displayLogic`
 * does not apply to it, because that entity's own tab is not rendered (`renderTab: false`).
 * Renders nothing while hidden, so a plain invoice never loads the panel's rows.
 */
export default function SalesRectificationsTab(props) {
  const { data, onVisibilityChange } = props;
  const visible = isRectificationsTabVisible(data);
  // DetailView hands a new callback on every render; only a change of `visible` is reported.
  const reportVisibility = useRef(onVisibilityChange);
  reportVisibility.current = onVisibilityChange;
  useEffect(() => {
    reportVisibility.current?.(visible);
  }, [visible]);

  if (!visible) return null;
  return <ReversedInvoicesPanel {...props} data-testid="ReversedInvoicesPanel__sales" />;
}
