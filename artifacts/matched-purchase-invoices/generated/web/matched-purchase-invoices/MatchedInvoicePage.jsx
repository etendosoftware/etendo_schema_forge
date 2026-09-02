import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import { toast } from 'sonner';
import MatchedInvoiceTable from './MatchedInvoiceTable';
import MatchedInvoiceForm from './MatchedInvoiceForm';
import MatchedInvoiceBulkActions from '../../../custom/MatchedInvoiceBulkActions';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Matched Purchase Invoices';


// @sf-generated-start summary:matchedInvoice
const summary = [

];

const statusField = null;
// @sf-generated-end summary:matchedInvoice

// @sf-generated-start extraBadges:matchedInvoice
const extraBadges = [

];
// @sf-generated-end extraBadges:matchedInvoice

// @sf-generated-start processes:matchedInvoice
const processes = [

];
// @sf-generated-end processes:matchedInvoice

// @sf-generated-start draftMode:matchedInvoice
const draftMode = null;
// @sf-generated-end draftMode:matchedInvoice

// @sf-generated-start requiredHeaderFields:matchedInvoice
const requiredHeaderFields = ['invoiceLine', 'goodsShipmentLine', 'product', 'quantity', 'transactionDate', 'processed'];
// @sf-generated-end requiredHeaderFields:matchedInvoice



export const api = {
  "specName": "matched-purchase-invoices",
  "baseUrl": "/sws/neo/matched-purchase-invoices",
  "crud": {
    "matchedInvoice": {
      "get": true,
      "getById": true,
      "post": false,
      "put": false,
      "patch": false,
      "delete": false,
      "listUrl": "/sws/neo/matched-purchase-invoices/matchedInvoice",
      "detailUrl": "/sws/neo/matched-purchase-invoices/matchedInvoice/{id}",
      "supportedFilters": [
        "invoiceLine",
        "goodsShipmentLine",
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "matchedInvoice",
      "field": "invoiceLine",
      "column": "C_InvoiceLine_ID",
      "reference": "InvoiceLine",
      "inputMode": "search",
      "url": "/sws/neo/matched-purchase-invoices/matchedInvoice/selectors/invoiceLine"
    },
    {
      "entity": "matchedInvoice",
      "field": "goodsShipmentLine",
      "column": "M_InOutLine_ID",
      "reference": "InOutLine",
      "inputMode": "search",
      "url": "/sws/neo/matched-purchase-invoices/matchedInvoice/selectors/goodsShipmentLine"
    },
    {
      "entity": "matchedInvoice",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/matched-purchase-invoices/matchedInvoice/selectors/product"
    }
  ],
  "actions": [
    {
      "entity": "matchedInvoice",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/matched-purchase-invoices/matchedInvoice/{id}/action/etblkpBulkposting",
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
    "category": "purchases",
    "readOnly": true
  },
  "labelOverrides": {
    "es_ES": {
      "C_InvoiceLine_ID": "Línea de factura",
      "M_InOutLine_ID": "Línea de albarán",
      "M_Product_ID": "Producto",
      "Qty": "Cantidad",
      "DateTrx": "Fecha de transacción",
      "Processed": "Procesada"
    },
    "en_US": {
      "C_InvoiceLine_ID": "Invoice Line",
      "M_InOutLine_ID": "Goods Receipt Line",
      "M_Product_ID": "Product",
      "Qty": "Quantity",
      "DateTrx": "Transaction Date",
      "Processed": "Processed"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:MatchedInvoicePage
export default function MatchedInvoicePage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('107');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="107" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="matchedInvoice"
        Form={MatchedInvoiceForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Matched Invoice"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hideDeleteButton
        hidePrint
        noHeaderBorder
        menuActions={({ data, status }) => [
          { key: 'post', label: 'Post', visible: !(data?.posted === 'Y' || data?.posted === true) && (data?.processed === 'Y' || data?.processed === true), labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',  },
          { key: 'unpost', label: 'Unpost', destructive: true, visible: (data?.posted === 'Y' || data?.posted === true), labelKey: 'unpost', successKey: 'documentUnposted', neoAction: 'unpost',  }
        ]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="matchedInvoice"
      Table={MatchedInvoiceTable}
      entityLabel="Matched Purchase Invoices"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      bulkActions={(ctx) => <MatchedInvoiceBulkActions {...ctx} />}
      hidePrint
      hideCreate
      labelOverrides={labelOverrides}
      rowQuickActions={{"hideDeleteButton":true}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:MatchedInvoicePage
