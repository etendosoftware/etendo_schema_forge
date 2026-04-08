import { useState, useMemo, useRef, useEffect } from 'react';
import { DataTable } from '@/components/contract-ui';

// ─── Invoice-specific status logic ───────────────────────────────

function isCreditNote(row) {
  return (row['transactionDocument$_identifier'] || '').toLowerCase().includes('credit');
}

const STATUS_STYLES = {
  draft:   { label: 'Draft',   className: 'bg-gray-100 text-gray-600 border border-gray-200' },
  paid:    { label: 'Paid',    className: 'bg-emerald-600 text-white border-transparent' },
  partial: { label: 'Partial', className: 'bg-blue-50 text-blue-700 border border-blue-300' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border border-amber-300' },
  overdue: { label: 'Overdue', className: 'bg-red-50 text-red-700 border border-red-300' },
  voided:  { label: 'Voided',  className: 'bg-red-100 text-red-600 border border-red-200' },
  closed:  { label: 'Closed',  className: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

function getInvoiceStatus(row) {
  const docStatus = row.documentStatus;
  if (docStatus === 'DR') return STATUS_STYLES.draft;
  if (docStatus === 'VO') return STATUS_STYLES.voided;
  if (docStatus === 'CL') return STATUS_STYLES.closed;
  const grand = row.grandTotalAmount ?? 0;
  const outstanding = row.outstandingAmount ?? grand;
  const paid = grand - outstanding;
  if (outstanding <= 0 || row.paymentComplete === true || row.paymentComplete === 'Y')
    return STATUS_STYLES.paid;
  if (row.dueDate) {
    const due = new Date(row.dueDate);
    if (due < new Date() && outstanding > 0) return STATUS_STYLES.overdue;
  }
  if (paid > 0) return STATUS_STYLES.partial;
  return STATUS_STYLES.pending;
}

function getPaymentFilter(row) {
  const s = getInvoiceStatus(row);
  if (s === STATUS_STYLES.paid) return 'paid';
  if (s === STATUS_STYLES.partial) return 'partial';
  if (s === STATUS_STYLES.pending || s === STATUS_STYLES.overdue) return 'pending';
  return null;
}

// ─── Custom columns (override generated ones) ───────────────────

const columns = [
  {
    key: 'documentNo', column: 'DocumentNo', type: 'string',
    pill: {
      when: (row) => isCreditNote(row),
      label: 'Credit note',
      className: 'bg-purple-50 text-purple-700 border-purple-200',
    },
  },
  { key: 'invoiceDate', column: 'DateInvoiced', type: 'date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: '_status', column: '_status', type: 'custom', label: 'Status',
    render: (row) => {
      const s = getInvoiceStatus(row);
      return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`} style={{ borderWidth: '0.5px' }}>{s.label}</span>;
    },
  },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
];

const filters = ['documentNo', 'invoiceDate', 'businessPartner'];

// ─── Filter options ─────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'credit-notes', label: 'Credit notes' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'all', label: 'All payments' },
  { value: 'paid', label: 'Paid', dot: 'bg-emerald-500' },
  { value: 'pending', label: 'Pending', dot: 'bg-amber-500' },
  { value: 'partial', label: 'Partial', dot: 'bg-blue-500' },
];

// ─── Component ──────────────────────────────────────────────────

export default function InvoiceHeaderTable(props) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!showPaymentDropdown) return;
    const handleClick = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowPaymentDropdown(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPaymentDropdown]);

  const filteredData = useMemo(() => {
    let rows = props.data;
    if (!rows) return rows;
    if (typeFilter === 'credit-notes') rows = rows.filter(isCreditNote);
    else if (typeFilter === 'invoices') rows = rows.filter(r => !isCreditNote(r));
    if (paymentFilter !== 'all') rows = rows.filter(r => getPaymentFilter(r) === paymentFilter);
    return rows;
  }, [props.data, typeFilter, paymentFilter]);

  const activePaymentLabel = PAYMENT_STATUS_OPTIONS.find(o => o.value === paymentFilter)?.label || 'All payments';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {/* Type tabs */}
        <div className="flex items-center gap-0.5">
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTypeFilter(opt.value)}
              className={`text-xs px-2.5 py-1.5 transition-colors relative ${
                typeFilter === opt.value
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
              {typeFilter === opt.value && (
                <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-foreground rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Payment status dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setShowPaymentDropdown(v => !v)}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              paymentFilter !== 'all'
                ? 'border-primary/30 bg-primary/5 text-foreground font-medium'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            style={{ borderWidth: '0.5px' }}
          >
            {paymentFilter !== 'all' && (
              <span className={`w-1.5 h-1.5 rounded-full ${PAYMENT_STATUS_OPTIONS.find(o => o.value === paymentFilter)?.dot}`} />
            )}
            {activePaymentLabel}
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {showPaymentDropdown && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-border/60 rounded-lg shadow-lg py-1 min-w-[140px]" style={{ borderWidth: '0.5px' }}>
              {PAYMENT_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setPaymentFilter(opt.value); setShowPaymentDropdown(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                    paymentFilter === opt.value ? 'bg-muted/50 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }`}
                >
                  {opt.dot && <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />}
                  {opt.label}
                  {paymentFilter === opt.value && (
                    <svg className="w-3 h-3 ml-auto text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <DataTable columns={columns} filters={filters} {...props} data={filteredData} />
    </div>
  );
}
