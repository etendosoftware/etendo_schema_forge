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
import { FiscalStatusBadge } from '@/windows/custom/shared/FiscalStatusBadge.jsx';
import { formatAmount } from '@/lib/formatAmount.js';

/* eslint-disable react/prop-types */

const filters = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus'];

const NC_RETURN_TYPES = new Set(['AP CreditMemo', 'Return Material Purchase Invoice', 'Reversed Purchase Invoice']);

const DOC_TYPE_BADGE = {
  'AP Invoice':                         { color: '#1d4ed8', bg: '#eff6ff', label: 'invoicesTab' },
  'AP CreditMemo':                      { color: '#92400e', bg: '#fffbeb', label: 'creditNotesTab' },
  'Return Material Purchase Invoice':   { color: '#9a3412', bg: '#fff7ed', label: 'returnInvoiceTab' },
  'Reversed Purchase Invoice':          { color: '#9a3412', bg: '#fff7ed', label: 'returnInvoiceTab' },
};

function isNcOrReturn(row) {
  return NC_RETURN_TYPES.has(row?.['transactionDocument$_identifier']);
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
      { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
      { key: 'documentStatus', column: 'DocStatus', type: 'status' },
      ...fiscalCols,
      {
        key: 'grandTotalAmount', column: 'GrandTotal', type: 'custom',
        render: (row) => {
          const raw = row.grandTotalAmount;
          const currency = row['currency$_identifier'];
          const amount = isNcOrReturn(row) ? -Math.abs(Number(raw)) : Number(raw);
          return <span className="tabular-nums">{formatAmount(amount, currency)}</span>;
        },
      },
      { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount' },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' },
    ];
  }, [gl, locale, targets, siiColLabel]);

  return (
    <DataTable
      columns={columns}
      filters={filters}
      {...props}
      data-testid="DataTable__6b7cdb" />
  );
}
