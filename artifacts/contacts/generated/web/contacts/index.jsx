import BpartnerPage from './BpartnerPage';

const windowMeta = { category: 'people', name: 'Contacts' };

const api = {
  "specName": "contacts",
  "baseUrl": "/sws/neo/contacts",
  "crud": {
    "bpartner": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpartner",
      "detailUrl": "/sws/neo/contacts/bpartner/{id}",
      "supportedFilters": [
        "name",
        "searchKey"
      ]
    },
    "bpCustomerAcct": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpCustomerAcct",
      "detailUrl": "/sws/neo/contacts/bpCustomerAcct/{id}",
      "supportedFilters": []
    },
    "bpVendorAcct": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpVendorAcct",
      "detailUrl": "/sws/neo/contacts/bpVendorAcct/{id}",
      "supportedFilters": []
    },
    "bpEmployeeAcct": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpEmployeeAcct",
      "detailUrl": "/sws/neo/contacts/bpEmployeeAcct/{id}",
      "supportedFilters": []
    },
    "bpSalcategory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpSalcategory",
      "detailUrl": "/sws/neo/contacts/bpSalcategory/{id}",
      "supportedFilters": []
    },
    "bpBankAccount": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpBankAccount",
      "detailUrl": "/sws/neo/contacts/bpBankAccount/{id}",
      "supportedFilters": []
    },
    "bpartnerDocType": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpartnerDocType",
      "detailUrl": "/sws/neo/contacts/bpartnerDocType/{id}",
      "supportedFilters": []
    },
    "bpartnerLocation": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpartnerLocation",
      "detailUrl": "/sws/neo/contacts/bpartnerLocation/{id}",
      "supportedFilters": [
        "name"
      ]
    },
    "user": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/user",
      "detailUrl": "/sws/neo/contacts/user/{id}",
      "supportedFilters": [
        "name",
        "email"
      ]
    },
    "bpartnerDiscount": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bpartnerDiscount",
      "detailUrl": "/sws/neo/contacts/bpartnerDiscount/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "bpartner",
      "field": "salaryCategory",
      "column": "C_Salary_Category_ID",
      "reference": "Salary_Category",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/salaryCategory"
    },
    {
      "entity": "bpartner",
      "field": "businessPartnerCategory",
      "column": "C_BP_Group_ID",
      "reference": "BusinessPartnerCategory",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/businessPartnerCategory"
    },
    {
      "entity": "bpartner",
      "field": "paymentTerms",
      "column": "C_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/paymentTerms"
    },
    {
      "entity": "bpartner",
      "field": "account",
      "column": "FIN_Financial_Account_ID",
      "reference": "FIN_Financial_Account",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/account"
    },
    {
      "entity": "bpartner",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/paymentMethod"
    },
    {
      "entity": "bpartner",
      "field": "priceList",
      "column": "M_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/priceList"
    },
    {
      "entity": "bpartner",
      "field": "pOFinancialAccount",
      "column": "PO_Financial_Account_ID",
      "reference": "FIN_Financial_Account",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/pOFinancialAccount"
    },
    {
      "entity": "bpartner",
      "field": "pOPaymentMethod",
      "column": "PO_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/pOPaymentMethod"
    },
    {
      "entity": "bpartner",
      "field": "pOPaymentTerms",
      "column": "PO_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/pOPaymentTerms"
    },
    {
      "entity": "bpartner",
      "field": "purchasePricelist",
      "column": "PO_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartner/selectors/purchasePricelist"
    },
    {
      "entity": "bpCustomerAcct",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpCustomerAcct/selectors/accountingSchema"
    },
    {
      "entity": "bpCustomerAcct",
      "field": "customerReceivablesNo",
      "column": "C_Receivable_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpCustomerAcct/selectors/customerReceivablesNo"
    },
    {
      "entity": "bpCustomerAcct",
      "field": "customerPrepayment",
      "column": "C_Prepayment_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpCustomerAcct/selectors/customerPrepayment"
    },
    {
      "entity": "bpVendorAcct",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpVendorAcct/selectors/accountingSchema"
    },
    {
      "entity": "bpVendorAcct",
      "field": "vendorLiability",
      "column": "V_Liability_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpVendorAcct/selectors/vendorLiability"
    },
    {
      "entity": "bpVendorAcct",
      "field": "vendorPrepayment",
      "column": "V_Prepayment_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpVendorAcct/selectors/vendorPrepayment"
    },
    {
      "entity": "bpEmployeeAcct",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpEmployeeAcct/selectors/accountingSchema"
    },
    {
      "entity": "bpSalcategory",
      "field": "salaryCategory",
      "column": "C_Salary_Category_ID",
      "reference": "Salary_Category",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpSalcategory/selectors/salaryCategory"
    },
    {
      "entity": "bpBankAccount",
      "field": "country",
      "column": "C_Country_ID",
      "reference": "Country",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpBankAccount/selectors/country"
    },
    {
      "entity": "bpBankAccount",
      "field": "userContact",
      "column": "AD_User_ID",
      "reference": "User",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpBankAccount/selectors/userContact"
    },
    {
      "entity": "bpartnerDocType",
      "field": "cDoctypeID",
      "column": "C_Doctype_ID",
      "reference": "DocType",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartnerDocType/selectors/cDoctypeID"
    },
    {
      "entity": "bpartnerLocation",
      "field": "locationAddress",
      "column": "C_Location_ID",
      "reference": "Location",
      "inputMode": "search",
      "url": "/sws/neo/contacts/bpartnerLocation/selectors/locationAddress"
    },
    {
      "entity": "bpartnerDiscount",
      "field": "discount",
      "column": "C_Discount_ID",
      "reference": "Discount",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bpartnerDiscount/selectors/discount"
    }
  ],
  "actions": [
    {
      "entity": "bpartner",
      "field": "setNewCurrency",
      "column": "Update_Currency",
      "url": "/sws/neo/contacts/bpartner/{id}/action/setNewCurrency"
    },
    {
      "entity": "user",
      "field": "grantPortalAccess",
      "column": "Grant_Portal_Access",
      "url": "/sws/neo/contacts/user/{id}/action/grantPortalAccess"
    },
    {
      "entity": "user",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/contacts/user/{id}/action/processNow"
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
      "example": "_sortBy=contactsDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  // @sf-custom-slot hooks:App
  return <BpartnerPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
