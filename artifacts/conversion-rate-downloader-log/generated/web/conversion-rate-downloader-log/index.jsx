import ConversionRateDownloaderLogPage, { api } from './ConversionRateDownloaderLogPage';

const windowMeta = { category: 'settings', name: 'Conversion Rate Downloader Log', readOnly: true };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ConversionRateDownloaderLogPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
