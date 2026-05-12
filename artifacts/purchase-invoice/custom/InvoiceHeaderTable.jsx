import { useMemo } from 'react';
import { DataTable } from '@/components/contract-ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import { useInvoiceListFiscalStatus } from '@/windows/custom/shared/useInvoiceListFiscalStatus.js';
import { FiscalStatusBadge } from '@/windows/custom/shared/FiscalStatusBadge.jsx';

const BASE_COLUMNS = [
  { key: 'invoiceDate',       column: 'DateInvoiced',              type: 'date',   label: 'Invoice Date' },
  { key: 'orderReference',    column: 'POReference',               type: 'string', label: 'Supplier Reference' },
  { key: 'businessPartner',   column: 'C_BPartner_ID',             type: 'string', label: 'Business Partner' },
  { key: 'documentStatus',    column: 'DocStatus',                 type: 'status', label: 'Document Status' },
];

const TAIL_COLUMNS = [
  { key: 'grandTotalAmount',   column: 'GrandTotal',                type: 'amount', label: 'Total Gross Amount' },
  { key: 'outstandingAmount',  column: 'OutstandingAmt',            type: 'amount', label: 'Total Outstanding' },
  { key: 'eTGODueDate',        column: 'EM_Etgo_Due_Date',          type: 'date' },
  { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status',   type: 'percent' },
];

const FILTERS = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus', 'eTGODueDate'];

export default function InvoiceHeaderTable(props) {
  const { token, apiBaseUrl, data } = props;
  const dictionary = useLocale();
  const gl = dictionary?.genericLabels || {};

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
    return [...BASE_COLUMNS, ...fiscalCols, ...TAIL_COLUMNS];
  }, [targets, fiscalLoading, statusMap, siiColLabel, vfColLabel]);

  return <DataTable columns={columns} filters={FILTERS} {...props} />;
}
