import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import TaxCategoryTable from './TaxCategoryTable';
import TaxCategoryForm from './TaxCategoryForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Configuration / Tax Category';


// @sf-generated-start summary:taxCategory
const summary = [

];

const statusField = null;
// @sf-generated-end summary:taxCategory

// @sf-generated-start extraBadges:taxCategory
const extraBadges = [

];
// @sf-generated-end extraBadges:taxCategory

// @sf-generated-start processes:taxCategory
const processes = [

];
// @sf-generated-end processes:taxCategory

// @sf-generated-start draftMode:taxCategory
const draftMode = null;
// @sf-generated-end draftMode:taxCategory

// @sf-generated-start requiredHeaderFields:taxCategory
const requiredHeaderFields = ['name', 'default', 'asbom', 'aeatsiiDeclarable'];
// @sf-generated-end requiredHeaderFields:taxCategory



export const api = {
  "specName": "tax-category",
  "baseUrl": "/sws/neo/tax-category",
  "crud": {
    "taxCategory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/tax-category/taxCategory",
      "detailUrl": "/sws/neo/tax-category/taxCategory/{id}",
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
    "category": "configuration"
  }
};

// @sf-generated-start component:TaxCategoryPage
export default function TaxCategoryPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="taxCategory"
        Form={TaxCategoryForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Tax Category"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        hideMoreMenu
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_TaxCategory", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="taxCategory"
      Table={TaxCategoryTable}
      entityLabel="Tax Category"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      hideMoreMenu
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:TaxCategoryPage
