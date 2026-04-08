import InventoryPage from './InventoryPage';

const windowMeta = { category: 'warehouse', name: 'Physical Inventory' };

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

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  // @sf-custom-slot hooks:App
  return <InventoryPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
