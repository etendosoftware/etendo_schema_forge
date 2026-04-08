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
];

const statusField = 'documentStatus';
// @sf-generated-end summary:goodsReceipt

// @sf-custom-slot extraBadges:goodsReceipt
// @sf-generated-start extraBadges:goodsReceipt
const extraBadges = [];
// @sf-generated-end extraBadges:goodsReceipt

// @sf-generated-start processes:goodsReceipt
const processes = [

];
// @sf-generated-end processes:goodsReceipt

// @sf-generated-start draftMode:goodsReceipt
const draftMode = null;
// @sf-generated-end draftMode:goodsReceipt

// @sf-generated-start addLineFields:goodsReceiptLine
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID', type: 'text', label: 'Attribute Set Value' },
    { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, label: 'Movement Quantity' },
    { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', label: 'Storage Bin', reference: 'Locator', inputMode: 'selector' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [

  ],
  hidden: [
    { key: 'lineNo', value: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_InOutLine WHERE M_InOut_ID=@M_InOut_ID@' },
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
    },
    {
      "entity": "landedCost",
      "field": "processMatching",
      "column": "Process_Matching",
      "url": "/sws/neo/goods-receipt/landedCost/{id}/action/processMatching",
      "processId": "24E052E6FEB64295B64E683B5196230B",
      "processType": "obuiapp"
    },
    {
      "entity": "landedCost",
      "field": "cancelMatching",
      "column": "Cancel_Matching",
      "url": "/sws/neo/goods-receipt/landedCost/{id}/action/cancelMatching",
      "processId": "DDB20065809843FF92835E59ADB2234C",
      "processType": "obuiapp"
    },
    {
      "entity": "landedCost",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/goods-receipt/landedCost/{id}/action/posted",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
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
      entityLabel="Goods Receipt"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:GoodsReceiptPage

// @sf-custom-slot section:GoodsReceiptPage-custom
