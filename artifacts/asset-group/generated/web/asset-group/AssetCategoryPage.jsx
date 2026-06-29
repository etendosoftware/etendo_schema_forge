import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';
import AssetCategoryTable from './AssetCategoryTable';
import AssetCategoryForm from './AssetCategoryForm';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Asset Group';


// @sf-generated-start summary:assetCategory
const summary = [

];

const statusField = null;
// @sf-generated-end summary:assetCategory

// @sf-generated-start extraBadges:assetCategory
const extraBadges = [

];
// @sf-generated-end extraBadges:assetCategory

// @sf-generated-start processes:assetCategory
const processes = [

];
// @sf-generated-end processes:assetCategory

// @sf-generated-start draftMode:assetCategory
const draftMode = null;
// @sf-generated-end draftMode:assetCategory

// @sf-generated-start requiredHeaderFields:assetCategory
const requiredHeaderFields = ['name', 'depreciate', 'depreciationType', 'calculateType', 'amortize'];
// @sf-generated-end requiredHeaderFields:assetCategory



export const api = {
  "specName": "asset-group",
  "baseUrl": "/sws/neo/asset-group",
  "crud": {
    "assetCategory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/asset-group/assetCategory",
      "detailUrl": "/sws/neo/asset-group/assetCategory/{id}",
      "supportedFilters": []
    },
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/asset-group/accounting",
      "detailUrl": "/sws/neo/asset-group/accounting/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "accounting",
      "field": "accumulatedDepreciation",
      "column": "A_Accumdepreciation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/asset-group/accounting/selectors/accumulatedDepreciation"
    },
    {
      "entity": "accounting",
      "field": "depreciation",
      "column": "A_Depreciation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/asset-group/accounting/selectors/depreciation"
    }
  ],
  "actions": [
    {
      "entity": "accounting",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/asset-group/accounting/{id}/action/processNow",
      "processId": "800136",
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
    "category": "finance"
  }
};

// @sf-generated-start component:AssetCategoryPage
export default function AssetCategoryPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="assetCategory"
        Form={AssetCategoryForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Asset Category"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'accounting', label: 'Accounting', Table: AccountingTable, Form: AccountingForm },
        ]}
        hidePrint
        noHeaderBorder
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "A_Asset_Group", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        linesLayout="inlineEditable"
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="assetCategory"
      Table={AssetCategoryTable}
      entityLabel="Asset Group"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      hideLink
      SortIconComponent={SortIcon}
      RefreshIconComponent={RefreshIcon}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:AssetCategoryPage
