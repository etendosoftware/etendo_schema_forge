import { useMemo } from 'react';
import { ListModalWindow } from '@/components/contract-ui';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';

// @sf-generated-start columns:header
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name', cellType: 'boldText', minWidth: 164, maxWidth: 240 },
  { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule', minWidth: 124, maxWidth: 148 },
  { key: 'nextBusinessDay', column: 'IsNextBusinessDay', type: 'boolean', label: 'Next Business Day', badge: true, labels: {"es_ES":"Siguiente día hábil","en_US":"Next Business Day"}, badgeLabels: {"true":{"es_ES":"Sí","en_US":"Yes"},"false":{"es_ES":"No","en_US":"No"}}, badgeVariants: {"true":"green","false":"neutral"}, minWidth: 158 },
  { key: 'default', column: 'IsDefault', type: 'boolean', label: 'Default', badge: true, labels: {"es_ES":"Por defecto","en_US":"Default"}, badgeLabels: {"true":{"es_ES":"Sí","en_US":"Yes"},"false":{"es_ES":"No","en_US":"No"}}, badgeVariants: {"true":"green","false":"neutral"}, minWidth: 158 },
];
// @sf-generated-end columns:header

// @sf-generated-start fields:header
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'principal', maxLength: 60 },
  { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule', required: true, section: 'principal', min: 0, max: 365, integer: true, stepper: true, stepperRejectedKey: 'paymentTermDaysNotInteger' },
  { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default', section: 'principal' },
  { key: 'nextBusinessDay', column: 'IsNextBusinessDay', type: 'checkbox', label: 'Next Business Day', section: 'principal', defaultValue: 'Y' },
];

const sections = [
  { key: 'principal' },
];

const filters = ['name'];
// @sf-generated-end fields:header

const breadcrumb = 'Settings / Payment Term';
const listModalConfig = {
  "titleKey": "paymentTermNewTitle",
  "editTitleKey": "paymentTermEditTitle",
  "subtitleKey": null,
  "editSubtitleKey": null,
  "submitLabelKey": null,
  "editSubmitLabelKey": null,
  "bannerKey": null,
  "searchPlaceholderKey": null,
  "newLabelKey": "paymentTermNew",
  "autoPriorityField": null,
  "autoPriorityStep": null,
  "identifierField": null,
  "footerToggleField": null,
  "sectionGrid": {},
  "allowClone": false,
  "backLabelKey": null,
  "backTo": null,
  "toolbarFilters": [],
  "modalVariant": "compact",
  "hideBackButton": true,
  "hideSearch": true,
  "newButtonVariant": "primary",
  "rowClickEdit": true,
  "listVariant": "compact"
};

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

// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, ...props }) {
  const windowAccessTier = useWindowAccess('141');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="141" />;
  }
  return (
    <ListModalWindow
      entity="header"
      entityLabel="Payment Term"
      windowName={windowName}
      breadcrumb={breadcrumb}
      columns={columns}
      fields={fields}
      sections={sections}
      filters={filters}
      config={listModalConfig}
      api={api}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:HeaderPage
