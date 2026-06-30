import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import { INVOICE_LINE_CONFIG } from '@/hooks/useLineGrossAmount';
import HeaderTable from '../../../custom/InvoiceHeaderTable';
import HeaderForm from './HeaderForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import ExchangeRatesTable from './ExchangeRatesTable';
import ExchangeRatesForm from './ExchangeRatesForm';
import RelatedDocuments from '@/windows/custom/purchase-invoice/RelatedDocuments';
import { AttachmentsTab } from '@/components/attachments';
import SifTab from '@/windows/custom/shared/SifTab.jsx';
import PurchaseInvoiceBottomPanel from '../../../custom/PurchaseInvoiceBottomPanel';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Purchase Invoice';


// @sf-generated-start summary:header
const summary = [

];

const statusField = 'documentStatus';
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
  "processField": "documentAction",
  "processValue": "CO",
  "label": "Confirm"
};
// @sf-generated-end draftMode:header

// @sf-generated-start requiredHeaderFields:header
const requiredHeaderFields = ['transactionDocument', 'invoiceDate', 'businessPartner', 'partnerAddress', 'priceList', 'paymentTerms', 'paymentMethod'];
// @sf-generated-end requiredHeaderFields:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', lookup: true, label: 'Product', reference: 'Product', inputMode: 'search', forceCalloutFields: ["listPrice","unitPrice","tax","uOM","grossUnitPrice"] },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', required: true, label: 'Invoiced Quantity', defaultValue: 1, min: 0 },
    { key: 'listPrice', column: 'PriceList', type: 'number', required: true, label: 'List Price', min: 0 },
    { key: 'etgoDiscount', column: 'EM_Etgo_Discount', type: 'number', label: 'Discount %', defaultValue: 0, min: 0, max: 100 },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', reference: 'Tax', inputMode: 'selector', forceCalloutFields: ["lineNetAmount"] },
  ],
  derived: [

  ],
  hidden: [
    { key: 'grossUnitPrice', value: '0' },
  ],
};
// @sf-generated-end addLineFields:lines

export const api = {
  "specName": "purchase-invoice",
  "baseUrl": "/sws/neo/purchase-invoice",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/header",
      "detailUrl": "/sws/neo/purchase-invoice/header/{id}",
      "supportedFilters": [
        "documentNo",
        "invoiceDate",
        "businessPartner",
        "orderReference",
        "documentStatus",
        "eTGODueDate"
      ]
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/lines",
      "detailUrl": "/sws/neo/purchase-invoice/lines/{id}",
      "supportedFilters": []
    },
    "intrastat": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/intrastat",
      "detailUrl": "/sws/neo/purchase-invoice/intrastat/{id}",
      "supportedFilters": []
    },
    "tax": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/tax",
      "detailUrl": "/sws/neo/purchase-invoice/tax/{id}",
      "supportedFilters": []
    },
    "basicDiscounts": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/basicDiscounts",
      "detailUrl": "/sws/neo/purchase-invoice/basicDiscounts/{id}",
      "supportedFilters": []
    },
    "cashVat": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/cashVat",
      "detailUrl": "/sws/neo/purchase-invoice/cashVat/{id}",
      "supportedFilters": []
    },
    "paymentPlan": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/paymentPlan",
      "detailUrl": "/sws/neo/purchase-invoice/paymentPlan/{id}",
      "supportedFilters": []
    },
    "paymentDetails": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/paymentDetails",
      "detailUrl": "/sws/neo/purchase-invoice/paymentDetails/{id}",
      "supportedFilters": []
    },
    "exchangeRates": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/exchangeRates",
      "detailUrl": "/sws/neo/purchase-invoice/exchangeRates/{id}",
      "supportedFilters": []
    },
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/accounting",
      "detailUrl": "/sws/neo/purchase-invoice/accounting/{id}",
      "supportedFilters": []
    },
    "siiData": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/siiData",
      "detailUrl": "/sws/neo/purchase-invoice/siiData/{id}",
      "supportedFilters": []
    },
    "batuz": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-invoice/batuz",
      "detailUrl": "/sws/neo/purchase-invoice/batuz/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "header",
      "field": "transactionDocument",
      "column": "C_DocTypeTarget_ID",
      "reference": "DocumentType",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/transactionDocument",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/header/selectors/businessPartner"
    },
    {
      "entity": "header",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/purchase-invoice/header/selectors/partnerAddress",
      "context": {
        "required": [
          {
            "param": "C_BPartner_ID",
            "source": "field",
            "field": "businessPartner"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "priceList",
      "column": "M_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/priceList",
      "context": {
        "required": [
          {
            "param": "isSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "paymentTerms",
      "column": "C_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/paymentTerms"
    },
    {
      "entity": "header",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/paymentMethod",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "salesOrder",
      "column": "C_Order_ID",
      "reference": "Order",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/salesOrder"
    },
    {
      "entity": "header",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/currency"
    },
    {
      "entity": "header",
      "field": "userContact",
      "column": "AD_User_ID",
      "reference": "User",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/header/selectors/userContact",
      "context": {
        "required": [
          {
            "param": "C_BPartner_ID",
            "source": "field",
            "field": "businessPartner"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "salesRepresentative",
      "column": "SalesRep_ID",
      "reference": "User",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/header/selectors/salesRepresentative"
    },
    {
      "entity": "header",
      "field": "charge",
      "column": "C_Charge_ID",
      "reference": "Charge",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/charge"
    },
    {
      "entity": "header",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/header/selectors/project",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          },
          {
            "param": "C_BPartner_ID",
            "source": "field",
            "field": "businessPartner"
          }
        ]
      }
    },
    {
      "entity": "header",
      "field": "aeatsiiPurDescription",
      "column": "EM_Aeatsii_Pur_Description_ID",
      "reference": "aeatsii_description",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/aeatsiiPurDescription"
    },
    {
      "entity": "header",
      "field": "aeatsiiCauseExemption",
      "column": "EM_Aeatsii_Cause_Exemption_ID",
      "reference": "aeatsii_cause_exemption",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/header/selectors/aeatsiiCauseExemption"
    },
    {
      "entity": "lines",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/lines/selectors/product"
    },
    {
      "entity": "lines",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/lines/selectors/tax",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          },
          {
            "param": "DateInvoiced",
            "source": "parentField",
            "field": "invoiceDate",
            "format": "DD-MM-YYYY"
          }
        ]
      }
    },
    {
      "entity": "lines",
      "field": "account",
      "column": "Account_ID",
      "reference": "GLAccount",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/lines/selectors/account"
    },
    {
      "entity": "lines",
      "field": "salesOrderLine",
      "column": "C_OrderLine_ID",
      "reference": "OrderLine",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/lines/selectors/salesOrderLine"
    },
    {
      "entity": "lines",
      "field": "goodsShipmentLine",
      "column": "M_InOutLine_ID",
      "reference": "GoodsShipmentLine",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/lines/selectors/goodsShipmentLine"
    },
    {
      "entity": "lines",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/lines/selectors/project"
    },
    {
      "entity": "lines",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/lines/selectors/costcenter"
    },
    {
      "entity": "lines",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/lines/selectors/asset"
    },
    {
      "entity": "lines",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/lines/selectors/stDimension"
    },
    {
      "entity": "lines",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/lines/selectors/ndDimension"
    },
    {
      "entity": "intrastat",
      "field": "invoiceLine",
      "column": "C_Invoiceline_ID",
      "reference": "InvoiceLine",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/intrastat/selectors/invoiceLine"
    },
    {
      "entity": "intrastat",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/intrastat/selectors/product"
    },
    {
      "entity": "intrastat",
      "field": "incoterms",
      "column": "C_Incoterms_ID",
      "reference": "Incoterms",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/intrastat/selectors/incoterms"
    },
    {
      "entity": "intrastat",
      "field": "origCountry",
      "column": "Orig_C_Country_ID",
      "reference": "Country",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/intrastat/selectors/origCountry"
    },
    {
      "entity": "intrastat",
      "field": "supplementaryUOM",
      "column": "Intr_C_Uom_ID",
      "reference": "Intr_C_Uom",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/intrastat/selectors/supplementaryUOM"
    },
    {
      "entity": "tax",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/tax/selectors/tax"
    },
    {
      "entity": "basicDiscounts",
      "field": "discount",
      "column": "C_Discount_ID",
      "reference": "Discount",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/basicDiscounts/selectors/discount"
    },
    {
      "entity": "cashVat",
      "field": "payment",
      "column": "FIN_Payment_ID",
      "reference": "Payment",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/cashVat/selectors/payment"
    },
    {
      "entity": "paymentPlan",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/paymentPlan/selectors/paymentMethod"
    },
    {
      "entity": "paymentPlan",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/paymentPlan/selectors/currency"
    },
    {
      "entity": "paymentDetails",
      "field": "finPaymentID",
      "column": "Fin_Payment_ID",
      "reference": "Payment",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/paymentDetails/selectors/finPaymentID"
    },
    {
      "entity": "exchangeRates",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/exchangeRates/selectors/currency",
      "context": {
        "required": [
          {
            "param": "C_Invoice_ID",
            "source": "parentField",
            "field": "invoice"
          },
          {
            "param": "FIN_Payment_ID",
            "source": "parentField",
            "field": "payment"
          }
        ]
      }
    },
    {
      "entity": "exchangeRates",
      "field": "toCurrency",
      "column": "C_Currency_Id_To",
      "reference": "Currency",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/exchangeRates/selectors/toCurrency"
    },
    {
      "entity": "accounting",
      "field": "accountingSchema",
      "column": "C_AcctSchema_ID",
      "reference": "AcctSchema",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/accountingSchema"
    },
    {
      "entity": "accounting",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/currency"
    },
    {
      "entity": "accounting",
      "field": "period",
      "column": "C_Period_ID",
      "reference": "Period",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/period"
    },
    {
      "entity": "accounting",
      "field": "account",
      "column": "Account_ID",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/account"
    },
    {
      "entity": "accounting",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/businessPartner"
    },
    {
      "entity": "accounting",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/product"
    },
    {
      "entity": "accounting",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/project"
    },
    {
      "entity": "accounting",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/costcenter"
    },
    {
      "entity": "accounting",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/asset"
    },
    {
      "entity": "accounting",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "User1",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/stDimension"
    },
    {
      "entity": "accounting",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "User2",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/accounting/selectors/ndDimension"
    },
    {
      "entity": "siiData",
      "field": "conexinSII",
      "column": "Aeatsii_Conexion_ID",
      "reference": "Aeatsii_Conexion",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/siiData/selectors/conexinSII"
    },
    {
      "entity": "batuz",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/purchase-invoice/batuz/selectors/invoice"
    }
  ],
  "actions": [
    {
      "entity": "header",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/generateTo",
      "processId": "142",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "aPRMAddpayment",
      "column": "EM_APRM_Addpayment",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/aPRMAddpayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "aPRMProcessinvoice",
      "column": "EM_APRM_Processinvoice",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/aPRMProcessinvoice",
      "processId": "B54318B49E984B9CB855AEFB1F474CD6",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/documentAction",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createLinesFromOrder",
      "column": "Createfromorders",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/createLinesFromOrder",
      "processId": "AB2EFCAABB7B4EC0A9B30CFB82963FB6",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "createLinesFromShipment",
      "column": "Createfrominouts",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/createLinesFromShipment",
      "processId": "7737CA7330FD49FBA7EBC225E85F2BC9",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/copyFrom",
      "processId": "210",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/aeatsiiSend",
      "processId": "2ECF46DAAEEB486EAF79D3594D50DE5F",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "aeatsiiModif",
      "column": "EM_Aeatsii_Modif",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/aeatsiiModif",
      "processId": "BAAECFDF9FF144E8A610E9F1EF3E5FBE",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "tbaiXmlgenerator",
      "column": "EM_Tbai_Xmlgenerator",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/tbaiXmlgenerator",
      "processId": "BE2486102F2C41779B760609FD69A225",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/processNow",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/createLinesFrom"
    },
    {
      "entity": "header",
      "field": "aeatsiiDup",
      "column": "EM_Aeatsii_Dup",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/aeatsiiDup",
      "processId": "92C02F9A367140C085D1EE3BD27C4E96",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "aeatsiiUnsubscribe",
      "column": "EM_Aeatsii_Unsubscribe",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/aeatsiiUnsubscribe",
      "processId": "BE564945CB2D4892AC0EE51204C5DB7D",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "etvfacRectCreate",
      "column": "EM_Etvfac_Rect_Create",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/etvfacRectCreate",
      "processId": "E36A8BA259164E78AFDDC760172C18F5",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "tBAIQRcode",
      "column": "em_tbai_qrcode",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/tBAIQRcode",
      "processId": "12FECC9DF1F4418AB7DAA46D6A05FEC6",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "tbaiVoidxmlgenerator",
      "column": "EM_Tbai_Voidxmlgenerator",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/tbaiVoidxmlgenerator",
      "processId": "535A8BAE44A34759A7C8FF40D62A5070",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "eTPRRemovePayment",
      "column": "EM_Etpr_Remove_Payment",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/eTPRRemovePayment",
      "processId": "745FCF75B6F14024B96CC14429D8E952",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/purchase-invoice/header/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/purchase-invoice/lines/{id}/action/explode",
      "processId": "6E1ADD5C8B6B4ACB82237DAA8114451E",
      "processType": "classic"
    },
    {
      "entity": "lines",
      "field": "matchLCCosts",
      "column": "Match_Lccosts",
      "url": "/sws/neo/purchase-invoice/lines/{id}/action/matchLCCosts",
      "processId": "281FFDFAB31C4394A2EAA73A6F9F3A3F",
      "processType": "obuiapp"
    },
    {
      "entity": "paymentPlan",
      "field": "updatePaymentPlan",
      "column": "Update_Payment_Plan",
      "url": "/sws/neo/purchase-invoice/paymentPlan/{id}/action/updatePaymentPlan",
      "processId": "FB740AB61B0E42B198D2C88D3A0D0CE6",
      "processType": "classic"
    },
    {
      "entity": "paymentPlan",
      "field": "aprmModifPaymentOUTPlan",
      "column": "EM_Aprm_Modif_Paym_Out_Sched",
      "url": "/sws/neo/purchase-invoice/paymentPlan/{id}/action/aprmModifPaymentOUTPlan",
      "processId": "6F87442DF7BC43AB8A666BDED2F7D64E",
      "processType": "obuiapp"
    },
    {
      "entity": "paymentPlan",
      "field": "aprmModifPaymentINPlan",
      "column": "EM_Aprm_Modif_Paym_Sched",
      "url": "/sws/neo/purchase-invoice/paymentPlan/{id}/action/aprmModifPaymentINPlan",
      "processId": "4EEB3497082C4F2182E16A4371CD5D96",
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
    "category": "purchases"
  },
  "labelOverrides": {
    "es_ES": {
      "POReference": "Nº documento",
      "OutstandingAmt": "Pendiente de pago",
      "EM_Etgo_Due_Date": "Vencimiento",
      "em_etgo_delivery_status": "Estado de recepción",
      "C_DocTypeTarget_ID": "Tipo de documento"
    },
    "en_US": {
      "POReference": "Document No.",
      "OutstandingAmt": "Pending Payment",
      "EM_Etgo_Due_Date": "Due Date",
      "em_etgo_delivery_status": "Reception Status",
      "C_DocTypeTarget_ID": "Document Type"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={HeaderForm}
        DetailTable={LinesTable}
        DetailForm={LinesForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Header"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        secondaryTabs={[
          { key: 'exchangeRates', label: 'Exchange Rates', Table: ExchangeRatesTable, Form: ExchangeRatesForm, addLineFields: { entry: [
          { key: 'toCurrency', column: 'C_Currency_Id_To', type: 'search', required: true, label: 'To Currency', reference: 'Currency', inputMode: 'search', excludeValueOf: 'currency' },
          { key: 'rate', column: 'Rate', type: 'text', label: 'Rate' },
          { key: 'foreignAmount', column: 'Foreign_Amount', type: 'number', required: true, label: 'Foreign  Amount', defaultValue: '0' },
          ], derived: [], hidden: [] }, requireSavedRecord: true, readOnlyLogic: (record) => record['documentStatus'] !== 'DR' },
        ]}
        hideDeleteWhenComplete
        noHeaderBorder
        notesField="description"
        customTabs={[{ key: 'related', labelKey: 'relatedDocuments', Component: RelatedDocuments }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Invoice", config: {} } }, { key: 'sif', labelKey: 'sifDataTabs.sectionTitle', Component: SifTab, placement: 'tab' }]}
        bottomSection={PurchaseInvoiceBottomPanel}
        menuActions={({ data, status }) => [
          { key: 'reactivate', label: 'Reactivate', visible: status === 'CO', labelKey: 'reactivate', successKey: 'reactivated', preUnpost: true, documentAction: 'RE',  },
          { key: 'post', label: 'Post', visible: !(data?.posted === 'Y' || data?.posted === true) && (data?.processed === 'Y' || data?.processed === true), labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',  }
        ]}
        draftMode={draftMode}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        lineConfig={INVOICE_LINE_CONFIG}
        linesLayout="inlineEditable"
        sendDocument={{"enabled":true,"allowEmail":false}}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Purchase Invoice"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      subsetFilters={[{"label":"allTab"},{"label":"invoicesTab","filter":"criteria=%5B%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22API%22%7D%5D"},{"label":"creditNotesTab","filter":"criteria=%5B%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22APC%22%7D%5D"}]}
      dateFilterKey="invoiceDate"
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      sendDocument={{"enabled":true,"allowEmail":false}}
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage
