import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import YearTable from './YearTable';
import YearForm from './YearForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Calendar';


// @sf-generated-start summary:year
const summary = [

];

const statusField = null;
// @sf-generated-end summary:year

// @sf-generated-start extraBadges:year
const extraBadges = [

];
// @sf-generated-end extraBadges:year

// @sf-generated-start processes:year
const processes = [
  { name: 'processNow', label: 'Create Periods', style: 'positive', params: [{"key":"CREATEADJUSTMENT","type":"select","label":"Create Adjustment Period","required":false,"options":[{"value":"N","label":"No"},{"value":"Y","label":"Yes"}]}] },
  { name: 'createRegFactAcct', label: 'Close Year', style: 'positive' },
  { name: 'dropRegFactAcct', label: 'Undo Close Year', style: 'positive' },
];
// @sf-generated-end processes:year

// @sf-generated-start draftMode:year
const draftMode = null;
// @sf-generated-end draftMode:year

// @sf-generated-start requiredHeaderFields:year
const requiredHeaderFields = ['fiscalYear', 'calendar'];
// @sf-generated-end requiredHeaderFields:year



export const api = {
  "specName": "calendar",
  "baseUrl": "/sws/neo/calendar",
  "crud": {
    "year": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/calendar/year",
      "detailUrl": "/sws/neo/calendar/year/{id}",
      "supportedFilters": []
    },
    "periodControl": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/calendar/periodControl",
      "detailUrl": "/sws/neo/calendar/periodControl/{id}",
      "supportedFilters": []
    },
    "documents": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/calendar/documents",
      "detailUrl": "/sws/neo/calendar/documents/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "year",
      "field": "calendar",
      "column": "C_Calendar_ID",
      "reference": "Calendar",
      "inputMode": "selector",
      "url": "/sws/neo/calendar/year/selectors/calendar"
    },
    {
      "entity": "periodControl",
      "field": "calendar",
      "column": "C_Calendar_ID",
      "reference": "Calendar",
      "inputMode": "selector",
      "url": "/sws/neo/calendar/periodControl/selectors/calendar"
    },
    {
      "entity": "periodControl",
      "field": "year",
      "column": "C_Year_ID",
      "reference": "Year",
      "inputMode": "selector",
      "url": "/sws/neo/calendar/periodControl/selectors/year"
    }
  ],
  "actions": [
    {
      "entity": "year",
      "column": "Processing",
      "url": "/sws/neo/calendar/year/{id}/action/processNow",
      "processId": "100",
      "processType": "classic"
    },
    {
      "entity": "year",
      "column": "Create_Reg_Fact_Acct",
      "url": "/sws/neo/calendar/year/{id}/action/createRegFactAcct",
      "processId": "800036",
      "processType": "classic"
    },
    {
      "entity": "year",
      "column": "Drop_Reg_Fact_Acct",
      "url": "/sws/neo/calendar/year/{id}/action/dropRegFactAcct",
      "processId": "800038",
      "processType": "classic"
    },
    {
      "entity": "periodControl",
      "column": "Processing",
      "url": "/sws/neo/calendar/periodControl/{id}/action/processNow",
      "processId": "167",
      "processType": "classic"
    },
    {
      "entity": "periodControl",
      "column": "OpenClose",
      "url": "/sws/neo/calendar/periodControl/{id}/action/openClose",
      "processId": "167",
      "processType": "classic"
    },
    {
      "entity": "documents",
      "column": "Processing",
      "url": "/sws/neo/calendar/documents/{id}/action/processNow",
      "processId": "168",
      "processType": "classic"
    },
    {
      "entity": "documents",
      "column": "OpenClose",
      "url": "/sws/neo/calendar/documents/{id}/action/openClose",
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
      "Year": "Año fiscal",
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
// @sf-generated-start component:YearPage
export default function YearPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="year"
        Form={YearForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Year"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        requiredHeaderFields={requiredHeaderFields}
        statusEnumLabels={{"O":"All Opened","N":"All Never Opened","C":"All Closed","P":"All Permanently Closed","M":"Mixed"}}
        labelOverrides={labelOverrides}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="year"
      Table={YearTable}
      entityLabel="Calendar"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      listSortBy="fiscalYear desc"
      {...props}
    />
  );
}
// @sf-generated-end component:YearPage
