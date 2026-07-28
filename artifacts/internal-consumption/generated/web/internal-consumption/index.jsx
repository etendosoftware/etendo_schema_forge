import InternalConsumptionPage, { api } from './InternalConsumptionPage';

const windowMeta = { category: 'inventory', name: 'Internal Consumption', id: '800076' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <InternalConsumptionPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
