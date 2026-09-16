import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

import { buildHeaders } from '@/auth/api.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
export function useConfirmWithCredit({
  data,
  recordId,
  token,
  apiBaseUrl,
  entitySegment,
  invoiceRoute,
  invoiceType,
  invoiceCreatedTitleKey,
}) {
  const ui = useUI();
  const [showModal, setShowModal] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [result, setResult] = useState(null);
  const [cloneTargets, setCloneTargets] = useState(null);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const status = data?.documentStatus;
  const currency = data?.['currency$_identifier'] || '';
  const confirmDisabled = typeof data?.linesCount === 'number' && data.linesCount === 0;
  // ETP-5381: trust the backend flag. ReturnShipmentUtils computes it over every non-voided
  // invoice of the return document, which is the same predicate the server-side duplicate guard
  // uses — so the button and the guard can never disagree. The previous client-side override
  // counted only 'CO' invoices, so a rectificative invoice still in draft read as "no invoice"
  // and the create button stayed visible, allowing a second one. The array fallback is kept for
  // responses that carry returnInvoices without the flag, but with the non-voided predicate.
  const hasReturnInvoice = typeof data?.hasReturnInvoice === 'boolean'
    ? data.hasReturnInvoice
    : Array.isArray(data?.returnInvoices)
      && data.returnInvoices.some(inv => inv.documentStatus !== 'VO');

  const headers = useMemo(() => (buildHeaders(token)), [token]);
  const apiFetch = useApiFetch(apiBaseUrl);

  // ETP-5381: originInvoices carries the invoice(s) the rectificative invoice will rectify. The
  // backend needs them BEFORE completing — without the C_Invoice_Reverse link the rectificative
  // invoice cannot be confirmed — so the modal asks the user and passes them through here.
  const handleCreateReturnInvoice = useCallback(async (originInvoices) => {
    if (creatingInvoice) return;
    setCreatingInvoice(true);
    try {
      const body = Array.isArray(originInvoices) && originInvoices.length > 0
        ? { originInvoices }
        : {};
      const res = await apiFetch(
        `/${entitySegment}/${data?.id || recordId}/action/createReturnInvoice`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Error (${res.status})`);
      }
      const invData = (await res.json())?.response?.data;
      setShowModal(false);
      setResult({
        title: ui(invoiceCreatedTitleKey),
        docs: invData?.id ? [{
          type: invoiceType,
          num: invData.documentNo || '',
          amount: invData.grandTotalAmount ?? null,
          route: `${invoiceRoute}${invData.id}`,
        }] : [],
      });
    } catch (err) {
      toast.error(err.message || ui('couldNotCreateReturnInvoice'));
    } finally {
      setCreatingInvoice(false);
    }
  }, [data, recordId, apiFetch, ui, creatingInvoice, entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey, setShowModal]);

  const buildInvoiceResultFromConfirm = useCallback((invoice) => {
    if (!invoice?.id) return null;
    return {
      title: ui(invoiceCreatedTitleKey),
      docs: [{
        type: invoiceType,
        num: invoice.documentNo || '',
        amount: invoice.amount ?? invoice.grandTotal,
        route: `${invoiceRoute}${invoice.id}`,
      }],
    };
  }, [ui, invoiceCreatedTitleKey, invoiceType, invoiceRoute]);

  return {
    ui,
    status, currency, confirmDisabled, hasReturnInvoice,
    headers, base,
    showModal, setShowModal,
    creatingInvoice, result, setResult,
    cloneTargets, setCloneTargets,
    handleCreateReturnInvoice, buildInvoiceResultFromConfirm,
  };
}
