import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import HeaderTable from './HeaderTable';
import HeaderForm from './HeaderForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Sales / Sales Order';

// @sf-generated-start summary:header
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:header

// @sf-custom-slot extraBadges:header
// @sf-generated-start extraBadges:header
const extraBadges = [];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [
  // Complete the order
  { name: 'Complete', label: 'Complete', style: 'positive', columnName: 'documentAction',
    displayLogicRaw: "@documentStatus@='DR'" },
  // TODO: "Create Shipment" — wire to rMPickFromShipment (process A2C19D0EF6594D14A64BC62E99A89CC3, obuiapp)
  // Needs OBUIAPP process with parameter UI. Visible when CO and no shipment exists.
  // On success: navigate to newly created Shipment. Replace with "View Shipment" once exists.
  // TODO: "Create Invoice" — wire to rMCreateInvoice (process FF80808133362F6A013336781FCE0066, classic)
  // Visible when CO, for service orders or after shipment. On success: navigate to Invoice.
];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = null;
// @sf-generated-end draftMode:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', required: true, label: 'Ordered Quantity' },
    { key: 'unitPrice', column: 'PriceActual', type: 'number', required: true, label: 'Net Unit Price' },
    { key: 'lineNetAmount', column: 'LineNetAmt', type: 'number', required: true, label: 'Line Net Amount' },
    { key: 'tax', column: 'C_Tax_ID', type: 'search', required: true, label: 'Tax', reference: 'Tax', inputMode: 'search' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [
    { key: 'discount', column: 'Discount', type: 'number', label: 'Discount' },
  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:lines

const api = {
  "specName": "sales-order",
  "baseUrl": "/sws/neo/sales-order",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-order/header",
      "detailUrl": "/sws/neo/sales-order/header/{id}",
      "supportedFilters": [
        "documentNo",
        "orderDate",
        "businessPartner",
        "documentStatus",
        "orderReference"
      ]
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-order/lines",
      "detailUrl": "/sws/neo/sales-order/lines/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "header",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/sales-order/header/selectors/businessPartner"
    },
    {
      "entity": "header",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/sales-order/header/selectors/partnerAddress"
    },
    {
      "entity": "header",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/sales-order/header/selectors/paymentMethod"
    },
    {
      "entity": "header",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/sales-order/header/selectors/warehouse"
    },
    {
      "entity": "header",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/sales-order/header/selectors/currency"
    },
    {
      "entity": "lines",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/sales-order/lines/selectors/product"
    },
    {
      "entity": "lines",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "search",
      "url": "/sws/neo/sales-order/lines/selectors/tax"
    }
  ],
  "actions": [
    {
      "entity": "header",
      "field": "rMPickFromShipment",
      "column": "RM_PickFromShipment",
      "url": "/sws/neo/sales-order/header/{id}/action/rMPickFromShipment",
      "processId": "A2C19D0EF6594D14A64BC62E99A89CC3",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "rMReceiveMaterials",
      "column": "RM_ReceiveMaterials",
      "url": "/sws/neo/sales-order/header/{id}/action/rMReceiveMaterials"
    },
    {
      "entity": "header",
      "field": "rMCreateInvoice",
      "column": "RM_CreateInvoice",
      "url": "/sws/neo/sales-order/header/{id}/action/rMCreateInvoice",
      "processId": "FF80808133362F6A013336781FCE0066",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "aPRMAddPayment",
      "column": "EM_APRM_AddPayment",
      "url": "/sws/neo/sales-order/header/{id}/action/aPRMAddPayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/sales-order/header/{id}/action/documentAction",
      "processId": "104",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/sales-order/header/{id}/action/copyFrom",
      "processId": "211",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "copyFromPO",
      "column": "CopyFromPO",
      "url": "/sws/neo/sales-order/header/{id}/action/copyFromPO",
      "processId": "8B81D80B06364566B87853FEECAB5DE0",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sales-order/header/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "rMAddOrphanLine",
      "column": "RM_AddOrphanLine",
      "url": "/sws/neo/sales-order/header/{id}/action/rMAddOrphanLine",
      "processId": "23D1B163EC0B41F790CE39BF01DA320E",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createOrder",
      "column": "Convertquotation",
      "url": "/sws/neo/sales-order/header/{id}/action/createOrder",
      "processId": "A3FE1F9892394386A49FB707AA50A0FA",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "cancelAndReplace",
      "column": "Cancelandreplace",
      "url": "/sws/neo/sales-order/header/{id}/action/cancelAndReplace",
      "processId": "A2FAF49712D1445ABE750315CE1B473A",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "confirmCancelAndReplace",
      "column": "Confirmcancelandreplace",
      "url": "/sws/neo/sales-order/header/{id}/action/confirmCancelAndReplace",
      "processId": "0C2AFAEFB67B4CB8A1429195EB119A49",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "generateTemplate",
      "column": "Generatetemplate",
      "url": "/sws/neo/sales-order/header/{id}/action/generateTemplate",
      "processId": "800022",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/sales-order/header/{id}/action/posted",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/sales-order/header/{id}/action/processNow",
      "processId": "104",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createPOLines",
      "column": "Create_POLines",
      "url": "/sws/neo/sales-order/header/{id}/action/createPOLines",
      "processId": "6995A4C2592D434A9E16B71E1694CBCA",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "rMPickfromreceipt",
      "column": "RM_Pickfromreceipt",
      "url": "/sws/neo/sales-order/header/{id}/action/rMPickfromreceipt",
      "processId": "A2C19D0EF6594D14A64BC62E99A89CC3",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "field": "manageReservation",
      "column": "Manage_Reservation",
      "url": "/sws/neo/sales-order/lines/{id}/action/manageReservation",
      "processId": "5F547560D3DE401AA0B570F22E2C6C06",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/sales-order/lines/{id}/action/explode",
      "processId": "DFC78024B1F54CBB95DC73425BA6687F",
      "processType": "classic"
    },
    {
      "entity": "lines",
      "field": "selectOrderLine",
      "column": "Relate_Orderline",
      "url": "/sws/neo/sales-order/lines/{id}/action/selectOrderLine",
      "processId": "C4265E27C8134096B49DFBF69369DFC6",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/sales-order/lines/{id}/action/managePrereservation",
      "processId": "70E42AD47E5F4698A9ACCCAF3EB72B9E",
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
      "example": "_sortBy=sales-orderDate"
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
        documentPreview={{ titlePrefix: 'Order', pdfUrl: null }}
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
