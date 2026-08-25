import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { writeHeaders } from '@/lib/sessionHeaders.js';

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
  const hasReturnInvoice = Array.isArray(data?.returnInvoices)
    ? data.returnInvoices.some(inv => inv.documentStatus === 'CO')
    : data?.hasReturnInvoice === true;

  // ETP-4576 — one header bag drives this component's reads and its writes, so
  // it takes the write builder: same shape as the `{ Authorization, Content-Type }`
  // it used to hand-build, with the session's proof in place of a token the
  // client no longer holds.
  const headers = useMemo(() => writeHeaders(), []);

  const handleCreateReturnInvoice = useCallback(async () => {
    if (creatingInvoice) return;
    setCreatingInvoice(true);
    try {
      const res = await fetch(
        `${apiBaseUrl}/${entitySegment}/${data?.id || recordId}/action/createReturnInvoice`,
        { method: 'POST', headers, body: JSON.stringify({}) },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.response?.message || err?.message || `Error (${res.status})`);
      }
      const invData = (await res.json())?.response?.data;
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
  }, [data, recordId, apiBaseUrl, headers, ui, creatingInvoice, entitySegment, invoiceRoute, invoiceType, invoiceCreatedTitleKey]);

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
