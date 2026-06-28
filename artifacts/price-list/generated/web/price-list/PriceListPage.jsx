import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import PriceListTable from './PriceListTable';
import PriceListForm from './PriceListForm';
import PriceListVersionTable from './PriceListVersionTable';
import PriceListVersionForm from './PriceListVersionForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Settings / Price List';


// @sf-generated-start summary:priceList
const summary = [

];

const statusField = null;
// @sf-generated-end summary:priceList

// @sf-generated-start extraBadges:priceList
const extraBadges = [

];
// @sf-generated-end extraBadges:priceList

// @sf-generated-start processes:priceList
const processes = [

];
// @sf-generated-end processes:priceList

// @sf-generated-start detailProcesses:priceListVersion
const detailProcesses = [
  { name: 'create', label: 'Create Price List', style: 'positive' },
];
// @sf-generated-end detailProcesses:priceListVersion

// @sf-generated-start draftMode:priceList
const draftMode = null;
// @sf-generated-end draftMode:priceList

// @sf-generated-start requiredHeaderFields:priceList
const requiredHeaderFields = ['name', 'currency', 'salesPriceList', 'costBasedPriceList', 'priceIncludesTax', 'default'];
// @sf-generated-end requiredHeaderFields:priceList

// @sf-generated-start addLineFields:priceListVersion
const addLineFields = {
  entry: [
    { key: 'name', column: 'Name', type: 'text', required: true, label: 'Name' },
    { key: 'validFromDate', column: 'ValidFrom', type: 'date', required: true, label: 'Valid From Date' },
    { key: 'priceListSchema', column: 'M_DiscountSchema_ID', type: 'selector', required: true, label: 'Price List Schema', reference: 'DiscountSchema', inputMode: 'selector' },
    { key: 'basePriceListVersion', column: 'M_Pricelist_Version_Base_ID', type: 'search', lookup: true, label: 'Base Version (Default)', reference: 'PriceList_Version', inputMode: 'search' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'create', column: 'ProcCreate', type: 'text', label: 'Create Price List' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:priceListVersion

export const api = {
  "specName": "price-list",
  "baseUrl": "/sws/neo/price-list",
  "crud": {
    "priceList": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/price-list/priceList",
      "detailUrl": "/sws/neo/price-list/priceList/{id}",
      "supportedFilters": [
        "name"
      ]
    },
    "priceListVersion": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/price-list/priceListVersion",
      "detailUrl": "/sws/neo/price-list/priceListVersion/{id}",
      "supportedFilters": []
    },
    "productPrice": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/price-list/productPrice",
      "detailUrl": "/sws/neo/price-list/productPrice/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "priceList",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/price-list/priceList/selectors/currency"
    },
    {
      "entity": "priceListVersion",
      "field": "priceListSchema",
      "column": "M_DiscountSchema_ID",
      "reference": "DiscountSchema",
      "inputMode": "selector",
      "url": "/sws/neo/price-list/priceListVersion/selectors/priceListSchema"
    },
    {
      "entity": "priceListVersion",
      "field": "basePriceListVersion",
      "column": "M_Pricelist_Version_Base_ID",
      "reference": "PriceList_Version",
      "inputMode": "search",
      "url": "/sws/neo/price-list/priceListVersion/selectors/basePriceListVersion"
    },
    {
      "entity": "productPrice",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "selector",
      "url": "/sws/neo/price-list/productPrice/selectors/product"
    }
  ],
  "actions": [
    {
      "entity": "priceListVersion",
      "field": "create",
      "column": "ProcCreate",
      "url": "/sws/neo/price-list/priceListVersion/{id}/action/create",
      "processId": "103",
      "processType": "classic"
    },
    {
      "entity": "priceListVersion",
      "field": "generatePriceListVersion",
      "column": "M_Pricelist_Version_Generate",
      "url": "/sws/neo/price-list/priceListVersion/{id}/action/generatePriceListVersion",
      "processId": "800069",
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
    "category": "settings"
  },
  "labelOverrides": {
    "es_ES": {
      "Name": "Nombre",
      "C_Currency_ID": "Moneda",
      "Costbased": "Basado en coste",
      "IsTaxIncluded": "Precio incluye impuesto",
      "IsDefault": "Por defecto"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:PriceListPage
export default function PriceListPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="priceList"
        detailEntity="priceListVersion"
        Form={PriceListForm}
        DetailTable={PriceListVersionTable}
        DetailForm={PriceListVersionForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        detailProcesses={detailProcesses}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Price List"
        detailLabel="Price List Version"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        hideMoreMenu
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "M_PriceList", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="priceList"
      Table={PriceListTable}
      entityLabel="Price List"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      hideMoreMenu
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:PriceListPage
