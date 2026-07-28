import CabeceraDeConfiguracionVerifactuPage, { api } from './CabeceraDeConfiguracionVerifactuPage';

const windowMeta = { category: 'configuration', name: 'Verifactu Config', id: '27A453FA86974745977672F1A8DCCEFF' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <CabeceraDeConfiguracionVerifactuPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
