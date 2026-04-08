import BusinessPartnerPage from './BusinessPartnerPage';

const windowMeta = { category: 'reference', name: 'Business Partner' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  // @sf-custom-slot hooks:App
  return <BusinessPartnerPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} {...rest} />;
}
// @sf-generated-end component:App

// @sf-custom-slot section:App-custom
