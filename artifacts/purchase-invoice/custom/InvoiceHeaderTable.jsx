import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { DataTable } from '@/components/contract-ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { formatCurrency } from '@/lib/formatCurrency';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { getInvoiceFiscalTargets } from '@/windows/custom/shared/fiscalTargets.js';
import { FiscalStatusBadge } from '@/windows/custom/shared/FiscalStatusBadge.jsx';
import InvoicePaymentHistoryModal from '@/windows/custom/shared/InvoicePaymentHistoryModal.jsx';

function fmtAmt(val, currency) {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
  return formatCurrency(currency || 'EUR', n);
}

const FILTERS = ['documentNo', 'invoiceDate', 'businessPartner', 'orderReference', 'documentStatus', 'eTGODueDate'];

export default function InvoiceHeaderTable(props) {
  const { apiBaseUrl } = props;
  const dictionary = useLocale();
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
        render: (row) => <FiscalStatusBadge status={row.aeatsiiEstado ?? null} />,
      });
    }

    return [
      { key: 'invoiceDate',     column: 'DateInvoiced',            type: 'date',   label: t('dueDate') },
      { key: 'orderReference',  column: 'POReference',             type: 'string', label: t('documentNo') || 'Supplier Reference' },
      { key: 'businessPartner', column: 'C_BPartner_ID',           type: 'string', label: t('businessPartner') || 'Business Partner' },
      { key: 'documentStatus',  column: 'DocStatus',               type: 'status', label: t('statusDocColumn') },
      ...fiscalCols,
      { key: 'grandTotalAmount',   column: 'GrandTotal',            type: 'amount', label: t('impTotal') },
      {
        key: 'outstandingAmount',
        column: 'OutstandingAmt',
        type: 'custom',
        label: t('pendingPaymentColumn'),
        render: (row) => {
          const outstanding = parseFloat(row.outstandingAmount ?? 0);
          const currency = row['currency$_identifier'] || 'EUR';
          if (outstanding <= 0) {
            return (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: 11, fontWeight: 500,
                padding: '2px 8px', borderRadius: 9999,
                background: '#D1FAE5', color: '#065F46',
              }}>
                {t('pagada')}
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1.5" style={{ whiteSpace: 'nowrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', flexShrink: 0, display: 'inline-block' }} />
              <span className="tabular-nums" style={{ fontSize: 13, color: '#92400E', fontWeight: 500 }}>
                {fmtAmt(outstanding, currency)}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setPaymentRow(row); }}
                style={{
                  width: 20, height: 20,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  border: '1px solid #F59E0B',
                  background: 'transparent',
                  color: '#92400E',
                  fontSize: 14, lineHeight: 1,
                  cursor: 'pointer',
                  fontWeight: 600,
                  padding: 0,
                }}
                aria-label={t('addPago')}
              >
                +
              </button>
            </span>
          );
        },
      },
      { key: 'eTGODueDate',        column: 'EM_Etgo_Due_Date',          type: 'date' },
      { key: 'eTGODeliveryStatus', column: 'em_etgo_delivery_status',   type: 'percent' },
      {
        key: '_nav',
        type: 'custom',
        label: '',
        render: () => <ChevronRight size={16} className="text-muted-foreground" />,
      },
    ];
  }, [gl, targets, siiColLabel]);

  return (
    <>
      <DataTable columns={columns} filters={FILTERS} {...props} />
      {paymentRow && (
        <InvoicePaymentHistoryModal
          invoiceId={paymentRow.id}
          invoiceData={paymentRow}
          specName="purchase-invoice"
          apiBaseUrl={apiBaseUrl}
          onClose={() => setPaymentRow(null)}
          onPaymentAdded={() => { setPaymentRow(null); props.onRefresh?.(); }}
        />
      )}
    </>
  );
}
