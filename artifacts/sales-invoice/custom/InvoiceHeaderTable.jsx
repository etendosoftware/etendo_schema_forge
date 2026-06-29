import { useMemo } from 'react';
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
import { FiscalStatusBadge, normalizeVerifactuStatus } from '@/windows/custom/shared/FiscalStatusBadge.jsx';
import { getArSubtype } from './invoiceSubtype';

// ─── Invoice-specific status logic ───────────────────────────────

function isCreditNote(row) { return getArSubtype(row) === 'NC'; }
function isReturn(row)     { return getArSubtype(row) === 'DEV'; }
function isCreditType(row) { return isCreditNote(row) || isReturn(row); }

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
      {
        key: 'transactionDocument',
        column: 'C_DocTypeTarget_ID',
        type: 'custom',
        // `labels` (priority 1 in resolveColumnLabel) must be set so this header
        // outranks the AD-dictionary fallback translate('C_DocTypeTarget_ID'),
        // which otherwise resolves to "Documento transacción".
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
      { key: 'documentStatus', column: 'DocStatus', type: 'status', label: t('statusColumn') },
      ...fiscalCols,
      { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
      { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount' },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' },
    ];
  }, [gl, locale, targets, siiColLabel, tbaiColLabel, vfColLabel]);

  return <DataTable columns={columns} filters={FILTERS} {...props} />;
}
