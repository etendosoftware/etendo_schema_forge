import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { DataTable } from '@/components/contract-ui';
import { useLocale, useLocaleSwitch, useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { formatCalendarDate } from '@/lib/dateOnly';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  getDueDateState,
  getDueDateDotStyle,
  getDueDateTextStyle,
} from '@/lib/invoiceDueDate';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import { FiscalStatusBadge, normalizeVerifactuStatus } from '@/windows/custom/shared/FiscalStatusBadge.jsx';
import InvoicePaymentHistoryModal from '@/windows/custom/shared/InvoicePaymentHistoryModal.jsx';
import { resolveInvoicePaymentBadge } from '@/windows/custom/shared/invoicePaymentBadge.js';
import { getArSubtype } from './invoiceSubtype';

// ─── Invoice-specific status logic ───────────────────────────────

// `getArSubtype` (ETP-4737's unified FAC | RECTIFICATIVA) drives only the
// DOCUMENT-TYPE badge column below. Payment state — "Saldo a favor" vs payable —
// is decided by the sign of the total via resolveInvoicePaymentBadge (ETP-4841),
// never by the document type.

function fmtAmt(val, currency) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(currency || 'EUR', n);
}

const FILTERS = ['documentNo', 'invoiceDate', 'businessPartner'];

// ─── Component ──────────────────────────────────────────────────

export default function InvoiceHeaderTable(props) {
  const { apiBaseUrl } = props;
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  const ui = useUI();
  const gl = dictionary?.genericLabels || {};
  const t = (key) => gl[key] || key;

  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile } = useFiscalConfig(orgId, apiBaseUrl);

  const targets = useMemo(() => getInvoiceFiscalTargets('sales-invoice', profile), [profile]);

  const [paymentRow, setPaymentRow] = useState(null);

  // Derive stable label strings from gl
  const siiColLabel  = gl['invoiceList.col.siiStatus']       || 'SII Status';
  const tbaiColLabel = gl['invoiceList.col.tbaiStatus']      || 'TBAI Status';
  const vfColLabel   = gl['invoiceList.col.verifactuStatus'] || 'Verifactu Status';

  // ─── Custom columns ────────────────────────────────────────────
  const columns = useMemo(() => {
    const fiscalCols = [];
    if (targets.showSii) {
      fiscalCols.push({
        key: '_siiStatus', type: 'custom', label: siiColLabel,
        render: (row) => <FiscalStatusBadge status={row.aeatsiiEstado ?? null} />,
      });
    }
    if (targets.showTbai) {
      fiscalCols.push({
        key: '_tbaiStatus', type: 'custom', label: tbaiColLabel,
        render: (row) => <FiscalStatusBadge status={row.tbaiSyncEstado ?? 'Pendiente'} />,
      });
    }
    if (targets.showVerifactu) {
      fiscalCols.push({
        key: '_vfStatus', type: 'custom', label: vfColLabel,
        render: (row) => <FiscalStatusBadge status={normalizeVerifactuStatus(row.etvfacInvoiceStatus ?? null)} />,
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
        labels: { [locale]: t('documentType') },
        label: t('documentType'),
        render: (row) => {
          const sub = getArSubtype(row);
          const cfg = sub === 'RECTIFICATIVA'
            ? { color: 'hsl(var(--primary))', bg: 'hsl(var(--primary) / 0.1)', label: t('rectificativeInvoicesTab') }
            : { color: 'var(--status-info-fg)', bg: 'var(--status-info-bg)', label: t('invoicesTab') };
          return (
            <span
              className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ color: cfg.color, backgroundColor: cfg.bg }}
            >
              {cfg.label}
            </span>
          );
        },
      },
      { key: 'documentNo', column: 'DocumentNo', type: 'string', label: gl['documentNo'] || 'Document No.', required: true },
      {
        key: 'eTGODueDate', column: 'EM_Etgo_Due_Date', type: 'custom', label: t('dueDate'),
        // The cell renders a coloured due-date dot, so it must stay `custom` —
        // but the underlying column is a plain date. Without this the advanced
        // filter would offer text operators instead of Before/After/Between.
        filterMode: 'date',
        render: (row) => {
          const d = row.eTGODueDate;
          if (!d) return <span className="text-muted-foreground">—</span>;
          // A credit instrument has no meaningful due date — no colour, no dot.
          // Sign-based (ETP-4841), so a POSITIVE rectificativa keeps its due-date
          // state like any other payable invoice.
          if (resolveInvoicePaymentBadge(row).isCredit) {
            return <span className="text-muted-foreground">{formatCalendarDate(d, locale)}</span>;
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
      { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string', required: true },
      { key: 'documentStatus', column: 'DocStatus', type: 'status', label: t('statusDocColumn'), required: true },
      { key: 'posted', column: 'Posted', type: 'boolean', required: true, badge: true, badgeLabels: { true: { en_US: 'Posted', es_ES: 'Contabilizado' }, false: { en_US: 'Not posted', es_ES: 'Sin contabilizar' } }, badgeVariants: { true: 'green', false: 'orange' } },
      ...fiscalCols,
      { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: t('impTotal'), required: true },
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
          const currency = row['currency$_identifier'] || 'EUR';
          // ETP-4841: the badge follows the SIGN of the total, not the document type
          // — a positive Factura Rectificativa is payable and a negative ordinary
          // Factura is a credit. See shared/invoicePaymentBadge.js.
          const badge = resolveInvoicePaymentBadge(row);
          if (badge.kind === 'draft') return <span className="text-muted-foreground">—</span>;
          if (badge.kind === 'credit-applied') {
            return (
              <span style={{display:'inline-flex',alignItems:'center',gap:5,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:'var(--status-success-bg)',color:'var(--status-success-fg)'}}>
                <Check size={12}/>{ui('cpCreditFullyApplied')}
              </span>
            );
          }
          if (badge.kind === 'credit-available') {
            // A credit instrument always represents money owed back to the
            // customer, never money still owed by them — the label stays
            // "Saldo a favor" for any remaining unused balance, however much
            // of it has already been applied elsewhere.
            return (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
                style={{display:'inline-flex',alignItems:'center',gap:7,font:'600 13px/1 Inter',padding:'6px 11px',borderRadius:8,background:'var(--status-info-bg)',border:'1px solid var(--status-info-border)',color:'hsl(var(--primary))',cursor:'pointer',fontVariantNumeric:'tabular-nums'}}
              >
                <span style={{width:8,height:8,borderRadius:'50%',background:'hsl(var(--primary))',flexShrink:0,display:'inline-block'}}/>
                {ui('cpFavorBadge')} · {fmtAmt(badge.amount, currency)}
              </button>
            );
          }
          if (badge.kind === 'paid') {
            return (
              <span style={{display:'inline-flex',alignItems:'center',gap:5,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:'var(--status-success-bg)',color:'var(--status-success-fg)'}}>
                <Check size={12}/>{t('cobrada')}
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
              aria-label={t('addCobro')}
              style={{display:'inline-flex',alignItems:'center',gap:7,font:'600 13px/1 Inter',padding:'6px 11px',borderRadius:8,background:'var(--status-warning-bg)',border:'1px solid var(--status-warning-border)',color:'var(--status-warning-fg)',cursor:'pointer',fontVariantNumeric:'tabular-nums'}}
            >
              <span style={{width:8,height:8,borderRadius:'50%',background:'var(--status-warning-fg)',flexShrink:0,display:'inline-block'}}/>
              {fmtAmt(badge.amount, currency)}
              <span style={{display:'inline-flex',alignItems:'center',color:'var(--status-warning-fg)'}}><Plus size={13}/></span>
            </button>
          );
        },
      },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' },
    ];
  }, [gl, ui, locale, targets, siiColLabel, tbaiColLabel, vfColLabel]);

  return (
    <>
      <DataTable columns={columns} filters={FILTERS} {...props} />
      {paymentRow && (
        <InvoicePaymentHistoryModal
          invoiceId={paymentRow.id}
          invoiceData={paymentRow}
          specName="sales-invoice"
          apiBaseUrl={apiBaseUrl}
          onClose={() => setPaymentRow(null)}
          onPaymentAdded={() => { setPaymentRow(null); props.onDataMutated?.(); }}
        />
      )}
    </>
  );
}
