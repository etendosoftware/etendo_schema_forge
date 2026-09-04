import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { DataTable } from '@/components/contract-ui';
import { useLocale, useLocaleSwitch, useUI } from '@/i18n';
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
import { resolveInvoicePaymentBadge } from '@/windows/custom/shared/invoicePaymentBadge.js';
import { isSent } from '@/windows/custom/shared/sifSending.js';
import { getApSubtype } from '@generated/purchase-invoice/custom/purchaseInvoiceSubtype.js';

/* eslint-disable react/prop-types */

const filters = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus'];

// ETP-4737/ETP-4738: badge config keyed by the unified subtype (FAC/RECTIFICATIVA) resolved
// via getApSubtype — NOT by the raw AD doc-type name. A hardcoded name Set silently misses any
// new document type sharing the same category (this is exactly how the previous version of
// this file missed "Factura Rectificativa (compras)" until this fix).
const SUBTYPE_BADGE = {
  FAC:            { color: 'var(--status-info-fg)', bg: 'var(--status-info-bg)', label: 'invoicesTab' },
  RECTIFICATIVA:  { color: 'var(--status-warning-fg)', bg: 'var(--status-warning-bg)', label: 'rectificativeInvoicesTab' },
};

// ETP-4833: shared base style for every inline-flex badge/button rendered by
// this file (credit-applied, credit-available, paid, pending-payment). Without
// `whiteSpace: 'nowrap'` a two-word label (e.g. "Factura Rectificativa") or a
// "Saldo a favor · X €" amount wraps onto a second line whenever the grid's
// column width shrinks (e.g. on scroll-triggered column recalculation).
// `flexShrink: 0` stops the flex container itself from being squeezed
// narrower than its content, which is what allows the wrap to happen in the
// first place. Kept as one small constant — rather than repeating both
// properties in each renderer's style object — so a future extraction into a
// shared `shared/StatusPill.jsx` (once sales-invoice needs the same badges)
// is a mechanical lift, not a redesign.
const NOWRAP_FLEX = { whiteSpace: 'nowrap', flexShrink: 0 };

// `getApSubtype` drives ONLY the document-type badge above. Payment state —
// "Saldo a favor" vs payable — is decided by the sign of the total via
// resolveInvoicePaymentBadge (ETP-4841), never by the document type.

export default function PurchaseInvoiceHeaderTable(props) {
  const { apiBaseUrl } = props;
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  const ui = useUI();
  const gl = dictionary?.genericLabels || {};
  const t = (key) => gl[key] || key;

  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile, tbaiRecord } = useFiscalConfig(orgId, apiBaseUrl);
  const territory = tbaiRecord?.etsgSifTerritory ?? null;

  // ETP-5087: BOTH fiscal columns resolve synchronously from the single,
  // globally-selected org (`useFiscalConfig(orgId)` above) — no per-row, async
  // org resolution. This is deliberate and symmetric with the SII column, which
  // has always worked this way and never misbehaved. An earlier revision gated
  // the Batuz column on a per-row `useOrgFiscalConfigs` batch fetch instead; the
  // extra asynchrony produced three consecutive production regressions (invisible
  // column, SII column broken, stale Map reference freezing the memo) without
  // adding any capability the list actually needs.
  //
  // Documented trade-off: a page mixing legal entities from DIFFERENT territories
  // shows/hides the Batuz column according to the org selected in the top-nav,
  // not per row — exactly the same trade-off the SII column already makes. The
  // Bizkaia-only restriction itself is NOT duplicated here: it lives entirely in
  // `getInvoiceFiscalTargets`, which only returns `showTbai` for a purchase
  // invoice whose territory is BIZKAIA.
  const targets = useMemo(
    () => getInvoiceFiscalTargets('purchase-invoice', profile, territory),
    [profile, territory],
  );

  const [paymentRow, setPaymentRow] = useState(null);

  const siiColLabel = gl['invoiceList.col.siiStatus'] || 'SII Status';
  // ETP-5027: purchase-invoice TBAI is always Batuz (never generic TicketBAI) —
  // see docs/decisions-reference.md / sifSending.js getSifBodyKey for the same rule.
  const tbaiColLabel = gl['invoiceList.col.tbaiStatusPurchase'] || 'Batuz Status';

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
    if (targets.showTbai) {
      fiscalCols.push({
        key: '_tbaiStatus', type: 'custom', label: tbaiColLabel,
        // ETP-5087: `tbaiSyncEstado` is the PRIMARY source — the backend's
        // TbaiSyncStatusInjector fills it from the `tbai_syncinvoice` row with the
        // REAL outcome of the submission to Batuz (Recibido / Rechazado / Error),
        // exactly as the sales-invoice list already does. `tbaiIssent`
        // (AD column `EM_Tbai_Issent`) is only a FALLBACK, for when no sync row
        // exists yet or the injector did not run (e.g. a backend not yet carrying
        // the purchase-side wiring): it proves the invoice was submitted, nothing
        // more. This ordering is what stops the column from ever hiding a
        // rejection behind a cheerful "Enviada", while still never defaulting to a
        // fabricated status. `isSent` is used rather than a plain truthy test
        // because NEO may deliver the flag as the AD character `'N'`, truthy in JS.
        render: (row) => <FiscalStatusBadge
          status={row.tbaiSyncEstado ?? (isSent(row.tbaiIssent) ? 'Enviada' : 'Pendiente')}
          data-testid="FiscalStatusBadge__tbai_6b7cdb" />,
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
          const cfg = SUBTYPE_BADGE[getApSubtype(row)];
          if (!cfg) return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              // ETP-4833: `inline-block` alone doesn't stop text from wrapping
              // once the column narrows below the label's width — a two-word
              // doc type ("Factura Rectificativa") needs an explicit nowrap.
              style={{ color: cfg.color, backgroundColor: cfg.bg, whiteSpace: 'nowrap' }}
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
          // A credit instrument has no meaningful due date — no colour, no dot.
          // Sign-based (ETP-4841), so a POSITIVE rectificativa keeps its due-date
          // state like any other payable invoice.
          if (resolveInvoicePaymentBadge(row).isCredit) {
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
      // ETP-4841: this column used to sign-flip rectificativas (`-Math.abs(...)`),
      // which rendered a POSITIVE Factura Rectificativa as negative. The stored
      // sign is the truth, so the generic `amount` renderer is enough — same
      // declaration sales-invoice has always used.
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
          // ETP-4841: the badge follows the SIGN of the total, not the document
          // type — a positive Factura Rectificativa is payable and a negative
          // ordinary Factura is a credit. See shared/invoicePaymentBadge.js.
          const badge = resolveInvoicePaymentBadge(row);
          if (badge.kind === 'draft') return <span className="text-muted-foreground">—</span>;
          if (badge.kind === 'credit-applied') {
            return (
              <span style={{...NOWRAP_FLEX,display:'inline-flex',alignItems:'center',gap:5,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:'var(--status-success-bg)',color:'var(--status-success-fg)'}}>
                <Check size={12} data-testid="Check__6b7cdb" />{ui('cpCreditFullyApplied')}
              </span>
            );
          }
          if (badge.kind === 'credit-available') {
            // A credit instrument always represents money owed back by the
            // supplier, never money still owed to them — the label stays
            // "Saldo a favor" for any remaining unused balance, however much
            // of it has already been applied elsewhere.
            return (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
                style={{...NOWRAP_FLEX,display:'inline-flex',alignItems:'center',gap:7,font:'600 13px/1 Inter',padding:'6px 11px',borderRadius:8,background:'var(--status-info-bg)',border:'1px solid var(--status-info-border)',color:'var(--status-info-fg)',cursor:'pointer',fontVariantNumeric:'tabular-nums'}}
              >
                <span style={{width:8,height:8,borderRadius:'50%',background:'var(--status-info-fg)',flexShrink:0,display:'inline-block'}}/>
                {ui('cpFavorBadge')} · {formatCurrency(currency, badge.amount)}
              </button>
            );
          }
          // A payment in progress or rejected leaves the invoice with a zero outstanding, so an
          // amount here would be a lie in both directions: "Pagada" for money that never moved, or
          // a figure the user must not pay again. Show the state and make it open the payments
          // modal, where the amounts and the per-payment states live and each row navigates to its
          // payment (ETP-4895).
          if (badge.kind === 'transfer-error' || badge.kind === 'transfer-in-progress') {
            const failed = badge.kind === 'transfer-error';
            const tone = failed ? 'destructive' : 'warning';
            return (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
                data-testid={failed ? 'invoice-transfer-error' : 'invoice-transfer-in-progress'}
                style={{...NOWRAP_FLEX,display:'inline-flex',alignItems:'center',gap:7,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:`var(--status-${tone}-bg)`,border:'none',color:`var(--status-${tone}-fg)`,cursor:'pointer'}}
              >
                <span style={{width:8,height:8,borderRadius:'50%',background:`var(--status-${tone}-fg)`,flexShrink:0,display:'inline-block'}}/>
                {ui(failed ? 'cpPaymentStateError' : 'cpPaymentStateInProgress')}
              </button>
            );
          }
          if (badge.kind === 'paid') {
            return (
              <span style={{...NOWRAP_FLEX,display:'inline-flex',alignItems:'center',gap:5,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:'var(--status-success-bg)',color:'var(--status-success-fg)'}}>
                <Check size={12} data-testid="Check__6b7cdb" />{t('pagada')}
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
              aria-label={t('addPago')}
              style={{...NOWRAP_FLEX,display:'inline-flex',alignItems:'center',gap:7,font:'600 13px/1 Inter',padding:'6px 11px',borderRadius:8,background:'var(--status-warning-bg)',border:'1px solid var(--status-warning-border)',color:'var(--status-warning-fg)',cursor:'pointer',fontVariantNumeric:'tabular-nums'}}
            >
              <span style={{width:8,height:8,borderRadius:'50%',background:'var(--status-warning-fg)',flexShrink:0,display:'inline-block'}}/>
              {formatCurrency(currency, badge.amount)}
              <span style={{display:'inline-flex',alignItems:'center',color:'var(--status-warning-fg)'}}><Plus size={13} data-testid="Plus__6b7cdb" /></span>
            </button>
          );
        },
      },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' },
    ];
  }, [gl, ui, locale, targets, siiColLabel, tbaiColLabel]);

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
