import { useState, useMemo, useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import FinPaymentTable from '../../../custom/PaymentHeaderTable';
import FinPaymentForm from './FinPaymentForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import PaymentBottomPanel from '../../../custom/PaymentBottomPanel';
import PaymentConciliadoBadge from '../../../custom/PaymentConciliadoBadge';
import PaymentDetailSidebar from '../../../custom/PaymentDetailSidebar';
import NewPaymentModal from '../../../custom/NewPaymentModal';
import ReactivarConfirmModal from '../../../custom/ReactivarConfirmModal';
import PaymentLifecycleConfirmModal from '@/windows/custom/shared/PaymentLifecycleConfirmModal';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Payment In';


// @sf-generated-start summary:finPayment
const summary = [

];

const statusField = 'status';
// @sf-generated-end summary:finPayment

// @sf-generated-start extraBadges:finPayment
const extraBadges = [

];
// @sf-generated-end extraBadges:finPayment

// @sf-generated-start processes:finPayment
const processes = [
  { name: 'Payment Process', label: 'processConfirm', style: 'positive', columnName: 'aPRMProcessPayment',
    displayLogicRaw: "@status@ = 'RPAP'", confirmModal: true },
  { name: 'etprReactivatePayment', label: 'processReactivate', style: 'ghost-danger', columnName: 'etprReactivatePayment',
    displayLogicRaw: "@status@ != 'RPAP'" },
];
// @sf-generated-end processes:finPayment

// @sf-generated-start draftMode:finPayment
const draftMode = null;
// @sf-generated-end draftMode:finPayment

// @sf-generated-start requiredHeaderFields:finPayment
const requiredHeaderFields = [];
// @sf-generated-end requiredHeaderFields:finPayment



export const api = {
  "specName": "payment-in",
  "baseUrl": "/sws/neo/payment-in",
  "crud": {
    "finPayment": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-in/finPayment",
      "detailUrl": "/sws/neo/payment-in/finPayment/{id}",
      "supportedFilters": [
        "documentNo",
        "paymentDate",
        "businessPartner"
      ]
    },
    "finPaymentScheduleDetail": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-in/finPaymentScheduleDetail",
      "detailUrl": "/sws/neo/payment-in/finPaymentScheduleDetail/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "finPayment",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/payment-in/finPayment/selectors/businessPartner"
    },
    {
      "entity": "finPayment",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "search",
      "url": "/sws/neo/payment-in/finPayment/selectors/paymentMethod"
    },
    {
      "entity": "finPayment",
      "field": "account",
      "column": "Fin_Financial_Account_ID",
      "reference": "Financial_Account",
      "inputMode": "dependent",
      "url": "/sws/neo/payment-in/finPayment/selectors/account",
      "context": {
        "required": [
          {
            "param": "Fin_Paymentmethod_ID",
            "source": "field",
            "field": "paymentMethod"
          }
        ]
      }
    },
    {
      "entity": "finPayment",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "dependent",
      "url": "/sws/neo/payment-in/finPayment/selectors/currency",
      "context": {
        "required": [
          {
            "param": "FIN_Financial_Account_ID",
            "source": "field",
            "field": "account"
          }
        ]
      }
    },
    {
      "entity": "finPaymentScheduleDetail",
      "field": "invoicePaymentSchedule",
      "column": "FIN_Payment_Schedule_Invoice",
      "reference": "Payment_Schedule",
      "inputMode": "search",
      "url": "/sws/neo/payment-in/finPaymentScheduleDetail/selectors/invoicePaymentSchedule"
    }
  ],
  "actions": [
    {
      "entity": "finPayment",
      "field": "aPRMAddScheduledpayments",
      "column": "EM_Aprm_Add_Scheduledpayments",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aPRMAddScheduledpayments",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/posted"
    },
    {
      "entity": "finPayment",
      "field": "aPRMProcessPayment",
      "column": "EM_APRM_Process_Payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aPRMProcessPayment",
      "processId": "6255BE488882480599C81284B70CD9B3",
      "processType": "classic"
    },
    {
      "entity": "finPayment",
      "field": "aprmExecutepayment",
      "column": "EM_Aprm_Executepayment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aprmExecutepayment",
      "processId": "E011F492B0814A74B63CD1F3B9FF0526",
      "processType": "classic"
    },
    {
      "entity": "finPayment",
      "field": "aPRMReversePayment",
      "column": "EM_APRM_ReversePayment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aPRMReversePayment",
      "processId": "29D17F515727436DBCE32BC6CA28382B",
      "processType": "classic"
    },
    {
      "entity": "finPayment",
      "field": "aPRMReconcilePayment",
      "column": "EM_APRM_Reconcile_Payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aPRMReconcilePayment"
    },
    {
      "entity": "finPayment",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/aeatsiiSend",
      "processId": "EA02D79CA1DE4B46909EA6EF64A66B53",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "etprReactivatePayment",
      "column": "EM_Etpr_Reactivate_Payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/etprReactivatePayment",
      "processId": "84628BC70CDB49B58054E80C20BCBFEE",
      "processType": "obuiapp"
    },
    {
      "entity": "finPayment",
      "field": "eTPRRemovePayment",
      "column": "em_etpr_remove_payment",
      "url": "/sws/neo/payment-in/finPayment/{id}/action/eTPRRemovePayment",
      "processId": "FB79E902A5384754990AD145F6CAC9FB",
      "processType": "obuiapp"
    }
  ],
  "queryParams": {
    "pagination": {
      "startRow": "_startRow",
      "endRow": "_endRow",
      "default": "0-100"
    },
    "sorting": {
      "param": "_sortBy",
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "finance"
  }
};

// @sf-generated-start component:FinPaymentPage
export default function FinPaymentPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('E547CE89D4C04429B6340FFA44E70716');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  const [showNewModal, setShowNewModal] = useState(false);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="E547CE89D4C04429B6340FFA44E70716" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="finPayment"
        Form={FinPaymentForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Fin Payment"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hideDeleteWhenComplete
        deleteAction="eTPRRemovePayment"
        customTabsAfterBottom
        hidePrint
        hideSaveStatuses={["RDNC","RPPC","RPR","RPVOID","PWNC"]}
        toolbarBorderBottom
        hideFormCard
        notesField="description"
        customTabs={[{ key: 'related', labelKey: 'relatedDocuments', Component: RelatedDocuments }]}
        bottomSection={PaymentBottomPanel}
        topbarExtra={PaymentConciliadoBadge}
        sidePanel={PaymentDetailSidebar}
        sidePanelStyle={{"order":-1,"borderLeft":"none","borderRight":"1px solid hsl(var(--border-subtle))","padding":0}}
        processConfirmModal={ReactivarConfirmModal}
        deleteConfirmModal={PaymentLifecycleConfirmModal}
        deleteConfirmModalProps={{"dir":"in"}}
        statusEnumLabels={{"RPAP":"statusDraft","RPR":"cobroDepositado","RDNC":"cobroDepositado","RPPC":"cobroDepositado","PPM":"cobroDepositado","PWNC":"cobroDepositado"}}
        statusFieldLabel="statusColumnLabel"
        sendDocument
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <>
    <ListView
      entity="finPayment"
      Table={FinPaymentTable}
      entityLabel="Payment In"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="paymentDate"
      hidePrint
      hideCreate
      rowQuickActions={{}}
      sendDocument
      {...props} window={effectiveWindow}
      onNew={() => setShowNewModal(true)}
    />
    {showNewModal && <NewPaymentModal token={props.token} apiBaseUrl={props.apiBaseUrl} windowName={windowName} onClose={() => setShowNewModal(false)} />}
    </>
  );
}
// @sf-generated-end component:FinPaymentPage
