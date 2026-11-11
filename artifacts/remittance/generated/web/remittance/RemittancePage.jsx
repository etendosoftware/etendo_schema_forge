import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import RemittanceTable from './RemittanceTable';
import RemittanceForm from './RemittanceForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import { AttachmentsTab } from '@/components/attachments';
import RemittanceBottomPanel from '../../../custom/RemittanceBottomPanel';
import RemittanceStatusBanner from '../../../custom/RemittanceStatusBanner';
import RemittanceProcessConfirmModal from '../../../custom/RemittanceProcessConfirmModal';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Remittance';


// @sf-generated-start summary:remittance
const summary = [

];

const statusField = 'remittanceStatus';
// @sf-generated-end summary:remittance

// @sf-generated-start extraBadges:remittance
const extraBadges = [

];
// @sf-generated-end extraBadges:remittance

// @sf-generated-start processes:remittance
const processes = [
  { name: 'process', label: 'process', style: 'positive',
    displayLogicRaw: "@Processed@='N'", requiresLines: true, params: [{"key":"grouping","type":"select","label":"remittanceGrouping","required":true,"defaultValue":"P","options":[{"value":"P","label":"remittanceGroupingNone"},{"value":"GGPD","label":"remittanceGroupingByBpAndDueDate"}]}] },
  { name: 'reactivate', label: 'reactivate', style: 'primary-danger',
    displayLogicRaw: "@Processed@='Y'" },
];
// @sf-generated-end processes:remittance

// @sf-generated-start draftMode:remittance
const draftMode = null;
// @sf-generated-end draftMode:remittance

// @sf-generated-start requiredHeaderFields:remittance
const requiredHeaderFields = ['remittanceType', 'dueDate', 'name', 'financialAccount'];
// @sf-generated-end requiredHeaderFields:remittance

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [

  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:lines

export const api = {
  "specName": "remittance",
  "baseUrl": "/sws/neo/remittance",
  "crud": {
    "remittance": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/remittance/remittance",
      "detailUrl": "/sws/neo/remittance/remittance/{id}",
      "supportedFilters": []
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": false,
      "put": false,
      "patch": false,
      "delete": true,
      "listUrl": "/sws/neo/remittance/lines",
      "detailUrl": "/sws/neo/remittance/lines/{id}",
      "supportedFilters": [],
      "methods": [
        "GET",
        "GETBYID",
        "DELETE"
      ]
    }
  },
  "selectors": [
    {
      "entity": "remittance",
      "field": "remittanceType",
      "column": "REM_Remittance_Type_ID",
      "reference": "REM_Remittance_Type",
      "inputMode": "dependent",
      "url": "/sws/neo/remittance/remittance/selectors/remittanceType",
      "context": {
        "required": [
          {
            "param": "FIN_Financial_Account_ID",
            "source": "field",
            "field": "financialAccount"
          }
        ]
      }
    },
    {
      "entity": "remittance",
      "field": "financialAccount",
      "column": "FIN_Financial_Account_ID",
      "reference": "Financial_Account",
      "inputMode": "selector",
      "url": "/sws/neo/remittance/remittance/selectors/financialAccount"
    },
    {
      "entity": "lines",
      "field": "payment",
      "column": "FIN_Payment_ID",
      "reference": "Payment",
      "inputMode": "search",
      "url": "/sws/neo/remittance/lines/selectors/payment"
    },
    {
      "entity": "lines",
      "field": "paymentScheduleDetail",
      "column": "FIN_Payment_Scheduledetail_ID",
      "reference": "Payment_Scheduledetail",
      "inputMode": "search",
      "url": "/sws/neo/remittance/lines/selectors/paymentScheduleDetail"
    },
    {
      "entity": "lines",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "inputMode": "selector",
      "url": "/sws/neo/remittance/lines/selectors/businessPartner"
    }
  ],
  "actions": [
    {
      "entity": "remittance",
      "field": "selectpayments",
      "column": "Selectpayments",
      "url": "/sws/neo/remittance/remittance/{id}/action/selectpayments",
      "processId": "C88AB6CBA1694000AFF5706A31B08AE1",
      "processType": "obuiapp"
    },
    {
      "entity": "remittance",
      "field": "createLinesFrom",
      "column": "Createfrom",
      "url": "/sws/neo/remittance/remittance/{id}/action/createLinesFrom",
      "processId": "FF8080812E7CD815012E7CE8F7260045",
      "processType": "classic"
    },
    {
      "entity": "remittance",
      "field": "getFile",
      "column": "Getfile",
      "url": "/sws/neo/remittance/remittance/{id}/action/getFile",
      "processId": "FF8080812EB06FB0012EB072D2A2000A",
      "processType": "classic"
    },
    {
      "entity": "remittance",
      "field": "processRemittance",
      "column": "Process_Remittance",
      "url": "/sws/neo/remittance/remittance/{id}/action/processRemittance",
      "processId": "FF8080812E77C0AF012E77C585600014",
      "processType": "classic"
    },
    {
      "entity": "remittance",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/remittance/remittance/{id}/action/posted"
    },
    {
      "entity": "remittance",
      "field": "selectInvoicesAndOrders",
      "column": "selectInvoicesAndOrders",
      "url": "/sws/neo/remittance/remittance/{id}/action/selectInvoicesAndOrders",
      "processId": "99E532BA0306450A839F5DE238375238",
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
      "Datetrx": "Fecha",
      "REM_Remittance_Type_ID": "Tipo de remesa",
      "Name": "Nombre",
      "FIN_Financial_Account_ID": "Cuenta",
      "Duedate": "Fecha de cargo/abono",
      "Remittance_Status": "Estado",
      "DocumentNo": "Nº documento",
      "Line": "Línea",
      "FIN_Payment_Scheduledetail_ID": "Vencimiento",
      "FIN_Payment_ID": "Pago",
      "Amount": "Importe",
      "Currency": "Moneda"
    },
    "es_AR": {
      "Datetrx": "Fecha",
      "REM_Remittance_Type_ID": "Tipo de remesa",
      "Name": "Nombre",
      "FIN_Financial_Account_ID": "Cuenta",
      "Duedate": "Fecha de cargo/abono",
      "Remittance_Status": "Estado",
      "DocumentNo": "Nº documento",
      "Line": "Línea",
      "FIN_Payment_Scheduledetail_ID": "Vencimiento",
      "FIN_Payment_ID": "Pago",
      "Amount": "Importe",
      "Currency": "Moneda"
    },
    "en_US": {
      "Datetrx": "Date",
      "REM_Remittance_Type_ID": "Remittance Type",
      "Name": "Name",
      "FIN_Financial_Account_ID": "Account",
      "Duedate": "Charge / Credit Date",
      "Remittance_Status": "Status",
      "DocumentNo": "Document No.",
      "Line": "Line",
      "FIN_Payment_Scheduledetail_ID": "Due Item",
      "FIN_Payment_ID": "Payment",
      "Amount": "Amount",
      "Currency": "Currency"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:RemittancePage
export default function RemittancePage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('FF8080812E71F7C7012E71FD0499001B');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="FF8080812E71F7C7012E71FD0499001B" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="remittance"
        detailEntity="lines"
        Form={RemittanceForm}
        DetailTable={LinesTable}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Remittance"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "REM_Remittance", config: {} } }]}
        bottomSection={RemittanceBottomPanel}
        headerContent={(data) => <RemittanceStatusBanner data={data} />}
        processConfirmModal={RemittanceProcessConfirmModal}
        requiredHeaderFields={requiredHeaderFields}
        detailSortBy="lineNo asc"
        titleField="name"
        statusEnumLabels={{"PE":"remittanceStatusPe","PR":"remittanceStatusPr","CT":"remittanceStatusCt","PT":"remittanceStatusPt","CP":"remittanceStatusCp","PP":"remittanceStatusPp","AN":"remittanceStatusAn"}}
        labelOverrides={labelOverrides}
        sendDocument={{"enabled":false}}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="remittance"
      Table={RemittanceTable}
      entityLabel="Remittance"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      subsetFilters={[{"label":"remittanceTabAll"},{"label":"remittanceTabCollections","filter":"criteria=%5B%7B%22fieldName%22%3A%22remittanceType%24paymentMethod%24payinAllow%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%5D"},{"label":"remittanceTabPayments","filter":"criteria=%5B%7B%22fieldName%22%3A%22remittanceType%24paymentMethod%24payoutAllow%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%5D"}]}
      hidePrint
      labelOverrides={labelOverrides}
      rowQuickActions={{"actions":{"duplicate":{"show":false},"email":{"show":false}}}}
      sendDocument={{"enabled":false}}
      listSortBy="transactionDate desc"
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:RemittancePage
