import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import GLJournalTable from './GLJournalTable';
import GLJournalForm from './GLJournalForm';
import GLJournalLineTable from './GLJournalLineTable';
import GLJournalLineForm from './GLJournalLineForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Manual Journals';


// @sf-generated-start summary:gLJournal
const summary = [

];

const statusField = null;
// @sf-generated-end summary:gLJournal

// @sf-generated-start extraBadges:gLJournal
const extraBadges = [
  { key: 'posted', type: 'statusPill', trueKey: 'postedStatus', falseKey: 'notPostedStatus' },
];
// @sf-generated-end extraBadges:gLJournal

// @sf-generated-start processes:gLJournal
const processes = [

];
// @sf-generated-end processes:gLJournal

// @sf-generated-start draftMode:gLJournal
const draftMode = {
  "enabled": true,
  "processField": "documentAction",
  "processValue": "CO",
  "label": "complete",
  "disableWhenEmpty": true
};
// @sf-generated-end draftMode:gLJournal

// @sf-generated-start requiredHeaderFields:gLJournal
const requiredHeaderFields = ['description', 'accountingDate', 'period', 'currency', 'opening', 'multigeneralLedger'];
// @sf-generated-end requiredHeaderFields:gLJournal

// @sf-generated-start addLineFields:gLJournalLine
const addLineFields = {
  entry: [
    { key: 'accountingCombination', column: 'C_ValidCombination_ID', type: 'selector', label: 'Account', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description', defaultValue: '@DESCRIPTION1@' },
    { key: 'foreignCurrencyDebit', column: 'AmtSourceDr', type: 'number', required: true, label: 'Debit', labels: {"en_US":"Debit","es_ES":"Débito"}, clearsField: 'foreignCurrencyCredit' },
    { key: 'foreignCurrencyCredit', column: 'AmtSourceCr', type: 'number', required: true, label: 'Credit', labels: {"en_US":"Credit","es_ES":"Crédito"}, clearsField: 'foreignCurrencyDebit' },
    { key: 'openItems', column: 'Open_Items', type: 'checkbox', required: true, label: 'Open Items' },
    { key: 'businessPartner', column: 'C_Bpartner_ID', type: 'search', lookup: true, label: 'Business Partner', reference: 'BPartner', inputMode: 'search' },
    { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', reference: 'Product', inputMode: 'selector' },
    { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', reference: 'Project', inputMode: 'search' },
    { key: 'asset', column: 'A_Asset_ID', type: 'selector', label: 'Asset', reference: 'Asset', inputMode: 'selector' },
    { key: 'costCenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', reference: 'Costcenter', inputMode: 'selector' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:gLJournalLine

export const api = {
  "specName": "simple-g-l-journal",
  "baseUrl": "/sws/neo/simple-g-l-journal",
  "crud": {
    "gLJournal": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/simple-g-l-journal/gLJournal",
      "detailUrl": "/sws/neo/simple-g-l-journal/gLJournal/{id}",
      "supportedFilters": [
        "description"
      ]
    },
    "gLJournalLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/simple-g-l-journal/gLJournalLine",
      "detailUrl": "/sws/neo/simple-g-l-journal/gLJournalLine/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "gLJournal",
      "field": "period",
      "column": "C_Period_ID",
      "reference": "Period",
      "inputMode": "search",
      "url": "/sws/neo/simple-g-l-journal/gLJournal/selectors/period"
    },
    {
      "entity": "gLJournal",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/simple-g-l-journal/gLJournal/selectors/currency"
    },
    {
      "entity": "gLJournalLine",
      "field": "accountingCombination",
      "column": "C_ValidCombination_ID",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/simple-g-l-journal/gLJournalLine/selectors/accountingCombination"
    },
    {
      "entity": "gLJournalLine",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/simple-g-l-journal/gLJournalLine/selectors/businessPartner"
    },
    {
      "entity": "gLJournalLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "selector",
      "url": "/sws/neo/simple-g-l-journal/gLJournalLine/selectors/product"
    },
    {
      "entity": "gLJournalLine",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/simple-g-l-journal/gLJournalLine/selectors/project"
    },
    {
      "entity": "gLJournalLine",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/simple-g-l-journal/gLJournalLine/selectors/asset"
    },
    {
      "entity": "gLJournalLine",
      "field": "costCenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/simple-g-l-journal/gLJournalLine/selectors/costCenter"
    }
  ],
  "actions": [
    {
      "entity": "gLJournal",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/simple-g-l-journal/gLJournal/{id}/action/documentAction",
      "processId": "5BE14AA10165490A9ADEFB7532F7FA94",
      "processType": "classic"
    },
    {
      "entity": "gLJournal",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/simple-g-l-journal/gLJournal/{id}/action/processNow"
    },
    {
      "entity": "gLJournal",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/simple-g-l-journal/gLJournal/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "gLJournalLine",
      "field": "aPRMAddPayment",
      "column": "EM_Aprm_Addpayment",
      "url": "/sws/neo/simple-g-l-journal/gLJournalLine/{id}/action/aPRMAddPayment",
      "processId": "DE1B382FDD2540199D223586F6E216D0",
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

// @sf-generated-start component:GLJournalPage
export default function GLJournalPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="gLJournal"
        detailEntity="gLJournalLine"
        Form={GLJournalForm}
        DetailTable={GLJournalLineTable}
        DetailForm={GLJournalLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="G L Journal"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "GL_Journal", config: {} } }]}
        menuActions={({ data, status }) => [
          { key: 'post', label: 'Post', visible: !(data?.posted === 'Y' || data?.posted === true), labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',  },
          { key: 'unpost', label: 'Unpost', destructive: true, visible: (data?.posted === 'Y' || data?.posted === true), labelKey: 'unpost', successKey: 'documentUnposted', neoAction: 'unpost',  }
        ]}
        draftMode={draftMode}
        requiredHeaderFields={requiredHeaderFields}
        balanceFooter={{"debitField":"foreignCurrencyDebit","creditField":"foreignCurrencyCredit"}}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="gLJournal"
      Table={GLJournalTable}
      entityLabel="Simple G/L Journal"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:GLJournalPage
