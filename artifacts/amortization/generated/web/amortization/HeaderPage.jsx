import { useState, useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import HeaderTable from './HeaderTable';
import HeaderForm from './HeaderForm';
import AmortizationLinesTable from '@/windows/custom/amortization/AmortizationLinesTable';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';

import AmortizationConfirmModal from '../../../custom/AmortizationConfirmModal';

const breadcrumb = 'Finance / Amortization';


// @sf-generated-start summary:header
const summary = [
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'status' },
  { key: 'etblkpBulkposting', column: 'EM_Etblkp_Bulkposting', type: 'string' },
];

const statusField = 'processed';
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [
  { key: 'posted', type: 'statusPill', trueKey: 'postedStatus', falseKey: 'notPostedStatus' },
];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [

];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = {
  "enabled": true,
  "processField": "Processed",
  "processValue": "Y",
  "label": "confirm",
  "disableWhenEmpty": true
};
// @sf-generated-end draftMode:header

// @sf-generated-start requiredHeaderFields:header
const requiredHeaderFields = ['name', 'accountingDate', 'currency', 'etblkpAccountingstatus', 'etblkpBulkposting'];
// @sf-generated-end requiredHeaderFields:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'asset', column: 'A_Asset_ID', type: 'selector', label: 'Asset', reference: 'Asset', inputMode: 'selector' },
    { key: 'amortizationPercentage', column: 'Amortization_Percentage', type: 'number', label: 'Amortization Percentage' },
    { key: 'amortizationAmount', column: 'Amortizationamt', type: 'number', required: true, label: 'Amortization Amount' },
    { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', reference: 'Project', inputMode: 'selector' },
    { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', reference: 'Costcenter', inputMode: 'selector' },
    { key: 'stDimension', column: 'User1_ID', type: 'selector', label: '1st Dimension', reference: 'User1', inputMode: 'selector' },
    { key: 'ndDimension', column: 'User2_ID', type: 'selector', label: '2nd Dimension', reference: 'User2', inputMode: 'selector' },
    { key: 'eTADASActivity', column: 'EM_Etadas_C_Activity_ID', type: 'selector', label: 'Activity', reference: 'Activity', inputMode: 'selector' },
    { key: 'eTADASBpartner', column: 'EM_Etadas_C_Bpartner_ID', type: 'selector', label: 'Business Partner', reference: 'BPartner', inputMode: 'selector' },
    { key: 'eTADASSalesCampaign', column: 'EM_Etadas_Campaign_ID', type: 'selector', label: 'Sales Campaign', reference: 'Campaign', inputMode: 'selector' },
    { key: 'eTADASSalesRegion', column: 'EM_Etadas_Salesregion_ID', type: 'selector', label: 'Sales Region', reference: 'SalesRegion', inputMode: 'selector' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:lines

export const api = {
  "specName": "amortization",
  "baseUrl": "/sws/neo/amortization",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/amortization/header",
      "detailUrl": "/sws/neo/amortization/header/{id}",
      "supportedFilters": [
        "name",
        "accountingDate",
        "startingDate"
      ]
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/amortization/lines",
      "detailUrl": "/sws/neo/amortization/lines/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "header",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/header/selectors/currency"
    },
    {
      "entity": "lines",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/asset"
    },
    {
      "entity": "lines",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/currency"
    },
    {
      "entity": "lines",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/project"
    },
    {
      "entity": "lines",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/costcenter"
    },
    {
      "entity": "lines",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "User1",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/stDimension"
    },
    {
      "entity": "lines",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "User2",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/ndDimension"
    },
    {
      "entity": "lines",
      "field": "eTADASActivity",
      "column": "EM_Etadas_C_Activity_ID",
      "reference": "Activity",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/eTADASActivity"
    },
    {
      "entity": "lines",
      "field": "eTADASBpartner",
      "column": "EM_Etadas_C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/eTADASBpartner"
    },
    {
      "entity": "lines",
      "field": "eTADASSalesCampaign",
      "column": "EM_Etadas_Campaign_ID",
      "reference": "Campaign",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/eTADASSalesCampaign"
    },
    {
      "entity": "lines",
      "field": "eTADASSalesRegion",
      "column": "EM_Etadas_Salesregion_ID",
      "reference": "SalesRegion",
      "inputMode": "selector",
      "url": "/sws/neo/amortization/lines/selectors/eTADASSalesRegion"
    }
  ],
  "actions": [
    {
      "entity": "header",
      "field": "processed",
      "column": "Processed",
      "url": "/sws/neo/amortization/header/{id}/action/processed",
      "processId": "800134",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/amortization/header/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
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
    "category": "finance"
  },
  "labelOverrides": {
    "es_ES": {
      "Name": "Nombre",
      "Description": "Descripción",
      "DateAcct": "Fecha contable",
      "StartDate": "Fecha de inicio",
      "Totalamortization": "Amortización total",
      "C_Currency_ID": "Moneda",
      "A_Asset_ID": "Activo",
      "Amortization_Percentage": "% Amortización",
      "Amortizationamt": "Importe amortización",
      "Line": "Nº línea",
      "C_Project_ID": "Proyecto",
      "C_Costcenter_ID": "Centro de costo",
      "User1_ID": "1ª Dimensión",
      "User2_ID": "2ª Dimensión",
      "EM_Etadas_C_Bpartner_ID": "Contacto",
      "EM_Etadas_Salesregion_ID": "Región de ventas",
      "EM_Etadas_C_Activity_ID": "Actividad",
      "EM_Etadas_Campaign_ID": "Campaña"
    },
    "en_US": {
      "Name": "Name",
      "Description": "Description",
      "DateAcct": "Accounting Date",
      "StartDate": "Starting Date",
      "Totalamortization": "Total Amortization",
      "C_Currency_ID": "Currency",
      "A_Asset_ID": "Asset",
      "Amortization_Percentage": "Amortization %",
      "Amortizationamt": "Amortization Amount",
      "Line": "Line No.",
      "C_Project_ID": "Project",
      "C_Costcenter_ID": "Cost Center",
      "User1_ID": "1st Dimension",
      "User2_ID": "2nd Dimension",
      "EM_Etadas_C_Bpartner_ID": "Contact",
      "EM_Etadas_Salesregion_ID": "Sales Region",
      "EM_Etadas_C_Activity_ID": "Activity",
      "EM_Etadas_Campaign_ID": "Sales Campaign"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const draftModeWithConfirm = { ...draftMode, onConfirm: () => setShowConfirmModal(true) };
  if (recordId) {
    return (
      <>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={HeaderForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Header"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        CustomLines={AmortizationLinesTable}
        customLinesLabel="Lines"
        hideDeleteWhenComplete
        hidePrint
        noHeaderBorder
        whiteFormBackground
        toolbarButtonSize="default"
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "A_Amortization", config: {} } }]}
        menuActions={({ data, status }) => [
          { key: 'reactivate', label: 'Reactivate', visible: (data?.processed === 'Y' || data?.processed === true), labelKey: 'reactivate', preUnpost: true, columnName: 'Processed',  },
          { key: 'post', label: 'Post', visible: !(data?.posted === 'Y' || data?.posted === true) && (data?.processed === 'Y' || data?.processed === true), labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',  }
        ]}
        draftMode={draftModeWithConfirm}
        requiredHeaderFields={requiredHeaderFields}
        titleField="name"
        labelOverrides={labelOverrides}
        linesLayout="inlineEditable"
        {...props}
      />

      {showConfirmModal && (
        <AmortizationConfirmModal
          recordId={recordId}
          token={props.token}
          apiBaseUrl={props.apiBaseUrl}
          onClose={(success) => {
            setShowConfirmModal(false);
            if (success) window.location.reload();
          }}
        />
      )}
      </>
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Amortization"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hiddenColumns={["processed"]}
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideLink
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage
