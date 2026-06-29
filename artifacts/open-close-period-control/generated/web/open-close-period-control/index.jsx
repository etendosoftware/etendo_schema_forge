import PeriodControlPage, { api } from './PeriodControlPage';

const windowMeta = { category: 'finance', name: 'Open/Close Period Control' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <PeriodControlPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
