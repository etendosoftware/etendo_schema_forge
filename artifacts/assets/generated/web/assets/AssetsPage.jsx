import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import AssetsTable from './AssetsTable';
import AssetsForm from './AssetsForm';
import AssetsAmortizationPanel from '@/windows/custom/assets/AssetsAmortizationPanel';
import AssetsConfigPanel from '@/windows/custom/assets/AssetsConfigPanel';
import catalogs from './mockCatalogs';

import AssetsSidebar from '@/windows/custom/assets/AssetsSidebar';

const breadcrumb = 'Finance / Assets';


// @sf-generated-start summary:assets
const summary = [

];

const statusField = null;
// @sf-generated-end summary:assets

// @sf-generated-start extraBadges:assets
const extraBadges = [];
// @sf-generated-end extraBadges:assets

// @sf-generated-start processes:assets
const processes = [
  { name: 'processed', label: 'Create Amortization', style: 'positive', columnName: 'Processed' },
];
// @sf-generated-end processes:assets

// @sf-generated-start draftMode:assets
const draftMode = null;
// @sf-generated-end draftMode:assets



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
  
  if (recordId) {
    return (
      <DetailView
        entity="assets"
        Form={AssetsForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Assets"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        formFooter={AssetsAmortizationPanel}
        primaryTabs={[
          { key: 'general', label: 'Overview' },
          { key: 'configuration', label: 'Configuration', Panel: AssetsConfigPanel },
        ]}
        hidePrint
        hideMoreMenu
        hideMoreDetails
        contentBg="bg-slate-50"
        detailSortBy="sEQNoAsset asc"
        titleField="name"
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
      hidePrint
      hideMoreMenu
      hideListFilters
      hideLink
      hideEyeCount
      {...props}
    />
  );
}
// @sf-generated-end component:AssetsPage
