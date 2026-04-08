import { ListView, DetailView } from '@/components/contract-ui';
import FinPaymentTable from './FinPaymentTable';
import FinPaymentForm from './FinPaymentForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import catalogs from './mockCatalogs';

const breadcrumb = 'Sales / Payment In';

// @sf-generated-start summary:finPayment
const summary = [];

const statusField = 'status';
// @sf-generated-end summary:finPayment

// @sf-custom-slot extraBadges:finPayment
// @sf-generated-start extraBadges:finPayment
const extraBadges = [];
// @sf-generated-end extraBadges:finPayment

// @sf-generated-start processes:finPayment
const processes = [
  // Process payment (Awaiting Payment → Received/Deposited)
  { name: 'Process Payment', label: 'Process Payment', style: 'positive', columnName: 'aPRMProcessPayment',
    displayLogicRaw: "@status@='RPAP'" },
];
// @sf-generated-end processes:finPayment

// @sf-generated-start draftMode:finPayment
const draftMode = null;
// @sf-generated-end draftMode:finPayment

// @sf-generated-start addLineFields:finPaymentScheduleDetail
const addLineFields = { entry: [], derived: [], hidden: [] };
// @sf-generated-end addLineFields:finPaymentScheduleDetail

const api = {
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
      "url": "/sws/neo/payment-in/finPayment/selectors/account"
    },
    {
      "entity": "finPayment",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "dependent",
      "url": "/sws/neo/payment-in/finPayment/selectors/currency"
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
      "example": "_sortBy=payment-inDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:FinPaymentPage
export default function FinPaymentPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:FinPaymentPage
  if (recordId) {
    return (
      <DetailView
        entity="finPayment"
        Form={FinPaymentForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Payment"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        api={api}
        documentPreview={{ titlePrefix: 'Payment', pdfUrl: null }}
        notesField="description"
        customTabs={[{ key: 'docs', label: 'Docs', Component: RelatedDocuments }]}
        hideDeleteWhenComplete
        menuActions={({ status }) => [
          { key: 'reverse', label: 'Reverse Payment', destructive: true, visible: status === 'RPPC' || status === 'RPR' || status === 'RDNC', columnName: 'aPRMReversePayment' },
        ]}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="finPayment"
      Table={FinPaymentTable}
      entityLabel="Payments"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:FinPaymentPage

// @sf-custom-slot section:FinPaymentPage-custom
