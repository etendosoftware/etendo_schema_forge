import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import SiiConfigurationTable from './SiiConfigurationTable';
import SiiConfigurationForm from './SiiConfigurationForm';
import LogHashTable from './LogHashTable';
import LogHashForm from './LogHashForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Configuration / SII Config';


// @sf-generated-start summary:siiConfiguration
const summary = [
  { key: 'cIF', column: 'CIF', type: 'string' },
  { key: 'conexiones', column: 'conexiones', type: 'number' },
  { key: 'lastQueryBook', column: 'Last_Query_Book', type: 'enum' },
  { key: 'lastQueryExercise', column: 'Last_Query_Exercise', type: 'string' },
  { key: 'lastQueryPeriod', column: 'Last_Query_Period', type: 'enum' },
  { key: 'sinceJanuary2017', column: 'SinceJanuary2017', type: 'boolean' },
];

const statusField = null;
// @sf-generated-end summary:siiConfiguration

// @sf-generated-start extraBadges:siiConfiguration
const extraBadges = [

];
// @sf-generated-end extraBadges:siiConfiguration

// @sf-generated-start processes:siiConfiguration
const processes = [
  { name: 'validHash', label: 'Validate Hash', style: 'positive' },
];
// @sf-generated-end processes:siiConfiguration

// @sf-generated-start draftMode:siiConfiguration
const draftMode = null;
// @sf-generated-end draftMode:siiConfiguration

// @sf-generated-start requiredHeaderFields:siiConfiguration
const requiredHeaderFields = ['acogidaAlSII', 'plazoLmiteDeEnvoASII', 'cadenciaEnvoFacturasVentaASII', 'cadenciaEnvoFacturasCompraASII', 'entornoDeProduccin', 'adjuntarArchivosXML', 'recc', 'redeme', 'postedInvoices', 'validHash', 'sinceJanuary2017'];
// @sf-generated-end requiredHeaderFields:siiConfiguration

// @sf-generated-start addLineFields:logHash
const addLineFields = {
  entry: [

  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:logHash

export const api = {
  "specName": "sii-config",
  "baseUrl": "/sws/neo/sii-config",
  "crud": {
    "siiConfiguration": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-config/siiConfiguration",
      "detailUrl": "/sws/neo/sii-config/siiConfiguration/{id}",
      "supportedFilters": []
    },
    "logHash": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/sii-config/logHash",
      "detailUrl": "/sws/neo/sii-config/logHash/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [],
  "actions": [
    {
      "entity": "siiConfiguration",
      "field": "validHash",
      "column": "Valid_Hash",
      "url": "/sws/neo/sii-config/siiConfiguration/{id}/action/validHash",
      "processId": "3C55FFE46CA940B6819DE3BBA19437E6",
      "processType": "obuiapp"
    },
    {
      "entity": "siiConfiguration",
      "field": "nuevaConsultaFacturasASII",
      "column": "BTN_Consultar_Fact",
      "url": "/sws/neo/sii-config/siiConfiguration/{id}/action/nuevaConsultaFacturasASII",
      "processId": "0662F6BC8D604AAEA5A2DD49E87F4B65",
      "processType": "obuiapp"
    },
    {
      "entity": "siiConfiguration",
      "field": "informeltimaConexinSII",
      "column": "BTN_Imprimir",
      "url": "/sws/neo/sii-config/siiConfiguration/{id}/action/informeltimaConexinSII",
      "processId": "3D2FDB6FC2BE4F549BA72A98ABD95F8A",
      "processType": "obuiapp"
    },
    {
      "entity": "siiConfiguration",
      "field": "updateInvoices",
      "column": "Update_Invoices",
      "url": "/sws/neo/sii-config/siiConfiguration/{id}/action/updateInvoices",
      "processId": "47EA4A31145142CCA33C786DFD984041",
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
    "category": "configuration"
  }
};

// @sf-generated-start component:SiiConfigurationPage
export default function SiiConfigurationPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="siiConfiguration"
        detailEntity="logHash"
        Form={SiiConfigurationForm}
        DetailTable={LogHashTable}
        DetailForm={LogHashForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Sii Configuration"
        detailLabel="Log Hash"
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
      entity="siiConfiguration"
      Table={SiiConfigurationTable}
      entityLabel="SII Config"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:SiiConfigurationPage
