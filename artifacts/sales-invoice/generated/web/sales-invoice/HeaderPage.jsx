import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import HeaderTable from '../../../custom/InvoiceHeaderTable';
import HeaderForm from './HeaderForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import PaymentPlanTable from './PaymentPlanTable';
import PaymentPlanForm from './PaymentPlanForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import InvoiceBottomPanel from '../../../custom/InvoiceBottomPanel';
import InvoiceTopbarExtra from '../../../custom/InvoiceTopbarExtra';
import catalogs from './mockCatalogs';


const breadcrumb = 'Sales / Sales Invoice';


// @sf-generated-start summary:header
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
  { key: 'outstandingAmount', column: 'OutstandingAmt', type: 'amount' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:header

// @sf-custom-slot extraBadges:header
// @sf-generated-start extraBadges:header
const extraBadges = [];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [
  { name: 'Complete', label: 'Confirm & Send', style: 'positive', columnName: 'documentAction',
    displayLogicRaw: "@documentStatus@='DR'" },
];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = null;
// @sf-generated-end draftMode:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', required: true, label: 'Invoiced Quantity' },
    { key: 'unitPrice', column: 'PriceActual', type: 'number', required: true, label: 'Net Unit Price' },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', reference: 'Tax', inputMode: 'selector' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:lines

const api = {
  "specName": "sales-invoice",
  "baseUrl": "/sws/neo/sales-invoice",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-invoice/header",
      "detailUrl": "/sws/neo/sales-invoice/header/{id}",
      "supportedFilters": [
        "documentNo",
        "invoiceDate",
        "businessPartner",
        "documentStatus"
      ]
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-invoice/lines",
      "detailUrl": "/sws/neo/sales-invoice/lines/{id}",
      "supportedFilters": [
        "product"
      ]
    },
    "paymentPlan": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-invoice/paymentPlan",
      "detailUrl": "/sws/neo/sales-invoice/paymentPlan/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "header",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/sales-invoice/header/selectors/businessPartner"
    },
    {
      "entity": "header",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/sales-invoice/header/selectors/partnerAddress"
    },
    {
      "entity": "header",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/paymentMethod"
    },
    {
      "entity": "header",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/currency"
    },
    {
      "entity": "lines",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/sales-invoice/lines/selectors/product"
    },
    {
      "entity": "lines",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/lines/selectors/tax"
    },
    {
      "entity": "paymentPlan",
      "field": "finPaymentmethodID",
      "column": "Fin_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/paymentPlan/selectors/finPaymentmethodID"
    },
    {
      "entity": "paymentPlan",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/paymentPlan/selectors/currency"
    }
  ],
  "actions": [
    {
      "entity": "header",
      "field": "aPRMAddpayment",
      "column": "EM_APRM_Addpayment",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aPRMAddpayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/sales-invoice/header/{id}/action/posted"
    },
    {
      "entity": "header",
      "field": "aPRMProcessinvoice",
      "column": "EM_APRM_Processinvoice",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aPRMProcessinvoice",
      "processId": "B54318B49E984B9CB855AEFB1F474CD6",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/sales-invoice/header/{id}/action/documentAction",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createLinesFromOrder",
      "column": "Createfromorders",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFromOrder",
      "processId": "AB2EFCAABB7B4EC0A9B30CFB82963FB6",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "createLinesFromShipment",
      "column": "Createfrominouts",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFromShipment",
      "processId": "7737CA7330FD49FBA7EBC225E85F2BC9",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/sales-invoice/header/{id}/action/copyFrom",
      "processId": "210",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sales-invoice/header/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/sales-invoice/header/{id}/action/processNow",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/sales-invoice/header/{id}/action/generateTo",
      "processId": "142",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFrom"
    },
    {
      "entity": "lines",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/sales-invoice/lines/{id}/action/explode",
      "processId": "6E1ADD5C8B6B4ACB82237DAA8114451E",
      "processType": "classic"
    },
    {
      "entity": "lines",
      "field": "matchLCCosts",
      "column": "Match_Lccosts",
      "url": "/sws/neo/sales-invoice/lines/{id}/action/matchLCCosts",
      "processId": "281FFDFAB31C4394A2EAA73A6F9F3A3F",
      "processType": "obuiapp"
    },
    {
      "entity": "paymentPlan",
      "field": "updatePaymentPlan",
      "column": "Update_Payment_Plan",
      "url": "/sws/neo/sales-invoice/paymentPlan/{id}/action/updatePaymentPlan",
      "processId": "FB740AB61B0E42B198D2C88D3A0D0CE6",
      "processType": "classic"
    },
    {
      "entity": "paymentPlan",
      "field": "aprmModifPaymentINPlan",
      "column": "EM_Aprm_Modif_Paym_Sched",
      "url": "/sws/neo/sales-invoice/paymentPlan/{id}/action/aprmModifPaymentINPlan",
      "processId": "4EEB3497082C4F2182E16A4371CD5D96",
      "processType": "obuiapp"
    },
    {
      "entity": "paymentPlan",
      "field": "aprmModifPaymentOUTPlan",
      "column": "EM_Aprm_Modif_Paym_Out_Sched",
      "url": "/sws/neo/sales-invoice/paymentPlan/{id}/action/aprmModifPaymentOUTPlan",
      "processId": "6F87442DF7BC43AB8A666BDED2F7D64E",
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
      "example": "_sortBy=sales-invoiceDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:HeaderPage
  if (recordId) {
    return (
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={HeaderForm}
        DetailTable={LinesTable}
        DetailForm={LinesForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Header"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'paymentPlan', label: 'Payment Plan', Table: PaymentPlanTable, Form: PaymentPlanForm },
        ]}
        documentPreview={{ titlePrefix: 'Invoice', pdfUrl: null }}
        hideDeleteWhenComplete
        notesField="description"
        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
        bottomSection={InvoiceBottomPanel}
        topbarRight={InvoiceTopbarExtra}
        menuActions={({ status }) => [
          { key: 'duplicate', label: 'Duplicate', onClick: () => {}, },
          { key: 'cancel', label: 'Cancel', destructive: true, visible: status === 'CO', onClick: () => {}, }
        ]}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Headers"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage

// @sf-custom-slot section:HeaderPage-custom
