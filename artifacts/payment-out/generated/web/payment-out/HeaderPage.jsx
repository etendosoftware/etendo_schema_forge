import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import HeaderTable from '../../../custom/PaymentHeaderTable';
import HeaderForm from './HeaderForm';
import PaymentOutBottomPanel from '../../../custom/PaymentOutBottomPanel';
import PaymentConciliadoBadge from '../../../custom/PaymentConciliadoBadge';
import PaymentDetailSidebar from '../../../custom/PaymentDetailSidebar';
import ReactivarConfirmModal from '../../../custom/ReactivarConfirmModal';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Payment Out';


// @sf-generated-start summary:header
const summary = [

];

const statusField = 'status';
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [

];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [
  { name: 'Payment Process', label: 'processConfirm', style: 'positive', columnName: 'aPRMProcessPayment',
    displayLogicRaw: "@status@ = 'RPAP'", confirmModal: true },
  { name: 'etprReactivatePayment', label: 'processReactivate', style: 'ghost-danger', columnName: 'etprReactivatePayment',
    displayLogicRaw: "@status@ != 'RPAP'" },
];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = null;
// @sf-generated-end draftMode:header

// @sf-generated-start requiredHeaderFields:header
const requiredHeaderFields = [];
// @sf-generated-end requiredHeaderFields:header



export const api = {
  "specName": "payment-out",
  "baseUrl": "/sws/neo/payment-out",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-out/header",
      "detailUrl": "/sws/neo/payment-out/header/{id}",
      "supportedFilters": [
        "documentNo",
        "referenceNo",
        "paymentDate",
        "businessPartner",
        "status"
      ]
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-out/lines",
      "detailUrl": "/sws/neo/payment-out/lines/{id}",
      "supportedFilters": []
    },
    "bankPayments": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-out/bankPayments",
      "detailUrl": "/sws/neo/payment-out/bankPayments/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "header",
      "field": "documentType",
      "column": "C_DocType_ID",
      "reference": "DocumentType",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/header/selectors/documentType"
    },
    {
      "entity": "header",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/header/selectors/businessPartner"
    },
    {
      "entity": "header",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/header/selectors/paymentMethod"
    },
    {
      "entity": "header",
      "field": "account",
      "column": "Fin_Financial_Account_ID",
      "reference": "FinancialAccount",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/header/selectors/account",
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
      "entity": "header",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/header/selectors/currency",
      "context": {
        "required": [
          {
            "param": "FIN_Financial_Account_ID",
            "source": "parentField",
            "field": "financialAccount"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "reversedPayment",
      "column": "FIN_Rev_Payment_ID",
      "reference": "Payment",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/header/selectors/reversedPayment"
    },
    {
      "entity": "header",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/header/selectors/project"
    },
    {
      "entity": "header",
      "field": "costCenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/header/selectors/costCenter"
    },
    {
      "entity": "header",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/header/selectors/stDimension"
    },
    {
      "entity": "header",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/header/selectors/ndDimension"
    },
    {
      "entity": "lines",
      "field": "orderPaymentSchedule",
      "column": "FIN_Payment_Schedule_Order",
      "reference": "Payment_Schedule",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/lines/selectors/orderPaymentSchedule"
    },
    {
      "entity": "lines",
      "field": "invoicePaymentSchedule",
      "column": "FIN_Payment_Schedule_Invoice",
      "reference": "Payment_Schedule",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/lines/selectors/invoicePaymentSchedule"
    },
    {
      "entity": "lines",
      "field": "gLItem",
      "column": "C_Glitem_ID",
      "reference": "Glitem",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/lines/selectors/gLItem"
    },
    {
      "entity": "lines",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/lines/selectors/businessPartner"
    },
    {
      "entity": "lines",
      "field": "activity",
      "column": "C_Activity_ID",
      "reference": "Activity",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/lines/selectors/activity"
    },
    {
      "entity": "lines",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/lines/selectors/product"
    },
    {
      "entity": "lines",
      "field": "salesCampaign",
      "column": "C_Campaign_ID",
      "reference": "Campaign",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/lines/selectors/salesCampaign"
    },
    {
      "entity": "lines",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/lines/selectors/project"
    },
    {
      "entity": "lines",
      "field": "salesRegion",
      "column": "C_Salesregion_ID",
      "reference": "SalesRegion",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/lines/selectors/salesRegion"
    },
    {
      "entity": "lines",
      "field": "costCenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/lines/selectors/costCenter"
    },
    {
      "entity": "lines",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/lines/selectors/stDimension"
    },
    {
      "entity": "lines",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/lines/selectors/ndDimension"
    },
    {
      "entity": "bankPayments",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/bankPayments/selectors/currency"
    },
    {
      "entity": "bankPayments",
      "field": "financialAccount",
      "column": "FIN_Financial_Account_ID",
      "reference": "Financial_Account",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/bankPayments/selectors/financialAccount"
    }
  ],
  "actions": [
    {
      "entity": "header",
      "field": "aPRMAddScheduledpayments",
      "column": "EM_Aprm_Add_Scheduledpayments",
      "url": "/sws/neo/payment-out/header/{id}/action/aPRMAddScheduledpayments",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/payment-out/header/{id}/action/posted"
    },
    {
      "entity": "header",
      "field": "aPRMProcessPayment",
      "column": "EM_APRM_Process_Payment",
      "url": "/sws/neo/payment-out/header/{id}/action/aPRMProcessPayment",
      "processId": "6255BE488882480599C81284B70CD9B3",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "aprmExecutepayment",
      "column": "EM_Aprm_Executepayment",
      "url": "/sws/neo/payment-out/header/{id}/action/aprmExecutepayment",
      "processId": "E011F492B0814A74B63CD1F3B9FF0526",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "aPRMReversePayment",
      "column": "EM_APRM_ReversePayment",
      "url": "/sws/neo/payment-out/header/{id}/action/aPRMReversePayment",
      "processId": "29D17F515727436DBCE32BC6CA28382B",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "aPRMReconcilePayment",
      "column": "EM_APRM_Reconcile_Payment",
      "url": "/sws/neo/payment-out/header/{id}/action/aPRMReconcilePayment"
    },
    {
      "entity": "header",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/payment-out/header/{id}/action/aeatsiiSend",
      "processId": "EA02D79CA1DE4B46909EA6EF64A66B53",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/payment-out/header/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/payment-out/header/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "etprReactivatePayment",
      "column": "EM_Etpr_Reactivate_Payment",
      "url": "/sws/neo/payment-out/header/{id}/action/etprReactivatePayment",
      "processId": "84628BC70CDB49B58054E80C20BCBFEE",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "eTPRRemovePayment",
      "column": "em_etpr_remove_payment",
      "url": "/sws/neo/payment-out/header/{id}/action/eTPRRemovePayment",
      "processId": "FB79E902A5384754990AD145F6CAC9FB",
      "processType": "obuiapp"
    },
    {
      "entity": "bankPayments",
      "field": "refreshPayment",
      "column": "Refresh_Payment",
      "url": "/sws/neo/payment-out/bankPayments/{id}/action/refreshPayment",
      "processId": "3894F258A80D4FAB8A5131B5172145AF",
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

// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('6F8F913FA60F4CBD93DC1D3AA696E76E');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="6F8F913FA60F4CBD93DC1D3AA696E76E" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="header"
        Form={HeaderForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Header"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hideDeleteWhenComplete
        customTabsAfterBottom
        hidePrint
        hideSaveStatuses={["RDNC","RPPC","RPR","RPVOID","PWNC"]}
        toolbarBorderBottom
        saveBeforeProcesses
        hideFormCard
        notesField="description"
        bottomSection={PaymentOutBottomPanel}
        topbarExtra={PaymentConciliadoBadge}
        sidePanel={PaymentDetailSidebar}
        sidePanelStyle={{"order":-1,"borderLeft":"none","borderRight":"1px solid hsl(var(--border-subtle))","padding":0}}
        processConfirmModal={ReactivarConfirmModal}
        statusEnumLabels={{"RPAP":"statusDraft","RPR":"pagoDepositado","RDNC":"pagoDepositado","RPPC":"pagoDepositado","PPM":"pagoDepositado","PWNC":"pagoDepositado"}}
        sendDocument
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Payment Out"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="paymentDate"
      hidePrint
      hideCreate
      rowQuickActions={{}}
      sendDocument
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:HeaderPage
