import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import CostCenterTable from './CostCenterTable';
import CostCenterForm from './CostCenterForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Cost Center';


// @sf-generated-start summary:costCenter
const summary = [

];

const statusField = null;
// @sf-generated-end summary:costCenter

// @sf-generated-start extraBadges:costCenter
const extraBadges = [

];
// @sf-generated-end extraBadges:costCenter

// @sf-generated-start processes:costCenter
const processes = [

];
// @sf-generated-end processes:costCenter

// @sf-generated-start draftMode:costCenter
const draftMode = null;
// @sf-generated-end draftMode:costCenter

// @sf-generated-start requiredHeaderFields:costCenter
const requiredHeaderFields = ['searchKey', 'name', 'active'];
// @sf-generated-end requiredHeaderFields:costCenter



export const api = {
  "specName": "cost-center",
  "baseUrl": "/sws/neo/cost-center",
  "crud": {
    "costCenter": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/cost-center/costCenter",
      "detailUrl": "/sws/neo/cost-center/costCenter/{id}",
      "supportedFilters": [
        "searchKey",
        "name"
      ]
    }
  },
  "selectors": [],
  "actions": [],
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
// @sf-generated-start component:CostCenterPage
export default function CostCenterPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('79FC23AB84F04384B4B7CCCADCDD2942');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="79FC23AB84F04384B4B7CCCADCDD2942" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="costCenter"
        Form={CostCenterForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Cost Center"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        noHeaderBorder
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Costcenter", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="costCenter"
      Table={CostCenterTable}
      entityLabel="Cost Center"
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
// @sf-generated-end component:CostCenterPage
