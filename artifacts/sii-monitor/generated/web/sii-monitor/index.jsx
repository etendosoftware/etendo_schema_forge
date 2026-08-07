import OrganizationsPage, { api } from './OrganizationsPage';

const windowMeta = { category: 'monitor', name: 'SII Monitor', readOnly: true, id: 'FEF76C3E0F104F06A89AAD15A4A4A35C' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <OrganizationsPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
