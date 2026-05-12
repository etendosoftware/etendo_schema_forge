import { useState } from 'react';
import { createPortal } from 'react-dom';
import { XCircle } from 'lucide-react';
import GeneratedApp from '@generated/sales-quotation/generated/web/sales-quotation/index.jsx';
import QuotationTable from '@generated/sales-quotation/generated/web/sales-quotation/QuotationTable';
import CreateContactModal from '@/components/contract-ui/CreateContactModal';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.js';
import LinesEmptyState from '@/components/contract-ui/LinesEmptyState.jsx';

const QUOTATION_COLUMNS = [
  { key: 'orderDate', column: 'DateOrdered', type: 'date', dot: false },
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', enumLabels: { 'AE': 'Automatic Evaluation', 'CO': 'Booked', 'CL': 'Closed', 'CA': 'Closed - Order Created', 'CJ': 'Closed - Rejected', 'DR': 'Draft', 'ME': 'Manual Evaluation', 'NA': 'Not Accepted', 'NC': 'Not Confirmed', 'WP': 'Not Paid', 'RE': 'Re-Opened', 'TMP': 'Temporal', 'UE': 'Under Evaluation', 'IP': 'Under Way', '??': 'Unknown', 'VO': 'Voided' } },
  { key: 'validUntil', column: 'validuntil', type: 'date' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
];

const LABEL_OVERRIDES = {
  es_ES: { C_BPartner_ID: 'Contacto', DateOrdered: 'Fecha cotización' },
  en_US: { C_BPartner_ID: 'Contact',  DateOrdered: 'Quotation Date'   },
};

function CustomQuotationTable(props) {
  return <QuotationTable columns={QUOTATION_COLUMNS} {...props} />;
}

const draftModeWithModal = {
  enabled: true,
  processField: 'documentAction',
  processValue: 'CO',
  label: 'soConfirmBtn',
  // Keep Save/Confirm visible in DR and UE. Only hide once the quotation is closed
  // by reaching one of the terminal statuses below — UE is intermediate and must
  // still expose the Confirmar button (which dispatches the convert-to-order/invoice
  // modal via onConfirm).
  completedStatuses: ['CA', 'ETGO_CI', 'CL', 'VO', 'CJ'],
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

export default function SalesQuotationWindow({ windowName, recordId, token, apiBaseUrl, ...rest }) {
  const [cloneTargets, setCloneTargets] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { bpApiBaseUrl, headers, createContactState, setCreateContactState, createContactCtxValue } =
    useCreateContactModal({ apiBaseUrl, token });

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
        />
        {createContactState && createPortal(
          <CreateContactModal
            bpApiBaseUrl={bpApiBaseUrl}
            headers={headers}
            initialQuery={createContactState.query}
            documentType="sale"
            onClose={() => setCreateContactState(null)}
            onCreated={(newBP) => {
              createContactState.onSelect({ id: newBP.id, name: newBP.name });
              setCreateContactState(null);
            }}
          />,
          document.body,
        )}
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
        labelOverrides={LABEL_OVERRIDES}
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        refreshTrigger={refreshKey}
        {...rest}
      />
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          headerEntity="quotation"
          routePrefix="/sales-quotation/"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
        />,
        document.body,
      )}
    </>
  );
}
