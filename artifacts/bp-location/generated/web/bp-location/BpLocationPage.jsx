import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import BpLocationTable from './BpLocationTable';
import BpLocationForm from './BpLocationForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Location';


// @sf-generated-start summary:bpLocation
const summary = [
  { key: 'addressLine1', column: 'Address1', type: 'string' },
  { key: 'addressLine2', column: 'Address2', type: 'string' },
];

const statusField = null;
// @sf-generated-end summary:bpLocation

// @sf-generated-start extraBadges:bpLocation
const extraBadges = [

];
// @sf-generated-end extraBadges:bpLocation

// @sf-generated-start processes:bpLocation
const processes = [

];
// @sf-generated-end processes:bpLocation

// @sf-generated-start draftMode:bpLocation
const draftMode = null;
// @sf-generated-end draftMode:bpLocation

// @sf-generated-start requiredHeaderFields:bpLocation
const requiredHeaderFields = ['country', 'buildingNumber', 'streetName'];
// @sf-generated-end requiredHeaderFields:bpLocation



export const api = {
  "specName": "bp-location",
  "baseUrl": "/sws/neo/bp-location",
  "crud": {
    "bpLocation": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/bp-location/bpLocation",
      "detailUrl": "/sws/neo/bp-location/bpLocation/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "bpLocation",
      "field": "country",
      "column": "C_Country_ID",
      "reference": "Country",
      "inputMode": "selector",
      "url": "/sws/neo/bp-location/bpLocation/selectors/country"
    },
    {
      "entity": "bpLocation",
      "field": "region",
      "column": "C_Region_ID",
      "reference": "Region",
      "inputMode": "selector",
      "url": "/sws/neo/bp-location/bpLocation/selectors/region",
      "context": {
        "required": [
          {
            "param": "C_Country_ID",
            "source": "field",
            "field": "country"
          }
        ]
      }
    }
  ],
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
    "category": "general"
  }
};

// @sf-generated-start component:BpLocationPage
export default function BpLocationPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('121');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="121" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="bpLocation"
        Form={BpLocationForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Bp Location"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        hideMoreMenu
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Location", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="bpLocation"
      Table={BpLocationTable}
      entityLabel="Location"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      hideMoreMenu
      rowQuickActions={{}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:BpLocationPage
