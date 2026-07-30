import { useMemo } from 'react';
import { DataTable } from '@/components/contract-ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import { FiscalStatusBadge } from '@/windows/custom/shared/FiscalStatusBadge.jsx';

const BASE_COLUMNS = [
  { key: 'invoiceDate',       column: 'DateInvoiced',              type: 'date',   label: 'Invoice Date', required: true },
  { key: 'orderReference',    column: 'POReference',               type: 'string', label: 'Supplier Reference' },
  { key: 'businessPartner',   column: 'C_BPartner_ID',             type: 'string', label: 'Business Partner', required: true },
  { key: 'documentStatus',    column: 'DocStatus',                 type: 'status', label: 'Document Status', required: true },
];

const TAIL_COLUMNS = [
  { key: 'grandTotalAmount',   column: 'GrandTotal',                type: 'amount', label: 'Total Gross Amount', required: true },
  { key: 'outstandingAmount',  column: 'OutstandingAmt',            type: 'amount', label: 'Total Outstanding', required: true },
  { key: 'eTGODueDate',        column: 'EM_Etgo_Due_Date',          type: 'date' },
  { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status',   type: 'percent' },
];

const FILTERS = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus', 'eTGODueDate'];

export default function InvoiceHeaderTable(props) {
  const { apiBaseUrl } = props;
  const dictionary = useLocale();
  const gl = dictionary?.genericLabels || {};

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
        render: (row) => <FiscalStatusBadge status={row.aeatsiiEstado ?? null} />,
      });
    }
    return [...BASE_COLUMNS, ...fiscalCols, ...TAIL_COLUMNS];
  }, [targets, siiColLabel]);

  return <DataTable columns={columns} filters={FILTERS} {...props} />;
}
