import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import HeaderTable from './HeaderTable';
import HeaderForm from './HeaderForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import { AttachmentsTab } from '@/components/attachments';
import PurchaseOrderBottomPanel from '../../../custom/PurchaseOrderBottomPanel';
import PurchaseOrderActions from '../../../custom/PurchaseOrderActions';
import PurchaseOrderDraftChips from '../../../custom/PurchaseOrderDraftChips';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Purchase Order';


// @sf-generated-start summary:header
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [

];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [

];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = {
  "enabled": true,
  "processField": "documentAction",
  "processValue": "CO",
  "label": "poConfirmBtn"
};
// @sf-generated-end draftMode:header

// @sf-generated-start requiredHeaderFields:header
const requiredHeaderFields = ['businessPartner', 'documentNo', 'orderDate', 'partnerAddress', 'scheduledDeliveryDate', 'warehouse', 'paymentTerms', 'priceList', 'grandTotalAmount', 'summedLineAmount', 'currency'];
// @sf-generated-end requiredHeaderFields:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, label: 'Product', reference: 'Product', inputMode: 'search', forceCalloutFields: ["listPrice","unitPrice","tax","uOM","grossUnitPrice","discount"] },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', required: true, label: 'Ordered Quantity', defaultValue: 1, min: 0 },
    { key: 'listPrice', column: 'PriceList', type: 'number', required: true, label: 'Net List Price', min: 0 },
    { key: 'discount', column: 'Discount', type: 'number', label: 'Discount %', defaultValue: 0, min: 0, max: 100 },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', required: true, label: 'Tax', reference: 'Tax', inputMode: 'selector', forceCalloutFields: ["lineGrossAmount","grossUnitPrice","lineNetAmount"] },
  ],
  derived: [

  ],
  hidden: [
    { key: 'grossUnitPrice', value: '0' },
    { key: 'warehouse', fromParent: 'warehouse' },
    { key: 'shippingCompany', fromParent: 'shippingCompany' },
    { key: 'orderDate', fromParent: 'orderDate' },
    { key: 'scheduledDeliveryDate', fromParent: 'scheduledDeliveryDate' },
    { key: 'partnerAddress', fromParent: 'partnerAddress' },
    { key: 'currency', fromParent: 'currency' },
  ],
};
// @sf-generated-end addLineFields:lines

export const api = {
  "specName": "purchase-order",
  "baseUrl": "/sws/neo/purchase-order",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/header",
      "detailUrl": "/sws/neo/purchase-order/header/{id}",
      "supportedFilters": [
        "businessPartner",
        "documentNo",
        "orderDate",
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
      "listUrl": "/sws/neo/purchase-order/lines",
      "detailUrl": "/sws/neo/purchase-order/lines/{id}",
      "supportedFilters": []
    },
    "lineTax": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/lineTax",
      "detailUrl": "/sws/neo/purchase-order/lineTax/{id}",
      "supportedFilters": []
    },
    "reservedStock": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/reservedStock",
      "detailUrl": "/sws/neo/purchase-order/reservedStock/{id}",
      "supportedFilters": []
    },
    "paymentDetails": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/paymentDetails",
      "detailUrl": "/sws/neo/purchase-order/paymentDetails/{id}",
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
      "url": "/sws/neo/purchase-order/header/selectors/businessPartner"
    },
    {
      "entity": "header",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/purchase-order/header/selectors/partnerAddress",
      "context": {
        "required": [
          {
            "param": "C_BPartner_ID",
            "source": "field",
            "field": "businessPartner"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "transactionDocument",
      "column": "C_DocTypeTarget_ID",
      "reference": "DocumentType",
      "url": "/sws/neo/purchase-order/header/selectors/transactionDocument",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/header/selectors/warehouse"
    },
    {
      "entity": "header",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/header/selectors/paymentMethod",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "paymentTerms",
      "column": "C_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/header/selectors/paymentTerms"
    },
    {
      "entity": "header",
      "field": "priceList",
      "column": "M_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/header/selectors/priceList",
      "context": {
        "required": [
          {
            "param": "isSOTrx",
            "source": "windowCategory"
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
      "url": "/sws/neo/purchase-order/header/selectors/currency"
    },
    {
      "entity": "header",
      "field": "companyAgent",
      "column": "SalesRep_ID",
      "url": "/sws/neo/purchase-order/header/selectors/companyAgent"
    },
    {
      "entity": "header",
      "field": "invoiceFrom",
      "column": "BillTo_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/purchase-order/header/selectors/invoiceFrom",
      "context": {
        "required": [
          {
            "param": "C_BPartner_ID",
            "source": "field",
            "field": "businessPartner"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "incoterms",
      "column": "C_Incoterms_ID",
      "url": "/sws/neo/purchase-order/header/selectors/incoterms"
    },
    {
      "entity": "header",
      "field": "shippingCompany",
      "column": "M_Shipper_ID",
      "reference": "Shipper",
      "url": "/sws/neo/purchase-order/header/selectors/shippingCompany"
    },
    {
      "entity": "header",
      "field": "charge",
      "column": "C_Charge_ID",
      "url": "/sws/neo/purchase-order/header/selectors/charge"
    },
    {
      "entity": "header",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/purchase-order/header/selectors/project",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          },
          {
            "param": "C_BPartner_ID",
            "source": "field",
            "field": "businessPartner"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/header/selectors/costcenter"
    },
    {
      "entity": "header",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/header/selectors/asset"
    },
    {
      "entity": "header",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/header/selectors/stDimension"
    },
    {
      "entity": "header",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/header/selectors/ndDimension"
    },
    {
      "entity": "lines",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/purchase-order/lines/selectors/product"
    },
    {
      "entity": "lines",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/lines/selectors/tax",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          },
          {
            "param": "DateInvoiced",
            "source": "parentField",
            "field": "orderDate",
            "format": "DD-MM-YYYY"
          }
        ]
      }
    },
    {
      "entity": "lines",
      "field": "operativeUOM",
      "column": "C_Aum",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/lines/selectors/operativeUOM",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          },
          {
            "param": "M_Product_ID",
            "source": "field",
            "field": "product"
          }
        ]
      }
    },
    {
      "entity": "lines",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "url": "/sws/neo/purchase-order/lines/selectors/uOM"
    },
    {
      "entity": "lines",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "url": "/sws/neo/purchase-order/lines/selectors/warehouse"
    },
    {
      "entity": "lines",
      "field": "shippingCompany",
      "column": "M_Shipper_ID",
      "reference": "Shipper",
      "url": "/sws/neo/purchase-order/lines/selectors/shippingCompany"
    },
    {
      "entity": "lines",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "url": "/sws/neo/purchase-order/lines/selectors/partnerAddress",
      "context": {
        "required": [
          {
            "param": "C_BPartner_ID",
            "source": "parentField",
            "field": "businessPartner"
          }
        ]
      }
    },
    {
      "entity": "lines",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/purchase-order/lines/selectors/project"
    },
    {
      "entity": "lines",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/lines/selectors/costcenter"
    },
    {
      "entity": "lines",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/lines/selectors/asset"
    },
    {
      "entity": "lines",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/lines/selectors/stDimension"
    },
    {
      "entity": "lines",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/lines/selectors/ndDimension"
    },
    {
      "entity": "lines",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "url": "/sws/neo/purchase-order/lines/selectors/currency"
    },
    {
      "entity": "lineTax",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "url": "/sws/neo/purchase-order/lineTax/selectors/tax"
    },
    {
      "entity": "reservedStock",
      "field": "reservation",
      "column": "M_Reservation_ID",
      "reference": "Reservation",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/reservation"
    },
    {
      "entity": "reservedStock",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/businessPartner"
    },
    {
      "entity": "reservedStock",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/storageBin"
    },
    {
      "entity": "paymentDetails",
      "field": "payment",
      "column": "FIN_Payment_ID",
      "reference": "Payment",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/payment"
    },
    {
      "entity": "paymentDetails",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/paymentMethod"
    },
    {
      "entity": "paymentDetails",
      "field": "finFinancialAccountID",
      "column": "Fin_Financial_Account_ID",
      "reference": "FinancialAccount",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/finFinancialAccountID"
    }
  ],
  "actions": [
    {
      "entity": "header",
      "field": "generateTemplate",
      "column": "Generatetemplate",
      "url": "/sws/neo/purchase-order/header/{id}/action/generateTemplate",
      "processId": "800022",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "rMPickFromShipment",
      "column": "RM_PickFromShipment",
      "url": "/sws/neo/purchase-order/header/{id}/action/rMPickFromShipment",
      "processId": "A2C19D0EF6594D14A64BC62E99A89CC3",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "rMReceiveMaterials",
      "column": "RM_ReceiveMaterials",
      "url": "/sws/neo/purchase-order/header/{id}/action/rMReceiveMaterials"
    },
    {
      "entity": "header",
      "field": "rMCreateInvoice",
      "column": "RM_CreateInvoice",
      "url": "/sws/neo/purchase-order/header/{id}/action/rMCreateInvoice",
      "processId": "FF80808133362F6A013336781FCE0066",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "aPRMAddPayment",
      "column": "EM_APRM_AddPayment",
      "url": "/sws/neo/purchase-order/header/{id}/action/aPRMAddPayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/purchase-order/header/{id}/action/documentAction",
      "processId": "104",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/purchase-order/header/{id}/action/copyFrom",
      "processId": "211",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "copyFromPO",
      "column": "CopyFromPO",
      "url": "/sws/neo/purchase-order/header/{id}/action/copyFromPO",
      "processId": "8B81D80B06364566B87853FEECAB5DE0",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "rMAddOrphanLine",
      "column": "RM_AddOrphanLine",
      "url": "/sws/neo/purchase-order/header/{id}/action/rMAddOrphanLine",
      "processId": "23D1B163EC0B41F790CE39BF01DA320E",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createOrder",
      "column": "Convertquotation",
      "url": "/sws/neo/purchase-order/header/{id}/action/createOrder",
      "processId": "A3FE1F9892394386A49FB707AA50A0FA",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/purchase-order/header/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createPOLines",
      "column": "Create_POLines",
      "url": "/sws/neo/purchase-order/header/{id}/action/createPOLines",
      "processId": "6995A4C2592D434A9E16B71E1694CBCA",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/purchase-order/header/{id}/action/processNow",
      "processId": "104",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/purchase-order/header/{id}/action/posted",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "cancelandreplace",
      "column": "Cancelandreplace",
      "url": "/sws/neo/purchase-order/header/{id}/action/cancelandreplace",
      "processId": "A2FAF49712D1445ABE750315CE1B473A",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "confirmcancelandreplace",
      "column": "Confirmcancelandreplace",
      "url": "/sws/neo/purchase-order/header/{id}/action/confirmcancelandreplace",
      "processId": "0C2AFAEFB67B4CB8A1429195EB119A49",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "rMPickfromreceipt",
      "column": "RM_Pickfromreceipt",
      "url": "/sws/neo/purchase-order/header/{id}/action/rMPickfromreceipt",
      "processId": "A2C19D0EF6594D14A64BC62E99A89CC3",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/purchase-order/header/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "eTPRRemovePayment",
      "column": "EM_Etpr_Remove_Payment",
      "url": "/sws/neo/purchase-order/header/{id}/action/eTPRRemovePayment",
      "processId": "D2923463223C4F1EADE335D22B9D8FE8",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/purchase-order/lines/{id}/action/managePrereservation",
      "processId": "70E42AD47E5F4698A9ACCCAF3EB72B9E",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/purchase-order/lines/{id}/action/explode",
      "processId": "DFC78024B1F54CBB95DC73425BA6687F",
      "processType": "classic"
    },
    {
      "entity": "lines",
      "field": "manageReservation",
      "column": "Manage_Reservation",
      "url": "/sws/neo/purchase-order/lines/{id}/action/manageReservation",
      "processId": "5F547560D3DE401AA0B570F22E2C6C06",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "field": "selectOrderLine",
      "column": "Relate_Orderline",
      "url": "/sws/neo/purchase-order/lines/{id}/action/selectOrderLine",
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
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "purchases"
  },
  "labelOverrides": {
    "es_ES": {
      "C_BPartner_ID": "Contacto",
      "DatePromised": "Fecha de entrega esperada",
      "DeliveryStatusPurchase": "Estado de recepción",
      "InvoiceStatus": "Estado de facturación"
    },
    "en_US": {
      "C_BPartner_ID": "Contact",
      "DatePromised": "Expected Delivery Date",
      "DeliveryStatusPurchase": "Reception Status",
      "InvoiceStatus": "Invoicing Status"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
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
        hideDeleteWhenComplete
        hidePrint
        hideSaveStatuses={["CO","CL","VO"]}
        noHeaderBorder
        notesField="description"
        customTabs={[{ key: 'related', labelKey: 'relatedDocuments', Component: RelatedDocuments }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Order", config: {} } }]}
        bottomSection={PurchaseOrderBottomPanel}
        topbarRight={PurchaseOrderActions}
        topbarExtra={PurchaseOrderDraftChips}
        draftMode={draftMode}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        linesLayout="inlineEditable"
        sendDocument
        selectorPriceCurrency="org"
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Purchase Order"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="orderDate"
      hidePrint
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      sendDocument
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage
