import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import { toast } from 'sonner';
import { INVOICE_LINE_CONFIG } from '@/hooks/useLineGrossAmount';
import HeaderTable from '../../../custom/InvoiceHeaderTable';
import HeaderForm from './HeaderForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import ExchangeRatesTable from './ExchangeRatesTable';
import ExchangeRatesForm from './ExchangeRatesForm';
import SifErrorBanner from '@/windows/custom/sales-invoice/SifErrorBanner';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import { AttachmentsTab } from '@/components/attachments';
import SifTab from '@/windows/custom/shared/SifTab.jsx';
import ReversedInvoicesPanel from '@/windows/custom/sales-invoice/ReversedInvoicesPanel.jsx';
import InvoiceBottomPanel from '../../../custom/InvoiceBottomPanel';
import InvoiceTopbarExtra from '../../../custom/InvoiceTopbarExtra';
import catalogs from './mockCatalogs';


const breadcrumb = 'Sales / Sales Invoice';


// @sf-generated-start summary:header
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [
  { key: 'posted', type: 'statusPill', trueKey: 'postedStatus', falseKey: 'notPostedStatus', visibleWhenCapability: 'showAccountingFields' },
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
const requiredHeaderFields = ['transactionDocument', 'documentNo', 'invoiceDate', 'businessPartner', 'partnerAddress', 'paymentTerms', 'paymentMethod', 'grandTotalAmount', 'summedLineAmount', 'currency', 'priceList'];
// @sf-generated-end requiredHeaderFields:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', lookup: true, label: 'Product', reference: 'Product', inputMode: 'search', forceCalloutFields: ["listPrice","unitPrice","tax","uOM","grossUnitPrice"] },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', required: true, label: 'Invoiced Quantity', defaultValue: 1 },
    { key: 'listPrice', column: 'PriceList', type: 'number', required: true, label: 'List Price' },
    { key: 'etgoDiscount', column: 'EM_Etgo_Discount', type: 'number', label: 'Discount %', defaultValue: 0, min: 0, max: 100 },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', label: 'Tax', reference: 'Tax', inputMode: 'selector', forceCalloutFields: ["lineNetAmount"] },
    { key: 'project', column: 'C_Project_ID', type: 'search', label: 'Project', reference: 'Project', inputMode: 'search' },
    { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', reference: 'Costcenter', inputMode: 'selector' },
  ],
  derived: [

  ],
  hidden: [
    { key: 'grossUnitPrice', value: '0' },
  ],
};
// @sf-generated-end addLineFields:lines

export const api = {
  "specName": "sales-invoice",
  "baseUrl": "/sws/neo/sales-invoice",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-invoice/header",
      "detailUrl": "/sws/neo/sales-invoice/header/{id}",
      "supportedFilters": [
        "documentNo",
        "invoiceDate",
        "businessPartner",
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
      "listUrl": "/sws/neo/sales-invoice/lines",
      "detailUrl": "/sws/neo/sales-invoice/lines/{id}",
      "supportedFilters": [
        "product"
      ]
    },
    "paymentPlan": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-invoice/paymentPlan",
      "detailUrl": "/sws/neo/sales-invoice/paymentPlan/{id}",
      "supportedFilters": []
    },
    "reversedInvoices": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-invoice/reversedInvoices",
      "detailUrl": "/sws/neo/sales-invoice/reversedInvoices/{id}",
      "supportedFilters": []
    },
    "exchangeRates": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sales-invoice/exchangeRates",
      "detailUrl": "/sws/neo/sales-invoice/exchangeRates/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "header",
      "field": "adOrgId",
      "column": "AD_Org_ID",
      "reference": "Org",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/adOrgId"
    },
    {
      "entity": "header",
      "field": "transactionDocument",
      "column": "C_DocTypeTarget_ID",
      "reference": "DocumentType",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/transactionDocument",
      "context": {
        "required": [
          {
            "param": "IsSOTrx",
            "source": "windowCategory"
          },
          {
            "param": "AD_Org_ID",
            "source": "field",
            "field": "adOrgId"
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
      "url": "/sws/neo/sales-invoice/header/selectors/businessPartner"
    },
    {
      "entity": "header",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/sales-invoice/header/selectors/partnerAddress",
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
      "field": "paymentTerms",
      "column": "C_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/paymentTerms"
    },
    {
      "entity": "header",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/paymentMethod",
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
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/currency"
    },
    {
      "entity": "header",
      "field": "priceList",
      "column": "M_PriceList_ID",
      "reference": "PriceList",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/priceList",
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
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/sales-invoice/header/selectors/project",
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
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/costcenter"
    },
    {
      "entity": "header",
      "field": "aeatsiiCauseExemption",
      "column": "EM_Aeatsii_Cause_Exemption_ID",
      "reference": "aeatsii_cause_exemption",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/aeatsiiCauseExemption"
    },
    {
      "entity": "lines",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/sales-invoice/lines/selectors/product"
    },
    {
      "entity": "lines",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/lines/selectors/tax",
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
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/sales-invoice/lines/selectors/project"
    },
    {
      "entity": "lines",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/lines/selectors/costcenter"
    },
    {
      "entity": "paymentPlan",
      "field": "finPaymentmethodID",
      "column": "Fin_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/paymentPlan/selectors/finPaymentmethodID"
    },
    {
      "entity": "paymentPlan",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/paymentPlan/selectors/currency"
    },
    {
      "entity": "reversedInvoices",
      "field": "reversedInvoice",
      "column": "Reversed_C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "search",
      "url": "/sws/neo/sales-invoice/reversedInvoices/selectors/reversedInvoice"
    },
    {
      "entity": "reversedInvoices",
      "field": "aEAT349CYear",
      "column": "EM_AEAT349_C_Year_ID",
      "reference": "Year",
      "inputMode": "search",
      "url": "/sws/neo/sales-invoice/reversedInvoices/selectors/aEAT349CYear"
    },
    {
      "entity": "exchangeRates",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/exchangeRates/selectors/currency"
    },
    {
      "entity": "exchangeRates",
      "field": "toCurrency",
      "column": "C_Currency_Id_To",
      "reference": "Currency",
      "inputMode": "search",
      "url": "/sws/neo/sales-invoice/exchangeRates/selectors/toCurrency"
    }
  ],
  "actions": [
    {
      "entity": "header",
      "column": "EM_APRM_Addpayment",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aPRMAddpayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_APRM_Processinvoice",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aPRMProcessinvoice",
      "processId": "B54318B49E984B9CB855AEFB1F474CD6",
      "processType": "classic"
    },
    {
      "entity": "header",
      "column": "DocAction",
      "url": "/sws/neo/sales-invoice/header/{id}/action/documentAction",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "header",
      "column": "Createfromorders",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFromOrder",
      "processId": "AB2EFCAABB7B4EC0A9B30CFB82963FB6",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "Createfrominouts",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFromShipment",
      "processId": "7737CA7330FD49FBA7EBC225E85F2BC9",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "CopyFrom",
      "url": "/sws/neo/sales-invoice/header/{id}/action/copyFrom",
      "processId": "210",
      "processType": "classic"
    },
    {
      "entity": "header",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sales-invoice/header/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "header",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/sales-invoice/header/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "em_tbai_qrcode",
      "url": "/sws/neo/sales-invoice/header/{id}/action/tBAIQRcode",
      "processId": "12FECC9DF1F4418AB7DAA46D6A05FEC6",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_Etvfac_Rect_Create",
      "url": "/sws/neo/sales-invoice/header/{id}/action/etvfacRectCreate",
      "processId": "E36A8BA259164E78AFDDC760172C18F5",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_Tbai_Xmlgenerator",
      "url": "/sws/neo/sales-invoice/header/{id}/action/tbaiXmlgenerator",
      "processId": "BE2486102F2C41779B760609FD69A225",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_Etpr_Remove_Payment",
      "url": "/sws/neo/sales-invoice/header/{id}/action/eTPRRemovePayment",
      "processId": "745FCF75B6F14024B96CC14429D8E952",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_Tbai_Voidxmlgenerator",
      "url": "/sws/neo/sales-invoice/header/{id}/action/tbaiVoidxmlgenerator",
      "processId": "535A8BAE44A34759A7C8FF40D62A5070",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aeatsiiSend",
      "processId": "2ECF46DAAEEB486EAF79D3594D50DE5F",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_Aeatsii_Modif",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aeatsiiModif",
      "processId": "BAAECFDF9FF144E8A610E9F1EF3E5FBE",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "Processing",
      "url": "/sws/neo/sales-invoice/header/{id}/action/processNow",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "header",
      "column": "GenerateTo",
      "url": "/sws/neo/sales-invoice/header/{id}/action/generateTo",
      "processId": "142",
      "processType": "classic"
    },
    {
      "entity": "header",
      "column": "CreateFrom",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFrom"
    },
    {
      "entity": "header",
      "column": "EM_Aeatsii_Dup",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aeatsiiDup",
      "processId": "92C02F9A367140C085D1EE3BD27C4E96",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_Aeatsii_Unsubscribe",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aeatsiiUnsubscribe",
      "processId": "BE564945CB2D4892AC0EE51204C5DB7D",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "column": "EM_Psd2_Generate_Bank_Payment",
      "url": "/sws/neo/sales-invoice/header/{id}/action/psd2GenerateBankPayment",
      "processId": "0661406A983B4D8EA611F8596F114D52",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "column": "Explode",
      "url": "/sws/neo/sales-invoice/lines/{id}/action/explode",
      "processId": "6E1ADD5C8B6B4ACB82237DAA8114451E",
      "processType": "classic"
    },
    {
      "entity": "lines",
      "column": "Match_Lccosts",
      "url": "/sws/neo/sales-invoice/lines/{id}/action/matchLCCosts",
      "processId": "281FFDFAB31C4394A2EAA73A6F9F3A3F",
      "processType": "obuiapp"
    },
    {
      "entity": "paymentPlan",
      "column": "Update_Payment_Plan",
      "url": "/sws/neo/sales-invoice/paymentPlan/{id}/action/updatePaymentPlan",
      "processId": "FB740AB61B0E42B198D2C88D3A0D0CE6",
      "processType": "classic"
    },
    {
      "entity": "paymentPlan",
      "column": "EM_Aprm_Modif_Paym_Sched",
      "url": "/sws/neo/sales-invoice/paymentPlan/{id}/action/aprmModifPaymentINPlan",
      "processId": "4EEB3497082C4F2182E16A4371CD5D96",
      "processType": "obuiapp"
    },
    {
      "entity": "paymentPlan",
      "column": "EM_Aprm_Modif_Paym_Out_Sched",
      "url": "/sws/neo/sales-invoice/paymentPlan/{id}/action/aprmModifPaymentOUTPlan",
      "processId": "6F87442DF7BC43AB8A666BDED2F7D64E",
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
    "category": "sales"
  },
  "labelOverrides": {
    "es_ES": {
      "OutstandingAmt": "Pendiente de pago",
      "EM_Etgo_Due_Date": "Vencimiento",
      "em_etgo_delivery_status": "Estado de entrega",
      "C_DocTypeTarget_ID": "Tipo de documento",
      "PriceList": "Precio",
      "Foreign_Amount": "Importe en Moneda Objetivo"
    },
    "en_US": {
      "OutstandingAmt": "Pending Payment",
      "EM_Etgo_Due_Date": "Due Date",
      "em_etgo_delivery_status": "Delivery Status",
      "C_DocTypeTarget_ID": "Document Type",
      "Foreign_Amount": "Target Currency Amount"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('167');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="167" />;
  }
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
          { key: 'exchangeRates', label: 'Exchange rates', Table: ExchangeRatesTable, Form: ExchangeRatesForm, requireSavedRecord: true, readOnlyLogic: (record) => record['processed'] === true || record['posted'] === true || record['hASREVERSEDINVOICESO'] === 'Y' || record['hASREVERSEDINVOICEPO'] === 'Y', tabOrder: 50 },
        ]}
        formFooter={SifErrorBanner}
        hideDeleteWhenComplete
        hidePrintWhen={{"documentStatus":{"notEquals":"CO"}}}
        noHeaderBorder
        notesField="description"
        dimensionsPanelFieldKeys={["project","costcenter"]}
        customTabs={[{ key: 'related', labelKey: 'relatedDocuments', Component: RelatedDocuments }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Invoice", config: {} } }, { key: 'sif', labelKey: 'sifDataTabs.sectionTitle', Component: SifTab, placement: 'tab' }, { key: 'reversedInvoices', labelKey: 'rectificationsTab', Component: ReversedInvoicesPanel, placement: 'tab' }]}
        bottomSection={InvoiceBottomPanel}
        topbarRight={InvoiceTopbarExtra}
        menuActions={({ data, status }) => [
          { key: 'reactivate', label: 'Reactivate', visible: status === 'CO', labelKey: 'reactivate', successKey: 'reactivated', preUnpost: true, documentAction: 'RE',  },
          { key: 'post', label: 'Post', visible: !(data?.posted === 'Y' || data?.posted === true) && (data?.processed === 'Y' || data?.processed === true), labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',  }
        ]}
        draftMode={draftMode}
        requiredHeaderFields={requiredHeaderFields}
        documentDateField="invoiceDate"
        salesTheme
        labelOverrides={labelOverrides}
        lineConfig={INVOICE_LINE_CONFIG}
        sendDocument
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Sales Invoice"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      subsetFilters={[{"label":"allTab"},{"label":"invoicesTab","filter":"criteria=%5B%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22ARI%22%7D%2C%7B%22fieldName%22%3A%22transactionDocument%24etsgIsRectificative%22%2C%22operator%22%3A%22notEqual%22%2C%22value%22%3Atrue%7D%5D","_note":"ETP-4737: plain invoices only. Excludes the new unified 'Factura Rectificativa' doc type, which shares the ARI category with plain invoices but is distinguished via the etsgIsRectificative flag on C_DocType (see rectificativeInvoicesTab below for the full discriminator rationale)."},{"label":"rectificativeInvoicesTab","filter":"criteria=%5B%7B%22_constructor%22%3A%22AdvancedCriteria%22%2C%22operator%22%3A%22or%22%2C%22criteria%22%3A%5B%7B%22fieldName%22%3A%22transactionDocument%24etsgIsRectificative%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3Atrue%7D%2C%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22ARC%22%7D%2C%7B%22fieldName%22%3A%22transactionDocument%24documentCategory%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22ARI_RM%22%7D%5D%7D%5D","_note":"ETP-4737: merges the former separate creditNotesTab (ARC) and returnsTab (ARI_RM) into one 'Facturas rectificativas' tab, OR'd with the new unified rectificative doc type. The new 'Factura Rectificativa' doc type (EM_Etsg_Isrectificative='Y' on C_DocType) shares the plain-invoice ARI category, so documentCategory alone cannot discriminate it — confirmed empirically against the dev DB (GOClient tenant): 3 active ARI-category doc types exist there ('AR Invoice', 'Reversed Sales Invoice', 'Factura Rectificativa'), only the last has etsgIsRectificative='Y'. etsgIsRectificative is a real Hibernate-mapped boolean property on DocumentType (confirmed via C_DocType.EM_Etsg_Isrectificative / DocumentType#isEtsgIsRectificative() in com.etendoerp.go), reached here via the same 'transactionDocument$<property>' nested-criteria mechanism already proven for documentCategory in this exact subsetFilters block — this is a plain backend list-query filter, not the GET-by-ID-only 'arInvoiceSubtype' enrichment, so it is expected to work at list-query time. No live invoice yet carries the new doc type in the dev DB to smoke-test end-to-end through the running app; recommend a manual list-view check once an invoice uses it."}]}
      dateFilterKey="invoiceDate"
      labelOverrides={labelOverrides}
      rowQuickActions={{"actions":{"email":{"visibleWhen":"@DocumentStatus@='CO'"}}}}
      sendDocument
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:HeaderPage
