import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import AssetsTable from './AssetsTable';
import AssetsForm from './AssetsForm';
import AmortizationLineTable from './AmortizationLineTable';
import AmortizationLineForm from './AmortizationLineForm';
import AssetAcctTable from './AssetAcctTable';
import AssetAcctForm from './AssetAcctForm';
import catalogs from './mockCatalogs';

import AssetsSidebar from '@/windows/custom/assets/AssetsSidebar';

const breadcrumb = 'Accounting / Assets';


// @sf-generated-start summary:assets
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = null;
// @sf-generated-end summary:assets

// @sf-custom-slot extraBadges:assets
// @sf-generated-start extraBadges:assets
const extraBadges = [];
// @sf-generated-end extraBadges:assets

// @sf-generated-start processes:assets
const processes = [

];
// @sf-generated-end processes:assets

// @sf-generated-start draftMode:assets
const draftMode = null;
// @sf-generated-end draftMode:assets

// @sf-generated-start addLineFields:amortizationLine
const addLineFields = {
  entry: [
    { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', label: 'Amortization Percentage' },
    { key: 'currency', column: 'C_Currency_ID', type: 'selector', label: 'Currency', reference: 'Currency', inputMode: 'selector' },
  ],
  derived: [
    { key: 'amortizationAmount', column: 'Amortizationamt', type: 'number', label: 'Amortization Amount' },
  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:amortizationLine

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

// @sf-generated-start component:AssetsPage
export default function AssetsPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:AssetsPage
  
  if (recordId) {
    return (
      <DetailView
        entity="assets"
        detailEntity="amortizationLine"
        Form={AssetsForm}
        DetailTable={AmortizationLineTable}
        DetailForm={AmortizationLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Assets"
        detailLabel="Asset Amortization"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'assetAcct', label: 'Accounting', Table: AssetAcctTable, Form: AssetAcctForm },
        ]}
        detailSortBy="sEQNoAsset asc"
        lockWhenProcessed={false}
        {...props}
        sidebarContent={(data) => (
          <AssetsSidebar
            recordId={recordId}
            data={data}
            token={props.token}
            apiBaseUrl={props.apiBaseUrl}
          />
        )}
      />
    );
  }

  return (
    <ListView
      entity="assets"
      Table={AssetsTable}
      entityLabel="Assets"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:AssetsPage

// @sf-custom-slot section:AssetsPage-custom
