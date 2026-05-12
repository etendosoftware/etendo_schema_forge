import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Upload, Edit2, FileText, Image, Plus, Check, Trash2, Loader2, AlertCircle, Mail, Download, Ban, Wallet, MoreVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useLocaleSwitch, useMenuLabel, useUI } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import { formatAmount } from '@/lib/formatAmount.js';
import { getLatestInstallmentDueDate } from '@/lib/invoiceDueDate';
import { getStatusBadgeProps, statusLabel } from '@/lib/statusBadge.js';
import InvoicePaymentModal from './InvoicePaymentModal.jsx';
import { useInvoicePdf } from './useInvoicePdf.js';
import PdfViewer from './PdfViewer.jsx';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getPendingSifTargets, getSifBodyKey } from './sifSending.js';
import { useFiscalStatus } from './useFiscalStatus.js';
import { StatusPill } from '@/windows/custom/fiscal-monitor/FmPrimitives.jsx';
import { getInvoiceFiscalTargets } from './fiscalTargets.js';

const ACCEPTED_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
};
const ACCEPT_ATTR = Object.keys(ACCEPTED_TYPES).join(',');

function getBackdropClass(animState) {
  if (animState === 'opening') return 'opacity-0';
  if (animState === 'closing') return 'opacity-0 transition-opacity duration-[280ms]';
  return 'opacity-100 transition-opacity duration-[280ms]';
}

function getCardClass(animState) {
  if (animState === 'opening') return 'translate-x-full';
  if (animState === 'closing') return 'translate-x-full transition-transform duration-[280ms]';
  if (animState === 'closingUp') return 'opacity-0 translate-x-full transition-all duration-[280ms]';
  return 'translate-x-0 transition-transform duration-[280ms]';
}

/**
 * InvoicePreviewModal — Holded-style preview popup for a purchase or sales invoice.
 *
 * Layout:
 *   Top bar: title, action buttons, tab switcher (General | Messages | History)
 *   Body: 50% document drop zone | 50% sidebar (content driven by active top tab)
 *
 * General tab sidebar:
 *   Total section    → invoice header fields (total in card header, contact/date/status in body)
 *   Payments section → registered payment rows + Add payment
 *   Files section    → placeholder
 *
 * Animation: fade + slide-up on open, reverse on close.
 *
 * @param specName — "purchase-invoice" | "sales-invoice" (defaults to "purchase-invoice")
 */
export default function InvoicePreviewModal({ invoice, token, apiBaseUrl, windowName, specName = 'purchase-invoice', onClose, onEdit, onInvoiceUpdated = null }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const [activeTab, setActiveTab] = useState('general');
  const [invoiceData, setInvoiceData] = useState(invoice);
  const [showSifModal, setShowSifModal] = useState(false);
  const [sifPhase, setSifPhase] = useState('confirm');
  const [sifResults, setSifResults] = useState({});
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile } = useFiscalConfig(orgId, token, apiBaseUrl);
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
  const updateEventName = `${specName}:invoice-updated`;

  // Sales invoices render the generated PDF preview; purchase invoices keep the upload/drop zone.
  const isSalesInvoice = specName === 'sales-invoice';
  const { pdfUrl, loading: pdfLoading, error: pdfError } = useInvoicePdf(
    isSalesInvoice ? invoiceData?.id : null,
    isSalesInvoice ? apiBaseUrl : null,
    token,
  );
  const [installments, setInstallments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalClosing, setSendModalClosing] = useState(false);
  const displayInvoice = invoiceData;
  const previewLoading = pdfLoading;
  const previewError = pdfError;

  useEffect(() => {
    setInvoiceData(invoice);
  }, [invoice]);

  const refetchInvoice = useCallback(async () => {
    if (!invoice?.id || !apiBaseUrl || !token) return null;
    try {
      const res = await fetch(`${apiBaseUrl}/header/${invoice.id}`, { headers });
      if (!res.ok) return null;
      const json = await res.json();
      const candidate = json?.response?.data?.[0] ?? json?.data?.[0] ?? null;
      const refreshed = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null;
      if (refreshed?.id) {
        setInvoiceData(refreshed);
        window.dispatchEvent(new CustomEvent(updateEventName, {
          detail: { invoiceId: refreshed.id, invoice: refreshed },
        }));
        onInvoiceUpdated?.(refreshed);
      }
      return refreshed;
    } catch {
      return null;
    }
  }, [apiBaseUrl, headers, invoice?.id, onInvoiceUpdated, token, updateEventName]);

  // Animation state: 'opening' → 'open' → 'closing' → 'closingUp'
  const [animState, setAnimState] = useState('opening');

  // Document drop zone state — { name, url, kind: 'pdf'|'image' }
  const [docFile, setDocFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const topTabs = [
    { key: 'general', label: ui('invoicePreviewGeneral') },
    { key: 'messages', label: ui('invoicePreviewMessages') },
    { key: 'history', label: ui('invoicePreviewHistory') },
  ];

  // Release blob URL on unmount or when replaced
  useEffect(() => {
    return () => { if (docFile?.url) URL.revokeObjectURL(docFile.url); };
  }, [docFile]);

  const loadFile = useCallback((file) => {
    const kind = file ? ACCEPTED_TYPES[file.type] : null;
    if (!kind) return;
    if (docFile?.url) URL.revokeObjectURL(docFile.url);
    setDocFile({ name: file.name, url: URL.createObjectURL(file), kind });
  }, [docFile]);

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    loadFile(e.dataTransfer.files[0]);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
  }

  function handleFileChange(e) {
    loadFile(e.target.files[0]);
    e.target.value = '';
  }

  function removeFile() {
    if (docFile?.url) URL.revokeObjectURL(docFile.url);
    setDocFile(null);
  }

  // Trigger open animation on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimState('open'));
    return () => cancelAnimationFrame(t);
  }, []);

  // Close with exit animation (slide right)
  function handleClose() {
    setAnimState('closing');
    setTimeout(onClose, 280);
  }

  // Open the email modal on top of the preview (same pattern as payment modal)
  function openEmailModal() {
    setShowSendModal(true);
  }

  // Close the email modal; preview remains visible underneath
  function closeEmailModal() {
    setSendModalClosing(true);
    setTimeout(() => {
      setSendModalClosing(false);
      setShowSendModal(false);
    }, 280);
  }

  // Close with upward animation, then navigate to edit view
  function handleEdit() {
    setAnimState('closingUp');
    setTimeout(() => onEdit?.(displayInvoice.id), 280);
  }

  // Parallel fetch: installment schedules (paymentPlan) + registered payments (invoicePayments)
  const fetchPayments = useCallback(() => {
    if (!displayInvoice?.id || !token) return;
    setLoadingPayments(true);

    Promise.all([
      fetch(`${apiBaseUrl}/paymentPlan?parentId=${displayInvoice.id}`, { headers })
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => d?.response?.data ?? d?.data ?? [])
        .catch(() => []),
      fetch(`${apiBaseUrl}/header/${displayInvoice.id}/action/invoicePayments`, {
        method: 'POST', headers, body: '{}',
      })
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => d?.response?.data ?? [])
        .catch(() => []),
    ])
      .then(([sched, pays]) => { setInstallments(sched); setPayments(pays); })
      .catch(() => { setInstallments([]); setPayments([]); })
      .finally(() => setLoadingPayments(false));
  }, [displayInvoice?.id, apiBaseUrl, headers, token]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const pendingTargets = getPendingSifTargets(specName, profile, displayInvoice);
  const hasPendingTargets = pendingTargets.sendSii || pendingTargets.sendTbai;

  const canSendToSif = displayInvoice?.documentStatus === 'CO'
    && hasPendingTargets;

  const sifBodyKey = getSifBodyKey(pendingTargets);

  const callSifProcess = useCallback(async (columnName) => {
    const res = await fetch(
      `${base}/${specName}/header/${displayInvoice.id}/action/${columnName}`,
      { method: 'POST', headers, body: '{}' },
    );
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.response?.message || json?.message || `HTTP ${res.status}`);
    }
    return res.json().catch(() => null);
  }, [base, displayInvoice?.id, headers, specName]);

  const closeSifModal = useCallback(() => {
    setShowSifModal(false);
    setSifPhase('confirm');
    setSifResults({});
  }, []);

  const handleSendToSif = useCallback(async () => {
    setSifPhase('sending');
    const next = {};

    if (pendingTargets.sendSii) {
      try {
        await callSifProcess('Em_aeatsii_send');
        next.sii = { ok: true };
      } catch (err) {
        next.sii = { ok: false, error: err.message };
      }
    }

    if (pendingTargets.sendTbai) {
      try {
        await callSifProcess('Em_Tbai_Xmlgenerator');
        next.tbai = { ok: true };
      } catch (err) {
        next.tbai = { ok: false, error: err.message };
      }
    }

    setSifResults(next);

    if (Object.values(next).some(result => result?.ok)) {
      await refetchInvoice();
      fetchPayments();
    }

    setSifPhase('results');
  }, [callSifProcess, fetchPayments, pendingTargets, refetchInvoice]);

  if (!invoice) return null;

  const status = displayInvoice.documentStatus;
  const badgeProps = getStatusBadgeProps(status);
  const label = statusLabel(status, null, ui);
  const partnerName = displayInvoice.businessPartner$_identifier || displayInvoice.businessPartner || '—';

  // paymentDetails records use `amount` (applied amount)
  // Derive totals from installment schedule data (more accurate than paymentDetails sum)
  const grandTotal = Number(displayInvoice.grandTotalAmount ?? 0);
  const totalOutstanding = installments.length > 0
    ? installments.reduce((s, i) => s + Math.max(0, Number(i.outstandingAmount ?? 0)), 0)
    : grandTotal;

  // "Add payment" is only available when invoice is Completed (CO) with outstanding balance
  const isDraft = status === 'DR' || status === 'draft';
  const isFullyPaid = totalOutstanding <= 0 && installments.length > 0;
  const isCompleted = status === 'CO' || status === 'complete' || status === 'completed';
  const canAddPayment = isCompleted && !isFullyPaid;

  // Animation classes
  const backdropClass = getBackdropClass(animState);
  const cardClass = getCardClass(animState);

  // Download the generated PDF blob
  function handleDownloadPdf() {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `invoice-${displayInvoice.documentNo || 'document'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/30 ${backdropClass}`}
        onClick={handleClose}
      >
        {/* Side panel — slides in from the right (wider for better PDF view) */}
        <div
          className={`absolute bg-white shadow-2xl overflow-hidden flex flex-col ${cardClass}`}
          style={{ top: 8, right: 8, bottom: 8, width: 'min(calc(100vw - 308px), 1400px)', borderRadius: 12 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Body — two panels (no top bar) ── */}
          <div className="flex flex-1 min-h-0">
            {/* Left panel: flex-1 — PDF preview (sales invoice) or document drop zone (purchase invoice) */}
            <div
              className="flex-1 min-w-0 flex flex-col min-h-0 px-7 pt-6 rounded-l-xl"
              style={{ backgroundColor: '#E8EAEF' }}
            >
              {/* ── Sales Invoice: auto-rendered PDF ── */}
              {isSalesInvoice ? (
                <div className="flex flex-col h-full min-h-0 w-full overflow-hidden">
                  {previewLoading && (
                    <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">{ui('invoicePdfGenerating')}</span>
                    </div>
                  )}
                  {previewError && !previewLoading && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                      <AlertCircle className="h-8 w-8 text-amber-400" />
                      <p className="text-sm text-muted-foreground">
                        {ui('invoicePdfError')}
                      </p>
                      <p className="text-xs text-muted-foreground/60">{previewError}</p>
                    </div>
                  )}
                  {pdfUrl && !previewLoading && (
                    <PdfViewer url={pdfUrl} />
                  )}
                </div>
              ) : docFile ? (
                /* ── Document preview ── */
                <div className="relative flex flex-col h-full min-h-0">
                  {/* Floating delete button — top-left, matching PdfViewer button group style */}
                  <button
                    type="button"
                    onClick={removeFile}
                    className="absolute top-2 left-2 z-10 w-8 h-8 flex items-center justify-center bg-white border border-[#D1D4DB] shadow-sm rounded-lg hover:bg-gray-50 transition-colors"
                    title={`${ui('deleteDocument')} — ${docFile.name}`}
                    aria-label={ui('deleteDocument')}
                  >
                    <Trash2 size={16} className="text-[#828FA3]" />
                  </button>
                  {docFile.kind === 'image' ? (
                    <div className="w-full h-full overflow-auto flex items-center justify-center">
                      <img
                        src={docFile.url}
                        alt={docFile.name}
                        className="max-w-full max-h-full object-contain bg-white shadow-md"
                      />
                    </div>
                  ) : (
                    <PdfViewer url={docFile.url} />
                  )}
                </div>
              ) : (
                /* ── Drop zone ── */
                <div className="flex flex-1 items-center justify-center p-8">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full h-full max-h-[420px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors ${
                      isDragOver
                        ? 'border-gray-400 bg-gray-100'
                        : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100/60'
                    }`}
                  >
                    {/* Document illustration */}
                    <div className="relative">
                      <div className="w-16 h-20 bg-white rounded-lg border border-gray-200 flex items-center justify-center shadow-sm">
                        <Upload size={20} className="text-gray-400" />
                      </div>
                    </div>
                    {isDragOver ? (
                      <p className="text-sm font-medium text-gray-700">{ui('invoicePreviewDropFileHere')}</p>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 mt-1">{ui('invoicePreviewUploadYourDocument')}</p>
                        <button
                          className="px-4 py-2 text-sm font-medium text-gray-900 bg-transparent border border-gray-900 rounded-lg hover:bg-gray-900 hover:text-white transition-colors"
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        >
                          {ui('invoicePreviewClickHereToUploadYourFile')}
                        </button>
                        <p className="text-xs text-gray-400">{ui('invoicePreviewAcceptedDocumentTypes')}</p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPT_ATTR}
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>
              )}
              {/* End of purchase-invoice drop zone (ternary close) */}
              </div>


            {/* Right panel: fixed width — header + tabs + content */}
            <div className="w-[380px] shrink-0 flex flex-col relative">
              {/* ── Close button (top-right) ── */}
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 z-10 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label={ui('invoicePreviewClose')}
              >
                <X size={16} />
              </button>

              {/* ── Header section: title + action buttons ── */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-200 shrink-0">
                {/* Title + client row */}
                <div className="pr-8 mb-3">
                  <span className="font-bold text-gray-900 text-lg leading-tight block">
                    {tMenu(specName === 'purchase-invoice' ? 'Purchase Invoice' : 'Sales Invoice')} {displayInvoice.documentNo}
                  </span>
                  {partnerName && partnerName !== '—' && (
                    <span className="text-xs text-gray-500 mt-0.5 block">
                      {ui('invoicePreviewClient')} {partnerName}
                    </span>
                  )}
                </div>

                {/* Action buttons row */}
                <div className="flex items-start flex-wrap gap-2">
                  {/* Enviar */}
                  <Button
                    size="sm"
                    className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-[#121217] hover:bg-[#2a2a30] text-white [&_svg]:size-5"
                    onClick={openEmailModal}
                  >
                    <Mail />
                    {ui('invoicePreviewSend')}
                  </Button>

                  {canSendToSif && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-white border-[#D1D4DB] shadow-sm text-[#121217] [&_svg]:size-5"
                      onClick={() => setShowSifModal(true)}
                    >
                      <FileText className="text-[#828FA3]" />
                      {ui('sendToSif')}
                    </Button>
                  )}

                  {/* Add Payment */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-white border-[#D1D4DB] shadow-sm text-[#121217] disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:size-5"
                    disabled={!canAddPayment}
                    onClick={canAddPayment ? () => setShowPaymentModal(true) : undefined}
                  >
                    <Wallet className="text-[#828FA3]" />
                    {ui('invoicePreviewAddPayment')}
                  </Button>

                  {/* Descargar PDF — sales invoice only */}
                  {isSalesInvoice && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-white border-[#D1D4DB] shadow-sm text-[#121217] [&_svg]:size-5"
                      onClick={handleDownloadPdf}
                      disabled={!pdfUrl}
                    >
                      <Download className="text-[#828FA3]" />
                      {ui('invoicePreviewDownloadPdf')}
                    </Button>
                  )}

                  {/* Edit */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 px-2 py-1 h-8 rounded-lg text-sm font-medium bg-white border-[#D1D4DB] shadow-sm text-[#121217] [&_svg]:size-5"
                    onClick={handleEdit}
                  >
                    <Edit2 className="text-[#828FA3]" />
                    {ui('invoicePreviewEdit')}
                  </Button>

                  {/* More options */}
                  <button
                    type="button"
                    className="w-8 h-8 flex items-center justify-center bg-white border border-[#D1D4DB] shadow-sm rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <MoreVertical size={20} className="text-[#828FA3]" />
                  </button>
                </div>
              </div>

              {/* ── Tab switcher ── */}
              <div className="px-3 pt-3 pb-2 shrink-0">
                <div
                  className="flex items-center gap-1 p-1 rounded-xl"
                  style={{ backgroundColor: '#F5F7F9' }}
                >
                  {topTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 h-8 px-2 py-1 text-sm font-medium rounded-lg transition-colors text-[#121217] ${
                      activeTab === tab.key
                        ? 'bg-white shadow-sm'
                        : 'hover:bg-white/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                </div>
              </div>

              {/* ── Tab content ── */}
              <div className="flex-1 overflow-y-auto">
                {activeTab === 'general' && (
                  <StatsPanel
                    invoice={displayInvoice}
                    partnerName={partnerName}
                    badgeProps={badgeProps}
                    statusLabel={label}
                    installments={installments}
                    payments={payments}
                    loadingPayments={loadingPayments}
                    totalOutstanding={totalOutstanding}
                    canAddPayment={canAddPayment}
                    isDraft={isDraft}
                    isFullyPaid={isFullyPaid}
                    specName={specName}
                    apiBaseUrl={apiBaseUrl}
                    token={token}
                    orgId={orgId}
                    profile={profile}
                    onAddPayment={() => setShowPaymentModal(true)}
                    onSend={openEmailModal}
                  />
                )}
                {activeTab === 'messages' && (
                  <EmptyPanel icon="💬" text={ui('invoicePreviewNoMessagesYet')} />
                )}
                {activeTab === 'history' && (
                  <EmptyPanel icon="🕐" text={ui('invoicePreviewNoActivityRecorded')} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      {showPaymentModal && (
        <InvoicePaymentModal
          invoiceId={displayInvoice.id}
          invoiceData={displayInvoice}
          specName={specName}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onClose={() => {
            setShowPaymentModal(false);
            fetchPayments();
          }}
        />
      )}

      {showSifModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-to-sif-preview-title"
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', minWidth: '320px', maxWidth: '480px', width: '100%' }}>
            <h3 id="send-to-sif-preview-title" style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
              {ui('sendToSifTitle')}
            </h3>

            {sifPhase === 'confirm' && (
              <>
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '20px' }}>
                  {ui(sifBodyKey)}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={closeSifModal}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff' }}
                  >
                    {ui('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendToSif}
                    style={{ padding: '8px 16px', borderRadius: '8px', background: '#1d4ed8', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    {ui('sendToSifConfirm')}
                  </button>
                </div>
              </>
            )}

            {sifPhase === 'sending' && (
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                {ui('sendToSifSending')}
              </p>
            )}

            {sifPhase === 'results' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {sifResults.sii && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <span style={{ color: sifResults.sii.ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {sifResults.sii.ok ? '✓' : '✗'}
                      </span>
                      <span>
                        {sifResults.sii.ok ? ui('sendToSifSuccessSii') : (sifResults.sii.error || ui('sendToSifErrorSii'))}
                      </span>
                    </div>
                  )}
                  {sifResults.tbai && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                      <span style={{ color: sifResults.tbai.ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {sifResults.tbai.ok ? '✓' : '✗'}
                      </span>
                      <span>
                        {sifResults.tbai.ok ? ui('sendToSifSuccessTbai') : (sifResults.tbai.error || ui('sendToSifErrorTbai'))}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={closeSifModal}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff' }}
                  >
                    {ui('close')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Send email modal — rendered on top to preserve pdfUrl blob.
          Appears with slide-down animation; closes with slide-up via closeEmailModal. */}
      {showSendModal && (
        <SendDocumentModal
          documentType={tMenu(specName === 'purchase-invoice' ? 'Purchase Invoice' : 'Sales Invoice')}
          documentNo={displayInvoice.documentNo}
          bpName={partnerName}
          bPartnerId={displayInvoice.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={displayInvoice.id}
          windowName={specName}
          token={token}
          pdfBlobUrl={pdfUrl}
          isClosing={sendModalClosing}
          onClose={closeEmailModal}
        />
      )}
    </>
  );
}

// ── Stats panel: Total + Payments + Files sections ──

/**
 * SectionCard — two variants:
 *   summary=true  → title bold INSIDE the card with border-bottom (used for Total)
 *   summary=false → title uppercase gray ABOVE the card, titleRight as dark underlined link
 */
function SectionCard({ title, titleRight, done, noPadding, summary, children }) {
  if (summary) {
    return (
      <div className="mx-4 mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-bold text-gray-900 text-sm">{title}</span>
          {titleRight ?? (done ? <Check size={15} className="text-green-500" /> : null)}
        </div>
        <div className={noPadding ? '' : 'px-4 py-2'}>{children}</div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
        {titleRight ?? (done ? <Check size={13} className="text-green-500" /> : null)}
      </div>
      <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${noPadding ? '' : 'px-4 py-2'}`}>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value, link, underline }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-sm">
      <span className="text-gray-400">{label}</span>
      {(link || underline)
        ? <span className="text-gray-900 font-medium text-right max-w-[55%] truncate underline decoration-gray-400">{value ?? '—'}</span>
        : <span className="text-gray-900 font-medium text-right max-w-[55%] truncate">{value ?? '—'}</span>
      }
    </div>
  );
}

function fmtPayDate(raw) {
  return formatCalendarDate(raw, 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM']);

function StatsPanel({ invoice, partnerName, badgeProps, statusLabel: sl, installments, payments, loadingPayments, totalOutstanding, canAddPayment, isDraft, isFullyPaid, specName, apiBaseUrl, token, orgId, profile, onAddPayment, onSend }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const fiscalTargets = getInvoiceFiscalTargets(specName, profile);
  const { sii: siiStatus, tbai: tbaiStatus, verifactu: vfStatus, loading: fiscalLoading } = useFiscalStatus(
    invoice?.id, specName, profile, apiBaseUrl, token, orgId,
  );
  const [accountingAccount, setAccountingAccount] = useState(null);

  const invoiceDate = invoice.invoiceDate
    ? formatCalendarDate(invoice.invoiceDate, locale)
    : '—';

  const latestDueDate = getLatestInstallmentDueDate(installments);
  const dueDate = latestDueDate
    ? formatCalendarDate(latestDueDate, locale)
    : '—';

  const payPrefix = specName === 'purchase-invoice' ? 'payment-out' : 'payment-in';

  useEffect(() => {
    if (!invoice?.id || !apiBaseUrl || !token) return;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    fetch(`${apiBaseUrl}/lines?parentId=${invoice.id}&_startRow=0&_endRow=1`, { headers })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        const lines = d?.response?.data ?? [];
        const name = lines[0]?.['account$_identifier'] || null;
        setAccountingAccount(name);
      })
      .catch(() => {});
  }, [invoice?.id, apiBaseUrl, token]);

  const currencyCode = installments[0]?.['currency$_identifier'] || '';

  return (
    <div className="pb-4">
      {/* Total — summary variant: title bold inside card */}
      <SectionCard
        summary
        title={ui('invoicePreviewTotal')}
        titleRight={
          <span className="font-bold text-base tabular-nums text-gray-900">
            {currencyCode} {formatAmount(invoice.grandTotalAmount)}
          </span>
        }
      >
        <InfoRow label={ui('invoicePreviewContact')} value={partnerName} underline />
        <InfoRow label={ui('invoicePreviewDate')} value={invoiceDate} />
        <InfoRow label={ui('invoicePreviewDueDate')} value={dueDate} underline />
        <div className="flex justify-between items-center py-1.5 text-sm">
          <span className="text-gray-400">{ui('invoicePreviewStatus')}</span>
          <Badge {...badgeProps}>{sl}</Badge>
        </div>
        {fiscalTargets.showSii && (
          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-gray-400">{ui('invoicePreview.fiscalStatus.sii')}</span>
            {fiscalLoading
              ? <span className="h-5 w-16 bg-gray-100 rounded animate-pulse inline-block" />
              : <StatusPill estado={siiStatus ?? 'PE'} />}
          </div>
        )}
        {fiscalTargets.showTbai && (
          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-gray-400">{ui('invoicePreview.fiscalStatus.tbai')}</span>
            {fiscalLoading
              ? <span className="h-5 w-16 bg-gray-100 rounded animate-pulse inline-block" />
              : <StatusPill estado={tbaiStatus ?? 'Pendiente'} />}
          </div>
        )}
        {fiscalTargets.showVerifactu && (
          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-gray-400">{ui('invoicePreview.fiscalStatus.verifactu')}</span>
            {fiscalLoading
              ? <span className="h-5 w-16 bg-gray-100 rounded animate-pulse inline-block" />
              : <StatusPill estado={vfStatus ?? 'PE'} />}
          </div>
        )}
      </SectionCard>

      {/* Payments — title above card, dark underline titleRight */}
      <SectionCard
        title={ui('invoicePreviewPayments')}
        noPadding
        titleRight={
          canAddPayment ? (
            <button
              onClick={onAddPayment}
              className="text-xs font-medium text-gray-900 underline decoration-gray-600 hover:decoration-gray-900 transition-colors"
            >
              {ui('invoicePreviewAddPayment')}
            </button>
          ) : isFullyPaid ? (
            <Check size={13} className="text-green-500" />
          ) : null
        }
      >
        {loadingPayments ? (
          <p className="text-xs text-gray-400 py-4 text-center">{ui('loading')}</p>
        ) : payments.length === 0 && totalOutstanding <= 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">{ui('invoicePreviewNoPaymentsRecorded')}</p>
        ) : (
          <div className="flex flex-col gap-3 px-3 py-2">
            {payments.map((p) => {
              const acctLabel = p.accountName || (p.documentNo ? `#${p.documentNo}` : '—');
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded px-2 py-2"
                  style={{ backgroundColor: '#F5F7F9' }}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <Ban size={20} className="shrink-0" style={{ color: '#828FA3' }} />
                    <span className="text-sm text-gray-900 truncate">{acctLabel}</span>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-sm tabular-nums text-gray-900">
                      {currencyCode} {formatAmount(p.amount)}
                    </span>
                    <span className="text-xs tabular-nums" style={{ color: '#555B6D' }}>
                      {fmtPayDate(p.paymentDate)}
                    </span>
                  </div>
                </div>
              );
            })}
            {totalOutstanding > 0 && (
              <div className="flex items-center justify-between px-3">
                <span className="text-xs" style={{ color: '#8A6100' }}>
                  {ui('invoicePendingPayment')}
                </span>
                <span className="text-sm tabular-nums" style={{ color: '#8A6100' }}>
                  {currencyCode} {formatAmount(totalOutstanding)}
                </span>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Emails — title above card */}
      <SectionCard
        title={ui('invoicePreviewEmails')}
        titleRight={
          <button
            onClick={onSend}
            className="text-xs font-medium text-gray-900 underline decoration-gray-600 hover:decoration-gray-900 transition-colors"
          >
            {ui('invoicePreviewSendEmail')}
          </button>
        }
      >
        <p className="text-xs text-gray-400 py-2 text-center">{ui('invoicePreviewNoEmailHistory')}</p>
      </SectionCard>

      {/* Categorización — title above card */}
      <SectionCard title={ui('invoicePreviewCategorization')}>
        <InfoRow label={ui('invoicePreviewAccountingAccount')} value={accountingAccount} />
      </SectionCard>
    </div>
  );
}

function EmptyPanel({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-20">
      <span className="text-3xl">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
}
