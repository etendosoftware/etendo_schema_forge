import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';

export function useConfirmWithCredit({
  data,
  recordId,
  token,
  apiBaseUrl,
  entitySegment,
  invoiceRoute,
  invoiceType,
  invoiceCreatedTitleKey,
  generatePdfFn,
  getPdfLabelsFn,
}) {
  const ui = useUI();
  const [showModal, setShowModal] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [result, setResult] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [cloneTargets, setCloneTargets] = useState(null);

  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const status = data?.documentStatus;
  const currency = data?.['currency$_identifier'] || '';
  const confirmDisabled = typeof data?.linesCount === 'number' && data.linesCount === 0;
  const hasReturnInvoice = Array.isArray(data?.returnInvoices)
    ? data.returnInvoices.some(inv => inv.documentStatus === 'CO')
    : data?.hasReturnInvoice === true;

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const pdfLabels = useMemo(() => getPdfLabelsFn(ui), [getPdfLabelsFn, ui]);

  const handlePrint = useCallback(async () => {
    setPdfLoading(true);
    try {
      const blob = await generatePdfFn(data?.id || recordId, apiBaseUrl, token, pdfLabels);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      toast.error(err.message || ui('failedToGeneratePdf'));
    } finally {
      setPdfLoading(false);
    }
  }, [data, recordId, apiBaseUrl, token, pdfLabels, ui, generatePdfFn]);

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
    pdfLoading, showModal, setShowModal,
    creatingInvoice, result, setResult,
    cloneTargets, setCloneTargets,
    handlePrint, handleCreateReturnInvoice, buildInvoiceResultFromConfirm,
  };
}
