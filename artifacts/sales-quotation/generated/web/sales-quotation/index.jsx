import QuotationPage from './QuotationPage';

const windowMeta = { category: 'sales', name: 'Sales Quotation' };

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

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  // @sf-custom-slot hooks:App
  return <QuotationPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
