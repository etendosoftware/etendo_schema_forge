import BusinessPartnerPage from './BusinessPartnerPage';

const windowMeta = { category: 'contact', name: 'Contacts' };

const api = {
  "specName": "contacts",
  "baseUrl": "/sws/neo/contacts",
  "crud": {
    "businessPartner": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/businessPartner",
      "detailUrl": "/sws/neo/contacts/businessPartner/{id}",
      "supportedFilters": [
        "searchKey",
        "name"
      ]
    },
    "customer": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/customer",
      "detailUrl": "/sws/neo/contacts/customer/{id}",
      "supportedFilters": []
    },
    "customerAccounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/customerAccounting",
      "detailUrl": "/sws/neo/contacts/customerAccounting/{id}",
      "supportedFilters": []
    },
    "intrastatShipments": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/intrastatShipments",
      "detailUrl": "/sws/neo/contacts/intrastatShipments/{id}",
      "supportedFilters": []
    },
    "vendorCreditor": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/vendorCreditor",
      "detailUrl": "/sws/neo/contacts/vendorCreditor/{id}",
      "supportedFilters": []
    },
    "vendorAccounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/vendorAccounting",
      "detailUrl": "/sws/neo/contacts/vendorAccounting/{id}",
      "supportedFilters": []
    },
    "intrastatAdquisitions": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/intrastatAdquisitions",
      "detailUrl": "/sws/neo/contacts/intrastatAdquisitions/{id}",
      "supportedFilters": []
    },
    "employee": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/employee",
      "detailUrl": "/sws/neo/contacts/employee/{id}",
      "supportedFilters": []
    },
    "employeeAccounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/employeeAccounting",
      "detailUrl": "/sws/neo/contacts/employeeAccounting/{id}",
      "supportedFilters": []
    },
    "costSalaryCategory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/costSalaryCategory",
      "detailUrl": "/sws/neo/contacts/costSalaryCategory/{id}",
      "supportedFilters": []
    },
    "bankAccount": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/bankAccount",
      "detailUrl": "/sws/neo/contacts/bankAccount/{id}",
      "supportedFilters": []
    },
    "documentType": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/documentType",
      "detailUrl": "/sws/neo/contacts/documentType/{id}",
      "supportedFilters": []
    },
    "locationAddress": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/locationAddress",
      "detailUrl": "/sws/neo/contacts/locationAddress/{id}",
      "supportedFilters": [
        "name"
      ]
    },
    "contact": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/contact",
      "detailUrl": "/sws/neo/contacts/contact/{id}",
      "supportedFilters": [
        "name",
        "email"
      ]
    },
    "basicDiscount": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/contacts/basicDiscount",
      "detailUrl": "/sws/neo/contacts/basicDiscount/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "businessPartner",
      "field": "businessPartnerCategory",
      "column": "C_BP_Group_ID",
      "reference": "BusinessPartnerCategory",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/businessPartnerCategory"
    },
    {
      "entity": "businessPartner",
      "field": "greeting",
      "column": "C_Greeting_ID",
      "reference": "Greeting",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/greeting"
    },
    {
      "entity": "businessPartner",
      "field": "bPCurrencyID",
      "column": "BP_Currency_ID",
      "reference": "Currency",
      "inputMode": "search",
      "url": "/sws/neo/contacts/businessPartner/selectors/bPCurrencyID"
    },
    {
      "entity": "businessPartner",
      "field": "paymentTerms",
      "column": "C_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/paymentTerms"
    },
    {
      "entity": "businessPartner",
      "field": "salaryCategory",
      "column": "C_Salary_Category_ID",
      "reference": "Salary_Category",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/salaryCategory"
    },
    {
      "entity": "businessPartner",
      "field": "account",
      "column": "FIN_Financial_Account_ID",
      "reference": "FIN_Financial_Account",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/account"
    },
    {
      "entity": "businessPartner",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/paymentMethod"
    },
    {
      "entity": "businessPartner",
      "field": "priceList",
      "column": "M_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/priceList"
    },
    {
      "entity": "businessPartner",
      "field": "pOFinancialAccount",
      "column": "PO_Financial_Account_ID",
      "reference": "FIN_Financial_Account",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/pOFinancialAccount"
    },
    {
      "entity": "businessPartner",
      "field": "pOPaymentMethod",
      "column": "PO_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/pOPaymentMethod"
    },
    {
      "entity": "businessPartner",
      "field": "pOPaymentTerms",
      "column": "PO_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/pOPaymentTerms"
    },
    {
      "entity": "businessPartner",
      "field": "purchasePricelist",
      "column": "PO_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/businessPartner/selectors/purchasePricelist"
    },
    {
      "entity": "customer",
      "field": "priceList",
      "column": "M_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "search",
      "url": "/sws/neo/contacts/customer/selectors/priceList"
    },
    {
      "entity": "customer",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "search",
      "url": "/sws/neo/contacts/customer/selectors/paymentMethod"
    },
    {
      "entity": "customer",
      "field": "paymentTerms",
      "column": "C_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/customer/selectors/paymentTerms"
    },
    {
      "entity": "customer",
      "field": "account",
      "column": "FIN_Financial_Account_ID",
      "reference": "Financial_Account",
      "inputMode": "search",
      "url": "/sws/neo/contacts/customer/selectors/account"
    },
    {
      "entity": "customer",
      "field": "salesRepresentative",
      "column": "SalesRep_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/contacts/customer/selectors/salesRepresentative"
    },
    {
      "entity": "customer",
      "field": "invoiceSchedule",
      "column": "C_InvoiceSchedule_ID",
      "reference": "InvoiceSchedule",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/customer/selectors/invoiceSchedule"
    },
    {
      "entity": "customer",
      "field": "sOBPTaxCategory",
      "column": "SO_Bp_Taxcategory_ID",
      "reference": "BP_TaxCategory",
      "inputMode": "search",
      "url": "/sws/neo/contacts/customer/selectors/sOBPTaxCategory"
    },
    {
      "entity": "customerAccounting",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/customerAccounting/selectors/accountingSchema"
    },
    {
      "entity": "customerAccounting",
      "field": "customerReceivablesNo",
      "column": "C_Receivable_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/customerAccounting/selectors/customerReceivablesNo"
    },
    {
      "entity": "customerAccounting",
      "field": "customerPrepayment",
      "column": "C_Prepayment_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/customerAccounting/selectors/customerPrepayment"
    },
    {
      "entity": "intrastatShipments",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/contacts/intrastatShipments/selectors/businessPartner"
    },
    {
      "entity": "vendorCreditor",
      "field": "purchasePricelist",
      "column": "PO_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "search",
      "url": "/sws/neo/contacts/vendorCreditor/selectors/purchasePricelist"
    },
    {
      "entity": "vendorCreditor",
      "field": "pOPaymentMethod",
      "column": "PO_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "search",
      "url": "/sws/neo/contacts/vendorCreditor/selectors/pOPaymentMethod"
    },
    {
      "entity": "vendorCreditor",
      "field": "pOPaymentTerms",
      "column": "PO_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "search",
      "url": "/sws/neo/contacts/vendorCreditor/selectors/pOPaymentTerms"
    },
    {
      "entity": "vendorCreditor",
      "field": "pOFinancialAccount",
      "column": "PO_Financial_Account_ID",
      "reference": "Financial_Account",
      "inputMode": "search",
      "url": "/sws/neo/contacts/vendorCreditor/selectors/pOFinancialAccount"
    },
    {
      "entity": "vendorCreditor",
      "field": "taxCategory",
      "column": "PO_BP_TaxCategory_ID",
      "reference": "BP_TaxCategory",
      "inputMode": "search",
      "url": "/sws/neo/contacts/vendorCreditor/selectors/taxCategory"
    },
    {
      "entity": "vendorAccounting",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/vendorAccounting/selectors/accountingSchema"
    },
    {
      "entity": "vendorAccounting",
      "field": "vendorLiability",
      "column": "V_Liability_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/vendorAccounting/selectors/vendorLiability"
    },
    {
      "entity": "vendorAccounting",
      "field": "vendorPrepayment",
      "column": "V_Prepayment_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/vendorAccounting/selectors/vendorPrepayment"
    },
    {
      "entity": "intrastatAdquisitions",
      "field": "businessPartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/contacts/intrastatAdquisitions/selectors/businessPartner"
    },
    {
      "entity": "intrastatAdquisitions",
      "field": "country",
      "column": "C_Country_ID",
      "reference": "Country",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/intrastatAdquisitions/selectors/country"
    },
    {
      "entity": "employee",
      "field": "salaryCategory",
      "column": "C_Salary_Category_ID",
      "reference": "Salary_Category",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/employee/selectors/salaryCategory"
    },
    {
      "entity": "employeeAccounting",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/employeeAccounting/selectors/accountingSchema"
    },
    {
      "entity": "costSalaryCategory",
      "field": "salaryCategory",
      "column": "C_Salary_Category_ID",
      "reference": "Salary_Category",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/costSalaryCategory/selectors/salaryCategory"
    },
    {
      "entity": "bankAccount",
      "field": "country",
      "column": "C_Country_ID",
      "reference": "Country",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bankAccount/selectors/country"
    },
    {
      "entity": "bankAccount",
      "field": "userContact",
      "column": "AD_User_ID",
      "reference": "User",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/bankAccount/selectors/userContact"
    },
    {
      "entity": "documentType",
      "field": "cDoctypeID",
      "column": "C_Doctype_ID",
      "reference": "DocType",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/documentType/selectors/cDoctypeID"
    },
    {
      "entity": "locationAddress",
      "field": "locationAddress",
      "column": "C_Location_ID",
      "reference": "Location",
      "inputMode": "search",
      "url": "/sws/neo/contacts/locationAddress/selectors/locationAddress"
    },
    {
      "entity": "basicDiscount",
      "field": "discount",
      "column": "C_Discount_ID",
      "reference": "Discount",
      "inputMode": "selector",
      "url": "/sws/neo/contacts/basicDiscount/selectors/discount"
    }
  ],
  "actions": [
    {
      "entity": "businessPartner",
      "field": "setNewCurrency",
      "column": "Update_Currency",
      "url": "/sws/neo/contacts/businessPartner/{id}/action/setNewCurrency",
      "processId": "B5C942145F354ABEBC9F16235D80D776",
      "processType": "obuiapp"
    },
    {
      "entity": "customer",
      "field": "setNewCurrency",
      "column": "Update_Currency",
      "url": "/sws/neo/contacts/customer/{id}/action/setNewCurrency",
      "processId": "B5C942145F354ABEBC9F16235D80D776",
      "processType": "obuiapp"
    },
    {
      "entity": "vendorCreditor",
      "field": "setNewCurrency",
      "column": "Update_Currency",
      "url": "/sws/neo/contacts/vendorCreditor/{id}/action/setNewCurrency",
      "processId": "B5C942145F354ABEBC9F16235D80D776",
      "processType": "obuiapp"
    },
    {
      "entity": "employee",
      "field": "setNewCurrency",
      "column": "Update_Currency",
      "url": "/sws/neo/contacts/employee/{id}/action/setNewCurrency",
      "processId": "B5C942145F354ABEBC9F16235D80D776",
      "processType": "obuiapp"
    },
    {
      "entity": "contact",
      "field": "grantPortalAccess",
      "column": "Grant_Portal_Access",
      "url": "/sws/neo/contacts/contact/{id}/action/grantPortalAccess",
      "processId": "97FFD59B991D49BFB5153C309B009272",
      "processType": "obuiapp"
    },
    {
      "entity": "contact",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/contacts/contact/{id}/action/processNow"
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
  return <BusinessPartnerPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
