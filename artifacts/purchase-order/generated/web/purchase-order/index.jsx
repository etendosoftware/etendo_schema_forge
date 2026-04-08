import OrderPage from './OrderPage';

const windowMeta = { category: 'purchases', name: 'Purchase Order' };

const api = {
  "specName": "purchase-order",
  "baseUrl": "/sws/neo/purchase-order",
  "crud": {
    "order": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/order",
      "detailUrl": "/sws/neo/purchase-order/order/{id}",
      "supportedFilters": [
        "documentNo",
        "orderDate",
        "businessPartner",
        "documentStatus",
        "orderReference"
      ]
    },
    "orderLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/orderLine",
      "detailUrl": "/sws/neo/purchase-order/orderLine/{id}",
      "supportedFilters": []
    },
    "orderLineTax": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/orderLineTax",
      "detailUrl": "/sws/neo/purchase-order/orderLineTax/{id}",
      "supportedFilters": []
    },
    "reservedStock": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/reservedStock",
      "detailUrl": "/sws/neo/purchase-order/reservedStock/{id}",
      "supportedFilters": []
    },
    "orderTax": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/orderTax",
      "detailUrl": "/sws/neo/purchase-order/orderTax/{id}",
      "supportedFilters": []
    },
    "basicDiscounts": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/basicDiscounts",
      "detailUrl": "/sws/neo/purchase-order/basicDiscounts/{id}",
      "supportedFilters": []
    },
    "paymentPlan": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/paymentPlan",
      "detailUrl": "/sws/neo/purchase-order/paymentPlan/{id}",
      "supportedFilters": []
    },
    "paymentDetails": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/paymentDetails",
      "detailUrl": "/sws/neo/purchase-order/paymentDetails/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "order",
      "field": "transactionDocument",
      "column": "C_DocTypeTarget_ID",
      "reference": "DocumentType",
      "url": "/sws/neo/purchase-order/order/selectors/transactionDocument"
    },
    {
      "entity": "order",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/purchase-order/order/selectors/businessPartner"
    },
    {
      "entity": "order",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/purchase-order/order/selectors/partnerAddress"
    },
    {
      "entity": "order",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/order/selectors/warehouse"
    },
    {
      "entity": "order",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/order/selectors/paymentMethod"
    },
    {
      "entity": "order",
      "field": "paymentTerms",
      "column": "C_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/order/selectors/paymentTerms"
    },
    {
      "entity": "order",
      "field": "priceList",
      "column": "M_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/order/selectors/priceList"
    },
    {
      "entity": "order",
      "field": "currency",
      "column": "C_Currency_ID",
      "url": "/sws/neo/purchase-order/order/selectors/currency"
    },
    {
      "entity": "order",
      "field": "companyAgent",
      "column": "SalesRep_ID",
      "url": "/sws/neo/purchase-order/order/selectors/companyAgent"
    },
    {
      "entity": "order",
      "field": "invoiceFrom",
      "column": "BillTo_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/purchase-order/order/selectors/invoiceFrom"
    },
    {
      "entity": "order",
      "field": "incoterms",
      "column": "C_Incoterms_ID",
      "url": "/sws/neo/purchase-order/order/selectors/incoterms"
    },
    {
      "entity": "order",
      "field": "charge",
      "column": "C_Charge_ID",
      "url": "/sws/neo/purchase-order/order/selectors/charge"
    },
    {
      "entity": "order",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/purchase-order/order/selectors/project"
    },
    {
      "entity": "order",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/order/selectors/costcenter"
    },
    {
      "entity": "order",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/order/selectors/asset"
    },
    {
      "entity": "order",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/order/selectors/stDimension"
    },
    {
      "entity": "order",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/order/selectors/ndDimension"
    },
    {
      "entity": "orderLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/purchase-order/orderLine/selectors/product"
    },
    {
      "entity": "orderLine",
      "field": "operativeUOM",
      "column": "C_Aum",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/orderLine/selectors/operativeUOM"
    },
    {
      "entity": "orderLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "url": "/sws/neo/purchase-order/orderLine/selectors/uOM"
    },
    {
      "entity": "orderLine",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/orderLine/selectors/tax"
    },
    {
      "entity": "orderLine",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "url": "/sws/neo/purchase-order/orderLine/selectors/warehouse"
    },
    {
      "entity": "orderLine",
      "field": "shippingCompany",
      "column": "M_Shipper_ID",
      "reference": "Shipper",
      "url": "/sws/neo/purchase-order/orderLine/selectors/shippingCompany"
    },
    {
      "entity": "orderLine",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "url": "/sws/neo/purchase-order/orderLine/selectors/businessPartner"
    },
    {
      "entity": "orderLine",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "url": "/sws/neo/purchase-order/orderLine/selectors/partnerAddress"
    },
    {
      "entity": "orderLine",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/purchase-order/orderLine/selectors/project"
    },
    {
      "entity": "orderLine",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/orderLine/selectors/costcenter"
    },
    {
      "entity": "orderLine",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/orderLine/selectors/asset"
    },
    {
      "entity": "orderLine",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/orderLine/selectors/stDimension"
    },
    {
      "entity": "orderLine",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-order/orderLine/selectors/ndDimension"
    },
    {
      "entity": "orderLine",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "url": "/sws/neo/purchase-order/orderLine/selectors/currency"
    },
    {
      "entity": "orderLineTax",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "url": "/sws/neo/purchase-order/orderLineTax/selectors/tax"
    },
    {
      "entity": "reservedStock",
      "field": "reservation",
      "column": "M_Reservation_ID",
      "reference": "Reservation",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/reservation"
    },
    {
      "entity": "reservedStock",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/businessPartner"
    },
    {
      "entity": "reservedStock",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/storageBin"
    },
    {
      "entity": "orderTax",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "url": "/sws/neo/purchase-order/orderTax/selectors/tax"
    },
    {
      "entity": "basicDiscounts",
      "field": "discount",
      "column": "C_Discount_ID",
      "reference": "Discount",
      "url": "/sws/neo/purchase-order/basicDiscounts/selectors/discount"
    },
    {
      "entity": "paymentPlan",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "url": "/sws/neo/purchase-order/paymentPlan/selectors/paymentMethod"
    },
    {
      "entity": "paymentPlan",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "url": "/sws/neo/purchase-order/paymentPlan/selectors/currency"
    },
    {
      "entity": "paymentDetails",
      "field": "payment",
      "column": "FIN_Payment_ID",
      "reference": "Payment",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/payment"
    },
    {
      "entity": "paymentDetails",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/paymentMethod"
    },
    {
      "entity": "paymentDetails",
      "field": "finFinancialAccountID",
      "column": "Fin_Financial_Account_ID",
      "reference": "FinancialAccount",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/finFinancialAccountID"
    }
  ],
  "actions": [
    {
      "entity": "order",
      "field": "generateTemplate",
      "column": "Generatetemplate",
      "url": "/sws/neo/purchase-order/order/{id}/action/generateTemplate"
    },
    {
      "entity": "order",
      "field": "rMPickFromShipment",
      "column": "RM_PickFromShipment",
      "url": "/sws/neo/purchase-order/order/{id}/action/rMPickFromShipment"
    },
    {
      "entity": "order",
      "field": "rMReceiveMaterials",
      "column": "RM_ReceiveMaterials",
      "url": "/sws/neo/purchase-order/order/{id}/action/rMReceiveMaterials"
    },
    {
      "entity": "order",
      "field": "rMCreateInvoice",
      "column": "RM_CreateInvoice",
      "url": "/sws/neo/purchase-order/order/{id}/action/rMCreateInvoice"
    },
    {
      "entity": "order",
      "field": "aPRMAddPayment",
      "column": "EM_APRM_AddPayment",
      "url": "/sws/neo/purchase-order/order/{id}/action/aPRMAddPayment"
    },
    {
      "entity": "order",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/purchase-order/order/{id}/action/documentAction"
    },
    {
      "entity": "order",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/purchase-order/order/{id}/action/copyFrom"
    },
    {
      "entity": "order",
      "field": "copyFromPO",
      "column": "CopyFromPO",
      "url": "/sws/neo/purchase-order/order/{id}/action/copyFromPO"
    },
    {
      "entity": "order",
      "field": "rMAddOrphanLine",
      "column": "RM_AddOrphanLine",
      "url": "/sws/neo/purchase-order/order/{id}/action/rMAddOrphanLine"
    },
    {
      "entity": "order",
      "field": "createOrder",
      "column": "Convertquotation",
      "url": "/sws/neo/purchase-order/order/{id}/action/createOrder"
    },
    {
      "entity": "order",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/purchase-order/order/{id}/action/calculatePromotions"
    },
    {
      "entity": "order",
      "field": "createPOLines",
      "column": "Create_POLines",
      "url": "/sws/neo/purchase-order/order/{id}/action/createPOLines"
    },
    {
      "entity": "order",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/purchase-order/order/{id}/action/posted"
    },
    {
      "entity": "order",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/purchase-order/order/{id}/action/processNow"
    },
    {
      "entity": "order",
      "field": "cancelandreplace",
      "column": "Cancelandreplace",
      "url": "/sws/neo/purchase-order/order/{id}/action/cancelandreplace"
    },
    {
      "entity": "order",
      "field": "confirmcancelandreplace",
      "column": "Confirmcancelandreplace",
      "url": "/sws/neo/purchase-order/order/{id}/action/confirmcancelandreplace"
    },
    {
      "entity": "order",
      "field": "rMPickfromreceipt",
      "column": "RM_Pickfromreceipt",
      "url": "/sws/neo/purchase-order/order/{id}/action/rMPickfromreceipt"
    },
    {
      "entity": "orderLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/purchase-order/orderLine/{id}/action/managePrereservation"
    },
    {
      "entity": "orderLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/purchase-order/orderLine/{id}/action/explode"
    },
    {
      "entity": "orderLine",
      "field": "manageReservation",
      "column": "Manage_Reservation",
      "url": "/sws/neo/purchase-order/orderLine/{id}/action/manageReservation"
    },
    {
      "entity": "orderLine",
      "field": "selectOrderLine",
      "column": "Relate_Orderline",
      "url": "/sws/neo/purchase-order/orderLine/{id}/action/selectOrderLine"
    },
    {
      "entity": "paymentPlan",
      "field": "updatePaymentPlan",
      "column": "Update_Payment_Plan",
      "url": "/sws/neo/purchase-order/paymentPlan/{id}/action/updatePaymentPlan"
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
      "example": "_sortBy=purchase-orderDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  // @sf-custom-slot hooks:App
  return <OrderPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
