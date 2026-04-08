import ProductPage from './ProductPage';

const windowMeta = { category: 'reference', name: 'Product' };

const api = {
  "specName": "product",
  "baseUrl": "/sws/neo/product",
  "crud": {
    "product": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/product",
      "detailUrl": "/sws/neo/product/product/{id}",
      "supportedFilters": [
        "searchKey",
        "name",
        "productCategory",
        "productType",
        "uPCEAN"
      ]
    },
    "productPrice": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/productPrice",
      "detailUrl": "/sws/neo/product/productPrice/{id}",
      "supportedFilters": []
    },
    "productBom": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/productBom",
      "detailUrl": "/sws/neo/product/productBom/{id}",
      "supportedFilters": []
    },
    "costing": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/costing",
      "detailUrl": "/sws/neo/product/costing/{id}",
      "supportedFilters": []
    },
    "transaction": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/transaction",
      "detailUrl": "/sws/neo/product/transaction/{id}",
      "supportedFilters": []
    },
    "productCharacteristic": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/productCharacteristic",
      "detailUrl": "/sws/neo/product/productCharacteristic/{id}",
      "supportedFilters": []
    },
    "storageDetail": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/storageDetail",
      "detailUrl": "/sws/neo/product/storageDetail/{id}",
      "supportedFilters": []
    },
    "productAum": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/productAum",
      "detailUrl": "/sws/neo/product/productAum/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "product",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/uOM"
    },
    {
      "entity": "product",
      "field": "productCategory",
      "column": "M_Product_Category_ID",
      "reference": "ProductCategory",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/productCategory"
    },
    {
      "entity": "product",
      "field": "taxCategory",
      "column": "C_TaxCategory_ID",
      "reference": "TaxCategory",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/taxCategory"
    },
    {
      "entity": "product",
      "field": "uOMForWeight",
      "column": "C_Uom_Weight_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/uOMForWeight"
    },
    {
      "entity": "product",
      "field": "attributeSet",
      "column": "M_AttributeSet_ID",
      "reference": "AttributeSet",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/attributeSet"
    },
    {
      "entity": "product",
      "field": "brand",
      "column": "M_Brand_ID",
      "reference": "Brand",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/brand"
    },
    {
      "entity": "product",
      "field": "mProductStatusID",
      "column": "M_Product_Status_ID",
      "reference": "ProductStatus",
      "inputMode": "selector",
      "url": "/sws/neo/product/product/selectors/mProductStatusID"
    },
    {
      "entity": "productPrice",
      "field": "priceListVersion",
      "column": "M_PriceList_Version_ID",
      "reference": "PriceListVersion",
      "inputMode": "selector",
      "url": "/sws/neo/product/productPrice/selectors/priceListVersion"
    },
    {
      "entity": "productBom",
      "field": "bOMProduct",
      "column": "M_ProductBOM_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/product/productBom/selectors/bOMProduct"
    },
    {
      "entity": "costing",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "selector",
      "url": "/sws/neo/product/costing/selectors/warehouse"
    },
    {
      "entity": "costing",
      "field": "cCurrencyID",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/product/costing/selectors/cCurrencyID"
    },
    {
      "entity": "transaction",
      "field": "organization",
      "column": "AD_Org_ID",
      "reference": "Organization",
      "inputMode": "selector",
      "url": "/sws/neo/product/transaction/selectors/organization"
    },
    {
      "entity": "transaction",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "StorageBin",
      "inputMode": "selector",
      "url": "/sws/neo/product/transaction/selectors/storageBin"
    },
    {
      "entity": "transaction",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/transaction/selectors/uOM"
    },
    {
      "entity": "productCharacteristic",
      "field": "characteristic",
      "column": "M_Characteristic_ID",
      "reference": "Characteristic",
      "inputMode": "selector",
      "url": "/sws/neo/product/productCharacteristic/selectors/characteristic"
    },
    {
      "entity": "productCharacteristic",
      "field": "characteristicSubset",
      "column": "M_Ch_Subset_ID",
      "reference": "CharacteristicSubset",
      "inputMode": "selector",
      "url": "/sws/neo/product/productCharacteristic/selectors/characteristicSubset"
    },
    {
      "entity": "storageDetail",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "StorageBin",
      "inputMode": "selector",
      "url": "/sws/neo/product/storageDetail/selectors/storageBin"
    },
    {
      "entity": "storageDetail",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/storageDetail/selectors/uOM"
    },
    {
      "entity": "productAum",
      "field": "uOM",
      "column": "C_Uom_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/productAum/selectors/uOM"
    }
  ],
  "actions": [
    {
      "entity": "product",
      "field": "manageVariants",
      "column": "ManageVariants",
      "url": "/sws/neo/product/product/{id}/action/manageVariants"
    },
    {
      "entity": "product",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/product/product/{id}/action/processNow"
    },
    {
      "entity": "product",
      "field": "createVariants",
      "column": "CreateVariants",
      "url": "/sws/neo/product/product/{id}/action/createVariants"
    },
    {
      "entity": "product",
      "field": "updateInvariants",
      "column": "Updateinvariants",
      "url": "/sws/neo/product/product/{id}/action/updateInvariants"
    },
    {
      "entity": "product",
      "field": "relateprodcattoservice",
      "column": "Relateprodcattoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodcattoservice"
    },
    {
      "entity": "product",
      "field": "relateprodtoservice",
      "column": "Relateprodtoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodtoservice"
    },
    {
      "entity": "product",
      "field": "relateprodcattaxtoservice",
      "column": "Relateprodcattaxtoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodcattaxtoservice"
    },
    {
      "entity": "product",
      "field": "copyservicemodifytaxconfig",
      "column": "Copyservicemodifytaxconfig",
      "url": "/sws/neo/product/product/{id}/action/copyservicemodifytaxconfig"
    },
    {
      "entity": "transaction",
      "field": "manualcostadjustment",
      "column": "Manualcostadjustment",
      "url": "/sws/neo/product/transaction/{id}/action/manualcostadjustment"
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
      "example": "_sortBy=productDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  // @sf-custom-slot hooks:App
  return <ProductPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
