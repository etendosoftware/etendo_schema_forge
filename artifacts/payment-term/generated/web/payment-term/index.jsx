import HeaderPage from './HeaderPage';

const windowMeta = { category: 'configuracion', name: 'Payment Term' };

const api = {
  "specName": "payment-term",
  "baseUrl": "/sws/neo/payment-term",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-term/header",
      "detailUrl": "/sws/neo/payment-term/header/{id}",
      "supportedFilters": [
        "searchKey",
        "name"
      ]
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-term/lines",
      "detailUrl": "/sws/neo/payment-term/lines/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "lines",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/payment-term/lines/selectors/paymentMethod"
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
      "example": "_sortBy=payment-termDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <HeaderPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
