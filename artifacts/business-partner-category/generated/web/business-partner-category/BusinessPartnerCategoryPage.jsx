import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import BusinessPartnerCategoryTable from './BusinessPartnerCategoryTable';
import BusinessPartnerCategoryForm from './BusinessPartnerCategoryForm';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Contact / Business Partner Category';


// @sf-generated-start summary:businessPartnerCategory
const summary = [

];

const statusField = null;
// @sf-generated-end summary:businessPartnerCategory

// @sf-generated-start extraBadges:businessPartnerCategory
const extraBadges = [

];
// @sf-generated-end extraBadges:businessPartnerCategory

// @sf-generated-start processes:businessPartnerCategory
const processes = [

];
// @sf-generated-end processes:businessPartnerCategory

// @sf-generated-start draftMode:businessPartnerCategory
const draftMode = null;
// @sf-generated-end draftMode:businessPartnerCategory

// @sf-generated-start requiredHeaderFields:businessPartnerCategory
const requiredHeaderFields = ['searchKey', 'name', 'default'];
// @sf-generated-end requiredHeaderFields:businessPartnerCategory

// @sf-generated-start addLineFields:accounting
const addLineFields = {
  entry: [
    { key: 'customerReceivablesNo', column: 'C_Receivable_Acct', type: 'selector', required: true, label: 'Customer Receivables No.', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'customerPrepayment', column: 'C_Prepayment_Acct', type: 'selector', label: 'Customer Prepayment', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'writeoff', column: 'WriteOff_Acct', type: 'selector', required: true, label: 'Write-off', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'writeoffRevAcct', column: 'Writeoff_Rev_Acct', type: 'selector', label: 'Write-off Revenue', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'vendorLiability', column: 'V_Liability_Acct', type: 'selector', required: true, label: 'Vendor Liability', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'vendorPrepayment', column: 'V_Prepayment_Acct', type: 'selector', label: 'Vendor Prepayment', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'nonInvoicedReceipts', column: 'NotInvoicedReceipts_Acct', type: 'selector', label: 'Non-Invoiced Receipts', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'nonInvoicedReceivables', column: 'NotInvoicedReceivables_Acct', type: 'selector', label: 'Non-Invoiced Receivables', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'nonInvoicedRevenues', column: 'NotInvoicedRevenue_Acct', type: 'selector', label: 'Non-Invoiced Revenues', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'paymentDiscountExpense', column: 'PayDiscount_Exp_Acct', type: 'selector', label: 'Payment Discount Expense', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'paymentDiscountRevenue', column: 'PayDiscount_Rev_Acct', type: 'selector', label: 'Payment Discount Revenue', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'realizedGainAcct', column: 'RealizedGain_Acct', type: 'selector', label: 'Realized Gain Acct', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'realizedLossAcct', column: 'RealizedLoss_Acct', type: 'selector', label: 'Realized Loss Acct', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'unearnedRevenue', column: 'UnEarnedRevenue_Acct', type: 'selector', label: 'Unearned Revenue', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'unrealizedGainsAcct', column: 'UnrealizedGain_Acct', type: 'selector', label: 'Unrealized Gains Acct.', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'unrealizedLossesAcct', column: 'UnrealizedLoss_Acct', type: 'selector', label: 'Unrealized Losses Acct.', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'vendorServiceLiability', column: 'V_Liability_Services_Acct', type: 'selector', label: 'Vendor Service Liability', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'doubtfulDebtAccount', column: 'Doubtfuldebt_Acct', type: 'selector', label: 'Doubtful Debt Account', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'badDebtExpenseAccount', column: 'BadDebtExpense_Acct', type: 'selector', label: 'Bad Debt Expense Account', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'badDebtRevenueAccount', column: 'Baddebtrevenue_Acct', type: 'selector', label: 'Bad Debt Revenue Account', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'allowanceForDoubtfulDebtAccount', column: 'AllowanceForDoubtful_Acct', type: 'selector', label: 'Allowance For Doubtful Debt Account', reference: 'ValidCombination', inputMode: 'selector' },
  ],
  derived: [

  ],
  hidden: [
    { key: 'accountingSchema', fromSibling: 'accountingSchema' },
  ],
};
// @sf-generated-end addLineFields:accounting

export const api = {
  "specName": "business-partner-category",
  "baseUrl": "/sws/neo/business-partner-category",
  "crud": {
    "businessPartnerCategory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/business-partner-category/businessPartnerCategory",
      "detailUrl": "/sws/neo/business-partner-category/businessPartnerCategory/{id}",
      "supportedFilters": [
        "searchKey",
        "name"
      ]
    },
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": false,
      "listUrl": "/sws/neo/business-partner-category/accounting",
      "detailUrl": "/sws/neo/business-partner-category/accounting/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "accounting",
      "field": "customerReceivablesNo",
      "column": "C_Receivable_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/customerReceivablesNo"
    },
    {
      "entity": "accounting",
      "field": "customerPrepayment",
      "column": "C_Prepayment_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/customerPrepayment"
    },
    {
      "entity": "accounting",
      "field": "writeoff",
      "column": "WriteOff_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/writeoff"
    },
    {
      "entity": "accounting",
      "field": "writeoffRevAcct",
      "column": "Writeoff_Rev_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/writeoffRevAcct"
    },
    {
      "entity": "accounting",
      "field": "vendorLiability",
      "column": "V_Liability_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/vendorLiability"
    },
    {
      "entity": "accounting",
      "field": "vendorPrepayment",
      "column": "V_Prepayment_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/vendorPrepayment"
    },
    {
      "entity": "accounting",
      "field": "nonInvoicedReceipts",
      "column": "NotInvoicedReceipts_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/nonInvoicedReceipts"
    },
    {
      "entity": "accounting",
      "field": "nonInvoicedReceivables",
      "column": "NotInvoicedReceivables_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/nonInvoicedReceivables"
    },
    {
      "entity": "accounting",
      "field": "nonInvoicedRevenues",
      "column": "NotInvoicedRevenue_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/nonInvoicedRevenues"
    },
    {
      "entity": "accounting",
      "field": "paymentDiscountExpense",
      "column": "PayDiscount_Exp_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/paymentDiscountExpense"
    },
    {
      "entity": "accounting",
      "field": "paymentDiscountRevenue",
      "column": "PayDiscount_Rev_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/paymentDiscountRevenue"
    },
    {
      "entity": "accounting",
      "field": "realizedGainAcct",
      "column": "RealizedGain_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/realizedGainAcct"
    },
    {
      "entity": "accounting",
      "field": "realizedLossAcct",
      "column": "RealizedLoss_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/realizedLossAcct"
    },
    {
      "entity": "accounting",
      "field": "unearnedRevenue",
      "column": "UnEarnedRevenue_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/unearnedRevenue"
    },
    {
      "entity": "accounting",
      "field": "unrealizedGainsAcct",
      "column": "UnrealizedGain_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/unrealizedGainsAcct"
    },
    {
      "entity": "accounting",
      "field": "unrealizedLossesAcct",
      "column": "UnrealizedLoss_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/unrealizedLossesAcct"
    },
    {
      "entity": "accounting",
      "field": "vendorServiceLiability",
      "column": "V_Liability_Services_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/vendorServiceLiability"
    },
    {
      "entity": "accounting",
      "field": "doubtfulDebtAccount",
      "column": "Doubtfuldebt_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/doubtfulDebtAccount"
    },
    {
      "entity": "accounting",
      "field": "badDebtExpenseAccount",
      "column": "BadDebtExpense_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/badDebtExpenseAccount"
    },
    {
      "entity": "accounting",
      "field": "badDebtRevenueAccount",
      "column": "Baddebtrevenue_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/badDebtRevenueAccount"
    },
    {
      "entity": "accounting",
      "field": "allowanceForDoubtfulDebtAccount",
      "column": "AllowanceForDoubtful_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/business-partner-category/accounting/selectors/allowanceForDoubtfulDebtAccount"
    }
  ],
  "actions": [
    {
      "entity": "accounting",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/business-partner-category/accounting/{id}/action/processNow",
      "processId": "112",
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
    "category": "contact"
  }
};

// @sf-generated-start component:BusinessPartnerCategoryPage
export default function BusinessPartnerCategoryPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('192');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="192" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="businessPartnerCategory"
        detailEntity="accounting"
        Form={BusinessPartnerCategoryForm}
        DetailTable={AccountingTable}
        DetailForm={AccountingForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Business Partner Category"
        detailLabel="Accounting"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        noHeaderBorder
        toolbarBorderBottom
        whiteFormBackground
        autoSaveOnBlur
        tabsBarPaddingX="px-2"
        toolbarPaddingX="px-2"
        formCardPadding="p-2"
        formScrollPaddingX="px-2"
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_BP_Group", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        addLineGuard={(_, children) => children.length < 1}
        linesLayout="inlineEditable"
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="businessPartnerCategory"
      Table={BusinessPartnerCategoryTable}
      entityLabel="Business Partner Category"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideLink
      rowQuickActions={{}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:BusinessPartnerCategoryPage
