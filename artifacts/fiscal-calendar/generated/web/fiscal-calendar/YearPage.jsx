import { useState, useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import YearTable from './YearTable';
import YearForm from './YearForm';
import PeriodTable from './PeriodTable';
import PeriodForm from './PeriodForm';
import { AttachmentsTab } from '@/components/attachments';
import CloseYearModal from '@/windows/custom/fiscal-calendar/CloseYearModal';
import UndoCloseYearModal from '@/windows/custom/fiscal-calendar/UndoCloseYearModal';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Fiscal Calendar';


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
];
// @sf-generated-end processes:year

// @sf-generated-start draftMode:year
const draftMode = null;
// @sf-generated-end draftMode:year

// @sf-generated-start requiredHeaderFields:year
const requiredHeaderFields = ['fiscalYear', 'calendar'];
// @sf-generated-end requiredHeaderFields:year

// @sf-generated-start addLineFields:period
const addLineFields = {
  entry: [

  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:period

export const api = {
  "specName": "fiscal-calendar",
  "baseUrl": "/sws/neo/fiscal-calendar",
  "crud": {
    "year": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/fiscal-calendar/year",
      "detailUrl": "/sws/neo/fiscal-calendar/year/{id}",
      "supportedFilters": []
    },
    "period": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/fiscal-calendar/period",
      "detailUrl": "/sws/neo/fiscal-calendar/period/{id}",
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
      "url": "/sws/neo/fiscal-calendar/year/selectors/calendar"
    }
  ],
  "actions": [
    {
      "entity": "year",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/fiscal-calendar/year/{id}/action/processNow",
      "processId": "100",
      "processType": "classic"
    },
    {
      "entity": "year",
      "field": "createRegFactAcct",
      "column": "Create_Reg_Fact_Acct",
      "url": "/sws/neo/fiscal-calendar/year/{id}/action/createRegFactAcct",
      "processId": "800036",
      "processType": "classic"
    },
    {
      "entity": "year",
      "field": "dropRegFactAcct",
      "column": "Drop_Reg_Fact_Acct",
      "url": "/sws/neo/fiscal-calendar/year/{id}/action/dropRegFactAcct",
      "processId": "800038",
      "processType": "classic"
    },
    {
      "entity": "period",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/fiscal-calendar/period/{id}/action/processNow",
      "processId": "167",
      "processType": "classic"
    },
    {
      "entity": "period",
      "field": "openClose",
      "column": "OpenClose",
      "url": "/sws/neo/fiscal-calendar/period/{id}/action/openClose",
      "processId": "A832A5DA28FB4BB391BDE883E928DFC5",
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
      "Year": "Año fiscal",
      "PeriodNo": "N.º período",
      "StartDate": "Fecha inicio",
      "EndDate": "Fecha fin",
      "PeriodType": "Tipo",
      "Status": "Estado"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:YearPage
export default function YearPage({ windowName, recordId, ...props }) {
  const [showCloseYearMenuModal, setCloseYearMenuModal] = useState(false);
  const [closeYearMenuContext, setCloseYearMenuContext] = useState(null);
  const [showUndoCloseYearMenuModal, setUndoCloseYearMenuModal] = useState(false);
  const [undoCloseYearMenuContext, setUndoCloseYearMenuContext] = useState(null);
  if (recordId) {
    return (
      <>
      <DetailView
        entity="year"
        detailEntity="period"
        Form={YearForm}
        DetailTable={PeriodTable}
        DetailForm={PeriodForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Year"
        detailLabel="Period"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Year", config: {} } }]}
        menuActions={({ data, status }) => [
          { key: 'closeYear', label: 'undefined', labelKey: 'closeYearTitle', onClick: () => { setCloseYearMenuContext(data ?? null); setCloseYearMenuModal(true); }, },
          { key: 'undoCloseYear', label: 'undefined', labelKey: 'undoCloseYearTitle', onClick: () => { setUndoCloseYearMenuContext(data ?? null); setUndoCloseYearMenuModal(true); }, }
        ]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props}
      />
      {showCloseYearMenuModal && <CloseYearModal isOpen={showCloseYearMenuModal} token={props.token} apiBaseUrl={api.baseUrl} currentRecord={closeYearMenuContext} onClose={() => setCloseYearMenuModal(false)} onSaved={() => { setCloseYearMenuModal(false); window.location.reload(); }} />}
      {showUndoCloseYearMenuModal && <UndoCloseYearModal isOpen={showUndoCloseYearMenuModal} token={props.token} apiBaseUrl={api.baseUrl} currentRecord={undoCloseYearMenuContext} onClose={() => setUndoCloseYearMenuModal(false)} onSaved={() => { setUndoCloseYearMenuModal(false); window.location.reload(); }} />}      </>
    );
  }

  return (
    <ListView
      entity="year"
      Table={YearTable}
      entityLabel="Fiscal Calendar"
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
