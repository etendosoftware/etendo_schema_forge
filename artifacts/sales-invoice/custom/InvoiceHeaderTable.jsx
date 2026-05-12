import { useState, useMemo, useRef, useEffect } from 'react';
import { DataTable } from '@/components/contract-ui';
import { useLocale, useLocaleSwitch } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { formatCalendarDate, getCalendarDateRelation } from '@/lib/dateOnly';
import {
  getDueDateState,
  getDueDateDotStyle,
  getDueDateTextStyle,
} from '@/lib/invoiceDueDate';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import { useInvoiceListFiscalStatus } from '@/windows/custom/shared/useInvoiceListFiscalStatus.js';
import { FiscalStatusBadge } from '@/windows/custom/shared/FiscalStatusBadge.jsx';

// ─── Invoice-specific status logic ───────────────────────────────

function isCreditNote(row) {
  return (row['transactionDocument$_identifier'] || '').toLowerCase().includes('credit');
}

function getInvoiceStatus(row) {
  const docStatus = row.documentStatus;
  if (docStatus === 'DR') return 'draft';
  if (docStatus === 'VO') return 'voided';
  if (docStatus === 'CL') return 'closed';
  const grand = row.grandTotalAmount ?? 0;
  const outstanding = row.outstandingAmount ?? grand;
  const paid = grand - outstanding;
  if (outstanding <= 0 || row.paymentComplete === true || row.paymentComplete === 'Y')
    return 'paid';
  if (row.eTGODueDate) {
    if (getCalendarDateRelation(row.eTGODueDate) === 'past' && outstanding > 0) return 'overdue';
  }
  if (paid > 0) return 'partial';
  return 'pending';
}

function getPaymentFilter(row) {
  const s = getInvoiceStatus(row);
  if (s === 'paid') return 'paid';
  if (s === 'partial') return 'partial';
  if (s === 'pending' || s === 'overdue') return 'pending';
  return null;
}

const filters = ['documentNo', 'invoiceDate', 'businessPartner'];

// ─── Component ──────────────────────────────────────────────────

export default function InvoiceHeaderTable(props) {
  const { token, apiBaseUrl, data } = props;
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  const gl = dictionary?.genericLabels || {};
  const t = (key) => gl[key] || key;

  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile } = useFiscalConfig(orgId, token, apiBaseUrl);

  const targets = useMemo(() => getInvoiceFiscalTargets('sales-invoice', profile), [profile]);

  const ids = useMemo(() => (data || []).map(r => r.id).filter(Boolean), [data]);
  const { statusMap, loading: fiscalLoading } = useInvoiceListFiscalStatus(ids, 'sales-invoice', profile, apiBaseUrl, token, orgId);

  // Derive stable label strings from gl (avoids putting the unstable ui() fn in useMemo deps)
  const siiColLabel  = gl['invoiceList.col.siiStatus']       || 'SII Status';
  const tbaiColLabel = gl['invoiceList.col.tbaiStatus']      || 'TBAI Status';
  const vfColLabel   = gl['invoiceList.col.verifactuStatus'] || 'Verifactu Status';

  // ─── Custom columns ────────────────────────────────────────────
  const columns = useMemo(() => {
    const fiscalCols = [];
    if (targets.showSii) {
      fiscalCols.push({
        key: '_siiStatus', type: 'custom', label: siiColLabel,
        render: (row) => <FiscalStatusBadge status={statusMap?.[row.id]?.sii} loading={fiscalLoading && !statusMap} />,
      });
    }
    if (targets.showTbai) {
      fiscalCols.push({
        key: '_tbaiStatus', type: 'custom', label: tbaiColLabel,
        render: (row) => <FiscalStatusBadge status={statusMap?.[row.id]?.tbai ?? 'Pendiente'} loading={fiscalLoading && !statusMap} />,
      });
    }
    if (targets.showVerifactu) {
      fiscalCols.push({
        key: '_vfStatus', type: 'custom', label: vfColLabel,
        render: (row) => <FiscalStatusBadge status={statusMap?.[row.id]?.verifactu} loading={fiscalLoading && !statusMap} />,
      });
    }

    return [
      { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', dot: false },
      {
        key: 'documentNo', column: 'DocumentNo', type: 'string',
        pill: {
          when: (row) => isCreditNote(row),
          label: t('creditNoteLabel'),
          className: 'bg-purple-50 text-purple-700 border-purple-200',
        },
      },
      {
        key: 'eTGODueDate', column: 'EM_Etgo_Due_Date', type: 'custom', label: t('dueDate'),
        render: (row) => {
          const d = row.eTGODueDate;
          if (!d) return <span className="text-muted-foreground">—</span>;
          const state = getDueDateState(d, row.outstandingAmount);
          return (
            <span className="inline-flex items-center gap-1.5" style={getDueDateTextStyle(state)}>
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={getDueDateDotStyle(state)} />
              {formatCalendarDate(d, locale)}
            </span>
          );
        },
      },
      { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
      { key: 'documentStatus', column: 'DocStatus', type: 'status', label: t('statusColumn') },
      ...fiscalCols,
      { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
      { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount' },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' },
    ];
  }, [gl, locale, targets, fiscalLoading, statusMap, siiColLabel, tbaiColLabel, vfColLabel]);

  // ─── Filter options ───────────────────────────────────────────
  const TYPE_OPTIONS = useMemo(() => [
    { value: 'all',          label: t('allTab') },
    { value: 'invoices',     label: t('invoicesTab') },
    { value: 'credit-notes', label: t('creditNotesTab') },
  ], [gl]);

  const PAYMENT_STATUS_OPTIONS = useMemo(() => [
    { value: 'all',     label: t('allPayments') },
    { value: 'paid',    label: t('statusPaid'),    dot: 'bg-emerald-500' },
    { value: 'pending', label: t('statusPending'), dot: 'bg-amber-500' },
    { value: 'partial', label: t('statusPartial'), dot: 'bg-blue-500' },
  ], [gl]);

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
    let rows = data;
    if (!rows) return rows;
    if (typeFilter === 'credit-notes') rows = rows.filter(isCreditNote);
    else if (typeFilter === 'invoices') rows = rows.filter(r => !isCreditNote(r));
    if (paymentFilter !== 'all') rows = rows.filter(r => getPaymentFilter(r) === paymentFilter);
    return rows;
  }, [data, typeFilter, paymentFilter]);

  const activePaymentLabel = PAYMENT_STATUS_OPTIONS.find(o => o.value === paymentFilter)?.label || t('allPayments');

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
                  ? 'text-foreground font-semibold bg-muted/50 rounded-t-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
              {typeFilter === opt.value && (
                <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-primary rounded-full" />
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
