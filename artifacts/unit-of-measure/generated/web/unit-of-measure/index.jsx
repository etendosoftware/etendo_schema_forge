import UnitOfMeasurePage from './UnitOfMeasurePage';

const windowMeta = { category: 'configuracion', name: 'Unit of Measure' };

const api = {
  "specName": "unit-of-measure",
  "baseUrl": "/sws/neo/unit-of-measure",
  "crud": {
    "unitOfMeasure": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/unit-of-measure/unitOfMeasure",
      "detailUrl": "/sws/neo/unit-of-measure/unitOfMeasure/{id}",
      "supportedFilters": [
        "eDICode",
        "name"
      ]
    },
    "conversion": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/unit-of-measure/conversion",
      "detailUrl": "/sws/neo/unit-of-measure/conversion/{id}",
      "supportedFilters": [
        "toUOM"
      ]
    }
  },
  "selectors": [
    {
      "entity": "conversion",
      "field": "toUOM",
      "column": "C_UOM_To_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/unit-of-measure/conversion/selectors/toUOM"
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
      "example": "_sortBy=unit-of-measureDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <UnitOfMeasurePage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
