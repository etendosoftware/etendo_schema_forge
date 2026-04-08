import { ListView, DetailView } from '@/components/contract-ui';
import PaymentInTable from './PaymentInTable';
import PaymentInForm from './PaymentInForm';
import PaymentLinesTable from './PaymentLinesTable';
import catalogs from './mockCatalogs';

const breadcrumb = 'Accounting / Payment In';

// @sf-generated-start summary:paymentIn
const summary = [
  { key: 'financialTransactionAmount', column: 'Finacc_Txn_Amount', type: 'amount', label: 'Received (Financial Account)' },
  { key: 'financialTransactionConvertRate', column: 'Finacc_Txn_Convert_Rate', type: 'string', label: 'Exchange Rate' },
  { key: 'generatedCredit', column: 'Generated_Credit', type: 'amount', label: 'Generated Credit' },
  { key: 'usedCredit', column: 'Used_Credit', type: 'amount', label: 'Used Credit' },
  { key: 'writeoffAmount', column: 'Writeoffamt', type: 'amount', label: 'Write-off Amount' },
  { key: 'reversedPayment', column: 'FIN_Rev_Payment_ID', type: 'string', label: 'Reversed Payment' },
];

const statusField = 'status';
// @sf-generated-end summary:paymentIn

// @sf-generated-start processes:paymentIn
const processes = [
  {
    name: 'paymentProcess',
    entity: 'paymentIn',
    columnName: 'EM_APRM_Process_Payment',
    label: 'Payment Process',
    params: [
      {
        name: 'action',
        label: 'Action',
        type: 'list',
        required: true,
        options: [
          { value: 'P', label: 'Process' },
          { value: 'RE', label: 'Reactivate' },
          { value: 'R', label: 'Reactivate and Delete Lines' },
          { value: 'V', label: 'Void' },
        ],
      },
    ],
  },
  {
    name: 'reversePayment',
    entity: 'paymentIn',
    columnName: 'EM_APRM_ReversePayment',
    label: 'Reverse Payment',
    style: 'destructive',
    params: [
      { name: 'action', type: 'hidden', defaultValue: 'RV' },
      { name: 'paymentDate', label: 'Payment Date', type: 'date', required: true },
    ],
  },
];
// @sf-generated-end processes:paymentIn

// @sf-generated-start addLineFields:paymentLines
const addLineFields = {
  entry: [
    { key: 'invoicePaymentSchedule', column: 'FIN_Payment_Schedule_Invoice', type: 'search', lookup: true, reference: 'Invoice', inputMode: 'search' },
    { key: 'orderPaymentSchedule', column: 'FIN_Payment_Schedule_Order', type: 'search', reference: 'SalesOrder', inputMode: 'search' },
    { key: 'gLItem', column: 'C_Glitem_ID', type: 'selector', reference: 'GLItem', inputMode: 'selector' },
  ],
  derived: [
    { key: 'amount', column: 'Amount', type: 'number' },
  ],
};
// @sf-generated-end addLineFields:paymentLines

const api = {
  "specName": "payment-in",
  "baseUrl": "/sws/neo/payment-in",
  "crud": {
    "paymentIn": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-in/paymentIn",
      "detailUrl": "/sws/neo/payment-in/paymentIn/{id}",
      "supportedFilters": [
        "referenceNo",
        "paymentDate",
        "businessPartner",
        "account",
        "status"
      ]
    },
    "paymentLines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-in/paymentLines",
      "detailUrl": "/sws/neo/payment-in/paymentLines/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "paymentIn",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BusinessPartner",
      "url": "/sws/neo/payment-in/paymentIn/selectors/businessPartner"
    },
    {
      "entity": "paymentIn",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "url": "/sws/neo/payment-in/paymentIn/selectors/paymentMethod"
    },
    {
      "entity": "paymentIn",
      "field": "account",
      "column": "Fin_Financial_Account_ID",
      "reference": "FinancialAccount",
      "url": "/sws/neo/payment-in/paymentIn/selectors/account"
    },
    {
      "entity": "paymentIn",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "url": "/sws/neo/payment-in/paymentIn/selectors/currency"
    },
    {
      "entity": "paymentIn",
      "field": "reversedPayment",
      "column": "FIN_Rev_Payment_ID",
      "reference": "Payment",
      "url": "/sws/neo/payment-in/paymentIn/selectors/reversedPayment"
    },
    {
      "entity": "paymentIn",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "url": "/sws/neo/payment-in/paymentIn/selectors/project"
    },
    {
      "entity": "paymentLines",
      "field": "invoicePaymentSchedule",
      "column": "FIN_Payment_Schedule_Invoice",
      "reference": "Invoice",
      "url": "/sws/neo/payment-in/paymentLines/selectors/invoicePaymentSchedule"
    },
    {
      "entity": "paymentLines",
      "field": "orderPaymentSchedule",
      "column": "FIN_Payment_Schedule_Order",
      "reference": "SalesOrder",
      "url": "/sws/neo/payment-in/paymentLines/selectors/orderPaymentSchedule"
    },
    {
      "entity": "paymentLines",
      "field": "gLItem",
      "column": "C_Glitem_ID",
      "reference": "GLItem",
      "url": "/sws/neo/payment-in/paymentLines/selectors/gLItem"
    },
    {
      "entity": "paymentLines",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BusinessPartner",
      "url": "/sws/neo/payment-in/paymentLines/selectors/businessPartner"
    }
  ],
  "actions": [],
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

// @sf-generated-start component:PaymentInPage
export default function PaymentInPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:PaymentInPage
  if (recordId) {
    return (
      <DetailView
        entity="paymentIn"
        detailEntity="paymentLines"
        Form={PaymentInForm}
        DetailTable={PaymentLinesTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        documentPreview={{ titlePrefix: 'Payment', pdfUrl: null }}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Payment In"
        detailLabel="Payment Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="paymentIn"
      Table={PaymentInTable}
      entityLabel="Payment Ins"
      windowName={windowName}
      breadcrumb={breadcrumb}
      {...props}
    />
  );
}
// @sf-generated-end component:PaymentInPage

// @sf-custom-slot section:PaymentInPage-custom
