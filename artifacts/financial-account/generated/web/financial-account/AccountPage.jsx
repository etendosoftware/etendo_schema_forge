import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import AccountTable from './AccountTable';
import AccountForm from './AccountForm';
import TransactionTable from './TransactionTable';
import TransactionForm from './TransactionForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Financial Account Detail';


// @sf-generated-start summary:account
const summary = [
  { key: 'currentBalance', column: 'Currentbalance', type: 'amount' },
  { key: 'pSD2SaltEdgeAccountID', column: 'EM_PSD2_Salt_Edge_Account_ID', type: 'string' },
  { key: 'pSD2CardNumber', column: 'EM_PSD2_Masked_Pan', type: 'string' },
];

const statusField = 'pSD2ConnectionStatus';
// @sf-generated-end summary:account

// @sf-generated-start extraBadges:account
const extraBadges = [

];
// @sf-generated-end extraBadges:account

// @sf-generated-start processes:account
const processes = [
  { name: 'aPRMImportBankFile', label: 'Import Statement', style: 'positive',
    displayLogicRaw: "@Type@='B'&@FIN_Matching_Algorithm_ID@!''" },
  { name: 'aPRMMatchTransactions', label: 'Match Statement', style: 'positive',
    displayLogicRaw: "@Type@='B'&@FIN_Matching_Algorithm_ID@!''&(@LASTRECON@=@DRAFTRECONCILIATION@|@DRAFTRECONCILIATION@='')" },
  { name: 'aPRMMatchTransactionsForce', label: 'Match Transactions Force', style: 'positive',
    displayLogicRaw: "@Type@='B'&@FIN_Matching_Algorithm_ID@!''&(@LASTRECON@!@DRAFTRECONCILIATION@&@DRAFTRECONCILIATION@!'')" },
  { name: 'aPRMReconcile', label: 'Reconcile', style: 'positive',
    displayLogicRaw: "@Type@='C'|@FIN_Matching_Algorithm_ID@=''" },
  { name: 'aprmAddMultiplePayments', label: 'Add Multiple Payments', style: 'positive' },
  { name: 'aprmAddtransactionpd', label: 'Add transaction process definition', style: 'positive',
    displayLogicRaw: "false" },
  { name: 'aprmFindtransactionspd', label: 'EM_Aprm_Findtransactionspd', style: 'positive',
    displayLogicRaw: "false" },
  { name: 'aprmFundsTrans', label: 'Funds Transfer', style: 'positive',
    displayLogicRaw: "@EM_Aprm_Isfundstrans_Enabled@='Y'" },
  { name: 'pSD2GetConsent', label: 'Connect Account', style: 'positive',
    displayLogicRaw: "@PSD2_ClientHasApiKey@=1 & @PSD2_HasConnections@=0 & @Type@!'C'" },
  { name: 'pSD2GetBankstatement', label: 'Get Bank Statement', style: 'positive',
    displayLogicRaw: "@PSD2_ClientHasApiKey@=1 & @PSD2_HasActiveConnections@>=1 & @Type@!'C'" },
  { name: 'psd2ReconnectFa', label: 'Reconnect Account', style: 'positive',
    displayLogicRaw: "@PSD2_ClientHasApiKey@=1 & @PSD2_HasInactiveConnections@>0 & @Type@!'C'" },
];
// @sf-generated-end processes:account

// @sf-generated-start detailProcesses:transaction
const detailProcesses = [
  { name: 'etblkpBulkposting', label: 'Bulk Posting', style: 'positive',
    displayLogicRaw: "@Processed@='Y' & @#ShowAcct@='Y'" },
  { name: 'etprReactivateTransaction', label: 'Reactivate Transaction', style: 'positive',
    displayLogicRaw: "@processed@='Y'" },
  { name: 'etprRemoveTransaction', label: 'Remove Transaction', style: 'positive',
    displayLogicRaw: "@processed@='Y'" },
];
// @sf-generated-end detailProcesses:transaction

// @sf-generated-start draftMode:account
const draftMode = null;
// @sf-generated-end draftMode:account

// @sf-generated-start requiredHeaderFields:account
const requiredHeaderFields = ['name', 'currency', 'type', 'currentBalance'];
// @sf-generated-end requiredHeaderFields:account

// @sf-generated-start addLineFields:transaction
const addLineFields = {
  entry: [
    { key: 'etprReactivateTransaction', column: 'EM_Etpr_Reactivate_Transaction', type: 'text', required: true, label: 'Reactivate Transaction', defaultValue: 'N' },
    { key: 'etprRemoveTransaction', column: 'EM_Etpr_Remove_Transaction', type: 'text', required: true, label: 'Remove Transaction', defaultValue: 'N' },
  ],
  derived: [

  ],
  hidden: [
    { key: 'posted', value: 'N' },
  ],
};
// @sf-generated-end addLineFields:transaction

export const api = {
  "specName": "financial-account-detail",
  "baseUrl": "/sws/neo/financial-account-detail",
  "crud": {
    "account": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/financial-account-detail/account",
      "detailUrl": "/sws/neo/financial-account-detail/account/{id}",
      "supportedFilters": []
    },
    "transaction": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/financial-account-detail/transaction",
      "detailUrl": "/sws/neo/financial-account-detail/transaction/{id}",
      "supportedFilters": []
    },
    "importedBankStatements": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/financial-account-detail/importedBankStatements",
      "detailUrl": "/sws/neo/financial-account-detail/importedBankStatements/{id}",
      "supportedFilters": []
    },
    "bankStatementLines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/financial-account-detail/bankStatementLines",
      "detailUrl": "/sws/neo/financial-account-detail/bankStatementLines/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "account",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/account/selectors/currency"
    },
    {
      "entity": "account",
      "field": "psd2Provider",
      "column": "EM_Psd2_Provider_ID",
      "reference": "PSD2_Provider",
      "inputMode": "search",
      "url": "/sws/neo/financial-account-detail/account/selectors/psd2Provider"
    },
    {
      "entity": "transaction",
      "field": "gLItem",
      "column": "C_Glitem_ID",
      "reference": "Glitem",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/gLItem"
    },
    {
      "entity": "transaction",
      "field": "organization",
      "column": "AD_Org_ID",
      "reference": "Org",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/organization"
    },
    {
      "entity": "transaction",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/businessPartner"
    },
    {
      "entity": "transaction",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/project"
    },
    {
      "entity": "transaction",
      "field": "costCenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/costCenter"
    },
    {
      "entity": "transaction",
      "field": "salesCampaign",
      "column": "C_Campaign_ID",
      "reference": "Campaign",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/salesCampaign"
    },
    {
      "entity": "transaction",
      "field": "activity",
      "column": "C_Activity_ID",
      "reference": "Activity",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/activity"
    },
    {
      "entity": "transaction",
      "field": "salesRegion",
      "column": "C_Salesregion_ID",
      "reference": "Salesregion",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/salesRegion"
    },
    {
      "entity": "transaction",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "User1",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/stDimension"
    },
    {
      "entity": "transaction",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "User2",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/transaction/selectors/ndDimension"
    },
    {
      "entity": "bankStatementLines",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/bankStatementLines/selectors/businessPartner"
    },
    {
      "entity": "bankStatementLines",
      "field": "gLItem",
      "column": "C_Glitem_ID",
      "reference": "Glitem",
      "inputMode": "selector",
      "url": "/sws/neo/financial-account-detail/bankStatementLines/selectors/gLItem"
    }
  ],
  "actions": [
    {
      "entity": "account",
      "field": "aPRMImportBankFile",
      "column": "EM_APRM_ImportBankFile",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/aPRMImportBankFile",
      "processId": "7AC7BE9024E448A0BB863C159DA762F9",
      "processType": "classic"
    },
    {
      "entity": "account",
      "field": "aPRMMatchTransactions",
      "column": "EM_APRM_MatchTransactions",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/aPRMMatchTransactions",
      "processId": "86F0B1EBE2BC48E3ACF458768D14CC99",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aPRMMatchTransactionsForce",
      "column": "EM_APRM_MatchTrans_Force",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/aPRMMatchTransactionsForce",
      "processId": "86F0B1EBE2BC48E3ACF458768D14CC99",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aPRMReconcile",
      "column": "EM_APRM_Reconcile",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/aPRMReconcile",
      "processId": "EB3D56BDD37E4229B67DBAB9F9A9B167",
      "processType": "classic"
    },
    {
      "entity": "account",
      "field": "aprmAddMultiplePayments",
      "column": "EM_Aprm_AddMultiplePayments",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/aprmAddMultiplePayments",
      "processId": "4CE463C04CA0412CAC57EF58FE0F8498",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aprmAddtransactionpd",
      "column": "EM_Aprm_Addtransactionpd",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/aprmAddtransactionpd",
      "processId": "E68790A7B65F4D45AB35E2BAE34C1F39",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aprmFindtransactionspd",
      "column": "EM_Aprm_Findtransactionspd",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/aprmFindtransactionspd",
      "processId": "154CB4F9274A479CB38A285E16984539",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aprmFundsTrans",
      "column": "EM_Aprm_Funds_Trans",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/aprmFundsTrans",
      "processId": "CC73C4845CDC487395804946EACB225F",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "pSD2GetConsent",
      "column": "EM_PSD2_Get_Consent",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/pSD2GetConsent",
      "processId": "C580B3B60DA5484387493A74CEB00D13",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "psd2GetConnections",
      "column": "EM_Psd2_Get_Connections",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/psd2GetConnections",
      "processId": "91C37692121944CA892C32316F56D9B4",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "pSD2GetBankstatement",
      "column": "EM_PSD2_Get_Bankstatement",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/pSD2GetBankstatement",
      "processId": "2B2635782D4C41FF9415D86C13D1E97D",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "psd2RefreshConnections",
      "column": "EM_Psd2_Refresh_Connections",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/psd2RefreshConnections",
      "processId": "83C5DBC9F05B4D38BBB3F5486B377427",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "psd2ReconnectFa",
      "column": "EM_Psd2_Reconnect_Fa",
      "url": "/sws/neo/financial-account-detail/account/{id}/action/psd2ReconnectFa",
      "processId": "F3ABCD40BD0047AF9E76071CF7D3FF04",
      "processType": "obuiapp"
    },
    {
      "entity": "transaction",
      "field": "aprmProcessed",
      "column": "EM_Aprm_Processed",
      "url": "/sws/neo/financial-account-detail/transaction/{id}/action/aprmProcessed",
      "processId": "F68F2890E96D4D85A1DEF0274D105BCE",
      "processType": "classic"
    },
    {
      "entity": "transaction",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/financial-account-detail/transaction/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "transaction",
      "field": "etprReactivateTransaction",
      "column": "EM_Etpr_Reactivate_Transaction",
      "url": "/sws/neo/financial-account-detail/transaction/{id}/action/etprReactivateTransaction",
      "processId": "BA47238DB98D4FE7A4B540760EC8226A",
      "processType": "obuiapp"
    },
    {
      "entity": "transaction",
      "field": "etprRemoveTransaction",
      "column": "EM_Etpr_Remove_Transaction",
      "url": "/sws/neo/financial-account-detail/transaction/{id}/action/etprRemoveTransaction",
      "processId": "DC4FCAC608324CB78CF92F99C1A94AD0",
      "processType": "obuiapp"
    },
    {
      "entity": "importedBankStatements",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/financial-account-detail/importedBankStatements/{id}/action/posted"
    },
    {
      "entity": "importedBankStatements",
      "field": "aPRMProcessBankStatementForce",
      "column": "EM_APRM_Process_BS_Force",
      "url": "/sws/neo/financial-account-detail/importedBankStatements/{id}/action/aPRMProcessBankStatementForce",
      "processId": "2DDE7D3618034C38A4462B7F3456C28D",
      "processType": "classic"
    },
    {
      "entity": "importedBankStatements",
      "field": "aPRMProcessBankStatement",
      "column": "EM_APRM_Process_BS",
      "url": "/sws/neo/financial-account-detail/importedBankStatements/{id}/action/aPRMProcessBankStatement",
      "processId": "58A9261BACEF45DDA526F29D8557272D",
      "processType": "classic"
    },
    {
      "entity": "importedBankStatements",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/financial-account-detail/importedBankStatements/{id}/action/etblkpBulkposting",
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
  }
};

// @sf-generated-start component:AccountPage
export default function AccountPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="account"
        detailEntity="transaction"
        Form={AccountForm}
        DetailTable={TransactionTable}
        DetailForm={TransactionForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        detailProcesses={detailProcesses}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Account"
        detailLabel="Transaction"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        requiredHeaderFields={requiredHeaderFields}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="account"
      Table={AccountTable}
      entityLabel="Financial Account Detail"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:AccountPage
