import { ListView, DetailView } from '@/components/contract-ui';
import FinPaymentTable from './FinPaymentTable';
import FinPaymentForm from './FinPaymentForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import ExecutionHistoryTable from './ExecutionHistoryTable';
import ExecutionHistoryForm from './ExecutionHistoryForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Payment Out';


// @sf-generated-start summary:finPayment
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'status';
// @sf-generated-end summary:finPayment

// @sf-custom-slot extraBadges:finPayment
// @sf-generated-start extraBadges:finPayment
const extraBadges = [];
// @sf-generated-end extraBadges:finPayment

// @sf-generated-start processes:finPayment
const processes = [

];
// @sf-generated-end processes:finPayment

// @sf-generated-start draftMode:finPayment
const draftMode = null;
// @sf-generated-end draftMode:finPayment

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'amount', column: 'Amount', type: 'number', required: true, label: 'Paid Amount' },
    { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'search', lookup: true, label: 'Invoice Payment Schedule', reference: 'Payment_Schedule', inputMode: 'search' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:lines

const api = {
  "specName": "payment-out",
  "baseUrl": "/sws/neo/payment-out",
  "crud": {
    "finPayment": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-out/finPayment",
      "detailUrl": "/sws/neo/payment-out/finPayment/{id}",
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
      "entity": "finPayment",
      "field": "documentType",
      "column": "C_DocType_ID",
      "reference": "DocumentType",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/finPayment/selectors/documentType"
    },
    {
      "entity": "finPayment",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/finPayment/selectors/businessPartner"
    },
    {
      "entity": "finPayment",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/finPayment/selectors/paymentMethod"
    },
    {
      "entity": "finPayment",
      "field": "account",
      "column": "Fin_Financial_Account_ID",
      "reference": "FinancialAccount",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/finPayment/selectors/account"
    },
    {
      "entity": "finPayment",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/finPayment/selectors/currency"
    },
    {
      "entity": "finPayment",
      "field": "reversedPayment",
      "column": "FIN_Rev_Payment_ID",
      "reference": "Payment",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/finPayment/selectors/reversedPayment"
    },
    {
      "entity": "finPayment",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/payment-out/finPayment/selectors/project"
    },
    {
      "entity": "finPayment",
      "field": "costCenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/finPayment/selectors/costCenter"
    },
    {
      "entity": "finPayment",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/finPayment/selectors/stDimension"
    },
    {
      "entity": "finPayment",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/payment-out/finPayment/selectors/ndDimension"
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
      "entity": "finPayment",
      "field": "aPRMAddScheduledpayments",
      "column": "EM_Aprm_Add_Scheduledpayments",
      "url": "/sws/neo/payment-out/finPayment/{id}/action/aPRMAddScheduledpayments"
    },
    {
      "entity": "finPayment",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/payment-out/finPayment/{id}/action/posted"
    },
    {
      "entity": "finPayment",
      "field": "aPRMProcessPayment",
      "column": "EM_APRM_Process_Payment",
      "url": "/sws/neo/payment-out/finPayment/{id}/action/aPRMProcessPayment"
    },
    {
      "entity": "finPayment",
      "field": "aprmExecutepayment",
      "column": "EM_Aprm_Executepayment",
      "url": "/sws/neo/payment-out/finPayment/{id}/action/aprmExecutepayment"
    },
    {
      "entity": "finPayment",
      "field": "aPRMReversePayment",
      "column": "EM_APRM_ReversePayment",
      "url": "/sws/neo/payment-out/finPayment/{id}/action/aPRMReversePayment"
    },
    {
      "entity": "finPayment",
      "field": "aPRMReconcilePayment",
      "column": "EM_APRM_Reconcile_Payment",
      "url": "/sws/neo/payment-out/finPayment/{id}/action/aPRMReconcilePayment"
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
      "example": "_sortBy=payment-outDate"
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
        detailEntity="lines"
        Form={FinPaymentForm}
        DetailTable={LinesTable}
        DetailForm={LinesForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Fin Payment"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'accounting', label: 'Accounting', Table: AccountingTable, Form: AccountingForm },
          { key: 'executionHistory', label: 'Execution History', Table: ExecutionHistoryTable, Form: ExecutionHistoryForm },
        ]}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="finPayment"
      Table={FinPaymentTable}
      entityLabel="Payment Out"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:FinPaymentPage

// @sf-custom-slot section:FinPaymentPage-custom
