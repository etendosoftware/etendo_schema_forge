import { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XCircle } from 'lucide-react';
import { useUI, useLocale } from '@/i18n';
import { useNavigate } from 'react-router-dom';
import { useRowDelete } from '@/hooks/useRowDelete';
import GeneratedApp from '@generated/sales-quotation/generated/web/sales-quotation/index.jsx';
import QuotationTable from '@generated/sales-quotation/generated/web/sales-quotation/QuotationTable';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';
import LinesEmptyState from '@/components/contract-ui/LinesEmptyState.jsx';
import QuotationPreview from '../shared/QuotationPreview.jsx';
import { useSavedPreviewRecord } from '../shared/useSavedPreviewRecord.js';

const draftModeWithModal = {
  enabled: true,
  processField: 'documentAction',
  processValue: 'CO',
  label: 'soConfirmBtn',
  // Keep Save/Confirm visible in DR and UE. Only hide once the quotation is closed
  // by reaching one of the terminal statuses below — UE is intermediate and must
  // still expose the Confirm button (which dispatches the convert-to-order/invoice
  // modal via onConfirm).
  completedStatuses: ['CA', 'ETGO_CI', 'CL', 'VO', 'CJ'],
  disableWhenEmpty: true,
  onConfirm: () => window.dispatchEvent(new CustomEvent('sales-quotation:open-confirm-modal')),
};

// Override the generated menuActions so the kebab's "Reject" item dispatches
// a DOM event that QuotationTopbarActions listens for. We can't pass functions
// through decisions.json (JSON only), and DetailView accepts menuActions as a
// function — see tools/app-shell/src/components/contract-ui/DetailView.jsx
// (resolvedActions = typeof menuActions === 'function' ? menuActions(...) : ...).
const customMenuActions = ({ status }) => [
  {
    key: 'reject',
    labelKey: 'rejectQuotation',
    icon: XCircle,
    // The XCircle icon already carries the destructive cue; the Figma
    // (Screenshot 2026-04-30 11-38-53) renders both icon and label in the
    // neutral dark-gray (#121217), not the legacy red text.
    visible: status === 'UE',
    onClick: () => window.dispatchEvent(new CustomEvent('sales-quotation:open-reject-modal')),
  },
];

function buildQuotationColumns(ui) {
  return [
    { key: 'orderDate', column: 'DateOrdered', type: 'date', dot: false },
    { key: 'documentNo', column: 'DocumentNo', type: 'string' },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
    { key: 'documentStatus', column: 'DocStatus', type: 'status', enumLabels: {
      AE: ui('quotationStatus.AE'),
      CO: ui('quotationStatus.CO'),
      CL: ui('quotationStatus.CL'),
      CA: ui('quotationStatus.CA'),
      CJ: ui('quotationStatus.CJ'),
      DR: ui('quotationStatus.DR'),
      ME: ui('quotationStatus.ME'),
      NA: ui('quotationStatus.NA'),
      NC: ui('quotationStatus.NC'),
      WP: ui('quotationStatus.WP'),
      RE: ui('quotationStatus.RE'),
      TMP: ui('quotationStatus.TMP'),
      UE: ui('quotationStatus.UE'),
      IP: ui('quotationStatus.IP'),
      '??': ui('quotationStatus.UNK'),
      VO: ui('quotationStatus.VO'),
    } },
    { key: 'validUntil', column: 'validuntil', type: 'date' },
    { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  ];
}

function CustomQuotationTable(props) {
  const ui = useUI();
  const dictionary = useLocale();
  const quotationColumns = useMemo(() => buildQuotationColumns(ui), [dictionary]);

  return (
    <QuotationTable
      columns={quotationColumns}
      {...props}
      data-testid="QuotationTable__bc8637" />
  );
}

export default function SalesQuotationWindow({ windowName, recordId, token, apiBaseUrl, ...rest }) {
  const [cloneTargets, setCloneTargets] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const navigate = useNavigate();
  const { effectiveRecord, clearSavedRecord } = useSavedPreviewRecord();

  const { headers, createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'sale' });

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: 'quotation',
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const renderPreview = useCallback(({ row, onClose, onEdit }) => (
    <QuotationPreview
      quotation={row}
      token={token}
      apiBaseUrl={apiBaseUrl}
      windowName={windowName}
      onClose={onClose}
      onEdit={onEdit}
      data-testid="QuotationPreview__bc8637" />
  ), [token, apiBaseUrl, windowName]);

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    editMode: 'navigate',
    statusField: 'documentStatus',
    actions: {
      edit:      { show: true },
      duplicate: { show: true },
      delete:    { show: true },
    },
    documentPreview: true,
    onEdit:   (row) => navigate(`/${windowName}/${row.id}`),
    onClone:  (row) => setCloneTargets([row]),
    onDelete: requestDelete,
    menuActions: customMenuActions,
  }), [navigate, windowName, requestDelete]);

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <GeneratedApp
          windowName={windowName}
          recordId={recordId}
          token={token}
          apiBaseUrl={apiBaseUrl}
          draftMode={draftModeWithModal}
          menuActions={customMenuActions}
          linesEmptyState={LinesEmptyState}
          {...rest}
          data-testid="GeneratedApp__bc8637" />
        {contactPortal}
      </CreateContactContext.Provider>
    );
  }

  return (
    <>
      <GeneratedApp
        windowName={windowName}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        Table={CustomQuotationTable}
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        refreshTrigger={refreshKey}
        rowQuickActions={rowQuickActions}
        renderPreview={renderPreview}
        externalPreviewRow={effectiveRecord}
        onExternalPreviewClose={clearSavedRecord}
        {...rest}
        data-testid="GeneratedApp__bc8637" />
      {deleteDialog}
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          headerEntity="quotation"
          routePrefix="/sales-quotation/"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
          data-testid="CloneOrderModal__bc8637" />,
        document.body,
      )}
    </>
  );
}
