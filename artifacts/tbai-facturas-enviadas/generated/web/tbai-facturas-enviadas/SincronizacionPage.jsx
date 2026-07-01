import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import SincronizacionTable from './SincronizacionTable';
import SincronizacionForm from './SincronizacionForm';
import ResultadoValidacionTable from './ResultadoValidacionTable';
import ResultadoValidacionForm from './ResultadoValidacionForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Monitor / TBAI Facturas Enviadas';


// @sf-generated-start summary:sincronización
const summary = [
  { key: 'estado', column: 'Estado', type: 'string' },
  { key: 'descripcion', column: 'Descripcion', type: 'string' },
  { key: 'invoice', column: 'C_Invoice_ID', type: 'selector' },
];

const statusField = null;
// @sf-generated-end summary:sincronización

// @sf-generated-start extraBadges:sincronización
const extraBadges = [

];
// @sf-generated-end extraBadges:sincronización

// @sf-generated-start processes:sincronización
const processes = [

];
// @sf-generated-end processes:sincronización

// @sf-generated-start draftMode:sincronización
const draftMode = null;
// @sf-generated-end draftMode:sincronización

// @sf-generated-start requiredHeaderFields:sincronización
const requiredHeaderFields = ['active', 'invoice'];
// @sf-generated-end requiredHeaderFields:sincronización

// @sf-generated-start addLineFields:resultadoValidación
const addLineFields = {
  entry: [
    { key: 'active', column: 'Isactive', type: 'checkbox', required: true, label: 'Activo', defaultValue: 'Y' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:resultadoValidación

export const api = {
  "specName": "tbai-facturas-enviadas",
  "baseUrl": "/sws/neo/tbai-facturas-enviadas",
  "crud": {
    "sincronización": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/tbai-facturas-enviadas/sincronización",
      "detailUrl": "/sws/neo/tbai-facturas-enviadas/sincronización/{id}",
      "supportedFilters": []
    },
    "resultadoValidación": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/tbai-facturas-enviadas/resultadoValidación",
      "detailUrl": "/sws/neo/tbai-facturas-enviadas/resultadoValidación/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "sincronización",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/tbai-facturas-enviadas/sincronización/selectors/invoice"
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
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "monitor"
  }
};

// @sf-generated-start component:SincronizacionPage
export default function SincronizacionPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="sincronización"
        detailEntity="resultadoValidación"
        Form={SincronizacionForm}
        DetailTable={ResultadoValidacionTable}
        DetailForm={ResultadoValidacionForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Sincronización"
        detailLabel="Resultado Validación"
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
      entity="sincronización"
      Table={SincronizacionTable}
      entityLabel="TBAI Facturas Enviadas"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:SincronizacionPage
