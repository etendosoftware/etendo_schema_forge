import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Paperclip, Edit2, FileText, Image, Plus, ChevronRight, Check, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { formatAmount } from '@/lib/formatAmount.js';
import { getStatusBadgeProps, statusLabel } from '@/lib/statusBadge.js';
import AddPaymentModal from './AddPaymentModal.jsx';

const TOP_TABS = ['Stats', 'Messages', 'History'];

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
 * InvoicePreviewModal — Holded-style preview popup for a purchase invoice.
 *
 * Layout:
 *   Top bar: title, action buttons, tab switcher (Stats | Messages | History)
 *   Body: 50% document drop zone | 50% sidebar (content driven by active top tab)
 *
 * Stats tab sidebar:
 *   General section   → invoice header fields
 *   Payments section  → paymentPlan rows + Add payment
 *   Files section     → placeholder
 *
 * Animation: fade + slide-up on open, reverse on close.
 */
export default function InvoicePreviewModal({ invoice, token, apiBaseUrl, windowName, onClose, onEdit }) {
  const [activeTab, setActiveTab] = useState('Stats');
  const [paymentPlan, setPaymentPlan] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  // Payments added locally (cache until real endpoint exists)
  const [localPayments, setLocalPayments] = useState([]);

  // Animation state: 'opening' → 'open' → 'closing' → 'closingUp'
  const [animState, setAnimState] = useState('opening');

  // Document drop zone state — { name, url, kind: 'pdf'|'image' }
  const [docFile, setDocFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

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

  // Two-step fetch: paymentPlan schedules → paymentDetails per schedule
  // paymentDetails (FIN_Payment_ScheduleDetail) holds actual payments applied,
  // not just the installment schedule amounts.
  useEffect(() => {
    if (!invoice?.id || !token) return;
    setLoadingPayments(true);

    fetch(`${apiBaseUrl}/paymentPlan?parentId=${invoice.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        const schedules = data?.response?.data ?? data?.data ?? [];
        if (schedules.length === 0) return [];
        // Fetch paymentDetails for each schedule in parallel
        return Promise.all(
          schedules.map((s) =>
            fetch(`${apiBaseUrl}/paymentDetails?parentId=${s.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
              .then((d) => d?.response?.data ?? d?.data ?? [])
              .catch(() => [])
          )
        ).then((results) => results.flat());
      })
      .then((details) => setPaymentPlan(details))
      .catch(() => setPaymentPlan([]))
      .finally(() => setLoadingPayments(false));
  }, [invoice?.id, apiBaseUrl, token]);

  function handleAddPayment({ amount, date, account }) {
    const newPayment = {
      id: `local-${Date.now()}`,
      _local: true,
      paymentMethod$_identifier: account,
      dueDate: date,
      amount,
      paidAmount: amount,
      outstandingAmt: 0,
    };
    setLocalPayments((prev) => [...prev, newPayment]);
    setShowAddPayment(false);
  }

  if (!invoice) return null;

  const status = invoice.documentStatus;
  const badgeProps = getStatusBadgeProps(status);
  const label = statusLabel(status);
  const partnerName = invoice.businessPartner$_identifier || invoice.businessPartner || '—';

  // Merge fetched paymentDetails + locally-added payments for display
  const allPayments = [...paymentPlan, ...localPayments];

  // paymentDetails records use `amount` (applied amount); local payments use `paidAmount`
  const totalPaid = allPayments.reduce((s, r) => s + Number(r._local ? (r.paidAmount ?? 0) : (r.amount ?? 0)), 0);
  // Outstanding = grand total minus all paid (including local)
  const grandTotal = Number(invoice.grandTotalAmount ?? 0);
  const totalOutstanding = Math.max(0, grandTotal - totalPaid);

  // "Add payment" is only available when invoice is Completed (CO) with outstanding balance
  const isDraft = status === 'DR' || status === 'draft';
  const isFullyPaid = totalOutstanding <= 0 && allPayments.length > 0;
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
                Purchase Invoice
              </span>
              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled
              >
                <FileText size={13} />
                PDF
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
                onClick={canAddPayment ? () => setShowAddPayment(true) : undefined}
              >
                <Plus size={13} />
                Add payment
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleEdit}>
                <Edit2 size={13} />
                Edit
              </Button>
              <button className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
            </div>

            {/* Right: tab switcher + close */}
            <div className="flex items-center gap-1">
              {TOP_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    activeTab === tab
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tab}
                </button>
              ))}
              <button
                onClick={handleClose}
                className="ml-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                aria-label="Close"
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
                      title="Eliminar documento"
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
                      <p className="text-sm font-medium text-blue-600">Drop file here</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-600 mt-1">Upload your document</p>
                        <button
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        >
                          Click here to upload your file
                        </button>
                        <p className="text-xs text-gray-400">PDF, JPG, PNG, WebP, GIF</p>
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
              {activeTab === 'Stats' && (
                <StatsPanel
                  invoice={invoice}
                  partnerName={partnerName}
                  badgeProps={badgeProps}
                  statusLabel={label}
                  allPayments={allPayments}
                  loadingPayments={loadingPayments}
                  totalPaid={totalPaid}
                  totalOutstanding={totalOutstanding}
                  canAddPayment={canAddPayment}
                  isDraft={isDraft}
                  isFullyPaid={isFullyPaid}
                  onAddPayment={() => setShowAddPayment(true)}
                />
              )}
              {activeTab === 'Messages' && (
                <EmptyPanel icon="💬" text="No messages yet" />
              )}
              {activeTab === 'History' && (
                <EmptyPanel icon="🕐" text="No activity recorded" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add payment sub-modal */}
      {showAddPayment && (
        <AddPaymentModal
          invoice={invoice}
          outstanding={totalOutstanding}
          onClose={() => setShowAddPayment(false)}
          onSave={handleAddPayment}
        />
      )}
    </>
  );
}

// ── Stats panel: General + Payments + Files sections ──

function SectionCard({ title, done, children }) {
  return (
    <div className="mx-4 mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-gray-800 text-sm">{title}</span>
        {done && <Check size={15} className="text-green-500" />}
      </div>
      <div className="px-4 py-3">{children}</div>
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

function StatsPanel({ invoice, partnerName, badgeProps, statusLabel: sl, allPayments, loadingPayments, totalPaid, totalOutstanding, canAddPayment, isDraft, isFullyPaid, onAddPayment }) {
  const invoiceDate = invoice.invoiceDate
    ? new Date(invoice.invoiceDate).toLocaleDateString('en-GB')
    : '—';

  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('en-GB')
    : '—';

  const isPaid = allPayments.length > 0 && totalOutstanding <= 0;

  return (
    <div className="pb-4">
      {/* General */}
      <SectionCard title="General" done={true}>
        <InfoRow label="Total" value={formatAmount(invoice.grandTotalAmount)} />
        <InfoRow label="Document number" value={invoice.documentNo} />
        <InfoRow label="Contact" value={partnerName} link />
        <InfoRow label="Date" value={invoiceDate} />
        <InfoRow label="Due date" value={dueDate} />
        <div className="flex justify-between items-center py-1.5 text-sm">
          <span className="text-gray-500">Status</span>
          <Badge {...badgeProps}>{sl}</Badge>
        </div>
      </SectionCard>

      {/* Payments */}
      <SectionCard title="Payments" done={isPaid}>
        {loadingPayments ? (
          <p className="text-xs text-gray-400 py-2 text-center">Loading...</p>
        ) : allPayments.length === 0 ? (
          <p className="text-xs text-gray-400 py-2 text-center">No payments recorded</p>
        ) : (
          <div className="space-y-2 mb-3">
            {allPayments.map((row, i) => {
              // paymentDetails records enriched by PaymentDetailsHandler: documentNo, paymentDate
              // Local payments added via AddPaymentModal: dueDate, paymentMethod$_identifier
              let date = '—';
              if (row._local && row.dueDate) {
                date = new Date(row.dueDate).toLocaleDateString('es-ES');
              } else if (row.paymentDate) {
                date = row.paymentDate;
              }

              let ref = '—';
              if (row._local) {
                ref = row.paymentMethod$_identifier || 'PAYMENT';
              } else {
                ref = row.documentNo || '—';
              }

              const amount = row._local ? (row.paidAmount ?? row.amount) : row.amount;

              return (
                <div key={row.id ?? i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    </div>
                    <div>
                      <span className="text-gray-700 font-medium truncate max-w-[80px] block">{ref}</span>
                      {row._local && (
                        <span className="text-[10px] text-amber-600 font-medium">pending sync</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">{date}</div>
                    <div className="font-medium text-gray-900">{formatAmount(amount)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={canAddPayment ? onAddPayment : undefined}
          disabled={!canAddPayment}
          title={
            !canAddPayment
              ? isDraft
                ? 'Cannot add payments to a draft invoice'
                : isFullyPaid
                  ? 'Invoice is fully paid'
                  : 'Invoice must be completed to add payments'
              : undefined
          }
          className={`w-full py-2 text-sm font-medium border rounded-lg transition-colors ${
            canAddPayment
              ? 'text-blue-600 border-blue-200 hover:bg-blue-50 cursor-pointer'
              : 'text-gray-400 border-gray-200 bg-gray-50 cursor-not-allowed'
          }`}
        >
          Add payment
        </button>
      </SectionCard>

      {/* Files */}
      <SectionCard title="Files">
        <button
          disabled
          className="w-full py-2 text-sm text-gray-400 border border-dashed border-gray-300 rounded-lg cursor-default"
        >
          Add attachment
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
