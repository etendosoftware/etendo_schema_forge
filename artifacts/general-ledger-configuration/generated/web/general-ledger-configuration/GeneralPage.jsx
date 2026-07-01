import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import GeneralTable from './GeneralTable';
import GeneralForm from './GeneralForm';
import DimensionesTable from './DimensionesTable';
import DimensionesForm from './DimensionesForm';
import DocumentosTable from './DocumentosTable';
import DocumentosForm from './DocumentosForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Accounting / General Ledger Configuration';


// @sf-generated-start summary:General
const summary = [
  { key: 'organization', column: 'AD_Org_ID', type: 'selector' },
];

const statusField = null;
// @sf-generated-end summary:General

// @sf-generated-start extraBadges:General
const extraBadges = [

];
// @sf-generated-end extraBadges:General

// @sf-generated-start processes:General
const processes = [

];
// @sf-generated-end processes:General

// @sf-generated-start draftMode:General
const draftMode = null;
// @sf-generated-end draftMode:General

// @sf-generated-start requiredHeaderFields:General
const requiredHeaderFields = ['organization', 'name', 'gAAP', 'currency'];
// @sf-generated-end requiredHeaderFields:General

// @sf-generated-start addLineFields:Dimensiones
const addLineFields = {
  entry: [
    { key: 'trxOrganization', column: 'Org_ID', type: 'search', lookup: true, label: 'Trx Organization', reference: 'Org', inputMode: 'search' },
    { key: 'active', column: 'IsActive', type: 'checkbox', required: true, label: 'Active' },
    { key: 'accountingElement', column: 'C_Element_ID', type: 'selector', label: 'Account Tree', reference: 'Element', inputMode: 'selector' },
    { key: 'balanced', column: 'IsBalanced', type: 'checkbox', required: true, label: 'Balanced' },
    { key: 'mandatory', column: 'IsMandatory', type: 'checkbox', required: true, label: 'Mandatory' },
    { key: 'accountElement', column: 'C_ElementValue_ID', type: 'selector', label: 'Account Element', reference: 'ElementValue', inputMode: 'selector' },
    { key: 'product', column: 'M_Product_ID', type: 'search', label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', label: 'Business Partner', reference: 'BPartner', inputMode: 'search' },
    { key: 'locationAddress', column: 'C_Location_ID', type: 'search', label: 'Location / Address', reference: 'Location', inputMode: 'search' },
    { key: 'salesRegion', column: 'C_SalesRegion_ID', type: 'selector', label: 'Sales Region', reference: 'SalesRegion', inputMode: 'selector' },
    { key: 'project', column: 'C_Project_ID', type: 'selector', label: 'Project', reference: 'Project', inputMode: 'selector' },
    { key: 'salesCampaign', column: 'C_Campaign_ID', type: 'selector', label: 'Sales Campaign', reference: 'Campaign', inputMode: 'selector' },
    { key: 'activity', column: 'C_Activity_ID', type: 'selector', label: 'Activity', reference: 'Activity', inputMode: 'selector' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:Dimensiones

export const api = {
  "specName": "general-ledger-configuration",
  "baseUrl": "/sws/neo/general-ledger-configuration",
  "crud": {
    "General": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/general-ledger-configuration/General",
      "detailUrl": "/sws/neo/general-ledger-configuration/General/{id}",
      "supportedFilters": []
    },
    "Dimensiones": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/general-ledger-configuration/Dimensiones",
      "detailUrl": "/sws/neo/general-ledger-configuration/Dimensiones/{id}",
      "supportedFilters": []
    },
    "Documentos": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/general-ledger-configuration/Documentos",
      "detailUrl": "/sws/neo/general-ledger-configuration/Documentos/{id}",
      "supportedFilters": []
    },
    "Valores por defecto": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/general-ledger-configuration/Valores por defecto",
      "detailUrl": "/sws/neo/general-ledger-configuration/Valores por defecto/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "General",
      "field": "organization",
      "column": "AD_Org_ID",
      "reference": "Org",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/General/selectors/organization"
    },
    {
      "entity": "General",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/General/selectors/currency"
    },
    {
      "entity": "Dimensiones",
      "field": "trxOrganization",
      "column": "Org_ID",
      "reference": "Org",
      "inputMode": "search",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/trxOrganization"
    },
    {
      "entity": "Dimensiones",
      "field": "accountingElement",
      "column": "C_Element_ID",
      "reference": "Element",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/accountingElement"
    },
    {
      "entity": "Dimensiones",
      "field": "accountElement",
      "column": "C_ElementValue_ID",
      "reference": "ElementValue",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/accountElement"
    },
    {
      "entity": "Dimensiones",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/product"
    },
    {
      "entity": "Dimensiones",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/businessPartner"
    },
    {
      "entity": "Dimensiones",
      "field": "locationAddress",
      "column": "C_Location_ID",
      "reference": "Location",
      "inputMode": "search",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/locationAddress"
    },
    {
      "entity": "Dimensiones",
      "field": "salesRegion",
      "column": "C_SalesRegion_ID",
      "reference": "SalesRegion",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/salesRegion"
    },
    {
      "entity": "Dimensiones",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/project"
    },
    {
      "entity": "Dimensiones",
      "field": "salesCampaign",
      "column": "C_Campaign_ID",
      "reference": "Campaign",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/salesCampaign"
    },
    {
      "entity": "Dimensiones",
      "field": "activity",
      "column": "C_Activity_ID",
      "reference": "Activity",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Dimensiones/selectors/activity"
    },
    {
      "entity": "Documentos",
      "field": "aDCreatefactTemplateID",
      "column": "AD_Createfact_Template_ID",
      "reference": "Createfact_Template",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Documentos/selectors/aDCreatefactTemplateID"
    },
    {
      "entity": "Valores por defecto",
      "field": "customerReceivablesNo",
      "column": "C_Receivable_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/customerReceivablesNo"
    },
    {
      "entity": "Valores por defecto",
      "field": "customerPrepayment",
      "column": "C_Prepayment_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/customerPrepayment"
    },
    {
      "entity": "Valores por defecto",
      "field": "writeoff",
      "column": "WriteOff_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/writeoff"
    },
    {
      "entity": "Valores por defecto",
      "field": "writeoffRevenue",
      "column": "Writeoff_Rev_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/writeoffRevenue"
    },
    {
      "entity": "Valores por defecto",
      "field": "vendorLiability",
      "column": "V_Liability_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/vendorLiability"
    },
    {
      "entity": "Valores por defecto",
      "field": "vendorPrepayment",
      "column": "V_Prepayment_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/vendorPrepayment"
    },
    {
      "entity": "Valores por defecto",
      "field": "nonInvoicedReceipts",
      "column": "NotInvoicedReceipts_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/nonInvoicedReceipts"
    },
    {
      "entity": "Valores por defecto",
      "field": "doubtfulDebtAccount",
      "column": "DoubtfulDebt_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/doubtfulDebtAccount"
    },
    {
      "entity": "Valores por defecto",
      "field": "badDebtExpenseAccount",
      "column": "Baddebtexpense_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/badDebtExpenseAccount"
    },
    {
      "entity": "Valores por defecto",
      "field": "badDebtRevenueAccount",
      "column": "BadDebtRevenue_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/badDebtRevenueAccount"
    },
    {
      "entity": "Valores por defecto",
      "field": "allowanceForDoubtfulDebtAccount",
      "column": "Allowancefordoubtful_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/allowanceForDoubtfulDebtAccount"
    },
    {
      "entity": "Valores por defecto",
      "field": "fixedAsset",
      "column": "P_Asset_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/fixedAsset"
    },
    {
      "entity": "Valores por defecto",
      "field": "productExpense",
      "column": "P_Expense_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/productExpense"
    },
    {
      "entity": "Valores por defecto",
      "field": "productDeferredExpense",
      "column": "P_Def_Expense_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/productDeferredExpense"
    },
    {
      "entity": "Valores por defecto",
      "field": "productRevenue",
      "column": "P_Revenue_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/productRevenue"
    },
    {
      "entity": "Valores por defecto",
      "field": "productDeferredRevenue",
      "column": "P_Def_Revenue_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/productDeferredRevenue"
    },
    {
      "entity": "Valores por defecto",
      "field": "productCOGS",
      "column": "P_Cogs_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/productCOGS"
    },
    {
      "entity": "Valores por defecto",
      "field": "invoicePriceVariance",
      "column": "P_InvoicePriceVariance_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/invoicePriceVariance"
    },
    {
      "entity": "Valores por defecto",
      "field": "productRevenueReturn",
      "column": "P_Revenue_Return_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/productRevenueReturn"
    },
    {
      "entity": "Valores por defecto",
      "field": "productCOGSReturn",
      "column": "P_Cogs_Return_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/productCOGSReturn"
    },
    {
      "entity": "Valores por defecto",
      "field": "warehouseDifferences",
      "column": "W_Differences_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/warehouseDifferences"
    },
    {
      "entity": "Valores por defecto",
      "field": "inventoryRevaluation",
      "column": "W_Revaluation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/inventoryRevaluation"
    },
    {
      "entity": "Valores por defecto",
      "field": "workInProgress",
      "column": "PJ_WIP_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/workInProgress"
    },
    {
      "entity": "Valores por defecto",
      "field": "bankAsset",
      "column": "B_Asset_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/bankAsset"
    },
    {
      "entity": "Valores por defecto",
      "field": "bankInTransit",
      "column": "B_InTransit_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/bankInTransit"
    },
    {
      "entity": "Valores por defecto",
      "field": "bankExpense",
      "column": "B_Expense_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/bankExpense"
    },
    {
      "entity": "Valores por defecto",
      "field": "bankRevaluationGain",
      "column": "B_RevaluationGain_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/bankRevaluationGain"
    },
    {
      "entity": "Valores por defecto",
      "field": "bankRevaluationLoss",
      "column": "B_RevaluationLoss_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/bankRevaluationLoss"
    },
    {
      "entity": "Valores por defecto",
      "field": "taxDue",
      "column": "T_Due_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/taxDue"
    },
    {
      "entity": "Valores por defecto",
      "field": "taxCredit",
      "column": "T_Credit_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/taxCredit"
    },
    {
      "entity": "Valores por defecto",
      "field": "tDueTransAcct",
      "column": "T_Due_Trans_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/tDueTransAcct"
    },
    {
      "entity": "Valores por defecto",
      "field": "tCreditTransAcct",
      "column": "T_Credit_Trans_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/tCreditTransAcct"
    },
    {
      "entity": "Valores por defecto",
      "field": "cashBookAsset",
      "column": "CB_Asset_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/cashBookAsset"
    },
    {
      "entity": "Valores por defecto",
      "field": "cashBookDifferences",
      "column": "CB_Differences_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/cashBookDifferences"
    },
    {
      "entity": "Valores por defecto",
      "field": "cashTransfer",
      "column": "CB_CashTransfer_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/cashTransfer"
    },
    {
      "entity": "Valores por defecto",
      "field": "depreciation",
      "column": "A_Depreciation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/depreciation"
    },
    {
      "entity": "Valores por defecto",
      "field": "accumulatedDepreciation",
      "column": "A_Accumdepreciation_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/accumulatedDepreciation"
    },
    {
      "entity": "Valores por defecto",
      "field": "taxExpense",
      "column": "T_Expense_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/taxExpense"
    },
    {
      "entity": "Valores por defecto",
      "field": "disposalGain",
      "column": "A_Disposal_Gain",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/disposalGain"
    },
    {
      "entity": "Valores por defecto",
      "field": "disposalLoss",
      "column": "A_Disposal_Loss",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/selectors/disposalLoss"
    }
  ],
  "actions": [
    {
      "entity": "Valores por defecto",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/general-ledger-configuration/Valores por defecto/{id}/action/processNow",
      "processId": "108",
      "processType": "classic"
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
    "category": "accounting"
  }
};

// @sf-generated-start component:GeneralPage
export default function GeneralPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="General"
        detailEntity="Dimensiones"
        Form={GeneralForm}
        DetailTable={DimensionesTable}
        DetailForm={DimensionesForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="General"
        detailLabel="Dimension"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'Documentos', label: 'Documents', Table: DocumentosTable, Form: DocumentosForm },
        ]}
        requiredHeaderFields={requiredHeaderFields}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="General"
      Table={GeneralTable}
      entityLabel="General Ledger Configuration"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:GeneralPage
