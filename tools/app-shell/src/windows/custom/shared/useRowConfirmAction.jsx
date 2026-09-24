import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { ConfirmResultModal } from '@/components/contract-ui';
import { useDocumentAction } from '@/hooks/useDocumentAction';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { buildHeaders } from '@/auth/api.js';

/**
 * ETP-5378 — "Confirmar" in the grid's row-hover kebab for the two albarán windows,
 * at parity with Pedido de Venta/Compra, whose kebab has offered it since
 * useOrderWindow's `confirm` entry. It opens the very same popup the window already
 * shows in form view (GoodsShipmentConfirmModal / ConfirmGoodsReceiptModal), so the
 * user can confirm — and optionally create the invoice — without opening the record.
 *
 * <b>Why it refetches the record instead of using the row.</b> Both confirm modals read
 * `linkedOrders` and `resolvedPriceListId`, and those are enriched ONLY on a detail GET:
 * `Goods{Shipment,Receipt}HeaderHandler#afterHandle` gates that whole block on
 * `context.getRecordId() != null`, and the list branch next to it computes just
 * `invoiceStatus`. Feeding the modal the grid row would therefore read as "no linked
 * order, no resolved tariff" on every row — silently offering the system-default price
 * list and creating the invoice against the wrong one. The extra GET is the price of
 * driving a detail-shaped modal from the list; it happens once, on click.
 *
 * The fully-invoiced shortcut mirrors ETP-5265 in the form (goods-shipment/goods-receipt):
 * there is nothing to offer in the popup when the document is already 100% invoiced, so it
 * confirms directly. The two return windows do NOT have that shortcut in their own form —
 * `ConfirmWithCreditButtonBase` always opens its popup on a draft, only disabling the
 * "create invoice" toggle once fully invoiced — so `skipPopupWhenFullyInvoiced: false` lets
 * a caller opt out and keep the row-hover flow identical to its own form.
 *
 * @param {object}   params
 * @param {string}   params.specName        NEO spec segment, e.g. "goods-shipment"
 * @param {string}   params.entityName      entity segment, e.g. "goodsShipment"
 * @param {string}   params.apiBaseUrl      spec-scoped base URL
 * @param {string}   params.token           bearer token
 * @param {Function} params.ConfirmModal    the window's own confirm modal component
 * @param {string}   params.confirmedTitleKey    i18n key for the "confirmed, no invoice" toast
 * @param {string}   params.invoiceResultTitleKey i18n key for the result popup's title
 * @param {string}   params.invoiceDocType  ConfirmResultModal doc type, e.g. "facturaVenta"
 * @param {string}   params.invoiceRoute    route prefix of the created invoice
 * @param {boolean}  [params.skipPopupWhenFullyInvoiced=true] confirm directly, without ever
 *   opening `ConfirmModal`, on an already-fully-invoiced document
 * @param {Function} params.onRefresh       called after a successful confirm
 * @returns {{confirmMenuAction: Function, confirmPortal: JSX.Element}}
 */
export function useRowConfirmAction({
  specName,
  entityName,
  apiBaseUrl,
  token,
  ConfirmModal,
  confirmedTitleKey,
  invoiceResultTitleKey,
  invoiceDocType,
  invoiceRoute,
  skipPopupWhenFullyInvoiced = true,
  onRefresh,
}) {
  const ui = useUI();
  const navigate = useNavigate();
  // Same derivation the form-view action components use: apiBaseUrl is already scoped to
  // the spec, and the modals want the unscoped root.
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const apiFetch = useApiFetch(base);
  // The confirm modals take a plain `headers` object (they hand it to their own calls),
  // so it goes through buildHeaders rather than being hand-rolled here — the
  // auth-header-policy guardrail (ETP-5022) fails the build on a literal Authorization,
  // and a hand-rolled one also drops Accept-Language, which silently resolves reference
  // data in the wrong locale.
  const headers = useMemo(() => buildHeaders(token), [token]);

  const [confirmRecord, setConfirmRecord] = useState(null);
  const [invoiceResult, setInvoiceResult] = useState(null);
  const inFlightRef = useRef(false);
  const resultNavigatedRef = useRef(false);

  const docAction = useDocumentAction({ apiBaseUrl, entity: entityName, token });

  const finishWithoutInvoice = useCallback(() => {
    toast.success(ui(confirmedTitleKey));
    onRefresh?.();
  }, [ui, confirmedTitleKey, onRefresh]);

  const openConfirm = useCallback(async ({ row }) => {
    if (inFlightRef.current || !row?.id) return;
    inFlightRef.current = true;
    const toastId = toast.loading(ui('processing'));
    try {
      const res = await apiFetch(`/${specName}/${entityName}/${row.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.response?.message || body?.message || `Error (${res.status})`);
      }
      const payload = await res.json();
      // Same unwrapping useEntity applies, bare-record fallback included.
      const record = payload?.response?.data?.[0] ?? payload;

      if (skipPopupWhenFullyInvoiced && parseFloat(record?.invoiceStatus ?? 0) >= 100) {
        await docAction.execute(row.id, 'CO');
        toast.dismiss(toastId);
        finishWithoutInvoice();
        return;
      }
      toast.dismiss(toastId);
      setConfirmRecord(record);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err?.message || ui('networkError'));
    } finally {
      inFlightRef.current = false;
    }
  }, [apiFetch, specName, entityName, docAction, ui, finishWithoutInvoice, skipPopupWhenFullyInvoiced]);

  /**
   * Spread into a window's `rowQuickActions.menuActions` result. Confirm only makes
   * sense on a draft: any other status already passed through it. Returns null rather
   * than a `visible: false` descriptor so a non-draft row's menu stays byte-identical
   * to what it was before this entry existed.
   */
  const confirmMenuAction = useCallback((row) => (
    row?.documentStatus === 'DR'
      ? { key: 'confirm', label: ui('confirm'), onClick: openConfirm }
      : null
  ), [ui, openConfirm]);

  const confirmPortal = (
    <>
      {confirmRecord && ConfirmModal && createPortal(
        <ConfirmModal
          base={base}
          headers={headers}
          token={token}
          recordId={confirmRecord.id}
          data={confirmRecord}
          onConfirmed={({ invoice } = {}) => {
            setConfirmRecord(null);
            // A confirm that created no invoice has nothing worth a result popup —
            // same rule the form applies (ETP-5063). The currency is carried along
            // rather than read off `confirmRecord`, which this same handler just
            // cleared — the form can read it off its still-mounted record, this
            // cannot.
            if (invoice?.id) {
              setInvoiceResult({ invoice, currency: confirmRecord?.['currency$_identifier'] || '' });
            } else {
              finishWithoutInvoice();
            }
          }}
          onClose={() => setConfirmRecord(null)}
          data-testid="RowConfirmModal__5378" />,
        document.body,
      )}
      {invoiceResult?.invoice?.id && createPortal(
        <ConfirmResultModal
          title={ui(invoiceResultTitleKey)}
          docs={[{
            type: invoiceDocType,
            num: invoiceResult.invoice.documentNo,
            amount: invoiceResult.invoice.amount ?? null,
            // ETP-5378 QA follow-up — ConfirmResultModal badges the document "Borrador" unless
            // it reads `documentStatus === 'CO'` (ETP-5381 made that badge follow the real
            // status). `runConfirm` in ConfirmInOutModal already returns it, and the backend
            // fills it (finalizeReturnInvoice puts the COMPLETED invoice's status), but this
            // row path dropped it while the form path (useConfirmWithCredit) carried it — so
            // the same rectificative invoice read "Completado" from the form and "Borrador"
            // from the grid. It is created AND confirmed in one step, so "Borrador" was never
            // a possible state here.
            documentStatus: invoiceResult.invoice.documentStatus ?? null,
            route: `${invoiceRoute}/${invoiceResult.invoice.id}`,
          }]}
          primary={ui('soViewInvoice')}
          currency={invoiceResult.currency || ''}
          navigate={(route) => { resultNavigatedRef.current = true; navigate(route); }}
          onClose={() => {
            setInvoiceResult(null);
            setTimeout(() => {
              // Refresh the list rather than reload the page, and skip it when the
              // user navigated to the new invoice instead of closing.
              if (!resultNavigatedRef.current) onRefresh?.();
              resultNavigatedRef.current = false;
            }, 0);
          }}
          data-testid="RowConfirmResultModal__5378" />,
        document.body,
      )}
    </>
  );

  return { confirmMenuAction, confirmPortal };
}

export default useRowConfirmAction;
