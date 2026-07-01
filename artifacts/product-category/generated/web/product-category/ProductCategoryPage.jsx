import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import ProductCategoryTable from './ProductCategoryTable';
import ProductCategoryForm from './ProductCategoryForm';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Inventory / Product Category';


// @sf-generated-start summary:productCategory
const summary = [

];

const statusField = null;
// @sf-generated-end summary:productCategory

// @sf-generated-start extraBadges:productCategory
const extraBadges = [

];
// @sf-generated-end extraBadges:productCategory

// @sf-generated-start processes:productCategory
const processes = [

];
// @sf-generated-end processes:productCategory

// @sf-generated-start draftMode:productCategory
const draftMode = null;
// @sf-generated-end draftMode:productCategory

// @sf-generated-start requiredHeaderFields:productCategory
const requiredHeaderFields = ['searchKey', 'name', 'default', 'summaryLevel'];
// @sf-generated-end requiredHeaderFields:productCategory

// @sf-generated-start addLineFields:accounting
const addLineFields = {
  entry: [
    { key: 'fixedAsset', column: 'P_Asset_Acct', type: 'selector', required: true, label: 'Product Asset', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'productExpense', column: 'P_Expense_Acct', type: 'selector', required: true, label: 'Product Expense', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'productRevenue', column: 'P_Revenue_Acct', type: 'selector', required: true, label: 'Product Revenue', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'productCOGS', column: 'P_Cogs_Acct', type: 'selector', required: true, label: 'Product COGS', reference: 'ValidCombination', inputMode: 'selector' },
  ],
  derived: [

  ],
  hidden: [
    { key: 'accountingSchema', fromSibling: 'accountingSchema' },
  ],
};
// @sf-generated-end addLineFields:accounting

export const api = {
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
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/product-category/accounting",
      "detailUrl": "/sws/neo/product-category/accounting/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "accounting",
      "field": "fixedAsset",
      "column": "P_Asset_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/product-category/accounting/selectors/fixedAsset"
    },
    {
      "entity": "accounting",
      "field": "productExpense",
      "column": "P_Expense_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/product-category/accounting/selectors/productExpense"
    },
    {
      "entity": "accounting",
      "field": "productRevenue",
      "column": "P_Revenue_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/product-category/accounting/selectors/productRevenue"
    },
    {
      "entity": "accounting",
      "field": "productCOGS",
      "column": "P_Cogs_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/product-category/accounting/selectors/productCOGS"
    }
  ],
  "actions": [
    {
      "entity": "accounting",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/product-category/accounting/{id}/action/processNow",
      "processId": "140",
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
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "inventory"
  }
};

// @sf-generated-start component:ProductCategoryPage
export default function ProductCategoryPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="productCategory"
        detailEntity="accounting"
        Form={ProductCategoryForm}
        DetailTable={AccountingTable}
        DetailForm={AccountingForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Product Category"
        detailLabel="Accounting"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        noHeaderBorder
        toolbarBorderBottom
        whiteFormBackground
        autoSaveOnBlur
        tabsBarPaddingX="px-2"
        toolbarPaddingX="px-2"
        formCardPadding="p-2"
        formScrollPaddingX="px-2"
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "M_Product_Category", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        addLineGuard={(_, children) => children.length < 1}
        linesLayout="inlineEditable"
        {...props}
      />
      </>
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
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideLink
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:ProductCategoryPage
