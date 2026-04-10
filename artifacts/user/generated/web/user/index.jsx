import UserPage from './UserPage';

const windowMeta = { category: 'configuracion', name: 'User' };

const api = {
  "specName": "user",
  "baseUrl": "/sws/neo/user",
  "crud": {
    "user": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/user/user",
      "detailUrl": "/sws/neo/user/user/{id}",
      "supportedFilters": [
        "name",
        "username",
        "email"
      ]
    },
    "userRoles": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/user/userRoles",
      "detailUrl": "/sws/neo/user/userRoles/{id}",
      "supportedFilters": [
        "role"
      ]
    },
    "emailConfiguration": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/user/emailConfiguration",
      "detailUrl": "/sws/neo/user/emailConfiguration/{id}",
      "supportedFilters": [
        "smtpServer"
      ]
    }
  },
  "selectors": [
    {
      "entity": "user",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/user/user/selectors/businessPartner"
    },
    {
      "entity": "user",
      "field": "supervisor",
      "column": "Supervisor_ID",
      "reference": "User",
      "inputMode": "search",
      "url": "/sws/neo/user/user/selectors/supervisor"
    },
    {
      "entity": "user",
      "field": "defaultRole",
      "column": "Default_Ad_Role_ID",
      "reference": "Role",
      "inputMode": "selector",
      "url": "/sws/neo/user/user/selectors/defaultRole"
    },
    {
      "entity": "user",
      "field": "defaultLanguage",
      "column": "Default_Ad_Language",
      "reference": "Language",
      "inputMode": "selector",
      "url": "/sws/neo/user/user/selectors/defaultLanguage"
    },
    {
      "entity": "user",
      "field": "defaultClient",
      "column": "Default_Ad_Client_ID",
      "reference": "Client",
      "inputMode": "dependent",
      "url": "/sws/neo/user/user/selectors/defaultClient"
    },
    {
      "entity": "user",
      "field": "defaultOrganization",
      "column": "Default_Ad_Org_ID",
      "reference": "Organization",
      "inputMode": "dependent",
      "url": "/sws/neo/user/user/selectors/defaultOrganization"
    },
    {
      "entity": "user",
      "field": "defaultWarehouse",
      "column": "Default_M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "dependent",
      "url": "/sws/neo/user/user/selectors/defaultWarehouse"
    },
    {
      "entity": "userRoles",
      "field": "role",
      "column": "AD_Role_ID",
      "reference": "Role",
      "inputMode": "selector",
      "url": "/sws/neo/user/userRoles/selectors/role"
    }
  ],
  "actions": [
    {
      "entity": "user",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/user/user/{id}/action/processNow"
    },
    {
      "entity": "user",
      "field": "grantPortalAccess",
      "column": "Grant_Portal_Access",
      "url": "/sws/neo/user/user/{id}/action/grantPortalAccess",
      "processId": "97FFD59B991D49BFB5153C309B009272",
      "processType": "obuiapp"
    },
    {
      "entity": "emailConfiguration",
      "field": "smtpconnectiontest",
      "column": "Smtpconnectiontest",
      "url": "/sws/neo/user/emailConfiguration/{id}/action/smtpconnectiontest",
      "processId": "9AB8A39485BD4FB1B6BB38B27E707668",
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
      "example": "_sortBy=userDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <UserPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
