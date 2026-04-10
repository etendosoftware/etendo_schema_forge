import PaymentMethodPage from './PaymentMethodPage';

const windowMeta = { category: 'configuracion', name: 'Payment Method' };

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

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <PaymentMethodPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
