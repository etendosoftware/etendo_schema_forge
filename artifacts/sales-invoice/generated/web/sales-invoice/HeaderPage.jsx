import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import { INVOICE_LINE_CONFIG } from '@/hooks/useLineGrossAmount';
import HeaderTable from '../../../custom/InvoiceHeaderTable';
import HeaderForm from './HeaderForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import InvoiceBottomPanel from '../../../custom/InvoiceBottomPanel';
import InvoiceTopbarExtra from '../../../custom/InvoiceTopbarExtra';
import catalogs from './mockCatalogs';


const breadcrumb = 'Sales / Sales Invoice';

const labelOverrides = {
  "es_ES": {
    "OutstandingAmt": "Pendiente de pago",
    "EM_Etgo_Due_Date": "Vencimiento",
    "em_etgo_delivery_status": "Estado de entrega"
  },
  "en_US": {
    "OutstandingAmt": "Pending Payment",
    "EM_Etgo_Due_Date": "Due Date",
    "em_etgo_delivery_status": "Delivery Status"
  }
};


// @sf-generated-start summary:header
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [];
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
const requiredHeaderFields = ['documentNo', 'invoiceDate', 'businessPartner', 'partnerAddress', 'paymentTerms', 'paymentMethod', 'grandTotalAmount', 'summedLineAmount', 'priceList'];
// @sf-generated-end requiredHeaderFields:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', lookup: true, label: 'Product', reference: 'Product', inputMode: 'search', forceCalloutFields: ["listPrice","unitPrice","tax","uOM","grossUnitPrice"] },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', required: true, label: 'Invoiced Quantity', defaultValue: 1 },
    { key: 'listPrice', column: 'PriceList', type: 'number', required: true, label: 'List Price' },
    { key: 'etgoDiscount', column: 'EM_Etgo_Discount', type: 'number', label: 'Discount %', defaultValue: 0 },
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
      "url": "/sws/neo/sales-invoice/header/selectors/partnerAddress"
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
      "url": "/sws/neo/sales-invoice/header/selectors/paymentMethod"
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
      "url": "/sws/neo/sales-invoice/header/selectors/priceList"
    },
    {
      "entity": "header",
      "field": "aeatsiiDescription",
      "column": "EM_Aeatsii_Description_ID",
      "reference": "aeatsii_description",
      "inputMode": "selector",
      "url": "/sws/neo/sales-invoice/header/selectors/aeatsiiDescription"
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
      "url": "/sws/neo/sales-invoice/lines/selectors/tax"
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
    }
  ],
  "actions": [
    {
      "entity": "header",
      "field": "aPRMAddpayment",
      "column": "EM_APRM_Addpayment",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aPRMAddpayment",
      "processId": "9BED7889E1034FE68BD85D5D16857320",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/sales-invoice/header/{id}/action/posted"
    },
    {
      "entity": "header",
      "field": "aPRMProcessinvoice",
      "column": "EM_APRM_Processinvoice",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aPRMProcessinvoice",
      "processId": "B54318B49E984B9CB855AEFB1F474CD6",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/sales-invoice/header/{id}/action/documentAction",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createLinesFromOrder",
      "column": "Createfromorders",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFromOrder",
      "processId": "AB2EFCAABB7B4EC0A9B30CFB82963FB6",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "createLinesFromShipment",
      "column": "Createfrominouts",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFromShipment",
      "processId": "7737CA7330FD49FBA7EBC225E85F2BC9",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/sales-invoice/header/{id}/action/copyFrom",
      "processId": "210",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/sales-invoice/header/{id}/action/calculatePromotions",
      "processId": "9EB2228A60684C0DBEC12D5CD8D85218",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "tBAIQRcode",
      "column": "em_tbai_qrcode",
      "url": "/sws/neo/sales-invoice/header/{id}/action/tBAIQRcode",
      "processId": "12FECC9DF1F4418AB7DAA46D6A05FEC6",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "etvfacRectCreate",
      "column": "EM_Etvfac_Rect_Create",
      "url": "/sws/neo/sales-invoice/header/{id}/action/etvfacRectCreate",
      "processId": "E36A8BA259164E78AFDDC760172C18F5",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "tbaiXmlgenerator",
      "column": "EM_Tbai_Xmlgenerator",
      "url": "/sws/neo/sales-invoice/header/{id}/action/tbaiXmlgenerator",
      "processId": "BE2486102F2C41779B760609FD69A225",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "tbaiVoidxmlgenerator",
      "column": "EM_Tbai_Voidxmlgenerator",
      "url": "/sws/neo/sales-invoice/header/{id}/action/tbaiVoidxmlgenerator",
      "processId": "535A8BAE44A34759A7C8FF40D62A5070",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "aeatsiiSend",
      "column": "EM_Aeatsii_Send",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aeatsiiSend",
      "processId": "2ECF46DAAEEB486EAF79D3594D50DE5F",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "aeatsiiModif",
      "column": "EM_Aeatsii_Modif",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aeatsiiModif",
      "processId": "BAAECFDF9FF144E8A610E9F1EF3E5FBE",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/sales-invoice/header/{id}/action/processNow",
      "processId": "111",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/sales-invoice/header/{id}/action/generateTo",
      "processId": "142",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/sales-invoice/header/{id}/action/createLinesFrom"
    },
    {
      "entity": "header",
      "field": "aeatsiiDup",
      "column": "EM_Aeatsii_Dup",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aeatsiiDup",
      "processId": "92C02F9A367140C085D1EE3BD27C4E96",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "aeatsiiUnsubscribe",
      "column": "EM_Aeatsii_Unsubscribe",
      "url": "/sws/neo/sales-invoice/header/{id}/action/aeatsiiUnsubscribe",
      "processId": "BE564945CB2D4892AC0EE51204C5DB7D",
      "processType": "obuiapp"
    },
    {
      "entity": "lines",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/sales-invoice/lines/{id}/action/explode",
      "processId": "6E1ADD5C8B6B4ACB82237DAA8114451E",
      "processType": "classic"
    },
    {
      "entity": "lines",
      "field": "matchLCCosts",
      "column": "Match_Lccosts",
      "url": "/sws/neo/sales-invoice/lines/{id}/action/matchLCCosts",
      "processId": "281FFDFAB31C4394A2EAA73A6F9F3A3F",
      "processType": "obuiapp"
    },
    {
      "entity": "paymentPlan",
      "field": "updatePaymentPlan",
      "column": "Update_Payment_Plan",
      "url": "/sws/neo/sales-invoice/paymentPlan/{id}/action/updatePaymentPlan",
      "processId": "FB740AB61B0E42B198D2C88D3A0D0CE6",
      "processType": "classic"
    },
    {
      "entity": "paymentPlan",
      "field": "aprmModifPaymentINPlan",
      "column": "EM_Aprm_Modif_Paym_Sched",
      "url": "/sws/neo/sales-invoice/paymentPlan/{id}/action/aprmModifPaymentINPlan",
      "processId": "4EEB3497082C4F2182E16A4371CD5D96",
      "processType": "obuiapp"
    },
    {
      "entity": "paymentPlan",
      "field": "aprmModifPaymentOUTPlan",
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
      "em_etgo_delivery_status": "Estado de entrega"
    },
    "en_US": {
      "OutstandingAmt": "Pending Payment",
      "EM_Etgo_Due_Date": "Due Date",
      "em_etgo_delivery_status": "Delivery Status"
    }
  }
};

// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
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
        hideDeleteWhenComplete
        hidePrint
        noHeaderBorder
        notesField="description"
        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
        bottomSection={InvoiceBottomPanel}
        topbarRight={InvoiceTopbarExtra}
        menuActions={({ status }) => [
          { key: 'reactivate', label: 'Reactivate', visible: status === 'CO', labelKey: 'reactivate', successKey: 'reactivated', documentAction: 'RE',  }
        ]}
        draftMode={draftMode}
        requiredHeaderFields={requiredHeaderFields}
        salesTheme
        labelOverrides={labelOverrides}
        lineConfig={INVOICE_LINE_CONFIG}
        linesLayout="inlineEditable"
        {...props}
      />
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
      dateFilterKey="invoiceDate"
      hidePrint
      labelOverrides={labelOverrides}
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage
