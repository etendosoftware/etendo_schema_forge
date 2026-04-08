import { ListView, DetailView } from '@/components/contract-ui';
import GoodsReceiptTable from './GoodsReceiptTable';
import GoodsReceiptForm from './GoodsReceiptForm';
import GoodsReceiptLineTable from './GoodsReceiptLineTable';
import GoodsReceiptLineForm from './GoodsReceiptLineForm';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import LandedCostTable from './LandedCostTable';
import LandedCostForm from './LandedCostForm';
import catalogs from './mockCatalogs';

const breadcrumb = 'Purchases / Goods Receipt';

// @sf-generated-start summary:goodsReceipt
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'salesOrder', column: 'C_Order_ID', type: 'string' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'status' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:goodsReceipt

// @sf-generated-start processes:goodsReceipt
const processes = [

];
// @sf-generated-end processes:goodsReceipt

// @sf-generated-start addLineFields:goodsReceiptLine
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, lookup: true },
    { key: 'product', column: 'M_Product_ID', type: 'search', reference: 'Product', inputMode: 'search' },
    { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text' },
    { key: 'operativeQuantity', column: 'Aumqty', type: 'text' },
    { key: 'operativeUOM', column: 'C_Aum', type: 'selector', reference: 'UOM', inputMode: 'selector' },
    { key: 'movementQuantity', column: 'MovementQty', type: 'text', required: true },
    { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', reference: 'Locator', inputMode: 'selector' },
    { key: 'description', column: 'Description', type: 'textarea' },
    { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', reference: 'BusinessPartner', inputMode: 'search' },
    { key: 'project', column: 'C_Project_ID', type: 'search', reference: 'Project', inputMode: 'search' },
    { key: 'asset', column: 'A_Asset_ID', type: 'selector', reference: 'Asset', inputMode: 'selector' },
    { key: 'stDimension', column: 'User1_ID', type: 'selector', reference: 'UserDimension1', inputMode: 'selector' },
    { key: 'ndDimension', column: 'User2_ID', type: 'selector', reference: 'UserDimension2', inputMode: 'selector' },
  ],
  derived: [
    { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', reference: 'CostCenter', inputMode: 'selector' },
  ],
};
// @sf-generated-end addLineFields:goodsReceiptLine

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
    },
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-receipt/accounting",
      "detailUrl": "/sws/neo/goods-receipt/accounting/{id}",
      "supportedFilters": []
    },
    "landedCost": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-receipt/landedCost",
      "detailUrl": "/sws/neo/goods-receipt/landedCost/{id}",
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
    },
    {
      "entity": "accounting",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/accounting/selectors/accountingSchema"
    },
    {
      "entity": "accounting",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/accounting/selectors/currency"
    },
    {
      "entity": "accounting",
      "field": "period",
      "column": "C_Period_ID",
      "reference": "Period",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/accounting/selectors/period"
    },
    {
      "entity": "accounting",
      "field": "account",
      "column": "Account_ID",
      "url": "/sws/neo/goods-receipt/accounting/selectors/account"
    },
    {
      "entity": "accounting",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/accounting/selectors/businessPartner"
    },
    {
      "entity": "accounting",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/goods-receipt/accounting/selectors/product"
    },
    {
      "entity": "accounting",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/accounting/selectors/project"
    },
    {
      "entity": "accounting",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/accounting/selectors/costcenter"
    },
    {
      "entity": "accounting",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/accounting/selectors/asset"
    },
    {
      "entity": "accounting",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "User1",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/accounting/selectors/stDimension"
    },
    {
      "entity": "accounting",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "User2",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/accounting/selectors/ndDimension"
    },
    {
      "entity": "landedCost",
      "field": "landedCostType",
      "column": "M_Lc_Type_ID",
      "reference": "LandedCostType",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/landedCost/selectors/landedCostType"
    },
    {
      "entity": "landedCost",
      "field": "invoiceLine",
      "column": "C_Invoiceline_ID",
      "reference": "InvoiceLine",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/landedCost/selectors/invoiceLine"
    },
    {
      "entity": "landedCost",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/landedCost/selectors/currency"
    },
    {
      "entity": "landedCost",
      "field": "landedCostDistributionAlgorithm",
      "column": "M_Lc_Distribution_Alg_ID",
      "reference": "LandedCostDistributionAlgorithm",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/landedCost/selectors/landedCostDistributionAlgorithm"
    },
    {
      "entity": "landedCost",
      "field": "landedCost",
      "column": "M_Landedcost_ID",
      "reference": "LandedCost",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/landedCost/selectors/landedCost"
    },
    {
      "entity": "landedCost",
      "field": "matchingCostAdjustment",
      "column": "Matching_Costadjustment_ID",
      "reference": "CostAdjustment",
      "inputMode": "selector",
      "url": "/sws/neo/goods-receipt/landedCost/selectors/matchingCostAdjustment"
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
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/generateTo"
    },
    {
      "entity": "goodsReceipt",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/documentAction"
    },
    {
      "entity": "goodsReceipt",
      "field": "processGoodsJava",
      "column": "Process_Goods_Java",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/processGoodsJava"
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
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/calculateFreight"
    },
    {
      "entity": "goodsReceipt",
      "field": "updateLines",
      "column": "UpdateLines",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/updateLines"
    },
    {
      "entity": "goodsReceipt",
      "field": "receiveMaterials",
      "column": "RM_Receipt_PickEdit",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/receiveMaterials"
    },
    {
      "entity": "goodsReceipt",
      "field": "sendMaterials",
      "column": "RM_Shipment_Pickedit",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/sendMaterials"
    },
    {
      "entity": "goodsReceipt",
      "field": "invoicefromshipment",
      "column": "Invoicefromshipment",
      "url": "/sws/neo/goods-receipt/goodsReceipt/{id}/action/invoicefromshipment"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/{id}/action/managePrereservation"
    },
    {
      "entity": "goodsReceiptLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/goods-receipt/goodsReceiptLine/{id}/action/explode"
    },
    {
      "entity": "landedCost",
      "field": "processMatching",
      "column": "Process_Matching",
      "url": "/sws/neo/goods-receipt/landedCost/{id}/action/processMatching"
    },
    {
      "entity": "landedCost",
      "field": "cancelMatching",
      "column": "Cancel_Matching",
      "url": "/sws/neo/goods-receipt/landedCost/{id}/action/cancelMatching"
    },
    {
      "entity": "landedCost",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/goods-receipt/landedCost/{id}/action/posted"
    },
    {
      "entity": "landedCost",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/goods-receipt/landedCost/{id}/action/processNow"
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

// @sf-generated-start component:GoodsReceiptPage
export default function GoodsReceiptPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:GoodsReceiptPage
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
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Goods Receipt"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'accounting', label: 'Accounting', Table: AccountingTable, Form: AccountingForm },
          { key: 'landedCost', label: 'Landed Cost', Table: LandedCostTable, Form: LandedCostForm },
        ]}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="goodsReceipt"
      Table={GoodsReceiptTable}
      entityLabel="Goods Receipts"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:GoodsReceiptPage

// @sf-custom-slot section:GoodsReceiptPage-custom
