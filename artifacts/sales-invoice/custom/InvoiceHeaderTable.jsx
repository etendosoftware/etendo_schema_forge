import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { DataTable } from '@/components/contract-ui';
import { useLocale, useLocaleSwitch } from '@/i18n';
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
import { getArSubtype } from './invoiceSubtype';

// ─── Invoice-specific status logic ───────────────────────────────

function isCreditNote(row) { return getArSubtype(row) === 'NC'; }
function isReturn(row)     { return getArSubtype(row) === 'DEV'; }
function isCreditType(row) { return isCreditNote(row) || isReturn(row); }

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
      { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', dot: false },
      { key: 'documentNo', column: 'DocumentNo', type: 'string', label: gl['documentNo'] || 'Document No.' },
      {
        key: 'eTGODueDate', column: 'EM_Etgo_Due_Date', type: 'custom', label: t('dueDate'),
        render: (row) => {
          const d = row.eTGODueDate;
          if (!d) return <span className="text-muted-foreground">—</span>;
          if (isCreditType(row)) return <span className="text-muted-foreground">{formatCalendarDate(d, locale)}</span>;
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
      { key: 'documentStatus', column: 'DocStatus', type: 'status', label: t('statusDocColumn') },
      ...fiscalCols,
      { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: t('impTotal') },
      {
        key: 'outstandingAmount',
        column: 'OutstandingAmt',
        type: 'custom',
        label: t('pendingPaymentColumn'),
        render: (row) => {
          const outstanding = parseFloat(row.outstandingAmount ?? 0);
          const currency = row['currency$_identifier'] || 'EUR';
          if (row.documentStatus !== 'CO') return <span className="text-muted-foreground">—</span>;
          if (isCreditType(row)) {
            const outstandingAbs = Math.abs(outstanding);
            const totalAbs = Math.abs(parseFloat(row.grandTotalAmount ?? 0));
            if (outstandingAbs < 0.001) {
              return (
                <span style={{display:'inline-flex',alignItems:'center',gap:5,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:'#E2F7EA',color:'#17663A'}}>
                  <Check size={12}/>Aplicada
                </span>
              );
            }
            const isNoneApplied = totalAbs < 0.001 || outstandingAbs >= totalAbs * 0.99;
            return (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
                style={{display:'inline-flex',alignItems:'center',gap:7,font:'600 13px/1 Inter',padding:'6px 11px',borderRadius:8,background:isNoneApplied?'#F5F3FF':'#FFF9EB',border:`1px solid ${isNoneApplied?'#DDD6FE':'#F2E2BC'}`,color:isNoneApplied?'#6D28D9':'#8A6E25',cursor:'pointer',fontVariantNumeric:'tabular-nums'}}
              >
                <span style={{width:8,height:8,borderRadius:'50%',background:isNoneApplied?'#7C3AED':'#F59E0B',flexShrink:0,display:'inline-block'}}/>
                {isNoneApplied ? 'Saldo a favor' : 'Pendiente'} · {fmtAmt(outstandingAbs, currency)}
              </button>
            );
          }
          if (outstanding <= 0) {
            return (
              <span style={{display:'inline-flex',alignItems:'center',gap:5,font:'500 12px/18px Inter',padding:'3px 10px',borderRadius:999,background:'#E2F7EA',color:'#17663A'}}>
                <Check size={12}/>{t('cobrada')}
              </span>
            );
          }
          return (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
              aria-label={t('addCobro')}
              style={{display:'inline-flex',alignItems:'center',gap:7,font:'600 13px/1 Inter',padding:'6px 11px',borderRadius:8,background:'#FFF9EB',border:'1px solid #F2E2BC',color:'#8A6E25',cursor:'pointer',fontVariantNumeric:'tabular-nums'}}
            >
              <span style={{width:8,height:8,borderRadius:'50%',background:'#F59E0B',flexShrink:0,display:'inline-block'}}/>
              {fmtAmt(outstanding, currency)}
              <span style={{display:'inline-flex',alignItems:'center',color:'#A37700'}}><Plus size={13}/></span>
            </button>
          );
        },
      },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' },
      {
        key: 'transactionDocument',
        column: 'C_DocTypeTarget_ID',
        type: 'custom',
        labels: { [locale]: t('documentType') },
        label: t('documentType'),
        render: (row) => {
          const sub = getArSubtype(row);
          const cfg = sub === 'NC'
            ? { color: '#6d28d9', bg: '#f5f3ff', label: t('creditNotesTab') }
            : sub === 'DEV'
              ? { color: '#9a3412', bg: '#fff7ed', label: t('returnsTab') }
              : { color: '#1d4ed8', bg: '#eff6ff', label: t('invoicesTab') };
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
    ];
  }, [gl, locale, targets, siiColLabel, tbaiColLabel, vfColLabel]);

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
          onPaymentAdded={() => { setPaymentRow(null); props.onRefresh?.(); }}
        />
      )}
    </>
  );
}
