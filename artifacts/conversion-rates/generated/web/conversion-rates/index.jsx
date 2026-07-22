import ConversionRatePage, { api } from './ConversionRatePage';

const windowMeta = { category: 'finance', name: 'Conversion Rates', readOnly: true };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ConversionRatePage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
