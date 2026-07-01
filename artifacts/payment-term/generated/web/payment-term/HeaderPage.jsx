import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import HeaderTable from './HeaderTable';
import HeaderForm from './HeaderForm';
import { AttachmentsTab } from '@/components/attachments';
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
const requiredHeaderFields = ['searchKey', 'name', 'offsetMonthDue', 'overduePaymentDaysRule'];
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
      "IsActive": "Activo"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
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
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_PaymentTerm", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props}
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
      hidePrint
      hideMoreMenu
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage
