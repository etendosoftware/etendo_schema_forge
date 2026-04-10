import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import ProductCategoryTable from './ProductCategoryTable';
import ProductCategoryForm from './ProductCategoryForm';
import AssignedProductsTable from './AssignedProductsTable';
import AssignedProductsForm from './AssignedProductsForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Inventory / Product Category';


// @sf-generated-start summary:productCategory
const summary = [

];

const statusField = null;
// @sf-generated-end summary:productCategory

// @sf-generated-start extraBadges:productCategory
const extraBadges = [];
// @sf-generated-end extraBadges:productCategory

// @sf-generated-start processes:productCategory
const processes = [

];
// @sf-generated-end processes:productCategory

// @sf-generated-start draftMode:productCategory
const draftMode = null;
// @sf-generated-end draftMode:productCategory

// @sf-generated-start addLineFields:assignedProducts
const addLineFields = {
  entry: [

  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:assignedProducts

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

// @sf-generated-start component:ProductCategoryPage
export default function ProductCategoryPage({ windowName, recordId, ...props }) {
  
  if (recordId) {
    return (
      <DetailView
        entity="productCategory"
        detailEntity="assignedProducts"
        Form={ProductCategoryForm}
        DetailTable={AssignedProductsTable}
        DetailForm={AssignedProductsForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Product Category"
        detailLabel="Assigned Products"
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
      entity="productCategory"
      Table={ProductCategoryTable}
      entityLabel="Product Category"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:ProductCategoryPage
