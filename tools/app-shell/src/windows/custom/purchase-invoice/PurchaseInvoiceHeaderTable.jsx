import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { DataTable } from '@/components/contract-ui';
import { useLocale, useLocaleSwitch } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { formatCalendarDate } from '@/lib/dateOnly';
import {
  getDueDateState,
  getDueDateDotStyle,
  getDueDateTextStyle,
} from '@/lib/invoiceDueDate';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import { FiscalStatusBadge } from '@/windows/custom/shared/FiscalStatusBadge.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';
import InvoicePaymentHistoryModal from '@/windows/custom/shared/InvoicePaymentHistoryModal.jsx';
import { getApSubtype } from '@generated/purchase-invoice/custom/purchaseInvoiceSubtype.js';

/* eslint-disable react/prop-types */

const filters = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus'];

// Legacy doc-type-name fallback for the two return-invoice names ETP-4738 doesn't cover via
// apInvoiceSubtype (AP has no "DEV" subtype — a return generates an AP CreditMemo, same doc).
const NC_RETURN_TYPES = new Set(['AP CreditMemo', 'Return Material Purchase Invoice', 'Reversed Purchase Invoice']);

const DOC_TYPE_BADGE = {
  'AP Invoice':                         { color: 'var(--status-info-fg)', bg: 'var(--status-info-bg)', label: 'invoicesTab' },
  'AP CreditMemo':                      { color: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)', label: 'creditNotesTab' },
  'Return Material Purchase Invoice':   { color: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)', label: 'returnInvoiceTab' },
  'Reversed Purchase Invoice':          { color: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)', label: 'returnInvoiceTab' },
};

function isNcOrReturn(row) {
  // ETP-4738: prefer the server-injected apInvoiceSubtype (covers Facturas Rectificativas de
  // Compra with a negative total, in addition to the legacy AP CreditMemo type); fall back to
  // doc-type-name matching for the two return-invoice names apInvoiceSubtype doesn't cover.
  return getApSubtype(row) === 'NC' || NC_RETURN_TYPES.has(row?.['transactionDocument$_identifier']);
}

export default function PurchaseInvoiceHeaderTable(props) {
  const { apiBaseUrl } = props;
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  const gl = dictionary?.genericLabels || {};
  const t = (key) => gl[key] || key;

  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile } = useFiscalConfig(orgId, apiBaseUrl);

  const targets = useMemo(() => getInvoiceFiscalTargets('purchase-invoice', profile), [profile]);

  const [paymentRow, setPaymentRow] = useState(null);

  const siiColLabel = gl['invoiceList.col.siiStatus'] || 'SII Status';

  const columns = useMemo(() => {
    const fiscalCols = [];
    if (targets.showSii) {
      fiscalCols.push({
        key: '_siiStatus', type: 'custom', label: siiColLabel,
        render: (row) => <FiscalStatusBadge
          status={row.aeatsiiEstado ?? null}
          data-testid="FiscalStatusBadge__6b7cdb" />,
      });
    }

    return [
      { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', dot: false, required: true },
      {
        key: 'transactionDocument',
        column: 'C_DocTypeTarget_ID',
        type: 'custom',
        required: true,
        // `type: 'custom'` drives the badge cell render, but that would make the
        // advanced filter fall back to a free-text input. `filterMode` (honored
        // first by resolveFilterMode, ignored by DataTable) restores the correct
        // identifier picker for this FK column without touching the grid cell.
        filterMode: 'identifier',
        // `labels` (priority 1 in resolveColumnLabel) must be set so this header
        // outranks the AD-dictionary fallback translate('C_DocTypeTarget_ID'),
        // which otherwise resolves to "Documento transacción".
        labels: { [locale]: t('documentType') },
        label: t('documentType'),
        render: (row) => {
          const adName = row['transactionDocument$_identifier'];
          const cfg = DOC_TYPE_BADGE[adName];
          if (!cfg) return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ color: cfg.color, backgroundColor: cfg.bg }}
            >
              {t(cfg.label)}
            </span>
          );
        },
      },
      { key: 'orderReference', column: 'POReference', type: 'string' },
      {
        key: 'eTGODueDate', column: 'EM_Etgo_Due_Date', type: 'custom', label: t('dueDate'),
        // The cell renders a coloured due-date dot, so it must stay `custom` —
        // but the underlying column is a plain date. Without this the advanced
        // filter would offer text operators instead of Before/After/Between.
        filterMode: 'date',
        render: (row) => {
          const d = row.eTGODueDate;
          if (!d) return <span className="text-muted-foreground">—</span>;
          if (isNcOrReturn(row)) {
            return <span>{formatCalendarDate(d, locale)}</span>;
          }
          const state = getDueDateState(d, row.outstandingAmount);
          return (
            <span className="inline-flex items-center gap-1.5" style={getDueDateTextStyle(state)}>
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={getDueDateDotStyle(state)} />
              {formatCalendarDate(d, locale)}
            </span>
          );
        },
      },
      { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector', required: true },
      { key: 'documentStatus', column: 'DocStatus', type: 'status', label: t('statusDocColumn'), required: true },
      { key: 'posted', column: 'Posted', type: 'boolean', required: true, badge: true, badgeLabels: { true: { en_US: 'Posted', es_ES: 'Contabilizado' }, false: { en_US: 'Not posted', es_ES: 'Sin contabilizar' } }, badgeVariants: { true: 'green', false: 'orange' } },
      ...fiscalCols,
      {
        key: 'grandTotalAmount', column: 'GrandTotal', type: 'custom', required: true,
        label: t('impTotal'),
        // The cell sign-flips credit notes / returns, so it must stay `custom`
        // — but the underlying column is an amount (sales-invoice declares the
        // same column as `type: 'amount'`).
        filterMode: 'numeric',
        render: (row) => {
          const raw = row.grandTotalAmount;
          const currency = row['currency$_identifier'];
          const amount = isNcOrReturn(row) ? -Math.abs(Number(raw)) : Number(raw);
          return <span className="tabular-nums">{formatCurrency(currency, amount)}</span>;
        },
      },
      {
        key: 'outstandingAmount',
        column: 'OutstandingAmt',
        type: 'custom',
        required: true,
        label: t('pendingPaymentColumn'),
        // The cell renders status pills and a payment button, so it must stay
        // `custom` — but the underlying column is an amount. Without this the
        // `?filter=overdue` preload (outstandingAmount greaterThan 0) resolves
        // to text mode, which has no `greaterThan`, and the operator select
        // renders empty (ETP-4681).
        filterMode: 'numeric',
        render: (row) => {
          const outstanding = parseFloat(row.outstandingAmount ?? 0);
          const currency = row['currency$_identifier'] || 'EUR';
          if (row.documentStatus !== 'CO') return <span className="text-muted-foreground">—</span>;
          if (isNcOrReturn(row)) {
            const outstandingAbs = Math.abs(outstanding);
            if (outstandingAbs < 0.001) {
              return (
                <span style={{display:'inline-flex',alignItems:'center',gap:5,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:'var(--status-success-bg)',color:'var(--status-success-fg)'}}>
                  <Check size={12} data-testid="Check__6b7cdb" />Aplicada
                                  </span>
              );
            }
            // A credit note / return always represents money owed back by the
            // supplier, never money still owed to them — the label stays
            // "Saldo a favor" for any remaining unused balance, however much
            // of it has already been applied elsewhere.
            return (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
                style={{display:'inline-flex',alignItems:'center',gap:7,font:'600 13px/1 Inter',padding:'6px 11px',borderRadius:8,background:'var(--status-info-bg)',border:'1px solid var(--status-info-border)',color:'var(--status-info-fg)',cursor:'pointer',fontVariantNumeric:'tabular-nums'}}
              >
                <span style={{width:8,height:8,borderRadius:'50%',background:'var(--status-info-fg)',flexShrink:0,display:'inline-block'}}/>
                Saldo a favor · {formatCurrency(currency, outstandingAbs)}
              </button>
            );
          }
          if (outstanding <= 0) {
            return (
              <span style={{display:'inline-flex',alignItems:'center',gap:5,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:'var(--status-success-bg)',color:'var(--status-success-fg)'}}>
                <Check size={12} data-testid="Check__6b7cdb" />{t('pagada')}
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
              aria-label={t('addPago')}
              style={{display:'inline-flex',alignItems:'center',gap:7,font:'600 13px/1 Inter',padding:'6px 11px',borderRadius:8,background:'var(--status-warning-bg)',border:'1px solid var(--status-warning-border)',color:'var(--status-warning-fg)',cursor:'pointer',fontVariantNumeric:'tabular-nums'}}
            >
              <span style={{width:8,height:8,borderRadius:'50%',background:'var(--status-warning-fg)',flexShrink:0,display:'inline-block'}}/>
              {formatCurrency(currency, outstanding)}
              <span style={{display:'inline-flex',alignItems:'center',color:'var(--status-warning-fg)'}}><Plus size={13} data-testid="Plus__6b7cdb" /></span>
            </button>
          );
        },
      },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' },
    ];
  }, [gl, locale, targets, siiColLabel]);

  return (
    <>
      <DataTable
        columns={columns}
        filters={filters}
        {...props}
        data-testid="DataTable__6b7cdb" />
      {paymentRow && (
        <InvoicePaymentHistoryModal
          invoiceId={paymentRow.id}
          invoiceData={paymentRow}
          specName="purchase-invoice"
          apiBaseUrl={apiBaseUrl}
          onClose={() => setPaymentRow(null)}
          onPaymentAdded={() => { setPaymentRow(null); props.onDataMutated?.(); }}
          data-testid="InvoicePaymentHistoryModal__6b7cdb" />
      )}
    </>
  );
}
