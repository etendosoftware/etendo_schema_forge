import { ListView, DetailView } from '@/components/contract-ui';
import ReturnMaterialReceiptTable from './ReturnMaterialReceiptTable';
import ReturnMaterialReceiptForm from './ReturnMaterialReceiptForm';
import ReturnMaterialReceiptLineTable from './ReturnMaterialReceiptLineTable';
import ReturnMaterialReceiptLineForm from './ReturnMaterialReceiptLineForm';
import catalogs from './mockCatalogs';

const breadcrumb = 'Sales / Return Material Receipt';

// @sf-generated-start summary:returnMaterialReceipt
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'salesOrder', column: 'C_Order_ID', type: 'string' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:returnMaterialReceipt

// @sf-custom-slot extraBadges:returnMaterialReceipt
// @sf-generated-start extraBadges:returnMaterialReceipt
const extraBadges = [];
// @sf-generated-end extraBadges:returnMaterialReceipt

// @sf-generated-start processes:returnMaterialReceipt
const processes = [
  { name: 'Process Receipt', label: 'Process  Receipt', style: 'positive' },
];
// @sf-generated-end processes:returnMaterialReceipt

// @sf-generated-start addLineFields:returnMaterialReceiptLine
const addLineFields = {
  entry: [
    { key: 'description', column: 'Description', type: 'textarea', lookup: true },
  ],
  derived: [

  ],
};
// @sf-generated-end addLineFields:returnMaterialReceiptLine

const api = {
  "specName": "return-material-receipt",
  "baseUrl": "/sws/neo/return-material-receipt",
  "crud": {
    "returnMaterialReceipt": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-material-receipt/returnMaterialReceipt",
      "detailUrl": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}",
      "supportedFilters": [
        "documentNo",
        "movementDate",
        "businessPartner",
        "documentStatus"
      ]
    },
    "returnMaterialReceiptLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-material-receipt/returnMaterialReceiptLine",
      "detailUrl": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "returnMaterialReceipt",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/selectors/businessPartner"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/selectors/warehouse"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/selectors/partnerAddress"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "salesOrder",
      "column": "C_Order_ID",
      "reference": "Order",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/selectors/salesOrder"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/selectors/product"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/selectors/uOM"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "salesOrderLine",
      "column": "C_OrderLine_ID",
      "reference": "OrderLine",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/selectors/salesOrderLine"
    }
  ],
  "actions": [
    {
      "entity": "returnMaterialReceipt",
      "field": "receiveMaterials",
      "column": "RM_Receipt_PickEdit",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/receiveMaterials"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/createLinesFrom"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/documentAction"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/posted"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "calculateFreight",
      "column": "Calculate_Freight",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/calculateFreight"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "sendMaterials",
      "column": "RM_Shipment_Pickedit",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/sendMaterials"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/generateTo"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "updateLines",
      "column": "UpdateLines",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/updateLines"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "invoicefromshipment",
      "column": "Invoicefromshipment",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/invoicefromshipment"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "processGoodsJava",
      "column": "Process_Goods_Java",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/processGoodsJava"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/{id}/action/explode"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/{id}/action/managePrereservation"
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
      "example": "_sortBy=return-material-receiptDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:ReturnMaterialReceiptPage
export default function ReturnMaterialReceiptPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:ReturnMaterialReceiptPage
  if (recordId) {
    return (
      <DetailView
        entity="returnMaterialReceipt"
        detailEntity="returnMaterialReceiptLine"
        Form={ReturnMaterialReceiptForm}
        DetailTable={ReturnMaterialReceiptLineTable}
        DetailForm={ReturnMaterialReceiptLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Return Material Receipt"
        detailLabel="Lines"
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
      entity="returnMaterialReceipt"
      Table={ReturnMaterialReceiptTable}
      entityLabel="Return Material Receipts"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:ReturnMaterialReceiptPage

// @sf-custom-slot section:ReturnMaterialReceiptPage-custom
