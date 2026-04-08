import { ListView, DetailView } from '@/components/contract-ui';
import InventoryTable from './InventoryTable';
import InventoryForm from './InventoryForm';
import InventoryLineTable from './InventoryLineTable';
import InventoryLineForm from './InventoryLineForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Warehouse / Physical Inventory';

// @sf-generated-start summary:inventory
const summary = [
  { key: 'inventoryType', column: 'Inventory_Type', type: 'enum' },
];

const statusField = null;
// @sf-generated-end summary:inventory

// @sf-custom-slot extraBadges:inventory
// @sf-generated-start extraBadges:inventory
const extraBadges = [];
// @sf-generated-end extraBadges:inventory

// @sf-generated-start processes:inventory
const processes = [
  { name: 'generateList', label: 'Create Inventory Count List', style: 'positive', displayLogicRaw: '@Processed@=\'N\'' },
  { name: 'updateQuantities', label: 'Update Quantity', style: 'positive', displayLogicRaw: '@Processed@=\'N\'' },
];
// @sf-generated-end processes:inventory

// @sf-generated-start draftMode:inventory
const draftMode = null;
// @sf-generated-end draftMode:inventory

// @sf-generated-start addLineFields:inventoryLine
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.' },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'storageBin', column: 'M_Locator_ID', type: 'search', required: true, label: 'Storage Bin', reference: 'Locator', inputMode: 'search' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'quantityCount', column: 'QtyCount', type: 'number', required: true, label: 'User Count' },
  ],
  derived: [
    { key: 'cost', column: 'Cost', type: 'number', label: 'Cost' },
  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:inventoryLine

const api = {
  "specName": "physical-inventory",
  "baseUrl": "/sws/neo/physical-inventory",
  "crud": {
    "inventory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/physical-inventory/inventory",
      "detailUrl": "/sws/neo/physical-inventory/inventory/{id}",
      "supportedFilters": [
        "movementDate",
        "warehouse",
        "inventoryType"
      ]
    },
    "inventoryLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/physical-inventory/inventoryLine",
      "detailUrl": "/sws/neo/physical-inventory/inventoryLine/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "inventory",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/physical-inventory/inventory/selectors/warehouse"
    },
    {
      "entity": "inventory",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/physical-inventory/inventory/selectors/project"
    },
    {
      "entity": "inventoryLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/physical-inventory/inventoryLine/selectors/product"
    },
    {
      "entity": "inventoryLine",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "inputMode": "search",
      "url": "/sws/neo/physical-inventory/inventoryLine/selectors/storageBin"
    },
    {
      "entity": "inventoryLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/physical-inventory/inventoryLine/selectors/uOM"
    }
  ],
  "actions": [
    {
      "entity": "inventory",
      "field": "generateList",
      "column": "GenerateList",
      "url": "/sws/neo/physical-inventory/inventory/{id}/action/generateList",
      "processId": "105",
      "processType": "classic"
    },
    {
      "entity": "inventory",
      "field": "updateQuantities",
      "column": "UpdateQty",
      "url": "/sws/neo/physical-inventory/inventory/{id}/action/updateQuantities",
      "processId": "106",
      "processType": "classic"
    },
    {
      "entity": "inventory",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/physical-inventory/inventory/{id}/action/processNow",
      "processId": "107",
      "processType": "classic"
    },
    {
      "entity": "inventory",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/physical-inventory/inventory/{id}/action/posted"
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
      "example": "_sortBy=physical-inventoryDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:InventoryPage
export default function InventoryPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:InventoryPage
  if (recordId) {
    return (
      <DetailView
        entity="inventory"
        detailEntity="inventoryLine"
        Form={InventoryForm}
        DetailTable={InventoryLineTable}
        DetailForm={InventoryLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Inventory"
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
      entity="inventory"
      Table={InventoryTable}
      entityLabel="Inventories"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:InventoryPage

// @sf-custom-slot section:InventoryPage-custom
