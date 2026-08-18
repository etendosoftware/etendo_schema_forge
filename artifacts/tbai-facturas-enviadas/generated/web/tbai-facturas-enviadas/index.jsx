import SincronizacionPage, { api } from './SincronizacionPage';

const windowMeta = { category: 'monitor', name: 'TBAI Facturas Enviadas', readOnly: true, id: '71F24BF89DE748B483BE87594747D6FB' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <SincronizacionPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
