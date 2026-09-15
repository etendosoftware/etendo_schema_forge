import { useMemo } from 'react';
import { DataTable } from '@/components/contract-ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getInvoiceFiscalTargets, isSifEligibleByDate } from '@/windows/custom/shared/fiscalTargets.js';
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
  const { profile, earliestSiiCutoverDate } = useFiscalConfig(orgId, apiBaseUrl);

  const targets = useMemo(() => getInvoiceFiscalTargets('purchase-invoice', profile), [profile]);

  const siiColLabel = gl['invoiceList.col.siiStatus'] || 'SII Status';

  const columns = useMemo(() => {
    const fiscalCols = [];
    // ETP-5229 (corrected): the status badge VALUE reads directly off the
    // invoice's OWN persisted status field (see useFiscalStatus.js for the full
    // root-cause writeup) — an invoice genuinely sent under a PREVIOUS,
    // since-superseded config must keep showing its real status forever. But
    // its ELIGIBILITY is gated on the EARLIEST-ever SII cutover across ALL of
    // the org's config rows (active or deactivated), so a row dated before SII
    // ever existed for this org shows a dash instead of a stray DB value.
    // ETP-5229 item #17: eligible-but-not-yet-sent must render as "Pendiente"
    // (SII's real `'PE'` AD code, the same code `UpdateInvoicesPreSii` writes
    // once an invoice is queued), not as the same dash used for not-eligible —
    // see `useFiscalStatus.js` for the full writeup.
    if (targets.showSii) {
      fiscalCols.push({
        key: '_siiStatus', type: 'custom', label: siiColLabel,
        render: (row) => (
          <FiscalStatusBadge
            status={isSifEligibleByDate(row.accountingDate, earliestSiiCutoverDate) ? (row.aeatsiiEstado ?? 'PE') : null}
          />
        ),
      });
    }
    return [...BASE_COLUMNS, ...fiscalCols, ...TAIL_COLUMNS];
  }, [targets, siiColLabel, earliestSiiCutoverDate]);

  return <DataTable columns={columns} filters={FILTERS} {...props} />;
}
