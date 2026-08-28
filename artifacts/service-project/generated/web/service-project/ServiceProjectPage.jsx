import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import ServiceProjectTable from './ServiceProjectTable';
import ServiceProjectForm from './ServiceProjectForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Service Project';


// @sf-generated-start summary:serviceProject
const summary = [

];

const statusField = null;
// @sf-generated-end summary:serviceProject

// @sf-generated-start extraBadges:serviceProject
const extraBadges = [

];
// @sf-generated-end extraBadges:serviceProject

// @sf-generated-start processes:serviceProject
const processes = [

];
// @sf-generated-end processes:serviceProject

// @sf-generated-start draftMode:serviceProject
const draftMode = null;
// @sf-generated-end draftMode:serviceProject

// @sf-generated-start requiredHeaderFields:serviceProject
const requiredHeaderFields = ['searchKey', 'name', 'active'];
// @sf-generated-end requiredHeaderFields:serviceProject



export const api = {
  "specName": "service-project",
  "baseUrl": "/sws/neo/service-project",
  "crud": {
    "serviceProject": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/service-project/serviceProject",
      "detailUrl": "/sws/neo/service-project/serviceProject/{id}",
      "supportedFilters": [
        "searchKey",
        "name"
      ]
    }
  },
  "selectors": [],
  "actions": [
    {
      "entity": "serviceProject",
      "field": "changeProjectStatus",
      "column": "ChangeProjectStatus",
      "url": "/sws/neo/service-project/serviceProject/{id}/action/changeProjectStatus",
      "processId": "800002",
      "processType": "classic"
    },
    {
      "entity": "serviceProject",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/service-project/serviceProject/{id}/action/copyFrom",
      "processId": "212",
      "processType": "classic"
    },
    {
      "entity": "serviceProject",
      "field": "generateOrder",
      "column": "GenerateOrder",
      "url": "/sws/neo/service-project/serviceProject/{id}/action/generateOrder",
      "processId": "800005",
      "processType": "classic"
    },
    {
      "entity": "serviceProject",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/service-project/serviceProject/{id}/action/generateTo",
      "processId": "164",
      "processType": "classic"
    },
    {
      "entity": "serviceProject",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/service-project/serviceProject/{id}/action/processNow",
      "processId": "227",
      "processType": "classic"
    },
    {
      "entity": "serviceProject",
      "field": "setProjectType",
      "column": "Setprojecttype",
      "url": "/sws/neo/service-project/serviceProject/{id}/action/setProjectType",
      "processId": "215",
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
      "Isactive": "Activo"
    },
    "es_AR": {
      "Isactive": "Activo"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:ServiceProjectPage
export default function ServiceProjectPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('800001');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="800001" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="serviceProject"
        Form={ServiceProjectForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Service Project"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        noHeaderBorder
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Project", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="serviceProject"
      Table={ServiceProjectTable}
      entityLabel="Service Project"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      hideLink
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:ServiceProjectPage
