import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import HeaderTable from './HeaderTable';
import HeaderForm from './HeaderForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Invoice Inbox';


// @sf-generated-start summary:header
const summary = [

];

const statusField = 'status';
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [

];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [

];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = null;
// @sf-generated-end draftMode:header

// @sf-generated-start requiredHeaderFields:header
const requiredHeaderFields = [];
// @sf-generated-end requiredHeaderFields:header



export const api = {
  "specName": "invoice-inbox",
  "baseUrl": "/sws/neo/invoice-inbox",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": false,
      "put": false,
      "patch": false,
      "delete": false,
      "listUrl": "/sws/neo/invoice-inbox/header",
      "detailUrl": "/sws/neo/invoice-inbox/header/{id}",
      "supportedFilters": [],
      "methods": [
        "GET",
        "GETBYID"
      ]
    }
  },
  "selectors": [
    {
      "entity": "header",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "selector",
      "url": "/sws/neo/invoice-inbox/header/selectors/businessPartner"
    },
    {
      "entity": "header",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/invoice-inbox/header/selectors/invoice"
    },
    {
      "entity": "header",
      "field": "duplicateOfInvoice",
      "column": "Duplicate_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "search",
      "url": "/sws/neo/invoice-inbox/header/selectors/duplicateOfInvoice"
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
    "category": "purchases"
  }
};

// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('81AC659E93504927B459E0CAE80CE923');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="81AC659E93504927B459E0CAE80CE923" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="header"
        Form={HeaderForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Header"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Invoice Inbox"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      rowQuickActions={{}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:HeaderPage
