import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import HeaderTable from './HeaderTable';
import HeaderForm from './HeaderForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Settings / Payment Term';


// @sf-generated-start summary:header
const summary = [

];

const statusField = null;
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
const requiredHeaderFields = ['name', 'overduePaymentDaysRule'];
// @sf-generated-end requiredHeaderFields:header



export const api = {
  "specName": "payment-term",
  "baseUrl": "/sws/neo/payment-term",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-term/header",
      "detailUrl": "/sws/neo/payment-term/header/{id}",
      "supportedFilters": [
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
    "category": "settings"
  },
  "labelOverrides": {
    "es_ES": {
      "Value": "Clave",
      "Name": "Nombre",
      "Description": "Descripción",
      "FixMonthOffset": "Meses de desplazamiento",
      "NetDays": "Días",
      "IsDefault": "Por defecto",
      "IsNextBusinessDay": "Siguiente día hábil",
      "IsActive": "Activo"
    },
    "en_US": {
      "Name": "Name",
      "NetDays": "Days",
      "IsDefault": "Default",
      "IsNextBusinessDay": "Next Business Day"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('141');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="141" />;
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
        hideMoreMenu
        noHeaderBorder
        toolbarBorderBottom
        whiteFormBackground
        autoSaveOnBlur
        tabsBarPaddingX="px-2"
        toolbarPaddingX="px-2"
        formCardPadding="p-2"
        formScrollPaddingX="px-2"
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Payment Term"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideMoreMenu
      hideLink
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:HeaderPage
