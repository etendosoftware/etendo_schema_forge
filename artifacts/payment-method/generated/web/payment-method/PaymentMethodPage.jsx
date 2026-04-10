import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import PaymentMethodTable from './PaymentMethodTable';
import PaymentMethodForm from './PaymentMethodForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Configuracion / Payment Method';


// @sf-generated-start summary:paymentMethod
const summary = [

];

const statusField = null;
// @sf-generated-end summary:paymentMethod

// @sf-generated-start extraBadges:paymentMethod
const extraBadges = [];
// @sf-generated-end extraBadges:paymentMethod

// @sf-generated-start processes:paymentMethod
const processes = [

];
// @sf-generated-end processes:paymentMethod

// @sf-generated-start draftMode:paymentMethod
const draftMode = null;
// @sf-generated-end draftMode:paymentMethod



const api = {
  "specName": "payment-method",
  "baseUrl": "/sws/neo/payment-method",
  "crud": {
    "paymentMethod": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-method/paymentMethod",
      "detailUrl": "/sws/neo/payment-method/paymentMethod/{id}",
      "supportedFilters": [
        "name"
      ]
    }
  },
  "selectors": [
    {
      "entity": "paymentMethod",
      "field": "payinExecutionProcessID",
      "column": "Payin_Execution_Process_ID",
      "reference": "Pay_Exec_Process",
      "inputMode": "search",
      "url": "/sws/neo/payment-method/paymentMethod/selectors/payinExecutionProcessID"
    },
    {
      "entity": "paymentMethod",
      "field": "payoutExecutionProcessID",
      "column": "Payout_Execution_Process_ID",
      "reference": "Pay_Exec_Process",
      "inputMode": "search",
      "url": "/sws/neo/payment-method/paymentMethod/selectors/payoutExecutionProcessID"
    }
  ],
  "actions": [],
  "queryParams": {
    "pagination": {
      "startRow": "_startRow",
      "endRow": "_endRow",
      "default": "0-100"
    },
    "sorting": {
      "param": "_sortBy",
      "example": "_sortBy=payment-methodDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:PaymentMethodPage
export default function PaymentMethodPage({ windowName, recordId, ...props }) {
  
  if (recordId) {
    return (
      <DetailView
        entity="paymentMethod"
        Form={PaymentMethodForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Payment Method"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="paymentMethod"
      Table={PaymentMethodTable}
      entityLabel="Payment Method"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:PaymentMethodPage
