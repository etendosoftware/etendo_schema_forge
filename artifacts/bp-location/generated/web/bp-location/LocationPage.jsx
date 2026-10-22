import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import LocationTable from './LocationTable';
import LocationForm from './LocationForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Location';


// @sf-generated-start summary:location
const summary = [
  { key: 'addressLine1', column: 'Address1', type: 'string' },
  { key: 'addressLine2', column: 'Address2', type: 'string' },
];

const statusField = null;
// @sf-generated-end summary:location

// @sf-generated-start extraBadges:location
const extraBadges = [

];
// @sf-generated-end extraBadges:location

// @sf-generated-start processes:location
const processes = [

];
// @sf-generated-end processes:location

// @sf-generated-start draftMode:location
const draftMode = null;
// @sf-generated-end draftMode:location

// @sf-generated-start requiredHeaderFields:location
const requiredHeaderFields = ['country', 'oBSEPABuildingNumber', 'oBSEPAStreetName'];
// @sf-generated-end requiredHeaderFields:location



export const api = {
  "specName": "bp-location",
  "baseUrl": "/sws/neo/bp-location",
  "crud": {
    "location": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/bp-location/location",
      "detailUrl": "/sws/neo/bp-location/location/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "location",
      "field": "country",
      "column": "C_Country_ID",
      "reference": "Country",
      "inputMode": "selector",
      "url": "/sws/neo/bp-location/location/selectors/country"
    },
    {
      "entity": "location",
      "field": "region",
      "column": "C_Region_ID",
      "reference": "Region",
      "inputMode": "selector",
      "url": "/sws/neo/bp-location/location/selectors/region",
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

// @sf-generated-start component:LocationPage
export default function LocationPage({ windowName, recordId, ...props }) {
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
        entity="location"
        Form={LocationForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Location"
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
      entity="location"
      Table={LocationTable}
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
// @sf-generated-end component:LocationPage
