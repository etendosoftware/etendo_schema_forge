import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import CabeceraDeEmisorTable from './CabeceraDeEmisorTable';
import CabeceraDeEmisorForm from './CabeceraDeEmisorForm';
import FacturasRechazadasTable from './FacturasRechazadasTable';
import FacturasRechazadasForm from './FacturasRechazadasForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Monitor / Monitor Verifactu';


// @sf-generated-start summary:cabeceraDeEmisor
const summary = [
  { key: 'issuerNIF', column: 'Issuer_Nif', type: 'string' },
];

const statusField = null;
// @sf-generated-end summary:cabeceraDeEmisor

// @sf-generated-start extraBadges:cabeceraDeEmisor
const extraBadges = [

];
// @sf-generated-end extraBadges:cabeceraDeEmisor

// @sf-generated-start processes:cabeceraDeEmisor
const processes = [

];
// @sf-generated-end processes:cabeceraDeEmisor

// @sf-generated-start draftMode:cabeceraDeEmisor
const draftMode = null;
// @sf-generated-end draftMode:cabeceraDeEmisor

// @sf-generated-start requiredHeaderFields:cabeceraDeEmisor
const requiredHeaderFields = ['active', 'tAXType', 'nextSendWaitTime'];
// @sf-generated-end requiredHeaderFields:cabeceraDeEmisor

// @sf-generated-start addLineFields:facturasRechazadas
const addLineFields = {
  entry: [
    { key: 'active', column: 'Isactive', type: 'checkbox', label: 'Activo' },
    { key: 'sentToVerifactu', column: 'EM_Etvfac_Senttoverifac', type: 'checkbox', label: 'Enviado a Verifactu' },
    { key: 'errorReason', column: 'Error_Reason', type: 'text', label: 'Descripción Error Registro' },
    { key: 'cSV', column: 'Csv', type: 'text', label: 'CSV' },
    { key: 'typeOperation', column: 'Type_Operation', type: 'select', label: 'Tipo de Operación' },
    { key: 'codeError', column: 'Code_Error', type: 'text', label: 'Código de Error' },
    { key: 'isSubsanation', column: 'Issubsanation', type: 'checkbox', label: 'Es Subsanación' },
    { key: 'invoice', column: 'C_Invoice_ID', type: 'selector', label: 'Factura', reference: 'Invoice', inputMode: 'selector' },
    { key: 'verifactuSendingStatus', column: 'EM_Etvfac_Invoice_Status', type: 'select', label: 'Estado de Envío a Verifactu' },
  ],
  derived: [
    { key: 'issuerTaxID', column: 'Legal_Entity_Nif', type: 'text', label: 'NIF de Entidad Legal' },
  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:facturasRechazadas

export const api = {
  "specName": "monitor-verifactu",
  "baseUrl": "/sws/neo/monitor-verifactu",
  "crud": {
    "cabeceraDeEmisor": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/monitor-verifactu/cabeceraDeEmisor",
      "detailUrl": "/sws/neo/monitor-verifactu/cabeceraDeEmisor/{id}",
      "supportedFilters": []
    },
    "facturasRechazadas": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/monitor-verifactu/facturasRechazadas",
      "detailUrl": "/sws/neo/monitor-verifactu/facturasRechazadas/{id}",
      "supportedFilters": []
    },
    "facturasParcialmenteAceptadas": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/monitor-verifactu/facturasParcialmenteAceptadas",
      "detailUrl": "/sws/neo/monitor-verifactu/facturasParcialmenteAceptadas/{id}",
      "supportedFilters": []
    },
    "facturasAceptadas": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/monitor-verifactu/facturasAceptadas",
      "detailUrl": "/sws/neo/monitor-verifactu/facturasAceptadas/{id}",
      "supportedFilters": []
    },
    "facturasInválidas": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/monitor-verifactu/facturasInválidas",
      "detailUrl": "/sws/neo/monitor-verifactu/facturasInválidas/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "facturasRechazadas",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/monitor-verifactu/facturasRechazadas/selectors/invoice"
    },
    {
      "entity": "facturasParcialmenteAceptadas",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/monitor-verifactu/facturasParcialmenteAceptadas/selectors/invoice"
    },
    {
      "entity": "facturasAceptadas",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/monitor-verifactu/facturasAceptadas/selectors/invoice"
    },
    {
      "entity": "facturasInválidas",
      "field": "invoice",
      "column": "C_Invoice_ID",
      "reference": "Invoice",
      "inputMode": "selector",
      "url": "/sws/neo/monitor-verifactu/facturasInválidas/selectors/invoice"
    }
  ],
  "actions": [
    {
      "entity": "cabeceraDeEmisor",
      "field": "isReady",
      "column": "IS_Ready",
      "url": "/sws/neo/monitor-verifactu/cabeceraDeEmisor/{id}/action/isReady",
      "processId": "D995FA46EEDB4DAF9F414E661FB13E43",
      "processType": "obuiapp"
    },
    {
      "entity": "facturasRechazadas",
      "field": "correctInvoice",
      "column": "Correct_Invoice",
      "url": "/sws/neo/monitor-verifactu/facturasRechazadas/{id}/action/correctInvoice",
      "processId": "F353F2A7307B464CA2C6515CBEFB0D93",
      "processType": "obuiapp"
    },
    {
      "entity": "facturasParcialmenteAceptadas",
      "field": "correctInvoice",
      "column": "Correct_Invoice",
      "url": "/sws/neo/monitor-verifactu/facturasParcialmenteAceptadas/{id}/action/correctInvoice",
      "processId": "F353F2A7307B464CA2C6515CBEFB0D93",
      "processType": "obuiapp"
    },
    {
      "entity": "facturasAceptadas",
      "field": "correctInvoice",
      "column": "Correct_Invoice",
      "url": "/sws/neo/monitor-verifactu/facturasAceptadas/{id}/action/correctInvoice",
      "processId": "F353F2A7307B464CA2C6515CBEFB0D93",
      "processType": "obuiapp"
    },
    {
      "entity": "facturasInválidas",
      "field": "correctInvoice",
      "column": "Correct_Invoice",
      "url": "/sws/neo/monitor-verifactu/facturasInválidas/{id}/action/correctInvoice",
      "processId": "F353F2A7307B464CA2C6515CBEFB0D93",
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
    "category": "monitor"
  }
};

// @sf-generated-start component:CabeceraDeEmisorPage
export default function CabeceraDeEmisorPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="cabeceraDeEmisor"
        detailEntity="facturasRechazadas"
        Form={CabeceraDeEmisorForm}
        DetailTable={FacturasRechazadasTable}
        DetailForm={FacturasRechazadasForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Cabecera De Emisor"
        detailLabel="Facturas rechazadas"
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
      entity="cabeceraDeEmisor"
      Table={CabeceraDeEmisorTable}
      entityLabel="Monitor Verifactu"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:CabeceraDeEmisorPage
