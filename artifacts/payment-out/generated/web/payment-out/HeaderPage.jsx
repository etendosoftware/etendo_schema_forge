import { ListView, DetailView } from '@/components/contract-ui';
import HeaderTable from '../../../custom/PaymentHeaderTable';
import HeaderForm from './HeaderForm';
import PaymentActivityToggle from '../../../custom/PaymentActivityToggle';
import PaymentDetailSidebar from '../../../custom/PaymentDetailSidebar';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finanzas / Pago';


// @sf-generated-start summary:header
const summary = [];

const statusField = 'status';
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [
  { key: 'conciliado', labelKey: 'conciliado', field: 'reconciled', condition: (data) => data?.reconciled === 'Y', style: 'info' },
];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [
  { name: 'etblkpBulkposting', label: 'Bulk Posting', style: 'positive',
    displayLogicRaw: "@Status@!'RPAE' & @Status@!'RPVOID' & @Processed@='Y' & @#ShowAcct@='Y'" },
  { name: 'etprReactivatePayment', label: 'Advanced Reactivation', style: 'positive',
    displayLogicRaw: "@Processed@='Y' & @Status@!'RPVOID'" },
  { name: 'eTPRRemovePayment', label: 'Remove Payment', style: 'positive',
    displayLogicRaw: "@Processed@='Y' & @Status@!'RPVOID'" },
];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = null;
// @sf-generated-end draftMode:header

// @sf-generated-start requiredHeaderFields:header
const requiredHeaderFields = [];
// @sf-generated-end requiredHeaderFields:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'amount', column: 'Amount', type: 'number', required: true, label: 'Paid Amount', defaultValue: 0 },
    { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'search', lookup: true, label: 'Invoice Payment Schedule', reference: 'Payment_Schedule', inputMode: 'search' },
  ],
  derived: [

  ],
  hidden: [
    { key: 'canceled', value: 'N' },
  ],
};
// @sf-generated-end addLineFields:lines

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
    "executionHistory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-out/executionHistory",
      "detailUrl": "/sws/neo/payment-out/executionHistory/{id}",
      "supportedFilters": []
    },
    "exchangeRates": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-out/exchangeRates",
      "detailUrl": "/sws/neo/payment-out/exchangeRates/{id}",
      "supportedFilters": []
    },
    "usedCreditSource": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-out/usedCreditSource",
      "detailUrl": "/sws/neo/payment-out/usedCreditSource/{id}",
      "supportedFilters": []
    },
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-out/accounting",
      "detailUrl": "/sws/neo/payment-out/accounting/{id}",
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
      "url": "/sws/neo/payment-out/header/selectors/currency"
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
      "entity": "executionHistory",
      "field": "paymentRun",
      "column": "FIN_Payment_Run_ID",
      "reference": "Payment_Run",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/executionHistory/selectors/paymentRun"
    },
    {
      "entity": "exchangeRates",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/exchangeRates/selectors/currency"
    },
    {
      "entity": "exchangeRates",
      "field": "toCurrency",
      "column": "C_Currency_Id_To",
      "reference": "Currency",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/exchangeRates/selectors/toCurrency"
    },
    {
      "entity": "usedCreditSource",
      "field": "creditPaymentUsed",
      "column": "FIN_Payment_Id_Used",
      "reference": "Payment",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/usedCreditSource/selectors/creditPaymentUsed"
    },
    {
      "entity": "usedCreditSource",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/usedCreditSource/selectors/currency"
    },
    {
      "entity": "accounting",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/accounting/selectors/accountingSchema"
    },
    {
      "entity": "accounting",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/accounting/selectors/currency"
    },
    {
      "entity": "accounting",
      "field": "period",
      "column": "C_Period_ID",
      "reference": "Period",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/accounting/selectors/period"
    },
    {
      "entity": "accounting",
      "field": "account",
      "column": "Account_ID",
      "reference": "ElementValue",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/accounting/selectors/account"
    },
    {
      "entity": "accounting",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/accounting/selectors/businessPartner"
    },
    {
      "entity": "accounting",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/accounting/selectors/product"
    },
    {
      "entity": "accounting",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/accounting/selectors/project"
    },
    {
      "entity": "accounting",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/accounting/selectors/costcenter"
    },
    {
      "entity": "accounting",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/accounting/selectors/asset"
    },
    {
      "entity": "accounting",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "User1",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/accounting/selectors/stDimension"
    },
    {
      "entity": "accounting",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "User2",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/accounting/selectors/ndDimension"
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

function DirBadge({ data }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: '#FDECEA', flexShrink: 0 }}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#B91C1C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
      </span>
      <span style={{ font: '700 15px/20px Inter', color: '#19191D' }}>{data?.documentNo}</span>
    </span>
  );
}

// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="header"
        Form={HeaderForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={[]}
        catalogs={catalogs}
        entityLabel="Header"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        api={api}
        noHeaderBorder
        formCardPadding="p-0"
        topbarExtra={DirBadge}
        topbarRight={PaymentActivityToggle}
        sidePanel={PaymentDetailSidebar}
        requiredHeaderFields={requiredHeaderFields}
        sendDocument
        {...props}
      />
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
      rowQuickActions={{}}
      sendDocument
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage
