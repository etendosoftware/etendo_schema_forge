import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import WarehouseTable from './WarehouseTable';
import WarehouseForm from './WarehouseForm';
import WarehouseTransactionsTable from '@/windows/custom/warehouse/WarehouseTransactionsTable';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Inventory / Warehouse';


// @sf-generated-start summary:warehouse
const summary = [

];

const statusField = null;
// @sf-generated-end summary:warehouse

// @sf-generated-start extraBadges:warehouse
const extraBadges = [

];
// @sf-generated-end extraBadges:warehouse

// @sf-generated-start processes:warehouse
const processes = [

];
// @sf-generated-end processes:warehouse

// @sf-generated-start draftMode:warehouse
const draftMode = null;
// @sf-generated-end draftMode:warehouse

// @sf-generated-start requiredHeaderFields:warehouse
const requiredHeaderFields = ['searchKey', 'name', 'locationAddress'];
// @sf-generated-end requiredHeaderFields:warehouse



export const api = {
  "specName": "warehouse",
  "baseUrl": "/sws/neo/warehouse",
  "crud": {
    "warehouse": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/warehouse/warehouse",
      "detailUrl": "/sws/neo/warehouse/warehouse/{id}",
      "supportedFilters": [
        "searchKey",
        "name"
      ]
    },
    "storageBin": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/warehouse/storageBin",
      "detailUrl": "/sws/neo/warehouse/storageBin/{id}",
      "supportedFilters": []
    },
    "productTransactions": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/warehouse/productTransactions",
      "detailUrl": "/sws/neo/warehouse/productTransactions/{id}",
      "supportedFilters": []
    },
    "binContents": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/warehouse/binContents",
      "detailUrl": "/sws/neo/warehouse/binContents/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "warehouse",
      "field": "locationAddress",
      "column": "C_Location_ID",
      "reference": "Location",
      "inputMode": "search",
      "url": "/sws/neo/warehouse/warehouse/selectors/locationAddress"
    },
    {
      "entity": "storageBin",
      "field": "inventoryStatus",
      "column": "M_InventoryStatus_ID",
      "reference": "InventoryStatus",
      "inputMode": "selector",
      "url": "/sws/neo/warehouse/storageBin/selectors/inventoryStatus"
    },
    {
      "entity": "productTransactions",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/warehouse/productTransactions/selectors/product"
    },
    {
      "entity": "productTransactions",
      "field": "goodsShipmentLine",
      "column": "M_InOutLine_ID",
      "reference": "InOutLine",
      "inputMode": "search",
      "url": "/sws/neo/warehouse/productTransactions/selectors/goodsShipmentLine"
    },
    {
      "entity": "productTransactions",
      "field": "physicalInventoryLine",
      "column": "M_InventoryLine_ID",
      "reference": "InventoryLine",
      "inputMode": "search",
      "url": "/sws/neo/warehouse/productTransactions/selectors/physicalInventoryLine"
    },
    {
      "entity": "productTransactions",
      "field": "movementLine",
      "column": "M_MovementLine_ID",
      "reference": "MovementLine",
      "inputMode": "search",
      "url": "/sws/neo/warehouse/productTransactions/selectors/movementLine"
    },
    {
      "entity": "productTransactions",
      "field": "productionLine",
      "column": "M_ProductionLine_ID",
      "reference": "ProductionLine",
      "inputMode": "search",
      "url": "/sws/neo/warehouse/productTransactions/selectors/productionLine"
    },
    {
      "entity": "productTransactions",
      "field": "projectIssue",
      "column": "C_ProjectIssue_ID",
      "reference": "ProjectIssue",
      "inputMode": "search",
      "url": "/sws/neo/warehouse/productTransactions/selectors/projectIssue"
    },
    {
      "entity": "binContents",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/warehouse/binContents/selectors/product"
    },
    {
      "entity": "binContents",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/warehouse/binContents/selectors/uOM"
    },
    {
      "entity": "binContents",
      "field": "orderUOM",
      "column": "M_Product_Uom_Id",
      "reference": "Product_Uom",
      "inputMode": "selector",
      "url": "/sws/neo/warehouse/binContents/selectors/orderUOM"
    },
    {
      "entity": "binContents",
      "field": "referencedInventory",
      "column": "M_RefInventory_ID",
      "reference": "RefInventory",
      "inputMode": "selector",
      "url": "/sws/neo/warehouse/binContents/selectors/referencedInventory"
    }
  ],
  "actions": [
    {
      "entity": "storageBin",
      "field": "changeStatus",
      "column": "Change_Status",
      "url": "/sws/neo/warehouse/storageBin/{id}/action/changeStatus",
      "processId": "3A4E13B0AB764F188CB062DDE2A9B685",
      "processType": "obuiapp"
    },
    {
      "entity": "productTransactions",
      "field": "manualcostadjustment",
      "column": "Manualcostadjustment",
      "url": "/sws/neo/warehouse/productTransactions/{id}/action/manualcostadjustment",
      "processId": "D395B727675C45C98320F8A40E0768E7",
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
    "category": "inventory"
  }
};

// @sf-generated-start component:WarehousePage
export default function WarehousePage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="warehouse"
        Form={WarehouseForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Warehouse"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'productTransactions', label: 'Transactions', Panel: WarehouseTransactionsTable },
        ]}
        hidePrint
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "M_Warehouse", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="warehouse"
      Table={WarehouseTable}
      entityLabel="Warehouse"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideLink
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:WarehousePage
