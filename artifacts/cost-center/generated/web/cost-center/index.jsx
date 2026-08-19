import CostCenterPage, { api } from './CostCenterPage';

const windowMeta = { category: 'finance', name: 'Cost Center', id: '79FC23AB84F04384B4B7CCCADCDD2942' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <CostCenterPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
