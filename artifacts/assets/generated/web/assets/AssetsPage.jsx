import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import AssetsTable from './AssetsTable';
import AssetsForm from './AssetsForm';
import AssetAcctTable from './AssetAcctTable';
import AssetAcctForm from './AssetAcctForm';
import AssetsDetailPanel from '@/windows/custom/assets/AssetsDetailPanel';
import { AttachmentsTab } from '@/components/attachments';
import AssetsAmortizationPanel from '@/windows/custom/assets/AssetsAmortizationPanel';
import catalogs from './mockCatalogs';

import AssetsSidebar from '@/windows/custom/assets/AssetsSidebar';

const breadcrumb = 'Finance / Assets';


// @sf-generated-start summary:assets
const summary = [

];

const statusField = null;
// @sf-generated-end summary:assets

// @sf-generated-start extraBadges:assets
const extraBadges = [

];
// @sf-generated-end extraBadges:assets

// @sf-generated-start processes:assets
const processes = [
  { name: 'processAsset', label: 'Create Amortization', style: 'positive',
    displayLogicRaw: "@Depreciate@='Y' AND @etgoAmortizationStatus@!='100'", requiresFieldMax: [{"field":"annualDepreciation","max":100,"conditionalOnField":"calculateType","conditionalValue":"PE","errorKey":"assetsValidationAnnualDepreciationMax"}], labelToggle: {"field":"processed","equals":"Y","label":"Recalculate Amortization"} },
];
// @sf-generated-end processes:assets

// @sf-generated-start draftMode:assets
const draftMode = null;
// @sf-generated-end draftMode:assets

// @sf-generated-start requiredHeaderFields:assets
const requiredHeaderFields = [];
// @sf-generated-end requiredHeaderFields:assets



export const api = {
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
        "depreciate"
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
      "processId": "D1E4EC58B04D4D3FA0060FF28094B39B",
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
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "finance"
  },
  "labelOverrides": {
    "es_ES": {
      "C_Project_ID": "Proyecto",
      "EM_Etadas_Costcenter_ID": "Centro de coste",
      "C_BPartner_ID": "Contacto",
      "EM_Etadas_User1_ID": "1ª Dimensión",
      "EM_Etadas_User2_ID": "2ª Dimensión",
      "EM_Etadas_Salesregion_ID": "Región de ventas",
      "EM_Etadas_C_Activity_ID": "Actividad",
      "EM_Etadas_Campaign_ID": "Campaña",
      "EM_Etgo_Amortization_Status": "Estado de amortización",
      "M_Product_ID": "Producto"
    },
    "en_US": {
      "C_Project_ID": "Project",
      "EM_Etadas_Costcenter_ID": "Cost Center",
      "C_BPartner_ID": "Business Partner",
      "EM_Etadas_User1_ID": "1st Dimension",
      "EM_Etadas_User2_ID": "2nd Dimension",
      "EM_Etadas_Salesregion_ID": "Sales Region",
      "EM_Etadas_C_Activity_ID": "Activity",
      "EM_Etadas_Campaign_ID": "Sales Campaign",
      "EM_Etgo_Amortization_Status": "Amortization Status",
      "M_Product_ID": "Product"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:AssetsPage
export default function AssetsPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
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
        secondaryTabs={[
          { key: 'assetAcct', label: 'Accounting', Table: AssetAcctTable, Form: AssetAcctForm, addLineFields: { entry: [
          { key: 'accountingSchema', column: 'C_AcctSchema_ID', type: 'selector', required: true, label: 'General Ledger', reference: 'AcctSchema', inputMode: 'selector' },
          { key: 'accumulatedDepreciation', column: 'A_Accumdepreciation_Acct', type: 'selector', required: true, label: 'Accumulated Depreciation', reference: 'ValidCombination', inputMode: 'selector' },
          { key: 'depreciation', column: 'A_Depreciation_Acct', type: 'selector', required: true, label: 'Depreciation', reference: 'ValidCombination', inputMode: 'selector' },
          ], derived: [], hidden: [] }, requireSavedRecord: true },
        ]}
        formFooter={AssetsDetailPanel}
        hidePrint
        hideMoreMenu
        hideMoreDetails
        toolbarBorderBottom
        compactSidebarPadding
        whiteFormBackground
        hideFormCard
        sidebarAboveTabsOnly
        tabsSeparator
        sidebarClassName="w-[30%] shrink-0 border-l border-[#E8EAEF] p-2"
        toolbarPaddingX="px-2"
        toolbarButtonSize="default"
        contentBg="bg-white"
        formScrollPaddingX="px-2"
        customTabs={[{ key: 'amortizationPlan', labelKey: 'assetsAmortizationPlanTab', Component: AssetsAmortizationPanel, placement: 'tab' }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "A_Asset", config: {} } }]}
        detailSortBy="sEQNoAsset asc"
        titleField="name"
        lockWhenProcessed={false}
        labelOverrides={labelOverrides}
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
      </>
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
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideMoreMenu
      hideLink
      hideEyeCount
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:AssetsPage
