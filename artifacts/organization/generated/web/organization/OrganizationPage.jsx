import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import OrganizationTable from './OrganizationTable';
import OrganizationForm from './OrganizationForm';
import InformationTable from './InformationTable';
import InformationForm from './InformationForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Configuration / Organización';


// @sf-generated-start summary:organization
const summary = [
  { key: 'currency', column: 'C_Currency_ID', type: 'selector' },
];

const statusField = null;
// @sf-generated-end summary:organization

// @sf-generated-start extraBadges:organization
const extraBadges = [

];
// @sf-generated-end extraBadges:organization

// @sf-generated-start processes:organization
const processes = [

];
// @sf-generated-end processes:organization

// @sf-generated-start draftMode:organization
const draftMode = null;
// @sf-generated-end draftMode:organization

// @sf-generated-start requiredHeaderFields:organization
const requiredHeaderFields = ['name', 'socialName', 'etgoBusinessType'];
// @sf-generated-end requiredHeaderFields:organization

// @sf-generated-start addLineFields:information
const addLineFields = {
  entry: [
    { key: 'locationAddress', column: 'C_Location_ID', type: 'search', required: true, lookup: true, label: 'Location / Address', reference: 'Location', inputMode: 'search' },
    { key: 'taxID', column: 'TaxID', type: 'text', required: true, label: 'Tax ID' },
    { key: 'yourCompanyDocumentImage', column: 'Your_Company_Document_Image', type: 'text', label: 'Your Company Document Image' },
    { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text', label: 'Email' },
    { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'text', label: 'Phone' },
    { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'text', label: 'Web' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:information

export const api = {
  "specName": "organizaci-n",
  "baseUrl": "/sws/neo/organizaci-n",
  "crud": {
    "organization": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/organizaci-n/organization",
      "detailUrl": "/sws/neo/organizaci-n/organization/{id}",
      "supportedFilters": []
    },
    "information": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/organizaci-n/information",
      "detailUrl": "/sws/neo/organizaci-n/information/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "organization",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/organizaci-n/organization/selectors/currency"
    },
    {
      "entity": "information",
      "field": "locationAddress",
      "column": "C_Location_ID",
      "reference": "Location",
      "inputMode": "search",
      "url": "/sws/neo/organizaci-n/information/selectors/locationAddress"
    }
  ],
  "actions": [
    {
      "entity": "organization",
      "field": "ready",
      "column": "IsReady",
      "url": "/sws/neo/organizaci-n/organization/{id}/action/ready",
      "processId": "53863D4359114ADE92133F772135AEEB",
      "processType": "classic"
    },
    {
      "entity": "organization",
      "field": "etsgAddCertificate",
      "column": "EM_Etsg_Add_Certificate",
      "url": "/sws/neo/organizaci-n/organization/{id}/action/etsgAddCertificate",
      "processId": "77AAF82CC5344022AAD6ECBC9925E574",
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
    "category": "configuration"
  }
};

// @sf-generated-start component:OrganizationPage
export default function OrganizationPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('110');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="110" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="organization"
        detailEntity="information"
        Form={OrganizationForm}
        DetailTable={InformationTable}
        DetailForm={InformationForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Organization"
        detailLabel="Information"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        requiredHeaderFields={requiredHeaderFields}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="organization"
      Table={OrganizationTable}
      entityLabel="Organización"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:OrganizationPage
