import SiiConfigurationPage, { api } from './SiiConfigurationPage';

const windowMeta = { category: 'configuration', name: 'SII Config', id: 'C1D3A2A017AC4B82B9FEE6F4D2A0C55A' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <SiiConfigurationPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
