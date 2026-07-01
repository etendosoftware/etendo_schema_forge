import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { RETURN_ORDER_LINE_CONFIG } from '@/hooks/useLineGrossAmount';
import CustomerReturnTable from './CustomerReturnTable';
import CustomerReturnForm from './CustomerReturnForm';
import CustomerReturnLineTable from './CustomerReturnLineTable';
import CustomerReturnLineForm from './CustomerReturnLineForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import { AttachmentsTab } from '@/components/attachments';
import ReturnFromCustomerBottomPanel from '../../../custom/ReturnFromCustomerBottomPanel';
import catalogs from './mockCatalogs';


const breadcrumb = 'Sales / Returns';


// @sf-generated-start summary:customerReturn
const summary = [
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:customerReturn

// @sf-generated-start extraBadges:customerReturn
const extraBadges = [

];
// @sf-generated-end extraBadges:customerReturn

// @sf-generated-start processes:customerReturn
const processes = [

];
// @sf-generated-end processes:customerReturn

// @sf-generated-start draftMode:customerReturn
const draftMode = null;
// @sf-generated-end draftMode:customerReturn

// @sf-generated-start requiredHeaderFields:customerReturn
const requiredHeaderFields = ['summedLineAmount', 'documentNo', 'orderDate', 'businessPartner', 'partnerAddress', 'warehouse'];
// @sf-generated-end requiredHeaderFields:customerReturn

// @sf-generated-start addLineFields:customerReturnLine
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, label: 'Line No.', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM C_OrderLine WHERE C_Order_ID=@C_Order_ID@' },
    { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', label: 'Attribute Set Value' },
    { key: 'cReturnReasonID', column: 'C_Return_Reason_ID', type: 'search', lookup: true, label: 'Return Reason', reference: 'Return_Reason', inputMode: 'search' },
    { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', required: true, label: 'Returned Quantity', defaultValue: 1 },
    { key: 'goodsShipmentLine', column: 'M_Inoutline_ID', type: 'search', label: 'Goods Shipment Line', reference: 'InOutLine', inputMode: 'search' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:customerReturnLine

export const api = {
  "specName": "returns",
  "baseUrl": "/sws/neo/returns",
  "crud": {
    "customerReturn": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/returns/customerReturn",
      "detailUrl": "/sws/neo/returns/customerReturn/{id}",
      "supportedFilters": [
        "documentStatus",
        "documentNo",
        "orderDate",
        "businessPartner"
      ]
    },
    "customerReturnLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/returns/customerReturnLine",
      "detailUrl": "/sws/neo/returns/customerReturnLine/{id}",
      "supportedFilters": [
        "goodsShipmentLine"
      ]
    }
  },
  "selectors": [
    {
      "entity": "customerReturn",
      "field": "cReturnReasonID",
      "column": "C_Return_Reason_ID",
      "reference": "Return_Reason",
      "inputMode": "search",
      "url": "/sws/neo/returns/customerReturn/selectors/cReturnReasonID"
    },
    {
      "entity": "customerReturn",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/returns/customerReturn/selectors/businessPartner"
    },
    {
      "entity": "customerReturn",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BPartner_Location",
      "inputMode": "dependent",
      "url": "/sws/neo/returns/customerReturn/selectors/partnerAddress",
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
      "entity": "customerReturn",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/returns/customerReturn/selectors/warehouse"
    },
    {
      "entity": "customerReturn",
      "field": "etvfacReversedInvoice",
      "column": "EM_Etvfac_Reversed_Invoice",
      "reference": "Invoice",
      "inputMode": "search",
      "url": "/sws/neo/returns/customerReturn/selectors/etvfacReversedInvoice"
    },
    {
      "entity": "customerReturn",
      "field": "salesRepresentative",
      "column": "SalesRep_ID",
      "reference": "User",
      "inputMode": "selector",
      "url": "/sws/neo/returns/customerReturn/selectors/salesRepresentative"
    },
    {
      "entity": "customerReturnLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/returns/customerReturnLine/selectors/product"
    },
    {
      "entity": "customerReturnLine",
      "field": "cReturnReasonID",
      "column": "C_Return_Reason_ID",
      "reference": "Return_Reason",
      "inputMode": "search",
      "url": "/sws/neo/returns/customerReturnLine/selectors/cReturnReasonID"
    },
    {
      "entity": "customerReturnLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/returns/customerReturnLine/selectors/uOM"
    },
    {
      "entity": "customerReturnLine",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/returns/customerReturnLine/selectors/tax",
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
      "entity": "customerReturnLine",
      "field": "goodsShipmentLine",
      "column": "M_Inoutline_ID",
      "reference": "InOutLine",
      "inputMode": "search",
      "url": "/sws/neo/returns/customerReturnLine/selectors/goodsShipmentLine"
    }
  ],
  "actions": [
    {
      "entity": "customerReturn",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/returns/customerReturn/{id}/action/documentAction",
      "processId": "104",
      "processType": "classic"
    },
    {
      "entity": "customerReturn",
      "field": "rMReceiveMaterials",
      "column": "RM_ReceiveMaterials",
      "url": "/sws/neo/returns/customerReturn/{id}/action/rMReceiveMaterials"
    },
    {
      "entity": "customerReturn",
      "field": "rMPickFromShipment",
      "column": "RM_PickFromShipment",
      "url": "/sws/neo/returns/customerReturn/{id}/action/rMPickFromShipment",
      "processId": "A2C19D0EF6594D14A64BC62E99A89CC3",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "rMAddOrphanLine",
      "column": "RM_AddOrphanLine",
      "url": "/sws/neo/returns/customerReturn/{id}/action/rMAddOrphanLine",
      "processId": "23D1B163EC0B41F790CE39BF01DA320E",
      "processType": "classic"
    },
    {
      "entity": "customerReturn",
      "field": "rMCreateInvoice",
      "column": "RM_CreateInvoice",
      "url": "/sws/neo/returns/customerReturn/{id}/action/rMCreateInvoice",
      "processId": "FF80808133362F6A013336781FCE0066",
      "processType": "classic"
    },
    {
      "entity": "customerReturn",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/returns/customerReturn/{id}/action/processNow",
      "processId": "104",
      "processType": "classic"
    },
    {
      "entity": "customerReturn",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/returns/customerReturn/{id}/action/copyFrom",
      "processId": "211",
      "processType": "classic"
    },
    {
      "entity": "customerReturn",
      "field": "generateTemplate",
      "column": "Generatetemplate",
      "url": "/sws/neo/returns/customerReturn/{id}/action/generateTemplate",
      "processId": "800022",
      "processType": "classic"
    },
    {
      "entity": "customerReturn",
      "field": "copyFromPO",
      "column": "CopyFromPO",
      "url": "/sws/neo/returns/customerReturn/{id}/action/copyFromPO",
      "processId": "8B81D80B06364566B87853FEECAB5DE0",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/returns/customerReturn/{id}/action/posted",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/returns/customerReturn/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "customerReturn",
      "field": "cancelandreplace",
      "column": "Cancelandreplace",
      "url": "/sws/neo/returns/customerReturn/{id}/action/cancelandreplace",
      "processId": "A2FAF49712D1445ABE750315CE1B473A",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "confirmcancelandreplace",
      "column": "Confirmcancelandreplace",
      "url": "/sws/neo/returns/customerReturn/{id}/action/confirmcancelandreplace",
      "processId": "0C2AFAEFB67B4CB8A1429195EB119A49",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "createOrder",
      "column": "Convertquotation",
      "url": "/sws/neo/returns/customerReturn/{id}/action/createOrder",
      "processId": "A3FE1F9892394386A49FB707AA50A0FA",
      "processType": "classic"
    },
    {
      "entity": "customerReturn",
      "field": "createPOLines",
      "column": "Create_POLines",
      "url": "/sws/neo/returns/customerReturn/{id}/action/createPOLines",
      "processId": "6995A4C2592D434A9E16B71E1694CBCA",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "aPRMAddPayment",
      "column": "EM_APRM_AddPayment",
      "url": "/sws/neo/returns/customerReturn/{id}/action/aPRMAddPayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "rMPickfromreceipt",
      "column": "RM_Pickfromreceipt",
      "url": "/sws/neo/returns/customerReturn/{id}/action/rMPickfromreceipt",
      "processId": "A2C19D0EF6594D14A64BC62E99A89CC3",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/returns/customerReturn/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturn",
      "field": "eTPRRemovePayment",
      "column": "EM_Etpr_Remove_Payment",
      "url": "/sws/neo/returns/customerReturn/{id}/action/eTPRRemovePayment",
      "processId": "D2923463223C4F1EADE335D22B9D8FE8",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturnLine",
      "field": "selectOrderLine",
      "column": "Relate_Orderline",
      "url": "/sws/neo/returns/customerReturnLine/{id}/action/selectOrderLine",
      "processId": "C4265E27C8134096B49DFBF69369DFC6",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturnLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/returns/customerReturnLine/{id}/action/explode",
      "processId": "DFC78024B1F54CBB95DC73425BA6687F",
      "processType": "classic"
    },
    {
      "entity": "customerReturnLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/returns/customerReturnLine/{id}/action/managePrereservation",
      "processId": "70E42AD47E5F4698A9ACCCAF3EB72B9E",
      "processType": "obuiapp"
    },
    {
      "entity": "customerReturnLine",
      "field": "manageReservation",
      "column": "Manage_Reservation",
      "url": "/sws/neo/returns/customerReturnLine/{id}/action/manageReservation",
      "processId": "5F547560D3DE401AA0B570F22E2C6C06",
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
    "category": "sales"
  }
};

// @sf-generated-start component:CustomerReturnPage
export default function CustomerReturnPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="customerReturn"
        detailEntity="customerReturnLine"
        Form={CustomerReturnForm}
        DetailTable={CustomerReturnLineTable}
        DetailForm={CustomerReturnLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Customer Return"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        documentPreview={{ titlePrefix: 'Return', pdfUrl: null }}
        hideDeleteWhenComplete
        notesField="description"
        customTabs={[{ key: 'related', labelKey: 'relatedDocuments', Component: RelatedDocuments }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Order", config: {} } }]}
        bottomSection={ReturnFromCustomerBottomPanel}
        requiredHeaderFields={requiredHeaderFields}
        lineConfig={RETURN_ORDER_LINE_CONFIG}
        linesLayout="inlineEditable"
        sendDocument
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="customerReturn"
      Table={CustomerReturnTable}
      entityLabel="Returns"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="orderDate"
      rowQuickActions={{}}
      sendDocument
      {...props}
    />
  );
}
// @sf-generated-end component:CustomerReturnPage
