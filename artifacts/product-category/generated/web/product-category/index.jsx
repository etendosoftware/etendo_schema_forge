import ProductCategoryPage from './ProductCategoryPage';

const windowMeta = { category: 'inventory', name: 'Product Category' };

const api = {
  "specName": "product-category",
  "baseUrl": "/sws/neo/product-category",
  "crud": {
    "productCategory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product-category/productCategory",
      "detailUrl": "/sws/neo/product-category/productCategory/{id}",
      "supportedFilters": [
        "searchKey",
        "name"
      ]
    },
    "assignedProducts": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product-category/assignedProducts",
      "detailUrl": "/sws/neo/product-category/assignedProducts/{id}",
      "supportedFilters": [
        "searchKey",
        "name",
        "productType"
      ]
    }
  },
  "selectors": [],
  "actions": [
    {
      "entity": "assignedProducts",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/product-category/assignedProducts/{id}/action/processNow",
      "processId": "136",
      "processType": "classic"
    },
    {
      "entity": "assignedProducts",
      "field": "copyservicemodifytaxconfig",
      "column": "Copyservicemodifytaxconfig",
      "url": "/sws/neo/product-category/assignedProducts/{id}/action/copyservicemodifytaxconfig",
      "processId": "CBBD7BB6BDFE4705B68DD3D9FF788D4E",
      "processType": "obuiapp"
    },
    {
      "entity": "assignedProducts",
      "field": "createVariants",
      "column": "CreateVariants",
      "url": "/sws/neo/product-category/assignedProducts/{id}/action/createVariants",
      "processId": "3C386BC12832466790E50F2F8C5EBD85",
      "processType": "classic"
    },
    {
      "entity": "assignedProducts",
      "field": "manageVariants",
      "column": "ManageVariants",
      "url": "/sws/neo/product-category/assignedProducts/{id}/action/manageVariants",
      "processId": "FE3A8C134D41488DB3A69837BD54B56A",
      "processType": "obuiapp"
    },
    {
      "entity": "assignedProducts",
      "field": "relateprodcattaxtoservice",
      "column": "Relateprodcattaxtoservice",
      "url": "/sws/neo/product-category/assignedProducts/{id}/action/relateprodcattaxtoservice",
      "processId": "E0870062F05F4DC88E589ABC6A45DF4C",
      "processType": "obuiapp"
    },
    {
      "entity": "assignedProducts",
      "field": "relateprodcattoservice",
      "column": "Relateprodcattoservice",
      "url": "/sws/neo/product-category/assignedProducts/{id}/action/relateprodcattoservice",
      "processId": "8E5996F1F3154B498468938B5341A0CB",
      "processType": "obuiapp"
    },
    {
      "entity": "assignedProducts",
      "field": "relateprodtoservice",
      "column": "Relateprodtoservice",
      "url": "/sws/neo/product-category/assignedProducts/{id}/action/relateprodtoservice",
      "processId": "E66C669B0B01498C8EB3F99CD371CF9A",
      "processType": "obuiapp"
    },
    {
      "entity": "assignedProducts",
      "field": "updateInvariants",
      "column": "Updateinvariants",
      "url": "/sws/neo/product-category/assignedProducts/{id}/action/updateInvariants",
      "processId": "7DC2C8DC186B4C1DB18E147911950861",
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
      "example": "_sortBy=product-categoryDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ProductCategoryPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
