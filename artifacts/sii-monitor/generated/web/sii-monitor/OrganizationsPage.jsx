import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import OrganizationsTable from './OrganizationsTable';
import OrganizationsForm from './OrganizationsForm';
import IssuedInvoicesTable from './IssuedInvoicesTable';
import IssuedInvoicesForm from './IssuedInvoicesForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Monitor / SII Monitor';


// @sf-generated-start summary:organizations
const summary = [

];

const statusField = null;
// @sf-generated-end summary:organizations

// @sf-generated-start extraBadges:organizations
const extraBadges = [

];
// @sf-generated-end extraBadges:organizations

// @sf-generated-start processes:organizations
const processes = [
  { name: 'updateInvoices', label: 'Update pre-SII invoices', style: 'positive' },
];
// @sf-generated-end processes:organizations

// @sf-generated-start detailProcesses:issuedInvoices
const detailProcesses = [
  { name: 'aeatsiiSend', label: 'Send to SII', style: 'positive',
    displayLogicRaw: "@EM_Aeatsii_Error_Registral@='N'" },
  { name: 'aeatsiiModif', label: 'Modification in SII', style: 'positive',
    displayLogicRaw: "@EM_Aeatsii_Error_Registral@='Y'" },
  { name: 'aeatsiiDup', label: 'Correct synchronization error', style: 'positive',
    displayLogicRaw: "@EM_Aeatsii_Error_Code@='3000'" },
];
// @sf-generated-end detailProcesses:issuedInvoices

// @sf-generated-start draftMode:organizations
const draftMode = null;
// @sf-generated-end draftMode:organizations

// @sf-generated-start requiredHeaderFields:organizations
const requiredHeaderFields = ['acogidaAlSII', 'name', 'recc', 'updateInvoices'];
// @sf-generated-end requiredHeaderFields:organizations

// @sf-generated-start addLineFields:issuedInvoices
const addLineFields = {
  entry: [
    { key: 'aeatsiiInvoice', column: 'EM_Aeatsii_Invoice_ID', type: 'selector', label: 'Invoice', reference: 'Invoice', inputMode: 'selector' },
    { key: 'invoiceDate', column: 'DateInvoiced', type: 'date', required: true, label: 'Invoice Date' },
    { key: 'etsgDateOperation', column: 'EM_Etsg_Date_Operation', type: 'date', label: 'Fecha operación', defaultValue: '@DateInvoiced@' },
    { key: 'accountingDate', column: 'DateAcct', type: 'date', required: true, label: 'Accounting Date' },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', required: true, lookup: true, label: 'Business Partner', reference: 'BPartner', inputMode: 'search' },
    { key: 'aeatsiiClaveTipo', column: 'EM_Aeatsii_Clave_Tipo', type: 'select', label: 'Invoice type key', defaultValue: '@SQL=SELECT CASE WHEN ((SELECT c.insiisystem FROM aeatsii_config c WHERE c.ad_org_id = (SELECT ad_get_org_le_bu(@AD_Org_ID@,\'LE\') FROM dual))=\'Y\') THEN \'F1\' ELSE null END FROM dual' },
    { key: 'aeatsiiMotivoRectif', column: 'EM_Aeatsii_Motivo_Rectif', type: 'select', label: 'Rectification reason' },
    { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', required: true, label: 'Payment Method', reference: 'Paymentmethod', inputMode: 'selector' },
    { key: 'aeatsiiSend', column: 'EM_Aeatsii_Send', type: 'text', required: true, label: 'Send to SII', defaultValue: 'N' },
    { key: 'aeatsiiModif', column: 'EM_Aeatsii_Modif', type: 'text', required: true, label: 'Modification in SII', defaultValue: 'N' },
    { key: 'aeatsiiErrorRegistral', column: 'EM_Aeatsii_Error_Registral', type: 'checkbox', required: true, label: 'Register Error Modified' },
    { key: 'aeatsiiDup', column: 'EM_Aeatsii_Dup', type: 'text', required: true, label: 'Correct synchronization error', defaultValue: 'N' },
    { key: 'aeatsiiErrorCode', column: 'EM_Aeatsii_Error_Code', type: 'text', label: 'SII error code' },
    { key: 'aeatsiiErrorMsg', column: 'EM_Aeatsii_Error_Msg', type: 'text', label: 'SII error message' },
    { key: 'aeatsiiInsiidate', column: 'EM_Aeatsii_Insiidate', type: 'date', label: 'SII registry date' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:issuedInvoices

export const api = {
  "specName": "sii-monitor",
  "baseUrl": "/sws/neo/sii-monitor",
  "crud": {
    "organizations": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/organizations",
      "detailUrl": "/sws/neo/sii-monitor/organizations/{id}",
      "supportedFilters": []
    },
    "issuedInvoices": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/issuedInvoices",
      "detailUrl": "/sws/neo/sii-monitor/issuedInvoices/{id}",
      "supportedFilters": []
    },
    "issuedInvoicesSiiData": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/issuedInvoicesSiiData",
      "detailUrl": "/sws/neo/sii-monitor/issuedInvoicesSiiData/{id}",
      "supportedFilters": []
    },
    "receivedInvoices": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/receivedInvoices",
      "detailUrl": "/sws/neo/sii-monitor/receivedInvoices/{id}",
      "supportedFilters": []
    },
    "receivedInvoicesSiiData": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/receivedInvoicesSiiData",
      "detailUrl": "/sws/neo/sii-monitor/receivedInvoicesSiiData/{id}",
      "supportedFilters": []
    },
    "cashCriterionPayments": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/cashCriterionPayments",
      "detailUrl": "/sws/neo/sii-monitor/cashCriterionPayments/{id}",
      "supportedFilters": []
    },
    "paymentsSiiData": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/paymentsSiiData",
      "detailUrl": "/sws/neo/sii-monitor/paymentsSiiData/{id}",
      "supportedFilters": []
    },
    "issuedInvoices(previousPeriod)": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)",
      "detailUrl": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}",
      "supportedFilters": []
    },
    "issuedInvoices(previousPeriod)SiiData": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)SiiData",
      "detailUrl": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)SiiData/{id}",
      "supportedFilters": []
    },
    "receivedInvoices(previousPeriod)": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)",
      "detailUrl": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}",
      "supportedFilters": []
    },
    "receivedInvoices(previousPeriod)SiiData": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)SiiData",
      "detailUrl": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)SiiData/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "issuedInvoices",
      "field": "aeatsiiInvoice",
      "column": "EM_Aeatsii_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/issuedInvoices/selectors/aeatsiiInvoice"
    },
    {
      "entity": "issuedInvoices",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/sii-monitor/issuedInvoices/selectors/businessPartner"
    },
    {
      "entity": "issuedInvoices",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/issuedInvoices/selectors/paymentMethod",
      "context": {
        "optional": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "issuedInvoicesSiiData",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/issuedInvoicesSiiData/selectors/invoice"
    },
    {
      "entity": "issuedInvoicesSiiData",
      "field": "conexinSII",
      "column": "Aeatsii_Conexion_ID",
      "reference": "Aeatsii_Conexion",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/issuedInvoicesSiiData/selectors/conexinSII"
    },
    {
      "entity": "receivedInvoices",
      "field": "aeatsiiInvoice",
      "column": "EM_Aeatsii_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/receivedInvoices/selectors/aeatsiiInvoice"
    },
    {
      "entity": "receivedInvoices",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/sii-monitor/receivedInvoices/selectors/businessPartner"
    },
    {
      "entity": "receivedInvoices",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/receivedInvoices/selectors/paymentMethod",
      "context": {
        "optional": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "receivedInvoicesSiiData",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/receivedInvoicesSiiData/selectors/invoice"
    },
    {
      "entity": "receivedInvoicesSiiData",
      "field": "conexinSII",
      "column": "Aeatsii_Conexion_ID",
      "reference": "Aeatsii_Conexion",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/receivedInvoicesSiiData/selectors/conexinSII"
    },
    {
      "entity": "cashCriterionPayments",
      "field": "bpartner",
      "column": "C_Bpartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/sii-monitor/cashCriterionPayments/selectors/bpartner"
    },
    {
      "entity": "cashCriterionPayments",
      "field": "fINPaymentmethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/cashCriterionPayments/selectors/fINPaymentmethod"
    },
    {
      "entity": "cashCriterionPayments",
      "field": "fINPayment",
      "column": "FIN_Payment_ID",
      "reference": "Payment",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/cashCriterionPayments/selectors/fINPayment"
    },
    {
      "entity": "cashCriterionPayments",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/cashCriterionPayments/selectors/currency"
    },
    {
      "entity": "cashCriterionPayments",
      "field": "fINPaymentDetail",
      "column": "FIN_Payment_Detail_ID",
      "reference": "Payment_Detail",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/cashCriterionPayments/selectors/fINPaymentDetail"
    },
    {
      "entity": "cashCriterionPayments",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/cashCriterionPayments/selectors/invoice"
    },
    {
      "entity": "paymentsSiiData",
      "field": "fINPayment",
      "column": "FIN_Payment_ID",
      "reference": "Payment",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/paymentsSiiData/selectors/fINPayment"
    },
    {
      "entity": "paymentsSiiData",
      "field": "aeatsiiConexion",
      "column": "Aeatsii_Conexion_ID",
      "reference": "Aeatsii_Conexion",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/paymentsSiiData/selectors/aeatsiiConexion"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "aeatsiiInvoice",
      "column": "EM_Aeatsii_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/selectors/aeatsiiInvoice"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/selectors/businessPartner"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/selectors/paymentMethod",
      "context": {
        "optional": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "issuedInvoices(previousPeriod)SiiData",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)SiiData/selectors/invoice"
    },
    {
      "entity": "issuedInvoices(previousPeriod)SiiData",
      "field": "conexinSII",
      "column": "Aeatsii_Conexion_ID",
      "reference": "Aeatsii_Conexion",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)SiiData/selectors/conexinSII"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "aeatsiiInvoice",
      "column": "EM_Aeatsii_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/selectors/aeatsiiInvoice"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/selectors/businessPartner"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/selectors/paymentMethod",
      "context": {
        "optional": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          }
        ]
      }
    },
    {
      "entity": "receivedInvoices(previousPeriod)SiiData",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)SiiData/selectors/invoice"
    },
    {
      "entity": "receivedInvoices(previousPeriod)SiiData",
      "field": "conexinSII",
      "column": "Aeatsii_Conexion_ID",
      "reference": "Aeatsii_Conexion",
      "inputMode": "selector",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)SiiData/selectors/conexinSII"
    }
  ],
  "actions": [
    {
      "entity": "organizations",
      "field": "informeltimaConexinSII",
      "column": "BTN_Imprimir",
      "url": "/sws/neo/sii-monitor/organizations/{id}/action/informeltimaConexinSII",
      "processId": "3D2FDB6FC2BE4F549BA72A98ABD95F8A",
      "processType": "obuiapp"
    },
    {
      "entity": "organizations",
      "field": "updateInvoices",
      "column": "Update_Invoices",
      "url": "/sws/neo/sii-monitor/organizations/{id}/action/updateInvoices",
      "processId": "47EA4A31145142CCA33C786DFD984041",
      "processType": "obuiapp"
    },
    {
      "entity": "organizations",
      "field": "nuevaConsultaFacturasASII",
      "column": "BTN_Consultar_Fact",
      "url": "/sws/neo/sii-monitor/organizations/{id}/action/nuevaConsultaFacturasASII",
      "processId": "0662F6BC8D604AAEA5A2DD49E87F4B65",
      "processType": "obuiapp"
    },
    {
      "entity": "organizations",
      "field": "validHash",
      "column": "Valid_Hash",
      "url": "/sws/neo/sii-monitor/organizations/{id}/action/validHash",
      "processId": "3C55FFE46CA940B6819DE3BBA19437E6",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/aeatsiiSend",
      "processId": "2ECF46DAAEEB486EAF79D3594D50DE5F",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "aeatsiiModif",
      "column": "EM_Aeatsii_Modif",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/aeatsiiModif",
      "processId": "BAAECFDF9FF144E8A610E9F1EF3E5FBE",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/posted"
    },
    {
      "entity": "issuedInvoices",
      "field": "aeatsiiDup",
      "column": "EM_Aeatsii_Dup",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/aeatsiiDup",
      "processId": "92C02F9A367140C085D1EE3BD27C4E96",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "aeatsiiUnsubscribe",
      "column": "EM_Aeatsii_Unsubscribe",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/aeatsiiUnsubscribe",
      "processId": "BE564945CB2D4892AC0EE51204C5DB7D",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/copyFrom",
      "processId": "210",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/createLinesFrom"
    },
    {
      "entity": "issuedInvoices",
      "field": "createLinesFromShipment",
      "column": "Createfrominouts",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/createLinesFromShipment",
      "processId": "7737CA7330FD49FBA7EBC225E85F2BC9",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "createLinesFromOrder",
      "column": "Createfromorders",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/createLinesFromOrder",
      "processId": "AB2EFCAABB7B4EC0A9B30CFB82963FB6",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/documentAction",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices",
      "field": "aPRMAddpayment",
      "column": "EM_APRM_Addpayment",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/aPRMAddpayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "aPRMProcessinvoice",
      "column": "EM_APRM_Processinvoice",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/aPRMProcessinvoice",
      "processId": "B54318B49E984B9CB855AEFB1F474CD6",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices",
      "field": "etvfacRectCreate",
      "column": "EM_Etvfac_Rect_Create",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/etvfacRectCreate",
      "processId": "E36A8BA259164E78AFDDC760172C18F5",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "tBAIQRcode",
      "column": "em_tbai_qrcode",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/tBAIQRcode",
      "processId": "12FECC9DF1F4418AB7DAA46D6A05FEC6",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "tbaiVoidxmlgenerator",
      "column": "EM_Tbai_Voidxmlgenerator",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/tbaiVoidxmlgenerator",
      "processId": "535A8BAE44A34759A7C8FF40D62A5070",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "tbaiXmlgenerator",
      "column": "EM_Tbai_Xmlgenerator",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/tbaiXmlgenerator",
      "processId": "BE2486102F2C41779B760609FD69A225",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/generateTo",
      "processId": "142",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/processNow",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices",
      "field": "eTPRRemovePayment",
      "column": "EM_Etpr_Remove_Payment",
      "url": "/sws/neo/sii-monitor/issuedInvoices/{id}/action/eTPRRemovePayment",
      "processId": "745FCF75B6F14024B96CC14429D8E952",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/aeatsiiSend",
      "processId": "2ECF46DAAEEB486EAF79D3594D50DE5F",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "aeatsiiModif",
      "column": "EM_Aeatsii_Modif",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/aeatsiiModif",
      "processId": "BAAECFDF9FF144E8A610E9F1EF3E5FBE",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/posted"
    },
    {
      "entity": "receivedInvoices",
      "field": "aeatsiiDup",
      "column": "EM_Aeatsii_Dup",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/aeatsiiDup",
      "processId": "92C02F9A367140C085D1EE3BD27C4E96",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "aeatsiiUnsubscribe",
      "column": "EM_Aeatsii_Unsubscribe",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/aeatsiiUnsubscribe",
      "processId": "BE564945CB2D4892AC0EE51204C5DB7D",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/copyFrom",
      "processId": "210",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/createLinesFrom"
    },
    {
      "entity": "receivedInvoices",
      "field": "createLinesFromShipment",
      "column": "Createfrominouts",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/createLinesFromShipment",
      "processId": "7737CA7330FD49FBA7EBC225E85F2BC9",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "createLinesFromOrder",
      "column": "Createfromorders",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/createLinesFromOrder",
      "processId": "AB2EFCAABB7B4EC0A9B30CFB82963FB6",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/documentAction",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices",
      "field": "aPRMAddpayment",
      "column": "EM_APRM_Addpayment",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/aPRMAddpayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "aPRMProcessinvoice",
      "column": "EM_APRM_Processinvoice",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/aPRMProcessinvoice",
      "processId": "B54318B49E984B9CB855AEFB1F474CD6",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices",
      "field": "etvfacRectCreate",
      "column": "EM_Etvfac_Rect_Create",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/etvfacRectCreate",
      "processId": "E36A8BA259164E78AFDDC760172C18F5",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "tBAIQRcode",
      "column": "em_tbai_qrcode",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/tBAIQRcode",
      "processId": "12FECC9DF1F4418AB7DAA46D6A05FEC6",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "tbaiVoidxmlgenerator",
      "column": "EM_Tbai_Voidxmlgenerator",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/tbaiVoidxmlgenerator",
      "processId": "535A8BAE44A34759A7C8FF40D62A5070",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "tbaiXmlgenerator",
      "column": "EM_Tbai_Xmlgenerator",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/tbaiXmlgenerator",
      "processId": "BE2486102F2C41779B760609FD69A225",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/generateTo",
      "processId": "142",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/processNow",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices",
      "field": "eTPRRemovePayment",
      "column": "EM_Etpr_Remove_Payment",
      "url": "/sws/neo/sii-monitor/receivedInvoices/{id}/action/eTPRRemovePayment",
      "processId": "745FCF75B6F14024B96CC14429D8E952",
      "processType": "obuiapp"
    },
    {
      "entity": "cashCriterionPayments",
      "field": "send",
      "column": "Send",
      "url": "/sws/neo/sii-monitor/cashCriterionPayments/{id}/action/send",
      "processId": "EA02D79CA1DE4B46909EA6EF64A66B53",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/aeatsiiSend",
      "processId": "2ECF46DAAEEB486EAF79D3594D50DE5F",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "aeatsiiModif",
      "column": "EM_Aeatsii_Modif",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/aeatsiiModif",
      "processId": "BAAECFDF9FF144E8A610E9F1EF3E5FBE",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/posted"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "aeatsiiDup",
      "column": "EM_Aeatsii_Dup",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/aeatsiiDup",
      "processId": "92C02F9A367140C085D1EE3BD27C4E96",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "aeatsiiUnsubscribe",
      "column": "EM_Aeatsii_Unsubscribe",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/aeatsiiUnsubscribe",
      "processId": "BE564945CB2D4892AC0EE51204C5DB7D",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/copyFrom",
      "processId": "210",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/createLinesFrom"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "createLinesFromShipment",
      "column": "Createfrominouts",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/createLinesFromShipment",
      "processId": "7737CA7330FD49FBA7EBC225E85F2BC9",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "createLinesFromOrder",
      "column": "Createfromorders",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/createLinesFromOrder",
      "processId": "AB2EFCAABB7B4EC0A9B30CFB82963FB6",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/documentAction",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "aPRMAddpayment",
      "column": "EM_APRM_Addpayment",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/aPRMAddpayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "aPRMProcessinvoice",
      "column": "EM_APRM_Processinvoice",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/aPRMProcessinvoice",
      "processId": "B54318B49E984B9CB855AEFB1F474CD6",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "etvfacRectCreate",
      "column": "EM_Etvfac_Rect_Create",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/etvfacRectCreate",
      "processId": "E36A8BA259164E78AFDDC760172C18F5",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "tBAIQRcode",
      "column": "em_tbai_qrcode",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/tBAIQRcode",
      "processId": "12FECC9DF1F4418AB7DAA46D6A05FEC6",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "tbaiVoidxmlgenerator",
      "column": "EM_Tbai_Voidxmlgenerator",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/tbaiVoidxmlgenerator",
      "processId": "535A8BAE44A34759A7C8FF40D62A5070",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "tbaiXmlgenerator",
      "column": "EM_Tbai_Xmlgenerator",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/tbaiXmlgenerator",
      "processId": "BE2486102F2C41779B760609FD69A225",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/generateTo",
      "processId": "142",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/processNow",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "issuedInvoices(previousPeriod)",
      "field": "eTPRRemovePayment",
      "column": "EM_Etpr_Remove_Payment",
      "url": "/sws/neo/sii-monitor/issuedInvoices(previousPeriod)/{id}/action/eTPRRemovePayment",
      "processId": "745FCF75B6F14024B96CC14429D8E952",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/aeatsiiSend",
      "processId": "2ECF46DAAEEB486EAF79D3594D50DE5F",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "aeatsiiModif",
      "column": "EM_Aeatsii_Modif",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/aeatsiiModif",
      "processId": "BAAECFDF9FF144E8A610E9F1EF3E5FBE",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/posted"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "aeatsiiDup",
      "column": "EM_Aeatsii_Dup",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/aeatsiiDup",
      "processId": "92C02F9A367140C085D1EE3BD27C4E96",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "aeatsiiUnsubscribe",
      "column": "EM_Aeatsii_Unsubscribe",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/aeatsiiUnsubscribe",
      "processId": "BE564945CB2D4892AC0EE51204C5DB7D",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/copyFrom",
      "processId": "210",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/createLinesFrom"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "createLinesFromShipment",
      "column": "Createfrominouts",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/createLinesFromShipment",
      "processId": "7737CA7330FD49FBA7EBC225E85F2BC9",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "createLinesFromOrder",
      "column": "Createfromorders",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/createLinesFromOrder",
      "processId": "AB2EFCAABB7B4EC0A9B30CFB82963FB6",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/documentAction",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "aPRMAddpayment",
      "column": "EM_APRM_Addpayment",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/aPRMAddpayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "aPRMProcessinvoice",
      "column": "EM_APRM_Processinvoice",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/aPRMProcessinvoice",
      "processId": "B54318B49E984B9CB855AEFB1F474CD6",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "etvfacRectCreate",
      "column": "EM_Etvfac_Rect_Create",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/etvfacRectCreate",
      "processId": "E36A8BA259164E78AFDDC760172C18F5",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "tBAIQRcode",
      "column": "em_tbai_qrcode",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/tBAIQRcode",
      "processId": "12FECC9DF1F4418AB7DAA46D6A05FEC6",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "tbaiVoidxmlgenerator",
      "column": "EM_Tbai_Voidxmlgenerator",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/tbaiVoidxmlgenerator",
      "processId": "535A8BAE44A34759A7C8FF40D62A5070",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "tbaiXmlgenerator",
      "column": "EM_Tbai_Xmlgenerator",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/tbaiXmlgenerator",
      "processId": "BE2486102F2C41779B760609FD69A225",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/generateTo",
      "processId": "142",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/processNow",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "psd2GenerateBankPayment",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "receivedInvoices(previousPeriod)",
      "field": "eTPRRemovePayment",
      "column": "EM_Etpr_Remove_Payment",
      "url": "/sws/neo/sii-monitor/receivedInvoices(previousPeriod)/{id}/action/eTPRRemovePayment",
      "processId": "745FCF75B6F14024B96CC14429D8E952",
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
    "category": "monitor"
  }
};

// @sf-generated-start component:OrganizationsPage
export default function OrganizationsPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="organizations"
        detailEntity="issuedInvoices"
        Form={OrganizationsForm}
        DetailTable={IssuedInvoicesTable}
        DetailForm={IssuedInvoicesForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        detailProcesses={detailProcesses}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Organizations"
        detailLabel="Issued Invoices"
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
      entity="organizations"
      Table={OrganizationsTable}
      entityLabel="SII Monitor"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:OrganizationsPage
