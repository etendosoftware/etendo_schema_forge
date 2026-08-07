import CabeceraDeEmisorPage, { api } from './CabeceraDeEmisorPage';

const windowMeta = { category: 'monitor', name: 'Monitor Verifactu', readOnly: true, id: 'F4675DAB02134762B66881DAE4672AD0' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <CabeceraDeEmisorPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
