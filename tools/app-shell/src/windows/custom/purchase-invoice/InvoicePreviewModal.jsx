import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Edit2, FileText, Image, Plus, Check, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useMenuLabel, useUI } from '@/i18n';
import { formatAmount } from '@/lib/formatAmount.js';
import { getStatusBadgeProps, statusLabel } from '@/lib/statusBadge.js';
import InvoicePaymentModal from '../shared/InvoicePaymentModal.jsx';

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
export default function InvoicePreviewModal({ invoice, token, apiBaseUrl, windowName, specName = 'purchase-invoice', onClose, onEdit }) {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const [activeTab, setActiveTab] = useState('general');
  const [installments, setInstallments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

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

  // Close with exit animation (downward)
  function handleClose() {
    setAnimState('closing');
    setTimeout(onClose, 280);
  }

  // Close with upward animation, then navigate to edit view
  function handleEdit() {
    setAnimState('closingUp');
    setTimeout(() => onEdit?.(invoice.id), 280);
  }

  // Parallel fetch: installment schedules (paymentPlan) + registered payments (invoicePayments)
  const fetchPayments = useCallback(() => {
    if (!invoice?.id || !token) return;
    setLoadingPayments(true);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    Promise.all([
      fetch(`${apiBaseUrl}/paymentPlan?parentId=${invoice.id}`, { headers })
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => d?.response?.data ?? d?.data ?? [])
        .catch(() => []),
      fetch(`${apiBaseUrl}/header/${invoice.id}/action/invoicePayments`, {
        method: 'POST', headers, body: '{}',
      })
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => d?.response?.data ?? [])
        .catch(() => []),
    ])
      .then(([sched, pays]) => { setInstallments(sched); setPayments(pays); })
      .catch(() => { setInstallments([]); setPayments([]); })
      .finally(() => setLoadingPayments(false));
  }, [invoice?.id, apiBaseUrl, token]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  if (!invoice) return null;

  const status = invoice.documentStatus;
  const badgeProps = getStatusBadgeProps(status);
  const label = statusLabel(status);
  const partnerName = invoice.businessPartner$_identifier || invoice.businessPartner || '—';

  // paymentDetails records use `amount` (applied amount)
  // Derive totals from installment schedule data (more accurate than paymentDetails sum)
  const grandTotal = Number(invoice.grandTotalAmount ?? 0);
  const totalOutstanding = installments.length > 0
    ? installments.reduce((s, i) => s + Math.max(0, Number(i.outstandingAmount ?? 0)), 0)
    : grandTotal;

  // "Add payment" is only available when invoice is Completed (CO) with outstanding balance
  const isDraft = status === 'DR' || status === 'draft';
  const isFullyPaid = totalOutstanding <= 0 && installments.length > 0;
  const isCompleted = status === 'CO' || status === 'complete' || status === 'completed';
  const canAddPayment = isCompleted && !isFullyPaid;

  // Animation classes
  const backdropClass = animState === 'opening'
    ? 'opacity-0'
    : animState === 'closing'
      ? 'opacity-0 transition-opacity duration-[280ms]'
      : 'opacity-100 transition-opacity duration-[280ms]';

  const cardClass = animState === 'opening'
    ? 'translate-x-full'
    : animState === 'closing'
      ? 'translate-x-full transition-transform duration-[280ms]'
      : animState === 'closingUp'
        ? 'opacity-0 translate-x-full transition-all duration-[280ms]'
        : 'translate-x-0 transition-transform duration-[280ms]';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/30 ${backdropClass}`}
        onClick={handleClose}
      >
        {/* Side panel — slides in from the right, preserving all original content */}
        <div
          className={`absolute right-0 top-0 bottom-0 bg-white shadow-2xl overflow-hidden flex flex-col ${cardClass}`}
          style={{ width: '80vw', maxWidth: '1100px' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Top bar ── */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white shrink-0">
            {/* Left: title + doc actions */}
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-900 text-base">
                {tMenu('Purchase Invoice')} {invoice.documentNo}
              </span>
              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled
              >
                <FileText size={13} />
                {ui('invoicePreviewPdf')}
              </button>
              <button className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-300 rounded-lg transition-colors" disabled>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>

            {/* Center: primary actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canAddPayment}
                onClick={canAddPayment ? () => setShowPaymentModal(true) : undefined}
              >
                <Plus size={13} />
                {ui('invoicePreviewAddPayment')}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleEdit}>
                <Edit2 size={13} />
                {ui('invoicePreviewEdit')}
              </Button>
              <button className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
            </div>

            {/* Right: tab switcher + close */}
            <div className="flex items-center gap-1">
              {topTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    activeTab === tab.key
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                onClick={handleClose}
                className="ml-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                aria-label={ui('invoicePreviewClose')}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── Body — two panels ── */}
          <div className="flex flex-1 min-h-0">
            {/* Left panel: 50% — document drop zone / preview */}
            <div className="w-1/2 bg-gray-50 flex flex-col min-h-0 border-r border-gray-200">
              {docFile ? (
                /* ── Document preview ── */
                <div className="flex flex-col h-full min-h-0">
                  {/* Toolbar */}
                  <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {docFile.kind === 'image'
                        ? <Image size={14} className="text-blue-500 shrink-0" />
                        : <FileText size={14} className="text-red-500 shrink-0" />
                      }
                      <span className="text-xs text-gray-600 truncate">{docFile.name}</span>
                    </div>
                    <button
                      onClick={removeFile}
                      className="ml-2 p-1 text-gray-400 hover:text-red-500 rounded transition-colors shrink-0"
                      title="Delete document"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {/* Preview area */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    {docFile.kind === 'image' ? (
                      <div className="w-full h-full overflow-auto flex items-center justify-center bg-gray-50 p-4">
                        <img
                          src={docFile.url}
                          alt={docFile.name}
                          className="max-w-full max-h-full object-contain rounded shadow"
                        />
                      </div>
                    ) : (
                      /* iframe with #toolbar=0 hides Chrome's PDF viewer toolbar */
                      <iframe
                        src={`${docFile.url}#toolbar=0&navpanes=0&scrollbar=1`}
                        className="w-full h-full border-0"
                        title="PDF preview"
                      />
                    )}
                  </div>
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
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-blue-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
                    }`}
                  >
                    {/* Document illustration */}
                    <div className="relative">
                      <div className="w-16 h-20 bg-gray-100 rounded-lg border border-gray-200 flex items-end justify-center pb-2 shadow-sm">
                        <div className="w-10 h-1.5 bg-blue-300 rounded mb-1" />
                      </div>
                      <div className="absolute -right-3 -bottom-2 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center shadow">
                        <Upload size={13} className="text-white" />
                      </div>
                    </div>
                    {isDragOver ? (
                      <p className="text-sm font-medium text-blue-600">{ui('invoicePreviewDropFileHere')}</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-600 mt-1">{ui('invoicePreviewUploadYourDocument')}</p>
                        <button
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
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
            </div>

            {/* Right panel: 50% — tab content */}
            <div className="w-1/2 overflow-y-auto">
              {activeTab === 'general' && (
                <StatsPanel
                  invoice={invoice}
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
                  onAddPayment={() => setShowPaymentModal(true)}
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

      {/* Payment modal */}
      {showPaymentModal && (
        <InvoicePaymentModal
          invoiceId={invoice.id}
          invoiceData={invoice}
          specName={specName}
          token={token}
          apiBaseUrl={apiBaseUrl}
          onClose={() => {
            setShowPaymentModal(false);
            fetchPayments();
          }}
        />
      )}
    </>
  );
}

// ── Stats panel: Total + Payments + Files sections ──

function SectionCard({ title, titleRight, done, noPadding, children }) {
  return (
    <div className="mx-4 mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-gray-800 text-sm">{title}</span>
        {titleRight ?? (done ? <Check size={15} className="text-green-500" /> : null)}
      </div>
      <div className={noPadding ? '' : 'px-4 py-3'}>{children}</div>
    </div>
  );
}

function InfoRow({ label, value, link }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      {link
        ? <span className="text-blue-600 font-medium text-right max-w-[55%] truncate">{value ?? '—'}</span>
        : <span className="text-gray-900 font-medium text-right max-w-[55%] truncate">{value ?? '—'}</span>
      }
    </div>
  );
}

function fmtPayDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  return isNaN(d.getTime()) ? '—'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PAID_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM']);

function StatsPanel({ invoice, partnerName, badgeProps, statusLabel: sl, installments, payments, loadingPayments, totalOutstanding, canAddPayment, isDraft, isFullyPaid, specName, onAddPayment }) {
  const ui = useUI();
  const invoiceDate = invoice.invoiceDate
    ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB')
    : '—';

  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('en-GB')
    : '—';

  const payPrefix = specName === 'purchase-invoice' ? 'payment-out' : 'payment-in';

  return (
    <div className="pb-4">
      {/* Total — amount in header, key fields in body */}
      <SectionCard
        title={ui('invoicePreviewTotal')}
        titleRight={
          <span className="font-semibold text-sm tabular-nums text-gray-900">
            {formatAmount(invoice.grandTotalAmount)}
          </span>
        }
      >
        <InfoRow label={ui('invoicePreviewContact')} value={partnerName} link />
        <InfoRow label={ui('invoicePreviewDate')} value={invoiceDate} />
        <InfoRow label={ui('invoicePreviewDueDate')} value={dueDate} />
        <div className="flex justify-between items-center py-1.5 text-sm">
          <span className="text-gray-500">{ui('invoicePreviewStatus')}</span>
          <Badge {...badgeProps}>{sl}</Badge>
        </div>
      </SectionCard>

      {/* Payments — flat list of registered payments, max ~3 visible */}
      <SectionCard
        title={ui('invoicePreviewPayments')}
        noPadding
        titleRight={
          canAddPayment ? (
            <button
              onClick={onAddPayment}
              className="text-xs font-medium text-blue-600 hover:underline transition-colors"
            >
              {ui('invoicePreviewAddPayment')}
            </button>
          ) : isFullyPaid ? (
            <Check size={15} className="text-green-500" />
          ) : null
        }
      >
        {loadingPayments ? (
          <p className="text-xs text-gray-400 py-4 text-center">{ui('loading')}</p>
        ) : payments.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">{ui('invoicePreviewNoPaymentsRecorded')}</p>
        ) : (
          <div className="overflow-y-auto divide-y divide-gray-100" style={{ maxHeight: '180px' }}>
            {payments.map((p) => {
              const isPaid = PAID_STATUSES.has(p.status);
              const payBadge = isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
              const acctLabel = [p.accountName, p.accountCurrency].filter(Boolean).join(' · ');
              const currencyCode = installments[0]?.['currency$_identifier'] || '';

              return (
                <div key={p.id} className="px-4 py-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold tabular-nums text-gray-900">
                        {currencyCode} {formatAmount(p.amount)}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${payBadge}`}>
                        {isPaid ? ui('statusPaid') : ui('statusPending')}
                      </span>
                      <span className="text-xs text-gray-500 tabular-nums">{fmtPayDate(p.paymentDate)}</span>
                    </div>
                    <button
                      onClick={() => { window.location.href = `/${payPrefix}/${p.id}`; }}
                      className="text-xs font-medium text-blue-600 hover:underline shrink-0 ml-2"
                    >
                      View →
                    </button>
                  </div>
                  {(p.documentNo || acctLabel) && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {[p.documentNo ? `#${p.documentNo}` : null, acctLabel].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Files */}
      <SectionCard title={ui('invoicePreviewFiles')}>
        <button
          disabled
          className="w-full py-2 text-sm text-gray-400 border border-dashed border-gray-300 rounded-lg cursor-default"
        >
          {ui('invoicePreviewAddAttachment')}
        </button>
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
