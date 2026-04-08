import AssetsPage from './AssetsPage';

const windowMeta = { category: 'accounting', name: 'Assets' };

const api = {
  "specName": "assets",
  "baseUrl": "/sws/neo/assets",
  "crud": {
    "assets": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/assets/assets",
      "detailUrl": "/sws/neo/assets/assets/{id}",
      "supportedFilters": [
        "searchKey",
        "name",
        "assetCategory",
        "depreciate",
        "fullyDepreciated"
      ]
    },
    "amortizationLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/assets/amortizationLine",
      "detailUrl": "/sws/neo/assets/amortizationLine/{id}",
      "supportedFilters": []
    },
    "assetAcct": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/assets/assetAcct",
      "detailUrl": "/sws/neo/assets/assetAcct/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "assets",
      "field": "assetCategory",
      "column": "A_Asset_Group_ID",
      "reference": "AssetGroup",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assets/selectors/assetCategory"
    },
    {
      "entity": "assets",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assets/selectors/currency"
    },
    {
      "entity": "assets",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/assets/assets/selectors/product"
    },
    {
      "entity": "assets",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/assets/assets/selectors/project"
    },
    {
      "entity": "amortizationLine",
      "field": "amortization",
      "column": "A_Amortization_ID",
      "reference": "Amortization",
      "inputMode": "search",
      "url": "/sws/neo/assets/amortizationLine/selectors/amortization"
    },
    {
      "entity": "amortizationLine",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/assets/amortizationLine/selectors/currency"
    },
    {
      "entity": "assetAcct",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assetAcct/selectors/accountingSchema"
    },
    {
      "entity": "assetAcct",
      "field": "accumulatedDepreciation",
      "column": "A_Accumdepreciation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assetAcct/selectors/accumulatedDepreciation"
    },
    {
      "entity": "assetAcct",
      "field": "depreciation",
      "column": "A_Depreciation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/assets/assetAcct/selectors/depreciation"
    }
  ],
  "actions": [
    {
      "entity": "assets",
      "field": "processed",
      "column": "Processed",
      "url": "/sws/neo/assets/assets/{id}/action/processed",
      "processId": "800125",
      "processType": "classic"
    },
    {
      "entity": "assets",
      "field": "processAsset",
      "column": "Process_Asset",
      "url": "/sws/neo/assets/assets/{id}/action/processAsset",
      "processId": "85601427EAEE401FA0250FF0A6DD62EF",
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
      "example": "_sortBy=assetsDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  // @sf-custom-slot hooks:App
  return <AssetsPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
