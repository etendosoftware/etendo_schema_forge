import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import CabeceraDeConfiguracionVerifactuTable from './CabeceraDeConfiguracionVerifactuTable';
import CabeceraDeConfiguracionVerifactuForm from './CabeceraDeConfiguracionVerifactuForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Configuration / Verifactu Config';


// @sf-generated-start summary:cabeceraDeConfiguraciónVerifactu
const summary = [
  { key: 'issuerNIF', column: 'Issuer_Nif', type: 'string' },
  { key: 'systemStartat', column: 'System_Startat', type: 'string' },
  { key: 'systemStopat', column: 'System_Stopat', type: 'string' },
  { key: 'incidentReport', column: 'Incident_Report', type: 'string' },
  { key: 'inVfactuSystem', column: 'IN_Vfactu_System', type: 'string' },
];

const statusField = null;
// @sf-generated-end summary:cabeceraDeConfiguraciónVerifactu

// @sf-generated-start extraBadges:cabeceraDeConfiguraciónVerifactu
const extraBadges = [

];
// @sf-generated-end extraBadges:cabeceraDeConfiguraciónVerifactu

// @sf-generated-start processes:cabeceraDeConfiguraciónVerifactu
const processes = [
  { name: 'isReady', label: 'Marcar Como Listo', style: 'positive',
    displayLogicRaw: "@IS_Ready@='N'" },
];
// @sf-generated-end processes:cabeceraDeConfiguraciónVerifactu

// @sf-generated-start draftMode:cabeceraDeConfiguraciónVerifactu
const draftMode = null;
// @sf-generated-end draftMode:cabeceraDeConfiguraciónVerifactu

// @sf-generated-start requiredHeaderFields:cabeceraDeConfiguraciónVerifactu
const requiredHeaderFields = ['tAXType', 'defaultQR', 'isReady'];
// @sf-generated-end requiredHeaderFields:cabeceraDeConfiguraciónVerifactu



export const api = {
  "specName": "verifactu-config",
  "baseUrl": "/sws/neo/verifactu-config",
  "crud": {
    "cabeceraDeConfiguraciónVerifactu": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/verifactu-config/cabeceraDeConfiguraciónVerifactu",
      "detailUrl": "/sws/neo/verifactu-config/cabeceraDeConfiguraciónVerifactu/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [],
  "actions": [
    {
      "entity": "cabeceraDeConfiguraciónVerifactu",
      "field": "isReady",
      "column": "IS_Ready",
      "url": "/sws/neo/verifactu-config/cabeceraDeConfiguraciónVerifactu/{id}/action/isReady",
      "processId": "D995FA46EEDB4DAF9F414E661FB13E43",
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

// @sf-generated-start component:CabeceraDeConfiguracionVerifactuPage
export default function CabeceraDeConfiguracionVerifactuPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="cabeceraDeConfiguraciónVerifactu"
        Form={CabeceraDeConfiguracionVerifactuForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Cabecera De Configuración Verifactu"
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
      entity="cabeceraDeConfiguraciónVerifactu"
      Table={CabeceraDeConfiguracionVerifactuTable}
      entityLabel="Verifactu Config"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:CabeceraDeConfiguracionVerifactuPage
