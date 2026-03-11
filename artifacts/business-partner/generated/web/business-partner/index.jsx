import BusinessPartnerPage from './BusinessPartnerPage';

const windowMeta = { category: 'reference', name: 'Business Partner' };

export default function App({ token, apiBaseUrl, window }) {
  return <BusinessPartnerPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} />;
}
