import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import GoodsReceiptTable from './GoodsReceiptTable';
import GoodsReceiptForm from './GoodsReceiptForm';
import GoodsReceiptLineTable from './GoodsReceiptLineTable';
import GoodsReceiptLineForm from './GoodsReceiptLineForm';
import RelatedDocuments from '@/windows/custom/goods-receipt/RelatedDocuments';
import GoodsReceiptBottomPanel from '../../../custom/GoodsReceiptBottomPanel';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Goods Receipt';


// @sf-generated-start summary:goodsReceipt
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:goodsReceipt

// @sf-generated-start extraBadges:goodsReceipt
const extraBadges = [];
// @sf-generated-end extraBadges:goodsReceipt

// @sf-generated-start processes:goodsReceipt
const processes = [

];
// @sf-generated-end processes:goodsReceipt

// @sf-generated-start draftMode:goodsReceipt
const draftMode = {
  "enabled": true,
  "processField": "documentAction",
  "processValue": "CO",
  "label": "Confirmar"
};
// @sf-generated-end draftMode:goodsReceipt

// @sf-generated-start requiredHeaderFields:goodsReceipt
const requiredHeaderFields = ['documentNo', 'warehouse', 'businessPartner', 'partnerAddress', 'movementDate'];
// @sf-generated-end requiredHeaderFields:goodsReceipt

// @sf-generated-start addLineFields:goodsReceiptLine
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', label: 'Attribute Set Value' },
    { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, label: 'Movement Quantity', defaultValue: 0 },
    { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', reference: 'Locator', inputMode: 'selector', defaultValue: '@OnHandLocatorDefault@' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [

  ],
  hidden: [
    { key: 'invoiceQuantity', value: '0' },
  ],
};
// @sf-generated-end addLineFields:goodsReceiptLine

export const api = {
  "specName": "goods-receipt",
  "baseUrl": "/sws/neo/goods-receipt",
  "crud": {
    "goodsReceipt": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-receipt/goodsReceipt",
      "detailUrl": "/sws/neo/goods-receipt/goodsReceipt/{id}",
      "supportedFilters": [
        "documentNo",
        "businessPartner",
        "movementDate",
        "orderReference",
        "documentStatus"
      ]
    },
    "goodsReceiptLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-receipt/goodsReceiptLine",
      "detailUrl": "/sws/neo/goods-receipt/goodsReceiptLine/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "goodsReceipt",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/warehouse"
    },
    {
      "entity": "goodsReceipt",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/businessPartner"
    },
    {
      "entity": "goodsReceipt",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/partnerAddress"
    },
    {
      "entity": "goodsReceipt",
      "field": "salesOrder",
      "column": "C_Order_ID",
      "reference": "Order",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/salesOrder"
    },
    {
      "entity": "goodsReceipt",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/project"
    },
    {
      "entity": "goodsReceipt",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/costcenter"
    },
    {
      "entity": "goodsReceipt",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/asset"
    },
    {
      "entity": "goodsReceipt",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/stDimension"
    },
    {
      "entity": "goodsReceipt",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceipt/selectors/ndDimension"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/product"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "operativeUOM",
      "column": "C_Aum",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/operativeUOM"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/uOM"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/storageBin"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "salesOrderLine",
      "column": "C_OrderLine_ID",
      "reference": "OrderLine",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/salesOrderLine"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/businessPartner"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/project"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/costcenter"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/asset"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/stDimension"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/selectors/ndDimension"
    }
  ],
  "actions": [
    {
      "entity": "goodsReceipt",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/createLinesFrom"
    },
    {
      "entity": "goodsReceipt",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/generateTo",
      "processId": "154",
      "processType": "classic"
    },
    {
      "entity": "goodsReceipt",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/documentAction",
      "processId": "109",
      "processType": "classic"
    },
    {
      "entity": "goodsReceipt",
      "field": "processGoodsJava",
      "column": "Process_Goods_Java",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/processGoodsJava",
      "processId": "49DEE812BF0545269781FCEBF2235924",
      "processType": "classic"
    },
    {
      "entity": "goodsReceipt",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/posted"
    },
    {
      "entity": "goodsReceipt",
      "field": "calculateFreight",
      "column": "Calculate_Freight",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/calculateFreight",
      "processId": "800141",
      "processType": "classic"
    },
    {
      "entity": "goodsReceipt",
      "field": "receiveMaterials",
      "column": "RM_Receipt_PickEdit",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/receiveMaterials",
      "processId": "5E9F9D7EECC24E4FBB2C60840FF613BE",
      "processType": "obuiapp"
    },
    {
      "entity": "goodsReceipt",
      "field": "updateLines",
      "column": "UpdateLines",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/updateLines",
      "processId": "800010",
      "processType": "classic"
    },
    {
      "entity": "goodsReceipt",
      "field": "sendMaterials",
      "column": "RM_Shipment_Pickedit",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/sendMaterials",
      "processId": "4AD70293357245AB96E59C2CDB43A35D",
      "processType": "obuiapp"
    },
    {
      "entity": "goodsReceipt",
      "field": "invoicefromshipment",
      "column": "Invoicefromshipment",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/invoicefromshipment",
      "processId": "62250E8866EA4D96A66C309878DC039E",
      "processType": "obuiapp"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/{id}/action/managePrereservation",
      "processId": "70E42AD47E5F4698A9ACCCAF3EB72B9E",
      "processType": "obuiapp"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/{id}/action/explode",
      "processId": "DAE719940FE9463F8A3E3C401BBAFC53",
      "processType": "classic"
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
  }
};

// @sf-generated-start component:GoodsReceiptPage
export default function GoodsReceiptPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="goodsReceipt"
        detailEntity="goodsReceiptLine"
        Form={GoodsReceiptForm}
        DetailTable={GoodsReceiptLineTable}
        DetailForm={GoodsReceiptLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Goods Receipt"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
        bottomSection={GoodsReceiptBottomPanel}
        draftMode={draftMode}
        requiredHeaderFields={requiredHeaderFields}
        linesLayout="inlineEditable"
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="goodsReceipt"
      Table={GoodsReceiptTable}
      entityLabel="Goods Receipt"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="movementDate"
      {...props}
    />
  );
}
// @sf-generated-end component:GoodsReceiptPage
