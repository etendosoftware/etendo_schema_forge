import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import SequenceTable from './SequenceTable';
import SequenceForm from './SequenceForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Settings / Document Sequence';


// @sf-generated-start summary:sequence
const summary = [
  { key: 'name', column: 'Name', type: 'enum' },
];

const statusField = null;
// @sf-generated-end summary:sequence

// @sf-generated-start extraBadges:sequence
const extraBadges = [

];
// @sf-generated-end extraBadges:sequence

// @sf-generated-start processes:sequence
const processes = [

];
// @sf-generated-end processes:sequence

// @sf-generated-start draftMode:sequence
const draftMode = null;
// @sf-generated-end draftMode:sequence

// @sf-generated-start requiredHeaderFields:sequence
const requiredHeaderFields = ['name', 'nextAssignedNumber', 'startingNo'];
// @sf-generated-end requiredHeaderFields:sequence



export const api = {
  "specName": "document-sequence",
  "baseUrl": "/sws/neo/document-sequence",
  "crud": {
    "sequence": {
      "get": true,
      "getById": true,
      "post": false,
      "put": true,
      "patch": true,
      "delete": false,
      "listUrl": "/sws/neo/document-sequence/sequence",
      "detailUrl": "/sws/neo/document-sequence/sequence/{id}",
      "supportedFilters": [],
      "methods": [
        "GET",
        "GETBYID",
        "PUT",
        "PATCH"
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
    "category": "settings"
  },
  "labelOverrides": {
    "es_ES": {
      "Name": "Nombre",
      "Description": "Descripción",
      "Prefix": "Prefijo",
      "StartNo": "Número inicial",
      "CurrentNext": "Próximo número"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:SequencePage
export default function SequencePage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('112');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="112" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="sequence"
        Form={SequenceForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Sequence"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hideDeleteButton
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "AD_Sequence", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="sequence"
      Table={SequenceTable}
      entityLabel="Document Sequence"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hideCreate
      labelOverrides={labelOverrides}
      rowQuickActions={{"hideDeleteButton":true}}
      listSortBy="name asc"
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:SequencePage
