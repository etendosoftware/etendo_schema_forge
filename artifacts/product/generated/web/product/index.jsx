import ProductPage from './ProductPage';

const windowMeta = { category: 'inventory', name: 'Product' };

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
    "price": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/price",
      "detailUrl": "/sws/neo/product/price/{id}",
      "supportedFilters": []
    },
    "priceRuleVersion": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/priceRuleVersion",
      "detailUrl": "/sws/neo/product/priceRuleVersion/{id}",
      "supportedFilters": []
    },
    "billOfMaterials": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/billOfMaterials",
      "detailUrl": "/sws/neo/product/billOfMaterials/{id}",
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
    "transactionAdjustments": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/transactionAdjustments",
      "detailUrl": "/sws/neo/product/transactionAdjustments/{id}",
      "supportedFilters": []
    },
    "transactions": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/transactions",
      "detailUrl": "/sws/neo/product/transactions/{id}",
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
    "stock": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/stock",
      "detailUrl": "/sws/neo/product/stock/{id}",
      "supportedFilters": []
    },
    "categoryPriceRuleVersion": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/categoryPriceRuleVersion",
      "detailUrl": "/sws/neo/product/categoryPriceRuleVersion/{id}",
      "supportedFilters": []
    },
    "alternateUom": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product/alternateUom",
      "detailUrl": "/sws/neo/product/alternateUom/{id}",
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
      "entity": "price",
      "field": "priceListVersion",
      "column": "M_PriceList_Version_ID",
      "reference": "PriceListVersion",
      "inputMode": "selector",
      "url": "/sws/neo/product/price/selectors/priceListVersion"
    },
    {
      "entity": "priceRuleVersion",
      "field": "servicePriceRule",
      "column": "M_Servicepricerule_ID",
      "reference": "ServicePriceRule",
      "inputMode": "selector",
      "url": "/sws/neo/product/priceRuleVersion/selectors/servicePriceRule"
    },
    {
      "entity": "billOfMaterials",
      "field": "bOMProduct",
      "column": "M_ProductBOM_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/product/billOfMaterials/selectors/bOMProduct"
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
      "entity": "transactionAdjustments",
      "field": "cCurrencyID",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactionAdjustments/selectors/cCurrencyID"
    },
    {
      "entity": "transactionAdjustments",
      "field": "costAdjustmentLine",
      "column": "M_Costadjustmentline_ID",
      "reference": "Costadjustmentline",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactionAdjustments/selectors/costAdjustmentLine"
    },
    {
      "entity": "transactions",
      "field": "organization",
      "column": "AD_Org_ID",
      "reference": "Organization",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactions/selectors/organization"
    },
    {
      "entity": "transactions",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "StorageBin",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactions/selectors/storageBin"
    },
    {
      "entity": "transactions",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/transactions/selectors/uOM"
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
      "entity": "stock",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "StorageBin",
      "inputMode": "selector",
      "url": "/sws/neo/product/stock/selectors/storageBin"
    },
    {
      "entity": "stock",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/stock/selectors/uOM"
    },
    {
      "entity": "categoryPriceRuleVersion",
      "field": "servicePriceRule",
      "column": "M_Servicepricerule_ID",
      "reference": "ServicePriceRule",
      "inputMode": "selector",
      "url": "/sws/neo/product/categoryPriceRuleVersion/selectors/servicePriceRule"
    },
    {
      "entity": "alternateUom",
      "field": "uOM",
      "column": "C_Uom_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/product/alternateUom/selectors/uOM"
    }
  ],
  "actions": [
    {
      "entity": "product",
      "field": "manageVariants",
      "column": "ManageVariants",
      "url": "/sws/neo/product/product/{id}/action/manageVariants",
      "processId": "FE3A8C134D41488DB3A69837BD54B56A",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/product/product/{id}/action/processNow",
      "processId": "136",
      "processType": "classic"
    },
    {
      "entity": "product",
      "field": "createVariants",
      "column": "CreateVariants",
      "url": "/sws/neo/product/product/{id}/action/createVariants",
      "processId": "3C386BC12832466790E50F2F8C5EBD85",
      "processType": "classic"
    },
    {
      "entity": "product",
      "field": "updateInvariants",
      "column": "Updateinvariants",
      "url": "/sws/neo/product/product/{id}/action/updateInvariants",
      "processId": "7DC2C8DC186B4C1DB18E147911950861",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "relateprodcattoservice",
      "column": "Relateprodcattoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodcattoservice",
      "processId": "8E5996F1F3154B498468938B5341A0CB",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "relateprodtoservice",
      "column": "Relateprodtoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodtoservice",
      "processId": "E66C669B0B01498C8EB3F99CD371CF9A",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "relateprodcattaxtoservice",
      "column": "Relateprodcattaxtoservice",
      "url": "/sws/neo/product/product/{id}/action/relateprodcattaxtoservice",
      "processId": "E0870062F05F4DC88E589ABC6A45DF4C",
      "processType": "obuiapp"
    },
    {
      "entity": "product",
      "field": "copyservicemodifytaxconfig",
      "column": "Copyservicemodifytaxconfig",
      "url": "/sws/neo/product/product/{id}/action/copyservicemodifytaxconfig",
      "processId": "CBBD7BB6BDFE4705B68DD3D9FF788D4E",
      "processType": "obuiapp"
    },
    {
      "entity": "transactions",
      "field": "manualcostadjustment",
      "column": "Manualcostadjustment",
      "url": "/sws/neo/product/transactions/{id}/action/manualcostadjustment",
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
      "example": "_sortBy=productDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ProductPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
