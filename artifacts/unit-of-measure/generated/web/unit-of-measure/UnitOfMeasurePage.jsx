import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import UnitOfMeasureTable from './UnitOfMeasureTable';
import UnitOfMeasureForm from './UnitOfMeasureForm';
import ConversionTable from './ConversionTable';
import ConversionForm from './ConversionForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Configuracion / Unit of Measure';


// @sf-generated-start summary:unitOfMeasure
const summary = [

];

const statusField = null;
// @sf-generated-end summary:unitOfMeasure

// @sf-generated-start extraBadges:unitOfMeasure
const extraBadges = [];
// @sf-generated-end extraBadges:unitOfMeasure

// @sf-generated-start processes:unitOfMeasure
const processes = [

];
// @sf-generated-end processes:unitOfMeasure

// @sf-generated-start draftMode:unitOfMeasure
const draftMode = null;
// @sf-generated-end draftMode:unitOfMeasure

// @sf-generated-start addLineFields:conversion
const addLineFields = {
  entry: [
    { key: 'toUOM', column: 'C_UOM_To_ID', type: 'selector', required: true, label: 'To UOM', reference: 'UOM', inputMode: 'selector' },
    { key: 'multipleRateBy', column: 'MultiplyRate', type: 'text', required: true, label: 'Multiple Rate By' },
    { key: 'divideRateBy', column: 'DivideRate', type: 'text', required: true, label: 'Divide Rate By' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:conversion

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

// @sf-generated-start component:UnitOfMeasurePage
export default function UnitOfMeasurePage({ windowName, recordId, ...props }) {
  
  if (recordId) {
    return (
      <DetailView
        entity="unitOfMeasure"
        detailEntity="conversion"
        Form={UnitOfMeasureForm}
        DetailTable={ConversionTable}
        DetailForm={ConversionForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Unit Of Measure"
        detailLabel="Conversion"
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
      entity="unitOfMeasure"
      Table={UnitOfMeasureTable}
      entityLabel="Unit of Measure"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:UnitOfMeasurePage
