import BusinessPartnerCategoryPage, { api } from './BusinessPartnerCategoryPage';

const windowMeta = { category: 'contact', name: 'Business Partner Category', id: '192' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <BusinessPartnerCategoryPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
