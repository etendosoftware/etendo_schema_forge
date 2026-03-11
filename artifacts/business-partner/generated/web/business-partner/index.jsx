import BusinessPartnerPage from './BusinessPartnerPage';

const windowMeta = { category: 'reference', name: 'Business Partner' };

export default function App({ token, apiBaseUrl, window, windowName, recordId }) {
  return <BusinessPartnerPage token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} windowName={windowName} recordId={recordId} />;
}
