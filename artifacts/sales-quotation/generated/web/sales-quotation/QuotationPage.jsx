import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import QuotationTable from './QuotationTable';
import QuotationForm from './QuotationForm';
import QuotationLineTable from './QuotationLineTable';
import QuotationLineForm from './QuotationLineForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Sales / Sales Quotation';

// @sf-generated-start summary:quotation
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:quotation

// @sf-custom-slot extraBadges:quotation
// @sf-generated-start extraBadges:quotation
const extraBadges = [];
// @sf-generated-end extraBadges:quotation

// @sf-generated-start processes:quotation
const processes = [
  // Complete the quotation (confirm it)
  { name: 'Complete', label: 'Confirm', style: 'positive', columnName: 'documentAction',
    displayLogicRaw: "@documentStatus@='DR'" },
  // Void a confirmed quotation
  { name: 'Void', label: 'Void', style: 'destructive', columnName: 'documentAction',
    displayLogicRaw: "@documentStatus@='CO'" },
  // Reactivate a voided quotation
  { name: 'Reactivate', label: 'Reactivate', style: 'positive', columnName: 'documentAction',
    displayLogicRaw: "@documentStatus@='VO'" },
  // TODO: "Convert to Order" — wire to createOrder action (process A3FE1F9892394386A49FB707AA50A0FA)
  // Needs OBUIAPP process parameter UI. Visible when status is Complete.
  // On success: navigate to the newly created Sales Order.
];
// @sf-generated-end processes:quotation

// @sf-generated-start draftMode:quotation
const draftMode = null;
// @sf-generated-end draftMode:quotation

// @sf-generated-start addLineFields:quotationLine
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', required: true, label: 'Ordered Quantity' },
    { key: 'unitPrice', column: 'PriceActual', type: 'number', required: true, label: 'Net Unit Price' },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', required: true, label: 'Tax', reference: 'Tax', inputMode: 'selector' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [
    { key: 'discount', column: 'Discount', type: 'number', label: 'Discount' },
  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:quotationLine

const api = {
  "specName": "sales-quotation",
  "baseUrl": "/sws/neo/sales-quotation",
  "crud": {
    "quotation": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-quotation/quotation",
      "detailUrl": "/sws/neo/sales-quotation/quotation/{id}",
      "supportedFilters": [
        "documentNo",
        "orderDate",
        "businessPartner",
        "validUntil",
        "documentStatus"
      ]
    },
    "quotationLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-quotation/quotationLine",
      "detailUrl": "/sws/neo/sales-quotation/quotationLine/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "quotation",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/sales-quotation/quotation/selectors/businessPartner"
    },
    {
      "entity": "quotation",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/sales-quotation/quotation/selectors/partnerAddress"
    },
    {
      "entity": "quotation",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/sales-quotation/quotation/selectors/paymentMethod"
    },
    {
      "entity": "quotation",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/sales-quotation/quotation/selectors/currency"
    },
    {
      "entity": "quotationLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/sales-quotation/quotationLine/selectors/product"
    },
    {
      "entity": "quotationLine",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/sales-quotation/quotationLine/selectors/tax"
    }
  ],
  "actions": [
    {
      "entity": "quotation",
      "field": "rMPickFromShipment",
      "column": "RM_PickFromShipment",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/rMPickFromShipment",
      "processId": "A2C19D0EF6594D14A64BC62E99A89CC3",
      "processType": "obuiapp"
    },
    {
      "entity": "quotation",
      "field": "rMReceiveMaterials",
      "column": "RM_ReceiveMaterials",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/rMReceiveMaterials"
    },
    {
      "entity": "quotation",
      "field": "rMCreateInvoice",
      "column": "RM_CreateInvoice",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/rMCreateInvoice",
      "processId": "FF80808133362F6A013336781FCE0066",
      "processType": "classic"
    },
    {
      "entity": "quotation",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/copyFrom",
      "processId": "211",
      "processType": "classic"
    },
    {
      "entity": "quotation",
      "field": "copyFromPO",
      "column": "CopyFromPO",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/copyFromPO",
      "processId": "8B81D80B06364566B87853FEECAB5DE0",
      "processType": "obuiapp"
    },
    {
      "entity": "quotation",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/documentAction",
      "processId": "104",
      "processType": "classic"
    },
    {
      "entity": "quotation",
      "field": "createOrder",
      "column": "Convertquotation",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/createOrder",
      "processId": "A3FE1F9892394386A49FB707AA50A0FA",
      "processType": "classic"
    },
    {
      "entity": "quotation",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "quotation",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/posted",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "quotation",
      "field": "generateTemplate",
      "column": "Generatetemplate",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/generateTemplate",
      "processId": "800022",
      "processType": "classic"
    },
    {
      "entity": "quotation",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/processNow",
      "processId": "104",
      "processType": "classic"
    },
    {
      "entity": "quotation",
      "field": "cancelandreplace",
      "column": "Cancelandreplace",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/cancelandreplace",
      "processId": "A2FAF49712D1445ABE750315CE1B473A",
      "processType": "obuiapp"
    },
    {
      "entity": "quotation",
      "field": "confirmcancelandreplace",
      "column": "Confirmcancelandreplace",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/confirmcancelandreplace",
      "processId": "0C2AFAEFB67B4CB8A1429195EB119A49",
      "processType": "obuiapp"
    },
    {
      "entity": "quotation",
      "field": "createPOLines",
      "column": "Create_POLines",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/createPOLines",
      "processId": "6995A4C2592D434A9E16B71E1694CBCA",
      "processType": "obuiapp"
    },
    {
      "entity": "quotation",
      "field": "aPRMAddPayment",
      "column": "EM_APRM_AddPayment",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/aPRMAddPayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "quotation",
      "field": "rMAddOrphanLine",
      "column": "RM_AddOrphanLine",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/rMAddOrphanLine",
      "processId": "23D1B163EC0B41F790CE39BF01DA320E",
      "processType": "classic"
    },
    {
      "entity": "quotation",
      "field": "rMPickfromreceipt",
      "column": "RM_Pickfromreceipt",
      "url": "/sws/neo/sales-quotation/quotation/{id}/action/rMPickfromreceipt",
      "processId": "A2C19D0EF6594D14A64BC62E99A89CC3",
      "processType": "obuiapp"
    },
    {
      "entity": "quotationLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/sales-quotation/quotationLine/{id}/action/explode",
      "processId": "DFC78024B1F54CBB95DC73425BA6687F",
      "processType": "classic"
    },
    {
      "entity": "quotationLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/sales-quotation/quotationLine/{id}/action/managePrereservation",
      "processId": "70E42AD47E5F4698A9ACCCAF3EB72B9E",
      "processType": "obuiapp"
    },
    {
      "entity": "quotationLine",
      "field": "manageReservation",
      "column": "Manage_Reservation",
      "url": "/sws/neo/sales-quotation/quotationLine/{id}/action/manageReservation",
      "processId": "5F547560D3DE401AA0B570F22E2C6C06",
      "processType": "obuiapp"
    },
    {
      "entity": "quotationLine",
      "field": "selectOrderLine",
      "column": "Relate_Orderline",
      "url": "/sws/neo/sales-quotation/quotationLine/{id}/action/selectOrderLine",
      "processId": "C4265E27C8134096B49DFBF69369DFC6",
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
      "example": "_sortBy=sales-quotationDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:QuotationPage
export default function QuotationPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:QuotationPage
  if (recordId) {
    return (
      <DetailView
        entity="quotation"
        detailEntity="quotationLine"
        Form={QuotationForm}
        DetailTable={QuotationLineTable}
        DetailForm={QuotationLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Quotation"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        documentPreview={{ titlePrefix: 'Quotation', pdfUrl: null }}
        notesField="description"
        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
        hideDeleteWhenComplete
        menuActions={({ status }) => [
          { key: 'duplicate', label: 'Duplicate', onClick: () => toast('Coming soon') },
          { key: 'cancel', label: 'Cancel', destructive: true, visible: status === 'CO', onClick: () => toast('Coming soon') },
        ]}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="quotation"
      Table={QuotationTable}
      entityLabel="Quotations"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:QuotationPage

// @sf-custom-slot section:QuotationPage-custom
