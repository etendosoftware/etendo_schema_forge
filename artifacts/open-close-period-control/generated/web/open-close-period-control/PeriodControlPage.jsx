import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import PeriodControlTable from './PeriodControlTable';
import PeriodControlForm from './PeriodControlForm';
import DocumentsTable from './DocumentsTable';
import DocumentsForm from './DocumentsForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Open/Close Period Control';


// @sf-generated-start summary:periodControl
const summary = [
  { key: 'calendar', column: 'C_Calendar_ID', type: 'selector' },
  { key: 'year', column: 'C_Year_ID', type: 'selector' },
  { key: 'periodNo', column: 'PeriodNo', type: 'number' },
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'startingDate', column: 'StartDate', type: 'date' },
  { key: 'endingDate', column: 'EndDate', type: 'date' },
  { key: 'periodType', column: 'PeriodType', type: 'enum' },
];

const statusField = 'status';
// @sf-generated-end summary:periodControl

// @sf-generated-start extraBadges:periodControl
const extraBadges = [

];
// @sf-generated-end extraBadges:periodControl

// @sf-generated-start processes:periodControl
const processes = [
  { name: 'openClose', label: 'Open Close Period', style: 'positive', params: [{"key":"openClose","type":"select","label":"Action","required":true,"options":[{"value":"O","label":"Open"},{"value":"C","label":"Closed"},{"value":"P","label":"Permanently closed"}]}] },
];
// @sf-generated-end processes:periodControl

// @sf-generated-start detailProcesses:documents
const detailProcesses = [
  { name: 'openClose', label: 'Open Close Document', style: 'positive', params: [{"key":"openClose","type":"select","label":"Action","required":true,"options":[{"value":"O","label":"Open"},{"value":"C","label":"Closed"},{"value":"P","label":"Permanently closed"}]}] },
];
// @sf-generated-end detailProcesses:documents

// @sf-generated-start draftMode:periodControl
const draftMode = null;
// @sf-generated-end draftMode:periodControl

// @sf-generated-start requiredHeaderFields:periodControl
const requiredHeaderFields = ['calendar', 'year', 'periodNo', 'name', 'startingDate', 'periodType', 'openClose'];
// @sf-generated-end requiredHeaderFields:periodControl

// @sf-generated-start addLineFields:documents
const addLineFields = {
  entry: [
    { key: 'openClose', column: 'OpenClose', type: 'text', required: true, label: 'Open Close', defaultValue: 'O' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:documents

export const api = {
  "specName": "open-close-period-control",
  "baseUrl": "/sws/neo/open-close-period-control",
  "crud": {
    "periodControl": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": false,
      "listUrl": "/sws/neo/open-close-period-control/periodControl",
      "detailUrl": "/sws/neo/open-close-period-control/periodControl/{id}",
      "supportedFilters": []
    },
    "documents": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": false,
      "listUrl": "/sws/neo/open-close-period-control/documents",
      "detailUrl": "/sws/neo/open-close-period-control/documents/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "periodControl",
      "field": "calendar",
      "column": "C_Calendar_ID",
      "reference": "Calendar",
      "inputMode": "selector",
      "url": "/sws/neo/open-close-period-control/periodControl/selectors/calendar"
    },
    {
      "entity": "periodControl",
      "field": "year",
      "column": "C_Year_ID",
      "reference": "Year",
      "inputMode": "selector",
      "url": "/sws/neo/open-close-period-control/periodControl/selectors/year"
    }
  ],
  "actions": [
    {
      "entity": "periodControl",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/open-close-period-control/periodControl/{id}/action/processNow",
      "processId": "167",
      "processType": "classic"
    },
    {
      "entity": "periodControl",
      "field": "openClose",
      "column": "OpenClose",
      "url": "/sws/neo/open-close-period-control/periodControl/{id}/action/openClose",
      "processId": "167",
      "processType": "classic"
    },
    {
      "entity": "documents",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/open-close-period-control/documents/{id}/action/processNow",
      "processId": "168",
      "processType": "classic"
    },
    {
      "entity": "documents",
      "field": "openClose",
      "column": "OpenClose",
      "url": "/sws/neo/open-close-period-control/documents/{id}/action/openClose",
      "processId": "168",
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
  },
  "labelOverrides": {
    "es_ES": {
      "Name": "Período",
      "PeriodNo": "N.º período",
      "StartDate": "Fecha inicio",
      "EndDate": "Fecha fin",
      "PeriodType": "Tipo",
      "Status": "Estado",
      "DocumentCategory": "Tipo de documento",
      "PeriodStatus": "Estado período"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:PeriodControlPage
export default function PeriodControlPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="periodControl"
        detailEntity="documents"
        Form={PeriodControlForm}
        DetailTable={DocumentsTable}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        detailProcesses={detailProcesses}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Period Control"
        detailLabel="Documents"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        hideMoreMenu
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Period", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        statusEnumLabels={{"O":"All Opened","N":"All Never Opened","C":"All Closed","P":"All Permanently Closed","M":"Mixed"}}
        labelOverrides={labelOverrides}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="periodControl"
      Table={PeriodControlTable}
      entityLabel="Open/Close Period Control"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      hideCreate
      hideMoreMenu
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      listSortBy="periodNo asc"
      {...props}
    />
  );
}
// @sf-generated-end component:PeriodControlPage
