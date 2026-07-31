import { useMemo, useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import AccountTable from '../../../custom/AccountsHeaderTable';
import AccountForm from './AccountForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Accounts';


// @sf-generated-start summary:account
const summary = [
  { key: 'default', column: 'Isdefault', type: 'boolean' },
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

// @sf-generated-start draftMode:account
const draftMode = null;
// @sf-generated-end draftMode:account

// @sf-generated-start requiredHeaderFields:account
const requiredHeaderFields = ['name', 'currency', 'type', 'default', 'currentBalance'];
// @sf-generated-end requiredHeaderFields:account



export const api = {
  "specName": "accounts",
  "baseUrl": "/sws/neo/accounts",
  "crud": {
    "account": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/accounts/account",
      "detailUrl": "/sws/neo/accounts/account/{id}",
      "supportedFilters": []
    },
    "transaction": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/accounts/transaction",
      "detailUrl": "/sws/neo/accounts/transaction/{id}",
      "supportedFilters": []
    },
    "accountingConfiguration": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/accounts/accountingConfiguration",
      "detailUrl": "/sws/neo/accounts/accountingConfiguration/{id}",
      "supportedFilters": []
    },
    "importedBankStatements": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/accounts/importedBankStatements",
      "detailUrl": "/sws/neo/accounts/importedBankStatements/{id}",
      "supportedFilters": []
    },
    "bankStatementLines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/accounts/bankStatementLines",
      "detailUrl": "/sws/neo/accounts/bankStatementLines/{id}",
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
      "url": "/sws/neo/accounts/account/selectors/currency"
    },
    {
      "entity": "account",
      "field": "psd2Provider",
      "column": "EM_Psd2_Provider_ID",
      "reference": "PSD2_Provider",
      "inputMode": "search",
      "url": "/sws/neo/accounts/account/selectors/psd2Provider"
    },
    {
      "entity": "transaction",
      "field": "gLItem",
      "column": "C_Glitem_ID",
      "reference": "Glitem",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/gLItem"
    },
    {
      "entity": "transaction",
      "field": "organization",
      "column": "AD_Org_ID",
      "reference": "Org",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/organization"
    },
    {
      "entity": "transaction",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/accounts/transaction/selectors/businessPartner"
    },
    {
      "entity": "transaction",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/project"
    },
    {
      "entity": "transaction",
      "field": "costCenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/costCenter"
    },
    {
      "entity": "transaction",
      "field": "salesCampaign",
      "column": "C_Campaign_ID",
      "reference": "Campaign",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/salesCampaign"
    },
    {
      "entity": "transaction",
      "field": "activity",
      "column": "C_Activity_ID",
      "reference": "Activity",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/activity"
    },
    {
      "entity": "transaction",
      "field": "salesRegion",
      "column": "C_Salesregion_ID",
      "reference": "Salesregion",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/salesRegion"
    },
    {
      "entity": "transaction",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "User1",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/stDimension"
    },
    {
      "entity": "transaction",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "User2",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/transaction/selectors/ndDimension"
    },
    {
      "entity": "accountingConfiguration",
      "field": "fINAssetAcct",
      "column": "FIN_Asset_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/accountingConfiguration/selectors/fINAssetAcct"
    },
    {
      "entity": "accountingConfiguration",
      "field": "fINTransitoryAcct",
      "column": "FIN_Transitory_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/accountingConfiguration/selectors/fINTransitoryAcct"
    },
    {
      "entity": "bankStatementLines",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/bankStatementLines/selectors/businessPartner"
    },
    {
      "entity": "bankStatementLines",
      "field": "gLItem",
      "column": "C_Glitem_ID",
      "reference": "Glitem",
      "inputMode": "selector",
      "url": "/sws/neo/accounts/bankStatementLines/selectors/gLItem"
    }
  ],
  "actions": [
    {
      "entity": "account",
      "field": "aPRMImportBankFile",
      "column": "EM_APRM_ImportBankFile",
      "url": "/sws/neo/accounts/account/{id}/action/aPRMImportBankFile",
      "processId": "7AC7BE9024E448A0BB863C159DA762F9",
      "processType": "classic"
    },
    {
      "entity": "account",
      "field": "aPRMMatchTransactions",
      "column": "EM_APRM_MatchTransactions",
      "url": "/sws/neo/accounts/account/{id}/action/aPRMMatchTransactions",
      "processId": "86F0B1EBE2BC48E3ACF458768D14CC99",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aPRMMatchTransactionsForce",
      "column": "EM_APRM_MatchTrans_Force",
      "url": "/sws/neo/accounts/account/{id}/action/aPRMMatchTransactionsForce",
      "processId": "86F0B1EBE2BC48E3ACF458768D14CC99",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aPRMReconcile",
      "column": "EM_APRM_Reconcile",
      "url": "/sws/neo/accounts/account/{id}/action/aPRMReconcile",
      "processId": "EB3D56BDD37E4229B67DBAB9F9A9B167",
      "processType": "classic"
    },
    {
      "entity": "account",
      "field": "aprmAddMultiplePayments",
      "column": "EM_Aprm_AddMultiplePayments",
      "url": "/sws/neo/accounts/account/{id}/action/aprmAddMultiplePayments",
      "processId": "4CE463C04CA0412CAC57EF58FE0F8498",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aprmAddtransactionpd",
      "column": "EM_Aprm_Addtransactionpd",
      "url": "/sws/neo/accounts/account/{id}/action/aprmAddtransactionpd",
      "processId": "E68790A7B65F4D45AB35E2BAE34C1F39",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aprmFindtransactionspd",
      "column": "EM_Aprm_Findtransactionspd",
      "url": "/sws/neo/accounts/account/{id}/action/aprmFindtransactionspd",
      "processId": "154CB4F9274A479CB38A285E16984539",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "aprmFundsTrans",
      "column": "EM_Aprm_Funds_Trans",
      "url": "/sws/neo/accounts/account/{id}/action/aprmFundsTrans",
      "processId": "CC73C4845CDC487395804946EACB225F",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "pSD2GetConsent",
      "column": "EM_PSD2_Get_Consent",
      "url": "/sws/neo/accounts/account/{id}/action/pSD2GetConsent",
      "processId": "C580B3B60DA5484387493A74CEB00D13",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "psd2GetConnections",
      "column": "EM_Psd2_Get_Connections",
      "url": "/sws/neo/accounts/account/{id}/action/psd2GetConnections",
      "processId": "91C37692121944CA892C32316F56D9B4",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "pSD2GetBankstatement",
      "column": "EM_PSD2_Get_Bankstatement",
      "url": "/sws/neo/accounts/account/{id}/action/pSD2GetBankstatement",
      "processId": "2B2635782D4C41FF9415D86C13D1E97D",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "psd2RefreshConnections",
      "column": "EM_Psd2_Refresh_Connections",
      "url": "/sws/neo/accounts/account/{id}/action/psd2RefreshConnections",
      "processId": "83C5DBC9F05B4D38BBB3F5486B377427",
      "processType": "obuiapp"
    },
    {
      "entity": "account",
      "field": "psd2ReconnectFa",
      "column": "EM_Psd2_Reconnect_Fa",
      "url": "/sws/neo/accounts/account/{id}/action/psd2ReconnectFa",
      "processId": "F3ABCD40BD0047AF9E76071CF7D3FF04",
      "processType": "obuiapp"
    },
    {
      "entity": "transaction",
      "field": "aprmProcessed",
      "column": "EM_Aprm_Processed",
      "url": "/sws/neo/accounts/transaction/{id}/action/aprmProcessed",
      "processId": "F68F2890E96D4D85A1DEF0274D105BCE",
      "processType": "classic"
    },
    {
      "entity": "transaction",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/accounts/transaction/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "transaction",
      "field": "etprReactivateTransaction",
      "column": "EM_Etpr_Reactivate_Transaction",
      "url": "/sws/neo/accounts/transaction/{id}/action/etprReactivateTransaction",
      "processId": "BA47238DB98D4FE7A4B540760EC8226A",
      "processType": "obuiapp"
    },
    {
      "entity": "transaction",
      "field": "etprRemoveTransaction",
      "column": "EM_Etpr_Remove_Transaction",
      "url": "/sws/neo/accounts/transaction/{id}/action/etprRemoveTransaction",
      "processId": "DC4FCAC608324CB78CF92F99C1A94AD0",
      "processType": "obuiapp"
    },
    {
      "entity": "importedBankStatements",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/accounts/importedBankStatements/{id}/action/posted"
    },
    {
      "entity": "importedBankStatements",
      "field": "aPRMProcessBankStatementForce",
      "column": "EM_APRM_Process_BS_Force",
      "url": "/sws/neo/accounts/importedBankStatements/{id}/action/aPRMProcessBankStatementForce",
      "processId": "2DDE7D3618034C38A4462B7F3456C28D",
      "processType": "classic"
    },
    {
      "entity": "importedBankStatements",
      "field": "aPRMProcessBankStatement",
      "column": "EM_APRM_Process_BS",
      "url": "/sws/neo/accounts/importedBankStatements/{id}/action/aPRMProcessBankStatement",
      "processId": "58A9261BACEF45DDA526F29D8557272D",
      "processType": "classic"
    },
    {
      "entity": "importedBankStatements",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/accounts/importedBankStatements/{id}/action/etblkpBulkposting",
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
    "en_US": {
      "pendingCount": "Pending"
    },
    "es_ES": {
      "pendingCount": "Por conciliar"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:AccountPage
export default function AccountPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('94EAA455D2644E04AB25D93BE5157B6D');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="94EAA455D2644E04AB25D93BE5157B6D" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="account"
        Form={AccountForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Account"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        hideMoreMenu
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "FIN_Financial_Account", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="account"
      Table={AccountTable}
      entityLabel="Accounts"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      hideCreate
      hideMoreMenu
      hideListFilters
      labelOverrides={labelOverrides}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:AccountPage
