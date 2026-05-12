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
import { useInvoiceListFiscalStatus } from '@/windows/custom/shared/useInvoiceListFiscalStatus.js';
import { FiscalStatusBadge } from '@/windows/custom/shared/FiscalStatusBadge.jsx';

/* eslint-disable react/prop-types */

const filters = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus'];

export default function PurchaseInvoiceHeaderTable(props) {
  const { token, apiBaseUrl, data } = props;
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  const gl = dictionary?.genericLabels || {};
  const t = (key) => gl[key] || key;

  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile } = useFiscalConfig(orgId, token, apiBaseUrl);

  const targets = useMemo(() => getInvoiceFiscalTargets('purchase-invoice', profile), [profile]);

  const ids = useMemo(() => (data || []).map(r => r.id).filter(Boolean), [data]);
  const { statusMap, loading: fiscalLoading } = useInvoiceListFiscalStatus(ids, 'purchase-invoice', profile, apiBaseUrl, token, orgId);

  const siiColLabel = gl['invoiceList.col.siiStatus']       || 'SII Status';
  const vfColLabel  = gl['invoiceList.col.verifactuStatus'] || 'Verifactu Status';

  const columns = useMemo(() => {
    const fiscalCols = [];
    if (targets.showSii) {
      fiscalCols.push({
        key: '_siiStatus', type: 'custom', label: siiColLabel,
        render: (row) => <FiscalStatusBadge status={statusMap?.[row.id]?.sii} loading={fiscalLoading && !statusMap} />,
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
      { key: 'orderReference', column: 'POReference', type: 'string' },
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
      { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
      { key: 'documentStatus', column: 'DocStatus', type: 'status' },
      ...fiscalCols,
      { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
      { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount' },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status', type: 'percent' },
    ];
  }, [gl, locale, targets, fiscalLoading, statusMap, siiColLabel, vfColLabel]);

  return <DataTable columns={columns} filters={filters} {...props} />;
}
