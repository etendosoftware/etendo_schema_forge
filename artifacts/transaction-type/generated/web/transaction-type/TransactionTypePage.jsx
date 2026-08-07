import { useMemo } from 'react';
import { ListModalWindow } from '@/components/contract-ui';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';

// @sf-generated-start columns:transactionType
const columns = [
  { key: 'name', column: 'Name', type: 'string', label: 'Name' },
];
// @sf-generated-end columns:transactionType

// @sf-generated-start fields:transactionType
const fields = [
  { key: 'name', column: 'Name', type: 'text', label: 'Name', required: true, section: 'general' },
  { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Active', required: true, section: 'general', defaultValue: 'Y' },
];

const sections = [
  { key: 'general' },
];

const filters = ['name'];
// @sf-generated-end fields:transactionType

const breadcrumb = 'Finance / Transaction Type';
const listModalConfig = {
  "titleKey": null,
  "editTitleKey": null,
  "subtitleKey": null,
  "editSubtitleKey": null,
  "submitLabelKey": null,
  "editSubmitLabelKey": null,
  "bannerKey": null,
  "searchPlaceholderKey": null,
  "newLabelKey": null,
  "autoPriorityField": null,
  "autoPriorityStep": null,
  "identifierField": null,
  "footerToggleField": null,
  "sectionGrid": {},
  "allowClone": false,
  "backLabelKey": null,
  "backTo": null,
  "toolbarFilters": []
};

export const api = {
  "specName": "transaction-type",
  "baseUrl": "/sws/neo/transaction-type",
  "crud": {
    "transactionType": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/transaction-type/transactionType",
      "detailUrl": "/sws/neo/transaction-type/transactionType/{id}",
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
    "category": "finance"
  }
};

// @sf-generated-start component:TransactionTypePage
export default function TransactionTypePage({ windowName, ...props }) {
  const windowAccessTier = useWindowAccess('82922976BB524D1BAA3CF8462B9219FE');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="82922976BB524D1BAA3CF8462B9219FE" />;
  }
  return (
    <ListModalWindow
      entity="transactionType"
      entityLabel="Transaction Type"
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
// @sf-generated-end component:TransactionTypePage
