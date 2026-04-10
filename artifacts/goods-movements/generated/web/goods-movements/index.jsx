import MovementPage from './MovementPage';

const windowMeta = { category: 'inventory', name: 'Goods Movements' };

const api = {
  "specName": "goods-movements",
  "baseUrl": "/sws/neo/goods-movements",
  "crud": {
    "movement": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-movements/movement",
      "detailUrl": "/sws/neo/goods-movements/movement/{id}",
      "supportedFilters": [
        "name",
        "movementDate"
      ]
    },
    "movementLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-movements/movementLine",
      "detailUrl": "/sws/neo/goods-movements/movementLine/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "movementLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/goods-movements/movementLine/selectors/product"
    },
    {
      "entity": "movementLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/goods-movements/movementLine/selectors/uOM"
    },
    {
      "entity": "movementLine",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "inputMode": "selector",
      "url": "/sws/neo/goods-movements/movementLine/selectors/storageBin"
    },
    {
      "entity": "movementLine",
      "field": "newStorageBin",
      "column": "M_LocatorTo_ID",
      "reference": "Locator",
      "inputMode": "selector",
      "url": "/sws/neo/goods-movements/movementLine/selectors/newStorageBin"
    }
  ],
  "actions": [
    {
      "entity": "movement",
      "field": "moveBetweenLocators",
      "column": "Move_FromTo_Locator",
      "url": "/sws/neo/goods-movements/movement/{id}/action/moveBetweenLocators",
      "processId": "800048",
      "processType": "classic"
    },
    {
      "entity": "movement",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/goods-movements/movement/{id}/action/processNow",
      "processId": "122",
      "processType": "classic"
    },
    {
      "entity": "movement",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/goods-movements/movement/{id}/action/posted"
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
      "example": "_sortBy=goods-movementsDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <MovementPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
