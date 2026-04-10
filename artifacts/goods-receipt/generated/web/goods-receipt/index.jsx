import GoodsReceiptPage from './GoodsReceiptPage';

const windowMeta = { category: 'purchases', name: 'Goods Receipt' };

const api = {
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
      "field": "receiveMaterials",
      "column": "RM_Receipt_PickEdit",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/receiveMaterials",
      "processId": "5E9F9D7EECC24E4FBB2C60840FF613BE",
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
      "example": "_sortBy=goods-receiptDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  // @sf-custom-slot hooks:App
  return <GoodsReceiptPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
